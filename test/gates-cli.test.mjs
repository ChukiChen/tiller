import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkflowFixtureAt, startStage } from './workflow-fixtures.mjs';
import { readWorkflowControlSnapshot } from '../dist/workflow-stages.js';
import { cli, failure, fixture, put, snapshot, success } from './helpers.mjs';
import { setupPlanning } from './planning-helpers.mjs';
import { setupTasks, activateTaskPlan } from './task-helpers.mjs';

const ref = path => ({ repository: '.', path });
const categories = ['unit', 'interface', 'integration', 'scenario', 'performance', 'security', 'reliability', 'compatibility', 'usability'];
function selection(input = 'artifact.md', kind = 'manual') {
  return {
    caseIds: [], requirements: [], modules: [],
    categories: Object.fromEntries(categories.map(category => [category, {
      applicability: category === 'usability' ? 'applicable' : 'not-applicable', reason: 'Bounded documentation fixture.',
    }])),
    reason: 'Check this document delivery.', scenarioReason: 'No business or cross-module behavior in this fixture.',
    checks: [{ id: 'document-check', kind, ...(kind === 'execution' ? { suite: 'sample' } : {}), artifactIds: ['document'],
      inputs: [ref(input)], requirements: [], categories: ['usability'], reason: 'Observe the specified artifact.' }],
  };
}
async function setup(t) {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'verification', 'init'));
  const f = await createWorkflowFixtureAt(root, 'gates', 'bugfix');
  await startStage(f, 'reproduce');
  put(root, 'artifact.md', '# Artifact\nReview this specific document.\n');
  return root;
}

test('scoped CLI observations bind the original artifact and reject stale reported success', async t => {
  const root = await setup(t);
  const caller = fixture(t);
  const selected = selection();
  put(root, 'selection.json', JSON.stringify({ selection: selected }));
  put(root, 'capture.json', JSON.stringify({ selection: selected, environment: 'synthetic-cli-fixture', workflow: { stageId: 'reproduce', actions: ['write-report'], confirmationRefs: [] } }));
  const before = snapshot(root);
  const unobserved = failure(cli(root, 'verification', 'report', 'gates', '--input', 'selection.json'));
  assert.equal(unobserved.ready, false);
  assert.deepEqual(snapshot(root), before);
  const capture = success(cli(caller, 'verification', 'capture', 'gates', '--input', 'capture.json', '--path', root));
  put(root, 'evidence.md', '# Observation\nSynthetic reviewer checked the captured document.\n');
  put(root, 'result.json', JSON.stringify({ captureId: capture.captureId, environment: 'synthetic-cli-fixture',
    results: [{ checkId: 'document-check', status: 'passed', evidence: ref('evidence.md'), note: 'Synthetic observed result.' }] }));
  success(cli(root, 'verification', 'record', 'gates', '--input', 'result.json'));
  const stable = snapshot(root);
  success(cli(root, 'verification', 'report', 'gates', '--input', 'selection.json'));
  success(cli(root, 'verification', 'report', 'gates', '--input', 'selection.json'));
  assert.deepEqual(snapshot(root), stable);
  assert.equal(failure(cli(root, 'verification', 'report', 'gates')).ready, false, 'local evidence does not silently satisfy unrelated global gaps');
  put(root, 'artifact.md', '# Artifact\nChanged after the observation.\n');
  const changed = snapshot(root);
  const stale = failure(cli(root, 'verification', 'report', 'gates', '--input', 'selection.json'));
  assert.match(JSON.stringify(stale), /stale|变化|过期/);
  assert.deepEqual(snapshot(root), changed);
});

test('planning CLI registers immutable review content and activates only with current planning approval', async t => {
  const { root, workId, registration, approvePlanning } = await setupPlanning(t);
  const caller = fixture(t);
  const invoke = (...args) => cli(caller, 'work', 'plan', ...args, '--path', root);
  put(root, 'registration.json', JSON.stringify(registration));
  const original = snapshot(root);
  const prepared = success(invoke('register', workId, '--input', 'registration.json', '--plan'));
  assert.equal(prepared.operationAllowed, true);
  assert.deepEqual(snapshot(root), original);
  const registered = success(invoke('register', workId, '--input', 'registration.json', '--apply', prepared.planId));
  assert.equal(registered.changed, true);
  assert.equal(registered.technicalReady, false);
  const statePath = `.tiller/work/${workId}/tasks.json`;
  const state = () => JSON.parse(readFileSync(join(root, statePath), 'utf8'));
  assert.equal(state().activePlanning, null, 'registration is not approval or activation');
  const activation = { operationId: 'activate-one', expectedRevision: state().revision, revision: registration.plan.revision,
    confirmation: { workId, requestId: 'planning-one', decisionId: 'planning-one-yes' } };
  put(root, 'activation.json', JSON.stringify(activation));
  const registeredFiles = snapshot(root);
  const denied = failure(invoke('activate', workId, '--input', 'activation.json', '--plan'));
  assert.equal(denied.ok, false);
  assert.deepEqual(snapshot(root), registeredFiles);
  activation.confirmation = await approvePlanning();
  put(root, 'activation.json', JSON.stringify(activation));
  const beforeActivation = snapshot(root);
  assert.equal(failure(invoke('activate', workId, '--input', 'activation.json', '--revision', 'wrong', '--plan')).error.code, 'INVALID_ARGUMENT');
  assert.equal(failure(invoke('activate', workId, '--input', 'activation.json', '--request', 'wrong', '--plan')).error.code, 'INVALID_ARGUMENT');
  assert.deepEqual(snapshot(root), beforeActivation);
  const activationPlan = success(invoke('activate', workId, '--input', 'activation.json', '--revision', activation.revision,
    '--request', activation.confirmation.requestId, '--plan'));
  const activated = success(invoke('activate', workId, '--input', 'activation.json', '--apply', activationPlan.planId));
  assert.equal(activated.changed, true);
  assert.equal(state().activePlanning.revision, activation.revision);
  const stable = snapshot(root);
  assert.equal(success(invoke('activate', workId, '--input', 'activation.json', '--apply', activationPlan.planId)).changed, false);
  assert.deepEqual(snapshot(root), stable);
  activation.operationId = 'activate-stale';
  put(root, 'activation.json', JSON.stringify(activation));
  const stale = snapshot(root);
  failure(invoke('activate', workId, '--input', 'activation.json', '--plan'));
  assert.deepEqual(snapshot(root), stale);
});

test('scoped CLI execution forwards its selection and refuses a stale execution plan', async t => {
  const root = await setup(t);
  put(root, 'test.cjs', 'process.stdout.write("observed fixture\\n");\n');
  const configPath = '.tiller/verification/config.json';
  const config = JSON.parse(readFileSync(join(root, configPath), 'utf8'));
  config.suites = [{ id: 'sample', repository: '.', command: 'node', args: ['test.cjs'], cwd: '.', timeoutMs: 5000, inputs: [ref('test.cjs')] }];
  put(root, configPath, JSON.stringify(config));
  put(root, 'execution.json', JSON.stringify({ selection: selection('test.cjs', 'execution'), workflow: { stageId: 'reproduce', actions: ['test'], confirmationRefs: [] } }));
  const before = snapshot(root);
  const planned = success(cli(root, 'verification', 'run', 'gates', '--suite', 'sample', '--input', 'execution.json', '--plan'));
  assert.deepEqual(snapshot(root), before);
  put(root, 'test.cjs', 'process.stdout.write("changed fixture\\n");\n');
  const changed = snapshot(root);
  failure(cli(root, 'verification', 'run', 'gates', '--suite', 'sample', '--input', 'execution.json', '--apply', planned.planId));
  assert.deepEqual(snapshot(root), changed);
  const fresh = success(cli(root, 'verification', 'run', 'gates', '--suite', 'sample', '--input', 'execution.json', '--plan'));
  success(cli(root, 'verification', 'run', 'gates', '--suite', 'sample', '--input', 'execution.json', '--apply', fresh.planId));
  put(root, 'report.json', JSON.stringify({ selection: selection('test.cjs', 'execution') }));
  success(cli(root, 'verification', 'report', 'gates', '--input', 'report.json'));
});

test('gate CLI rejects unsupported flags, ambiguous operations and malformed selection envelopes without writes', async t => {
  const root = await setup(t);
  put(root, 'selection.json', JSON.stringify({ selection: selection(), force: true }));
  const before = snapshot(root);
  for (const args of [
    ['work', 'plan', 'register', 'gates', '--input', 'selection.json'],
    ['work', 'plan', 'register', 'gates', '--input', 'selection.json', '--plan', '--apply', 'fake'],
    ['work', 'plan', 'register', 'gates', '--input', 'selection.json', '--plan', '--request', 'unexpected'],
    ['work', 'plan', 'unknown', 'gates'], ['work', 'task', 'start', 'gates'],
    ['verification', 'capture', 'gates', '--suite', 'wrong'],
    ['verification', 'report', 'gates', '--plan'],
    ['verification', 'report', 'gates', '--input', 'selection.json'],
  ]) {
    const result = cli(root, ...args);
    assert.equal(failure(result).error.code, 'INVALID_ARGUMENT');
    assert.equal(result.status, 2);
    assert.deepEqual(snapshot(root), before);
  }
});

test('task CLI exposes current status, preview/apply receipts and blocked verification from another directory', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  await activateTaskPlan(context);
  const { root, workId } = context;
  const caller = fixture(t);
  const invoke = (...args) => cli(caller, 'work', 'task', ...args, '--path', root);
  const original = snapshot(root);
  const status = failure(invoke('status', workId, '--task', 'foundation'));
  assert.equal(status.tasks[0].effectiveStatus, 'pending');
  assert.deepEqual(snapshot(root), original);
  const input = { operationId: 'cli-start', expectedRevision: context.revision };
  put(root, 'task.json', JSON.stringify(input));
  const before = snapshot(root);
  const preview = success(invoke('start', workId, '--task', 'foundation', '--input', 'task.json', '--plan'));
  assert.equal(preview.technicalReady, false);
  assert.deepEqual(snapshot(root), before);
  const started = success(invoke('start', workId, '--task', 'foundation', '--input', 'task.json', '--apply', preview.planId));
  assert.equal(started.changed, true);
  const historical = success(invoke('start', workId, '--task', 'foundation', '--input', 'task.json', '--apply', preview.planId));
  assert.equal(historical.historicalReceipt, true);
  assert.equal(historical.currentValidity, 'not-evaluated');
  put(root, 'task.json', JSON.stringify({ operationId: 'cli-verify', expectedRevision: started.revision, attemptId: started.attemptId }));
  const stable = snapshot(root);
  const denied = failure(invoke('verify', workId, '--task', 'foundation', '--input', 'task.json', '--plan'));
  assert.equal(denied.operationAllowed, false);
  assert.ok(denied.blockingReasons.some(issue => issue.code === 'ARTIFACT_MISSING'));
  assert.deepEqual(snapshot(root), stable);
  assert.equal(failure(invoke('status', workId, '--task', 'foundation')).tasks[0].effectiveStatus, 'active');
  for (const args of [
    ['status', workId, '--input', 'task.json'],
    ['start', workId, '--input', 'task.json', '--plan'],
    ['resume', workId, '--task', 'foundation', '--input', 'task.json', '--plan', '--apply', 'x'],
  ]) assert.equal(failure(invoke(...args)).error.code, 'INVALID_ARGUMENT');
});

test('delivery CLI reports prerequisite gaps and refuses unready receipts without writes', async t => {
  const root = await setup(t); const caller = fixture(t);
  const invoke = (...args) => cli(caller, 'work', ...args, '--path', root);
  put(root, 'delivery.json', JSON.stringify({ operationId: 'ready', expected: await readWorkflowControlSnapshot(root, 'gates') }));
  const before = snapshot(root);
  const checked = failure(invoke('delivery-check', 'gates'));
  assert.equal(checked.processEvidence.status, 'gap');
  assert.equal(checked.acceptance.status, 'not-requested');
  assert.ok(checked.issues.length > 0);
  assert.equal(checked.technicalReady, false);
  const preview = failure(invoke('delivery-ready', 'gates', '--input', 'delivery.json', '--plan'));
  assert.equal(preview.operationAllowed, false);
  assert.equal(failure(invoke('delivery-ready', 'gates', '--input', 'delivery.json', '--apply', preview.planId)).error.code, 'DELIVERY_BLOCKED');
  for (const args of [
    ['delivery-check', 'gates', '--plan'],
    ['delivery-ready', 'gates', '--input', 'delivery.json'],
    ['delivery-ready', 'gates', '--input', 'delivery.json', '--plan', '--apply', 'ambiguous'],
  ]) assert.equal(failure(invoke(...args)).error.code, 'INVALID_ARGUMENT');
  assert.deepEqual(snapshot(root), before);
});
