import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { requestConfirmation, recordDecision, checkGate, checkMergeGate } from '../dist/confirmations.js';
import { fixture, put, snapshot } from './helpers.mjs';

const id = 'isolated-delivery';
const directory = `.tiller/work/${id}`;
const file = path => ({ repository: '.', path: `${directory}/${path}` });
const evidence = file('checks.md');
const specification = file('specification.md');
const registryPath = `${directory}/confirmations.json`;
function binding() {
  return {
    documentsVersion: 'd'.repeat(64),
    repositories: [{
      repository: '.', review: { provider: 'github', id: '42', url: 'https://example.invalid/owner/project/pull/42' },
      sourceOid: 'a'.repeat(40), targetBranch: 'main', targetOid: 'b'.repeat(40),
      dependencies: [{ repository: '.', oid: 'c'.repeat(40) }],
      checks: { version: 'checks-1', evidence: [evidence] },
    }],
  };
}
function request(requestId, gate, overrides = {}) {
  return { requestId, gate, scope: { repositories: ['.'], targets: [id] }, subjects: [specification], upstream: [], reviewSummary: '隔离测试确认对象，不代表真实批准。', openIssues: [], nextAction: '检查指定交付', ...overrides };
}
function mergeRequest(requestId = 'merge', overrides = {}) {
  return request(requestId, 'merge', { subjects: [evidence], upstream: ['design'], mergeBinding: binding(), ...overrides });
}
function decision(root, requestId, decisionId = `approve-${requestId}`, overrides = {}) {
  const reference = file(`source-${decisionId}.md`);
  put(root, reference.path, '# 测试来源\n\n确认本次展示的范围。\n');
  return {
    decisionId, requestId, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference, quote: '确认本次展示的范围。', presentation: file(`reviews/request-${requestId}/presentation.md`) },
    sourceReview: { reviewer: '测试执行者', rationale: '仅隔离夹具的明确范围，不代表真实批准。', reviewedAt: '2026-10-15T00:00:00.000Z' },
    ...overrides,
  };
}
async function setup(t) {
  const root = fixture(t);
  await initialize({ root });
  put(root, `${directory}/work.md`, '# 隔离交付\n');
  put(root, specification.path, '# 测试规格\n');
  put(root, evidence.path, '# 检查结果\n\n隔离测试通过。\n');
  await requestConfirmation(root, id, request('requirements', 'requirements'));
  await recordDecision(root, id, decision(root, 'requirements'));
  await requestConfirmation(root, id, request('design', 'design', { upstream: ['requirements'] }));
  await recordDecision(root, id, decision(root, 'design'));
  return root;
}
async function approvedMerge(root) {
  await requestConfirmation(root, id, mergeRequest());
  await recordDecision(root, id, decision(root, 'merge'));
}

test('merge approval binds exact delivery versions and requires fresh runtime state', async t => {
  const root = await setup(t);
  const current = binding();
  current.documentsVersion = `sha256:${current.documentsVersion}`;
  await requestConfirmation(root, id, mergeRequest('merge', { mergeBinding: current }));
  await recordDecision(root, id, decision(root, 'merge'));
  const checked = await checkMergeGate(root, id, 'merge', current);
  assert.equal(checked.confirmed, true);
  assert.equal(checked.confirmationBasis, 'reported-review');
  assert.equal(checked.sourceVerification, 'not-independently-verified');
  assert.equal(checked.automaticTransition, false);
  assert.equal((await checkGate(root, id, 'merge')).confirmed, false);
  assert.equal(JSON.parse(readFileSync(join(root, registryPath), 'utf8')).schemaVersion, 3);
  assert.match(readFileSync(join(root, directory, 'reviews/request-merge/presentation.md'), 'utf8'), /"mergeBinding"/u);
});

test('changed source, target, dependencies, checks, documents and review identity invalidate only merge', async t => {
  const root = await setup(t);
  await approvedMerge(root);
  const changes = [
    b => { b.repositories[0].sourceOid = 'e'.repeat(40); },
    b => { b.repositories[0].targetOid = 'e'.repeat(40); },
    b => { b.repositories[0].targetBranch = 'release'; },
    b => { b.repositories[0].dependencies[0].oid = 'e'.repeat(40); },
    b => { b.repositories[0].checks.version = 'checks-2'; },
    b => { b.documentsVersion = 'e'.repeat(64); },
    b => { b.repositories[0].review.id = '43'; },
  ];
  for (const change of changes) {
    const changed = binding();
    change(changed);
    const checked = await checkMergeGate(root, id, 'merge', changed);
    assert.equal(checked.status, 'needs-review');
    assert.equal(checked.confirmed, false);
    assert.match(checked.issues.join(' '), /合入版本绑定已变化/u);
  }
  assert.equal((await checkGate(root, id, 'design')).confirmed, true);
  put(root, evidence.path, '# 新检查证据\n');
  assert.equal((await checkMergeGate(root, id, 'merge', binding())).confirmed, false);
});

test('acceptance never implies merge and merge cannot omit scoped design or evidence snapshots', async t => {
  const root = await setup(t);
  await requestConfirmation(root, id, request('acceptance', 'acceptance'));
  await recordDecision(root, id, decision(root, 'acceptance'));
  await assert.rejects(checkMergeGate(root, id, 'acceptance', binding()), /独立的 merge/u);
  await assert.rejects(requestConfirmation(root, id, mergeRequest('no-design', { upstream: ['acceptance'] })), /design/u);
  await assert.rejects(requestConfirmation(root, id, mergeRequest('other-target', { scope: { repositories: ['.'], targets: ['other'] } })), /覆盖当前范围/u);
  await assert.rejects(requestConfirmation(root, id, mergeRequest('no-evidence', { subjects: [specification] })), /检查证据必须列入/u);
  await assert.rejects(requestConfirmation(root, id, mergeRequest('exception', { exception: {} })), /不能通过例外/u);
  const outside = binding();
  outside.repositories[0].repository = 'other';
  await assert.rejects(requestConfirmation(root, id, mergeRequest('outside', { mergeBinding: outside })), /超出请求仓库范围/u);
  await assert.rejects(requestConfirmation(root, id, mergeRequest('missing', { mergeBinding: undefined })), /合入版本绑定/u);
});

test('unresolved merge issues and revoked design keep merge blocked', async t => {
  const root = await setup(t);
  await requestConfirmation(root, id, mergeRequest('merge', { openIssues: ['仍有阻断评审意见'] }));
  await recordDecision(root, id, decision(root, 'merge'));
  assert.equal((await checkMergeGate(root, id, 'merge', binding())).confirmed, false);
  await requestConfirmation(root, id, mergeRequest('ready'));
  await recordDecision(root, id, decision(root, 'ready'));
  assert.equal((await checkMergeGate(root, id, 'ready', binding())).confirmed, true);
  await recordDecision(root, id, decision(root, 'design', 'revoke-design', { outcome: 'revoked' }));
  assert.equal((await checkMergeGate(root, id, 'ready', binding())).confirmed, false);
});

test('several valid designs may jointly cover merge scope without allowing uncovered targets', async t => {
  const root = await setup(t);
  const otherScope = { repositories: ['.'], targets: ['other-target'] };
  await requestConfirmation(root, id, request('requirements-other', 'requirements', { scope: otherScope }));
  await recordDecision(root, id, decision(root, 'requirements-other'));
  await requestConfirmation(root, id, request('design-other', 'design', { scope: otherScope, upstream: ['requirements-other'] }));
  await recordDecision(root, id, decision(root, 'design-other'));
  const scope = { repositories: ['.'], targets: [id, 'other-target'] };
  await assert.rejects(requestConfirmation(root, id, mergeRequest('missing-coverage', { scope })), /覆盖当前范围/u);
  await requestConfirmation(root, id, mergeRequest('merge', { scope, upstream: ['design', 'design-other'] }));
  await recordDecision(root, id, decision(root, 'merge'));
  assert.equal((await checkMergeGate(root, id, 'merge', binding())).confirmed, true);
});

test('changed merge versions cannot reuse old approval as nonsemantic differences', async t => {
  const root = await setup(t);
  await approvedMerge(root);
  const next = binding();
  next.repositories[0].sourceOid = 'e'.repeat(40);
  await requestConfirmation(root, id, mergeRequest('merge-next', { mergeBinding: next }));
  const original = decision(root, 'merge', 'approve-merge');
  const reused = decision(root, 'merge-next', 'reuse-merge', {
    source: { ...original.source, presentation: file('reviews/request-merge-next/presentation.md') },
    reuseOf: { requestId: 'merge', decisionId: 'approve-merge', reason: '只修改了提交身份' },
  });
  await assert.rejects(recordDecision(root, id, reused), /合入版本绑定变化/u);
});

test('old and unknown confirmation versions reject reads and writes without migrating or deleting files', async t => {
  const root = await setup(t);
  await approvedMerge(root);
  const original = JSON.parse(readFileSync(join(root, registryPath), 'utf8'));
  const nextDecision = decision(root, 'design', 'new-design');
  for (const version of [1, 2, 4]) {
    const bytes = JSON.stringify({ ...original, schemaVersion: version }, null, 4) + '\r\n';
    put(root, registryPath, bytes);
    const before = snapshot(root);
    const unsupported = { code: 'UNSUPPORTED_RECORD_VERSION' };
    await assert.rejects(checkGate(root, id, 'design'), unsupported);
    await assert.rejects(checkMergeGate(root, id, 'merge', binding()), unsupported);
    await assert.rejects(requestConfirmation(root, id, mergeRequest('next')), unsupported);
    await assert.rejects(recordDecision(root, id, nextDecision), unsupported);
    assert.equal(readFileSync(join(root, registryPath), 'utf8'), bytes);
    assert.deepEqual(snapshot(root), before);
  }
});
