import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as deliveryGit from '../dist/delivery-git.js';
import {gitIdentities} from '../dist/delivery-location.js';
import { fixture, gitRepository, put } from './helpers.mjs';

test('declared checkout identities share only their common repository listing and recheck branch changes', async t => {
  const root = fixture(t);
  gitRepository(root, '.');
  await deliveryGit.git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--allow-empty', '-m', 'Fixture']);
  const checkout = join(root, 'checkout');
  await deliveryGit.git(root, ['worktree', 'add', '-b', 'review', checkout]);
  const other = gitRepository(fixture(t), '.');
  const trace = join(root, 'identity-trace.jsonl');
  writeFileSync(trace, '');
  const previous = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = trace;
  let identities;
  try { identities = await gitIdentities([root, checkout, root, other]); }
  finally { if (previous === undefined) delete process.env.GIT_TRACE2_EVENT; else process.env.GIT_TRACE2_EVENT = previous; }
  assert.equal(identities.size, 3);
  assert.equal(identities.get(checkout).branch, 'review');
  assert.equal(identities.get(root).commonDir, identities.get(checkout).commonDir);
  assert.notEqual(identities.get(root).commonDir, identities.get(other).commonDir);
  const calls = readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse).filter(event => event.event === 'start');
  assert.equal(calls.length, 5, 'Three identities and two independent repository listings, without extra processes.');
  await deliveryGit.git(checkout, ['branch', '-m', 'renamed']);
  assert.equal((await gitIdentities([root, checkout])).get(checkout).branch, 'renamed');
  await deliveryGit.git(checkout, ['checkout', '--detach']);
  assert.equal((await gitIdentities([checkout])).get(checkout).branch, null);
});

async function readFiles(root, commit, paths) {
  if (deliveryGit.readGitFiles) return deliveryGit.readGitFiles(root, commit, paths);
  const values = new Map();
  for (const path of paths) {
    const tree = await deliveryGit.git(root, ['ls-tree', '-z', commit, '--', path]);
    if (!tree) continue;
    const match = /^100644 blob ([a-f0-9]+)\t[^\0]+\0$/u.exec(tree);
    if (!match) throw new Error('交接不支持文件模式');
    values.set(path, Buffer.from(await deliveryGit.git(root, ['cat-file', 'blob', match[1]])));
  }
  return values;
}

test('fixed-commit files use bounded Git batches and preserve exact content and missing paths', async t => {
  const root = fixture(t);
  gitRepository(root, '.');
  const paths = Array.from({ length: 24 }, (_, index) => `inputs/file ${index}.txt`);
  paths.forEach((path, index) => put(root, path, `actual content ${index}\n`));
  await deliveryGit.git(root, ['add', '--', 'inputs']);
  await deliveryGit.git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--quiet', '-m', 'Synthetic fixture']);
  const commit = (await deliveryGit.git(root, ['rev-parse', 'HEAD'])).trim();
  const trace = join(root, 'trace.jsonl');
  writeFileSync(trace, '');
  const previous = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = trace;
  let values;
  try { values = await readFiles(root, commit, [...paths, 'missing.txt']); }
  finally { if (previous === undefined) delete process.env.GIT_TRACE2_EVENT; else process.env.GIT_TRACE2_EVENT = previous; }
  assert.equal(values.size, paths.length);
  paths.forEach((path, index) => assert.equal(values.get(path).toString('utf8'), `actual content ${index}\n`));
  const calls = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(event => event.event === 'start').length;
  assert.ok(calls <= 4, `24 commit files should use bounded batches, got ${calls}`);
  t.diagnostic(`24 committed files: ${calls} Git processes`);
  await deliveryGit.git(root, ['update-index', '--chmod=+x', '--', paths[0]]);
  await deliveryGit.git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--quiet', '-m', 'Synthetic executable']);
  const changed = (await deliveryGit.git(root, ['rev-parse', 'HEAD'])).trim();
  await assert.rejects(readFiles(root, changed, [paths[0]]), /模式|执行位/u);
  assert.equal((await readFiles(root, commit, [paths[0]])).get(paths[0]).toString('utf8'), 'actual content 0\n');
});

test('commit batches consume binary bytes and split large output without retaining all payloads', async t => {
  const root = fixture(t);
  gitRepository(root, '.');
  const first = Buffer.alloc(9 * 1024 * 1024, 255);
  const second = Buffer.alloc(9 * 1024 * 1024, 0);
  put(root, 'first.bin', first);
  put(root, 'second.bin', second);
  await deliveryGit.git(root, ['add', '--', 'first.bin', 'second.bin']);
  await deliveryGit.git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '--quiet', '-m', 'Synthetic binary files']);
  const commit = (await deliveryGit.git(root, ['rev-parse', 'HEAD'])).trim();
  assert.equal(typeof deliveryGit.readGitFiles, 'function');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const result = await deliveryGit.readGitFiles(root, commit, ['first.bin', 'second.bin'], digest);
  assert.equal(result.get('first.bin'), digest(first));
  assert.equal(result.get('second.bin'), digest(second));
});
