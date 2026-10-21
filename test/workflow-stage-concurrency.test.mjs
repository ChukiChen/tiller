import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withWorkflowStageInputs, inspectWorkflowStages, inspectWorkflowStagesInInput } from '../dist/workflow-stages.js';
import { createWorkflowFixture, startStage } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

test('concurrent independent stage queries agree with explicitly evaluated analysis inputs', async t => {
  const context = await createWorkflowFixture(t, 'analysis');
  await startStage(context, 'scope');
  const queries = await Promise.all(Array.from({ length: 3 }, () =>
    inspectWorkflowStages(context.root, context.workId, 'scope')));
  const explicit = await withWorkflowStageInputs(context.root, context.workId,
    input => inspectWorkflowStagesInInput(input, 'scope'));
  const results = [...queries, explicit].map(query => query.stages[0]);
  assert.deepEqual(results.map(result => result.effectiveStatus), ['active', 'active', 'active', 'active']);
  assert.ok(results.every(result => result.issues.length === 0));
});

test('explicit stage inputs reject changed control bytes before returning an observed status', async t => {
  const context = await createWorkflowFixture(t, 'analysis');
  await startStage(context, 'scope');
  const statePath = `.tiller/work/${context.workId}/stages/state.json`;
  const original = readFileSync(join(context.root, statePath), 'utf8');
  try {
    await assert.rejects(withWorkflowStageInputs(context.root, context.workId, async input => {
      const observed = await inspectWorkflowStagesInInput(input, 'scope');
      assert.equal(observed.stages[0].effectiveStatus, 'active');
      put(context.root, statePath, `${original}\n`);
      return observed;
    }), { code: 'WORKFLOW_STAGE_INSPECTION_CHANGED' });
  } finally { put(context.root, statePath, original); }
  assert.equal((await inspectWorkflowStages(context.root, context.workId, 'scope')).stages[0].effectiveStatus, 'active');
});

test('parallel graph and basis evaluation reject a self dependency instead of deadlocking', { timeout: 30_000 }, async t => {
  const context = await createWorkflowFixture(t, 'analysis');
  const started = await startStage(context, 'scope');
  await withWorkflowStageInputs(context.root, context.workId, async ({ current, evaluated }) => {
    // Exercise the evaluator's defensive boundary with a cyclic in-memory graph.
    // The stored catalog, stage start and history remain genuine and unchanged.
    const definition = { ...evaluated.stage('scope'), dependsOn: ['scope'] };
    const snapshot = structuredClone(current.context.snapshot);
    snapshot.definition.stages = snapshot.definition.stages.map(stage => stage.id === definition.id ? definition : stage);
    const results = await Promise.allSettled([
      inspectWorkflowStages(context.root, context.workId, 'scope', {
        context: { ...current.context, snapshot },
      }),
      evaluated.startBasis(definition, started.input),
    ]);
    assert.ok(results.every(result => result.status === 'rejected'));
    assert.ok(results.every(result => result.reason.code === 'WORKFLOW_STAGE_DEPENDENCY_CYCLE'));
    assert.deepEqual(evaluated.stage('scope').dependsOn, [], 'The loaded immutable definition remains unchanged.');
  });
});
