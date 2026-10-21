import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { inspectWorkDelivery, planWorkDeliveryReady, applyWorkDeliveryReady } from '../dist/overall-delivery.js';
import { createWorkflowFixture, completeWorkflow } from './workflow-fixtures.mjs';
import { fixture, put, snapshot } from './helpers.mjs';

let baseline;
const cleanups = [];
after(async () => { for (const cleanup of cleanups) await cleanup(); });
const output = 'outputs/report-output.md';

async function setup(t) {
  baseline ??= (async () => {
    const f = await createWorkflowFixture({ after: cleanup => cleanups.push(cleanup) });
    const completed = await completeWorkflow(f);
    const refs = { verification: completed.verification, checkMappings: completed.checkMappings, evidenceRefs: completed.evidenceRefs };
    const checked = await inspectWorkDelivery(f.root, f.workId, refs);
    assert.equal(checked.operationAllowed, true, JSON.stringify(checked.blockingReasons));
    assert.equal(checked.controlSnapshot.tasks, null);
    return { root: f.root, workId: f.workId, input: { operationId: 'report-ready', expected: checked.controlSnapshot, ...refs } };
  })();
  const original = await baseline;
  const root = fixture(t);
  cpSync(original.root, root, { recursive: true });
  return { root, workId: original.workId, input: structuredClone(original.input) };
}

async function measureOutputReads(root, action) {
  const nativeRead = fs.readFile;
  let reads = 0;
  fs.readFile = async function (path, ...args) {
    if (String(path) === join(root, output)) reads++;
    return nativeRead.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  const started = performance.now();
  try { return { result: await action(), reads, ms: performance.now() - started }; }
  finally { fs.readFile = nativeRead; syncBuiltinESMExports(); }
}

test('delivery ready applies with two complete output evaluations and retains idempotent history', async t => {
  const { root, workId, input } = await setup(t);
  const planned = await measureOutputReads(root, () => planWorkDeliveryReady(root, workId, input));
  const applied = await measureOutputReads(root, () => applyWorkDeliveryReady(root, workId, input, planned.result.planId));
  assert.equal(applied.result.changed, true);
  assert.ok(planned.reads > 0);
  t.diagnostic(`Complete output reads: plan=${planned.reads}, apply=${applied.reads}; command ms: plan=${planned.ms.toFixed(1)}, apply=${applied.ms.toFixed(1)}`);
  assert.ok(applied.reads <= planned.reads * 2, `Apply must use one write guard and one post-write evaluation: plan=${planned.reads}, apply=${applied.reads}`);
  const before = snapshot(root);
  const repeated = await measureOutputReads(root, () => applyWorkDeliveryReady(root, workId, input, planned.result.planId));
  assert.equal(repeated.result.historical, true);
  assert.equal(repeated.result.changed, false);
  assert.equal(repeated.result.currentValidity, 'not-evaluated');
  assert.equal(repeated.reads, 0, 'A historical receipt does not claim a new technical evaluation.');
  assert.deepEqual(snapshot(root), before);
});

test('delivery ready rejects output changes during its target path check before writing', async t => {
  const { root, workId, input } = await setup(t);
  const planned = await planWorkDeliveryReady(root, workId, input);
  const location = `.tiller/work/${workId}/delivery-checks/${input.operationId}.json`;
  const target = join(root, location); const nativeLstat = fs.lstat;
  let changed = false;
  fs.lstat = async function (path, ...args) {
    try { return await nativeLstat.call(this, path, ...args); }
    finally {
      if (!changed && String(path) === target) {
        changed = true;
        put(root, output, readFileSync(join(root, output), 'utf8') + '\nChanged during target-path inspection.\n');
      }
    }
  };
  syncBuiltinESMExports();
  try { await assert.rejects(applyWorkDeliveryReady(root, workId, input, planned.planId), { code: 'CONTENT_CHANGED' }); }
  finally { fs.lstat = nativeLstat; syncBuiltinESMExports(); }
  assert.equal(changed, true);
  assert.equal(existsSync(target), false);
});

test('delivery ready still rechecks the full object after writing and removes only its own receipt', async t => {
  const { root, workId, input } = await setup(t);
  const planned = await planWorkDeliveryReady(root, workId, input);
  const target = join(root, `.tiller/work/${workId}/delivery-checks/${input.operationId}.json`);
  const nativeRename = fs.rename; let changed = false;
  fs.rename = async function (from, to, ...args) {
    const result = await nativeRename.call(this, from, to, ...args);
    if (!changed && String(to) === target) {
      changed = true;
      put(root, output, readFileSync(join(root, output), 'utf8') + '\nChanged after receipt write.\n');
    }
    return result;
  };
  syncBuiltinESMExports();
  try { await assert.rejects(applyWorkDeliveryReady(root, workId, input, planned.planId), { code: 'CONTENT_CHANGED' }); }
  finally { fs.rename = nativeRename; syncBuiltinESMExports(); }
  assert.equal(changed, true);
  assert.equal(existsSync(target), false);
  assert.match(readFileSync(join(root, output), 'utf8'), /Changed after receipt write/u);
  assert.equal(existsSync(join(root, '.tiller/local/transaction.json')), false);
});
