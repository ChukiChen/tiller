import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('CLI inspects and adopts historical material with explicit input and stale-plan protection', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const id = 'history';
  put(root, '.tiller/work/history/README.md', '# Process\nOriginal process notes are retained.\n');
  put(root, '.tiller/work/history/needs.md', '# Requirements\nKeep existing notes.\n');
  const original = snapshot(root);
  const inspected = failure(cli(root, 'work', 'inspect', id));
  assert.match(JSON.stringify(inspected), /work\.md/);
  assert.deepEqual(snapshot(root), original);
  const checked = failure(cli(root, 'work', 'check', id));
  assert.match(JSON.stringify(checked), /work\.md/);
  const input = {
    title: 'History', level: 'change', scope: { repositories: ['.'], targets: [id] },
    entry: { repository: '.', path: '.tiller/work/history/README.md' },
    artifacts: { requirements: { type: 'change-requirements', source: { repository: '.', path: '.tiller/work/history/needs.md' } } },
  };
  put(root, 'adoption.json', JSON.stringify(input));
  const plan = success(cli(root, 'work', 'adopt', id, '--input', 'adoption.json', '--plan'));
  put(root, 'adoption.json', JSON.stringify(input, null, 2));
  const stale = snapshot(root);
  failure(cli(root, 'work', 'adopt', id, '--input', 'adoption.json', '--apply', plan.planId));
  assert.deepEqual(snapshot(root), stale);
  const fresh = success(cli(root, 'work', 'adopt', id, '--input', 'adoption.json', '--plan'));
  success(cli(root, 'work', 'adopt', id, '--input', 'adoption.json', '--apply', fresh.planId));
  success(cli(root, 'work', 'inspect', id));
  assert.equal(readFileSync(join(root, '.tiller/work/history/README.md')).toString('base64'), original['.tiller/work/history/README.md']);
  const stable = snapshot(root);
  const duplicate = failure(cli(root, 'work', 'adopt', id, '--input', 'adoption.json', '--plan'));
  assert.ok(duplicate.conflicts.length);
  assert.deepEqual(snapshot(root), stable);
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
