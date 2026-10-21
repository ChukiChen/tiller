import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as core from '../dist/core.js';
import { fixture, gitRepository, put } from './helpers.mjs';

async function project(t) {
  const root = fixture(t);
  gitRepository(root, '.');
  await core.initialize({ root });
  return root;
}
async function countGit(root, action) {
  const trace = join(root, '.tiller/local/inspection-git-trace.jsonl');
  const previous = process.env.GIT_TRACE2_EVENT;
  writeFileSync(trace, '');
  process.env.GIT_TRACE2_EVENT = trace;
  try {
    await action();
    return readFileSync(trace, 'utf8').split('\n').filter(Boolean)
      .map(line => JSON.parse(line)).filter(event => event.event === 'start').length;
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
}

test('metadata input is strict and performs no Git or managed-resource inspection', async t => {
  const root = await project(t);
  appendFileSync(join(root, '.tiller/rules/core.md'), '\nChanged rule.\n');
  appendFileSync(join(root, '.gitignore'), '\n/.tiller/usage.md\n');
  const calls = await countGit(root, async () => {
    for (let index = 0; index < 12; index++) assert.equal((await core.readProjectMetadata(root)).mode, 'project');
  });
  assert.equal(calls, 0);
  const inspection = await core.inspectProject(root);
  assert.equal(inspection.ready, false);
  assert.match(inspection.issues.join('\n'), /内容已变化/u);
  assert.match(inspection.issues.join('\n'), /忽略/u);
});

test('metadata reads return independent current values without result reuse', async t => {
  const root = await project(t);
  const first = await core.readProjectMetadata(root);
  first.createdAt = '2026-01-03T00:00:00.000Z';
  assert.notEqual((await core.readProjectMetadata(root)).createdAt, first.createdAt);
  put(root, core.META, JSON.stringify(first));
  assert.equal((await core.readProjectMetadata(root)).createdAt, first.createdAt);
});

test('unknown and missing metadata reject without creating a lock', async t => {
  const root = await project(t);
  const metadata = JSON.parse(readFileSync(join(root, core.META), 'utf8'));
  const original = JSON.stringify({ ...metadata, schemaVersion: 99 });
  put(root, core.META, original);
  await assert.rejects(core.readProjectMetadata(root), /版本不受支持/u);
  assert.equal(readFileSync(join(root, core.META), 'utf8'), original);
  assert.equal(existsSync(join(root, '.tiller/local/lock.json')), false);
  await assert.rejects(core.readProjectMetadata(fixture(t)), /尚未初始化/u);
});
