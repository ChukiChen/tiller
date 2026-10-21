import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, rm, symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { loadWorkRecord, parseWorkRecord, resumeWork } from '../dist/work.js';
import { inspectWork } from '../dist/work-history.js';
import {
  createWorkflowWork, addWorkflowOutput, resumeWorkflowWork, readWorkflowReference,
  parseWorkflowWorkInput, parseWorkflowWorkRecord, parseWorkflowOutputInput, WORKFLOW_WORK_LIMITS,
  parseWorkflowLink, prepareWorkflowWorkIntent, serializeWorkflowWorkRecord, loadWorkflowSnapshot, readWorkflowControlText,
} from '../dist/workflow-work.js';
import { WORKFLOW_FACTS, loadBuiltinWorkflows, createWorkflowSnapshot } from '../dist/workflow-catalog.js';
import { fixture, put, snapshot, gitRepository, cli, success, failure } from './helpers.mjs';

const ref = path => ({ repository: '.', path });
const base = id => `.tiller/work/${id}`;
const allFalse = Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readRecord = (root, id = 'typed') => JSON.parse(readFileSync(join(root, base(id), 'record.json'), 'utf8'));
function intent(id = 'typed', extra = {}) {
  return {
    operationId: 'create-one', expectedRevision: 0, workflow: 'analysis',
    goal: '查明实际原因并提供证据。', reason: '请求只涉及分析。',
    scope: { repositories: ['.'], targets: [id] }, impact: {},
    basis: [{ reference: ref('basis.md'), purpose: '已有问题描述。' }],
    actionSources: [{
      actions: ['read', 'write-report'], reference: ref('request.md'), quote: 'Analyze within this scope.',
      scope: { repositories: ['.'], targets: [id] },
    }],
    expectedOutputs: ['report-output'], completionCriteria: ['明确证据、原因及不确定性。'], ...extra,
  };
}
async function project(t) {
  const root = fixture(t); await initialize({ root });
  put(root, 'basis.md', '# 已有现象\n可重复观察到问题。\n');
  put(root, 'request.md', '# Synthetic request\nAnalyze within this scope.\n');
  return root;
}
function output(extra = {}) {
  return { operationId: 'output-one', expectedRevision: 1, outputId: 'report-output', content: '# 分析报告\n证据支持原因，保留明确限制。\n', ...extra };
}
const errorCode = code => error => error.code === code;

test('typed records: explicit workflow creates a pinned version4 intent without fabricated specifications', async t => {
  const root = await project(t);
  const result = await createWorkflowWork(root, 'typed', '分析现象', intent());
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.revision, 1);
  assert.equal(result.authorization, 'not-evaluated');
  assert.equal(result.goal, intent().goal);
  assert.deepEqual(result.scope, intent().scope);
  assert.equal(result.actionSources[0].quote, intent().actionSources[0].quote);
  const record = readRecord(root);
  assert.equal(record.workflow.id, 'analysis');
  assert.equal(record.workflowRevision, 1);
  assert.deepEqual(record.links, []);
  assert.deepEqual(record.artifacts, {});
  assert.ok(existsSync(join(root, record.workflow.path)));
  assert.equal(existsSync(join(root, base('typed'), 'requirements.md')), false);
  assert.equal(existsSync(join(root, base('typed'), 'design.md')), false);
  assert.deepEqual(record.impact, Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, 'unknown'])));
  assert.equal(record.actionSources[0].sha256, hash(readFileSync(join(root, 'request.md'))));
  assert.match(readFileSync(join(root, base('typed'), 'work.md'), 'utf8'), /未交付、未验收/);
  const resumed = await resumeWork(root, 'typed');
  assert.equal(resumed.schemaVersion, 4);
  assert.equal(resumed.ready, false);
  assert.equal(resumed.registrationReady, true);
  assert.equal(resumed.authorization, 'not-evaluated');
  assert.deepEqual(resumed.unknownImpact, [...WORKFLOW_FACTS]);
  assert.ok(resumed.missingOutputs.includes('report-output'));
  assert.equal(resumed.stageExecution, 'not-evaluated');
  assert.equal(resumed.basis[0].reference.path, 'basis.md');
  assert.equal(resumed.actionSources[0].reference.path, 'request.md');
});

for (const [label, mutate] of [
  ['missing workflow', value => { delete value.workflow; }],
  ['template instead of workflow', value => { value.workflow = 'change-requirements'; }],
  ['legacy type escape', value => { delete value.workflow; value.type = 'change-requirements'; }],
  ['unknown field', value => { value.approved = true; }],
  ['unknown impact', value => { value.impact.risk = false; }],
  ['string false', value => { value.impact.production = 'false'; }],
  ['missing scope', value => { delete value.scope; }],
  ['empty objective', value => { value.goal = ' '; }],
  ['unknown expected output', value => { value.expectedOutputs = ['missing']; }],
  ['missing expected output', value => { value.expectedOutputs = []; }],
  ['invalid operation', value => { value.operationId = '../escape'; }],
  ['nonzero initial revision', value => { value.expectedRevision = 1; }],
  ['false quote', value => { value.actionSources[0].quote = 'Never actually said'; }],
  ['scope escalation', value => { value.actionSources[0].scope.targets.push('other'); }],
  ['unknown action', value => { value.actionSources[0].actions = ['shell']; }],
  ['project candidate without activation', value => { value.workflow = 'project.audit'; }],
]) test(`typed create rejects ${label} without shared writes`, async t => {
  const root = await project(t); const value = intent(); mutate(value);
  const before = snapshot(root);
  await assert.rejects(createWorkflowWork(root, 'typed', '检查拒绝', value));
  assert.deepEqual(snapshot(root), before);
});

test('typed records: all eleven builtins retain their own output and completion contracts', async t => {
  const root = await project(t);
  for (const selected of await loadBuiltinWorkflows()) {
    const id = `typed-${selected.id}`;
    const value = intent(id, { workflow: selected.id, expectedOutputs: selected.definition.completion.requiredOutputs, impact: allFalse });
    await createWorkflowWork(root, id, selected.definition.title, value);
    const loaded = await loadWorkRecord(root, id);
    assert.equal(loaded.record.schemaVersion, 4);
    assert.equal(loaded.record.workflow.digest, selected.digest);
    assert.deepEqual(loaded.record.artifacts, {});
    assert.equal((await resumeWorkflowWork(root, id)).ready, false);
  }
  assert.equal((await inspectWork(root)).works.length, 11);
});

test('typed records: create retry is immutable history and conflicting operation input is rejected', async t => {
  const root = await project(t); const value = intent();
  await createWorkflowWork(root, 'typed', '分析', value);
  const before = snapshot(root);
  const repeated = await createWorkflowWork(root, 'typed', '分析', value);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.historical, true);
  assert.equal(repeated.currentValidity, 'not-evaluated');
  assert.deepEqual(snapshot(root), before);
  await assert.rejects(createWorkflowWork(root, 'typed', '修改目标', value), errorCode('OPERATION_CONFLICT'));
  await assert.rejects(createWorkflowWork(root, 'typed', '分析', { ...value, operationId: 'create-other' }), errorCode('WORK_EXISTS'));
  assert.deepEqual(snapshot(root), before);
});

test('typed outputs: generated analysis and referenced source register without execution or acceptance', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  const created = await addWorkflowOutput(root, 'typed', output());
  assert.equal(created.revision, 2);
  assert.equal(created.source.path, `${base('typed')}/analysis.md`);
  assert.equal(created.status, 'draft');
  put(root, 'observation.ts', 'export const observed = true;\n');
  await addWorkflowOutput(root, 'typed', { operationId: 'source-two', expectedRevision: 2, outputId: 'evidence-output', source: ref('observation.ts') });
  const resumed = await resumeWorkflowWork(root, 'typed');
  assert.equal(resumed.artifacts['evidence-output'].registeredHash, hash('export const observed = true;\n'));
  assert.equal(resumed.artifacts['report-output'].changedSinceRegistration, false);
  assert.equal(resumed.ready, false);
  assert.equal(resumed.acceptanceStatus, 'not-evaluated');
  assert.equal((await inspectWork(root, 'typed')).ready, true);
  put(root, `${base('typed')}/analysis.md`, '# 修订报告\n后续补充了证据。\n');
  assert.equal((await resumeWork(root, 'typed')).artifacts['report-output'].changedSinceRegistration, true);
});

test('typed output retries preserve revisions and reject same id with different bytes or stale revisions', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  const value = output(); await addWorkflowOutput(root, 'typed', value);
  const before = snapshot(root);
  assert.equal((await addWorkflowOutput(root, 'typed', value)).historical, true);
  await assert.rejects(addWorkflowOutput(root, 'typed', { ...value, content: '# Changed\nDifferent bytes.\n' }), errorCode('OPERATION_CONFLICT'));
  await assert.rejects(addWorkflowOutput(root, 'typed', { ...value, operationId: 'output-two', outputId: 'scope-output' }), errorCode('REVISION_CONFLICT'));
  await assert.rejects(addWorkflowOutput(root, 'typed', { ...value, operationId: 'output-two', expectedRevision: 2 }), errorCode('ARTIFACT_CONFLICT'));
  await assert.rejects(addWorkflowOutput(root, 'typed', { ...value, operationId: 'create-one', expectedRevision: 2 }), errorCode('OPERATION_CONFLICT'));
  assert.deepEqual(snapshot(root), before);
  await rm(join(root, base('typed'), 'analysis.md'));
  const replay = await addWorkflowOutput(root, 'typed', value);
  assert.equal(replay.currentValidity, 'not-evaluated');
  assert.equal((await resumeWorkflowWork(root, 'typed')).registrationReady, false);
});

test('typed sources: changed or deleted basis is reported without rebinding hashes or authority', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  const original = readFileSync(join(root, base('typed'), 'record.json'));
  put(root, 'request.md', '# Changed\nDifferent request.\n');
  await rm(join(root, 'basis.md'));
  const resumed = await resumeWorkflowWork(root, 'typed');
  assert.equal(resumed.sourceIssues.length, 2);
  assert.equal(resumed.registrationReady, false);
  assert.equal(resumed.authorization, 'not-evaluated');
  assert.deepEqual(readFileSync(join(root, base('typed'), 'record.json')), original);
  assert.equal((await createWorkflowWork(root, 'typed', '分析', intent())).currentValidity, 'not-evaluated');
});

test('typed snapshots: corrupt missing or substituted definition never falls back to catalog', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  const record = readRecord(root); const saved = await readFile(join(root, record.workflow.path));
  const replacement = JSON.parse(saved); replacement.definition.title = 'silent change';
  await writeFile(join(root, record.workflow.path), JSON.stringify(replacement));
  await assert.rejects(resumeWork(root, 'typed'), /摘要不匹配/);
  await assert.rejects(addWorkflowOutput(root, 'typed', output()), /摘要不匹配/);
  assert.equal((await inspectWork(root, 'typed')).ready, false);
  await rm(join(root, record.workflow.path));
  await assert.rejects(resumeWorkflowWork(root, 'typed'), errorCode('WORKFLOW_SNAPSHOT_MISSING'));
  await writeFile(join(root, record.workflow.path), saved);
  assert.equal((await resumeWorkflowWork(root, 'typed')).workflow.digest, record.workflow.digest);
});

test('typed generation: templates are separate and missing approval cannot generate gated design', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '开发目标', intent('typed', { workflow: 'feature', expectedOutputs: ['requirements-output'], impact: allFalse }));
  await addWorkflowOutput(root, 'typed', { operationId: 'requirements-one', expectedRevision: 1, outputId: 'requirements-output', template: 'change-requirements' });
  assert.equal(readRecord(root).artifacts['requirements-output'].template, 'change-requirements');
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'typed', { operationId: 'design-one', expectedRevision: 2, outputId: 'design-output', template: 'change-design' }), errorCode('WORKFLOW_POLICY_REQUIRED'));
  assert.deepEqual(snapshot(root), before);
});

test('typed generation: semantic uncertainty blocks editing while explicit no-change documentation can be drafted', async t => {
  const root = await project(t);
  put(root, 'request.md', 'Edit the declared documents within this scope.\n');
  const documentation = (id, impact = {}) => {
    const value = intent(id, { workflow: 'documentation', expectedOutputs: ['draft-output'], impact });
    value.actionSources[0].actions = ['read', 'edit-documents'];
    value.actionSources[0].quote = 'Edit the declared documents within this scope.';
    return value;
  };
  await createWorkflowWork(root, 'unknown', '文案', documentation('unknown'));
  await assert.rejects(addWorkflowOutput(root, 'unknown', output({ outputId: 'draft-output' })),
    error => error.code === 'WORKFLOW_POLICY_REQUIRED' && error.message.includes('前置条件未知'));
  await createWorkflowWork(root, 'wording', '文案', documentation('wording', allFalse));
  await addWorkflowOutput(root, 'wording', output({ outputId: 'draft-output' }));
  await createWorkflowWork(root, 'semantic', '规则', documentation('semantic', { ...allFalse, semanticChange: true }));
  await assert.rejects(addWorkflowOutput(root, 'semantic', output({ outputId: 'draft-output' })), errorCode('WORKFLOW_POLICY_REQUIRED'));
});

for (const path of [
  '../escape.md', 'C:/escape.md', '.git/config', '.tiller/local/secret.md', '.tiller/project.json',
  '.tiller/work/typed/record.json', '.tiller/work/typed/work.md', '.tiller/work/typed/confirmations.json',
  '.tiller/work/typed/workflow/definitions/a.json', '.tiller/work/typed/stages/events.json', '.tiller/work/typed/transitions/change.json',
]) test(`typed output rejects unsafe or control reference ${path}`, async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'typed', { operationId: 'ref-one', expectedRevision: 1, outputId: 'report-output', source: ref(path) }));
  assert.deepEqual(snapshot(root), before);
});

test('typed outputs: existing files duplicate targets and missing references preserve original bytes', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  put(root, `${base('typed')}/analysis.md`, '# Existing\nPreserve original text.\n');
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'typed', output()), errorCode('ARTIFACT_CONFLICT'));
  await assert.rejects(addWorkflowOutput(root, 'typed', { operationId: 'ref-one', expectedRevision: 1, outputId: 'report-output', source: ref('missing.txt') }), errorCode('ARTIFACT_MISSING'));
  assert.deepEqual(snapshot(root), before);
  await addWorkflowOutput(root, 'typed', { operationId: 'ref-one', expectedRevision: 1, outputId: 'report-output', source: ref(`${base('typed')}/analysis.md`) });
  const after = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'typed', { operationId: 'ref-two', expectedRevision: 2, outputId: 'scope-output', source: ref(`${base('typed')}/analysis.md`) }), errorCode('ARTIFACT_CONFLICT'));
  assert.deepEqual(snapshot(root), after);
});

test('typed boundaries: stable repository identity applies to non-Markdown source outputs', async t => {
  const root = fixture(t); gitRepository(root, 'repositories/repo-a');
  await initialize({ root, mode: 'workspace', repositories: ['repositories/repo-a'] });
  put(root, 'basis.md', '# Basis\nA scope.\n'); put(root, 'request.md', '# Request\nAnalyze within this scope.\n');
  put(root, 'repositories/repo-a/evidence.ts', 'export const value = 1;\n');
  const input = intent('typed', { scope: { repositories: ['.', 'repo-a'], targets: ['typed'] } });
  await createWorkflowWork(root, 'typed', '多仓库', input);
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'typed', { operationId: 'bad', expectedRevision: 1, outputId: 'report-output', source: ref('repositories/repo-a/evidence.ts') }), /稳定仓库/);
  assert.deepEqual(snapshot(root), before);
  await addWorkflowOutput(root, 'typed', { operationId: 'good', expectedRevision: 1, outputId: 'report-output', source: { repository: 'repo-a', path: 'evidence.ts' } });
  assert.equal((await inspectWork(root, 'typed')).ready, true);
});

test('typed boundaries: unsafe references are rejected and ordinary reads allow ignored files', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  put(root, 'original.txt', 'original\n');
  await link(join(root, 'original.txt'), join(root, 'hard.txt'));
  await assert.rejects(readWorkflowReference(root, ref('hard.txt')), /硬链接/);
  await symlink(join(root, base('typed')), join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readWorkflowReference(root, ref('linked/work.md')), /符号链接/);
  await writeFile(join(root, 'invalid.txt'), Buffer.from([0xff]));
  await assert.rejects(readWorkflowReference(root, ref('invalid.txt')), /UTF-8/);
  await writeFile(join(root, 'large.txt'), Buffer.alloc(WORKFLOW_WORK_LIMITS.referenceBytes + 1));
  await assert.rejects(readWorkflowReference(root, ref('large.txt')), /大小/);
  gitRepository(root, '.');
  put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + '\nignored.txt\n');
  put(root, 'ignored.txt', 'not shared\n');
  assert.equal(await readWorkflowReference(root, ref('ignored.txt')), 'not shared\n');
});

test('typed parsers: strict version fields revisions artifact identities and sizes are rejected', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  await addWorkflowOutput(root, 'typed', output());
  const good = readRecord(root);
  for (const mutate of [
    value => { value.approved = true; }, value => { value.revision++; },
    value => { delete value.workflowRevision; }, value => { delete value.links; },
    value => { value.workflowRevision = 2; },
    value => { value.operations[1].operationId = value.operations[0].operationId; },
    value => { value.workflow.path = '.tiller/local/fake.json'; },
    value => { value.workflow.digest = 'bad'; },
    value => { delete value.impact.production; }, value => { value.artifacts['report-output'].status = 'complete'; },
    value => { value.artifacts['report-output'].registeredHash = 'bad'; },
    value => { value.artifacts['report-output'].source = ref('other.md'); },
    value => { value.artifacts['report-output'].outputId = 'other'; },
    value => { value.createdAt = 'yesterday'; },
  ]) {
    const changed = structuredClone(good); mutate(changed);
    assert.throws(() => parseWorkflowWorkRecord(changed, 'typed'));
  }
  for (const version of [1, 2, 3, 5, '4']) assert.throws(() => parseWorkRecord(JSON.stringify({ ...good, schemaVersion: version }), 'typed'), errorCode('UNSUPPORTED_RECORD_VERSION'));
  const large = intent(); large.goal = 'x'.repeat(WORKFLOW_WORK_LIMITS.text + 1);
  assert.throws(() => parseWorkflowWorkInput(large), /大小/);
  assert.throws(() => parseWorkflowOutputInput({ ...output(), source: ref('other.md') }), /一种/);
  assert.throws(() => parseWorkflowOutputInput({ ...output(), expectedRevision: -1 }), /修订/);
});

test('typed transitions: current artifacts use the latest mapped baseline and retain operation history', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '分析', intent());
  await addWorkflowOutput(root, 'typed', output());
  const original = readRecord(root);
  const converted = structuredClone(original);
  const transitionAt = '2026-10-21T00:00:00.000Z';
  converted.revision = 3;
  converted.workflowRevision = 3;
  converted.operations.push({ operationId: 'convert-one', kind: 'workflow-change', inputDigest: hash('conversion'),
    revision: 3, at: transitionAt, mappedOutputs: ['report-output'], workflowDigest: converted.workflow.digest, changeDigest: hash('change') });
  converted.artifacts['report-output'] = { ...converted.artifacts['report-output'], origin: 'reference', registeredAt: transitionAt };
  assert.deepEqual(parseWorkflowWorkRecord(converted, 'typed').operations.slice(0, 2), original.operations);
  assert.deepEqual(JSON.parse(serializeWorkflowWorkRecord(converted)), converted);
  for (const mutate of [
    value => { value.workflowRevision = 2; },
    value => { value.operations[2].workflowDigest = hash('another definition'); },
    value => { delete value.operations[2].changeDigest; },
    value => { delete value.operations[2].mappedOutputs; },
    value => { value.operations[2].mappedOutputs = []; },
    value => { value.operations[2].mappedOutputs.push('report-output'); },
    value => { value.artifacts['report-output'].registeredAt = original.createdAt; },
    value => { value.artifacts['report-output'].origin = 'generated'; },
    value => { value.artifacts['report-output'].template = 'change-requirements'; },
    value => { value.operations[0].mappedOutputs = []; },
  ]) {
    const invalid = structuredClone(converted); mutate(invalid);
    assert.throws(() => parseWorkflowWorkRecord(invalid, 'typed'));
  }
  const replaced = structuredClone(converted);
  replaced.operations[2].mappedOutputs = [];
  replaced.artifacts = {};
  assert.deepEqual(parseWorkflowWorkRecord(replaced, 'typed').artifacts, {});
  replaced.revision++;
  const registeredAt = '2026-10-21T00:00:01.000Z';
  replaced.operations.push({ operationId: 'output-again', kind: 'output-add', revision: 4, at: registeredAt, inputDigest: hash('new output'), outputId: 'report-output' });
  replaced.artifacts['report-output'] = { ...original.artifacts['report-output'], registeredAt };
  assert.equal(parseWorkflowWorkRecord(replaced, 'typed').workflowRevision, 3);
  replaced.operations[2].mappedOutputs = ['report-output'];
  assert.throws(() => parseWorkflowWorkRecord(replaced, 'typed'), /重复/);
  assert.deepEqual(readRecord(root), original);
});

function boundLink() {
  return { id: 'analysis-dependency', consumerStageId: 'report',
    producer: { workId: 'source-work', workflowRevision: 1, stageId: 'conclusion', outputId: 'report-output' },
    binding: { attemptId: 'attempt-source', eventSequence: 2, source: ref('source-report.md'), sha256: hash('source report') } };
}

test('typed dependency records: strict bindings preserve generation and reject ambiguous or out-of-scope links', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '分析', intent());
  const record = readRecord(root);
  record.revision = 2;
  record.operations.push({ operationId: 'link-one', kind: 'links-change', inputDigest: hash('links'), revision: 2, at: record.createdAt });
  record.links = [boundLink()];
  const parsed = parseWorkflowWorkRecord(record, 'typed');
  assert.equal(parsed.workflowRevision, 1);
  assert.deepEqual(parsed.links, [boundLink()]);
  const missingStage = structuredClone(record);
  missingStage.links[0].consumerStageId = 'absent-consumer';
  await assert.rejects(loadWorkflowSnapshot(root, missingStage), /消费阶段/);
  const differentConsumer = structuredClone(record);
  differentConsumer.links.push({ ...boundLink(), id: 'second-consumer', consumerStageId: 'summary' });
  assert.equal(parseWorkflowWorkRecord(differentConsumer, 'typed').links.length, 2);
  for (const mutate of [
    value => { value.links.push(boundLink()); },
    value => { value.links.push({ ...boundLink(), id: 'duplicate-binding' }); },
    value => { value.links[0].binding.source.repository = 'outside'; },
    value => { value.operations[1].outputId = 'report-output'; },
    value => { value.operations[1].changeDigest = hash('unrelated'); },
    value => { value.links = Array.from({ length: WORKFLOW_WORK_LIMITS.links + 1 }, (_, index) => ({ ...boundLink(), id: `link-${index}` })); },
  ]) {
    const invalid = structuredClone(record); mutate(invalid);
    assert.throws(() => parseWorkflowWorkRecord(invalid, 'typed'));
  }
  for (const mutate of [
    value => { value.authorized = true; },
    value => { value.producer.workflowRevision = 0; },
    value => { value.producer.workflowRevision = 1025; },
    value => { value.producer.approved = true; },
    value => { value.binding.eventSequence = 0; },
    value => { value.binding.eventSequence = 10001; },
    value => { value.binding.sha256 = 'invalid'; },
    value => { value.binding.source = ref('.tiller/work/source-work/stages/state.json'); },
    value => { value.binding.source.repository = 'repositories/source'; },
    value => { delete value.binding.attemptId; },
  ]) {
    const invalid = boundLink(); mutate(invalid);
    assert.throws(() => parseWorkflowLink(invalid));
  }
});

test('typed intent preparation: binds current sources without writes and retains source checks', async t => {
  const root = await project(t);
  const before = snapshot(root);
  const prepared = await prepareWorkflowWorkIntent(root, 'typed', intent());
  assert.equal(prepared.workflow.digest, prepared.snapshot.digest);
  assert.equal(prepared.basis[0].sha256, hash(readFileSync(join(root, 'basis.md'))));
  assert.equal(prepared.actionSources[0].sha256, hash(readFileSync(join(root, 'request.md'))));
  assert.equal(prepared.observed.length, 2);
  assert.deepEqual(snapshot(root), before);
  const invalid = intent();
  invalid.actionSources[0].quote = 'Absent source statement';
  await assert.rejects(prepareWorkflowWorkIntent(root, 'typed', invalid), errorCode('SOURCE_QUOTE_MISSING'));
  await assert.rejects(prepareWorkflowWorkIntent(root, 'typed', intent('typed', { scope: { repositories: ['.', 'unknown'], targets: ['typed'] } })), errorCode('INVALID_WORK_SCOPE'));
  assert.deepEqual(snapshot(root), before);
});

test('typed control reads: accept only bounded named workflow controls', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '分析', intent());
  const record = readRecord(root);
  assert.equal(JSON.parse(await readWorkflowControlText(root, record.workflow.path, WORKFLOW_WORK_LIMITS.recordBytes)).digest, record.workflow.digest);
  for (const path of [
    `${base('typed')}/tasks.json`, `${base('typed')}/stages/state.json`,
    `${base('typed')}/workflow/links/link-one.json`, `${base('typed')}/transitions/change-one/from-record.json`,
    `${base('typed')}/transitions/change-one/receipt.json`,
  ]) assert.equal(await readWorkflowControlText(root, path, WORKFLOW_WORK_LIMITS.recordBytes), null);
  for (const path of [
    `${base('typed')}/record.json`, `${base('typed')}/stages/arbitrary.json`,
    `${base('typed')}/workflow/definitions/not-a-digest.json`,
    `${base('typed')}/workflow/links/../record.json`,
    `${base('typed')}/transitions/change-one/arbitrary.json`,
    '.tiller/work/con/tasks.json', '.tiller/local/tasks.json', 'request.md',
  ]) await assert.rejects(readWorkflowControlText(root, path, WORKFLOW_WORK_LIMITS.recordBytes));
  for (const limit of [0, -1, 1.5, NaN, 2 * 1024 * 1024 + 1]) await assert.rejects(readWorkflowControlText(root, record.workflow.path, limit));
});

test('typed current contract: old and unknown record versions reject reads and writes without changing originals', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '当前分析', intent());
  const saved = readRecord(root);
  for (const version of [3, 1, 2, 5, '4', null]) {
    const unsupported = JSON.stringify({ ...saved, schemaVersion: version }, null, 2) + '\n';
    put(root, base('typed') + '/record.json', unsupported);
    const before = snapshot(root);
    assert.throws(() => parseWorkRecord(unsupported, 'typed'), errorCode('UNSUPPORTED_RECORD_VERSION'));
    assert.throws(() => parseWorkflowWorkRecord(JSON.parse(unsupported), 'typed'), errorCode('UNSUPPORTED_RECORD_VERSION'));
    await assert.rejects(loadWorkRecord(root, 'typed'), errorCode('UNSUPPORTED_RECORD_VERSION'));
    await assert.rejects(resumeWork(root, 'typed'), errorCode('UNSUPPORTED_RECORD_VERSION'));
    await assert.rejects(resumeWorkflowWork(root, 'typed'), errorCode('UNSUPPORTED_RECORD_VERSION'));
    await assert.rejects(addWorkflowOutput(root, 'typed', output()), errorCode('UNSUPPORTED_RECORD_VERSION'));
    await assert.rejects(createWorkflowWork(root, 'typed', '当前分析', intent()), errorCode('UNSUPPORTED_RECORD_VERSION'));
    assert.equal((await inspectWork(root, 'typed')).works[0].registration, 'unsupported');
    assert.deepEqual(snapshot(root), before);
  }
});

test('typed current CLI: explicit workflow and input create current records and generic outputs', async t => {
  const root = await project(t);
  put(root, 'intent.json', JSON.stringify(intent()));
  const created = success(cli(root, 'work', 'create', 'typed', '--title', '分析', '--workflow', 'analysis', '--input', 'intent.json'));
  assert.equal(created.schemaVersion, 4);
  assert.equal(created.workflow.id, 'analysis');
  assert.equal(created.authorization, 'not-evaluated');
  assert.equal(existsSync(join(root, base('typed'), 'requirements.md')), false);
  assert.equal(existsSync(join(root, base('typed'), 'design.md')), false);
  put(root, 'output.json', JSON.stringify(output()));
  const added = success(cli(root, 'work', 'add', 'typed', '--input', 'output.json'));
  assert.equal(added.revision, 2);
  assert.equal(added.status, 'draft');
  assert.equal(success(cli(root, 'work', 'resume', 'typed')).schemaVersion, 4);
  assert.equal(success(cli(root, 'work', 'create', 'typed', '--title', '分析', '--workflow', 'analysis', '--input', 'intent.json')).historical, true);
});

test('typed current CLI: missing mismatched and legacy selection cannot create a work', async t => {
  const root = await project(t);
  put(root, 'intent.json', JSON.stringify(intent()));
  const before = snapshot(root);
  const missing = failure(cli(root, 'work', 'create', 'typed', '--title', '分析', '--input', 'intent.json'));
  assert.equal(missing.error.code, 'INVALID_ARGUMENT');
  for (const { id } of await loadBuiltinWorkflows()) assert.ok(missing.error.message.includes(id));
  const missingInput = failure(cli(root, 'work', 'create', 'typed', '--title', '分析', '--workflow', 'analysis'));
  assert.match(missingInput.error.message, /--input/);
  const mismatch = failure(cli(root, 'work', 'create', 'typed', '--title', '分析', '--workflow', 'feature', '--input', 'intent.json'));
  assert.match(mismatch.error.message, /workflow.*一致/);
  failure(cli(root, 'work', 'create', 'typed', '--title', '旧模板', '--type', 'change-requirements'));
  const removed = failure(cli(root, 'work', 'complete', 'typed'));
  assert.match(removed.error.message, /未知 work 操作/);
  assert.match(failure(cli(root, 'work', 'bind', 'typed')).error.message, /未知 work 操作/);
  assert.deepEqual(snapshot(root), before);
  put(root, 'oversized.json', JSON.stringify(intent()) + ' '.repeat(WORKFLOW_WORK_LIMITS.recordBytes));
  const oversizedBefore = snapshot(root);
  const oversized = failure(cli(root, 'work', 'create', 'typed', '--title', '分析', '--workflow', 'analysis', '--input', 'oversized.json'));
  assert.match(oversized.error.message, /大小/);
  assert.deepEqual(snapshot(root), oversizedBefore);
});

test('typed current CLI: unsupported records reject valid read and write commands without modification', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '分析', intent());
  put(root, 'intent.json', JSON.stringify(intent()));
  put(root, 'output.json', JSON.stringify(output()));
  const saved = readRecord(root);
  put(root, `${base('typed')}/record.json`, JSON.stringify({ ...saved, schemaVersion: 3 }));
  const before = snapshot(root);
  for (const args of [
    ['resume', 'typed'],
    ['add', 'typed', '--input', 'output.json'],
    ['create', 'typed', '--title', '分析', '--workflow', 'analysis', '--input', 'intent.json'],
  ]) {
    const rejected = failure(cli(root, 'work', ...args));
    assert.equal(rejected.error.code, 'UNSUPPORTED_RECORD_VERSION');
    assert.match(rejected.error.message, /版本 4/);
    assert.deepEqual(snapshot(root), before);
  }
  assert.equal(failure(cli(root, 'work', 'inspect', 'typed')).works[0].registration, 'unsupported');
  assert.deepEqual(snapshot(root), before);
});

test('typed current contract: unregistered work does not acquire a record through reads or output writes', async t => {
  const root = await project(t);
  put(root, `${base('typed')}/work.md`, '# 既有笔记\n尚未登记当前工作。\n');
  const before = snapshot(root);
  await assert.rejects(loadWorkRecord(root, 'typed'), errorCode('WORK_NOT_FOUND'));
  await assert.rejects(resumeWork(root, 'typed'), errorCode('WORK_NOT_FOUND'));
  await assert.rejects(addWorkflowOutput(root, 'typed', output()), errorCode('WORK_NOT_FOUND'));
  assert.equal((await inspectWork(root, 'typed')).works[0].registration, 'unregistered');
  assert.deepEqual(snapshot(root), before);
});

test('typed identifiers: catalog output and role syntax is preserved independently of work ids', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  await addWorkflowOutput(root, 'typed', output());
  assert.deepEqual(parseWorkflowWorkInput(intent('typed', { expectedOutputs: ['evidence--output', 'audit-report-'] })).expectedOutputs, ['evidence--output', 'audit-report-']);
  assert.equal(parseWorkflowOutputInput(output({ outputId: 'evidence--output' })).outputId, 'evidence--output');
  const record = readRecord(root);
  const original = record.artifacts['report-output'];
  record.artifacts = {
    'evidence--output': { ...original, outputId: 'evidence--output', role: 'audit-report-', source: ref('actual.txt'), origin: 'reference' },
  };
  record.operations[1].outputId = 'evidence--output';
  record.expectedOutputs = ['evidence--output'];
  assert.equal(parseWorkflowWorkRecord(record, 'typed').artifacts['evidence--output'].role, 'audit-report-');
  record.artifacts['evidence--output'].role = 'con';
  assert.equal(parseWorkflowWorkRecord(record, 'typed').artifacts['evidence--output'].role, 'con');
  record.artifacts['evidence--output'].origin = 'generated';
  record.artifacts['evidence--output'].source = ref(`${base('typed')}/con.md`);
  assert.throws(() => parseWorkflowWorkRecord(record, 'typed'), /不安全/);
  assert.throws(() => parseWorkflowOutputInput(output({ outputId: 'constructor' })), /标识/);
});

test('typed record size: shared resume and inspection enforce bounded reads before parsing', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  const original = readFileSync(join(root, base('typed'), 'record.json'), 'utf8');
  put(root, `${base('typed')}/record.json`, original + ' '.repeat(WORKFLOW_WORK_LIMITS.recordBytes));
  await assert.rejects(loadWorkRecord(root, 'typed'), /大小/);
  await assert.rejects(resumeWork(root, 'typed'), /大小/);
  assert.equal((await inspectWork(root, 'typed')).works[0].registration, 'invalid');
  await writeFile(join(root, base('typed'), 'record.json'), Buffer.alloc(WORKFLOW_WORK_LIMITS.recordBytes + 1, 32));
  await assert.rejects(resumeWork(root, 'typed'), /大小/);
  assert.equal((await inspectWork(root, 'typed')).works[0].registration, 'invalid');
  assert.throws(() => parseWorkRecord(' '.repeat(WORKFLOW_WORK_LIMITS.recordBytes + 1), 'typed'), /大小/);
});

function nearLimitIntent(template, targetBytes, pretty) {
  // "large" and "typed" have equal byte lengths; hashes and ISO timestamps retain fixed lengths.
  const value = intent('large', { completionCriteria: [] });
  const preview = { ...template, completionCriteria: value.completionCriteria };
  const bytes = () => Buffer.byteLength(JSON.stringify(preview, null, pretty ? 2 : undefined) + (pretty ? '\n' : ''));
  while (bytes() < targetBytes) {
    const index = value.completionCriteria.length;
    value.completionCriteria.push(`${index}:` + 'x'.repeat(9000));
    const excess = bytes() - targetBytes;
    if (excess > 0) value.completionCriteria[index] = value.completionCriteria[index].slice(0, -excess);
  }
  assert.equal(bytes(), targetBytes);
  assert.ok(value.completionCriteria.length <= WORKFLOW_WORK_LIMITS.sources);
  assert.ok(value.completionCriteria.every(item => item.length > 0 && item.length <= WORKFLOW_WORK_LIMITS.text));
  assert.doesNotThrow(() => parseWorkflowWorkInput(value));
  assert.doesNotThrow(() => parseWorkflowWorkRecord(preview, 'typed'));
  return { value, preview };
}

test('typed serialized size: create rejects oversized persisted JSON before leaving any files', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '分析', intent());
  const { value, preview } = nearLimitIntent(readRecord(root), WORKFLOW_WORK_LIMITS.recordBytes - 100, false);
  assert.ok(Buffer.byteLength(JSON.stringify(preview, null, 2) + '\n') > WORKFLOW_WORK_LIMITS.recordBytes);
  const before = snapshot(root);
  await assert.rejects(createWorkflowWork(root, 'large', '分析', value), errorCode('WORKFLOW_WORK_TOO_LARGE'));
  assert.deepEqual(snapshot(root), before);
  assert.equal(existsSync(join(root, base('large'))), false);
});

test('typed serialized size: output registration preserves a near-limit record and creates no output on refusal', async t => {
  const root = await project(t);
  await createWorkflowWork(root, 'typed', '分析', intent());
  const { value } = nearLimitIntent(readRecord(root), WORKFLOW_WORK_LIMITS.recordBytes - 200, true);
  await createWorkflowWork(root, 'large', '分析', value);
  const original = readFileSync(join(root, base('large'), 'record.json'));
  assert.equal(original.length, WORKFLOW_WORK_LIMITS.recordBytes - 200);
  assert.equal((await resumeWork(root, 'large')).revision, 1);
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'large', output()), errorCode('WORKFLOW_WORK_TOO_LARGE'));
  assert.deepEqual(readFileSync(join(root, base('large'), 'record.json')), original);
  assert.deepEqual(snapshot(root), before);
  assert.equal(existsSync(join(root, base('large'), 'analysis.md')), false);
});

async function substituteTestSnapshot(root, modify) {
  const record = readRecord(root);
  const original = JSON.parse(readFileSync(join(root, record.workflow.path), 'utf8'));
  modify(original.definition);
  const selected = createWorkflowSnapshot(original.definition);
  record.workflow = { id: selected.id, version: selected.version, digest: selected.digest, path: `${base('typed')}/workflow/definitions/${selected.digest}.json` };
  put(root, record.workflow.path, JSON.stringify(selected));
  put(root, `${base('typed')}/record.json`, JSON.stringify(record));
}

test('typed policy boundary: project work without an activation receipt is invalid and preserves its bytes', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  await substituteTestSnapshot(root, definition => { definition.id = 'project.audit'; });
  put(root, 'existing.txt', 'Existing observation.\n');
  const before = snapshot(root);
  await assert.rejects(resumeWorkflowWork(root, 'typed'), errorCode('INVALID_WORKFLOW_WORK'));
  await assert.rejects(addWorkflowOutput(root, 'typed', output()), errorCode('INVALID_WORKFLOW_WORK'));
  await assert.rejects(addWorkflowOutput(root, 'typed', { operationId: 'reference-one', expectedRevision: 1, outputId: 'report-output', source: ref('existing.txt') }), errorCode('INVALID_WORKFLOW_WORK'));
  assert.deepEqual(snapshot(root), before);
});

test('typed policy boundary: edited declaration cannot remove upstream approval from design or planning generation', async t => {
  const root = await project(t); await createWorkflowWork(root, 'typed', '分析', intent());
  for (const role of ['design', 'planning']) {
    await substituteTestSnapshot(root, definition => { definition.outputs.find(item => item.id === 'report-output').role = role; });
    const before = snapshot(root);
    await assert.rejects(addWorkflowOutput(root, 'typed', output()), errorCode('WORKFLOW_POLICY_REQUIRED'));
    assert.deepEqual(snapshot(root), before);
  }
});
