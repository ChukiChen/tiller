import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { loadBuiltinWorkflows, WORKFLOW_FACTS } from '../dist/workflow-catalog.js';
import { verificationCategories } from '../dist/verification-cases.js';
import { captureVerificationObservation, recordVerificationEvidence } from '../dist/verification-runs.js';
import { planWorkflowStageOperation, applyWorkflowStageOperation, inspectWorkflowStages } from '../dist/workflow-stages.js';
import { fixture, put } from './helpers.mjs';

export const workflowRef = path => ({ repository: '.', path });
export const workflowCategories = Object.fromEntries(verificationCategories.map(category => [category,
  { applicability: category === 'unit' ? 'applicable' : 'not-applicable', reason: 'Bounded synthetic document observation.' }]));
export async function createWorkflowFixture(t, workflow = 'analysis', overrides = {}) {
  const root = fixture(t); await initialize({ root });
  return createWorkflowFixtureAt(root, 'stage-fixture', workflow, overrides);
}
export async function createWorkflowFixtureAt(root, workId, workflow = 'analysis', overrides = {}) {
  const scope = overrides.scope ?? { repositories: ['.'], targets: [workId] };
  const snapshot = (await loadBuiltinWorkflows()).find(item => item.id === workflow);
  if (!existsSync(join(root, 'instruction.md'))) put(root, 'instruction.md', '# Synthetic authorization\nInspect and record the declared fixture outputs.\n');
  if (!existsSync(join(root, '.tiller/verification/config.json'))) {
    put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [], requirements: [], categories: workflowCategories, suites: [] }));
  }
  await createWorkflowWork(root, workId, 'Synthetic stage fixture', {
    operationId: 'create', expectedRevision: 0, workflow, goal: 'Check the declared fixture result', reason: 'Bounded test fixture', scope,
    impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])), basis: [],
    actionSources: [{ actions: ['read', 'write-report', 'test', 'local-experiment', 'edit-documents', 'edit-code'], reference: workflowRef('instruction.md'), quote: 'Inspect and record the declared fixture outputs.', scope }],
    expectedOutputs: snapshot.definition.completion.requiredOutputs, completionCriteria: ['Each required output has an observed result'], ...overrides,
  });
  return { root, workId, snapshot, scope, counter: 0, completed: new Map(), confirmationRefs: [] };
}
// A real first-stage start, with no fabricated observations or predecessor history.
export async function createStartedBaseline(root, workId, scope) {
  const f = await createWorkflowFixtureAt(root, workId, 'improvement', scope ? { scope } : {});
  const source = workflowRef(`baseline/${workId}.md`);
  put(root, source.path, '# Baseline\nIndependent fixture stage subject.\n');
  await addWorkflowOutput(root, workId, { operationId: 'baseline-output', expectedRevision: 1, outputId: 'baseline-output', source });
  const verification = stageSelection(f, 'baseline');
  verification.checks[0].inputs = [source];
  await startStage(f, 'baseline', { verification });
  return f;
}
export const baselineAuthorization = actions => ({ stageId: 'baseline', actions, confirmationRefs: [] });
export function workflowStageRevision(f) {
  try { return JSON.parse(readFileSync(join(f.root, `.tiller/work/${f.workId}/stages/state.json`), 'utf8')).revision; }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}
export const stageStatus = async (f, stageId) => (await inspectWorkflowStages(f.root, f.workId, stageId)).stages[0];
export const verifyInput = (f, started, evidenceRefs = [], extra = {}) => ({
  operationId: `verify-${++f.counter}`, expectedStageRevision: workflowStageRevision(f),
  attemptId: started.receipt.attemptId, evidenceRefs, ...extra,
});
export async function withStageReadCounter(action) {
  const originalRead = fsPromises.readFile;
  let stageReads = 0;
  fsPromises.readFile = async function (path, ...args) {
    if (String(path).replaceAll('\\', '/').endsWith('/stages/state.json')) stageReads++;
    return originalRead.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try { return await action(() => stageReads); }
  finally {
    fsPromises.readFile = originalRead;
    syncBuiltinESMExports();
  }
}
export function stageSelection(f, stageId) {
  const stage = f.snapshot.definition.stages.find(stage => stage.id === stageId);
  const outputIds = f.snapshot.definition.completion.requiredStages.includes(stageId)
    ? f.snapshot.definition.completion.requiredOutputs : stage.produces;
  return { caseIds: [], requirements: [], modules: [], categories: workflowCategories,
    reason: 'Observe the exact declared outputs.', scenarioReason: 'Synthetic output observation in an isolated project.',
    checks: [{ id: `check-${stageId}`, kind: 'manual', artifactIds: outputIds,
      inputs: outputIds.map(outputId => workflowRef(`outputs/${outputId}.md`)), requirements: [], categories: ['unit'], reason: 'Read each output and check its fixture assertion.' }] };
}
export function stageStartInput(f, stageId, overrides = {}) {
  const stage = f.snapshot.definition.stages.find(stage => stage.id === stageId); const verification = stageSelection(f, stageId);
  return { operationId: `start-${stageId}-${++f.counter}`, expectedStageRevision: workflowStageRevision(f), verification,
    checkMappings: stage.checks.map((text, index) => ({ index, text, checkIds: [verification.checks[0].id] })), confirmationRefs: [...f.confirmationRefs], ...overrides };
}
export async function startStage(f, stageId, overrides = {}, kind = 'start') {
  const input = stageStartInput(f, stageId, overrides);
  const plan = await planWorkflowStageOperation(f.root, f.workId, stageId, kind, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  const receipt = await applyWorkflowStageOperation(f.root, f.workId, stageId, kind, input, plan.planId);
  return { input, plan, receipt };
}
export async function registerStageOutputs(f, stageId) {
  const stage = f.snapshot.definition.stages.find(stage => stage.id === stageId);
  for (const outputId of stage.produces) {
    const record = JSON.parse(readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8'));
    if (record.artifacts[outputId]) continue;
    const path = `outputs/${outputId}.md`; put(f.root, path, `# ${outputId}\nObserved fixture output for ${stageId}.\n`);
    await addWorkflowOutput(f.root, f.workId, { operationId: `output-${outputId}`, expectedRevision: record.revision, outputId, source: workflowRef(path), confirmationRefs: f.confirmationRefs });
  }
}
export async function observeStage(f, stageId, selection = stageSelection(f, stageId), status = 'passed') {
  const workflow = { stageId, actions: ['write-report'], confirmationRefs: f.confirmationRefs };
  const captured = await captureVerificationObservation(f.root, f.workId, { selection, environment: 'synthetic-observer', workflow });
  const evidence = workflowRef(`observations/${stageId}-${++f.counter}.md`);
  const lines = selection.checks.flatMap(check => check.inputs.map(input => {
    const contents = readFileSync(join(f.root, input.path), 'utf8');
    assert.match(contents, /Observed fixture output/u); return `${input.path}: observed expected fixture marker`;
  }));
  put(f.root, evidence.path, '# Actual fixture observations\n' + lines.join('\n') + '\n');
  const recorded = await recordVerificationEvidence(f.root, f.workId, { captureId: captured.record.id, environment: captured.record.environment,
    results: selection.checks.map(check => ({ checkId: check.id, status, evidence, note: 'Read the actual fixture file after capture; status is a synthetic test outcome.' })) });
  return selection.checks.map(check => ({ workId: f.workId, runId: recorded.record.id, checkId: check.id, environment: recorded.record.environment }));
}
export async function completeStage(f, stageId, started) {
  const start = started ?? await startStage(f, stageId);
  await registerStageOutputs(f, stageId);
  const evidenceRefs = await observeStage(f, stageId, start.input.verification);
  const input = { operationId: `verify-${stageId}-${++f.counter}`, expectedStageRevision: workflowStageRevision(f), attemptId: start.receipt.attemptId, evidenceRefs,
    ...(f.confirmationRefs.length ? { confirmationRefs: [...f.confirmationRefs] } : {}) };
  const plan = await planWorkflowStageOperation(f.root, f.workId, stageId, 'verify', input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  const receipt = await applyWorkflowStageOperation(f.root, f.workId, stageId, 'verify', input, plan.planId);
  const result = { start, input, plan, receipt, verification: start.input.verification, evidenceRefs };
  f.completed.set(stageId, result); return result;
}
export async function completeWorkflow(f) {
  let final;
  for (const stage of f.snapshot.definition.stages) final = await completeStage(f, stage.id);
  return { ...final, checkMappings: f.snapshot.definition.completion.checks.map((text, index) => ({ index, text, checkIds: [final.verification.checks[0].id] })), confirmationRefs: [] };
}
