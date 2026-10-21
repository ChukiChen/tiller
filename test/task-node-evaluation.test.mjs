import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { loadActivePlanning } from '../dist/planning.js';
import { loadTaskEvaluationInput, loadTaskSpecifications, loadTaskNodeMaterial, evaluateTaskNode, assertTaskEvaluationInputCurrent, planTaskOperation, applyTaskOperation } from '../dist/tasks.js';
import { setupTasks, activateTaskPlan, writeTaskDocument, observeTask, approveTaskCheckpoint } from './task-helpers.mjs';
import { fixture, put } from './helpers.mjs';

async function setup(t) {
  const root = fixture(t);
  await initialize({ root });
  // Already-loaded synthetic definitions exercise only evaluation, not real authorization.
  const tasks = ['foundation', 'downstream', 'independent'].map(id => {
    const reference = { repository: '.', path: `${id}.md` };
    put(root, reference.path, '# Specification\nAn explicit current task contract.\n');
    return { id, scope: { repositories: ['.'], targets: ['synthetic'] },
      basis: { requirements: {}, design: {} },
      specifications: { requirements: [reference], design: [reference], standards: [reference] },
      pendingDetails: [], dependencies: id === 'downstream' ? [{ taskId: 'foundation', artifacts: [] }] : [],
      humanCheckpoints: [] };
  });
  return { root, issues: [], state: { revision: 0, events: [] }, registration: {
    plan: { ownerWorkId: 'synthetic', revision: 'one', tasks },
    taskDigests: Object.fromEntries(tasks.map(task => [task.id, 'a'.repeat(64)])) } };
}

test('task specification declaration loads only the selected dependency closure', async t => {
  const context = await setup(t);
  const input = await loadTaskEvaluationInput(context, undefined, {deferNodes: true, deferSpecifications: true});
  assert.equal(input.specifications.size, 0);
  await loadTaskSpecifications(context, input, ['downstream']);
  assert.deepEqual([...input.specifications.keys()].sort(), ['foundation', 'downstream'].map(id => JSON.stringify(['.', `${id}.md`])).sort());
  await loadTaskSpecifications(context, input, ['foundation']);
  assert.equal(input.specifications.size, 2);
  await loadTaskNodeMaterial(context, input, 'foundation', new Map());
  assert.equal((await evaluateTaskNode(context, input, 'foundation', new Map())).effectiveStatus, 'pending');
  put(context.root, 'independent.md', '');
  await assertTaskEvaluationInputCurrent(input);
  await loadTaskSpecifications(context, input, ['independent']);
  assert.ok(input.specifications.get(JSON.stringify(['.', 'independent.md'])).issues.length);
});

test('task node evaluation requires matching declared input and completed direct dependencies', async t => {
  const context = await setup(t);
  const input = await loadTaskEvaluationInput(context, 'downstream');
  const completed = new Map();
  await assert.rejects(evaluateTaskNode({ ...context, state: { ...context.state, revision: 1 } }, input, 'foundation', completed),
    { code: 'TASK_INPUT_CHANGED' });
  await assert.rejects(evaluateTaskNode(context, input, 'independent', completed), { code: 'TASK_INPUT_INCOMPLETE' });
  await assert.rejects(evaluateTaskNode(context, input, 'downstream', completed), { code: 'TASK_INPUT_INCOMPLETE' });
  const foundation = await evaluateTaskNode(context, input, 'foundation', completed);
  assert.equal(foundation.effectiveStatus, 'pending');
  assert.equal(completed.size, 0, 'The caller owns progression; evaluation must not populate a hidden or supplied result map');
  completed.set('foundation', { ...foundation, taskId: 'independent' });
  await assert.rejects(evaluateTaskNode(context, input, 'downstream', completed), { code: 'TASK_INPUT_INCOMPLETE' });
  completed.set('foundation', foundation);
  const downstream = await evaluateTaskNode(context, input, 'downstream', completed);
  assert.equal(downstream.effectiveStatus, 'blocked');
  assert.ok(downstream.blockingReasons.some(issue => issue.code === 'DEPENDENCY_NOT_VERIFIED'),
    'A computed pending predecessor is not a verified predecessor');
  assert.deepEqual([...completed.keys()], ['foundation']);
});

test('task node evaluation does not inspect later nodes or silently reload observed specifications', async t => {
  const context = await setup(t);
  const input = await loadTaskEvaluationInput(context);
  const reads = [];
  const observed = { ...input, specifications: { get(key) { reads.push(key); return input.specifications.get(key); } } };
  put(context.root, 'foundation.md', '');
  const result = await evaluateTaskNode(context, observed, 'foundation', new Map());
  assert.equal(result.effectiveStatus, 'pending', 'This node uses the explicitly loaded specification observation');
  assert.ok(reads.length > 0);
  assert.ok(reads.every(key => key === JSON.stringify(['.', 'foundation.md'])), 'Later and independent task nodes are not evaluated early');
  await assert.rejects(assertTaskEvaluationInputCurrent(input), { code: 'TASK_SPECIFICATIONS_CHANGED' });
  const fresh = await loadTaskEvaluationInput(context, 'foundation');
  const changed = await evaluateTaskNode(context, fresh, 'foundation', new Map());
  assert.equal(changed.effectiveStatus, 'blocked');
  assert.ok(changed.blockingReasons.some(issue => issue.code === 'TASK_SPECIFICATIONS_INVALID'));
});

test('task input final proof rejects late artifacts, evidence and checkpoint changes without replaying owner authorization', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation', 'independent'] });
  const checkpointSubject = { repository: '.', path: 'checkpoint-review.md' };
  put(context.root, checkpointSubject.path, '# Checkpoint subject\nReview this task-specific delivery condition.\n');
  context.task('foundation').humanCheckpoints.push({ id: 'finish-review', operation: 'verify',
    purpose: 'Review the task-specific delivery condition.', subjects: [checkpointSubject] });
  await activateTaskPlan(context);
  async function operate(operation, extra = {}) {
    const input = { operationId: `${operation}-foundation`, expectedRevision: context.revision, ...extra };
    const plan = await planTaskOperation(context.root, context.workId, 'foundation', operation, input);
    assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
    const result = await applyTaskOperation(context.root, context.workId, 'foundation', operation, input, plan.planId);
    context.revision = result.revision;
    return result;
  }
  const started = await operate('start');
  await writeTaskDocument(context, 'foundation');
  const checkpoint = await approveTaskCheckpoint(context, 'foundation', 'finish-review', 'verify');
  const evidenceRefs = await observeTask(context, 'foundation');
  await operate('verify', { attemptId: started.attemptId, checkpointRefs: [checkpoint], evidenceRefs });
  const planning = await loadActivePlanning(context.root, context.workId);
  let authorizations = 0;
  const input = await loadTaskEvaluationInput(planning, undefined, {
    authorization: async () => { authorizations++; return true; },
  });
  const completed = new Map();
  const foundation = await evaluateTaskNode(planning, input, 'foundation', completed);
  assert.equal(foundation.technicalReady, true, JSON.stringify(foundation.blockingReasons));
  completed.set('foundation', foundation);
  await evaluateTaskNode(planning, input, 'independent', completed);
  const initialAuthorizations = authorizations;
  assert.ok(initialAuthorizations > 0);
  await assertTaskEvaluationInputCurrent(input);
  assert.equal(authorizations, initialAuthorizations, 'The owner proves its authorization graph; a task material proof must not invoke it again');

  const artifactPath = context.task('foundation').artifacts[0].source.path;
  const evidencePath = `.tiller/work/${context.workId}/evidence/foundation-${context.observationSequence}.md`;
  const checkpointSource = `.tiller/work/${context.workId}/source-${checkpoint.decisionId}.md`;
  for (const [path, expected] of [
    [artifactPath, { code: 'TASK_ARTIFACTS_CHANGED' }],
    [evidencePath, /验证求值依据在读取期间变化/u],
    [checkpointSource, { code: 'TASK_CHECKPOINTS_CHANGED' }],
  ]) {
    const original = readFileSync(join(context.root, path), 'utf8');
    put(context.root, path, `${original}\nChanged after a later task node was evaluated.\n`);
    try {
      await assert.rejects(assertTaskEvaluationInputCurrent(input), expected);
      assert.equal(authorizations, initialAuthorizations);
      if (path === artifactPath) await assertTaskEvaluationInputCurrent({ ...input,
        order: input.order.filter(task => task.id === 'independent'), selectedIds: ['independent'] });
    } finally { put(context.root, path, original); }
  }
  await assertTaskEvaluationInputCurrent(input);
  assert.equal(authorizations, initialAuthorizations);
});
