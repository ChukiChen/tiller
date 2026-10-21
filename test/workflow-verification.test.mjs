import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { WORKFLOW_FACTS, loadBuiltinWorkflows } from '../dist/workflow-catalog.js';
import { planWorkflowStageOperation, applyWorkflowStageOperation, inspectWorkflowStageExecution } from '../dist/workflow-stages.js';
import { verificationCategories } from '../dist/verification-cases.js';
import { assertVerificationInput } from '../dist/verification-selection.js';
import {
  planVerificationRun, applyVerificationRun, captureVerificationObservation,
  recordVerificationEvidence, evaluateVerificationSelection, readVerificationRecords,
} from '../dist/verification-runs.js';
import { fixture, put, snapshot } from './helpers.mjs';

const workId = 'workflow-verification';
const stageId = 'baseline';
const ref = path => ({ repository: '.', path });
const workflow = actions => ({ stageId, actions, confirmationRefs: [] });
const categories = Object.fromEntries(verificationCategories.map(category => [
  category, { applicability: category === 'unit' ? 'applicable' : 'not-applicable', reason: 'Isolated current-stage verification.' },
]));
async function setup(t, { kind = 'execution', start = true, script } = {}) {
  const root = fixture(t);
  await initialize({ root });
  put(root, 'request.md', 'Read, report and test this bounded baseline.\n');
  put(root, 'subject.md', '# Baseline\nMeasured current behavior.\n');
  put(root, 'spec.md', '# Requirement\nOnly current authorized observations can pass.\n');
  put(root, 'runner.mjs', script ?? "import {writeFileSync} from 'node:fs'; writeFileSync('executed.txt','executed');\n");
  put(root, '.tiller/verification/config.json', JSON.stringify({
    schemaVersion: 1, modules: [], requirements: [{ id: 'WV-1', source: ref('spec.md') }], categories,
    suites: [{ id: 'baseline', repository: '.', command: 'node', args: ['runner.mjs'], cwd: '.', timeoutMs: 5000, inputs: [ref('runner.mjs')] }],
  }));
  const scope = { repositories: ['.'], targets: ['baseline'] };
  await createWorkflowWork(root, workId, 'Bounded baseline', {
    operationId: 'create', expectedRevision: 0, workflow: 'improvement', goal: 'Measure the existing baseline.',
    reason: 'Only the baseline stage is exercised by this fixture.', scope,
    impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])),
    basis: [{ reference: ref('spec.md'), purpose: 'Current verification requirement.' }],
    actionSources: [{ actions: ['read', 'write-report', 'test'], reference: ref('request.md'), quote: 'Read, report and test this bounded baseline.', scope }],
    expectedOutputs: ['baseline-output'], completionCriteria: ['Current authorized evidence for the baseline.'],
  });
  await addWorkflowOutput(root, workId, { operationId: 'baseline-output', expectedRevision: 1, outputId: 'baseline-output', source: ref('subject.md') });
  const selection = {
    caseIds: [], requirements: ['WV-1'], modules: [], categories, reason: 'Verify the current baseline.',
    scenarioReason: 'Isolated action and freshness boundary.',
    checks: [{ id: 'baseline-check', kind, ...(kind === 'execution' ? { suite: 'baseline' } : {}),
      artifactIds: ['baseline-output'], inputs: [ref('subject.md')], requirements: ['WV-1'], categories: ['unit'], reason: 'Current measured subject.' }],
  };
  const definition = (await loadBuiltinWorkflows()).find(item => item.id === 'improvement').definition;
  const input = { operationId: 'start', expectedStageRevision: 0, verification: selection,
    checkMappings: [{ index: 0, text: definition.stages[0].checks[0], checkIds: ['baseline-check'] }], confirmationRefs: [] };
  if (start) {
    const plan = await planWorkflowStageOperation(root, workId, stageId, 'start', input);
    assert.equal(plan.operationAllowed, true, JSON.stringify(plan));
    await applyWorkflowStageOperation(root, workId, stageId, 'start', input, plan.planId);
  }
  return { root, selection, input };
}
async function run(root, selection) {
  const context = workflow(['test']);
  const plan = await planVerificationRun(root, workId, 'baseline', selection, context);
  return applyVerificationRun(root, workId, 'baseline', plan.planId, selection, context);
}
async function evaluate(root, selection) {
  const stage = await inspectWorkflowStageExecution(root, workId, stageId);
  return evaluateVerificationSelection(root, workId, selection, [], undefined,
    { history: 'selected', workflow: { stageId, attemptId: stage.attemptId } });
}

test('workflow verification requires an actual start and explicit execution action', async t => {
  const { root, selection } = await setup(t, { start: false });
  const before = snapshot(root);
  await assert.rejects(planVerificationRun(root, workId, 'baseline', selection, workflow(['test'])));
  await assert.rejects(planVerificationRun(root, workId, 'baseline', selection));
  assert.deepEqual(snapshot(root), before);
  assert.equal(existsSync(join(root, 'executed.txt')), false);
});

test('workflow verification executes with exact current attempt and rejects read-only execution declarations', async t => {
  const { root, selection } = await setup(t);
  await assert.rejects(planVerificationRun(root, workId, 'baseline', selection, workflow(['read'])), /test/);
  const result = await run(root, selection);
  assert.equal(result.ready, true);
  assert.equal(result.record.authorization.attemptId, (await inspectWorkflowStageExecution(root, workId, stageId)).attemptId);
  assert.equal((await evaluate(root, selection)).ready, true);
  assert.equal(readFileSync(join(root, 'executed.txt'), 'utf8'), 'executed');
});

test('workflow verification refuses a changed authorization source between plan and execution', async t => {
  const { root, selection } = await setup(t);
  const context = workflow(['test']);
  const plan = await planVerificationRun(root, workId, 'baseline', selection, context);
  put(root, 'request.md', 'The authorization was changed.\n');
  await assert.rejects(applyVerificationRun(root, workId, 'baseline', plan.planId, selection, context));
  assert.equal(existsSync(join(root, 'executed.txt')), false);
  assert.equal((await readVerificationRecords(root, workId)).length, 0);
});

test('workflow verification preserves actual execution when it invalidates its own authority', async t => {
  const { root, selection } = await setup(t, {
    script: "import {writeFileSync} from 'node:fs'; writeFileSync('request.md','Changed during execution.\\n');\n",
  });
  const result = await run(root, selection);
  assert.equal(result.record.execution.exitCode, 0);
  assert.equal(result.record.staleAfterExecution, true);
  assert.equal(result.ready, false);
  assert.equal((await readVerificationRecords(root, workId)).length, 1);
});

test('workflow observations retain capture authority and latest failure overrides old success', async t => {
  const { root, selection } = await setup(t, { kind: 'manual' });
  const observe = async status => {
    const capture = await captureVerificationObservation(root, workId, {
      selection, environment: 'synthetic-observer', workflow: workflow(['write-report']),
    });
    put(root, 'observation.md', `# Actual fixture observation\n${status}\n`);
    return recordVerificationEvidence(root, workId, {
      captureId: capture.record.id, environment: capture.record.environment,
      results: [{ checkId: 'baseline-check', status, evidence: ref('observation.md'), note: 'Observed after capture.' }],
    });
  };
  await observe('passed');
  assert.equal((await evaluate(root, selection)).ready, true);
  await observe('failed');
  assert.equal((await evaluate(root, selection)).checks[0].status, 'failed');
});

test('workflow observations cannot report results after their action source changes', async t => {
  const { root, selection } = await setup(t, { kind: 'manual' });
  const capture = await captureVerificationObservation(root, workId, {
    selection, environment: 'synthetic-observer', workflow: workflow(['write-report']),
  });
  put(root, 'observation.md', '# Observed result\nFixture observation.\n');
  put(root, 'request.md', 'Changed authorization.\n');
  await assert.rejects(recordVerificationEvidence(root, workId, {
    captureId: capture.record.id, environment: capture.record.environment,
    results: [{ checkId: 'baseline-check', status: 'passed', evidence: ref('observation.md'), note: 'Current observation.' }],
  }));
  assert.equal((await readVerificationRecords(root, workId)).length, 1);
});

test('workflow verification cannot carry a passed result into a resumed attempt', async t => {
  const { root, selection, input } = await setup(t);
  const result = await run(root, selection);
  const resume = { ...input, operationId: 'resume', expectedStageRevision: 1 };
  const plan = await planWorkflowStageOperation(root, workId, stageId, 'resume', resume);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan));
  await applyWorkflowStageOperation(root, workId, stageId, 'resume', resume, plan.planId);
  const current = await evaluate(root, selection);
  assert.equal(current.ready, false);
  assert.equal(current.checks[0].status, 'stale');
  assert.notEqual((await inspectWorkflowStageExecution(root, workId, stageId)).attemptId, result.record.authorization.attemptId);
});

test('workflow controls cannot be used as independent verification inputs', () => {
  for (const path of ['workflow/definitions/current.json', 'stages/state.json', 'transitions/change.json'])
    assert.throws(() => assertVerificationInput(ref(`.tiller/work/${workId}/${path}`)), /控制资料/);
});
