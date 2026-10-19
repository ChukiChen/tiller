import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { cli, confirmFixture, failure, fixture, put, snapshot, success } from './helpers.mjs';

test('CLI creates references and adds design to the same work only after matching confirmation', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const id = '20261015-outline';
  const source = '.tiller/specs/requirements.md';
  put(root, source, '# Requirements\nStore local notes and search by exact title.\n');
  put(root, 'artifact.json', JSON.stringify({ type: 'product-requirements', source: { repository: '.', path: source } }));
  success(cli(root, 'work', 'create', id, '--title', 'Notes', '--input', 'artifact.json'));
  assert.equal(existsSync(join(root, `.tiller/work/${id}/requirements.md`)), false);
  const before = snapshot(root);
  failure(cli(root, 'work', 'add', id, '--type', 'product-design', '--requirements-request', 'req-1'));
  assert.deepEqual(snapshot(root), before);
  confirmFixture(root, id, [source], 'req-1', 'requirements');
  success(cli(root, 'work', 'add', id, '--type', 'product-design', '--requirements-request', 'req-1'));
  assert.equal(success(cli(root, 'work', 'add', id, '--type', 'product-design', '--requirements-request', 'req-1')).changed, false);
  const resumed = success(cli(root, 'work', 'resume', id));
  assert.deepEqual(Object.keys(resumed.artifacts).sort(), ['design', 'requirements']);
  success(cli(root, 'work', 'inspect', '--all'));
  const stable = snapshot(root);
  assert.equal(failure(cli(root, 'work', 'complete', id, '--evidence', 'review.md')).error.code, 'ARTIFACT_REQUIRED');
  assert.deepEqual(snapshot(root), stable);
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
  assert.match(inspected.issues.join(' '), /版本 2.*版本 3/);
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
