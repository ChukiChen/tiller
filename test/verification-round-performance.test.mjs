import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { initialize } from '../dist/core.js';
import * as verification from '../dist/verification-runs.js';
import { verificationCategories } from '../dist/verification-cases.js';
import { createStartedBaseline, baselineAuthorization } from './workflow-fixtures.mjs';
import { fixture, put } from './helpers.mjs';

const workId = 'verification-round';
const ref = path => ({ repository: '.', path });
async function setup(t) {
  const root = fixture(t);
  await initialize({ root });
  const categories = Object.fromEntries(verificationCategories.map(category => [category,
    { applicability: category === 'unit' ? 'applicable' : 'not-applicable', reason: 'Isolated history observation fixture.' }]));
  put(root, 'input.txt', 'An actual fixture input.\n');
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [], requirements: [], categories, suites: [] }));
  await createStartedBaseline(root, workId);
  const capture = await verification.captureVerificationObservation(root, workId, {
    environment: 'history-round-fixture', workflow: baselineAuthorization(['write-report']),
    selection: { caseIds: [], requirements: [], modules: [], categories,
      reason: 'Observe one current file.', scenarioReason: 'Only the isolated history fixture applies.',
      checks: [{ id: 'observed', kind: 'manual', artifactIds: ['baseline-output'], inputs: [ref('input.txt')],
        requirements: [], categories: ['unit'], reason: 'Read the fixture input.' }] },
  });
  return { root, path: capture.path, record: capture.record };
}

async function countRecordReads(path, fn) {
  const read = fs.readFile;
  let count = 0;
  fs.readFile = async function (actual, ...args) {
    if (String(actual) === path) count++;
    return read.call(this, actual, ...args);
  };
  syncBuiltinESMExports();
  try { await fn(); return count; }
  finally { fs.readFile = read; syncBuiltinESMExports(); }
}

test('explicit verification history loads once and independent reads stay fresh', async t => {
  const { root, path } = await setup(t);
  const count = await countRecordReads(join(root, path), async () => {
    const history = await verification.loadVerificationHistory(root, workId);
    for (let use = 0; use < 5; use++) assert.equal(history.records[0].environment, 'history-round-fixture');
    assert.throws(() => { history.records[0].environment = 'pollution'; }, TypeError);
    assert.equal(history.records.length, 1);
  });
  assert.equal(count, 1, 'Explicit input loading does one record read, without hidden final reads.');
  assert.equal(await countRecordReads(join(root, path), async () => {
    await verification.readVerificationRecords(root, workId);
    await verification.readVerificationRecords(root, workId);
  }), 2, 'Independent calls always load current bytes.');
});

test('explicit history validation rejects changed bytes and directory members', async t => {
  const { root, path } = await setup(t);
  const original = readFileSync(join(root, path), 'utf8');
  const history = await verification.loadVerificationHistory(root, workId);
  try {
    put(root, path, original + ' ');
    await assert.rejects(verification.assertVerificationHistoryCurrent(history), /验证.*(?:变化|改变)/u);
  } finally { put(root, path, original); }
  const added = `.tiller/work/${workId}/verification-runs/11111111-1111-4111-8111-111111111111.json`;
  try {
    put(root, added, '{}');
    await assert.rejects(verification.assertVerificationHistoryCurrent(history), /验证.*(?:变化|改变)/u);
    await assert.rejects(verification.loadVerificationHistory(root, workId));
  } finally { rmSync(join(root, added)); }
  await verification.assertVerificationHistoryCurrent(history);
});

test('writes do not mutate explicit input and latest failed evidence remains authoritative', async t => {
  const { root, record } = await setup(t);
  const before = await verification.loadVerificationHistory(root, workId);
  put(root, 'evidence.md', '# Actual fixture observation\n');
  await verification.recordVerificationEvidence(root, workId, {
    captureId: record.id, environment: record.environment,
    results: [{ checkId: 'observed', status: 'failed', evidence: ref('evidence.md'), note: 'Synthetic failed observation.' }],
  });
  assert.equal(before.records.length, 1);
  await assert.rejects(verification.assertVerificationHistoryCurrent(before), /验证.*(?:变化|改变)/u);
  const latest = await verification.readVerificationRecords(root, workId);
  assert.equal(latest.length, 2);
  assert.equal(latest.at(-1).results[0].status, 'failed');
  latest[0].environment = 'Caller may mutate independent copies.';
  assert.equal((await verification.readVerificationRecords(root, workId))[0].environment, 'history-round-fixture');
});
