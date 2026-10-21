import test from 'node:test';
import assert from 'node:assert/strict';
import { requestConfirmation } from '../dist/confirmations.js';
import { inspectExceptions } from '../dist/gate-exceptions.js';
import { loadPlanningState, planPlanningRegistration, planPlanningActivation } from '../dist/planning.js';
import { planTaskOperation, applyTaskOperation, inspectTaskStatus } from '../dist/tasks.js';
import { fixtureDecision } from './planning-helpers.mjs';
import { setupTasks, activateTaskPlan, writeTaskDocument, observeTask, approveTaskCheckpoint } from './task-helpers.mjs';
import { put } from './helpers.mjs';

async function approveException(context, taskId, operation, preview, name, overrides = {}) {
  const task = context.task(taskId);
  const binding = { ownerWorkId: context.workId, taskId, operation,
    conditionIds: preview.technicalIssues.map(issue => issue.conditionId), basisDigest: preview.technicalBasisDigest,
    reason: '隔离测试明确允许当前有限操作，缺口仍须保留。', allowedAction: operation,
    endCondition: 'basis-change-or-revocation', ...overrides };
  await requestConfirmation(context.root, context.workId, { requestId: name, gate: 'exception', scope: task.scope,
    workflowBinding: await context.binding('implementation'),
    subjects: task.specifications.design, upstream: ['design', context.planningRequestId], exceptionBinding: binding,
    reviewSummary: '仅批准已列条件和对象摘要；不代表技术验证通过。', openIssues: preview.technicalIssues.map(issue => issue.message), nextAction: binding.allowedAction });
  await fixtureDecision(context.root, context.workId, name, `approve-${name}`);
  return { workId: context.workId, requestId: name, decisionId: `approve-${name}` };
}
async function input(context, operationId, extra = {}) {
  return { operationId, expectedRevision: (await loadPlanningState(context.root, context.workId)).state.revision, ...extra };
}
async function operate(context, taskId, operation, value) {
  const preview = await planTaskOperation(context.root, context.workId, taskId, operation, value);
  assert.equal(preview.operationAllowed, true, JSON.stringify(preview.blockingReasons));
  const receipt = await applyTaskOperation(context.root, context.workId, taskId, operation, value, preview.planId);
  return { preview, receipt };
}

test('bounded task exceptions retain technical failures, never pass dependencies, and expire without inventing history', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation', 'downstream'] });
  const { root, workId } = context;
  context.task('downstream').humanCheckpoints = [{ id: 'begin', operation: 'start', purpose: '核对下游开始条件。', subjects: context.task('downstream').specifications.design }];
  await activateTaskPlan(context);
  // Only a collision sentinel, deliberately not presented as a valid ready receipt.
  put(root, `.tiller/work/${workId}/delivery-checks/reserved-delivery.json`, '{}');
  const collision = await input(context, 'reserved-delivery');
  await assert.rejects(planTaskOperation(root, workId, 'foundation', 'start', collision), { code: 'OPERATION_CONFLICT' });
  await assert.rejects(planPlanningRegistration(root, workId, { ...collision, plan: context.plan }), { code: 'OPERATION_CONFLICT' });
  await assert.rejects(planPlanningActivation(root, workId, { ...collision, revision: context.plan.revision,
    confirmation: { workId, requestId: 'planning-one', decisionId: 'approve-planning-one' } }), { code: 'OPERATION_CONFLICT' });
  await writeTaskDocument(context, 'foundation');
  const started = await operate(context, 'foundation', 'start', await input(context, 'start-foundation'));
  const verifyInput = await input(context, 'verify-excepted', { attemptId: started.receipt.attemptId });
  const unmet = await planTaskOperation(root, workId, 'foundation', 'verify', verifyInput);
  assert.equal(unmet.operationAllowed, false);
  assert.ok(unmet.technicalIssues.length > 0 && unmet.technicalIssues.every(issue => issue.exceptionAllowed));
  const alternate = await planTaskOperation(root, workId, 'foundation', 'verify', { ...verifyInput, operationId: 'other-id' });
  assert.equal(alternate.technicalBasisDigest, unmet.technicalBasisDigest);
  const exception = await approveException(context, 'foundation', 'verify', unmet, 'allow-foundation');
  const inspect = (issues = unmet.technicalIssues, basis = unmet.technicalBasisDigest, refs = [exception], taskId = 'foundation', operation = 'verify') =>
    inspectExceptions(root, workId, context.task('foundation').scope, operation, taskId, issues, basis, refs);
  assert.equal((await inspect()).operationAllowed, true);
  for (const inspection of [
    await inspect([], unmet.technicalBasisDigest),
    await inspect(unmet.technicalIssues.map(issue => ({ ...issue, exceptionAllowed: false }))),
    await inspect(unmet.technicalIssues, 'b'.repeat(64)),
    await inspect(unmet.technicalIssues, unmet.technicalBasisDigest, [exception, exception]),
    await inspect(unmet.technicalIssues, unmet.technicalBasisDigest, [exception], 'downstream'),
    await inspect(unmet.technicalIssues, unmet.technicalBasisDigest, [exception], 'foundation', 'start'),
  ]) {
    assert.equal(inspection.operationAllowed, false);
    assert.ok(inspection.blockingReasons.some(issue => issue.code === 'INVALID_EXCEPTION'));
  }
  const unsupported = await approveException(context, 'foundation', 'verify', unmet, 'unsupported-end', { endCondition: '明天以前都可以' });
  assert.equal((await inspect(unmet.technicalIssues, unmet.technicalBasisDigest, [unsupported])).operationAllowed, false);
  const wrongAction = await approveException(context, 'foundation', 'verify', unmet, 'wrong-action', { allowedAction: 'start' });
  assert.equal((await inspect(unmet.technicalIssues, unmet.technicalBasisDigest, [wrongAction])).operationAllowed, false);

  const allowed = await operate(context, 'foundation', 'verify', { ...verifyInput, exceptionRefs: [exception] });
  assert.equal(allowed.preview.technicalBasisDigest, unmet.technicalBasisDigest);
  assert.equal(allowed.receipt.technicalReady, false);
  assert.equal(allowed.receipt.status, 'allowed-with-exceptions');
  let state = (await loadPlanningState(root, workId)).state;
  assert.equal(state.events.at(-1).kind, 'task-verification-excepted');
  assert.deepEqual(state.events.at(-1).failureReasons, unmet.technicalIssues);
  assert.equal((await inspectTaskStatus(root, workId, 'foundation')).technicalReady, false);

  const nextInput = await input(context, 'start-downstream');
  const downstream = await planTaskOperation(root, workId, 'downstream', 'start', nextInput);
  assert.equal(downstream.operationAllowed, false);
  assert.ok(downstream.technicalIssues.some(issue => issue.code === 'DEPENDENCY_NOT_VERIFIED'));
  assert.ok(downstream.technicalIssues.some(issue => issue.code === 'CHECKPOINT_REQUIRED'));
  const borrowed = await planTaskOperation(root, workId, 'downstream', 'start', { ...nextInput, exceptionRefs: [exception] });
  assert.equal(borrowed.operationAllowed, false);
  const ownException = await approveException(context, 'downstream', 'start', downstream, 'allow-downstream-start');
  const early = await operate(context, 'downstream', 'start', { ...nextInput, exceptionRefs: [ownException] });
  assert.equal(early.receipt.technicalReady, false);
  assert.equal(early.preview.technicalBasisDigest, downstream.technicalBasisDigest);

  const retryInput = await input(context, 'verify-after-exception', { attemptId: started.receipt.attemptId, exceptionRefs: [exception] });
  const retry = await planTaskOperation(root, workId, 'foundation', 'verify', retryInput);
  assert.equal(retry.operationAllowed, true);
  const beforeRevokedApply = (await loadPlanningState(root, workId)).original;
  await fixtureDecision(root, workId, exception.requestId, 'revoke-foundation-exception', 'revoked');
  assert.equal((await inspect()).operationAllowed, false);
  await assert.rejects(applyTaskOperation(root, workId, 'foundation', 'verify', retryInput, retry.planId), { code: 'TASK_BLOCKED' });
  assert.equal((await loadPlanningState(root, workId)).original, beforeRevokedApply);
  const historical = await applyTaskOperation(root, workId, 'foundation', 'verify', { ...verifyInput, exceptionRefs: [exception] }, allowed.preview.planId);
  assert.equal(historical.historical, true);
  assert.equal(historical.currentValidity, 'not-evaluated');
  assert.equal(historical.technicalReady, false);

  const evidenceRefs = await observeTask(context, 'foundation');
  const repaired = await operate(context, 'foundation', 'verify', await input(context, 'verify-repaired', { attemptId: started.receipt.attemptId, evidenceRefs }));
  assert.equal(repaired.receipt.technicalReady, true);
  state = (await loadPlanningState(root, workId)).state;
  assert.equal(state.events.at(-1).kind, 'task-verified');
  assert.equal(state.events.at(-1).startEventSequence, started.receipt.eventSequence);
  assert.equal(state.events.filter(event => event.kind === 'task-verification-excepted').length, 1);
  const downstreamStatus = await inspectTaskStatus(root, workId, 'downstream');
  assert.equal(downstreamStatus.technicalReady, false);
  assert.ok(downstreamStatus.tasks[0].blockingReasons.some(issue => issue.code === 'START_BASIS_CHANGED'));
  const begin = await approveTaskCheckpoint(context, 'downstream', 'begin', 'start');
  const resumed = await operate(context, 'downstream', 'resume', await input(context, 'resume-downstream', { checkpointRefs: [begin] }));
  assert.notEqual(resumed.receipt.attemptId, early.receipt.attemptId);
});
