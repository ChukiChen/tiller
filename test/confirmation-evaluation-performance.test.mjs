import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision, checkGate, inspectConfirmations, readConfirmations } from '../dist/confirmations.js';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { fixture, put } from './helpers.mjs';

const workId = 'confirmation-evaluation';
const directory = `.tiller/work/${workId}`;
const ref = path => ({ repository: '.', path });
const subject = ref(`${directory}/requirements.md`);
const registryPath = `${directory}/confirmations.json`;

async function setup(t, approved = false) {
  const root = fixture(t);
  await initialize({ root });
  const context = await createWorkflowFixtureAt(root, workId, 'feature');
  put(root, subject.path, '# Synthetic requirements\nCurrent fixture scope.\n');
  await addWorkflowOutput(root, workId, { operationId: 'requirements-output', expectedRevision: 1,
    outputId: 'requirements-output', source: subject });
  const policy = await loadWorkflowPolicyContext(root, workId);
  const request = await requestConfirmation(root, workId, { requestId: 'r', gate: 'requirements', scope: context.scope,
    subjects: [subject], upstream: [], workflowBinding: { workflowDigest: policy.snapshot.digest, intentDigest: policy.intentDigest, stageId: 'requirements' },
    reviewSummary: 'Synthetic fixture only.', openIssues: [], nextAction: 'Wait for this fixture decision.' });
  put(root, `${directory}/source.md`, 'Approve only this fixture.\n');
  const decision = { decisionId: 'approve', requestId: 'r', outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: ref(`${directory}/source.md`), quote: 'Approve only this fixture.', presentation: ref(request.presentation) },
    sourceReview: { reviewer: 'Fixture', rationale: 'This synthetic source concerns only the fixture.', reviewedAt: '2026-10-21T00:00:00.000Z' } };
  if (approved) await recordDecision(root, workId, decision);
  return { root, decision };
}

async function countSubjectReads(root, fn) {
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(path, ...args) {
    if (String(path) === join(root, subject.path)) reads++;
    return original.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try { return { result: await fn(), reads }; }
  finally { fs.readFile = original; syncBuiltinESMExports(); }
}

test('confirmation graph shares material reads while keeping pending diamonds and cycles unapproved', async t => {
  const { root } = await setup(t);
  const registry = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
  const seed = registry.requests[0];
  // Deliberately pending/invalid dependency decisions exercise rejection, never approval.
  for (const [requestId, upstream] of [['a', ['r']], ['b', ['r']], ['c', ['a', 'b']], ['d', ['a', 'b']], ['top', ['c', 'd']]]) {
    registry.requests.push({ ...structuredClone(seed), requestId, upstream,
      dependencies: upstream.map(requestId => ({ requestId, fingerprint: '0'.repeat(64), decisionId: 'not-approved' })) });
  }
  put(root, registryPath, JSON.stringify(registry));
  const top = await countSubjectReads(root, () => checkGate(root, workId, 'top'));
  assert.equal(top.result.confirmed, false);
  assert.equal(top.result.status, 'needs-review');
  assert.equal(top.reads, 2, 'A shared subject needs one input read and one independent return proof.');
  const all = await countSubjectReads(root, () => inspectConfirmations(root, workId));
  assert.ok(all.result.requests.every(request => !request.confirmed));
  assert.equal(all.reads, 2, 'All six requests use the same input bytes and return proof.');
  t.diagnostic(`Shared subject: top=${top.reads}, all six=${all.reads}`);
  seed.upstream = ['top'];
  seed.dependencies = [{ requestId: 'top', fingerprint: '0'.repeat(64), decisionId: 'not-approved' }];
  put(root, registryPath, JSON.stringify(registry));
  const cycle = await checkGate(root, workId, 'top');
  assert.equal(cycle.confirmed, false);
  assert.equal(cycle.status, 'needs-review');
});

test('independent confirmation queries observe changed material', async t => {
  const { root } = await setup(t, true);
  const original = readFileSync(join(root, subject.path), 'utf8');
  let escaped = false;
  try {
    escaped = await (async () => {
      assert.equal((await checkGate(root, workId, 'r')).confirmed, true);
      put(root, subject.path, '# Changed during inspection\nRequire another review.\n');
      return (await checkGate(root, workId, 'r')).confirmed;
    })();
  } catch (error) { assert.match(error.message, /变化|复核/u); }
  assert.equal(escaped, false);
  assert.equal((await checkGate(root, workId, 'r')).confirmed, false);
  put(root, subject.path, original);
  assert.equal((await checkGate(root, workId, 'r')).confirmed, true);
});

test('an independent query observes a newly recorded revocation', async t => {
  const { root, decision } = await setup(t, true);
  await (async () => {
    assert.equal((await checkGate(root, workId, 'r')).confirmed, true);
    await recordDecision(root, workId, { ...decision, decisionId: 'revoke', outcome: 'revoked' });
    const checked = await checkGate(root, workId, 'r');
    assert.equal(checked.confirmed, false);
    assert.equal(checked.status, 'invalidated');
  })();
});

test('concurrent first reads cannot combine different material versions into one approved observation', async t => {
  const { root, decision } = await setup(t, true);
  const original = readFileSync(join(root, subject.path), 'utf8');
  const changed = '# A different synthetic requirement\nA separate fixture approval.\n';
  const registry = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
  put(root, subject.path, changed);
  const second = await requestConfirmation(root, workId, { requestId: 'r-second', gate: 'requirements', scope: registry.requests[0].scope,
    subjects: [subject], upstream: [], workflowBinding: registry.requests[0].workflowBinding,
    reviewSummary: 'Review only the second fixture version.', openIssues: [], nextAction: 'Wait for its separate decision.' });
  await recordDecision(root, workId, { ...decision, requestId: 'r-second', decisionId: 'approve-second',
    source: { ...decision.source, presentation: ref(second.presentation) } });
  put(root, subject.path, original);

  let firstReadStarted;
  const firstRead = new Promise(resolve => { firstReadStarted = resolve; });
  let secondReadStarted;
  const secondRead = new Promise(resolve => { secondReadStarted = resolve; });
  let firstFinished;
  const firstComplete = new Promise(resolve => { firstFinished = resolve; });
  const nativeRead = fs.readFile;
  let reads = 0;
  fs.readFile = async function(path, ...args) {
    if (String(path) !== join(root, subject.path)) return nativeRead.call(this, path, ...args);
    const number = ++reads;
    if (number === 1) {
      const value = await nativeRead.call(this, path, ...args);
      firstReadStarted();
      await secondRead;
      return value;
    }
    if (number === 2) {
      put(root, subject.path, changed);
      const value = await nativeRead.call(this, path, ...args);
      put(root, subject.path, original);
      secondReadStarted();
      await firstComplete;
      return value;
    }
    return nativeRead.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    const checked = await (async () => {
      const first = checkGate(root, workId, 'r').finally(firstFinished);
      await firstRead;
      const later = checkGate(root, workId, 'r-second');
      return Promise.all([first, later]);
    })();
    assert.equal(checked[0].confirmed, true);
    assert.equal(checked[1].confirmed, false, 'Two different subject versions must not both escape as approved.');
    assert.match(checked[1].issues.join(';'), /变化/u);
    assert.ok(reads >= 2);
    assert.equal(readFileSync(join(root, subject.path), 'utf8'), original);
  } finally {
    firstFinished(); secondReadStarted();
    fs.readFile = nativeRead; syncBuiltinESMExports();
    put(root, subject.path, original);
  }
});


test('an explicit batch reads one registry for repeated references and returns independent frozen values', async t => {
  const { root } = await setup(t, true);
  const nativeRead = fs.readFile;
  let registryReads = 0;
  fs.readFile = async function(path, ...args) {
    if (String(path) === join(root, registryPath)) registryReads++;
    return nativeRead.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    const reference = { workId, requestId: 'r', decisionId: 'approve' };
    const [first, second] = await readConfirmations(root, [reference, reference]);
    assert.equal(first.check.confirmed, true);
    assert.deepEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.equal(Object.isFrozen(first.request), true);
    assert.equal(registryReads, 2, 'One input read and one return proof cover both references.');
  } finally { fs.readFile = nativeRead; syncBuiltinESMExports(); }
});
