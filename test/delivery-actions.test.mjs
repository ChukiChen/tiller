import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWork } from '../dist/work.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { planDeliveryPreparation, applyDeliveryPreparation, loadDeliveryContext } from '../dist/delivery-environment.js';
import { planDeliveryAction, applyDeliveryAction, deliveryDocumentsVersion, verifyDeliveryDocuments } from '../dist/delivery-actions.js';
import { git } from '../dist/delivery-git.js';
import { fixture, put, gitRepository } from './helpers.mjs';

const id = '20261015-actions';
const directory = `.tiller/work/${id}`;
const baselineRoot = fixture({ after });
async function baseFixture() {
  const root = baselineRoot;
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.name', 'Synthetic Test']);
  await git(root, ['config', 'user.email', 'synthetic@example.invalid']);
  await git(root, ['config', 'core.autocrlf', 'false']);
  await initialize({ root });
  await createWork(root, id, 'Delivery actions fixture');
  put(root, `${directory}/work.md`, '# Test work\n');
  put(root, `${directory}/authorization.md`, '# Synthetic authorization\nAllow the explicitly listed fixture actions.\n');
  for (const gate of ['requirements', 'design']) {
    put(root, `${directory}/${gate}.md`, `# Synthetic ${gate}\n`);
    await requestConfirmation(root, id, { requestId: gate, gate, scope: { repositories: ['.'], targets: [id] }, subjects: [{ repository: '.', path: `${directory}/${gate}.md` }], upstream: gate === 'design' ? ['requirements'] : [], reviewSummary: 'Test-only presentation.', openIssues: [], nextAction: 'Test isolated actions.' });
    put(root, `${directory}/${gate}-source.md`, 'Synthetic scoped approval.\n');
    await recordDecision(root, id, { decisionId: `approve-${gate}`, requestId: gate, outcome: 'approved', conditions: [], source: { kind: 'conversation', reference: { repository: '.', path: `${directory}/${gate}-source.md` }, quote: 'Synthetic scoped approval.', presentation: { repository: '.', path: `${directory}/reviews/request-${gate}/presentation.md` } }, sourceReview: { reviewer: 'Fixture', rationale: 'Synthetic approval only.', reviewedAt: new Date().toISOString() } });
  }
  put(root, 'code.txt', 'original\n');
  put(root, 'other.txt', 'untouched\n');
  await git(root, ['add', '--all']);
  await git(root, ['commit', '-m', 'Enable isolated synthetic verification']);
  return root;
}
let base;
async function setup(t) {
  base ??= baseFixture();
  const root = fixture(t);
  cpSync(await base, root, { recursive: true });
  const remote = fixture(t);
  await git(remote, ['init', '--bare']);
  await git(root, ['remote', 'add', 'origin', remote]);
  await git(root, ['push', 'origin', 'main']);
  const input = { schemaVersion: 1, designRequest: 'design', repositories: [{ id: '.', base: 'HEAD', branch: `codex/${id}`, target: 'main', remote: 'origin' }] };
  const plan = await planDeliveryPreparation(root, id, input);
  const context = await applyDeliveryPreparation(root, id, input, plan.planId);
  return { root, checkout: context.recordRoot, remote };
}
function input(action, extra = {}) {
  return { schemaVersion: 1, repository: '.', authorization: { actions: [action], repository: '.', branch: `codex/${id}`, target: 'main', ...(extra.remote ? { remote: extra.remote } : {}), source: { path: `${directory}/authorization.md`, quote: 'Allow the explicitly listed fixture actions.' }, sourceReview: { reviewer: 'Fixture reviewer', rationale: 'Synthetic scope matches test actions only.', reviewedAt: '2026-10-15T00:00:00.000Z' } }, ...extra };
}
async function act(root, action, value) {
  const plan = await planDeliveryAction(root, id, action, value);
  return applyDeliveryAction(root, id, action, value, plan.planId);
}

test('explicit commit stages only selected file, preserves unrelated changes and normal push verifies remote', async t => {
  const { root, checkout } = await setup(t);
  put(checkout, 'code.txt', 'implemented\n');
  put(checkout, 'other.txt', 'unrelated change\n');
  const result = await act(root, 'commit', input('commit', { files: ['code.txt'], message: 'Keep fixture implementation isolated' }));
  assert.equal((await git(checkout, ['show', `${result.oid}:code.txt`])).trim(), 'implemented');
  assert.equal((await git(checkout, ['show', `${result.oid}:other.txt`])).trim(), 'untouched');
  assert.equal(readFileSync(join(root, 'code.txt'), 'utf8'), 'original\n');
  const pushed = await act(root, 'push', input('push', { remote: 'origin', oid: result.oid }));
  assert.equal(pushed.state, 'succeeded');
  assert.match(await git(root, ['ls-remote', 'origin', `refs/heads/codex/${id}`]), new RegExp(result.oid));
  const record = (await loadDeliveryContext(root, id)).record;
  assert.equal(record.events.at(-1).action, 'push');
});

test('changed content and changed authorization invalidate plans without committing', async t => {
  const { root, checkout } = await setup(t);
  put(checkout, 'code.txt', 'first\n');
  const value = input('commit', { files: ['code.txt'], message: 'Keep test scoped' });
  const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  let plan = await planDeliveryAction(root, id, 'commit', value);
  put(checkout, 'code.txt', 'second\n');
  await assert.rejects(applyDeliveryAction(root, id, 'commit', value, plan.planId), /计划已过期/u);
  plan = await planDeliveryAction(root, id, 'commit', value);
  put(checkout, `${directory}/authorization.md`, 'Allow the explicitly listed fixture actions.\nChanged conditions.\n');
  await assert.rejects(applyDeliveryAction(root, id, 'commit', value, plan.planId), /计划已过期/u);
  assert.equal((await git(checkout, ['rev-parse', 'HEAD'])).trim(), head);
});

test('missing authorization, fake quote and unrelated index prevent commits', async t => {
  const { root, checkout } = await setup(t);
  const value = input('commit', { files: ['code.txt'], message: 'Scoped test' });
  put(checkout, 'code.txt', 'modified\n');
  await assert.rejects(planDeliveryAction(root, id, 'commit', { ...value, authorization: undefined }), /明确授权/u);
  const fake = structuredClone(value); fake.authorization.source.quote = 'Invented approval';
  await assert.rejects(planDeliveryAction(root, id, 'commit', fake), /原话不在/u);
  put(checkout, 'other.txt', 'staged unrelated\n');
  await git(checkout, ['add', 'other.txt']);
  const index = await git(checkout, ['diff', '--cached', '--name-only']);
  await assert.rejects(planDeliveryAction(root, id, 'commit', value), /暂存区已有/u);
  assert.equal(await git(checkout, ['diff', '--cached', '--name-only']), index);
});

test('remote identity drift invalidates push plan even if branch OIDs agree', async t => {
  const { root, checkout } = await setup(t);
  const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  const value = input('push', { remote: 'origin', oid: head });
  const plan = await planDeliveryAction(root, id, 'push', value);
  const other = fixture(t); await git(other, ['init', '--bare']);
  await git(root, ['remote', 'set-url', 'origin', other]);
  await assert.rejects(applyDeliveryAction(root, id, 'push', value, plan.planId), /计划已过期/u);
  assert.equal((await git(root, ['ls-remote', 'origin'])).trim(), '');
});

test('multiple push destinations are rejected before any remote write', async t => {
  const { root, checkout, remote } = await setup(t);
  const other = fixture(t); await git(other, ['init', '--bare']);
  await git(root, ['config', '--add', 'remote.origin.pushurl', remote]);
  await git(root, ['config', '--add', 'remote.origin.pushurl', other]);
  await assert.rejects(planDeliveryAction(root, id, 'push', input('push', { remote: 'origin', oid: (await git(checkout, ['rev-parse', 'HEAD'])).trim() })), /多个读写地址/u);
  assert.equal((await git(other, ['for-each-ref'])).trim(), '');
});

test('merge cannot proceed without a current whole-delivery binding', async t => {
  const { root, checkout } = await setup(t);
  const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  await assert.rejects(planDeliveryAction(root, id, 'merge', input('merge', { remote: 'origin' })), /整体交付回执/u);
  assert.equal((await git(checkout, ['rev-parse', 'HEAD'])).trim(), head);
});

test('cleanup requires separate authority and refuses dirty or unique records', async t => {
  const { root } = await setup(t);
  const value = input('cleanup', { removeWorktree: true, remote: 'origin' });
  await assert.rejects(planDeliveryAction(root, id, 'cleanup', value), /单独授权/u);
  value.authorization.actions.push('remove-worktree');
  await assert.rejects(planDeliveryAction(root, id, 'cleanup', value), /未提交|未跟踪|归档/u);
});

test('cleanup restores only archived controls and preserves exact receipts at durable source', async t => {
  const { root, checkout } = await setup(t);
  put(checkout, 'code.txt', 'delivery\n');
  const committed = await act(root, 'commit', input('commit', { files: ['code.txt'], message: 'Keep delivery evidence recoverable' }));
  await act(root, 'push', input('push', { remote: 'origin', oid: committed.oid }));
  // Synthetic external archival step: the source is outside the disposable local tree.
  cpSync(join(checkout, directory), join(root, directory), { recursive: true });
  const before = JSON.parse(readFileSync(join(root, directory, 'delivery.json'), 'utf8'));
  const value = input('cleanup', { removeWorktree: true, remote: 'origin' });
  value.authorization.actions.push('remove-worktree');
  const result = await act(root, 'cleanup', value);
  assert.equal(result.removedWorktree, true);
  assert.equal(existsSync(checkout), false);
  const after = JSON.parse(readFileSync(join(root, directory, 'delivery.json'), 'utf8'));
  assert.deepEqual(after.events.slice(0, before.events.length), before.events);
  assert.equal(after.events.at(-1).action, 'cleanup');
  assert.match(await git(root, ['branch', '--list', `codex/${id}`]), /codex/u);
});

test('failed worktree removal preserves archived authority and can reconcile after factual recovery', async t => {
  const { root, checkout } = await setup(t);
  const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  await act(root, 'push', input('push', { remote: 'origin', oid: head }));
  cpSync(join(checkout, directory), join(root, directory), { recursive: true });
  const value = input('cleanup', { removeWorktree: true, remote: 'origin' });
  value.authorization.actions.push('remove-worktree');
  await git(root, ['worktree', 'lock', checkout]);
  const plan = await planDeliveryAction(root, id, 'cleanup', value);
  await assert.rejects(applyDeliveryAction(root, id, 'cleanup', value, plan.planId), /先核对结果/u);
  assert.equal((await loadDeliveryContext(root, id)).recordRoot, root);
  const operationId = JSON.parse(readFileSync(join(root, directory, 'delivery.json'), 'utf8')).events.at(-1).id;
  const recovery = { schemaVersion: 1, repository: '.', operationId };
  await assert.rejects(planDeliveryAction(root, id, 'reconcile', recovery), /部分完成/u);
  await git(root, ['worktree', 'unlock', checkout]);
  await git(root, ['worktree', 'remove', checkout]);
  const result = await act(root, 'reconcile', recovery);
  assert.equal(result.removedWorktree, true);
  assert.equal(result.reconciledOperation, operationId);
});

test('explicit remote branch deletion is guarded and requires retained target ancestry', async t => {
  const { root, checkout } = await setup(t);
  const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  await act(root, 'push', input('push', { remote: 'origin', oid: head }));
  cpSync(join(checkout, directory), join(root, directory), { recursive: true });
  const value = input('cleanup', { deleteRemoteBranch: true, remote: 'origin' });
  value.authorization.actions.push('delete-remote-branch');
  const plan = await planDeliveryAction(root, id, 'cleanup', value);
  put(checkout, 'code.txt', 'new remote tip\n');
  await git(checkout, ['add', 'code.txt']);
  await git(checkout, ['commit', '-m', 'Advance synthetic tip']);
  const newHead = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  await git(checkout, ['push', 'origin', `HEAD:refs/heads/codex/${id}`]);
  await assert.rejects(applyDeliveryAction(root, id, 'cleanup', value, plan.planId));
  assert.match(await git(root, ['ls-remote', 'origin', `refs/heads/codex/${id}`]), new RegExp(newHead));
  // Keep the new tip at the remote target before explicitly deleting its feature ref.
  await git(checkout, ['push', 'origin', 'HEAD:refs/heads/main']);
  cpSync(join(checkout, directory), join(root, directory), { recursive: true });
  const result = await act(root, 'cleanup', value);
  assert.equal(result.deletedRemoteBranch, true);
  assert.equal((await git(root, ['ls-remote', 'origin', `refs/heads/codex/${id}`])).trim(), '');
  assert.equal(existsSync(checkout), true);
});

test('unknown external operation blocks replay until a factual reconciliation', async t => {
  const { root, checkout } = await setup(t);
  const operationId = '12345678-1234-1234-1234-123456789abc';
  put(root, `.tiller/local/delivery/${id}/operations/${operationId}.json`, JSON.stringify({ operationId, repository: '.', action: 'push', state: 'unknown', head: (await git(checkout, ['rev-parse', 'HEAD'])).trim(), input: { schemaVersion: 1, repository: '.', remote: 'origin', oid: '0'.repeat(40) } }));
  await assert.rejects(planDeliveryAction(root, id, 'push', input('push', { remote: 'origin', oid: (await git(checkout, ['rev-parse', 'HEAD'])).trim() })), /未结束操作/u);
  await assert.rejects(planDeliveryAction(root, id, 'reconcile', { schemaVersion: 1, repository: '.', operationId }), /不能证明/u);
});

test('document manifest is stable, content based and rejects modified approved design', async t => {
  const { root, checkout } = await setup(t);
  const initial = await deliveryDocumentsVersion(root, id);
  assert.match(initial.version, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(initial.files.length > 2);
  assert.ok(initial.files.some(file => file.path.endsWith('/design-source.md')));
  assert.ok(initial.files.some(file => file.path.includes('/reviews/request-design/')));
  const snapshotPath = initial.files.find(file => file.path.endsWith('/reviews/request-design/0.json')).path;
  const snapshotBytes = readFileSync(join(checkout, snapshotPath), 'utf8');
  const snapshot = JSON.parse(snapshotBytes);
  assert.equal(snapshot.encoding, 'utf8');
  put(checkout, snapshotPath, JSON.stringify(snapshot) + '\n');
  assert.notEqual((await deliveryDocumentsVersion(root, id)).version, initial.version, 'manifest binds the actual snapshot wrapper bytes');
  put(checkout, snapshotPath, JSON.stringify({ ...snapshot, content: 'tampered content' }) + '\n');
  await assert.rejects(deliveryDocumentsVersion(root, id), /快照内容与登记摘要不符/u);
  put(checkout, snapshotPath, snapshotBytes);
  put(checkout, `${directory}/work.md`, '# Progress updated\n');
  assert.equal((await deliveryDocumentsVersion(root, id)).version, initial.version);
  put(checkout, `${directory}/design.md`, '# Modified unapproved design\n');
  await assert.rejects(deliveryDocumentsVersion(root, id), /资料发生变化/u);
});

test('Git-owned approved documents must be in the actual delivery commit', async t => {
  const { root, checkout } = await setup(t);
  const initial = await verifyDeliveryDocuments(root, id);
  assert.equal(initial.commits['.'], (await git(checkout, ['rev-parse', 'HEAD'])).trim());
  const design = readFileSync(join(checkout, directory, 'design.md'), 'utf8');
  await git(checkout, ['rm', `${directory}/design.md`]);
  await git(checkout, ['commit', '-m', 'Exercise missing committed design guard']);
  put(checkout, `${directory}/design.md`, design);
  assert.equal((await deliveryDocumentsVersion(root, id)).version, initial.version);
  await assert.rejects(verifyDeliveryDocuments(root, id), /尚未包含在该仓库提交/u);
});

test('non-Git management documents use verified immutable snapshots without inventing a management commit', async t => {
  const root = fixture(t);
  const business = gitRepository(root, 'business');
  await git(business, ['checkout', '-b', 'main']);
  await git(business, ['config', 'user.name', 'Synthetic']);
  await git(business, ['config', 'user.email', 'test@example.invalid']);
  put(business, 'code.txt', 'code\n');
  await git(business, ['add', '--all']);
  await git(business, ['commit', '-m', 'Enable no-Git manager fixture']);
  await initialize({ root, mode: 'workspace', repositories: ['business'] });
  await createWork(root, id, 'Management fixture', { type: 'change-requirements', scope: { repositories: ['.', 'business'], targets: [id] } });
  put(root, `${directory}/work.md`, '# Non-Git management\n');
  for (const gate of ['requirements', 'design']) {
    put(root, `${directory}/${gate}.md`, `# ${gate}\n`);
    await requestConfirmation(root, id, { requestId: gate, gate, scope: { repositories: ['.', 'business'], targets: [id] }, subjects: [{ repository: '.', path: `${directory}/${gate}.md` }], upstream: gate === 'design' ? ['requirements'] : [], reviewSummary: 'Synthetic workspace scope.', openIssues: [], nextAction: 'Test snapshot identity.' });
    put(root, `${directory}/${gate}-source.md`, 'Synthetic scoped approval.\n');
    await recordDecision(root, id, { decisionId: `approve-${gate}`, requestId: gate, outcome: 'approved', conditions: [], source: { kind: 'conversation', reference: { repository: '.', path: `${directory}/${gate}-source.md` }, quote: 'Synthetic scoped approval.', presentation: { repository: '.', path: `${directory}/reviews/request-${gate}/presentation.md` } }, sourceReview: { reviewer: 'Fixture', rationale: 'Synthetic scope only.', reviewedAt: new Date().toISOString() } });
  }
  const input = { schemaVersion: 1, designRequest: 'design', repositories: [{ id: 'business', base: 'HEAD', branch: `codex/${id}`, target: 'main' }] };
  const plan = await planDeliveryPreparation(root, id, input);
  await applyDeliveryPreparation(root, id, input, plan.planId);
  const material = await verifyDeliveryDocuments(root, id);
  assert.match(material.version, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(material.commits, {});
  assert.equal(existsSync(join(root, '.git')), false);
});
