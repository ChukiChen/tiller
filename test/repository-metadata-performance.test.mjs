import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize, readRepositoryMetadata, META } from '../dist/core.js';
import { readTextInputs, verifyTextInputs } from '../dist/files.js';
import { resolveRepositoryRoot, resolveRepositoryRootFromMetadata } from '../dist/delivery-location.js';
import { fixture, gitRepository, put } from './helpers.mjs';

test('repository metadata has no hidden read round and observes each independent read', async t => {
  const root = fixture(t);
  await initialize({ root });
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(target, ...args) {
    if (String(target) === join(root, META)) reads++;
    return original.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  try {
    const first = await readRepositoryMetadata(root);
    assert.equal(reads, 1);
    put(root, META, JSON.stringify({ ...first, createdAt: '2026-01-01T00:00:00.000Z' }));
    const second = await readRepositoryMetadata(root);
    assert.equal(reads, 2);
    assert.notEqual(first.createdAt, second.createdAt);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('explicit metadata inputs can be verified without implicit source retention', async t => {
  const root = fixture(t);
  await initialize({ root });
  const inputs = await readTextInputs(root, [META]);
  const metadata = JSON.parse(inputs[0].text);
  put(root, META, JSON.stringify({ ...metadata, createdAt: '2026-01-02T00:00:00.000Z' }));
  await assert.rejects(verifyTextInputs(root, inputs), error => error.code === 'INPUT_CHANGED');
});

test('explicit repository metadata locates registered roots without re-reading the mapping', async t => {
  const root = fixture(t);
  gitRepository(root, 'repositories/app');
  await initialize({ root, mode: 'workspace', repositories: ['repositories/app'] });
  const metadata = await readRepositoryMetadata(root);
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(target, ...args) {
    if (String(target) === join(root, META)) reads++;
    return original.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  try {
    for (let index = 0; index < 3; index++) {
      assert.equal(await resolveRepositoryRootFromMetadata(root, 'app', metadata), join(root, 'repositories/app'));
    }
    assert.equal(reads, 0);
    assert.equal(await resolveRepositoryRoot(root, 'app'), join(root, 'repositories/app'));
    assert.equal(reads, 1);
    await assert.rejects(resolveRepositoryRootFromMetadata(root, 'other', metadata), /未登记|仓库/u);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});
