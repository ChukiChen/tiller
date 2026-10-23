import assert from 'node:assert/strict';
import test from 'node:test';
import { readRepositoryRecords, repositoryPath, validateRepositoryMappings } from '../dist/repository-paths.js';

const record = (id, relative = id, extra = {}) => ({ id, path: relative, ...extra });
const metadata = (repositories, extra = {}) => ({
  mode: 'workspace', repositories, resourceVersion: '0.5.0', ...extra,
});

test('CASE-152 repository paths preserve explicitly registered direct and grouped layouts', () => {
  assert.equal(repositoryPath(metadata([record('service-a', 'repositories/service-a')]), 'service-a'), 'repositories/service-a');
  assert.equal(repositoryPath(metadata([record('service-a', 'service-a')]), 'service-a'), 'service-a');
  assert.equal(repositoryPath(metadata([record('service-a', 'repositories/service-a')]), '.'), '.');
  assert.throws(() => repositoryPath(metadata([record('service-a', 'repositories/service-a')]), 'missing'), /仓库/);
});

test('CASE-030 repository mapping validation rejects ambiguous, escaping, incomplete and reserved mappings', () => {
  for (const repositories of [
    [record('service-a', '../service-a')],
    [record('service-a', 'repositories/other')],
    [record('service-a', 'Repositories/service-a')],
    [record('service-a', 'service-a', { extra: 'extra' })],
    [record('Service-a', 'repositories/service-a')],
  ]) {
    assert.throws(() => validateRepositoryMappings(metadata(repositories)), /仓库|映射/);
  }
  for (const repositoryPaths of [undefined, null, [], {}, { 'service-a': '../service-a' },
    { 'service-a': 'repositories/other' }, { 'service-a': 'repositories/service-a', extra: 'extra' }]) {
    assert.throws(() => {
      const repositories = readRepositoryRecords({ repositories: ['service-a'], repositoryPaths });
      validateRepositoryMappings(metadata(repositories));
    }, /仓库|映射/);
  }
  for (const id of ['.git', '.tiller', 'repositories', 'CON', 'aux.txt', '../a', 'a/b', 'a\\b', 'a.', 'a ']) {
    assert.throws(() => validateRepositoryMappings(metadata([record(id)])), /仓库|不安全/);
  }
  assert.throws(() => validateRepositoryMappings(metadata([record('a'), record('A')])), /仓库/);
  assert.doesNotThrow(() => validateRepositoryMappings(metadata([], { mode: 'project' })));
  assert.throws(() => validateRepositoryMappings(metadata([record('extra')], { mode: 'project' })), /仓库/);
  assert.throws(() => validateRepositoryMappings(metadata([record('service-a')], { resourceVersion: '99.0.0' })), /版本不受支持/);
  assert.throws(() => readRepositoryRecords({
    repositories: [record('service-a')], repositoryPaths: { 'service-a': 'service-a' },
  }), /repositoryPaths/);
});

test('CASE-153 historical versions cannot supply or infer repository mappings', () => {
  for (const resourceVersion of ['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3', '0.3.4', '0.3.5', '0.3.6']) {
    for (const repositories of [[record('service-a')], [record('service-a', 'repositories/service-a')]]) {
      assert.throws(() => repositoryPath(metadata(repositories, { resourceVersion }), 'service-a'), /版本不受支持/u);
    }
  }
  assert.equal(repositoryPath(metadata([record('service-a')], { resourceVersion: '0.4.0' }), 'service-a'), 'service-a');
  assert.throws(() => readRepositoryRecords({ repositories: ['service-a'] }), /映射/u);
  assert.doesNotThrow(() => validateRepositoryMappings(metadata([], { mode: 'project' })));
  assert.deepEqual(readRepositoryRecords({ repositories: [], repositoryPaths: {} }), []);
});
