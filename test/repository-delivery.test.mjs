import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRepositoryRoot } from '../dist/delivery-location.js';
import { fixture, put } from './helpers.mjs';
import { join } from 'node:path';

function metadata(root, values = {}) {
  put(root, '.tiller/project.json', JSON.stringify({ schemaVersion: 1, resourceVersion: '0.3.1', mode: 'workspace', repositories: ['service-a'], repositoryPaths: { 'service-a': 'repositories/service-a' }, ...values }));
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

test('legacy registration without mappings preserves its direct repository location', async t => {
  const root = fixture(t);
  metadata(root, { resourceVersion: '0.3.0', repositoryPaths: undefined });
  put(root, 'service-a/code.txt', 'legacy');
  assert.equal(await resolveRepositoryRoot(root, 'service-a'), join(root, 'service-a'));
});
