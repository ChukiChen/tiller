import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision, checkGate } from '../dist/confirmations.js';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { fixture, gitRepository, put } from './helpers.mjs';

const workId = 'confirmation-write';
const directory = `.tiller/work/${workId}`;
const ref = path => ({ repository: '.', path });
const subject = ref(`${directory}/requirements.md`);
const registryPath = `${directory}/confirmations.json`;
let baseline;
const cleanups = [];
after(async () => { for (const cleanup of cleanups) await cleanup(); });

function decision(requestId, decisionId = `approve-${requestId}`, outcome = 'approved') {
  return { requestId, decisionId, outcome, conditions: [],
    source: { kind: 'conversation', reference: ref(`${directory}/source.md`), quote: 'Approve only this synthetic fixture.',
      presentation: ref(`${directory}/reviews/request-${requestId}/presentation.md`) },
    sourceReview: { reviewer: 'Fixture reviewer', rationale: 'This source concerns only the displayed fixture.', reviewedAt: '2026-10-21T00:00:00.000Z' } };
}
async function setup(t) {
  baseline ??= (async () => {
    const root = fixture({ after: cleanup => cleanups.push(cleanup) });
    gitRepository(root, '.');
    await initialize({ root });
    const context = await createWorkflowFixtureAt(root, workId, 'feature');
    put(root, subject.path, '# Synthetic requirements\nReview the declared fixture scope.\n');
    put(root, `${directory}/source.md`, 'Approve only this synthetic fixture.\n');
    await addWorkflowOutput(root, workId, { operationId: 'requirements-output', expectedRevision: 1,
      outputId: 'requirements-output', source: subject });
    const policy = await loadWorkflowPolicyContext(root, workId);
    const common = { gate: 'requirements', scope: context.scope, subjects: [subject],
      workflowBinding: { workflowDigest: policy.snapshot.digest, intentDigest: policy.intentDigest, stageId: 'requirements' },
      reviewSummary: 'Synthetic fixture only.', openIssues: [], nextAction: 'Wait for this fixture decision.' };
    for (const [requestId, upstream] of [['r', []], ['a', ['r']], ['b', ['r']], ['c', ['a', 'b']], ['d', ['a', 'b']]]) {
      assert.equal((await requestConfirmation(root, workId, { ...common, requestId, upstream })).changed, true);
      assert.equal((await recordDecision(root, workId, decision(requestId))).confirmed, true);
    }
    return { root, request: { ...common, requestId: 'top', upstream: ['c', 'd'] } };
  })();
  const original = await baseline;
  const root = fixture(t);
  cpSync(original.root, root, { recursive: true });
  return { root, request: structuredClone(original.request) };
}

async function measure(root, action, intercept) {
  const original = fs.readFile;
  const trace = join(root, '.tiller/local/write-git-trace.jsonl');
  writeFileSync(trace, '');
  const previous = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = trace;
  let reads = 0;
  fs.readFile = async function(path, ...args) {
    const target = String(path);
    if (target === join(root, subject.path)) reads++;
    let value;
    try { value = await original.call(this, path, ...args); }
    catch (error) {
      await intercept?.(target, reads, null);
      throw error;
    }
    await intercept?.(target, reads, value);
    return value;
  };
  syncBuiltinESMExports();
  try {
    const result = await action();
    const gitCalls = readFileSync(trace, 'utf8').split('\n').filter(Boolean)
      .map(line => JSON.parse(line)).filter(event => event.event === 'start').length;
    return { result, reads, gitCalls };
  } finally {
    fs.readFile = original; syncBuiltinESMExports();
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
}

test('real confirmation request and decision writes bound repeated diamond material reads', async t => {
  const { root, request } = await setup(t);
  const requested = await measure(root, () => requestConfirmation(root, workId, request));
  const approved = await measure(root, () => recordDecision(root, workId, decision('top')));
  assert.equal(requested.result.status, 'pending');
  assert.equal(approved.result.confirmed, true);
  t.diagnostic(`Real diamond writes: request reads=${requested.reads}, Git=${requested.gitCalls}; decision reads=${approved.reads}, Git=${approved.gitCalls}`);
  assert.ok(requested.reads <= 12, `One request has input loading, commit proof, post-write loading and return proof: ${requested.reads}`);
  assert.ok(approved.reads <= 4, `One decision has input loading, commit proof, post-write loading and return proof: ${approved.reads}`);
  assert.ok(approved.gitCalls <= 40, `One decision write should use bounded graph checks, got ${approved.gitCalls} Git calls`);
  assert.equal((await checkGate(root, workId, 'top')).confirmed, true);
});

test('confirmation request rejects an input changed after loading and before commit', async t => {
  const { root, request } = await setup(t);
  let changed = false;
  await assert.rejects(measure(root, () => requestConfirmation(root, workId, request), (target, reads) => {
    if (!changed && target === join(root, subject.path) && reads === 1) {
      changed = true;
      put(root, subject.path, '# Changed after input loading\nRequires another review.\n');
    }
  }), /变化|确认/u);
  assert.equal(changed, true);
  assert.equal(JSON.parse(readFileSync(join(root, registryPath), 'utf8')).requests.some(item => item.requestId === 'top'), false);
});

test('decision evaluation cannot return approval when a newly loaded material changes before final proof', async t => {
  const { root, request } = await setup(t);
  await requestConfirmation(root, workId, request);
  const original = readFileSync(join(root, subject.path), 'utf8');
  let changed = false;
  const approved = await measure(root, () => recordDecision(root, workId, decision('top')), (target, reads) => {
    if (!changed && target === join(root, subject.path) && reads === 3) {
      changed = true;
      put(root, subject.path, '# Changed during final evaluation\nRequires another review.\n');
    }
  });
  assert.equal(changed, true);
  assert.equal(approved.result.confirmed, false);
  assert.equal(approved.result.status, 'needs-review');
  put(root, subject.path, original);
  assert.equal((await checkGate(root, workId, 'top')).confirmed, true);
  await recordDecision(root, workId, decision('r', 'withdraw-r', 'revoked'));
  assert.equal((await recordDecision(root, workId, decision('top'))).confirmed, false, 'An independent write rechecks a revoked ancestor.');
});

test('decision evaluation rejects a registry revocation arriving during its material phase', async t => {
  const { root, request } = await setup(t);
  await requestConfirmation(root, workId, request);
  let revoked = false;
  const approved = await measure(root, () => recordDecision(root, workId, decision('top')), (target, reads) => {
    if (!revoked && target === join(root, subject.path) && reads === 3) {
      revoked = true;
      const registry = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
      const seed = registry.decisions.find(item => item.requestId === 'r');
      registry.decisions.push({ ...seed, decisionId: 'withdraw-r-during-evaluation', outcome: 'revoked' });
      put(root, registryPath, JSON.stringify(registry));
    }
  });
  assert.equal(revoked, true);
  assert.equal(approved.result.confirmed, false);
  assert.equal(approved.result.status, 'needs-review');
  assert.match(approved.result.issues.join(';'), /登记.*变化/u);
  assert.equal((await checkGate(root, workId, 'top')).confirmed, false);
});

test('a revocation remains recordable while its unrelated subject changes during source proof', async t => {
  const { root } = await setup(t);
  const source = join(root, `${directory}/source.md`);
  let sourceReads = 0;
  const revoked = await measure(root, () => recordDecision(root, workId, decision('r', 'withdraw-r-during-subject-churn', 'revoked')), target => {
    if (target === source && ++sourceReads <= 2)
      put(root, subject.path, `# Unrelated subject version ${sourceReads}\nThe revocation concerns the existing approval.\n`);
  });
  assert.ok(sourceReads >= 2, 'The source was captured and proved while the subject changed.');
  assert.equal(revoked.result.changed, true);
  assert.equal(revoked.result.status, 'invalidated');
  const registry = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
  assert.equal(registry.decisions.at(-1).decisionId, 'withdraw-r-during-subject-churn');
  assert.equal(registry.decisions.at(-1).outcome, 'revoked');
  assert.equal((await checkGate(root, workId, 'r')).confirmed, false);
});
