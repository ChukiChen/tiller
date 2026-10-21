import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRepositoryRoot } from '../dist/delivery-location.js';
import { REQUIRED_MANAGED } from '../dist/project-metadata.js';
import { fixture, put, snapshot } from './helpers.mjs';
import { join } from 'node:path';

function metadata(root, values = {}) {
  put(root, '.tiller/project.json', JSON.stringify({ schemaVersion: 1, resourceVersion: '0.5.0',
    createdAt: '2026-10-20T00:00:00.000Z', managedFiles: Object.fromEntries(REQUIRED_MANAGED.map(name => [name, '0'.repeat(64)])),
    mode: 'workspace', repositories: ['service-a'], repositoryPaths: { 'service-a': 'repositories/service-a' }, ...values }));
}

test('repository resolution uses explicit registration, never interprets paths as logical IDs', async t => {
  const root = fixture(t);
  metadata(root);
  put(root, 'repositories/service-a/code.txt', 'business');
  assert.equal(await resolveRepositoryRoot(root, 'service-a'), join(root, 'repositories/service-a'));
  await assert.rejects(resolveRepositoryRoot(root, 'repositories/service-a'));
  await assert.rejects(resolveRepositoryRoot(root, 'unknown'));
  metadata(root, { schemaVersion: 999 });
  await assert.rejects(resolveRepositoryRoot(root, 'service-a'));
  metadata(root, { resourceVersion: '99.0.0' });
  await assert.rejects(resolveRepositoryRoot(root, 'service-a'));
  metadata(root, { repositoryPaths: { 'service-a': '../escape' } });
  await assert.rejects(resolveRepositoryRoot(root, 'service-a'));
});

test('current registration preserves an explicit direct repository location', async t => {
  const root = fixture(t);
  metadata(root, { repositoryPaths: { 'service-a': 'service-a' } });
  put(root, 'service-a/code.txt', 'current');
  assert.equal(await resolveRepositoryRoot(root, 'service-a'), join(root, 'service-a'));
});

test('old resource versions reject both mapped and unmapped registrations without changing files', async t => {
  const root = fixture(t);
  put(root, 'service-a/code.txt', 'retained old content');
  for (const repositoryPaths of [undefined, { 'service-a': 'service-a' }]) {
    metadata(root, { resourceVersion: '0.3.0', repositoryPaths });
    const before = snapshot(root);
    await assert.rejects(resolveRepositoryRoot(root, 'service-a'));
    assert.deepEqual(snapshot(root), before);
  }
});
