import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { requestConfirmation, recordDecision, checkGate, inspectDeliveryAcceptance, parseDeliveryBinding, inspectBoundDelivery } from '../dist/confirmations.js';
import { planWorkDeliveryReady, applyWorkDeliveryReady, inspectWorkDelivery } from '../dist/overall-delivery.js';
import { setupTasks, activateTaskPlan } from './task-helpers.mjs';
import { fixtureDecision } from './planning-helpers.mjs';
import { completeDeliveryTask, observeDelivery, addDeliveryCheckpoint, approveDeliveryCheckpoint, approveDeliveryException } from './overall-delivery-helpers.mjs';
import { fixture, put } from './helpers.mjs';

test('delivery bindings reject unknown fields and incomplete object identities', () => {
  const good = { deliveryCheckId: 'ready-one', deliveryBasisDigest: 'a'.repeat(64) };
  assert.deepEqual(parseDeliveryBinding(good), good);
  for (const bad of [null, {}, { ...good, deliveryCheckId: '../other' }, { ...good, deliveryBasisDigest: 'old-report' }, { ...good, technicalReady: true }]) {
    assert.throws(() => parseDeliveryBinding(bad));
  }
});

test('unready delivery may be presented or rejected without granting approval; document acceptance remains independent', async t => {
  const root = fixture(t); const workId = 'unready-bindings';
  await initialize({ root });
  const subject = { repository: '.', path: `.tiller/work/${workId}/document.md` };
  put(root, `.tiller/work/${workId}/work.md`, '# Isolated confirmation fixture\n');
  put(root, subject.path, '# Concrete document\n\nReviewed instructions for a bounded document.\n');
  const common = { gate: 'acceptance', scope: { repositories: ['.'], targets: [workId] }, subjects: [subject], upstream: [],
    reviewSummary: 'Synthetic object presentation.', openIssues: [], nextAction: 'Inspect this specific object.' };
  const deliveryBinding = { deliveryCheckId: 'missing-receipt', deliveryBasisDigest: 'a'.repeat(64) };
  const presented = await requestConfirmation(root, workId, { ...common, requestId: 'overall', deliveryBinding });
  assert.equal(presented.status, 'pending');
  await assert.rejects(fixtureDecision(root, workId, 'overall', 'invalid-approval'));
  assert.equal((await fixtureDecision(root, workId, 'overall', 'explicit-rejection', 'rejected')).status, 'rejected');
  assert.equal((await checkGate(root, workId, 'overall')).confirmed, false);
  await requestConfirmation(root, workId, { ...common, requestId: 'document-only' });
  assert.equal((await fixtureDecision(root, workId, 'document-only', 'approve-document')).confirmed, true);
  await assert.rejects(requestConfirmation(root, workId, { ...common, gate: 'release', requestId: 'unbound-release', upstream: ['document-only'] }), /整体交付对象/u);
  await assert.rejects(requestConfirmation(root, workId, { ...common, gate: 'requirements', requestId: 'wrong-gate', deliveryBinding }), /整体验收或发布/u);
  await assert.rejects(requestConfirmation(root, workId, { ...common, requestId: 'wrong-exception-gate', deliveryBinding, deliveryExceptionRefs: [] }), /release/u);
});

let baseline;
const baselineCleanups = [];
after(async () => { for (const cleanup of baselineCleanups) await cleanup(); });
async function deliveryFixture(t) {
  baseline ??= (async () => {
    const context = await setupTasks({ after: cleanup => baselineCleanups.push(cleanup) }, { taskIds: ['foundation'] });
    addDeliveryCheckpoint(context);
    await activateTaskPlan(context);
    await completeDeliveryTask(context);
    return context;
  })();
  const original = await baseline;
  const root = fixture(t); cpSync(original.root, root, { recursive: true });
  return { ...original, root };
}
function request(context, requestId, gate, deliveryBinding, upstream = []) {
  return { requestId, gate, scope: context.plan.scope, subjects: [context.plan.tasks[0].artifacts[0].source], upstream,
    reviewSummary: 'Synthetic review of the explicitly bound complete delivery.', openIssues: [], nextAction: gate,
    ...(deliveryBinding ? { deliveryBinding } : {}) };
}
async function ready(context, refs = {}) {
  const evidenceRefs = await observeDelivery(context);
  const input = { operationId: 'ready-one', expectedRevision: context.revision, evidenceRefs, ...refs };
  const plan = await planWorkDeliveryReady(context.root, context.workId, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  const receipt = await applyWorkDeliveryReady(context.root, context.workId, input, plan.planId);
  return { deliveryCheckId: receipt.id, deliveryBasisDigest: receipt.basisDigest };
}

test('whole-delivery acceptance and release bind the current object, preserve document scope and invalidate on evidence drift', async t => {
  const context = await deliveryFixture(t); const { root, workId } = context;
  const checkpoint = await approveDeliveryCheckpoint(context);
  const binding = await ready(context, { checkpointRefs: [checkpoint] });
  assert.equal((await inspectDeliveryAcceptance(root, workId, binding.deliveryBasisDigest)).status, 'not-requested');
  await requestConfirmation(root, workId, request(context, 'document-only', 'acceptance'));
  await fixtureDecision(root, workId, 'document-only', 'accept-document');
  await requestConfirmation(root, workId, request(context, 'wrong-release', 'release', binding, ['document-only']));
  await assert.rejects(fixtureDecision(root, workId, 'wrong-release', 'reject-document-release'), /同一交付对象/u);
  const wrongScope = { ...request(context, 'narrow-acceptance', 'acceptance', binding), scope: { repositories: ['.'], targets: ['other-target'] } };
  await requestConfirmation(root, workId, wrongScope);
  await assert.rejects(fixtureDecision(root, workId, 'narrow-acceptance', 'reject-narrow-scope'), /完整交付对象/u);
  await requestConfirmation(root, workId, request(context, 'overall-acceptance', 'acceptance', binding));
  assert.equal((await fixtureDecision(root, workId, 'overall-acceptance', 'accept-overall')).deliveryStatus, 'accepted');
  assert.equal((await inspectDeliveryAcceptance(root, workId, binding.deliveryBasisDigest)).status, 'accepted');
  await requestConfirmation(root, workId, request(context, 'release', 'release', binding, ['overall-acceptance']));
  assert.equal((await fixtureDecision(root, workId, 'release', 'approve-release')).confirmed, true);
  assert.equal((await checkGate(root, workId, 'release')).confirmed, true);
  await assert.rejects(inspectBoundDelivery(root, workId, { ...binding, deliveryBasisDigest: 'b'.repeat(64) }), /当前对象不一致/u);
  const runFiles = (await import('../dist/verification-runs.js')).readVerificationRecords;
  const records = await runFiles(root, workId);
  const report = records.find(record => record.results.some(result => result.checkId === 'foundation-review'));
  const evidence = report.results[0].evidence;
  put(root, evidence.path, readFileSync(join(root, evidence.path), 'utf8') + '\nChanged observation after approval.\n');
  assert.equal((await checkGate(root, workId, 'overall-acceptance')).confirmed, false);
  assert.equal((await inspectDeliveryAcceptance(root, workId, binding.deliveryBasisDigest)).status, 'stale');
  assert.equal((await checkGate(root, workId, 'release')).confirmed, false);
  assert.equal((await checkGate(root, workId, 'document-only')).confirmed, true);
});

test('acceptance reports explicit exceptions while release requires its own bounded exception', async t => {
  const context = await deliveryFixture(t); const { root, workId } = context;
  const evidenceRefs = await observeDelivery(context);
  const report = await inspectWorkDelivery(root, workId, { evidenceRefs });
  const readyException = await approveDeliveryException(context, report);
  const input = { operationId: 'ready-exception', expectedRevision: context.revision, evidenceRefs, exceptionRefs: [readyException] };
  const plan = await planWorkDeliveryReady(root, workId, input);
  const receipt = await applyWorkDeliveryReady(root, workId, input, plan.planId);
  const binding = { deliveryCheckId: receipt.id, deliveryBasisDigest: receipt.basisDigest };
  assert.equal(receipt.technicalReady, false);
  await requestConfirmation(root, workId, request(context, 'accepted-exception', 'acceptance', binding));
  assert.equal((await fixtureDecision(root, workId, 'accepted-exception', 'accept-known-gap')).deliveryStatus, 'accepted-with-exceptions');
  await requestConfirmation(root, workId, request(context, 'release-without-exception', 'release', binding, ['accepted-exception']));
  await assert.rejects(fixtureDecision(root, workId, 'release-without-exception', 'release-must-fail'), /发布专属例外/u);
  const exceptionRequest = { requestId: 'release-exception', gate: 'exception', scope: context.plan.scope,
    subjects: [context.plan.requirements[0].source], upstream: ['design'], reviewSummary: 'Synthetic release-only exception for this exact gap.',
    openIssues: report.issues.map(issue => issue.message), nextAction: 'release',
    exceptionBinding: { ownerWorkId: workId, operation: 'release', conditionIds: report.issues.map(issue => issue.conditionId),
      basisDigest: report.basisDigest, reason: 'The exact release condition is separately reviewed.', allowedAction: 'release', endCondition: 'basis-change-or-revocation' } };
  await requestConfirmation(root, workId, exceptionRequest);
  await fixtureDecision(root, workId, 'release-exception', 'approve-release-exception');
  const releaseRef = { workId, requestId: 'release-exception', decisionId: 'approve-release-exception' };
  await requestConfirmation(root, workId, { ...request(context, 'release-approved-exception', 'release', binding, ['accepted-exception']), deliveryExceptionRefs: [releaseRef] });
  assert.equal((await fixtureDecision(root, workId, 'release-approved-exception', 'release-with-scoped-permission')).confirmed, true);
  await fixtureDecision(root, workId, 'release-exception', 'revoke-release-exception', 'revoked');
  assert.equal((await checkGate(root, workId, 'release-approved-exception')).confirmed, false);
  assert.equal((await inspectDeliveryAcceptance(root, workId, binding.deliveryBasisDigest)).status, 'accepted-with-exceptions');
});
