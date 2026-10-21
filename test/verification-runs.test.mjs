import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initialize } from '../dist/core.js';
import { createStartedBaseline, baselineAuthorization } from './workflow-fixtures.mjs';
import { verificationCategories } from '../dist/verification-cases.js';
import { planVerificationRun as planVerificationRunRaw, applyVerificationRun as applyVerificationRunRaw, recordVerificationEvidence, captureVerificationObservation as captureVerificationObservationRaw, reportVerification, readVerificationRecords } from '../dist/verification-runs.js';
import { snapshot as sharedSnapshot } from './helpers.mjs';


const planVerificationRun = (root, id, suite, selection) => planVerificationRunRaw(root, id, suite, selection, baselineAuthorization(['test']));
const applyVerificationRun = (root, id, suite, planId, selection) => applyVerificationRunRaw(root, id, suite, planId, selection, baselineAuthorization(['test']));
const captureVerificationObservation = (root, id, input) => captureVerificationObservationRaw(root, id, { ...input, workflow: baselineAuthorization(['write-report']) });

const workId = '20261019-testing';
async function fixture(t, script = 'console.log("executed")', timeoutMs = 10000, workspace = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tiller-verification-run-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (workspace) {
    await promisify(execFile)('git', ['init', '--quiet', path.join(root, 'repositories/service-a')]);
    await initialize({ root, mode: 'workspace', repositories: ['service-a'] });
  } else await initialize({ root });
  await mkdir(path.join(root, '.tiller/verification/modules/demo'), { recursive: true });
  await writeFile(path.join(root, 'spec.md'), '# Requirement and design\n');
  await writeFile(path.join(root, 'runner.mjs'), script);
  await writeFile(path.join(root, 'evidence.md'), '# Actual report\nTwo checks passed.\n');
  const ref = name => ({ repository: '.', path: name });
  const config = { schemaVersion: 1, modules: [{ id: 'demo', design: ref('spec.md') }],
    requirements: [{ id: 'REQ-DEMO', source: ref('spec.md') }],
    categories: Object.fromEntries(verificationCategories.map(category => [category, { applicability: category === 'unit' ? 'applicable' : 'not-applicable', reason: 'Fixture scope' }])),
    suites: [{ id: 'demo', repository: '.', command: 'node', args: ['runner.mjs'], cwd: '.', timeoutMs, inputs: [ref('runner.mjs')] }] };
  await writeFile(path.join(root, '.tiller/verification/config.json'), JSON.stringify(config));
  const cases = ['TC-DEMO-1', 'TC-DEMO-2'].map(id => `  - id: ${id}\n    title: ${id}\n    modules: [demo]\n    categories: [unit]\n    requirements: [REQ-DEMO]\n    given: [准备]\n    when: [执行]\n    then: [符合预期]\n    automation:\n      suite: demo\n      test_ref: ${id}\n      source:\n        repository: .\n        path: runner.mjs`).join('\n');
  await writeFile(path.join(root, '.tiller/verification/modules/demo/unit.yaml'), `schema_version: 1\ncases:\n${cases}\n`);
  await createStartedBaseline(root, workId);
  return root;
}
const evidence = (status = 'passed', caseIds = ['TC-DEMO-1', 'TC-DEMO-2']) => ({ environment: 'Node local fixture',
  results: caseIds.map(caseId => ({ caseId, status, evidence: { repository: '.', path: 'evidence.md' }, note: 'Explicit external result; not authenticated.' })) });

async function recordFreshEvidence(root, id, input) {
  const config = JSON.parse(await readFile(path.join(root, '.tiller/verification/config.json'), 'utf8'));
  const capture = await captureVerificationObservation(root, id, { environment: input.environment,
    selection: { caseIds: input.results.map(result => result.caseId), requirements: ['REQ-DEMO'], modules: ['demo'], categories: config.categories,
      reason: 'Fresh isolated observation for this test', scenarioReason: 'Only fixture cases apply', checks: [] } });
  return recordVerificationEvidence(root, id, { ...input, captureId: capture.record.id });
}

test('strict historical record reads reject unsafe entries without requiring current tested inputs', async t => {
  const root = await fixture(t);
  const before = sharedSnapshot(root);
  assert.deepEqual(await readVerificationRecords(root, workId), []);
  assert.deepEqual(sharedSnapshot(root), before, 'Reading absent records must not create control files');
  const saved = await recordFreshEvidence(root, workId, evidence());
  await writeFile(path.join(root, 'runner.mjs'), 'console.log("changed after observation")');
  const records = await readVerificationRecords(root, workId);
  assert.equal(records.length, 2);
  assert.equal(records[1].id, saved.record.id);
  const unexpected = path.join(root, `.tiller/work/${workId}/verification-runs/unrelated.json`);
  await writeFile(unexpected, '{}');
  await assert.rejects(readVerificationRecords(root, workId), /非标准记录/u);
  await rm(unexpected);
  const location = path.join(root, `.tiller/work/${workId}/verification-runs/${saved.record.id}.json`);
  const malformed = JSON.parse(await readFile(location, 'utf8'));
  malformed.digest = '0'.repeat(64);
  const contents = JSON.stringify(malformed);
  await writeFile(location, contents);
  await assert.rejects(readVerificationRecords(root, workId), /摘要不匹配/u);
  assert.equal(await readFile(location, 'utf8'), contents, 'A rejected read must preserve the malformed historical file');
});

test('suite exit zero records execution but never invents individual case passes', async t => {
  const root = await fixture(t);
  const work = path.join(root, `.tiller/work/${workId}/record.json`);
  const original = await readFile(work, 'utf8');
  assert.equal(JSON.parse(original).schemaVersion, 4);
  const plan = await planVerificationRun(root, workId, 'demo');
  assert.equal(plan.command, process.execPath);
  const expectedInvocation = { repository: '.', command: 'node', args: ['runner.mjs'], cwd: '.' };
  assert.deepEqual(plan.invocation, expectedInvocation);
  assert.ok(Object.values(plan.files).every(value => /^[a-f0-9]{64}$/.test(value)));
  const result = await applyVerificationRun(root, workId, 'demo', plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.record.schemaVersion, 2);
  assert.equal(result.record.execution.suitePassed, true);
  assert.deepEqual(result.record.execution.invocation, expectedInvocation);
  assert.equal(path.isAbsolute(result.record.execution.invocation.cwd), false);
  assert.equal(path.isAbsolute(result.record.execution.invocation.command), false);
  assert.equal(new Date(result.record.execution.startedAt).toISOString(), result.record.execution.startedAt);
  assert.equal(new Date(result.record.execution.finishedAt).toISOString(), result.record.execution.finishedAt);
  assert.ok(Number.isSafeInteger(result.record.execution.durationMs) && result.record.execution.durationMs >= 0);
  const report = await reportVerification(root, workId);
  assert.equal(report.ready, false);
  assert.ok(report.cases.every(item => item.status === 'not-run'));
  assert.equal(await readFile(work, 'utf8'), original);
  const recordPath = path.join(root, result.path);
  const recordText = await readFile(recordPath, 'utf8');
  for (const patch of [{ startedAt: 'invalid-date' }, { durationMs: -1 }, { invocation: { ...expectedInvocation, cwd: '../outside' } }]) {
    const invalid = JSON.parse(recordText); Object.assign(invalid.execution, patch);
    await writeFile(recordPath, JSON.stringify(invalid));
    await assert.rejects(reportVerification(root, workId), /执行时间|执行时长|不安全/);
  }
  await writeFile(recordPath, recordText);
  const configPath = path.join(root, '.tiller/verification/config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.suites[0].args = ['-e', 'console.log("changed invocation")'];
  await writeFile(configPath, JSON.stringify(config));
  const changed = await reportVerification(root, workId);
  assert.equal(changed.runs[0].stale, true);
  assert.deepEqual(changed.runs[0].execution.invocation, expectedInvocation);
});

test('failed command, timeout and output overflow stay nonpassing', async t => {
  for (const [script, timeout, field] of [
    ['process.exit(9)', 10000, 'exitCode'],
    ['setInterval(() => {}, 1000)', 80, 'timedOut'],
    ['process.stdout.write("x".repeat(200000))', 10000, 'outputLimited']
  ]) {
    const root = await fixture(t, script, timeout);
    const plan = await planVerificationRun(root, workId, 'demo');
    const result = await applyVerificationRun(root, workId, 'demo', plan.planId);
    assert.equal(result.ready, false);
    assert.equal(result.record.execution[field], field === 'exitCode' ? 9 : true);
    assert.equal(result.record.execution.suitePassed, false);
    assert.ok(result.record.execution.output.length <= 65536);
    assert.equal((await reportVerification(root, workId)).ready, false);
  }
});

test('changed inputs invalidate preview before execution and evidence after execution', async t => {
  const root = await fixture(t);
  const plan = await planVerificationRun(root, workId, 'demo');
  await writeFile(path.join(root, 'runner.mjs'), 'throw new Error("must not run")');
  await assert.rejects(applyVerificationRun(root, workId, 'demo', plan.planId), /计划已变化/);
  const report = await reportVerification(root, workId);
  assert.equal(report.runs.length, 0);
  await recordFreshEvidence(root, workId, evidence());
  assert.equal((await reportVerification(root, workId)).ready, true);
  await writeFile(path.join(root, 'runner.mjs'), '// Changed implementation');
  assert.ok((await reportVerification(root, workId)).cases.every(item => item.status === 'stale'));
});

test('self-modifying execution preserves its result but is stale immediately', async t => {
  const root = await fixture(t, 'import { writeFileSync } from "node:fs"; writeFileSync("runner.mjs", "// changed")');
  const plan = await planVerificationRun(root, workId, 'demo');
  const result = await applyVerificationRun(root, workId, 'demo', plan.planId);
  assert.equal(result.record.execution.suitePassed, true);
  assert.equal(result.record.staleAfterExecution, true);
  assert.equal(result.ready, false);
  assert.ok((await reportVerification(root, workId)).cases.every(item => item.status === 'stale'));
});

test('reported outcomes update individual cases and bind evidence without erasing history', async t => {
  const root = await fixture(t);
  await recordFreshEvidence(root, workId, evidence('passed', ['TC-DEMO-1']));
  assert.equal((await reportVerification(root, workId)).ready, false);
  await recordFreshEvidence(root, workId, evidence('failed', ['TC-DEMO-2']));
  await recordFreshEvidence(root, workId, evidence('passed', ['TC-DEMO-2']));
  const report = await reportVerification(root, workId);
  assert.equal(report.ready, true);
  assert.equal(report.runs.filter(run => run.source === 'reported').length, 3);
  assert.equal(report.cases[0].recordId, report.runs.find(run => run.source === 'reported').id);
  await writeFile(path.join(root, 'evidence.md'), 'Changed evidence');
  assert.equal((await reportVerification(root, workId)).ready, false);
});

test('invalid imports and tampered records are rejected rather than counted as passes', async t => {
  const root = await fixture(t);
  await assert.rejects(recordFreshEvidence(root, workId, { ...evidence(), invented: true }), /未知字段/);
  await assert.rejects(recordFreshEvidence(root, workId, evidence('passed', ['unknown'])), /用例不存在/);
  await assert.rejects(recordFreshEvidence(root, workId, evidence('passed', ['TC-DEMO-1', 'TC-DEMO-1'])), /重复/);
  const invalidRef = evidence(); invalidRef.results[0].evidence.path = '../outside.md';
  await assert.rejects(recordFreshEvidence(root, workId, invalidRef), /不安全/);
  const saved = await recordFreshEvidence(root, workId, evidence());
  assert.equal(saved.record.schemaVersion, 2);
  const text = JSON.parse(await readFile(path.join(root, saved.path), 'utf8'));
  await writeFile(path.join(root, saved.path), JSON.stringify({ ...text, invented: true }));
  await assert.rejects(reportVerification(root, workId), /未知字段/);
  text.results[0].status = 'failed';
  await writeFile(path.join(root, saved.path), JSON.stringify(text));
  await assert.rejects(reportVerification(root, workId), /摘要不匹配/);
});

test('unsupported run versions block reads, new evidence and execution while preserving shared files', async t => {
  const root = await fixture(t, 'import { writeFileSync } from "node:fs"; writeFileSync("executed-sentinel.txt", "executed")');
  const plan = await planVerificationRun(root, workId, 'demo');
  const saved = await recordFreshEvidence(root, workId, evidence());
  const recordPath = path.join(root, saved.path);
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  for (const version of [1, 3, null]) {
    const original = JSON.stringify({ ...record, schemaVersion: version }, null, 4) + '\r\n';
    await writeFile(recordPath, original);
    const before = sharedSnapshot(root);
    const unsupported = { code: 'UNSUPPORTED_RECORD_VERSION', message: /新建工作.*不迁移.*不删除/ };
    await assert.rejects(reportVerification(root, workId), unsupported);
    await assert.rejects(planVerificationRun(root, workId, 'demo'), unsupported);
    await assert.rejects(recordFreshEvidence(root, workId, evidence()), unsupported);
    await assert.rejects(applyVerificationRun(root, workId, 'demo', plan.planId), unsupported);
    assert.equal(await readFile(recordPath, 'utf8'), original);
    assert.deepEqual(sharedSnapshot(root), before);
    await assert.rejects(readFile(path.join(root, 'executed-sentinel.txt')), { code: 'ENOENT' });
  }
});

test('unsupported work versions cannot execute or report verification and remain unchanged', async t => {
  const root = await fixture(t);
  const plan = await planVerificationRun(root, workId, 'demo');
  const recordPath = path.join(root, `.tiller/work/${workId}/record.json`);
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  for (const version of [1, 2]) {
    await writeFile(recordPath, JSON.stringify({ ...record, schemaVersion: version }));
    const before = sharedSnapshot(root);
    const unsupported = { code: 'UNSUPPORTED_RECORD_VERSION' };
    await assert.rejects(reportVerification(root, workId), unsupported);
    await assert.rejects(planVerificationRun(root, workId, 'demo'), unsupported);
    await assert.rejects(recordFreshEvidence(root, workId, evidence()), unsupported);
    await assert.rejects(applyVerificationRun(root, workId, 'demo', plan.planId), unsupported);
    assert.deepEqual(sharedSnapshot(root), before);
  }
});

test('environment changes invalidate plan, and inherited Git variables do not reach child', async t => {
  const root = await fixture(t, 'if (process.env.GIT_DIR || process.env.GIT_WORK_TREE) process.exit(8)');
  const prior = process.env.TILLER_VERIFICATION_FIXTURE;
  t.after(() => { if (prior === undefined) delete process.env.TILLER_VERIFICATION_FIXTURE; else process.env.TILLER_VERIFICATION_FIXTURE = prior; });
  process.env.TILLER_VERIFICATION_FIXTURE = 'a';
  const plan = await planVerificationRun(root, workId, 'demo');
  process.env.TILLER_VERIFICATION_FIXTURE = 'b';
  await assert.rejects(applyVerificationRun(root, workId, 'demo', plan.planId), /计划已变化/);
  const second = await planVerificationRun(root, workId, 'demo');
  const oldDir = process.env.GIT_DIR; const oldTree = process.env.GIT_WORK_TREE;
  process.env.GIT_DIR = '/invalid'; process.env.GIT_WORK_TREE = '/invalid';
  try { assert.equal((await applyVerificationRun(root, workId, 'demo', second.planId)).ready, true); }
  finally {
    if (oldDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = oldDir;
    if (oldTree === undefined) delete process.env.GIT_WORK_TREE; else process.env.GIT_WORK_TREE = oldTree;
  }
});

test('multi-repository execution resolves registered directory and enforces work scope', async t => {
  const root = await fixture(t, '', 10000, true);
  const configPath = path.join(root, '.tiller/verification/config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.suites[0].repository = 'service-a';
  config.suites[0].inputs = [{ repository: 'service-a', path: 'runner.mjs' }];
  await writeFile(path.join(root, 'repositories/service-a/runner.mjs'), 'console.log(process.cwd())');
  await writeFile(configPath, JSON.stringify(config));
  await assert.rejects(planVerificationRun(root, workId, 'demo'), /工作范围/);
  await assert.rejects(recordFreshEvidence(root, workId, evidence()), /工作范围/);
  const multiId = '20261019-multi';
  await createStartedBaseline(root, multiId, { repositories: ['.', 'service-a'], targets: ['demo'] });
  const plan = await planVerificationRun(root, multiId, 'demo');
  assert.equal(plan.cwd, path.join(root, 'repositories/service-a'));
  const run = await applyVerificationRun(root, multiId, 'demo', plan.planId);
  assert.equal(run.ready, true);
  assert.ok(run.record.execution.output.includes('service-a'));
  await recordFreshEvidence(root, multiId, evidence());
  assert.equal((await reportVerification(root, multiId)).ready, true);
});

test('pending categories and uncovered requirements prevent complete report', async t => {
  const root = await fixture(t);
  const configPath = path.join(root, '.tiller/verification/config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.categories.security = { applicability: 'pending', reason: 'Needs risk review' };
  config.requirements.push({ id: 'REQ-UNCOVERED', source: { repository: '.', path: 'spec.md' } });
  await writeFile(configPath, JSON.stringify(config));
  const before = await reportVerification(root, workId);
  assert.equal(before.requirements.find(item => item.id === 'REQ-DEMO').allPassed, false);
  await recordFreshEvidence(root, workId, evidence());
  const report = await reportVerification(root, workId);
  assert.equal(report.ready, false);
  assert.ok(report.issues.some(issue => issue.includes('security')));
  assert.ok(report.issues.some(issue => issue.includes('REQ-UNCOVERED')));
  assert.deepEqual(report.requirements.find(item => item.id === 'REQ-UNCOVERED'), { id: 'REQ-UNCOVERED', cases: [], checks: [], allPassed: false });
  assert.deepEqual(report.requirements.find(item => item.id === 'REQ-DEMO'), { id: 'REQ-DEMO', cases: ['TC-DEMO-1', 'TC-DEMO-2'], checks: [], allPassed: true });
  config.categories.unit = { applicability: 'not-applicable', reason: 'Contradicts cases' };
  await writeFile(configPath, JSON.stringify(config));
  await assert.rejects(reportVerification(root, workId), /不适用类别冲突/);
});

test('ignored result directory or prior result blocks writes while ordinary history remains readable', async t => {
  const root = await fixture(t);
  await promisify(execFile)('git', ['init', '--quiet', root]);
  const ignore = path.join(root, `.tiller/work/${workId}/.gitignore`);
  await writeFile(ignore, 'verification-runs/\n');
  await assert.rejects(recordFreshEvidence(root, workId, evidence()), /忽略|共享/);
  assert.deepEqual(await readVerificationRecords(root, workId), []);
  await rm(ignore);
  const saved = await recordFreshEvidence(root, workId, evidence());
  assert.equal((await reportVerification(root, workId)).ready, true);
  await writeFile(ignore, `verification-runs/${saved.record.id}.json\n`);
  const before = sharedSnapshot(root);
  assert.equal((await reportVerification(root, workId)).ready, true, 'Ordinary evidence queries do not decide Git sharing eligibility.');
  assert.equal((await readVerificationRecords(root, workId)).length, 2);
  assert.deepEqual(sharedSnapshot(root), before);
  await assert.rejects(recordFreshEvidence(root, workId, evidence()), /忽略|共享/);
  assert.deepEqual(sharedSnapshot(root), before, 'A rejected write does not append history based on an ignored prior record.');
});

test('passed outcomes require independent evidence rather than definitions or prior machine records', async t => {
  const root = await fixture(t);
  const plan = await planVerificationRun(root, workId, 'demo');
  const executed = await applyVerificationRun(root, workId, 'demo', plan.planId);
  for (const evidencePath of [executed.path, '.tiller/verification/config.json', '.tiller/verification/modules/demo/unit.yaml',
    `.tiller/work/${workId}/work.md`, `.tiller/work/${workId}/record.json`, 'spec.md', 'runner.mjs']) {
    const input = evidence();
    input.results[0].evidence.path = evidencePath;
    await assert.rejects(recordFreshEvidence(root, workId, input), /独立|控制资料/);
  }
  const report = await reportVerification(root, workId);
  assert.equal(report.ready, false);
  assert.equal(report.runs.filter(run => run.source === 'executed').length, 1);
  assert.equal(report.runs.filter(run => run.source === 'reported').length, 0);
  assert.ok(report.cases.every(item => item.status === 'not-run'));
});

test('ignored new JSON result is rejected before executing any command', async t => {
  const root = await fixture(t, 'import { writeFileSync } from "node:fs"; writeFileSync("executed-sentinel.txt", "executed")');
  await promisify(execFile)('git', ['init', '--quiet', root]);
  const ignore = path.join(root, `.tiller/work/${workId}/.gitignore`);
  await writeFile(ignore, 'verification-runs/*.json\n');
  const plan = await planVerificationRun(root, workId, 'demo');
  await assert.rejects(applyVerificationRun(root, workId, 'demo', plan.planId), /忽略|共享/);
  await assert.rejects(readFile(path.join(root, 'executed-sentinel.txt')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(root, `.tiller/work/${workId}/verification-runs`)), { code: 'ENOENT' });
  await rm(ignore);
  const run = await applyVerificationRun(root, workId, 'demo', plan.planId);
  assert.equal(run.ready, true);
  assert.equal(await readFile(path.join(root, 'executed-sentinel.txt'), 'utf8'), 'executed');
  assert.equal(path.basename(run.path), `${run.record.id}.json`);
});

test('ignored existing result blocks execution before a command can produce side effects', async t => {
  const root = await fixture(t, 'import { writeFileSync } from "node:fs"; writeFileSync("executed-sentinel.txt", "executed")');
  await promisify(execFile)('git', ['init', '--quiet', root]);
  const saved = await recordFreshEvidence(root, workId, evidence());
  const plan = await planVerificationRun(root, workId, 'demo');
  const ignore = path.join(root, `.tiller/work/${workId}/.gitignore`);
  await writeFile(ignore, `verification-runs/${saved.record.id}.json\n`);
  const before = sharedSnapshot(root);
  await assert.rejects(applyVerificationRun(root, workId, 'demo', plan.planId), /忽略|共享/);
  await assert.rejects(readFile(path.join(root, 'executed-sentinel.txt')), { code: 'ENOENT' });
  assert.equal((await readVerificationRecords(root, workId)).length, 2);
  assert.deepEqual(sharedSnapshot(root), before);
});
