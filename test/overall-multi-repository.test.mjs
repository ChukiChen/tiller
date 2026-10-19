import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWork, addWork } from '../dist/work.js';
import { requestConfirmation } from '../dist/confirmations.js';
import { readRegisteredPlanning, planningConfirmationSubjects } from '../dist/planning.js';
import { resolveRepositoryRoot } from '../dist/delivery-location.js';
import { inspectTaskStatus } from '../dist/tasks.js';
import { inspectWorkDelivery, planWorkDeliveryReady, applyWorkDeliveryReady, inspectDeliveryReceipt } from '../dist/overall-delivery.js';
import { fixture, put, gitRepository } from './helpers.mjs';
import { fixtureDecision, documentSelection } from './planning-helpers.mjs';
import { activateTaskPlan } from './task-helpers.mjs';
import { completeDeliveryTask, observeDelivery } from './overall-delivery-helpers.mjs';

// All decisions here are synthetic fixtures, never actual user approvals.
async function setupTwoRepositories(t) {
  const root = fixture(t);
  const workId = 'two-repository-delivery';
  const repositories = ['service-a', 'service-b'];
  for (const repository of repositories) gitRepository(root, `repositories/${repository}`);
  await initialize({ root, mode: 'workspace', repositories: repositories.map(id => `repositories/${id}`) });
  const scope = { repositories: ['.', ...repositories], targets: [workId] };
  await createWork(root, workId, 'Two required repository outputs', { type: 'change-requirements', scope });
  const directory = `.tiller/work/${workId}`;
  const requirements = { repository: '.', path: `${directory}/requirements.md` };
  const design = { repository: '.', path: `${directory}/design.md` };
  const standard = { repository: '.', path: `${directory}/standard.md` };
  put(root, requirements.path, '# 共同交付需求\n\nREQ-1：两个业务仓库各有必要操作说明，任一个缺失都不能整体交付。\n');
  put(root, standard.path, '# 开发规范\n\n逐仓库核对实际文件及证据，共同说明保持单一来源。\n');
  const request = { scope, subjects: [requirements], upstream: [], reviewSummary: 'Synthetic review explicitly covers both required repositories.', openIssues: [], nextAction: 'Continue this isolated fixture.' };
  await requestConfirmation(root, workId, { ...request, requestId: 'requirements', gate: 'requirements' });
  await fixtureDecision(root, workId, 'requirements', 'approve-requirements');
  await addWork(root, workId, { type: 'change-design', requirementsBasis: { workId, requestId: 'requirements' } });
  put(root, design.path, '# 共同交付设计\n\n两个独立任务分别绑定业务仓库正文，整体检查同时读取两个必要产物。\n');
  await requestConfirmation(root, workId, { ...request, requestId: 'design', gate: 'design', subjects: [design, standard], upstream: ['requirements'] });
  await fixtureDecision(root, workId, 'design', 'approve-design');
  const basis = { requirements: { workId, requestId: 'requirements', decisionId: 'approve-requirements' }, design: { workId, requestId: 'design', decisionId: 'approve-design' } };
  const tasks = repositories.map(repository => {
    const source = { repository, path: 'docs/result.md' };
    const checkId = `${repository}-review`;
    return { id: repository, title: `${repository} required output`, outcome: '交付经过实际检查的业务仓库操作说明。', scope, modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis,
      specifications: { requirements: [requirements], design: [design], standards: [standard] }, pendingDetails: [], dependencies: [],
      artifacts: [{ id: 'document', type: 'document', purpose: '必要业务仓库产物', required: true, checks: [checkId], source }],
      verification: documentSelection(source, 'document', checkId), humanCheckpoints: [] };
  });
  const artifacts = tasks.map(task => ({ id: `delivered-${task.id}`, type: 'reference', purpose: '分别交付两个必要仓库的当前有效产物', required: true, checks: ['combined-review'], taskId: task.id, artifactId: 'document' }));
  const verification = documentSelection(tasks[0].artifacts[0].source, artifacts[0].id, 'combined-review');
  verification.checks[0].artifactIds = artifacts.map(artifact => artifact.id);
  verification.checks[0].inputs = tasks.map(task => task.artifacts[0].source);
  const plan = { schemaVersion: 1, ownerWorkId: workId, revision: 'two-repositories', scope,
    requirements: [{ id: 'REQ-1', source: requirements }], basis, tasks,
    delivery: { requiredTasks: repositories, artifacts, verification, humanCheckpoints: [], openIssues: [] },
    changeReason: 'Explicitly require both business repositories and their combined current evidence.' };
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [], requirements: plan.requirements, categories: verification.categories, suites: [] }));
  return { root, workId, plan, observationSequence: 0,
    task: id => plan.tasks.find(task => task.id === id),
    write: async (ref, text) => put(await resolveRepositoryRoot(root, ref.repository, workId), ref.path, text),
    approvePlanning: async (revision, requestId) => {
      const registered = await readRegisteredPlanning(root, workId, revision);
      await requestConfirmation(root, workId, { ...request, requestId, gate: 'planning', subjects: planningConfirmationSubjects(workId, registered.record), upstream: ['design'] });
      const decisionId = `approve-${requestId}`;
      await fixtureDecision(root, workId, requestId, decisionId);
      return { workId, requestId, decisionId };
    },
  };
}

test('one required business repository cannot mask another missing or stale output in overall delivery', async t => {
  const context = await setupTwoRepositories(t);
  const { root, workId } = context;
  await activateTaskPlan(context);
  await completeDeliveryTask(context, 'service-a');
  const partial = await inspectWorkDelivery(root, workId);
  assert.equal(partial.technicalReady, false);
  assert.equal(partial.operationAllowed, false);
  assert.ok(partial.issues.some(issue => issue.code === 'TASK_NOT_VERIFIED' && issue.taskId === 'service-b'));
  assert.ok(!partial.issues.some(issue => issue.code === 'TASK_NOT_VERIFIED' && issue.taskId === 'service-a'));

  await completeDeliveryTask(context, 'service-b');
  const evidenceRefs = await observeDelivery(context);
  const readyInput = { operationId: 'both-ready', expectedRevision: context.revision, evidenceRefs };
  const preview = await planWorkDeliveryReady(root, workId, readyInput);
  assert.equal(preview.technicalReady, true, JSON.stringify(preview.issues));
  assert.equal(preview.operationAllowed, true);
  assert.deepEqual(preview.requiredTasks, ['service-a', 'service-b']);
  const receipt = await applyWorkDeliveryReady(root, workId, readyInput, preview.planId);
  const receiptPath = join(root, `.tiller/work/${workId}/delivery-checks/${receipt.id}.json`);
  const originalReceipt = readFileSync(receiptPath, 'utf8');
  const tasksPath = join(root, `.tiller/work/${workId}/tasks.json`);
  const originalTasks = readFileSync(tasksPath, 'utf8');
  const secondRef = context.task('service-b').artifacts[0].source;
  const secondRoot = await resolveRepositoryRoot(root, secondRef.repository, workId);
  const secondPath = join(secondRoot, secondRef.path);

  await context.write(secondRef, '# Changed business output\n\nThe second repository now documents different behavior and requires new evidence.\n');
  const drifted = await inspectDeliveryReceipt(root, workId, receipt.id);
  assert.equal(drifted.matches, false);
  assert.equal(drifted.current.technicalReady, false);
  assert.ok(drifted.current.issues.some(issue => issue.code === 'TASK_NOT_VERIFIED' && issue.taskId === 'service-b'));
  const status = await inspectTaskStatus(root, workId);
  assert.equal(status.tasks.find(task => task.taskId === 'service-a').effectiveStatus, 'verified');
  assert.equal(status.tasks.find(task => task.taskId === 'service-b').effectiveStatus, 'stale');

  unlinkSync(secondPath);
  const missingInput = { ...readyInput, operationId: 'missing-second-output' };
  const missing = await planWorkDeliveryReady(root, workId, missingInput);
  assert.equal(missing.technicalReady, false);
  assert.equal(missing.operationAllowed, false);
  assert.ok(missing.issues.some(issue => issue.code === 'TASK_NOT_VERIFIED' && issue.taskId === 'service-b'));
  await assert.rejects(applyWorkDeliveryReady(root, workId, missingInput, missing.planId));
  assert.equal(existsSync(join(root, `.tiller/work/${workId}/delivery-checks/${missingInput.operationId}.json`)), false);
  assert.equal(readFileSync(receiptPath, 'utf8'), originalReceipt);
  assert.equal(readFileSync(tasksPath, 'utf8'), originalTasks);
});
