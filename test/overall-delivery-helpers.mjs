import assert from 'node:assert/strict';
import { planTaskOperation, applyTaskOperation } from '../dist/tasks.js';
import { captureVerificationObservation, recordVerificationEvidence } from '../dist/verification-runs.js';
import { requestConfirmation } from '../dist/confirmations.js';
import { checkpointDefinitionDigest } from '../dist/gate-conditions.js';
import { fixtureDecision } from './planning-helpers.mjs';
import { writeTaskDocument, observeTask } from './task-helpers.mjs';
import { put } from './helpers.mjs';

export async function completeDeliveryTask(context, taskId = 'foundation') {
  const startInput = { operationId: `start-${taskId}`, expectedRevision: context.revision };
  const start = await planTaskOperation(context.root, context.workId, taskId, 'start', startInput);
  assert.equal(start.operationAllowed, true, JSON.stringify(start.blockingReasons));
  const started = await applyTaskOperation(context.root, context.workId, taskId, 'start', startInput, start.planId);
  await writeTaskDocument(context, taskId);
  const evidenceRefs = await observeTask(context, taskId);
  const verifyInput = { operationId: `verify-${taskId}`, expectedRevision: started.revision, attemptId: started.attemptId, evidenceRefs };
  const verify = await planTaskOperation(context.root, context.workId, taskId, 'verify', verifyInput);
  assert.equal(verify.operationAllowed, true, JSON.stringify(verify.blockingReasons));
  const verified = await applyTaskOperation(context.root, context.workId, taskId, 'verify', verifyInput, verify.planId);
  context.revision = verified.revision;
  return verified;
}

export async function observeDelivery(context) {
  const { root, workId } = context;
  const captured = await captureVerificationObservation(root, workId, {
    selection: context.plan.delivery.verification, environment: 'synthetic overall delivery observer',
  });
  const evidence = { repository: '.', path: `.tiller/work/${workId}/evidence/overall-${++context.observationSequence}.md` };
  put(root, evidence.path, '# 整体交付观察\n\n逐项核对已完成产物与整体交付组合，保留当前对象绑定；本隔离夹具不代表真实用户验收。\n');
  const recorded = await recordVerificationEvidence(root, workId, { captureId: captured.record.id, environment: captured.record.environment,
    results: context.plan.delivery.verification.checks.map(check => ({ checkId: check.id, status: 'passed', evidence, note: '核对整个交付选择；任务检查通过不自动替代组合检查。' })) });
  return context.plan.delivery.verification.checks.map(check => ({ workId, runId: recorded.record.id, checkId: check.id, environment: recorded.record.environment }));
}

export function addDeliveryCheckpoint(context) {
  context.plan.delivery.humanCheckpoints = [{ id: 'delivery-review', operation: 'delivery-ready', purpose: '人工核对整体交付范围与组合结果。',
    subjects: [context.task('foundation').artifacts[0].source] }];
}

export async function approveDeliveryCheckpoint(context) {
  const checkpoint = context.plan.delivery.humanCheckpoints[0];
  const requestId = 'overall-checkpoint';
  await requestConfirmation(context.root, context.workId, { requestId, gate: 'checkpoint', scope: context.plan.scope,
    subjects: checkpoint.subjects, upstream: [context.planningRequestId],
    checkpointBinding: { ownerWorkId: context.workId, checkpointId: checkpoint.id, operation: 'delivery-ready', definitionDigest: checkpointDefinitionDigest(checkpoint) },
    reviewSummary: '隔离测试展示本次完整交付对象及检查点。', openIssues: [], nextAction: 'delivery-ready' });
  await fixtureDecision(context.root, context.workId, requestId, 'approve-overall-checkpoint');
  return { workId: context.workId, requestId, decisionId: 'approve-overall-checkpoint' };
}

export async function approveDeliveryException(context, report) {
  const requestId = 'overall-exception';
  assert.ok(report.issues.length > 0);
  assert.ok(report.issues.every(issue => issue.exceptionAllowed), JSON.stringify(report.issues));
  await requestConfirmation(context.root, context.workId, { requestId, gate: 'exception', scope: context.plan.scope,
    subjects: [context.plan.requirements[0].source], upstream: ['design'], reviewSummary: '隔离测试明确展示尚缺人工检查点及允许动作。',
    openIssues: report.issues.map(issue => issue.message), nextAction: 'delivery-ready',
    exceptionBinding: { ownerWorkId: context.workId, operation: 'delivery-ready', conditionIds: report.issues.map(issue => issue.conditionId),
      basisDigest: report.basisDigest, reason: '本隔离场景仅批准列明的整体人工检查点例外，不扩大至其他问题。', allowedAction: 'delivery-ready', endCondition: 'basis-change-or-revocation' } });
  await fixtureDecision(context.root, context.workId, requestId, 'approve-overall-exception');
  return { workId: context.workId, requestId, decisionId: 'approve-overall-exception' };
}
