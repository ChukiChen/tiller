import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowStageFacts } from '../dist/workflow-stage-rules.js';

// Domain-only facts: no project setup, persisted approval, runtime or filesystem.
const base = {stageId: 'implementation', workflowRevision: 1, applicability: 'applicable', sourceIssues: []};
const start = {operation: 'start', sequence: 1, attemptId: 'attempt-one', startBasisDigest: 'start-digest',
  input: {verification: {checks: []}, checkMappings: [], confirmationRefs: [],
    delegation: {kind: 'development-tasks', planningRevision: 'v-one', taskIds: ['task-a']}}};
const basis = {basisDigest: 'start-digest', issues: []};
const completion = {completionBasisDigest: 'complete-digest', issues: [], artifactSnapshots: {}, verificationBasisDigest: 'verified', taskBindings: []};

test('stage rules distinguish pending, conditional, active and verified facts without loading material', () => {
  assert.equal(evaluateWorkflowStageFacts(base).effectiveStatus, 'pending');
  assert.equal(evaluateWorkflowStageFacts({...base, applicability: 'unresolved'}).effectiveStatus, 'blocked');
  assert.equal(evaluateWorkflowStageFacts({...base, applicability: 'not-applicable'}).technicalReady, true);
  assert.equal(evaluateWorkflowStageFacts({...base, applicability: 'not-applicable', sourceIssues: ['changed source']}).technicalReady, false);
  assert.equal(evaluateWorkflowStageFacts({...base, start, event: start, basis}).effectiveStatus, 'active');
  const event = {...start, operation: 'verify', sequence: 2, completionBasisDigest: 'complete-digest', input: {evidenceRefs: []}};
  assert.equal(evaluateWorkflowStageFacts({...base, start, event, basis, completion}).effectiveStatus, 'verified');
  for (const changed of [
    {basis: {...basis, basisDigest: 'changed'}},
    {completion: {...completion, completionBasisDigest: 'changed'}},
    {completion: {...completion, issues: ['delegated task is stale']}},
    {sourceIssues: ['revoked authority']},
  ]) {
    const result = evaluateWorkflowStageFacts({...base, start, event, basis, completion, ...changed});
    assert.equal(result.effectiveStatus, 'stale'); assert.equal(result.technicalReady, false);
  }
});

test('stage rules require explicit observed material and preserve attempt-bound references', () => {
  assert.throws(() => evaluateWorkflowStageFacts({...base, start, event: start}), {code: 'WORKFLOW_STAGE_INPUT_INCOMPLETE'});
  const event = {...start, operation: 'verify', input: {evidenceRefs: [{workId: 'owner', runId: 'run'}], confirmationRefs: []}, completionBasisDigest: 'complete-digest'};
  assert.throws(() => evaluateWorkflowStageFacts({...base, start, event, basis}), {code: 'WORKFLOW_STAGE_INPUT_INCOMPLETE'});
  const result = evaluateWorkflowStageFacts({...base, start, event, basis, completion});
  assert.deepEqual(result.evidenceRefs, event.input.evidenceRefs);
  assert.deepEqual(result.confirmationRefs, []);
  assert.deepEqual(result.delegation, start.input.delegation);
});
