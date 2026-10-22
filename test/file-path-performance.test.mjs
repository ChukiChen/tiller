import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import * as files from '../dist/files.js';
import { fixture, put } from './helpers.mjs';

const readPaths = (root, paths) => files.assertSafePaths
  ? files.assertSafePaths(root, paths)
  : Promise.all(paths.map(path => files.assertSafePath(root, path)));

test('CASE-016 one path batch checks common parents once and independent batches start fresh', async t => {
  const root = fixture(t);
  const paths = Array.from({ length: 48 }, (_, index) => `common/deep/inputs/file-${index}.txt`);
  for (const path of paths) put(root, path, 'input\n');
  const original = fs.lstat;
  let calls = 0; let active = 0; let peak = 0;
  fs.lstat = async function(...args) {
    calls++; peak = Math.max(peak, ++active);
    try { return await original.apply(this, args); } finally { active--; }
  };
  syncBuiltinESMExports();
  try {
    assert.deepEqual(await readPaths(root, paths), paths.map(path => join(root, path)));
    const first = calls;
    assert.ok(first <= paths.length + 4, `Expected one check per common parent, got ${first}`);
    assert.equal(peak, 1, 'Batch savings must not depend on concurrent I/O.');
    await readPaths(root, paths);
    assert.equal(calls, first * 2);
    t.diagnostic(`48 paths: ${first} lstat calls per independent batch`);
  } finally { fs.lstat = original; syncBuiltinESMExports(); }
});

test('CASE-017 path batches preserve file links, bad parents and new changes between calls', async t => {
  const root = fixture(t);
  put(root, 'common/source.txt', 'source\n');
  await fs.link(join(root, 'common/source.txt'), join(root, 'common/hard.txt'));
  await assert.rejects(readPaths(root, ['common/hard.txt']), /硬链接/u);
  put(root, 'ordinary.txt', 'file');
  await assert.rejects(readPaths(root, ['ordinary.txt/child']), /父路径不是目录/u);
  await assert.rejects(readPaths(root, ['common/../escape']), /不安全/u);
  await readPaths(root, ['new/child.txt']);
  put(root, 'new', 'now a file');
  await assert.rejects(readPaths(root, ['new/child.txt']), /父路径不是目录/u);
});

test('CASE-018 one proof boundary reconciles declarations and observes revocation after material reads', async t => {
  const root = fixture(t);
  put(root, 'material.txt', 'current'); put(root, 'control.txt', 'approved');
  const proofs = [
    {root, inputs: [{path: 'material.txt', text: 'current'}]},
    {root, inputs: [{path: 'material.txt', sha256: createHash('sha256').update('current').digest('hex')}], maxBytes: 7},
    {root, inputs: [{path: 'control.txt', text: 'approved'}], control: true},
  ];
  const original = fs.readFile; let materialReads = 0; let revoke = false;
  fs.readFile = async function(target, ...args) {
    const bytes = await original.call(this, target, ...args);
    if (String(target) === join(root, 'material.txt')) {
      materialReads++; if (revoke) put(root, 'control.txt', 'revoked');
    }
    return bytes;
  };
  syncBuiltinESMExports();
  try {
    await files.proveTextInputs(proofs); assert.equal(materialReads, 1);
    revoke = true;
    await assert.rejects(files.proveTextInputs(proofs), /依据已变化/u);
    assert.equal(materialReads, 2, 'Each boundary performs its own fresh proof.');
    await assert.rejects(files.proveTextInputs([...proofs, {root, inputs: [{path: 'material.txt', text: 'other'}]}]), /声明不一致/u);
    await assert.rejects(files.proveTextInputs([...proofs, {root, inputs: [{path: 'material.txt', text: 'current'}], maxBytes: 3}]), /大小限制/u);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('CASE-019 an explicit operation input reads once, isolates roots and proves changes independently', async t => {
  const root = fixture(t); const other = fixture(t);
  put(root, 'input.txt', 'first'); put(other, 'input.txt', 'other');
  const input = new files.TextReadInput();
  const nativeRead = fs.readFile; let reads = 0;
  fs.readFile = async function(...args) { reads++; return nativeRead.apply(this, args); };
  syncBuiltinESMExports();
  try {
    const first = await files.readTextInputs(root, ['input.txt'], {maxBytes: 8}, input);
    first[0].text = 'caller mutation';
    assert.equal((await files.readTextInputs(root, ['input.txt'], {}, input))[0].text, 'first');
    assert.equal(reads, 1);
    assert.equal((await files.readTextInputs(other, ['input.txt'], {}, input))[0].text, 'other');
    await files.proveTextInputs(await input.proofs());
    put(root, 'input.txt', 'second');
    await assert.rejects(files.proveTextInputs(await input.proofs()), /依据已变化/u);
    assert.equal((await files.readTextInputs(root, ['input.txt'], {}, new files.TextReadInput()))[0].text, 'second');
    await assert.rejects(files.readTextInputs(root, ['input.txt'], {maxBytes: 2}, input), /大小限制/u);
    for (const maxBytes of [NaN, Infinity, -1, 1.5]) {
      await assert.rejects(files.readTextInputs(root, ['input.txt'], {maxBytes}, input), /非负安全整数/u);
      await assert.rejects(files.proveTextInputs([{root, inputs: [{path: 'input.txt', text: 'second'}], maxBytes}]), /非负安全整数/u);
    }
  } finally { fs.readFile = nativeRead; syncBuiltinESMExports(); }
});
