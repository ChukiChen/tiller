import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  inspectWorkDelivery, planWorkDeliveryReady, applyWorkDeliveryReady, readDeliveryReceipt, inspectDeliveryReceipt,
} from '../dist/overall-delivery.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { put, snapshot } from './helpers.mjs';
import {
  createWorkflowFixture, completeWorkflow, observeStage, workflowRef,
} from './workflow-fixtures.mjs';

test('typed delivery: report completes without planning, binds acceptance and preserves current versus historical facts', async t => {
  const f = await createWorkflowFixture(t);
  const finished = await completeWorkflow(f);
  const input = { verification: finished.verification, checkMappings: finished.checkMappings, evidenceRefs: finished.evidenceRefs };
  let readyInput; let receipt; let deliveryPlan;
  await t.test('real stage evidence permits schema2 ready without a development plan', async () => {
    const checked = await inspectWorkDelivery(f.root, f.workId, input);
    assert.equal(checked.technicalReady, true, JSON.stringify(checked.issues));
    assert.equal(checked.operationAllowed, true);
    assert.equal(checked.planningRevision, null);
    assert.equal(checked.controlSnapshot.tasks, null);
    assert.equal(checked.processEvidence.status, 'complete');
    assert.equal(existsSync(join(f.root, `.tiller/work/${f.workId}/tasks.json`)), false);
    readyInput = { operationId: 'report-ready', expected: checked.controlSnapshot, ...input };
    deliveryPlan = await planWorkDeliveryReady(f.root, f.workId, readyInput);
    receipt = await applyWorkDeliveryReady(f.root, f.workId, readyInput, deliveryPlan.planId);
    assert.equal(receipt.schemaVersion, 2);
    assert.equal(receipt.operation, 'delivery-ready');
    assert.equal(receipt.changed, true);
    assert.equal(receipt.acceptance.status, 'not-evaluated');
    assert.equal((await inspectDeliveryReceipt(f.root, f.workId, receipt.id)).matches, true);
  });
  assert.ok(receipt, 'The positive delivery prerequisite must complete before its boundary checks.');
  await t.test('acceptance binds this exact report delivery without requiring an acceptance stage', async () => {
    const context = await loadWorkflowPolicyContext(f.root, f.workId);
    const request = await requestConfirmation(f.root, f.workId, {
      requestId: 'accept-report', gate: 'acceptance', scope: f.scope,
      subjects: [workflowRef('outputs/report-output.md')], upstream: [], reviewSummary: 'Review this observed report delivery.',
      openIssues: [], nextAction: 'Accept this exact report.',
      workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest },
      deliveryBinding: { deliveryCheckId: receipt.id, deliveryBasisDigest: receipt.basisDigest },
    });
    put(f.root, 'accept-report.md', 'Accept the presented report delivery.\n');
    const decision = await recordDecision(f.root, f.workId, {
      decisionId: 'accept-report-yes', requestId: 'accept-report', outcome: 'approved', conditions: [],
      source: { kind: 'conversation', reference: workflowRef('accept-report.md'), quote: 'Accept the presented report delivery.', presentation: workflowRef(request.presentation) },
      sourceReview: { reviewer: 'fixture', rationale: 'Exact synthetic report and delivery were presented.', reviewedAt: new Date().toISOString() },
    });
    assert.equal(decision.confirmed, true);
    assert.equal((await inspectDeliveryReceipt(f.root, f.workId, receipt.id)).matches, true);
  });
  await t.test('same successful operation replays history and conflicting input does not overwrite it', async () => {
    const before = snapshot(f.root);
    const historical = await applyWorkDeliveryReady(f.root, f.workId, readyInput, deliveryPlan.planId);
    assert.equal(historical.changed, false); assert.equal(historical.historical, true);
    assert.equal(historical.currentValidity, 'not-evaluated');
    assert.deepEqual(snapshot(f.root), before);
    await assert.rejects(planWorkDeliveryReady(f.root, f.workId, { ...readyInput, evidenceRefs: [] }), { code: 'OPERATION_CONFLICT' });
  });
  await t.test('body changes invalidate current delivery while preserved receipt remains historical', async () => {
    const path = 'outputs/report-output.md'; const original = readFileSync(join(f.root, path), 'utf8');
    try {
      put(f.root, path, original + '\nChanged report body.\n');
      const current = await inspectDeliveryReceipt(f.root, f.workId, receipt.id);
      assert.equal(current.objectMatches, false); assert.equal(current.matches, false);
      const historical = await applyWorkDeliveryReady(f.root, f.workId, readyInput, deliveryPlan.planId);
      assert.equal(historical.historical, true);
      assert.equal(historical.currentValidity, 'not-evaluated');
    } finally { put(f.root, path, original); }
  });
  await t.test('changed source does not inherit the old technical or acceptance conclusion', async () => {
    const original = readFileSync(join(f.root, 'instruction.md'), 'utf8');
    try {
      put(f.root, 'instruction.md', original + '\nThe scope has changed.\n');
      const current = await inspectDeliveryReceipt(f.root, f.workId, receipt.id);
      assert.equal(current.matches, false); assert.equal(current.current.operationAllowed, false);
    } finally { put(f.root, 'instruction.md', original); }
  });
  for (const [name, relative] of [
    ['work', `.tiller/work/${f.workId}/record.json`],
    ['stages', `.tiller/work/${f.workId}/stages/state.json`],
  ]) await t.test(`preview rejects changed ${name} control bytes even when semantic fields are unchanged`, async () => {
    const checked = await inspectWorkDelivery(f.root, f.workId, input);
    const candidate = { operationId: `cas-${name}`, expected: checked.controlSnapshot, ...input };
    const plan = await planWorkDeliveryReady(f.root, f.workId, candidate);
    const original = readFileSync(join(f.root, relative), 'utf8');
    try {
      put(f.root, relative, original + ' \n');
      await assert.rejects(applyWorkDeliveryReady(f.root, f.workId, candidate, plan.planId), { code: 'REVISION_CONFLICT' });
      assert.equal(existsSync(join(f.root, `.tiller/work/${f.workId}/delivery-checks/cas-${name}.json`)), false);
    } finally { put(f.root, relative, original); }
  });
  await t.test('completion text must map to actual checks and a report cannot fabricate planning evidence', async () => {
    const wrong = structuredClone(input); wrong.checkMappings[0].text = 'A different completion claim.';
    const rejected = await inspectWorkDelivery(f.root, f.workId, wrong);
    assert.equal(rejected.operationAllowed, false);
    assert.ok(rejected.issues.some(issue => issue.code === 'WORKFLOW_COMPLETION_MAPPING_INVALID'));
    const foreign = await inspectWorkDelivery(f.root, f.workId, { ...input, planningEvidenceRefs: input.evidenceRefs });
    assert.equal(foreign.operationAllowed, false);
    assert.ok(foreign.issues.some(issue => issue.code === 'UNEXPECTED_DEVELOPMENT_EVIDENCE'));
    const path = `.tiller/work/${f.workId}/stages/state.json`;
    const original = readFileSync(join(f.root, path), 'utf8');
    try {
      const state = JSON.parse(original);
      assert.equal(state.events.at(-1).stageId, 'report');
      assert.equal(state.events.at(-1).operation, 'verify');
      state.events.pop(); state.revision--;
      put(f.root, path, JSON.stringify(state));
      const omitted = structuredClone(input); omitted.evidenceRefs = [];
      for (const check of omitted.verification.checks) {
        check.artifactIds = check.artifactIds.filter(id => id !== 'report-output');
        check.inputs = check.inputs.filter(ref => ref.path !== 'outputs/report-output.md');
      }
      const uncovered = await inspectWorkDelivery(f.root, f.workId, omitted);
      assert.equal(uncovered.operationAllowed, false);
      assert.ok(uncovered.issues.some(issue => issue.code === 'WORKFLOW_STAGE_NOT_VERIFIED' && issue.message.includes('report')));
    } finally { put(f.root, path, original); }
  });
  await t.test('old receipt versions and unexpected revision input are rejected without modification', async () => {
    const path = `.tiller/work/${f.workId}/delivery-checks/old-receipt.json`;
    const old = JSON.stringify({ schemaVersion: 1, workId: f.workId, id: 'old-receipt' }) + '\n';
    put(f.root, path, old);
    await assert.rejects(readDeliveryReceipt(f.root, f.workId, 'old-receipt'), { code: 'UNSUPPORTED_RECORD_VERSION' });
    assert.equal(readFileSync(join(f.root, path), 'utf8'), old);
    const { expected: _expected, ...legacy } = readyInput;
    await assert.rejects(planWorkDeliveryReady(f.root, f.workId, { ...legacy, operationId: 'old-input', expectedRevision: 1 }));
  });
  await t.test('latest failed observation cannot reuse a previous passing delivery', async () => {
    await observeStage(f, 'report', finished.verification, 'failed');
    const current = await inspectDeliveryReceipt(f.root, f.workId, receipt.id);
    assert.equal(current.objectMatches, false);
    assert.equal(current.current.technicalReady, false);
    assert.equal(current.matches, false);
    assert.ok(current.current.issues.some(issue => issue.code === 'WORKFLOW_STAGE_NOT_VERIFIED' || issue.code === 'WORKFLOW_COMPLETION_VERIFICATION_REQUIRED'));
  });
});
