import assert from 'node:assert/strict';
import test from 'node:test';
import { repositoryPath, validateRepositoryMappings } from '../dist/repository-paths.js';

const metadata = (repositoryPaths, extra = {}) => ({
  mode: 'workspace', repositories: ['service-a'], resourceVersion: '0.5.0', repositoryPaths, ...extra,
});

test('CASE-152 repository paths preserve explicitly registered direct and grouped layouts', () => {
  assert.equal(repositoryPath(metadata({ 'service-a': 'repositories/service-a' }), 'service-a'), 'repositories/service-a');
  assert.equal(repositoryPath(metadata({ 'service-a': 'service-a' }), 'service-a'), 'service-a');
  assert.equal(repositoryPath(metadata({ 'service-a': 'repositories/service-a' }), '.'), '.');
  assert.throws(() => repositoryPath(metadata({ 'service-a': 'repositories/service-a' }), 'missing'), /仓库/);
});

test('CASE-030 repository mapping validation rejects ambiguous, escaping, incomplete and reserved mappings', () => {
  for (const mapping of [undefined, null, [], {}, { 'service-a': '../service-a' },
    { 'service-a': 'repositories/other' }, { 'service-a': 'Repositories/service-a' },
    { 'service-a': 'repositories/service-a', extra: 'extra' }, { 'Service-a': 'Service-a' }]) {
    assert.throws(() => validateRepositoryMappings(metadata(mapping)), /仓库|映射/);
  }
  for (const id of ['.git', '.tiller', 'repositories', 'CON', 'aux.txt', '../a', 'a/b', 'a\\b', 'a.', 'a ']) {
    assert.throws(() => validateRepositoryMappings(metadata({ [id]: id }, { repositories: [id] })), /仓库|不安全/);
  }
  assert.throws(() => validateRepositoryMappings(metadata({ a: 'a', A: 'A' }, { repositories: ['a', 'A'] })), /仓库/);
  assert.doesNotThrow(() => validateRepositoryMappings(metadata({}, { mode: 'project', repositories: [] })));
  assert.throws(() => validateRepositoryMappings(metadata({ extra: 'extra' }, { mode: 'project', repositories: [] })), /映射/);
  assert.throws(() => validateRepositoryMappings(metadata({ 'service-a': 'service-a' }, { resourceVersion: '99.0.0' })), /版本不受支持/);
});


test('CASE-153 historical versions cannot supply or infer repository mappings', () => {
  for (const resourceVersion of ['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3', '0.3.4', '0.3.5', '0.3.6']) {
    for (const mapping of [undefined, { 'service-a': 'service-a' }, { 'service-a': 'repositories/service-a' }]) {
      assert.throws(() => repositoryPath(metadata(mapping, { resourceVersion }), 'service-a'), /版本不受支持/u);
    }
  }
  assert.equal(repositoryPath(metadata({ 'service-a': 'service-a' }, { resourceVersion: '0.4.0' }), 'service-a'), 'service-a');
  assert.throws(() => validateRepositoryMappings(metadata(undefined, { mode: 'project', repositories: [] })), /映射/u);
});
