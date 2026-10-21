import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { git } from '../dist/delivery-git.js';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision, checkGate } from '../dist/confirmations.js';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { fixture, put } from './helpers.mjs';

const workId = 'confirmation-materials';
const directory = `.tiller/work/${workId}`;
const ref = path => ({ repository: '.', path });
const subject = ref(`${directory}/requirements.md`);
const source = ref(`${directory}/source.md`);
const presentation = ref(`${directory}/reviews/request-requirements/presentation.md`);
const registryPath = `${directory}/confirmations.json`;

async function setup(t, { gitRoot = false, approved = true } = {}) {
  const root = fixture(t);
  if (gitRoot) await git(root, ['init', '-b', 'main']);
  await initialize({ root });
  const context = await createWorkflowFixtureAt(root, workId, 'feature');
  put(root, subject.path, '# Requirements\r\nRead the declared fixture document.\r\n');
  await addWorkflowOutput(root, workId, { operationId: 'requirements-output', expectedRevision: 1,
    outputId: 'requirements-output', source: subject });
  const policy = await loadWorkflowPolicyContext(root, workId);
  await requestConfirmation(root, workId, { requestId: 'requirements', gate: 'requirements', scope: context.scope,
    subjects: [subject], upstream: [], workflowBinding: { workflowDigest: policy.snapshot.digest, intentDigest: policy.intentDigest, stageId: 'requirements' },
    reviewSummary: 'Review these exact fixture bytes.', openIssues: [], nextAction: 'Wait for the specified decision.' });
  put(root, source.path, '# Synthetic decision\nApprove this fixture only.\n');
  const decision = { decisionId: 'approve', requestId: 'requirements', outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: source, quote: 'Approve this fixture only.', presentation },
    sourceReview: { reviewer: 'Fixture reviewer', rationale: 'This source concerns only the displayed fixture.', reviewedAt: '2026-10-21T00:00:00.000Z' } };
  if (approved) await recordDecision(root, workId, decision);
  return { root, decision };
}

async function interceptReads(intercept, action) {
  const original = fsPromises.readFile;
  fsPromises.readFile = async function (path, ...args) {
    const contents = await original.call(this, path, ...args);
    await intercept(String(path), contents);
    return contents;
  };
  syncBuiltinESMExports();
  try { return await action(); }
  finally { fsPromises.readFile = original; syncBuiltinESMExports(); }
}

test('confirmation input loading reads materials once plus an independent return proof and later queries observe changes', async t => {
  const { root } = await setup(t);
  const registry = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
  const files = [...registry.requests[0].files, ...registry.decisions[0].files];
  const paths = new Set(files.flatMap(file => [file.path, file.snapshot]));
  const counts = new Map([...paths].map(path => [join(root, path), 0]));
  await interceptReads(path => {
    if (counts.has(path)) counts.set(path, counts.get(path) + 1);
  }, async () => assert.equal((await checkGate(root, workId, 'requirements')).confirmed, true));
  for (const [path, count] of counts) assert.equal(count, 2, `Expected one input read and one return proof: ${path}`);

  const mutations = [
    [subject.path, '# Changed requirement\nDifferent scope.\n', /内容已变化/u],
    [source.path, '# Changed decision\nThe original quotation is absent.\n', /来源中未找到/u],
    [presentation.path, '# Changed presentation\nDifferent scope.\n', /请求展示文件已变化/u],
    [registry.requests[0].files[0].snapshot, JSON.stringify({ encoding: 'utf8', content: 'Changed snapshot' }), /快照与摘要不符/u],
  ];
  for (const [path, changed, issue] of mutations) {
    const original = readFileSync(join(root, path), 'utf8');
    put(root, path, changed);
    const checked = await checkGate(root, workId, 'requirements');
    assert.equal(checked.confirmed, false);
    assert.match(checked.issues.join(';'), issue);
    put(root, path, original);
  }
  assert.equal((await checkGate(root, workId, 'requirements')).confirmed, true);
});

test('ordinary confirmation queries do not evaluate Git ignore rules', async t => {
  const { root } = await setup(t, { gitRoot: true });
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  let changed = false;
  const checked = await interceptReads(path => {
    if (!changed && path === join(root, subject.path)) {
      changed = true;
      put(root, '.gitignore', `${ignore}\n/${subject.path}\n`);
    }
  }, () => checkGate(root, workId, 'requirements'));
  assert.equal(changed, true);
  assert.equal(checked.confirmed, true);
  put(root, '.gitignore', ignore);
  assert.equal((await checkGate(root, workId, 'requirements')).confirmed, true);
});

test('decision prewrite proof rejects changed subjects without modifying the registry', async t => {
  const { root, decision } = await setup(t, { approved: false });
  const registry = readFileSync(join(root, registryPath), 'utf8');
  let changed = false;
  await interceptReads(path => {
    if (!changed && path === join(root, subject.path)) {
      changed = true;
      put(root, subject.path, '# Changed after first observation\nRequire a new review.\n');
    }
  }, () => assert.rejects(recordDecision(root, workId, decision), error =>
    error.code === 'INVALID_CONFIRMATION' && /变化/u.test(error.message)));
  assert.equal(changed, true);
  assert.equal(readFileSync(join(root, registryPath), 'utf8'), registry);
});

test('decision commit rejects an input newly ignored after loading and leaves no saved decision', async t => {
  const { root, decision } = await setup(t, { gitRoot: true, approved: false });
  const registry = readFileSync(join(root, registryPath), 'utf8');
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  let changed = false;
  try {
    await interceptReads(path => {
      if (!changed && path === join(root, subject.path)) {
        changed = true;
        put(root, '.gitignore', `${ignore}\n/${subject.path}\n`);
      }
    }, () => assert.rejects(recordDecision(root, workId, decision), /共享资料被 Git 忽略/u));
    assert.equal(changed, true);
    assert.equal(readFileSync(join(root, registryPath), 'utf8'), registry);
    await assert.rejects(fsPromises.stat(join(root, `${directory}/reviews/decision-approve/0.json`)),
      error => error.code === 'ENOENT');
  } finally { put(root, '.gitignore', ignore); }
  assert.equal((await recordDecision(root, workId, decision)).confirmed, true,
    'Restoring shareability permits a new independently checked attempt.');
});


test('ordinary confirmation input loading and return proof start no Git processes', async t => {
  const { root } = await setup(t, { gitRoot: true });
  const trace = join(root, '.tiller/local/confirmation-query-git.jsonl');
  writeFileSync(trace, '');
  const previous = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = trace;
  try {
    assert.equal((await checkGate(root, workId, 'requirements')).confirmed, true);
    const calls = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(event => event.event === 'start');
    assert.deepEqual(calls, []);
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
  }
});
