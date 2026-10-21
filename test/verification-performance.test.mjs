import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { initialize } from '../dist/core.js';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { WORKFLOW_FACTS, loadBuiltinWorkflows } from '../dist/workflow-catalog.js';
import {loadWorkflowPolicyContext} from '../dist/workflow-policy.js';
import { planWorkflowStageOperation, applyWorkflowStageOperation } from '../dist/workflow-stages.js';
import { verificationCategories, readVerificationInputs } from '../dist/verification-cases.js';
import {loadRepositoryInput, assertRepositoryInputCurrent} from '../dist/repository-input.js';
import {
  captureVerificationObservation, recordVerificationEvidence, evaluateVerificationSelection,
  planVerificationRun, applyVerificationRun, reportVerification, readVerificationRecords,
  loadVerificationEvaluationInput, evaluateVerificationInput, assertVerificationEvaluationInputCurrent, assertVerificationEvaluationInputsCurrent,
} from '../dist/verification-runs.js';
import { fixture, put, snapshot, gitRepository } from './helpers.mjs';
import {proveTextInputs} from '../dist/files.js';

const workId = 'verification-performance';
const workflow = { stageId: 'baseline', actions: ['read', 'write-report', 'test'], confirmationRefs: [] };
const ref = path => ({ repository: '.', path });
const categories = Object.fromEntries(verificationCategories.map(category => [
  category, { applicability: category === 'unit' ? 'applicable' : 'not-applicable', reason: 'Bounded synthetic fixture.' },
]));
const scope = { repositories: ['.'], targets: ['verification-performance'] };
test('declared repository inputs retain live file checks and detect remapping at the proof boundary', async t => {
  const root = fixture(t);
  const first = gitRepository(root, 'service');
  const second = gitRepository(root, 'repositories/service');
  await initialize({root, mode: 'workspace', repositories: ['./service']});
  put(first, 'input.txt', 'first'); put(second, 'input.txt', 'second');
  const source = await loadRepositoryInput(root, ['service']);
  const references = [{repository: 'service', path: 'input.txt'}];
  assert.deepEqual(await readVerificationInputs(root, references, source), ['first']);
  put(first, 'input.txt', 'edited');
  assert.deepEqual(await readVerificationInputs(root, references, source), ['edited']);
  await assertRepositoryInputCurrent(source);
  const metadata = JSON.parse(readFileSync(join(root, '.tiller/project.json'), 'utf8'));
  metadata.repositoryPaths.service = 'repositories/service';
  put(root, '.tiller/project.json', JSON.stringify(metadata));
  await assert.rejects(assertRepositoryInputCurrent(source), /仓库位置已变化/u);
  assert.deepEqual(await readVerificationInputs(root, references), ['second']);
  await assert.rejects(readVerificationInputs(root, [ref('input.txt')], source), /未包含/u);
});
function selection(id = 'selected', kind = 'manual') {
  return {
    caseIds: [], requirements: ['REQ-PERF'], modules: [], categories,
    reason: 'Verify this exact observation.', scenarioReason: 'Synthetic isolated verification fixture.',
    checks: [{
      id, kind, ...(kind === 'execution' ? { suite: 'runner' } : {}),
      artifactIds: ['baseline-output'], inputs: [ref(`${id}.txt`)], requirements: ['REQ-PERF'],
      categories: ['unit'], reason: 'Current content and latest attempt must match.',
    }],
  };
}
async function create(root, id = workId) {
  await createWorkflowWork(root, id, 'Verification fixture', {
    operationId: 'create-fixture', expectedRevision: 0, workflow: 'improvement',
    goal: 'Verify current evidence without relying on historical compatibility.',
    reason: 'Synthetic fixture for verification evaluation.', scope, impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])),
    basis: [{ reference: ref('spec.md'), purpose: 'Test specification.' }],
    actionSources: [{ actions: ['read', 'write-report', 'test'], reference: ref('request.md'), quote: 'Run this fixture.', scope }],
    expectedOutputs: ['baseline-output'], completionCriteria: ['Reject stale or failed observations.'],
  });
  await addWorkflowOutput(root, id, { operationId: 'output', expectedRevision: 1, outputId: 'baseline-output', source: ref('selected.txt') });
  const stage = (await loadBuiltinWorkflows()).find(item => item.id === 'improvement').definition.stages[0];
  const input = { operationId: 'start', expectedStageRevision: 0, verification: selection(), confirmationRefs: [],
    checkMappings: [{ index: 0, text: stage.checks[0], checkIds: ['selected'] }] };
  const plan = await planWorkflowStageOperation(root, id, 'baseline', 'start', input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan));
  await applyWorkflowStageOperation(root, id, 'baseline', 'start', input, plan.planId);
}
async function setup(t) {
  const root = fixture(t);
  await initialize({ root });
  put(root, 'spec.md', '# Specification\nCurrent input and latest result determine readiness.\n');
  put(root, 'request.md', '# Synthetic request\nRun this fixture.\n');
  put(root, 'selected.txt', 'selected input\n');
  put(root, 'observed.md', '# Synthetic observation\nThis fixture records an actual test API observation, not user approval.\n');
  put(root, 'runner.mjs', 'process.exit(0);\n');
  put(root, '.tiller/verification/config.json', JSON.stringify({
    schemaVersion: 1, modules: [], requirements: [{ id: 'REQ-PERF', source: ref('spec.md') }], categories,
    suites: [{ id: 'runner', repository: '.', command: 'node', args: ['runner.mjs'], cwd: '.', timeoutMs: 5000, inputs: [ref('runner.mjs')] }],
  }));
  await create(root);
  return root;
}
async function observe(root, selected = selection(), status = 'passed', id = workId) {
  const capture = await captureVerificationObservation(root, id, { selection: selected, environment: 'synthetic-observer', workflow });
  const result = await recordVerificationEvidence(root, id, {
    captureId: capture.record.id, environment: capture.record.environment,
    results: [{ checkId: selected.checks[0].id, status, evidence: ref('observed.md'), note: 'Synthetic observation after capture.' }],
  });
  return result;
}

test('declared work input proves intent sources and rejects mismatched control bytes', async t => {
  const root = await setup(t);
  const owner = await loadWorkflowPolicyContext(root, workId);
  await assert.rejects(loadVerificationEvaluationInput(root, workId, selection(), [], undefined,
    {owner: {...owner, record: {...owner.record, goal: 'Different goal'}}}), /原文/u);
  const input = await loadVerificationEvaluationInput(root, workId, selection(), [], undefined, {owner});
  put(root, 'request.md', '# Changed request\nChanged after loading the declared work input.\n');
  await assert.rejects(assertVerificationEvaluationInputCurrent(input), /变化/u);
});

test('deferred verification proofs recheck directory membership after material reads', async t => {
  for (const kind of ['history', 'definitions']) await t.test(kind, async t => {
    const root = await setup(t);
    const input = await loadVerificationEvaluationInput(root, workId, selection(), [], undefined, {history: 'selected'});
    const proofs = [];
    await assertVerificationEvaluationInputsCurrent([input], [], undefined, proofs);
    const original = fs.readFile; let added = false;
    fs.readFile = async function(file, ...args) {
      const bytes = await original.call(this, file, ...args);
      if (!added && String(file) === join(root, 'selected.txt')) {
        added = true;
        const relative = kind === 'history'
          ? `.tiller/work/${workId}/verification-runs/${randomUUID()}.json`
          : '.tiller/verification/system/late.yaml';
        put(root, relative, '{}\n'); // A member sentinel; never claimed as a valid record or case.
      }
      return bytes;
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(proveTextInputs(proofs), /目录成员.*变化/u);
      assert.equal(added, true);
    } finally {fs.readFile = original; syncBuiltinESMExports();}
  });
});

test('declared verification selections share definitions and independently prove late definition changes', async t => {
  const root = await setup(t);
  const contexts = new Map();
  const config = join(root, '.tiller/verification/config.json');
  const original = fs.readFile; let reads = 0;
  fs.readFile = async function(target, ...args) {
    if (String(target) === config) reads++;
    return original.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  try {
    const first = await loadVerificationEvaluationInput(root, workId, selection(), [], undefined, {contexts});
    const loaded = reads;
    const second = await loadVerificationEvaluationInput(root, workId, selection(), [], undefined, {contexts});
    assert.equal(reads, loaded, 'Another declared selection uses the same definition observation.');
    assert.equal(first.context, second.context);
    await assertVerificationEvaluationInputsCurrent([first, second]);
    assert.equal(reads, loaded + 1, 'The shared definitions are independently proved once at this boundary.');
    await fs.appendFile(config, '\n');
    await assert.rejects(assertVerificationEvaluationInputsCurrent([first, second]), /变化/u);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('explicit verification inputs reject a different project with the same work identity', async t => {
  const root = await setup(t);
  const input = await loadVerificationEvaluationInput(root, workId, selection());
  const other = fixture(t); await initialize({ root: other });
  await assert.rejects(evaluateVerificationSelection(other, workId, selection(), [], undefined, { inputs: input }), /不属于当前求值对象/u);
});

test('verification proof observes missing evidence becoming readable before return', async t => {
  const root = await setup(t); await observe(root);
  const original = readFileSync(join(root, 'observed.md'), 'utf8');
  await fs.unlink(join(root, 'observed.md'));
  const input = await loadVerificationEvaluationInput(root, workId, selection(), [], undefined, {history: 'selected'});
  assert.equal(evaluateVerificationInput(input).ready, false);
  await assertVerificationEvaluationInputCurrent(input);
  put(root, 'observed.md', original);
  await assert.rejects(assertVerificationEvaluationInputCurrent(input), /验证求值依据.*变化/u);
});

test('explicit verification input proof detects authorization changed after loading', async t => {
  const root = await setup(t);
  await observe(root);
  const input = await loadVerificationEvaluationInput(root, workId, selection());
  assert.equal(evaluateVerificationInput(input).ready, true);
  put(root, 'request.md', '# Withdrawn\nThis fixture is no longer authorized.\n');
  await assert.rejects(assertVerificationEvaluationInputCurrent(input), /授权.*变化/u);
});

test('verification post-commit authorization proof rolls back only its own unchanged receipt', async t => {
  for (const externalEdit of [false, true]) await t.test(`external receipt edit: ${externalEdit}`, async t => {
    const root = await setup(t);
    const nativeUnlink = fs.unlink; let changed = false; let receipt;
    fs.unlink = async function(target, ...args) {
      const result = await nativeUnlink.call(this, target, ...args);
      if (!changed && String(target) === join(root, '.tiller/local/transaction.json')) {
        changed = true;
        const directory = join(root, `.tiller/work/${workId}/verification-runs`);
        const names = await fs.readdir(directory);
        assert.equal(names.length, 1);
        receipt = join(directory, names[0]);
        put(root, 'request.md', '# Withdrawn\nAuthorization changed after commit.\n');
        if (externalEdit) await fs.writeFile(receipt, 'External receipt edit must survive.\n');
      }
      return result;
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(captureVerificationObservation(root, workId, {
        selection: selection(), environment: 'synthetic-observer', workflow,
      }));
    } finally { fs.unlink = nativeUnlink; syncBuiltinESMExports(); }
    assert.equal(changed, true);
    if (externalEdit) assert.equal(await fs.readFile(receipt, 'utf8'), 'External receipt edit must survive.\n');
    else await assert.rejects(fs.access(receipt), {code: 'ENOENT'});
    assert.match(await fs.readFile(join(root, 'request.md'), 'utf8'), /Authorization changed after commit/u);
    await assert.rejects(fs.access(join(root, '.tiller/local/transaction.json')), {code: 'ENOENT'});
  });
});
function decisionView(result) {
  const { runs: _runs, historyScope: _historyScope, ...decision } = result;
  return decision;
}
async function both(root, selected = selection(), refs = [], artifacts) {
  const full = await evaluateVerificationSelection(root, workId, selected, refs, artifacts);
  const limited = await evaluateVerificationSelection(root, workId, selected, refs, artifacts, { history: 'selected' });
  assert.deepEqual(decisionView(limited), decisionView(full));
  return { full, limited };
}
function evidenceRef(record, id = workId) {
  return { workId: id, runId: record.id, checkId: 'selected', environment: record.environment };
}

test('verification history selection preserves current inputs, evidence, artifact coverage and basis', async t => {
  const root = await setup(t);
  const observed = await observe(root);
  const digest = createHash('sha256').update('selected input\n').digest('hex');
  const artifacts = { 'baseline-output': { '.::selected.txt': digest } };
  assert.equal((await both(root, selection(), [], artifacts)).limited.ready, true);
  assert.equal((await evaluateVerificationSelection(root, workId, selection(), [], artifacts, {
    history: 'selected', workflow: { stageId: 'baseline', attemptId: observed.record.authorization.attemptId },
  })).ready, true, 'Stage evidence remains valid for its actual stage attempt.');
  const before = snapshot(root);
  const task = await evaluateVerificationSelection(root, workId, selection(), [], artifacts, { history: 'selected', taskId: 'unstarted-task' });
  assert.equal(task.ready, false, 'Stage-only evidence cannot satisfy a task consumer without task authorization.');
  assert.equal(task.checks[0].status, 'stale');
  assert.deepEqual(snapshot(root), before);
  put(root, 'selected.txt', 'changed input\n');
  assert.equal((await both(root)).limited.checks[0].status, 'stale');
  put(root, 'selected.txt', 'selected input\n');
  assert.equal((await both(root, selection(), [], { 'baseline-output': { '.::selected.txt': '0'.repeat(64) } })).limited.ready, false);
  put(root, 'observed.md', '# Changed observation\nThe recorded evidence is no longer current.\n');
  assert.equal((await both(root)).limited.checks[0].status, 'stale');
});

test('verification history selection never hides newer failed skipped unrun or explicitly older observations', async t => {
  const root = await setup(t);
  const original = await observe(root);
  for (const status of ['failed', 'skipped', 'not-run']) {
    await observe(root, selection(), status);
    assert.equal((await both(root)).limited.checks[0].status, status);
  }
  await observe(root);
  await captureVerificationObservation(root, workId, { selection: selection(), environment: 'synthetic-observer', workflow });
  assert.equal((await both(root)).limited.checks[0].status, 'not-run');
  const current = await observe(root);
  assert.equal((await both(root, selection(), [evidenceRef(original.record)])).limited.checks[0].status, 'stale');
  for (const history of ['all', 'selected']) {
    await assert.rejects(evaluateVerificationSelection(root, workId, selection(), [
      { ...evidenceRef(current.record), environment: 'wrong-observer' },
    ], undefined, { history }), /环境/);
  }
});

test('verification history selection preserves the latest failed execution', async t => {
  const root = await setup(t);
  const selected = selection('selected', 'execution');
  let plan = await planVerificationRun(root, workId, 'runner', selected, workflow);
  await applyVerificationRun(root, workId, 'runner', plan.planId, selected, workflow);
  assert.equal((await both(root, selected)).limited.ready, true);
  put(root, 'runner.mjs', 'process.exit(9);\n');
  plan = await planVerificationRun(root, workId, 'runner', selected, workflow);
  const failed = await applyVerificationRun(root, workId, 'runner', plan.planId, selected, workflow);
  assert.equal(failed.record.execution.exitCode, 9);
  assert.equal((await both(root, selected)).limited.checks[0].status, 'failed');
});

test('verification history selection retains strict parsing of unrelated history and cross-work ordering', async t => {
  const root = await setup(t);
  await create(root, 'external-verification');
  const external = await observe(root, selection(), 'passed', 'external-verification');
  const refs = [evidenceRef(external.record, 'external-verification')];
  assert.equal((await both(root, selection(), refs)).limited.ready, true);
  const beforeTask = snapshot(root);
  const task = await evaluateVerificationSelection(root, workId, selection(), refs, undefined, { history: 'selected', taskId: 'unstarted-task' });
  assert.equal(task.ready, false, 'External stage-only evidence cannot satisfy the current work task.');
  assert.equal(task.checks[0].status, 'stale');
  assert.deepEqual(snapshot(root), beforeTask);
  await observe(root, selection(), 'failed', 'external-verification');
  assert.equal((await both(root, selection(), refs)).limited.ready, false);
  await observe(root);
  for (const history of ['all', 'selected']) {
    await assert.rejects(evaluateVerificationSelection(root, workId, selection(), refs, undefined, { history }), /均有尝试/);
  }
  put(root, 'unrelated.txt', 'unrelated input\n');
  const unrelated = await observe(root, selection('unrelated'));
  const location = join(root, unrelated.path);
  const malformed = JSON.parse(readFileSync(location, 'utf8'));
  malformed.schemaVersion = 999;
  await fs.writeFile(location, JSON.stringify(malformed));
  const before = snapshot(root);
  for (const history of ['all', 'selected']) {
    await assert.rejects(evaluateVerificationSelection(root, workId, selection(), [], undefined, { history }));
  }
  assert.deepEqual(snapshot(root), before);
});

async function inputReads(root, run) {
  const original = fs.readFile;
  const reads = [];
  fs.readFile = async function (path, ...args) {
    if (typeof path === 'string' && path.startsWith(root) && /unrelated-[0-9]+\.txt$/u.test(path)) reads.push(resolve(path));
    return original.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try { return { result: await run(), reads }; }
  finally { fs.readFile = original; syncBuiltinESMExports(); }
}

function reportDefinition(id = 'CASE-CURRENT', title = 'Current report') {
  return `schema_version: 1\ncases:\n  - id: ${id}\n    title: ${title}\n    modules: []\n    categories: [unit]\n    requirements: [REQ-PERF]\n    given: [Current input]\n    when: [Inspect report]\n    then: [Read current content]\n    automation:\n      suite: runner\n      test_ref: ${title}\n      source:\n        repository: .\n        path: runner.mjs\n`;
}

test('default verification report reuses one parsed definition scan and proves its bytes', async t => {
  const root = await setup(t);
  const file = put(root, '.tiller/verification/system/current.yaml', reportDefinition());
  const config = readFileSync(join(root, '.tiller/verification/config.json'), 'utf8');
  const original = fs.readFile; const parse = JSON.parse; let reads = 0; let parses = 0;
  fs.readFile = async function (target, ...args) {
    if (String(target) === file) reads++;
    return original.call(this, target, ...args);
  };
  JSON.parse = function(value, ...args) {
    if (value === config) parses++;
    return parse.call(this, value, ...args);
  };
  syncBuiltinESMExports();
  try {
    const result = await reportVerification(root, workId);
    assert.equal(result.cases.length, 1);
    assert.equal(result.cases[0].status, 'not-run');
    assert.ok(reads <= 2, `A definition needs one load and one final byte proof, got ${reads}`);
    assert.equal(parses, 1, 'A final byte proof must not parse the entire directory again.');
  } finally { fs.readFile = original; JSON.parse = parse; syncBuiltinESMExports(); }
});

for (const mutation of ['content', 'member', 'config']) test(`readonly verification rejects definition ${mutation} changes after its initial read`, async t => {
  const root = await setup(t);
  const file = put(root, '.tiller/verification/system/current.yaml', reportDefinition());
  const original = fs.readFile; let changed = false;
  fs.readFile = async function(target, ...args) {
    const value = await original.call(this, target, ...args);
    if (!changed && String(target) === file) {
      changed = true;
      if (mutation === 'content') put(root, '.tiller/verification/system/current.yaml', reportDefinition('CASE-CURRENT', 'Changed report'));
      else if (mutation === 'member') put(root, '.tiller/verification/system/added.yaml', reportDefinition('CASE-ADDED', 'Added report'));
      else {
        const config = JSON.parse(readFileSync(join(root, '.tiller/verification/config.json'), 'utf8'));
        config.categories.unit.reason = 'Changed after the initial config read.';
        put(root, '.tiller/verification/config.json', JSON.stringify(config));
      }
    }
    return value;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(reportVerification(root, workId), /验证定义|目录成员/u);
    assert.equal(changed, true);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('one selection loads unique input material and independent evaluations read current data', async t => {
  const root = await setup(t); const original = fs.readFile;
  const input = join(root, 'selected.txt'); let reads = 0;
  fs.readFile = async function (target, ...args) {
    if (String(target) === input) reads++;
    return original.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  const selected = selection();
  const many = { ...selected, checks: Array.from({ length: 12 }, (_, index) => ({ ...selected.checks[0], id: `shared-${index}` })) };
  try {
    await evaluateVerificationSelection(root, workId, selected, [], undefined, { history: 'selected' });
    const single = reads; reads = 0;
    const first = await evaluateVerificationSelection(root, workId, many, [], undefined, { history: 'selected' });
    assert.equal(first.checks.length, 12);
    assert.ok(reads <= single * 2, `Shared input reads grew with checks: one=${single}, twelve=${reads}`);
    t.diagnostic(`Shared input reads: one check=${single}, twelve checks=${reads}`);
    put(root, 'selected.txt', 'Changed for the next independent evaluation.\n');
    const next = await evaluateVerificationSelection(root, workId, many, [], undefined, { history: 'selected' });
    assert.notEqual(next.basisDigest, first.basisDigest);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('selection input verification rejects changes while later inputs load', async t => {
  const root = await setup(t); const original = fs.readFile;
  const later = put(root, 'later.txt', 'Later check input.\n'); let changed = false;
  const selected = selection();
  selected.checks.push({ ...selected.checks[0], id: 'later', inputs: [ref('selected.txt'), ref('later.txt')] });
  fs.readFile = async function (target, ...args) {
    const value = await original.call(this, target, ...args);
    if (!changed && String(target) === later) {
      changed = true;
      put(root, 'selected.txt', 'Changed after the first input was loaded.\n');
    }
    return value;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(evaluateVerificationSelection(root, workId, selected, [], undefined, { history: 'selected' }), /验证求值依据.*变化/u);
    assert.equal(changed, true);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('input loading enforces text validation even when the same path is also binary', async t => {
  const root = await setup(t);
  put(root, 'raw.bin', Buffer.from([0, 255, 1]));
  const selected = selection();
  selected.checks = [
    { ...selected.checks[0], id: 'binary', inputs: [{ ...ref('raw.bin'), binary: true, provenance: ref('spec.md') }] },
    { ...selected.checks[0], id: 'text', inputs: [ref('raw.bin')] },
  ];
  await assert.rejects(evaluateVerificationSelection(root, workId, selected, [], undefined, { history: 'selected' }), /UTF-8/u);
});

test('each binding retains its aggregate size limit after unique input loading', async t => {
  const root = await setup(t);
  for (const name of ['first.bin', 'second.bin']) {
    put(root, name, ''); await fs.truncate(join(root, name), 33 * 1024 * 1024);
  }
  const first = { ...ref('first.bin'), binary: true, provenance: ref('spec.md') };
  const second = { ...ref('second.bin'), binary: true, provenance: ref('spec.md') };
  const selected = selection();
  selected.checks = [
    { ...selected.checks[0], id: 'first', inputs: [first] },
    { ...selected.checks[0], id: 'second', inputs: [second] },
    { ...selected.checks[0], id: 'both', inputs: [first, second] },
  ];
  await assert.rejects(evaluateVerificationSelection(root, workId, selected, [], undefined, { history: 'selected' }), /容量/u);
});

test('verification history performance: selected evaluation does not reread unrelated historical inputs', async t => {
  const root = await setup(t);
  await observe(root);
  for (let index = 0; index < 4; index++) {
    put(root, `unrelated-${index}.txt`, 'unrelated input\n');
    await observe(root, selection(`unrelated-${index}`));
  }
  put(root, 'unrelated-0.txt', 'changed unrelated input\n');
  const full = await inputReads(root, () => reportVerification(root, workId, selection()));
  const limited = await inputReads(root, () => evaluateVerificationSelection(root, workId, selection(), [], undefined, { history: 'selected' }));
  assert.deepEqual(decisionView(limited.result), decisionView(full.result));
  assert.equal(full.result.ready, true);
  assert.ok(full.result.runs.some(run => run.stale));
  assert.equal(new Set(full.reads).size, 4, 'Full reports must inspect every unrelated historical input.');
  assert.equal(limited.reads.length, 0, 'Internal selected evaluation must not reread unrelated historical input bytes.');
  assert.equal(limited.result.historyScope, 'selected');
  assert.deepEqual(limited.result.runs, [], 'Omitted history must not be represented as freshly checked.');
});

test('explicit verification input evaluates repeatedly without additional reads', async t => {
  const root = await setup(t);
  await observe(root);
  const input = await loadVerificationEvaluationInput(root, workId, selection(), [], undefined, { history: 'selected' });
  const originalRead = fs.readFile;
  let reads = 0;
  fs.readFile = async function (...args) { reads++; return originalRead.apply(this, args); };
  syncBuiltinESMExports();
  try {
    for (let use = 0; use < 3; use++) assert.equal(evaluateVerificationInput(input).ready, true);
    assert.equal(reads, 0, 'Pure evaluation must not read files.');
    put(root, 'selected.txt', 'Changed after the explicitly loaded input.\n');
    await assert.rejects(assertVerificationEvaluationInputCurrent(input), /变化/u);
  } finally { fs.readFile = originalRead; syncBuiltinESMExports(); }
  assert.equal((await reportVerification(root, workId, selection())).checks[0].status, 'stale');
});

test('historical record queries perform no Git ignore checks', async t => {
  const root = await setup(t);
  gitRepository(root, '.');
  await observe(root);
  const trace = join(root, '.tiller/local/record-git-trace.jsonl');
  const previous = process.env.GIT_TRACE2_EVENT;
  async function count() {
    await fs.writeFile(trace, '');
    process.env.GIT_TRACE2_EVENT = trace;
    const records = await readVerificationRecords(root, workId);
    const calls = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(event => event.event === 'start').length;
    return { records, calls };
  }
  try {
    const first = await count();
    await observe(root);
    await observe(root);
    const more = await count();
    assert.equal(first.records.length, 2);
    assert.equal(more.records.length, 6);
    assert.equal(first.calls, 0);
    assert.equal(more.calls, 0, 'Reading history does not check Git ignore state.');
    t.diagnostic(`History guard Git calls: two records=${first.calls}, six records=${more.calls}`);
    const originalRead = fs.readFile;
    let changed = false;
    fs.readFile = async function (path, ...args) {
      const bytes = await originalRead.call(this, path, ...args);
      if (!changed && String(path).replaceAll('\\', '/').includes(`/verification-runs/${more.records[0].id}.json`)) {
        changed = true;
        put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + `\n/.tiller/work/${workId}/verification-runs/${more.records[0].id}.json\n`);
      }
      return bytes;
    };
    syncBuiltinESMExports();
    try {
      assert.equal((await readVerificationRecords(root, workId)).length, more.records.length);
      assert.equal(changed, true);
    } finally {
      fs.readFile = originalRead;
      syncBuiltinESMExports();
    }
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
});
