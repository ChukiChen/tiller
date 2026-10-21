import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { initialize, inspectProject, recoverProject, readProjectMetadata, RESOURCE_VERSION, sha256, trackedContent } from '../dist/core.js';
import { applyUpgrade, planUpgrade } from '../dist/upgrade.js';
import { applyChanges, hasPendingTransaction, readTextIfExists, withProjectLock } from '../dist/files.js';
import { cli, failure, fixture, gitRepository, put, snapshot } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const unsupportedVersions = ['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3', '0.3.4', '0.3.5', '0.3.6', '0.4.0', '99.0.0'];
async function current(t, workspace = false) {
  const root = fixture(t);
  if (workspace) {
    gitRepository(root, 'repository-a');
    gitRepository(root, 'repository-b');
    put(root, 'repository-a/AGENTS.md', '业务仓库约定\n');
    put(root, 'repository-b/source.txt', '业务代码\n');
  }
  await initialize({ root, mode: workspace ? 'workspace' : 'project', repositories: workspace ? ['repository-a', 'repository-b'] : [] });
  return root;
}
const preserved = {
  '.tiller/rules/project.md': '# Project conventions\nKeep custom review conditions.\n',
  '.tiller/rules/testing.md': '# Existing test policy\n',
  '.tiller/context/baseline.md': '# Baseline\nExisting build failures remain recorded.\n',
  '.tiller/verification/index.md': '# Existing verification\n',
  '.tiller/verification/modules/custom/unit.yaml': 'schema_version: 1\ncases: []\n',
  '.tiller/work/old-note.md': '# 既有过程\n',
  '.tiller/work/old/README.md': '# 手工需求与过程\n',
  '.tiller/work/old/record.json': '{"schemaVersion":2,"state":"complete"}\n',
  '.tiller/work/old/confirmations.json': '{"historical":true}\n',
  '.tiller/work/old/plan.md': '# Existing plan\nB0 is still unverified.\n',
  '.tiller/work/old/work.md': '# Existing work\nNo retrospective approval.\n',
  'src/Student.java': 'class Student {}\n',
};

for (const workspace of [false, true]) test(`current noop preserves every original byte (${workspace})`, async t => {
  const root = await current(t, workspace);
  assert.equal(RESOURCE_VERSION, '0.5.0');
  for (const [relative, content] of Object.entries(preserved)) put(root, relative, content);
  for (const relative of ['AGENTS.md', '.gitignore', '.tiller/index.md']) {
    put(root, relative, '用户自定义前文\n' + read(root, relative) + '\n用户自定义后文\n');
  }
  const before = snapshot(root);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.sourceVersion, RESOURCE_VERSION);
  assert.equal(plan.targetVersion, RESOURCE_VERSION);
  assert.equal((await planUpgrade(root)).planId, plan.planId);
  assert.deepEqual(snapshot(root), before);
  assert.equal((await initialize({ root, mode: workspace ? 'workspace' : 'project', repositories: workspace ? ['repository-a', 'repository-b'] : [] })).changed, false);
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.metadata, metadata);
  assert.deepEqual(snapshot(root), before);
  assert.equal((await applyUpgrade(root, (await planUpgrade(root)).planId)).changed, false);
  assert.deepEqual(snapshot(root), before);
  assert.equal(await hasPendingTransaction(root), false);
  assert.equal(await readTextIfExists(root, '.tiller/local/lock.json'), null);
  const rejected = failure(cli(root, 'work', 'resume', 'old'));
  assert.equal(rejected.error.code, 'UNSUPPORTED_RECORD_VERSION');
  assert.deepEqual(snapshot(root), before);
});

for (const workspace of [false, true]) test(`old and unknown versions refuse without migration (${workspace})`, async t => {
  const root = await current(t, workspace);
  for (const [relative, content] of Object.entries(preserved)) put(root, relative, content);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  for (const version of unsupportedVersions) {
    put(root, '.tiller/project.json', JSON.stringify({ ...metadata, resourceVersion: version }, null, 2) + '\n');
    const before = snapshot(root);
    await assert.rejects(planUpgrade(root), /版本不受支持/u);
    await assert.rejects(applyUpgrade(root, '0'.repeat(64)), /版本不受支持/u);
    await assert.rejects(initialize({ root }), /版本不受支持/u);
    const inspection = await inspectProject(root);
    assert.equal(inspection.ready, false);
    assert.equal(inspection.compatibility, 'unsupported');
    await assert.rejects(readProjectMetadata(root), /版本不受支持/u);
    assert.deepEqual(snapshot(root), before, version);
    assert.equal(await hasPendingTransaction(root), false);
    assert.equal(await readTextIfExists(root, '.tiller/local/lock.json'), null);
  }
});

for (const relative of ['AGENTS.md', '.tiller/rules/core.md']) test(`modified current managed content is preserved: ${relative}`, async t => {
  const root = await current(t);
  const text = read(root, relative);
  const changed = relative === 'AGENTS.md' ? text.replace('tiller 工作入口', '项目修改的受管入口') : text + '\n项目自定义工作约定\n';
  assert.notEqual(changed, text);
  put(root, relative, changed);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
  // Old metadata cannot turn a user edit into a supported migration by forging its digest.
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  metadata.resourceVersion = '0.3.6';
  metadata.managedFiles[relative] = sha256(trackedContent(relative, changed));
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  const forged = snapshot(root);
  await assert.rejects(planUpgrade(root), /版本不受支持/u);
  await assert.rejects(applyUpgrade(root, '0'.repeat(64)), /版本不受支持/u);
  assert.deepEqual(snapshot(root), forged);
});

test('stale plan binds section-external bytes and permissive clauses remain conflicts', async t => {
  const root = await current(t);
  const plan = await planUpgrade(root);
  put(root, 'AGENTS.md', '用户新增说明\n' + read(root, 'AGENTS.md'));
  const before = snapshot(root);
  await assert.rejects(applyUpgrade(root, plan.planId), /计划已过期/u);
  await assert.rejects(applyUpgrade(root, 'invalid'), /计划标识无效/u);
  assert.deepEqual(snapshot(root), before);
  put(root, 'AGENTS.md', '不要求每次工作都走完固定流程或逐阶段审批。\n' + read(root, 'AGENTS.md'));
  const conflicting = await planUpgrade(root);
  assert.equal(conflicting.ready, false);
  assert.ok(conflicting.conflicts.some(issue => issue.includes('宽松审批表述')));
  const conflicted = snapshot(root);
  await assert.rejects(applyUpgrade(root, conflicting.planId), /冲突/u);
  assert.deepEqual(snapshot(root), conflicted);
});

test('current transaction with mixed before/after files blocks noop and recovers originals', async t => {
  const root = await current(t);
  const before = snapshot(root);
  const changes = ['.tiller/rules/core.md', '.tiller/usage.md'].map(path => ({
    path, before: read(root, path), after: read(root, path) + '\nTransaction probe.\n',
  }));
  await assert.rejects(withProjectLock(root, () => applyChanges(root, changes, async () => {
    throw new Error('模拟复验失败');
  })), /模拟复验失败/u);
  assert.equal(await hasPendingTransaction(root), true);
  // A durable real transaction must also recover when a file is already at its before bytes.
  put(root, changes[1].path, changes[1].before);
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).resourceVersion, RESOURCE_VERSION);
  await assert.rejects(planUpgrade(root), /未完成事务/u);
  assert.equal((await recoverProject(root)).recovered, true);
  assert.deepEqual(snapshot(root), before);
  assert.equal(await hasPendingTransaction(root), false);
  assert.equal((await applyUpgrade(root, (await planUpgrade(root)).planId)).changed, false);
});

test('verification failure retains recovery data and later user edits are never overwritten', async t => {
  const root = await current(t);
  const before = snapshot(root);
  const changes = [{ path: '.tiller/rules/core.md', before: read(root, '.tiller/rules/core.md'), after: '# Transaction probe\n' }];
  await assert.rejects(withProjectLock(root, () => applyChanges(root, changes, async () => {
    throw new Error('模拟复验失败');
  })), /模拟复验失败/u);
  assert.equal(await hasPendingTransaction(root), true);
  assert.equal((await inspectProject(root)).ready, false);
  const journal = read(root, '.tiller/local/transaction.json');
  put(root, changes[0].path, changes[0].after + '\n后续用户编辑\n');
  const edited = snapshot(root);
  await assert.rejects(recoverProject(root), /恢复冲突/u);
  assert.deepEqual(snapshot(root), edited);
  assert.equal(read(root, '.tiller/local/transaction.json'), journal);
  put(root, changes[0].path, changes[0].after);
  await recoverProject(root);
  assert.deepEqual(snapshot(root), before);
  assert.equal(await hasPendingTransaction(root), false);
});

test('current managed sections preserve both EOL directions and all outside bytes', async t => {
  for (const eol of ['\n', '\r\n']) {
    const root = await current(t);
    const metadata = JSON.parse(read(root, '.tiller/project.json'));
    for (const relative of ['AGENTS.md', '.gitignore', '.tiller/index.md']) {
      const original = read(root, relative).replace(/\r\n/gu, '\n');
      const section = trackedContent(relative, original);
      metadata.managedFiles[relative] = sha256(section.replace(/\n/gu, eol === '\n' ? '\r\n' : '\n'));
      put(root, relative, `自定义前部${eol}${original.replace(/\n/gu, eol)}${eol}自定义后部${eol}`);
    }
    put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
    assert.equal((await inspectProject(root)).ready, true);
    const before = snapshot(root);
    const plan = await planUpgrade(root);
    assert.equal(plan.ready, true, plan.conflicts.join('\n'));
    assert.equal((await applyUpgrade(root, plan.planId)).changed, false);
    assert.deepEqual(snapshot(root), before);
  }
});

test('EOL equivalence accepts distributed checkout conversion but rejects substantive edits', async t => {
  const root = await current(t);
  const index = read(root, '.tiller/index.md');
  put(root, '.tiller/index.md', index.replace('rules/index.md', 'rules/other.md').replace(/\r?\n/gu, '\r\n'));
  assert.equal((await inspectProject(root)).ready, false);
  assert.equal((await planUpgrade(root)).ready, false);
  put(root, '.tiller/index.md', index);
  const rules = read(root, '.tiller/rules/core.md');
  const converted = rules.includes('\r\n') ? rules.replace(/\r\n/gu, '\n') : rules.replace(/\n/gu, '\r\n');
  assert.notEqual(converted, rules);
  put(root, '.tiller/rules/core.md', converted);
  assert.equal((await inspectProject(root)).ready, true);
  assert.equal((await planUpgrade(root)).ready, true);
  put(root, '.tiller/rules/core.md', converted + '\n用户修改\n');
  assert.equal((await inspectProject(root)).ready, false);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  const before = snapshot(root);
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
});
