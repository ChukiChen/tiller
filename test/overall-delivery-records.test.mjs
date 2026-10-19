import test from 'node:test';
import assert from 'node:assert/strict';
import { initialize } from '../dist/core.js';
import { createWork } from '../dist/work.js';
import { readDeliveryReceipt } from '../dist/overall-delivery.js';
import { fixture, put, snapshot } from './helpers.mjs';

test('delivery receipts preserve work scope labels and reject unknown or contradictory historical structures', async t => {
  const root = fixture(t); const workId = 'receipt-shape';
  await initialize({ root, mode: 'project' });
  const scope = { repositories: ['.'], targets: ['交付范围：版本一'] };
  await createWork(root, workId, 'Receipt parsing fixture', { type: 'change-requirements', scope });
  const path = `.tiller/work/${workId}/delivery-checks/ready.json`;
  const sha = 'a'.repeat(64);
  // A parser fixture, not a claim that a real delivery occurred.
  const receipt = { schemaVersion: 1, workId, id: 'ready', operationId: 'ready', inputDigest: sha,
    revision: 4, planningRevision: 'one', scope, checkedAt: '2026-10-19T00:00:00.000Z',
    basisDigest: sha, exceptionDigest: sha, planId: sha, operationAllowed: true, technicalReady: true,
    disposition: 'ready', inputs: { checkpointRefs: [], evidenceRefs: [], exceptionRefs: [] } };
  put(root, path, JSON.stringify(receipt));
  assert.deepEqual((await readDeliveryReceipt(root, workId, 'ready')).scope, scope);
  for (const invalid of [
    { ...receipt, schemaVersion: 0 }, { ...receipt, trusted: true }, { ...receipt, workId: 'other' },
    { ...receipt, exceptionDigest: undefined }, { ...receipt, technicalReady: false },
    { ...receipt, technicalReady: false, disposition: 'allowed-with-exceptions' },
    { ...receipt, inputs: { ...receipt.inputs, force: true } },
  ]) {
    put(root, path, JSON.stringify(invalid)); const before = snapshot(root);
    await assert.rejects(readDeliveryReceipt(root, workId, 'ready'));
    assert.deepEqual(snapshot(root), before);
  }
});
