import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseWorkflowStageState, readWorkflowControlSnapshot, inspectWorkflowStages, inspectWorkflowStageExecution,
  planWorkflowStageOperation, applyWorkflowStageOperation,
} from '../dist/workflow-stages.js';
import { planWorkflowTransition, applyWorkflowTransition } from '../dist/workflow-transitions.js';
import { createWorkflowFixture, completeStage, startStage, stageStatus, stageStartInput, verifyInput } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

function nextIntent(record) {
  return {
    workflow: record.workflow.id, workflowVersion: record.workflow.version, goal: record.goal, reason: record.selectionReason,
    scope: record.scope, impact: record.impact, basis: record.basis.map(({ sha256, ...item }) => item),
    actionSources: record.actionSources.map(({ sha256, ...item }) => item),
    expectedOutputs: record.expectedOutputs, completionCriteria: record.completionCriteria, level: record.level,
  };
}

test('workflow stage generations preserve history but require new starts and new evidence', async t => {
  const f = await createWorkflowFixture(t);
  const completed = await completeStage(f, 'scope');
  const statePath = join(f.root, `.tiller/work/${f.workId}/stages/state.json`);
  const before = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.ok(before.events.every(event => event.workflowRevision === 1));
  const record = JSON.parse(readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8'));
  const input = {
    operationId: 'restart-workflow', expected: await readWorkflowControlSnapshot(f.root, f.workId),
    next: nextIntent(record), outputMappings: [{ from: 'scope-output', to: 'scope-output' }],
    evidenceMappings: [], confirmationRefs: [],
  };
  const planned = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(planned.operationAllowed, true, JSON.stringify(planned));
  await applyWorkflowTransition(f.root, f.workId, input, planned.planId);
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), before, 'Conversion retains the actual prior stage history.');
  const generation = record.revision + 1;
  const pending = await stageStatus(f, 'scope');
  assert.equal(pending.workflowRevision, generation);
  assert.equal(pending.effectiveStatus, 'pending');
  assert.equal(pending.attemptId, null);
  assert.equal(pending.eventSequence, null);
  await assert.rejects(inspectWorkflowStageExecution(f.root, f.workId, 'scope'), { code: 'WORKFLOW_STAGE_START_REQUIRED' });
  const cannotResume = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'resume', stageStartInput(f, 'scope'));
  assert.equal(cannotResume.operationAllowed, false);

  const historical = await applyWorkflowStageOperation(f.root, f.workId, 'scope', 'verify', completed.input, completed.plan.planId);
  assert.equal(historical.historical, true);
  assert.equal(historical.workflowRevision, 1);
  assert.equal(historical.currentValidity, 'not-evaluated');

  const started = await startStage(f, 'scope');
  assert.equal(started.receipt.workflowRevision, generation);
  assert.notEqual(started.receipt.attemptId, completed.start.receipt.attemptId);
  const oldEvidence = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'verify', verifyInput(f, started, completed.evidenceRefs));
  assert.equal(oldEvidence.operationAllowed, false, 'Old observation authorization cannot verify the new generation.');
  await completeStage(f, 'scope', started);
  assert.equal((await stageStatus(f, 'scope')).effectiveStatus, 'verified');
  const current = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.deepEqual(current.events.slice(0, before.events.length), before.events);
  assert.equal(parseWorkflowStageState(current, f.workId).revision, 4);

  const crossGeneration = structuredClone(current);
  crossGeneration.events[1].workflowRevision = generation;
  assert.throws(() => parseWorkflowStageState(crossGeneration, f.workId), /对应当前开始事实/u);
  const descending = structuredClone(current);
  descending.events[0].workflowRevision = generation;
  assert.throws(() => parseWorkflowStageState(descending, f.workId), /代际/u);
  const missingGeneration = structuredClone(current);
  delete missingGeneration.events[0].workflowRevision;
  assert.throws(() => parseWorkflowStageState(missingGeneration, f.workId), /修订或序号/u);
  const future = structuredClone(current);
  future.events.at(-1).workflowRevision = generation + 1;
  assert.throws(() => parseWorkflowStageState(future, f.workId), /对应当前开始事实/u);

  const outputRevision = structuredClone(current);
  outputRevision.events.slice(-2).forEach(event => { event.workflowRevision = record.revision; });
  put(f.root, `.tiller/work/${f.workId}/stages/state.json`, JSON.stringify(outputRevision));
  await assert.rejects(inspectWorkflowStages(f.root, f.workId), /尚不存在的流程代际/u,
    'An ordinary output revision is not a valid workflow generation.');

  // Structurally valid events from a future generation cannot become current
  // authorization merely because their own start/verify references agree.
  const futurePair = structuredClone(current);
  futurePair.events.slice(-2).forEach(event => { event.workflowRevision = generation + 1; });
  put(f.root, `.tiller/work/${f.workId}/stages/state.json`, JSON.stringify(futurePair));
  await assert.rejects(readWorkflowControlSnapshot(f.root, f.workId), /尚不存在的流程代际/u);
  await assert.rejects(inspectWorkflowStages(f.root, f.workId), /尚不存在的流程代际/u);
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), futurePair, 'Rejected history is not repaired or rewritten.');
});
