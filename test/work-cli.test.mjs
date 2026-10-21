import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { cli, failure, fixture, put, snapshot, success } from './helpers.mjs';

test('CLI adds referenced outputs without copying sources and preserves revision/idempotency', async t => {
  const root = fixture(t); success(cli(root, 'init'));
  const id = '20261015-outline'; await createWorkflowFixtureAt(root, id);
  const source = '.tiller/specs/scope.md';
  put(root, source, '# Scope\nInspect local notes and report the observed result.\n');
  put(root, 'artifact.json', JSON.stringify({ operationId: 'scope-output', expectedRevision: 1, outputId: 'scope-output', source: { repository: '.', path: source } }));
  success(cli(root, 'work', 'add', id, '--input', 'artifact.json'));
  assert.equal(existsSync(join(root, `.tiller/work/${id}/scope-output.md`)), false);
  assert.equal(success(cli(root, 'work', 'add', id, '--input', 'artifact.json')).changed, false);
  const before = snapshot(root);
  const resumed = success(cli(root, 'work', 'resume', id));
  assert.ok(resumed.artifacts['scope-output']);
  success(cli(root, 'work', 'inspect', '--all'));
  assert.equal(failure(cli(root, 'work', 'complete', id)).error.code, 'INVALID_ARGUMENT');
  assert.deepEqual(snapshot(root), before);
});

test('CLI rejects removed adoption and migration commands without modifying old files', t => {
  const root = fixture(t); success(cli(root, 'init'));
  const id = 'history';
  put(root, '.tiller/work/history/work.md', '# Historical process\nKeep original notes.\n');
  put(root, '.tiller/work/history/record.json', JSON.stringify({ schemaVersion: 2, id }));
  const before = snapshot(root);
  for (const command of ['adopt', 'migrate-confirmations']) {
    assert.equal(failure(cli(root, 'work', command, id)).error.code, 'INVALID_ARGUMENT');
  }
  const inspected = failure(cli(root, 'work', 'inspect', id));
  assert.equal(inspected.works[0].registration, 'unsupported');
  assert.match(inspected.issues.join(' '), /版本 2.*版本 4/);
  assert.equal(failure(cli(root, 'work', 'resume', id)).error.code, 'UNSUPPORTED_RECORD_VERSION');
  assert.deepEqual(snapshot(root), before);
});

test('CLI rejects ambiguous artifact options without writing', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const before = snapshot(root);
  for (const args of [
    ['create', 'notes', '--title', 'Notes', '--type', 'product-requirements', '--input', 'input.json'],
    ['add', 'notes'], ['bind', 'notes', '--artifact', 'requirements'],
    ['inspect', 'notes', '--all'], ['adopt', 'notes', '--input', 'input.json'],
    ['adopt', 'notes', '--input', 'input.json', '--plan', '--apply', 'fake'],
  ]) {
    const result = cli(root, 'work', ...args);
    assert.equal(failure(result).error.code, 'INVALID_ARGUMENT');
    assert.equal(result.status, 2);
    assert.deepEqual(snapshot(root), before);
  }
});
