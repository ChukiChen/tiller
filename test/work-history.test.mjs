import assert from 'node:assert/strict';
import { readFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { initialize } from '../dist/core.js';
import { inspectWork } from '../dist/work-history.js';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { fixture, put, snapshot } from './helpers.mjs';

async function project(t) { const root = fixture(t); await initialize({ root }); return root; }

test('inspection diagnoses README-only, handwritten entries and flat history without mutating files', async t => {
  const root = await project(t);
  put(root, '.tiller/work/readme/README.md', '# Process\n');
  put(root, '.tiller/work/manual/work.md', '# Process\n');
  put(root, '.tiller/work/old.md', '# Legacy\n');
  const before = snapshot(root);
  const inspected = await inspectWork(root);
  assert.equal(inspected.ready, false);
  const readme = inspected.works.find(work => work.id === 'readme');
  assert.equal(readme.registration, 'unregistered');
  assert.match(readme.structureIssues.join(' '), /work.md/);
  assert.match(readme.structureIssues.join(' '), /record.json/);
  assert.equal(inspected.works.find(work => work.id === 'old.md').registration, 'legacy-file');
  assert.equal(inspected.works.find(work => work.id === 'manual').structureIssues.length, 1);
  assert.deepEqual(snapshot(root), before);
});

test('inspection checks current references and missing artifacts without rewriting them', async t => {
  const root = await project(t);
  put(root, 'requirements.md', '# Requirements\nKeep original specification.\n');
  await createWorkflowFixtureAt(root, 'current');
  await addWorkflowOutput(root, 'current', { operationId: 'report', expectedRevision: 1, outputId: 'report-output', source: { repository: '.', path: 'requirements.md' } });
  assert.equal((await inspectWork(root, 'current')).ready, true);
  await rename(join(root, 'requirements.md'), join(root, 'renamed.md'));
  const before = snapshot(root);
  assert.match((await inspectWork(root, 'current')).issues.join(' '), /requirements.md/);
  assert.deepEqual(snapshot(root), before);
});

test('inspection rejects unregistered scope repositories even when artifacts remain local', async t => {
  const root = await project(t); await createWorkflowFixtureAt(root, 'current');
  const path = '.tiller/work/current/record.json';
  const record = JSON.parse(await readFile(join(root, path), 'utf8'));
  record.scope.repositories.push('unregistered'); put(root, path, JSON.stringify(record));
  const result = await inspectWork(root, 'current');
  assert.equal(result.ready, false);
  assert.match(result.works[0].structureIssues.join(' '), /未登记仓库/);
});

test('inspection rejects symlink access', async t => {
  const root = await project(t); await createWorkflowFixtureAt(root, 'current');
  await symlink(join(root, '.tiller/work/current'), join(root, '.tiller/work/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await inspectWork(root, 'linked')).works[0].registration, 'invalid');
});
