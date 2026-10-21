import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { cli, failure, fixture, put, snapshot, success } from './helpers.mjs';
import { loadBuiltinWorkflows, WORKFLOW_FACTS } from '../dist/workflow-catalog.js';
import { readWorkflowControlSnapshot } from '../dist/workflow-stages.js';
import { createWorkflowFixture, stageStartInput, registerStageOutputs, observeStage, verifyInput } from './workflow-fixtures.mjs';

test('workflow CLI lists all builtins and validates candidate versions without activating them', async t => {
  const root = fixture(t); success(cli(root, 'init'));
  const before = snapshot(root);
  const listed = success(cli(root, 'workflow', 'list'));
  assert.equal(listed.workflows.length, 11);
  assert.ok(listed.workflows.every(entry => entry.status === 'builtin'));
  const shown = success(cli(root, 'workflow', 'show', 'analysis'));
  assert.equal(shown.snapshot.id, 'analysis');
  assert.equal(shown.automaticTransition, false);
  success(cli(root, 'workflow', 'check'));
  assert.deepEqual(snapshot(root), before);
  const definition = structuredClone((await loadBuiltinWorkflows()).find(item => item.id === 'analysis').definition);
  definition.id = 'project.cli';
  for (const version of ['1.0.0', '1.1.0']) {
    definition.version = version;
    put(root, `.tiller/workflows/project.cli@${version}.json`, JSON.stringify(definition));
  }
  assert.equal(failure(cli(root, 'workflow', 'show', 'project.cli')).error.code, 'INVALID_ARGUMENT');
  const selected = success(cli(root, 'workflow', 'show', 'project.cli', '--revision', '1.0.0'));
  assert.equal(selected.status, 'validated-candidate');
  assert.equal(selected.snapshot.version, '1.0.0');
  assert.equal(success(cli(root, 'workflow', 'list')).workflows.length, 13);
});

test('CLI creates an explicitly selected workflow and registers outputs through the nested route', async t => {
  const root = fixture(t); success(cli(root, 'init'));
  put(root, 'source.md', '# Source\nAnalyze the stated input and write the findings.\n');
  const input = {
    operationId: 'create', expectedRevision: 0, workflow: 'analysis', goal: 'Explain the observed result',
    reason: 'Bounded CLI fixture', scope: { repositories: ['.'], targets: ['cli'] },
    impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])), basis: [],
    actionSources: [{ actions: ['read', 'write-report'], reference: { repository: '.', path: 'source.md' },
      quote: 'Analyze the stated input and write the findings.', scope: { repositories: ['.'], targets: ['cli'] } }],
    expectedOutputs: (await loadBuiltinWorkflows()).find(entry => entry.id === 'analysis').definition.completion.requiredOutputs,
    completionCriteria: ['Report describes the observed result'],
  };
  put(root, 'create.json', JSON.stringify(input));
  const before = snapshot(root);
  assert.equal(cli(root, 'work', 'create', 'cli', '--title', 'CLI', '--input', 'create.json').status, 2);
  assert.equal(cli(root, 'work', 'create', 'cli', '--title', 'CLI', '--workflow', 'research', '--input', 'create.json').status, 2);
  assert.deepEqual(snapshot(root), before);
  success(cli(root, 'work', 'create', 'cli', '--title', 'CLI', '--workflow', 'analysis', '--input', 'create.json'));
  const created = snapshot(root);
  assert.equal(success(cli(root, 'work', 'create', 'cli', '--title', 'CLI', '--workflow', 'analysis', '--input', 'create.json')).changed, false);
  failure(cli(root, 'work', 'create', 'cli', '--title', 'Replacement', '--workflow', 'analysis', '--input', 'create.json'));
  assert.deepEqual(snapshot(root), created);
  const record = JSON.parse(readFileSync(join(root, '.tiller/work/cli/record.json'), 'utf8'));
  assert.equal(record.schemaVersion, 4); assert.equal(record.workflowRevision, 1);
  put(root, 'output.json', JSON.stringify({ operationId: 'output', expectedRevision: record.revision,
    outputId: 'scope-output', content: '# Analysis\nObserved the specified input and recorded the result.\n' }));
  success(cli(root, 'work', 'output', 'add', 'cli', '--input', 'output.json'));
  const inspected = success(cli(root, 'work', 'workflow', 'inspect', 'cli'));
  assert.equal(inspected.record.workflowRevision, 1);
  assert.equal(inspected.automaticTransition, false);
  success(cli(root, 'work', 'workflow', 'dependencies', 'cli', '--stage', 'scope'));
});

test('CLI explicitly creates each of the eleven builtin workflows without inferring completion', async t => {
  const root = fixture(t); success(cli(root, 'init'));
  put(root, 'request.md', '# Request\nRead the declared scope and write its report.\n');
  for (const workflow of await loadBuiltinWorkflows()) {
    const scope = { repositories: ['.'], targets: [workflow.id] };
    put(root, 'create.json', JSON.stringify({ operationId: 'create', expectedRevision: 0, workflow: workflow.id,
      goal: 'Record the declared fixture outcome', reason: 'Explicit CLI selection', scope,
      impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])), basis: [],
      actionSources: [{ actions: ['read', 'write-report'], reference: { repository: '.', path: 'request.md' },
        quote: 'Read the declared scope and write its report.', scope }],
      expectedOutputs: workflow.definition.completion.requiredOutputs, completionCriteria: ['Observe the declared outputs'] }));
    success(cli(root, 'work', 'create', workflow.id, '--title', workflow.title ?? workflow.id,
      '--workflow', workflow.id, '--input', 'create.json'));
    const resumed = success(cli(root, 'work', 'resume', workflow.id));
    assert.equal(resumed.workflow.id, workflow.id);
    assert.equal(resumed.workflowRevision, 1);
    assert.equal(resumed.automaticTransition, false);
    assert.equal(resumed.ready, false);
  }
});

test('stage CLI keeps preview read-only, verifies actual observations and distinguishes historical replay', async t => {
  const f = await createWorkflowFixture(t);
  const stage = f.snapshot.definition.stages[0].id;
  const input = stageStartInput(f, stage);
  put(f.root, 'stage.json', JSON.stringify(input));
  const before = snapshot(f.root);
  const args = ['work', 'stage', 'start', f.workId, '--stage', stage, '--input', 'stage.json'];
  const planned = success(cli(f.root, ...args, '--plan'));
  assert.deepEqual(snapshot(f.root), before);
  const receipt = success(cli(f.root, ...args, '--apply', planned.planId));
  const replay = success(cli(f.root, ...args, '--apply', planned.planId));
  assert.equal(replay.historical, true); assert.equal(replay.currentValidity, 'not-evaluated');
  await registerStageOutputs(f, stage);
  const evidence = await observeStage(f, stage, input.verification);
  put(f.root, 'verify.json', JSON.stringify(verifyInput(f, { receipt }, evidence)));
  const verifyArgs = ['work', 'stage', 'verify', f.workId, '--stage', stage, '--input', 'verify.json'];
  const verify = success(cli(f.root, ...verifyArgs, '--plan'));
  success(cli(f.root, ...verifyArgs, '--apply', verify.planId));
  const status = success(cli(f.root, 'work', 'stage', 'status', f.workId, '--stage', stage));
  assert.equal(status.stages[0].effectiveStatus, 'verified');
});

test('CLI links use current control snapshots and replay safely without granting completion', async t => {
  const f = await createWorkflowFixture(t);
  const input = { operationId: 'links', expected: await readWorkflowControlSnapshot(f.root, f.workId), links: [] };
  put(f.root, 'links.json', JSON.stringify(input));
  const args = ['work', 'workflow', 'links', f.workId, '--input', 'links.json'];
  const before = snapshot(f.root);
  const planned = success(cli(f.root, ...args, '--plan'));
  assert.deepEqual(snapshot(f.root), before);
  success(cli(f.root, ...args, '--apply', planned.planId));
  assert.equal(success(cli(f.root, ...args, '--apply', planned.planId)).historical, true);
});

test('CLI registers an unchanged project policy and converts a work with exact snapshot replay', async t => {
  const f = await createWorkflowFixture(t);
  const definition = structuredClone(f.snapshot.definition); definition.id = 'project.cli';
  put(f.root, '.tiller/workflows/project.cli@1.0.0.json', JSON.stringify(definition));
  const registration = { operationId: 'register', expectedRevision: 0, ownerWorkId: f.workId,
    candidate: { id: definition.id, version: definition.version }, baseline: { id: f.snapshot.id, version: f.snapshot.version },
    confirmationRefs: [] };
  put(f.root, 'register.json', JSON.stringify(registration));
  const registerArgs = ['workflow', 'register', '--input', 'register.json'];
  const before = snapshot(f.root);
  const plan = success(cli(f.root, ...registerArgs, '--plan'));
  assert.deepEqual(snapshot(f.root), before);
  success(cli(f.root, ...registerArgs, '--apply', plan.planId));
  assert.equal(success(cli(f.root, ...registerArgs, '--apply', plan.planId)).historical, true);
  const inspected = success(cli(f.root, 'work', 'workflow', 'inspect', f.workId));
  const value = inspected.record;
  const next = { workflow: value.workflow.id, workflowVersion: value.workflow.version, goal: value.goal, reason: value.selectionReason,
    scope: value.scope, impact: value.impact, basis: value.basis.map(({ sha256, ...entry }) => entry),
    actionSources: value.actionSources.map(({ sha256, ...entry }) => entry), expectedOutputs: value.expectedOutputs,
    completionCriteria: value.completionCriteria, level: value.level };
  put(f.root, 'change.json', JSON.stringify({ operationId: 'change', expected: inspected.controlSnapshot, next,
    outputMappings: [], evidenceMappings: [], confirmationRefs: [] }));
  const changeArgs = ['work', 'workflow', 'change', f.workId, '--input', 'change.json'];
  const change = success(cli(f.root, ...changeArgs, '--plan'));
  success(cli(f.root, ...changeArgs, '--apply', change.planId));
  assert.equal(success(cli(f.root, ...changeArgs, '--apply', change.planId)).historical, true);
  assert.equal(success(cli(f.root, 'work', 'workflow', 'inspect', f.workId)).record.workflowRevision, 2);
});

test('typed CLI rejects ambiguous routes and unsupported flags before writing', async t => {
  const f = await createWorkflowFixture(t);
  put(f.root, 'invalid.json', JSON.stringify({ selection: {}, workflow: {}, force: true }));
  const before = snapshot(f.root);
  for (const args of [
    ['workflow', 'list', 'extra'], ['workflow', 'show', 'analysis', '--stage', 'analyze'],
    ['workflow', 'show', 'analysis', '--revision', '1.0.0', '--revision', '1.0.0'],
    ['workflow', 'register', '--input', 'invalid.json'],
    ['workflow', 'register', '--input', 'invalid.json', '--plan', '--apply', 'x'],
    ['work', 'workflow', 'inspect', f.workId, '--input', 'invalid.json'],
    ['work', 'workflow', 'dependencies', f.workId],
    ['work', 'workflow', 'change', f.workId, '--input', 'invalid.json'],
    ['work', 'stage', 'start', f.workId, '--input', 'invalid.json', '--plan'],
    ['work', 'stage', 'status', f.workId, '--apply', 'x'],
    ['work', 'output', 'remove', f.workId],
    ['verification', 'run', f.workId, '--suite', 'sample', '--plan'],
    ['verification', 'run', f.workId, '--suite', 'sample', '--input', 'invalid.json', '--plan'],
  ]) {
    const rejected = cli(f.root, ...args);
    assert.equal(rejected.status, 2, JSON.stringify(rejected.data));
    assert.equal(failure(rejected).error.code, 'INVALID_ARGUMENT');
    assert.deepEqual(snapshot(f.root), before);
  }
});
