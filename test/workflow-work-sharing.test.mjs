import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWorkflowWork, addWorkflowOutput, resumeWorkflowWork } from '../dist/workflow-work.js';
import { WORKFLOW_FACTS } from '../dist/workflow-catalog.js';
import { fixture, gitRepository, put } from './helpers.mjs';

const workId = 'sharing';
const recordPath = `.tiller/work/${workId}/record.json`;
const ref = path => ({ repository: '.', path });
function intent(repositories = ['.']) {
  const scope = { repositories, targets: [workId] };
  return { operationId: 'create', expectedRevision: 0, workflow: 'analysis',
    goal: 'Inspect the declared fixture.', reason: 'Synthetic shared-source boundary.', scope,
    impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])),
    basis: [{ reference: ref('basis.md'), purpose: 'The fixture question.' }],
    actionSources: [{ actions: ['read', 'write-report'], reference: ref('request.md'), quote: 'Inspect this fixture.', scope }],
    expectedOutputs: ['report-output'], completionCriteria: ['Report the fixture result.'] };
}
async function setup(t, workspace = false) {
  const root = fixture(t); gitRepository(root, '.');
  if (workspace) gitRepository(root, 'business');
  await initialize({ root, ...(workspace ? { mode: 'workspace', repositories: ['business'] } : {}) });
  put(root, 'basis.md', '# Fixture question\nInspect this bounded source.\n');
  put(root, 'request.md', 'Inspect this fixture.\n');
  return root;
}
const output = source => ({ operationId: 'report', expectedRevision: 1, outputId: 'report-output', source });

test('work creation rejects ignored basis and action sources before persisting a record', async t => {
  const root = await setup(t);
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  for (const path of ['basis.md', 'request.md']) {
    put(root, '.gitignore', `${ignore}\n/${path}\n`);
    await assert.rejects(createWorkflowWork(root, workId, 'Shared fixture', intent()), /共享资料被 Git 忽略/u);
    assert.equal(existsSync(join(root, recordPath)), false);
  }
  put(root, '.gitignore', ignore);
  assert.equal((await createWorkflowWork(root, workId, 'Shared fixture', intent())).changed, true);
});

test('output registration checks the source repository ignore rules and preserves the current record', async t => {
  const root = await setup(t, true);
  await createWorkflowWork(root, workId, 'Shared fixture', intent(['.', 'business']));
  const before = readFileSync(join(root, recordPath), 'utf8');
  put(root, 'business/report.md', '# Business report\nThis source is ignored only in the business repository.\n');
  put(root, 'business/.gitignore', '/report.md\n');
  await assert.rejects(addWorkflowOutput(root, workId, output({ repository: 'business', path: 'report.md' })),
    /共享资料被 Git 忽略/u);
  assert.equal(readFileSync(join(root, recordPath), 'utf8'), before);
  put(root, 'business/.gitignore', '');
  assert.equal((await addWorkflowOutput(root, workId, output({ repository: 'business', path: 'report.md' }))).changed, true);
});

test('output source changes during the shared-path check still fail the final content proof', async t => {
  const root = await setup(t);
  await createWorkflowWork(root, workId, 'Shared fixture', intent());
  put(root, 'report.md', '# Report\nOriginal observation.\n');
  const before = readFileSync(join(root, recordPath), 'utf8');
  const nativeExec = childProcess.execFile;
  let changed = false;
  childProcess.execFile = function(file, args, options, callback) {
    if (file !== 'git' || args[0] !== 'check-ignore') return nativeExec.call(this, file, args, options, callback);
    return nativeExec.call(this, file, args, options, (...result) => {
      if (!changed) {
        changed = true;
        put(root, 'report.md', '# Report\nChanged after observation.\n');
      }
      callback(...result);
    });
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(addWorkflowOutput(root, workId, output(ref('report.md'))), { code: 'CONTENT_CHANGED' });
    assert.equal(changed, true);
    assert.equal(readFileSync(join(root, recordPath), 'utf8'), before);
  } finally { childProcess.execFile = nativeExec; syncBuiltinESMExports(); }
});

test('ordinary work resume does not spawn Git when recorded sources become ignored', async t => {
  const root = await setup(t);
  await createWorkflowWork(root, workId, 'Shared fixture', intent());
  put(root, 'report.md', '# Report\nThe registered result.\n');
  await addWorkflowOutput(root, workId, output(ref('report.md')));
  put(root, '.gitignore', `${readFileSync(join(root, '.gitignore'), 'utf8')}\n/report.md\n/request.md\n/${recordPath}\n`);
  const trace = join(root, '.tiller/local/resume-git.jsonl');
  writeFileSync(trace, '');
  const previous = process.env.GIT_TRACE2_EVENT; process.env.GIT_TRACE2_EVENT = trace;
  try {
    const resumed = await resumeWorkflowWork(root, workId);
    assert.equal(resumed.registrationReady, true);
    assert.equal(resumed.artifacts['report-output'].changedSinceRegistration, false);
    const starts = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(event => event.event === 'start');
    assert.deepEqual(starts, []);
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
});
