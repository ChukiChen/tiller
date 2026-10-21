import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planWorkflowStageOperation, applyWorkflowStageOperation, inspectWorkflowStages } from '../dist/workflow-stages.js';
import { WORKFLOW_FACTS } from '../dist/workflow-catalog.js';
import {
  createWorkflowFixture, stageStartInput, registerStageOutputs, observeStage, completeStage,
  stageStatus, verifyInput, withStageReadCounter,
} from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

const statePath = f => join(f.root, `.tiller/work/${f.workId}/stages/state.json`);

test('workflow stages enforce order, actual evidence, CAS, idempotency and current sources', async t => {
  const f = await createWorkflowFixture(t);
  const outOfOrder = await planWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', stageStartInput(f, 'evidence'));
  assert.equal(outOfOrder.operationAllowed, false);
  assert.match(outOfOrder.blockingReasons.join(';'), /前置阶段/);
  assert.equal(existsSync(statePath(f)), false);

  const first = stageStartInput(f, 'scope');
  const concurrent = stageStartInput(f, 'scope');
  const firstPlan = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'start', first);
  const concurrentPlan = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'start', concurrent);
  const receipt = await applyWorkflowStageOperation(f.root, f.workId, 'scope', 'start', first, firstPlan.planId);
  const started = { input: first, plan: firstPlan, receipt };
  const beforeRetry = readFileSync(statePath(f), 'utf8');
  await assert.rejects(applyWorkflowStageOperation(f.root, f.workId, 'scope', 'start', concurrent, concurrentPlan.planId), { code: 'REVISION_CONFLICT' });
  const retry = await applyWorkflowStageOperation(f.root, f.workId, 'scope', 'start', first, firstPlan.planId);
  assert.equal(retry.historical, true);
  assert.equal(retry.currentValidity, 'not-evaluated');
  assert.equal(readFileSync(statePath(f), 'utf8'), beforeRetry);
  await assert.rejects(planWorkflowStageOperation(f.root, f.workId, 'scope', 'start', { ...first, expectedStageRevision: 1 }), { code: 'OPERATION_CONFLICT' });

  const noOutput = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'verify', verifyInput(f, started));
  assert.equal(noOutput.operationAllowed, false);
  assert.match(noOutput.blockingReasons.join(';'), /产物/);
  await registerStageOutputs(f, 'scope');
  const noObservation = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'verify', verifyInput(f, started));
  assert.equal(noObservation.operationAllowed, false, 'Registering output text cannot stand in for actual verification evidence.');
  const failedEvidence = await observeStage(f, 'scope', first.verification, 'failed');
  assert.equal((await planWorkflowStageOperation(f.root, f.workId, 'scope', 'verify', verifyInput(f, started, failedEvidence))).operationAllowed, false);
  const completed = await completeStage(f, 'scope', started);
  assert.equal(completed.receipt.technicalReady, true);
  assert.equal((await stageStatus(f, 'scope')).effectiveStatus, 'verified');

  const evidenceStart = stageStartInput(f, 'evidence');
  const evidencePlan = await planWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', evidenceStart);
  // A work-record mutation between preview and apply invalidates the CAS even
  // though the scope stage's start basis deliberately excludes its own output.
  await registerStageOutputs(f, 'evidence');
  const beforeWorkRace = readFileSync(statePath(f), 'utf8');
  await assert.rejects(applyWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', evidenceStart, evidencePlan.planId), { code: 'CONTENT_CHANGED' });
  assert.equal(readFileSync(statePath(f), 'utf8'), beforeWorkRace);
  await completeStage(f, 'evidence');
  await completeStage(f, 'hypotheses');
  await completeStage(f, 'report');
  await withStageReadCounter(async stageReads => {
    const firstRound = await inspectWorkflowStages(f.root, f.workId);
    assert.ok(firstRound.stages.every(stage => stage.technicalReady));
    assert.equal(stageReads(), 2, 'One explicit stage input is loaded and independently proved before return.');
    await inspectWorkflowStages(f.root, f.workId);
    assert.equal(stageReads(), 4, 'An independent inspection loads and proves fresh control bytes.');
  });
  put(f.root, 'outputs/scope-output.md', '# Changed scope\nObserved fixture output with a changed boundary.\n');
  assert.equal((await stageStatus(f, 'scope')).effectiveStatus, 'stale');
  assert.equal((await stageStatus(f, 'evidence')).effectiveStatus, 'stale');
  put(f.root, 'instruction.md', '# Changed authorization\nThe earlier instruction is no longer current.\n');
  const invalidSource = await stageStatus(f, 'scope');
  assert.equal(invalidSource.technicalReady, false);
  assert.ok(invalidSource.issues.length);
  assert.equal((await applyWorkflowStageOperation(f.root, f.workId, 'scope', 'start', first, firstPlan.planId)).historical, true);
});

test('workflow stages keep unknown conditional requirements blocked instead of not applicable', async t => {
  const f = await createWorkflowFixture(t, 'documentation', {
    impact: { ...Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])), semanticChange: 'unknown' },
  });
  const status = await stageStatus(f, 'requirements');
  assert.equal(status.applicability, 'unresolved');
  assert.equal(status.effectiveStatus, 'blocked');
  assert.equal(status.technicalReady, false);
  const plan = await planWorkflowStageOperation(f.root, f.workId, 'requirements', 'start', stageStartInput(f, 'requirements'));
  assert.equal(plan.operationAllowed, false);
  assert.match(plan.blockingReasons.join(';'), /未知/);
  assert.equal(existsSync(statePath(f)), false);
});
