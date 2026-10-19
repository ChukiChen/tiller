import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectTaskStatus, planTaskOperation, applyTaskOperation } from '../dist/tasks.js';
import { loadPlanningState } from '../dist/planning.js';
import { fixtureDecision } from './planning-helpers.mjs';
import { setupTasks, activateTaskPlan, writeTaskDocument, observeTask, approveTaskCheckpoint, copy } from './task-helpers.mjs';
import { put } from './helpers.mjs';

const statePath = context => join(context.root, '.tiller', 'work', context.workId, 'tasks.json');
const taskState = (status, id) => status.tasks.find(task => task.taskId === id);
function operationInput(context, operationId, extra = {}) {
  return { operationId, expectedRevision: context.revision, ...extra };
}
async function operate(context, taskId, operation, operationId, extra = {}) {
  const input = operationInput(context, operationId, extra);
  const plan = await planTaskOperation(context.root, context.workId, taskId, operation, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  const receipt = await applyTaskOperation(context.root, context.workId, taskId, operation, input, plan.planId);
  assert.equal(receipt.changed, true);
  context.revision = receipt.revision;
  return { input, plan, receipt };
}
async function blocked(context, taskId, operation, operationId, extra = {}, apply = false) {
  const before = readFileSync(statePath(context), 'utf8');
  const input = operationInput(context, operationId, extra);
  const plan = await planTaskOperation(context.root, context.workId, taskId, operation, input);
  assert.equal(plan.operationAllowed, false);
  assert.ok(plan.blockingReasons.length > 0);
  if (apply) await assert.rejects(applyTaskOperation(context.root, context.workId, taskId, operation, input, plan.planId), { code: 'TASK_BLOCKED' });
  assert.equal(readFileSync(statePath(context), 'utf8'), before, 'A blocked operation must not invent a successful event');
  return plan;
}

test('task operations preserve prerequisite order, runtime evidence, independent work and recovery across planning revisions', async t => {
  const context = await setupTasks(t, { runtime: true });
  const { root, workId } = context;
  const pending = await inspectTaskStatus(root, workId);
  assert.equal(pending.ready, false);
  assert.equal(existsSync(statePath(context)), false, 'Read-only status must not create task state');
  await activateTaskPlan(context);
  await blocked(context, 'downstream', 'start', 'blocked-before-foundation', {}, true);
  await blocked(context, 'independent', 'verify', 'verify-before-start', { attemptId: 'unrecorded-attempt' });

  const foundation = await operate(context, 'foundation', 'start', 'start-foundation');
  await blocked(context, 'foundation', 'verify', 'verify-missing-document', { attemptId: foundation.receipt.attemptId });
  await writeTaskDocument(context, 'foundation', '# 未完成\n\nTODO\n');
  await blocked(context, 'foundation', 'verify', 'verify-placeholder', { attemptId: foundation.receipt.attemptId });
  await writeTaskDocument(context, 'foundation');
  const manual = await observeTask(context, 'foundation', { runtime: false });
  await blocked(context, 'foundation', 'verify', 'verify-no-runtime', { attemptId: foundation.receipt.attemptId, evidenceRefs: manual });

  const independent = await operate(context, 'independent', 'start', 'start-independent');
  await writeTaskDocument(context, 'independent');
  const independentEvidence = await observeTask(context, 'independent');
  await operate(context, 'independent', 'verify', 'verify-independent', { attemptId: independent.receipt.attemptId, evidenceRefs: independentEvidence });
  await blocked(context, 'downstream', 'start', 'blocked-before-foundation-verified');

  const runtime = await observeTask(context, 'foundation', { manual: false });
  const verified = await operate(context, 'foundation', 'verify', 'verify-foundation', { attemptId: foundation.receipt.attemptId, evidenceRefs: [...manual, ...runtime] });
  const beforeReplay = readFileSync(statePath(context), 'utf8');
  const replay = await applyTaskOperation(root, workId, 'foundation', 'verify', verified.input, verified.plan.planId);
  assert.equal(replay.changed, false);
  assert.equal(replay.historical, true);
  assert.equal(readFileSync(statePath(context), 'utf8'), beforeReplay);
  await assert.rejects(planTaskOperation(root, workId, 'foundation', 'verify', { ...verified.input, attemptId: 'different-attempt' }), { code: 'OPERATION_CONFLICT' });
  const stableBefore = await inspectTaskStatus(root, workId, 'foundation');
  put(root, `.tiller/work/${workId}/work.md`, '# 进度\n\n当前前置任务已经完成实际验证。\n');
  const stableAfter = await inspectTaskStatus(root, workId, 'foundation');
  assert.equal(taskState(stableBefore, 'foundation').effectiveStatus, 'verified');
  assert.equal(taskState(stableAfter, 'foundation').effectiveStatus, 'verified');
  assert.equal(taskState(stableAfter, 'foundation').verificationBasisDigest, taskState(stableBefore, 'foundation').verificationBasisDigest);

  const downstream = await operate(context, 'downstream', 'start', 'start-downstream');
  await writeTaskDocument(context, 'downstream');
  const downstreamEvidence = await observeTask(context, 'downstream');
  await operate(context, 'downstream', 'verify', 'verify-downstream', { attemptId: downstream.receipt.attemptId, evidenceRefs: downstreamEvidence });
  const history = (await loadPlanningState(root, workId)).state;
  const predecessorEvent = history.events.find(event => event.operationId === 'verify-foundation');
  const dependentEvent = history.events.find(event => event.operationId === 'start-downstream');
  assert.ok(predecessorEvent.sequence < dependentEvent.sequence);
  assert.equal(dependentEvent.dependencies.find(dependency => dependency.taskId === 'foundation').eventSequence, predecessorEvent.sequence);
  assert.equal(predecessorEvent.startEventSequence, foundation.receipt.eventSequence);

  await writeTaskDocument(context, 'foundation', '# 更新后的说明\n\n可执行步骤：读取输入、执行操作、核对新输出并记录结果。\n');
  const stale = await inspectTaskStatus(root, workId);
  assert.equal(taskState(stale, 'foundation').effectiveStatus, 'stale');
  assert.equal(taskState(stale, 'downstream').effectiveStatus, 'stale');
  assert.equal(taskState(stale, 'independent').effectiveStatus, 'verified');
  const resumedFoundation = await operate(context, 'foundation', 'resume', 'resume-foundation');
  assert.notEqual(resumedFoundation.receipt.attemptId, foundation.receipt.attemptId);
  await blocked(context, 'foundation', 'verify', 'verify-stale-evidence', { attemptId: resumedFoundation.receipt.attemptId, evidenceRefs: [...manual, ...runtime] });
  const currentEvidence = await observeTask(context, 'foundation');
  await operate(context, 'foundation', 'verify', 'reverify-foundation', { attemptId: resumedFoundation.receipt.attemptId, evidenceRefs: currentEvidence });
  await blocked(context, 'downstream', 'verify', 'verify-before-resume', { attemptId: downstream.receipt.attemptId, evidenceRefs: downstreamEvidence });
  const resumedDownstream = await operate(context, 'downstream', 'resume', 'resume-downstream');
  assert.notEqual(resumedDownstream.receipt.attemptId, downstream.receipt.attemptId);
  await operate(context, 'downstream', 'verify', 'reverify-downstream', { attemptId: resumedDownstream.receipt.attemptId, evidenceRefs: downstreamEvidence });

  const revision = copy(context.plan);
  revision.revision = 'v-two';
  revision.changeReason = '只修改下游交付结果，保留基础与独立任务的现有有效事实。';
  revision.tasks.find(task => task.id === 'downstream').outcome = '交付包含额外例子的操作说明。';
  await activateTaskPlan(context, revision, 'two');
  const revised = await inspectTaskStatus(root, workId);
  assert.equal(taskState(revised, 'foundation').effectiveStatus, 'verified');
  assert.equal(taskState(revised, 'independent').effectiveStatus, 'verified');
  assert.notEqual(taskState(revised, 'downstream').effectiveStatus, 'verified');
  const finalHistory = (await loadPlanningState(root, workId)).state;
  assert.ok(finalHistory.events.some(event => event.operationId === 'start-foundation'));
  assert.ok(finalHistory.events.some(event => event.operationId === 'resume-foundation'));
});

test('workspace tasks enforce scoped human checkpoints and reject stale plans or concurrent revision writes', async t => {
  const context = await setupTasks(t, { mode: 'workspace', repository: 'business', taskIds: ['foundation', 'independent'] });
  const { root, workId } = context;
  const task = context.task('foundation');
  task.humanCheckpoints = [
    { id: 'begin-review', operation: 'start', purpose: '核对任务开始条件。', subjects: task.specifications.design },
    { id: 'finish-review', operation: 'verify', purpose: '核对当前交付产物。', subjects: [task.artifacts[0].source] },
  ];
  await activateTaskPlan(context);
  await blocked(context, task.id, 'start', 'start-without-checkpoint');
  const beginRef = await approveTaskCheckpoint(context, task.id, 'begin-review', 'start');
  const started = await operate(context, task.id, 'start', 'start-with-checkpoint', { checkpointRefs: [beginRef] });
  await writeTaskDocument(context, task.id);
  const evidenceRefs = await observeTask(context, task.id);
  await blocked(context, task.id, 'verify', 'verify-without-checkpoint', { attemptId: started.receipt.attemptId, evidenceRefs });
  await blocked(context, task.id, 'verify', 'verify-wrong-checkpoint', { attemptId: started.receipt.attemptId, evidenceRefs, checkpointRefs: [beginRef] });
  const finishRef = await approveTaskCheckpoint(context, task.id, 'finish-review', 'verify');
  const verifyInput = operationInput(context, 'verify-with-checkpoint', { attemptId: started.receipt.attemptId, evidenceRefs, checkpointRefs: [finishRef] });
  const preview = await planTaskOperation(root, workId, task.id, 'verify', verifyInput);
  assert.equal(preview.operationAllowed, true, JSON.stringify(preview.blockingReasons));
  const sentinel = readFileSync(statePath(context), 'utf8');
  await context.write(task.artifacts[0].source, '# 预览之后修改\n\n可执行步骤已经改变，需要重新核对。\n');
  await assert.rejects(applyTaskOperation(root, workId, task.id, 'verify', verifyInput, preview.planId));
  assert.equal(readFileSync(statePath(context), 'utf8'), sentinel);

  await writeTaskDocument(context, task.id);
  const valid = await operate(context, task.id, 'verify', 'verify-final-checkpoint', { attemptId: started.receipt.attemptId, evidenceRefs, checkpointRefs: [finishRef] });
  assert.equal(valid.receipt.technicalReady, true);
  const inspected = await inspectTaskStatus(root, workId, task.id);
  const actual = taskState(inspected, task.id);
  assert.equal(actual.effectiveStatus, 'verified');
  assert.ok(Object.keys(actual.artifactSnapshots.document).some(key => key.startsWith('business::')));

  const firstInput = operationInput(context, 'concurrent-one');
  const secondInput = operationInput(context, 'concurrent-two');
  const first = await planTaskOperation(root, workId, 'independent', 'start', firstInput);
  const second = await planTaskOperation(root, workId, 'independent', 'start', secondInput);
  assert.equal(first.operationAllowed, true);
  assert.equal(second.operationAllowed, true);
  await applyTaskOperation(root, workId, 'independent', 'start', firstInput, first.planId);
  const latest = readFileSync(statePath(context), 'utf8');
  await assert.rejects(applyTaskOperation(root, workId, 'independent', 'start', secondInput, second.planId), { code: 'REVISION_CONFLICT' });
  assert.equal(readFileSync(statePath(context), 'utf8'), latest);
  await fixtureDecision(root, workId, finishRef.requestId, 'revoke-finish', 'revoked');
  assert.equal(taskState(await inspectTaskStatus(root, workId, task.id), task.id).effectiveStatus, 'stale');

  const revision = copy(context.plan);
  revision.revision = 'v-two';
  revision.changeReason = '增加开始检查点的人工审阅责任，原有检查点身份及文件保持不变。';
  revision.tasks[0].humanCheckpoints[0].purpose = '除核对开始条件外，还须明确审阅新增的异常处置责任。';
  await activateTaskPlan(context, revision, 'two');
  const changedCheckpoint = await blocked(context, task.id, 'resume', 'resume-obsolete-checkpoint', { checkpointRefs: [beginRef] });
  assert.ok(changedCheckpoint.blockingReasons.some(issue => issue.code === 'INVALID_CHECKPOINT'), JSON.stringify(changedCheckpoint.blockingReasons));
  const currentBeginRef = await approveTaskCheckpoint(context, task.id, 'begin-review', 'start', 'begin-review-v2');
  await operate(context, task.id, 'resume', 'resume-current-checkpoint', { checkpointRefs: [currentBeginRef] });
});
