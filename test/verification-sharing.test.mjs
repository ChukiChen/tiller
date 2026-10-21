import assert from 'node:assert/strict';
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { initialize } from '../dist/core.js';
import {
  applyVerificationRun, captureVerificationObservation, planVerificationRun,
  readVerificationRecords, recordVerificationEvidence,
} from '../dist/verification-runs.js';
import { baselineAuthorization, createStartedBaseline, workflowCategories } from './workflow-fixtures.mjs';
import { fixture, gitRepository, put } from './helpers.mjs';

const workId = 'verification-sharing';
const ref = (path, repository = '.') => ({ repository, path });
function selection(inputs = [ref('subject.txt')], execution = false) {
  return { caseIds: [], requirements: ['REQ-SHARED'], modules: [], categories: workflowCategories,
    reason: 'Observe declared shared materials.', scenarioReason: 'Isolated sharing boundary fixture.',
    checks: [{ id: 'shared', kind: execution ? 'execution' : 'manual', ...(execution ? { suite: 'runner' } : {}),
      artifactIds: ['baseline-output'], inputs, requirements: ['REQ-SHARED'], categories: ['unit'], reason: 'Read the declared material.' }] };
}
async function setup(t, workspace = false) {
  const root = fixture(t);
  gitRepository(root, '.');
  if (workspace) gitRepository(root, 'repositories/app');
  await initialize({ root, ...(workspace ? { mode: 'workspace', repositories: ['app'] } : {}) });
  put(root, 'subject.txt', 'Observed subject.\n');
  put(root, 'spec.md', '# Shared requirement and provenance\n');
  put(root, 'evidence.md', '# Independent observation\n');
  put(root, 'runner.mjs', "import { writeFileSync } from 'node:fs'; writeFileSync('executed.txt', 'ran');\n");
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [],
    requirements: [{ id: 'REQ-SHARED', source: ref('spec.md') }], categories: workflowCategories,
    suites: [{ id: 'runner', repository: '.', command: 'node', args: ['runner.mjs'], cwd: '.', timeoutMs: 5000, inputs: [ref('runner.mjs')] }] }));
  await createStartedBaseline(root, workId, workspace ? { repositories: ['.', 'app'], targets: [workId] } : undefined);
  return root;
}
function ignore(root, path) { appendFileSync(join(root, '.git/info/exclude'), `\n/${path}\n`); }
const capture = (root, selected = selection()) => captureVerificationObservation(root, workId, {
  selection: selected, environment: 'sharing-fixture', workflow: baselineAuthorization(['write-report']),
});
const record = (root, captured) => recordVerificationEvidence(root, workId, {
  captureId: captured.record.id, environment: captured.record.environment,
  results: [{ checkId: 'shared', status: 'passed', evidence: ref('evidence.md'), note: 'Independent fixture observation.' }],
});

test('capture rejects ignored tested input, requirement and definition without writing history', async t => {
  const root = await setup(t);
  const definition = '.tiller/verification/system/sharing.yaml';
  put(root, definition, 'schema_version: 1\ncases: []\n');
  for (const path of ['subject.txt', 'spec.md', definition, '.tiller/verification/config.json']) {
    ignore(root, path);
    await assert.rejects(capture(root), /共享资料被 Git 忽略/u);
    assert.deepEqual(await readVerificationRecords(root, workId), []);
    appendFileSync(join(root, '.git/info/exclude'), `\n!/${path}\n`);
  }
});

test('evidence registration rejects ignored report and rechecks previously captured shared inputs', async t => {
  const root = await setup(t);
  const captured = await capture(root);
  ignore(root, 'evidence.md');
  await assert.rejects(record(root, captured), /共享资料被 Git 忽略/u);
  assert.equal((await readVerificationRecords(root, workId)).length, 1);
  appendFileSync(join(root, '.git/info/exclude'), '\n!/evidence.md\n');
  ignore(root, 'subject.txt');
  await assert.rejects(record(root, captured), /共享资料被 Git 忽略/u);
  assert.equal((await readVerificationRecords(root, workId)).length, 1);
});

test('ignored rebuildable binary outputs are allowed only with shared provenance', async t => {
  const root = await setup(t);
  put(root, 'dist/output.bin', Buffer.from([0xff, 0x00, 0x01]));
  put(root, 'provenance.md', '# Rebuild from the declared inputs\n');
  ignore(root, 'dist/');
  const selected = selection([{ ...ref('dist/output.bin'), binary: true, provenance: ref('provenance.md') }]);
  const captured = await capture(root, selected);
  assert.equal(captured.ready, true);
  assert.equal((await record(root, captured)).ready, true);
  ignore(root, 'provenance.md');
  await assert.rejects(capture(root, selected), /共享资料被 Git 忽略/u);
  assert.equal((await readVerificationRecords(root, workId)).length, 2);
});

test('verification execution rejects newly ignored suite inputs before launching the command', async t => {
  const root = await setup(t);
  const selected = selection([ref('subject.txt')], true);
  const workflow = baselineAuthorization(['test']);
  const plan = await planVerificationRun(root, workId, 'runner', selected, workflow);
  ignore(root, 'runner.mjs');
  await assert.rejects(applyVerificationRun(root, workId, 'runner', plan.planId, selected, workflow), /共享资料被 Git 忽略/u);
  assert.equal(existsSync(join(root, 'executed.txt')), false);
  assert.deepEqual(await readVerificationRecords(root, workId), []);
});

test('execution that hides its own input retains the real execution as stale', async t => {
  const root = await setup(t);
  put(root, 'runner.mjs', "import { appendFileSync } from 'node:fs'; appendFileSync('.git/info/exclude', '\\n/runner.mjs\\n');\n");
  const selected = selection([ref('subject.txt')], true);
  const workflow = baselineAuthorization(['test']);
  const plan = await planVerificationRun(root, workId, 'runner', selected, workflow);
  const result = await applyVerificationRun(root, workId, 'runner', plan.planId, selected, workflow);
  assert.equal(result.record.execution.exitCode, 0);
  assert.equal(result.record.staleAfterExecution, true);
  assert.equal(result.ready, false);
  assert.equal((await readVerificationRecords(root, workId)).length, 1);
});

test('sharing checks use the registered business repository instead of its ignored management path', async t => {
  const root = await setup(t, true);
  const businessRoot = join(root, 'repositories/app');
  put(businessRoot, 'subject.txt', 'Business source.\n');
  const selected = selection([ref('subject.txt', 'app')]);
  assert.equal((await capture(root, selected)).ready, true);
  ignore(businessRoot, 'subject.txt');
  await assert.rejects(capture(root, selected), /共享资料被 Git 忽略/u);
  assert.equal((await readVerificationRecords(root, workId)).length, 1);
});
