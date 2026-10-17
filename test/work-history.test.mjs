import assert from 'node:assert/strict';
import { readFile, rename, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { initialize, recoverProject } from '../dist/core.js';
import { applyChanges, withProjectLock } from '../dist/files.js';
import { inspectWork, planWorkAdoption, applyWorkAdoption } from '../dist/work-history.js';
import { fixture, put, snapshot, gitRepository } from './helpers.mjs';

async function project(t) {
  const root = fixture(t);
  await initialize({ root });
  return root;
}
function history(root, id = 'history') {
  put(root, `.tiller/work/${id}/README.md`, '# Historical process\nOriginal entry.\n');
  put(root, `.tiller/work/${id}/spec.md`, '# Requirements\nOriginal requirements.\n');
  return {
    title: 'Historical work', level: 'change', scope: { repositories: ['.'], targets: [id] },
    entry: { repository: '.', path: `.tiller/work/${id}/README.md` },
    artifacts: { requirements: { type: 'change-requirements', source: { repository: '.', path: `.tiller/work/${id}/spec.md` } } },
  };
}

test('inspection diagnoses README-only, handwritten entries and flat history without mutating files', async t => {
  const root = await project(t);
  put(root, '.tiller/work/readme/README.md', '# Process\n');
  put(root, '.tiller/work/manual/work.md', '# Process\n');
  put(root, '.tiller/work/old.md', '# Legacy\n');
  const before = snapshot(root);
  const inspected = await inspectWork(root);
  assert.equal(inspected.ready, false);
  const readme = inspected.works.find(work => work.id === 'readme');
  assert.equal(readme.registration, 'unregistered');
  assert.match(readme.structureIssues.join(' '), /work.md/);
  assert.match(readme.structureIssues.join(' '), /record.json/);
  assert.equal(inspected.works.find(work => work.id === 'old.md').registration, 'legacy-file');
  assert.equal(inspected.works.find(work => work.id === 'manual').structureIssues.length, 1);
  assert.deepEqual(snapshot(root), before);
});

test('adoption uses explicit mapping, preserves originals and allows auxiliary README', async t => {
  const root = await project(t);
  const input = history(root);
  put(root, '.tiller/work/history/confirmations.json', JSON.stringify({ schemaVersion: 1, requests: [], decisions: [] }));
  put(root, '.tiller/work/history/reviews/old-request/presentation.md', '# Historical presentation\n');
  const before = snapshot(root);
  const plan = await planWorkAdoption(root, 'history', input);
  assert.equal(plan.ready, true);
  assert.deepEqual(snapshot(root), before);
  assert.equal((await planWorkAdoption(root, 'history', input)).planId, plan.planId);
  const applied = await applyWorkAdoption(root, 'history', input, plan.planId);
  assert.equal(applied.historicalApproval, 'unknown');
  const record = JSON.parse(await readFile(join(root, '.tiller/work/history/record.json'), 'utf8'));
  assert.equal(record.schemaVersion, 2);
  assert.equal(record.artifacts.requirements.origin, 'history');
  assert.equal(record.artifacts.requirements.status, 'draft');
  assert.ok(Number.isFinite(Date.parse(record.createdAt)));
  for (const [file, contents] of Object.entries(before)) assert.equal(snapshot(root)[file], contents);
  assert.equal((await inspectWork(root, 'history')).ready, true);
  await rename(join(root, '.tiller/work/history/spec.md'), join(root, '.tiller/work/history/renamed.md'));
  assert.match((await inspectWork(root, 'history')).issues.join(' '), /spec.md/);
});

test('adoption rejects ambiguous mixed files, wrong identities and unregistered repositories', async t => {
  const root = await project(t);
  const input = history(root);
  await assert.rejects(planWorkAdoption(root, 'another', input), /原工作标识/);
  const mixed = structuredClone(input);
  mixed.artifacts.design = { ...mixed.artifacts.requirements, type: 'change-design' };
  await assert.rejects(planWorkAdoption(root, 'history', mixed), /同一混合/);
  const process = structuredClone(input);
  process.artifacts.requirements.source = process.entry;
  await assert.rejects(planWorkAdoption(root, 'history', process), /过程入口/);
  const outside = structuredClone(input);
  outside.artifacts.requirements.source.repository = 'unregistered';
  outside.scope.repositories.push('unregistered');
  await assert.rejects(planWorkAdoption(root, 'history', outside), /未登记仓库/);
  const traversal = structuredClone(input);
  traversal.artifacts.requirements.source.path = '../outside.md';
  await assert.rejects(planWorkAdoption(root, 'history', traversal), /路径|不安全|引用/);
});

test('inspection rejects unregistered scope repositories even when artifacts remain local', async t => {
  const root = await project(t);
  const input = history(root);
  const plan = await planWorkAdoption(root, 'history', input);
  await applyWorkAdoption(root, 'history', input, plan.planId);
  const path = '.tiller/work/history/record.json';
  const record = JSON.parse(await readFile(join(root, path), 'utf8'));
  record.scope.repositories.push('unregistered');
  put(root, path, JSON.stringify(record));
  const result = await inspectWork(root, 'history');
  assert.equal(result.ready, false);
  assert.match(result.works[0].structureIssues.join(' '), /未登记仓库/);
});

test('adoption binds source, input bytes and target confirmation history to plan', async t => {
  const root = await project(t);
  const input = history(root);
  put(root, '.tiller/work/mapping.json', JSON.stringify(input));
  const first = await planWorkAdoption(root, 'history', input, '.tiller/work/mapping.json');
  put(root, '.tiller/work/mapping.json', JSON.stringify(input, null, 2));
  await assert.rejects(applyWorkAdoption(root, 'history', input, first.planId, '.tiller/work/mapping.json'), /过期/);
  const second = await planWorkAdoption(root, 'history', input);
  put(root, '.tiller/work/history/reviews/old.txt', 'Original review');
  await assert.rejects(applyWorkAdoption(root, 'history', input, second.planId), /过期/);
  const third = await planWorkAdoption(root, 'history', input);
  put(root, '.tiller/work/history/spec.md', '# Changed requirements\n');
  await assert.rejects(applyWorkAdoption(root, 'history', input, third.planId), /过期/);
});

test('schema 1 migration preserves raw record and completion as history, never approval', async t => {
  const root = await project(t);
  const id = 'legacy';
  put(root, `.tiller/work/${id}/work.md`, '# Existing entry\n');
  put(root, `.tiller/work/${id}/requirements.md`, '# Existing requirements\n');
  const raw = JSON.stringify({
    schemaVersion: 1, id, title: 'Legacy', type: 'change-requirements',
    document: `.tiller/work/${id}/requirements.md`, createdAt: '2025-01-01T00:00:00.000Z', status: 'complete',
    completion: { documentHash: 'a'.repeat(64), evidence: '.tiller/work/legacy/evidence.md', evidenceHash: 'b'.repeat(64), at: '2025-01-02T00:00:00.000Z' },
  }, null, 4);
  put(root, `.tiller/work/${id}/record.json`, raw);
  const input = { title: 'Legacy', level: 'change', scope: { repositories: ['.'], targets: [id] }, artifacts: { requirements: { type: 'change-requirements', source: { repository: '.', path: `.tiller/work/${id}/requirements.md` } } } };
  assert.equal((await inspectWork(root, id)).works[0].registration, 'legacy');
  const plan = await planWorkAdoption(root, id, input);
  await applyWorkAdoption(root, id, input, plan.planId);
  assert.equal(await readFile(join(root, `.tiller/work/${id}/history/record-v1.json`), 'utf8'), raw);
  const migrated = JSON.parse(await readFile(join(root, `.tiller/work/${id}/record.json`), 'utf8'));
  assert.equal(migrated.createdAt, '2025-01-01T00:00:00.000Z');
  assert.equal(migrated.artifacts.requirements.status, 'draft');
  assert.equal(migrated.artifacts.requirements.completionHistory.length, 1);
  assert.equal(migrated.artifacts.requirements.completion, undefined);
});

test('flat records retain original path and history design remains unconfirmed', async t => {
  const root = await project(t);
  put(root, '.tiller/work/old.md', '# Historical notes\n');
  put(root, '.tiller/specs/design.md', '# Historical design\n');
  const input = { title: 'History', level: 'product', scope: { repositories: ['.'], targets: ['new-id'] }, entry: { repository: '.', path: '.tiller/work/old.md' }, artifacts: { design: { type: 'product-design', source: { repository: '.', path: '.tiller/specs/design.md' } } } };
  const plan = await planWorkAdoption(root, 'new-id', input);
  await applyWorkAdoption(root, 'new-id', input, plan.planId);
  assert.equal(await readFile(join(root, '.tiller/work/old.md'), 'utf8'), '# Historical notes\n');
  const record = JSON.parse(await readFile(join(root, '.tiller/work/new-id/record.json'), 'utf8'));
  assert.equal(record.artifacts.design.requirementsBasis, undefined);
  assert.match(await readFile(join(root, '.tiller/work/new-id/work.md'), 'utf8'), /\.\.\/old.md/);
});

test('adoption never writes referenced repository files', async t => {
  const root = fixture(t);
  gitRepository(root, 'repo');
  await initialize({ root, mode: 'workspace', repositories: ['repo'] });
  const input = history(root);
  input.scope.repositories.push('repo');
  input.artifacts.requirements.source = { repository: 'repo', path: 'requirements.md' };
  put(root, 'repo/requirements.md', '# Business requirements\n');
  const before = await readFile(join(root, 'repo/requirements.md'), 'utf8');
  const plan = await planWorkAdoption(root, 'history', input);
  assert.ok(plan.changes.every(change => change.path.startsWith('.tiller/work/history/')));
  await applyWorkAdoption(root, 'history', input, plan.planId);
  assert.equal(await readFile(join(root, 'repo/requirements.md'), 'utf8'), before);
});

test('inspection and adoption reject symlink access', async t => {
  const root = await project(t);
  const input = history(root);
  const linked = join(root, '.tiller/work/linked');
  await symlink(join(root, '.tiller/work/history'), linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await inspectWork(root, 'linked')).works[0].registration, 'invalid');
  input.entry.path = '.tiller/work/linked/README.md';
  input.artifacts.requirements.source.path = '.tiller/work/linked/spec.md';
  await assert.rejects(planWorkAdoption(root, 'linked', input), /链接/);
});

test('adoption changes use standard recovery journal and respect existing transaction', async t => {
  const root = await project(t);
  const input = history(root);
  const plan = await planWorkAdoption(root, 'history', input);
  await withProjectLock(root, async () => {
    await assert.rejects(applyChanges(root, plan.changes, () => { throw new Error('Simulated verification interruption'); }), /Simulated/);
  });
  await assert.rejects(planWorkAdoption(root, 'history', input), /事务|恢复/);
  assert.equal((await recoverProject(root)).recovered, true);
  assert.equal((await inspectWork(root, 'history')).works[0].registration, 'unregistered');
});

test('migration conflicts preserve existing history and lock contention leaves work unchanged', async t => {
  const root = await project(t);
  const input = history(root);
  const original = { schemaVersion: 1, id: 'history', title: 'Old', type: 'change-requirements', document: '.tiller/work/history/requirements.md', createdAt: '2025-01-01T00:00:00.000Z', status: 'draft' };
  put(root, original.document, '# Requirements\n');
  put(root, '.tiller/work/history/record.json', JSON.stringify(original));
  put(root, '.tiller/work/history/history/record-v1.json', 'User history to preserve');
  input.artifacts.requirements.source.path = original.document;
  const before = snapshot(root);
  const conflict = await planWorkAdoption(root, 'history', input);
  assert.equal(conflict.ready, false);
  assert.match(conflict.conflicts.join(' '), /历史副本/);
  await assert.rejects(applyWorkAdoption(root, 'history', input, conflict.planId), /冲突/);
  assert.deepEqual(snapshot(root), before);
  put(root, '.tiller/work/history/history/record-v1.json', JSON.stringify(original));
  const plan = await planWorkAdoption(root, 'history', input);
  const lockBefore = snapshot(root);
  await withProjectLock(root, async () => {
    await assert.rejects(applyWorkAdoption(root, 'history', input, plan.planId), /正在运行/);
  });
  assert.deepEqual(snapshot(root), lockBefore);
});
