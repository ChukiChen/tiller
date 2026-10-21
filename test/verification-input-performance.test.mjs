import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { initialize, inspectProject, META } from '../dist/core.js';
import { readTextInputs, verifyTextInputs } from '../dist/files.js';
import * as verification from '../dist/verification-cases.js';
import { fixture, gitRepository, put } from './helpers.mjs';

const ref = (path, binary = false, repository = '.') => ({ repository, path, ...(binary ? { binary } : {}) });
const readInputs = verification.readVerificationInputs;
async function project(t) {
  const root = fixture(t); gitRepository(root, '.'); await initialize({ root }); return root;
}
async function countGit(root, fn) {
  const trace = join(root, '.tiller/local/input-git-trace.jsonl');
  const previous = process.env.GIT_TRACE2_EVENT; writeFileSync(trace, ''); process.env.GIT_TRACE2_EVENT = trace;
  try {
    const value = await fn();
    const events = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(event => event.event === 'start');
    return { value, events, count: events.length };
  } finally { if (previous === undefined) delete process.env.GIT_TRACE2_EVENT; else process.env.GIT_TRACE2_EVENT = previous; }
}
async function duringRead(path, mutate, fn) {
  const original = fs.readFile; let changed = false;
  fs.readFile = async function(target, ...args) {
    const value = await original.call(this, target, ...args);
    if (!changed && String(target) === path) { changed = true; await mutate(); }
    return value;
  };
  syncBuiltinESMExports();
  try { return await fn(); } finally { fs.readFile = original; syncBuiltinESMExports(); assert.equal(changed, true); }
}

test('input batch reads current files without Git checks', async t => {
  const root = await project(t); const refs = Array.from({ length: 24 }, (_, i) => ref(`inputs/${i}.txt`));
  refs.forEach((value, i) => put(root, value.path, `input ${i}\n`));
  const first = await countGit(root, () => readInputs(root, refs));
  assert.deepEqual(first.value, refs.map((_, i) => `input ${i}\n`));
  t.diagnostic(`24 input files: ${first.count} Git calls`);
  assert.equal(first.count, 0, 'Input reads do not perform shared-write or project-health checks.');
  put(root, refs[0].path, 'fresh\n');
  const second = await countGit(root, () => readInputs(root, refs));
  assert.equal(second.value[0], 'fresh\n'); assert.equal(second.count, first.count);
});

test('input batch reads duplicate text and binary references once while preserving requested order', async t => {
  const root = await project(t);
  const file = put(root, 'shared.txt', 'Shared bytes.\n');
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(target, ...args) {
    if (String(target) === file) reads++;
    return original.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  try {
    const values = await readInputs(root, [ref('shared.txt'), ref('shared.txt', true), ref('shared.txt')]);
    assert.deepEqual(values, ['Shared bytes.\n', Buffer.from('Shared bytes.\n'), 'Shared bytes.\n']);
    assert.equal(reads, 1, 'One declared input batch reads each physical input once.');
    put(root, 'shared.txt', 'Fresh independent read.\n');
    assert.deepEqual(await readInputs(root, [ref('shared.txt')]), ['Fresh independent read.\n']);
    assert.equal(reads, 2, 'Another input batch reads the current bytes again.');
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('mixed references retain text validation regardless of input order', async t => {
  const root = await project(t);
  put(root, 'mixed.bin', Buffer.from([0xff]));
  for (const refs of [[ref('mixed.bin', true), ref('mixed.bin')], [ref('mixed.bin'), ref('mixed.bin', true)]]) {
    await assert.rejects(readInputs(root, refs), /UTF-8/u);
  }
  put(root, 'mixed.bin', '');
  await fs.truncate(join(root, 'mixed.bin'), 4 * 1024 * 1024 + 1);
  await assert.rejects(readInputs(root, [ref('mixed.bin', true), ref('mixed.bin')]), /4 MiB/u);
});

test('repeated references still count toward the declared aggregate size limit', async t => {
  const root = await project(t);
  put(root, 'repeated.bin', '');
  await fs.truncate(join(root, 'repeated.bin'), 33 * 1024 * 1024);
  await assert.rejects(readInputs(root, [ref('repeated.bin', true), ref('repeated.bin', true)]), /容量/u);
});

test('input batch accepts ignored inputs but rejects invalid text and private references', async t => {
  const root = await project(t); put(root, 'visible.txt', 'visible\n'); put(root, 'ignored.bin', Buffer.from([0, 255, 1]));
  appendFileSync(join(root, '.gitignore'), '\n/ignored.bin\n');
  const values = await readInputs(root, [ref('visible.txt'), ref('ignored.bin', true)]);
  assert.equal(values[0], 'visible\n'); assert.deepEqual(values[1], Buffer.from([0, 255, 1]));
  await assert.rejects(readInputs(root, [ref('ignored.bin')]), /UTF-8/u);
  put(root, 'ignored.txt', 'Readable ignored text.\n');
  appendFileSync(join(root, '.gitignore'), '\n/ignored.txt\n');
  assert.deepEqual(await readInputs(root, [ref('ignored.txt')]), ['Readable ignored text.\n']);
  put(root, 'bad.txt', Buffer.from([255])); await assert.rejects(readInputs(root, [ref('bad.txt')]), /UTF-8/u);
  for (const path of ['.tiller/local/secret.txt', '.git/config', 'node_modules/package.json']) await assert.rejects(readInputs(root, [ref(path, true)]));
});

test('input batch rejects links and wrong repository identity without changing files', async t => {
  const root = await project(t); put(root, 'real.txt', 'source\n'); await fs.link(join(root, 'real.txt'), join(root, 'hard.txt'));
  await assert.rejects(readInputs(root, [ref('hard.txt')]), /硬链接/u);
  await assert.rejects(readInputs(root, [ref('hard.txt', true)]), /硬链接/u);
  await assert.rejects(readInputs(root, [ref('anything.txt', false, 'unknown')]), /未登记/u);
  assert.equal(readFileSync(join(root, 'real.txt'), 'utf8'), 'source\n');
});

test('input batch leaves changing Git ignore rules to explicit shared-write checks', async t => {
  const root = await project(t); const path = put(root, 'subject.txt', 'subject\n');
  await duringRead(path, () => appendFileSync(join(root, '.gitignore'), '\n/subject.txt\n'), async () => {
    assert.deepEqual(await readInputs(root, [ref('subject.txt')]), ['subject\n']);
  });
});

test('input batch leaves unrelated managed-resource changes to explicit project inspection', async t => {
  const root = await project(t); const path = put(root, 'subject.txt', 'subject\n');
  await duringRead(path, () => appendFileSync(join(root, '.tiller/rules/core.md'), '\nChanged during read.\n'), async () => {
    assert.deepEqual(await readInputs(root, [ref('subject.txt')]), ['subject\n']);
  });
  const inspection = await inspectProject(root);
  assert.equal(inspection.ready, false);
  assert.match(inspection.issues.join('\n'), /内容已变化/u);
});

test('explicit metadata proof rejects changes during an input read', async t => {
  const root = await project(t); const path = put(root, 'subject.txt', 'subject\n');
  const metadataPath = join(root, '.tiller/project.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const inputs = await readTextInputs(root, [META]);
  await duringRead(path, () => writeFileSync(metadataPath, JSON.stringify({ ...metadata, mode: 'workspace' })), async () => {
    assert.deepEqual(await readInputs(root, [ref('subject.txt')]), ['subject\n']);
    await assert.rejects(verifyTextInputs(root, inputs), error => error.code === 'INPUT_CHANGED');
  });
  await assert.rejects(readInputs(root, [ref('subject.txt')]), /工程模式与仓库范围不一致|仓库/u);
});

test('input batch keeps stable repository identity and rejects aliases through the management root', async t => {
  const root = fixture(t); gitRepository(root, '.'); gitRepository(root, 'repositories/app');
  await initialize({ root, mode: 'workspace', repositories: ['repositories/app'] });
  put(root, 'spec.txt', 'management\n'); put(root, 'repositories/app/source.txt', 'business\n');
  assert.deepEqual(await readInputs(root, [ref('spec.txt'), ref('source.txt', false, 'app')]), ['management\n', 'business\n']);
  await assert.rejects(readInputs(root, [ref('repositories/app/source.txt')]), /登记仓库标识/u);
  await assert.rejects(readInputs(root, [ref('repositories/app/source.txt', true)]), /登记仓库标识/u);
});

test('input batch enforces single-file, aggregate and count bounds before returning buffers', async t => {
  const root = await project(t);
  put(root, 'large.txt', ''); await fs.truncate(join(root, 'large.txt'), 4 * 1024 * 1024 + 1);
  await assert.rejects(readInputs(root, [ref('large.txt')]), /4 MiB/u);
  put(root, 'large.bin', ''); await fs.truncate(join(root, 'large.bin'), 64 * 1024 * 1024 + 1);
  await assert.rejects(readInputs(root, [ref('large.bin', true)]), /64 MiB/u);
  put(root, 'a.bin', ''); put(root, 'b.bin', '');
  await fs.truncate(join(root, 'a.bin'), 33 * 1024 * 1024); await fs.truncate(join(root, 'b.bin'), 33 * 1024 * 1024);
  await assert.rejects(readInputs(root, [ref('a.bin', true), ref('b.bin', true)]), /容量/u);
  await assert.rejects(readInputs(root, Array.from({ length: 1001 }, (_, i) => ref(`missing-${i}`))), /容量/u);
});

test('input batch checks actual read size when a text file grows after stat', async t => {
  const root = await project(t); const path = put(root, 'subject.txt', 'small'); const original = fs.readFile;
  fs.readFile = async function(target, ...args) { return String(target) === path ? Buffer.alloc(4 * 1024 * 1024 + 1, 97) : original.call(this, target, ...args); };
  syncBuiltinESMExports();
  try { await assert.rejects(readInputs(root, [ref('subject.txt')]), /4 MiB/u); }
  finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('single-file text and binary readers also reject growth after stat', async t => {
  const root = await project(t);
  const file = put(root, 'subject.txt', 'small');
  const original = fs.readFile;
  try {
    for (const { maximum, read, expected } of [
      { maximum: 4, read: verification.readVerificationReference, expected: /4 MiB/u },
      { maximum: 64, read: verification.readVerificationBinary, expected: /64 MiB/u },
    ]) {
      fs.readFile = async function(target, ...args) {
        return String(target) === file ? Buffer.alloc(maximum * 1024 * 1024 + 1, 97) : original.call(this, target, ...args);
      };
      syncBuiltinESMExports();
      await assert.rejects(read(root, ref('subject.txt')), expected);
    }
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('long input paths do not trigger Git argument batching', async t => {
  const root = await project(t); const folder = 'p'.repeat(80);
  const refs = Array.from({ length: 60 }, (_, i) => ref(`${folder}/${String(i).padStart(3, '0')}-${'n'.repeat(130)}.txt`));
  refs.forEach(value => put(root, value.path, 'bounded\n'));
  const result = await countGit(root, () => readInputs(root, refs));
  assert.equal(result.value.length, 60);
  assert.equal(result.count, 0);
});

test('verification directory inspection reads changed definitions without project-wide checks', async t => {
  const root = await project(t);
  await verification.scaffoldVerification(root);
  const configPath = join(root, '.tiller/verification/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  config.requirements = [{ id: 'REQ-SCAN', source: ref('spec.md') }];
  writeFileSync(configPath, JSON.stringify(config));
  put(root, 'spec.md', '# Scan requirements\nRead current definitions.\n');
  const definition = id => `schema_version: 1\ncases:\n  - id: CASE-${id}\n    title: Current definition\n    modules: []\n    categories: [unit]\n    requirements: [REQ-SCAN]\n    given: [Current input]\n    when: [Inspect definitions]\n    then: [Read actual content]\n`;
  const location = id => `.tiller/verification/system/case-${id}.yaml`;
  put(root, location(0), definition(0));
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(target, ...args) {
    if (String(target) === join(root, '.tiller/rules/core.md')) reads++;
    return original.call(this, target, ...args);
  };
  syncBuiltinESMExports();
  try {
    const first = await verification.inspectVerification(root, { definitionsOnly: true });
    assert.equal(first.ready, true, first.issues.join('\n'));
    const single = reads;
    assert.equal(single, 0, 'Definition loading must not inspect unrelated managed resources.');
    for (let index = 1; index < 12; index++) put(root, location(index), definition(index));
    reads = 0;
    const many = await verification.inspectVerification(root, { definitionsOnly: true });
    assert.equal(many.ready, true, many.issues.join('\n'));
    assert.equal(many.cases.length, 12);
    t.diagnostic(`Project resource reads: one definition=${single}, twelve definitions=${reads}`);
    assert.equal(reads, single, 'Adding definitions must not repeat project-wide checks.');
    put(root, location(0), definition(0).replace('Current definition', 'Changed definition'));
    assert.equal((await verification.inspectVerification(root, { definitionsOnly: true })).cases.find(item => item.id === 'CASE-0').title, 'Changed definition');
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('verification directory inspection leaves unrelated project changes to explicit health inspection', async t => {
  const root = await project(t);
  await verification.scaffoldVerification(root);
  const file = put(root, '.tiller/verification/system/last.yaml', 'schema_version: 1\ncases: []\n');
  await duringRead(file, () => appendFileSync(join(root, '.tiller/rules/core.md'), '\nChanged during directory scan.\n'), async () => {
    const result = await verification.inspectVerification(root, { definitionsOnly: true });
    assert.equal(result.ready, true, result.issues.join('\n'));
  });
  const inspection = await inspectProject(root);
  assert.equal(inspection.ready, false);
  assert.match(inspection.issues.join('\n'), /内容已变化/u);
});

test('verification directory input loading spawns no Git processes', async t => {
  const root = await project(t);
  await verification.scaffoldVerification(root);
  for (let index = 0; index < 48; index++) put(root, `.tiller/verification/system/case-${index}.yaml`, 'schema_version: 1\ncases: []\n');
  const measured = await countGit(root, () => verification.inspectVerification(root, { definitionsOnly: true }));
  assert.equal(measured.value.ready, true, measured.value.issues.join('\n'));
  t.diagnostic(`48 definition files: ${measured.count} Git calls`);
  assert.equal(measured.count, 0);
});
