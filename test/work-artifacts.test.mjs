import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { resumeWork, checkWork, parseWorkRecord } from '../dist/work.js';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { createWorkflowFixtureAt, workflowCategories } from './workflow-fixtures.mjs';
import { fixture, put, snapshot, gitRepository } from './helpers.mjs';

const ref = path => ({ repository: '.', path });
const record = (root, id) => JSON.parse(readFileSync(join(root, `.tiller/work/${id}/record.json`), 'utf8'));
async function draft(t, id = 'analysis') {
  const root = fixture(t); await initialize({ root });
  await createWorkflowFixtureAt(root, id);
  return root;
}
const output = (source, extra = {}) => ({ operationId: 'add-output', expectedRevision: 1, outputId: 'report-output', source, ...extra });

test('current work references shared specifications without copying content or claiming completion', async t => {
  const root = await draft(t);
  put(root, '.tiller/specs/existing.md', '# Existing report\nPreserve this source byte for byte.\n');
  const source = ref('.tiller/specs/existing.md');
  const original = readFileSync(join(root, source.path));
  const notes = readFileSync(join(root, '.tiller/work/analysis/work.md'));
  const input = output(source);
  await addWorkflowOutput(root, 'analysis', input);
  const before = snapshot(root);
  assert.equal((await addWorkflowOutput(root, 'analysis', input)).changed, false);
  assert.deepEqual(snapshot(root), before);
  const resumed = await resumeWork(root, 'analysis');
  assert.equal(resumed.artifacts['report-output'].origin, 'reference');
  assert.equal(resumed.artifacts['report-output'].status, 'draft');
  assert.equal(resumed.registrationReady, true);
  assert.equal(resumed.ready, false);
  assert.equal(resumed.stageExecution, 'not-evaluated');
  assert.equal(resumed.acceptanceStatus, 'not-evaluated');
  assert.deepEqual(readFileSync(join(root, source.path)), original);
  assert.deepEqual(readFileSync(join(root, '.tiller/work/analysis/work.md')), notes);
  assert.equal(existsSync(join(root, '.tiller/work/analysis/report-output.md')), false);
  put(root, source.path, '# Changed report\nChanged referenced bytes.\n');
  assert.equal((await resumeWork(root, 'analysis')).artifacts['report-output'].changedSinceRegistration, true);
});

test('output registration rejects conflicting source and stale revision without overwriting originals', async t => {
  const root = await draft(t);
  put(root, 'report.md', '# Report\nActual report.\n');
  put(root, 'other.md', '# Other\nSeparate source.\n');
  await addWorkflowOutput(root, 'analysis', output(ref('report.md')));
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'analysis', output(ref('other.md'))));
  await assert.rejects(addWorkflowOutput(root, 'analysis', output(ref('other.md'), { operationId: 'new-output' })), { code: 'REVISION_CONFLICT' });
  await assert.rejects(addWorkflowOutput(root, 'analysis', output(ref('other.md'), { operationId: 'conflict', expectedRevision: 2 })));
  assert.deepEqual(snapshot(root), before);
});

test('external artifact references require registered stable identity and explicit work scope', async t => {
  const root = fixture(t); const repository = gitRepository(root, 'repositories/service-a');
  await initialize({ root, mode: 'workspace', repositories: ['repositories/service-a'] });
  put(repository, 'report.md', '# Report\nShared business evidence.\n');
  await createWorkflowFixtureAt(root, 'local');
  const source = { repository: 'service-a', path: 'report.md' };
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'local', output(source)), /范围/);
  await assert.rejects(addWorkflowOutput(root, 'local', output(ref('repositories/service-a/report.md'))), /仓库|标识/);
  assert.deepEqual(snapshot(root), before);
  await createWorkflowFixtureAt(root, 'cross', 'analysis', { scope: { repositories: ['.', 'service-a'], targets: ['cross'] } });
  await addWorkflowOutput(root, 'cross', output(source));
  const current = await resumeWork(root, 'cross');
  assert.deepEqual(current.artifacts['report-output'].source, source);
  assert.equal(current.registrationReady, true);
  assert.equal(current.ready, false);
});

for (const schemaVersion of [1, 2, 3, 5, null]) {
  test(`unsupported work schema ${schemaVersion} rejects access and preserves original files`, async t => {
    const root = await draft(t);
    const old = { ...record(root, 'analysis'), schemaVersion };
    put(root, '.tiller/work/analysis/record.json', JSON.stringify(old));
    const before = snapshot(root);
    await assert.rejects(resumeWork(root, 'analysis'), { code: 'UNSUPPORTED_RECORD_VERSION' });
    assert.equal((await checkWork(root, 'analysis')).ready, false);
    await assert.rejects(addWorkflowOutput(root, 'analysis', output(ref('report.md'))), { code: 'UNSUPPORTED_RECORD_VERSION' });
    assert.deepEqual(snapshot(root), before);
  });
}

test('reference inputs reject private files and process entries without registering artifacts', async t => {
  const root = await draft(t);
  put(root, '.tiller/work/other/work.md', '# Process\nProcess notes.\n');
  const before = snapshot(root);
  for (const source of [ref('../outside.md'), ref('.tiller/local/a.md'), ref('.git/a.md'), ref('.tiller/work/other/work.md'), { repository: '../outside', path: 'a.md' }]) {
    await assert.rejects(addWorkflowOutput(root, 'analysis', output(source)));
  }
  await assert.rejects(addWorkflowOutput(root, 'analysis', { ...output(ref('report.md')), approved: true }));
  assert.deepEqual(snapshot(root), before);
});

test('handwritten work is diagnosed and never silently adopted by current creation', async t => {
  const root = fixture(t); await initialize({ root });
  // Shared action source belongs to fixture preparation, before the preservation snapshot.
  put(root, 'instruction.md', '# Synthetic authorization\nInspect and record the declared fixture outputs.\n');
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [], requirements: [], categories: workflowCategories, suites: [] }));
  put(root, '.tiller/work/notes/README.md', '# Existing notes\nRetain the original content.\n');
  const before = snapshot(root);
  const checked = await checkWork(root, 'notes');
  assert.equal(checked.ready, false);
  assert.equal(checked.registration, 'unregistered');
  assert.match(checked.issues.join(' '), /work.md/);
  assert.match(checked.issues.join(' '), /record.json/);
  await assert.rejects(createWorkflowFixtureAt(root, 'notes'), { code: 'WORK_EXISTS' });
  assert.deepEqual(snapshot(root), before);
});

test('current nested artifact records reject unknown fields and inherited completion', async t => {
  const root = await draft(t);
  put(root, 'report.md', '# Report\nRecorded current output.\n');
  await addWorkflowOutput(root, 'analysis', output(ref('report.md')));
  const valid = record(root, 'analysis');
  for (const select of [value => value, value => value.scope, value => value.workflow,
    value => value.artifacts['report-output'], value => value.artifacts['report-output'].source,
    value => value.actionSources[0], value => value.actionSources[0].scope, value => value.operations[0]]) {
    const invalid = structuredClone(valid); select(invalid).unrecognized = true;
    assert.throws(() => parseWorkRecord(JSON.stringify(invalid), 'analysis'));
  }
  const invalid = structuredClone(valid); invalid.artifacts['report-output'].status = 'complete';
  assert.throws(() => parseWorkRecord(JSON.stringify(invalid), 'analysis'));
});
