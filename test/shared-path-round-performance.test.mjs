import assert from 'node:assert/strict';
import { appendFileSync, linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { initialize, META } from '../dist/core.js';
import { applyChanges, readTextIfExists, readTextInputs, verifyTextInputs, withProjectLock } from '../dist/files.js';
import { assertSharedWritePaths, assertSharedWriteProofs } from '../dist/shared-paths.js';
import { fixture, gitRepository, put, repositoryFreeFixture } from './helpers.mjs';

async function project(t) {
  const root = fixture(t);
  gitRepository(root, '.');
  await initialize({ root });
  return root;
}
async function countIgnore(root, action) {
  const trace = join(root, '.tiller/local/shared-path-trace.jsonl');
  const previous = process.env.GIT_TRACE2_EVENT;
  writeFileSync(trace, ''); process.env.GIT_TRACE2_EVENT = trace;
  try {
    await action();
    return readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(event => event.event === 'start' && event.argv.includes('check-ignore')).length;
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
}

test('one write boundary merges eligibility declarations and independently detects a new ignore rule', async t => {
  const root = await project(t);
  put(root, 'docs/first.md', '# First\n'); put(root, 'docs/second.md', '# Second\n');
  const proofs = [
    {root, paths: ['docs/first.md']},
    {root, paths: ['docs/first.md', 'docs/second.md']},
  ];
  assert.equal(await countIgnore(root, () => assertSharedWriteProofs(proofs)), 1);
  assert.equal(await countIgnore(root, () => assertSharedWriteProofs(proofs)), 1, 'A new boundary performs a fresh Git check.');
  appendFileSync(join(root, '.gitignore'), '\n/docs/second.md\n');
  await assert.rejects(assertSharedWriteProofs(proofs), /被 Git 忽略/u);
});

test('batch text reads check inputs without Git and explicit proof rejects changed or newly created files', async t => {
  const root = await project(t);
  put(root, '.tiller/specs/a.md', 'a');
  appendFileSync(join(root, '.git/info/exclude'), '\n/.tiller/specs/a.md\n');
  let inputs;
  assert.equal(await countIgnore(root, async () => {
    inputs = await readTextInputs(root, ['.tiller/specs/a.md', '.tiller/specs/missing.md']);
    await verifyTextInputs(root, inputs);
  }), 0);
  assert.deepEqual(inputs, [{ path: '.tiller/specs/a.md', text: 'a' }, { path: '.tiller/specs/missing.md', text: null }]);
  put(root, '.tiller/specs/missing.md', 'new');
  await assert.rejects(verifyTextInputs(root, inputs), error => error.code === 'INPUT_CHANGED');
});

test('explicit text proof rejects changed, removed and replaced hard-linked inputs', async t => {
  const root = await project(t);
  const relative = '.tiller/specs/observed.md';
  const target = put(root, relative, 'Original bytes.');
  const inputs = await readTextInputs(root, [relative]);
  put(root, relative, 'Changed bytes.');
  await assert.rejects(verifyTextInputs(root, inputs), error => error.code === 'INPUT_CHANGED');
  unlinkSync(target);
  await assert.rejects(verifyTextInputs(root, inputs), error => error.code === 'INPUT_CHANGED');
  put(root, '.tiller/specs/replacement.md', 'Original bytes.');
  linkSync(join(root, '.tiller/specs/replacement.md'), target);
  await assert.rejects(verifyTextInputs(root, inputs), /硬链接/u);
});

test('shared writes batch long path lists through one Git stdin request', async t => {
  const root = await project(t);
  const paths = Array.from({ length: 1100 }, (_, index) => `.tiller/specs/material-${index}.md`);
  assert.equal(await countIgnore(root, () => assertSharedWritePaths(root, paths)), 1);
  appendFileSync(join(root, '.git/info/exclude'), '\n/.tiller/specs/material-1099.md\n');
  await assert.rejects(assertSharedWritePaths(root, paths), /共享资料被 Git 忽略/u);
});

test('repository discovery avoids non-repository processes and notices later and ancestor repositories', async t => {
  const root = repositoryFreeFixture(t);
  if (!root) return;
  await initialize({root});
  put(root, 'shared.md', 'A shared source.\n');
  assert.equal(await countIgnore(root, () => assertSharedWritePaths(root, ['shared.md'])), 0);
  gitRepository(root, '.');
  appendFileSync(join(root, '.git/info/exclude'), '\n/shared.md\n/nested/shared.md\n');
  await assert.rejects(assertSharedWritePaths(root, ['shared.md']), /忽略/u);
  put(root, 'nested/shared.md', 'Nested shared source.\n');
  await assert.rejects(assertSharedWritePaths(join(root, 'nested'), ['shared.md']), /忽略/u);
});

test('transaction boundary rejects ignored writes before journal or content changes', async t => {
  const root = await project(t);
  const relative = '.tiller/specs/hidden.md';
  appendFileSync(join(root, '.git/info/exclude'), `\n/${relative}\n`);
  await assert.rejects(withProjectLock(root, () => applyChanges(root, [{ path: relative, before: null, after: 'hidden' }])), /忽略/u);
  assert.equal(await readTextIfExists(root, relative), null);
  assert.equal(await readTextIfExists(root, '.tiller/local/transaction.json'), null);
});

test('batch readers reject hard links and invalid UTF8', async t => {
  const root = await project(t);
  put(root, '.tiller/specs/source.md', 'source');
  linkSync(join(root, '.tiller/specs/source.md'), join(root, '.tiller/specs/linked.md'));
  await assert.rejects(readTextInputs(root, ['.tiller/specs/linked.md']), /硬链接/u);
  put(root, '.tiller/specs/invalid.md', Buffer.from([0xff]));
  await assert.rejects(readTextInputs(root, ['.tiller/specs/invalid.md']), /UTF-8/u);
});

test('transaction refuses an unknown current or replacement metadata version', async t => {
  const root = await project(t);
  const original = await readTextIfExists(root, META);
  const invalid = JSON.stringify({ ...JSON.parse(original), resourceVersion: 'unknown' });
  await assert.rejects(withProjectLock(root, () => applyChanges(root, [{ path: META, before: original, after: invalid }])), /版本不受支持/u);
  put(root, META, invalid);
  await assert.rejects(withProjectLock(root, () => applyChanges(root, [{ path: '.tiller/specs/new.md', before: null, after: 'new' }])), /版本不受支持/u);
  assert.equal(await readTextIfExists(root, '.tiller/specs/new.md'), null);
});

test('batch input collection visits common parents once and reads each declared file once', async t => {
  const root = await project(t);
  put(root, '.tiller/specs/a.md', 'a');
  put(root, '.tiller/specs/b.md', 'b');
  const originalLstat = fs.lstat;
  const originalReadFile = fs.readFile;
  const stats = new Map();
  const reads = new Map();
  fs.lstat = async function(target, ...args) {
    stats.set(String(target), (stats.get(String(target)) ?? 0) + 1);
    return originalLstat.call(this, target, ...args);
  };
  fs.readFile = async function(target, ...args) {
    reads.set(String(target), (reads.get(String(target)) ?? 0) + 1);
    return originalReadFile.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  try {
    const inputs = await readTextInputs(root, ['.tiller/specs/a.md', '.tiller/specs/b.md', '.tiller/specs/a.md']);
    assert.equal(inputs.length, 3);
    assert.deepEqual(inputs.map(input => input.text), ['a', 'b', 'a']);
    assert.equal(stats.size, 5);
    assert.ok([...stats.values()].every(count => count === 1));
    assert.equal(reads.size, 2);
    assert.ok([...reads.values()].every(count => count === 1));
  } finally {
    fs.lstat = originalLstat; fs.readFile = originalReadFile; syncBuiltinESMExports();
  }
});

test('bounded text inputs reject oversized bytes before allocation and recheck growth after read', async t => {
  const root = await project(t);
  const relative = '.tiller/specs/bounded.md';
  const target = join(root, relative);
  put(root, relative, '中文');
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(filename, ...args) {
    if (String(filename) === target) reads++;
    return original.call(this, filename, ...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(readTextInputs(root, [relative], { maxBytes: 4 }), /大小限制/u);
    assert.equal(reads, 0, 'The UTF8 byte limit is checked from stat before reading.');
    put(root, relative, '中');
    const inputs = await readTextInputs(root, [relative], { maxBytes: 3 });
    assert.equal(inputs[0].text, '中');
    assert.equal(reads, 1);
    fs.readFile = async function(filename, ...args) {
      if (String(filename) === target) return Buffer.from('grew-during-read');
      return original.call(this, filename, ...args);
    };
    syncBuiltinESMExports();
    await assert.rejects(readTextInputs(root, [relative], { maxBytes: 3 }), /大小限制/u);
    fs.readFile = original; syncBuiltinESMExports();
    put(root, relative, 'expanded');
    await assert.rejects(verifyTextInputs(root, inputs, { maxBytes: 3 }), /大小限制/u);
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('text input limits accept zero for empty files and reject invalid option values', async t => {
  const root = await project(t);
  put(root, '.tiller/specs/empty.md', '');
  assert.equal((await readTextInputs(root, ['.tiller/specs/empty.md'], { maxBytes: 0 }))[0].text, '');
  for (const maxBytes of [-1, 0.5, Infinity, NaN]) {
    await assert.rejects(readTextInputs(root, [], { maxBytes }), /maxBytes/u);
  }
});
