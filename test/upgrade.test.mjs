import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { initialize, inspectProject, recoverProject, requireReadyProject, sha256, trackedContent } from '../dist/core.js';
import { applyUpgrade, planUpgrade } from '../dist/upgrade.js';
import { applyChanges, hasPendingTransaction, withProjectLock } from '../dist/files.js';
import { fixture, gitRepository, put, snapshot } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

async function legacy(t, workspace = false, version = '0.1.0') {
  const baseline = JSON.parse(readFileSync(new URL(`../resources/baselines/${version}.json`, import.meta.url), 'utf8'));
  const root = fixture(t);
  if (workspace) {
    gitRepository(root, 'repository-a');
    gitRepository(root, 'repository-b');
    put(root, 'repository-a/AGENTS.md', '业务仓库约定\n');
    put(root, 'repository-b/source.txt', '业务代码\n');
  }
  await initialize({ root, mode: workspace ? 'workspace' : 'project', repositories: workspace ? ['repository-a', 'repository-b'] : [] });
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  for (const [relative, original] of Object.entries(baseline.files)) {
    const content = workspace && relative === '.tiller/index.md'
      ? original.replace('管理方式：当前工程。', '管理方式：独立管理工程。') : original;
    const current = read(root, relative);
    put(root, relative, current.replace(trackedContent(relative, current), () => content));
    metadata.managedFiles[relative] = sha256(content);
  }
  for (const relative of ['.tiller/usage.md', '.tiller/run.cjs'].filter(name => !Object.hasOwn(baseline.files, name))) {
    rmSync(join(root, relative), { force: true });
    delete metadata.managedFiles[relative];
  }
  metadata.resourceVersion = version;
  if (!['0.3.1', '0.3.2', '0.3.3'].includes(version)) delete metadata.repositoryPaths;
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  return root;
}

test('upgrade preview is read-only and stable; legacy init never migrates implicitly', async t => {
  const root = await legacy(t);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.deepEqual(snapshot(root), before);
  assert.equal(plan.ready, true);
  assert.equal(plan.sourceVersion, '0.1.0');
  assert.equal(plan.targetVersion, '0.3.4');
  assert.equal((await planUpgrade(root)).planId, plan.planId);
  assert.equal((await initialize({ root })).changed, false);
  assert.deepEqual(snapshot(root), before);
  assert.equal((await inspectProject(root)).compatibility, 'read-only');
  await requireReadyProject(root, { write: false });
  await assert.rejects(requireReadyProject(root), /旧版工程仅支持只读/u);
});

test('upgrade preserves section surroundings, custom rules, source and old completion records', async t => {
  const root = await legacy(t);
  put(root, 'AGENTS.md', '用户入口\n' + read(root, 'AGENTS.md') + '\n用户尾部\n');
  put(root, '.tiller/index.md', read(root, '.tiller/index.md') + '\n自定义资料索引\n');
  put(root, '.tiller/rules/project.md', '项目独立约定\n');
  put(root, '.tiller/work/old/record.json', '{"state":"complete","legacy":true}\n');
  put(root, 'source.txt', '业务内容\n');
  const oldRecord = read(root, '.tiller/work/old/record.json');
  const created = JSON.parse(read(root, '.tiller/project.json')).createdAt;
  const plan = await planUpgrade(root);
  assert.equal(plan.changes.at(-1).path, '.tiller/project.json');
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.changed, true);
  assert.equal(result.metadata.resourceVersion, '0.3.4');
  assert.equal(result.metadata.createdAt, created);
  assert.match(read(root, 'AGENTS.md'), /^用户入口\n/u);
  assert.match(read(root, 'AGENTS.md'), /用户尾部\n$/u);
  assert.match(read(root, '.tiller/index.md'), /自定义资料索引\n$/u);
  assert.equal(read(root, '.tiller/rules/project.md'), '项目独立约定\n');
  assert.equal(read(root, 'source.txt'), '业务内容\n');
  assert.equal(read(root, '.tiller/work/old/record.json'), oldRecord);
  const repeated = await planUpgrade(root);
  assert.deepEqual(repeated.changes, []);
  assert.equal((await applyUpgrade(root, repeated.planId)).changed, false);
});

test('modified managed resources and fabricated legacy baselines cannot be overwritten', async t => {
  const root = await legacy(t);
  const relative = '.tiller/rules/core.md';
  put(root, relative, read(root, relative) + '\n用户修改\n');
  const before = snapshot(root);
  let plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  metadata.managedFiles[relative] = sha256(read(root, relative));
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  assert.ok(plan.conflicts.some(issue => issue.includes('不能验证旧资源基线')));
});

test('stale plan rejects even section-external changes and known permissive clauses conflict', async t => {
  const root = await legacy(t);
  const plan = await planUpgrade(root);
  put(root, 'AGENTS.md', '用户新增说明\n' + read(root, 'AGENTS.md'));
  const before = snapshot(root);
  await assert.rejects(applyUpgrade(root, plan.planId), /计划已过期/u);
  assert.deepEqual(snapshot(root), before);
  put(root, 'AGENTS.md', '不要求每次工作都走完固定流程或逐阶段审批。\n' + read(root, 'AGENTS.md'));
  const conflicting = await planUpgrade(root);
  assert.equal(conflicting.ready, false);
  assert.ok(conflicting.conflicts.some(issue => issue.includes('宽松审批表述')));
});

test('unknown versions fail without changes', async t => {
  const root = await legacy(t);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  metadata.resourceVersion = '99.0.0';
  put(root, '.tiller/project.json', JSON.stringify(metadata));
  const before = snapshot(root);
  await assert.rejects(planUpgrade(root), /版本不受支持/u);
  await assert.rejects(initialize({ root }), /版本不受支持/u);
  assert.deepEqual(snapshot(root), before);
});

test('partial upgrade blocks further migration and recovers original content and version', async t => {
  const root = await legacy(t);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  put(root, '.tiller/local/transaction.json', JSON.stringify({ schemaVersion: 1, changes: plan.changes }));
  put(root, plan.changes[0].path, plan.changes[0].after);
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).resourceVersion, '0.1.0');
  await assert.rejects(planUpgrade(root), /未完成事务/u);
  assert.equal((await recoverProject(root)).recovered, true);
  assert.deepEqual(snapshot(root), before);
  assert.equal((await applyUpgrade(root, (await planUpgrade(root)).planId)).ready, true);
});

test('verification failure retains transaction; recovery preserves later edits by refusing conflict', async t => {
  const root = await legacy(t);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  await assert.rejects(withProjectLock(root, () => applyChanges(root, plan.changes, async () => {
    throw new Error('模拟复验失败');
  })), /模拟复验失败/u);
  assert.equal(await hasPendingTransaction(root), true);
  assert.equal((await inspectProject(root)).ready, false);
  const first = plan.changes[0];
  put(root, first.path, first.after + '\n后续用户编辑\n');
  const edited = snapshot(root);
  await assert.rejects(recoverProject(root), /恢复冲突/u);
  assert.deepEqual(snapshot(root), edited);
  put(root, first.path, first.after);
  await recoverProject(root);
  assert.deepEqual(snapshot(root), before);
});

test('workspace upgrade retains repositories, child rules and existing documents', async t => {
  const root = await legacy(t, true);
  const before = snapshot(root);
  const result = await applyUpgrade(root, (await planUpgrade(root)).planId);
  assert.equal(result.ready, true);
  assert.deepEqual(result.metadata.repositories, ['repository-a', 'repository-b']);
  const after = snapshot(root);
  for (const [relative, content] of Object.entries(before)) {
    if (relative.startsWith('repository-')) assert.equal(after[relative], content);
  }
});

test('managed sections accept CRLF edits while upgrading preserves outside bytes', async t => {
  const root = await legacy(t);
  for (const relative of ['AGENTS.md', '.gitignore', '.tiller/index.md']) {
    const current = read(root, relative).replace(/\r?\n/gu, '\r\n');
    put(root, relative, `自定义前部\r\n${current}\r\n自定义后部\r\n`);
  }
  assert.equal((await inspectProject(root)).ready, true);
  const originals = Object.fromEntries(['AGENTS.md', '.gitignore', '.tiller/index.md'].map(relative => [relative, read(root, relative)]));
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal((await applyUpgrade(root, plan.planId)).ready, true);
  for (const [relative, before] of Object.entries(originals)) {
    const after = read(root, relative);
    assert.equal(after.replace(trackedContent(relative, after), ''), before.replace(trackedContent(relative, before), ''));
  }
});

test('managed section metadata recorded with CRLF remains readable after LF conversion', async t => {
  const root = await legacy(t);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  for (const relative of ['AGENTS.md', '.gitignore', '.tiller/index.md']) {
    const section = trackedContent(relative, read(root, relative));
    metadata.managedFiles[relative] = sha256(section.replace(/\r?\n/gu, '\r\n'));
  }
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  assert.equal((await inspectProject(root)).ready, true);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal((await applyUpgrade(root, plan.planId)).ready, true);
});

test('EOL equivalence permits distributed rule checkout conversion but rejects substantive edits', async t => {
  const root = await legacy(t);
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
  assert.equal((await planUpgrade(root)).ready, false);
});

test('0.2.0 requires explicit upgrade and preserves custom content and confirmation history', async t => {
  const root = await legacy(t, false, '0.2.0');
  put(root, 'AGENTS.md', '项目自定义前文\n' + read(root, 'AGENTS.md') + '\n项目自定义后文\n');
  put(root, '.tiller/rules/project.md', '项目专属规则\n');
  put(root, '.tiller/work/20261015-existing/confirmations.json', '{"historical":true}\n');
  put(root, 'src/Student.java', 'class Student {}\n');
  const originalEntry = read(root, 'AGENTS.md');
  const before = snapshot(root);
  assert.equal((await inspectProject(root)).compatibility, 'read-only');
  await requireReadyProject(root, { write: false });
  await assert.rejects(requireReadyProject(root), /旧版工程仅支持只读/u);
  assert.equal((await initialize({ root })).changed, false);
  const plan = await planUpgrade(root);
  assert.deepEqual(snapshot(root), before);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal(plan.sourceVersion, '0.2.0');
  assert.equal(plan.targetVersion, '0.3.4');
  assert.equal(plan.changes.at(-1).path, '.tiller/project.json');
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.metadata.resourceVersion, '0.3.4');
  assert.equal(result.compatibility, 'read-write');
  const after = snapshot(root);
  assert.equal(read(root, 'AGENTS.md').replace(trackedContent('AGENTS.md', read(root, 'AGENTS.md')), ''),
    originalEntry.replace(trackedContent('AGENTS.md', originalEntry), ''));
  for (const relative of ['.tiller/rules/project.md', '.tiller/work/20261015-existing/confirmations.json', 'src/Student.java']) {
    assert.equal(after[relative], before[relative]);
  }
  const repeated = await planUpgrade(root);
  assert.deepEqual(repeated.changes, []);
  assert.equal((await applyUpgrade(root, repeated.planId)).changed, false);
});

test('0.2.0 changed entry remains a conflict even with a forged matching metadata digest', async t => {
  const root = await legacy(t, false, '0.2.0');
  const entry = read(root, 'AGENTS.md').replace('## tiller 工作入口', '## 项目修改的受管入口');
  put(root, 'AGENTS.md', entry);
  assert.equal((await planUpgrade(root)).ready, false);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  metadata.managedFiles['AGENTS.md'] = sha256(trackedContent('AGENTS.md', entry));
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  assert.ok(plan.conflicts.some(issue => issue.includes('不能验证旧资源基线')));
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
});

test('0.2.0 workspace upgrade selects its own baseline and preserves all repository contents', async t => {
  const root = await legacy(t, true, '0.2.0');
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.metadata.resourceVersion, '0.3.4');
  assert.deepEqual(result.metadata.repositories, ['repository-a', 'repository-b']);
  assert.match(read(root, '.tiller/index.md'), /管理方式：独立管理工程。/u);
  const after = snapshot(root);
  for (const [relative, content] of Object.entries(before)) {
    if (relative.startsWith('repository-')) assert.equal(after[relative], content);
  }
});

for (const version of ['0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3']) for (const workspace of [false, true]) {
  test(`${version} explicit upgrade preserves handwritten and machine work records (${workspace ? 'workspace' : 'project'})`, async t => {
    const root = await legacy(t, workspace, version);
    put(root, 'AGENTS.md', '用户自定义前文\n' + read(root, 'AGENTS.md') + '\n用户自定义后文\n');
    put(root, '.tiller/work/old-note.md', '# 既有过程\n');
    put(root, '.tiller/work/old/README.md', '# 手工需求与过程\n');
    put(root, '.tiller/work/old/record.json', '{"schemaVersion":1,"state":"complete"}\n');
    put(root, '.tiller/work/old/confirmations.json', '{"historical":true}\n');
    const before = snapshot(root);
    assert.equal((await inspectProject(root)).compatibility, 'read-only');
    await requireReadyProject(root, { write: false });
    await assert.rejects(requireReadyProject(root), /旧版工程仅支持只读/u);
    assert.equal((await initialize({ root, mode: workspace ? 'workspace' : 'project', repositories: workspace ? ['repository-a', 'repository-b'] : [] })).changed, false);
    const plan = await planUpgrade(root);
    assert.equal(plan.ready, true, plan.conflicts.join('\n'));
    assert.equal(plan.sourceVersion, version);
    assert.equal(plan.targetVersion, '0.3.4');
    assert.deepEqual(snapshot(root), before);
    assert.ok(plan.warnings.some(warning => warning.includes('工作记录不随规则升级迁移')));
    const result = await applyUpgrade(root, plan.planId);
    assert.equal(result.compatibility, 'read-write');
    assert.deepEqual(result.metadata.repositoryPaths, workspace
      ? { 'repository-a': 'repository-a', 'repository-b': 'repository-b' } : {});
    assert.equal(read(root, '.gitignore'), Buffer.from(before['.gitignore'], 'base64').toString('utf8'));
    assert.match(read(root, 'AGENTS.md'), /必须使用对应命令创建或登记/u);
    assert.match(read(root, '.tiller/rules/core.md'), /## 工作记录约定/u);
    assert.match(read(root, 'AGENTS.md'), /^用户自定义前文\n/u);
    assert.match(read(root, 'AGENTS.md'), /用户自定义后文\n$/u);
    const after = snapshot(root);
    for (const [relative, content] of Object.entries(before)) {
      if (relative.startsWith('.tiller/work/') || relative.startsWith('repository-')) assert.equal(after[relative], content);
    }
    assert.deepEqual((await planUpgrade(root)).changes, []);
  });
}

test('0.2.1 custom managed work contract is not overwritten even after digest forgery', async t => {
  const root = await legacy(t, false, '0.2.1');
  const relative = '.tiller/rules/core.md';
  put(root, relative, read(root, relative) + '\n项目自定义工作约定\n');
  let plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  metadata.managedFiles[relative] = sha256(read(root, relative));
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  const before = snapshot(root);
  plan = await planUpgrade(root);
  assert.ok(plan.conflicts.some(issue => issue.includes('不能验证旧资源基线')));
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
});


test('0.3.2 upgrades expose functional planning from entry and activity rules without changing old work', async t => {
  const root = await legacy(t, false, '0.3.2');
  assert.equal(Object.keys((await inspectProject(root)).metadata.managedFiles).length, 13);
  put(root, '.tiller/work/20261016-existing/work.md', '# Existing work\nKeep decisions and progress.\n');
  put(root, '.tiller/work/20261016-existing/plan.md', '# Existing plan\n');
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal(plan.sourceVersion, '0.3.2');
  assert.equal(plan.targetVersion, '0.3.4');
  assert.ok(plan.changes.some(change => change.path === '.tiller/rules/core.md'));
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.metadata.resourceVersion, '0.3.4');
  assert.match(read(root, 'AGENTS.md'), /功能分块/u);
  assert.match(read(root, '.tiller/rules/core.md'), /## 功能分块与实施安排/u);
  assert.match(read(root, '.tiller/rules/core.md'), /骨架/u);
  for (const activity of ['design', 'implementation']) {
    assert.match(read(root, '.tiller/rules/activities/' + activity + '.md'), /\.\.\/core\.md#功能分块与实施安排/u);
  }
  const after = snapshot(root);
  for (const [relative, content] of Object.entries(before)) {
    if (relative.startsWith('.tiller/work/')) assert.equal(after[relative], content);
  }
});

test('0.3.2 customized planning rules are preserved when upgrade conflicts', async t => {
  const root = await legacy(t, false, '0.3.2');
  put(root, '.tiller/rules/core.md', read(root, '.tiller/rules/core.md') + '\nProject-specific planning rule.\n');
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
});
for (const workspace of [false, true]) test(`0.3.3 explicit upgrade exposes onboarding and project standards without replacing project evidence (${workspace})`, async t => {
  const root = await legacy(t, workspace, '0.3.3');
  put(root, '.tiller/rules/project.md', '# Existing project conventions\nPreserve the established error contract.\n');
  put(root, '.tiller/context/baseline.md', '# Baseline\nExisting build failures remain recorded.\n');
  put(root, '.tiller/work/20261016-existing/work.md', '# Existing work\nNo retrospective approval.\n');
  put(root, 'AGENTS.md', 'Custom project entry\n' + read(root, 'AGENTS.md'));
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal(plan.sourceVersion, '0.3.3');
  assert.equal(plan.targetVersion, '0.3.4');
  assert.deepEqual(snapshot(root), before);
  assert.ok(plan.changes.some(change => change.path === '.tiller/rules/core.md'));
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.match(read(root, '.tiller/rules/core.md'), /## 已有项目接手/u);
  assert.match(read(root, '.tiller/rules/core.md'), /## 项目开发规范/u);
  assert.match(read(root, 'AGENTS.md'), /已有项目接手/u);
  assert.match(read(root, 'AGENTS.md'), /^Custom project entry\n/u);
  for (const relative of ['.tiller/rules/project.md', '.tiller/context/baseline.md', '.tiller/work/20261016-existing/work.md']) {
    assert.equal(snapshot(root)[relative], before[relative]);
  }
});

for (const workspace of [false, true]) test(`0.3.3 customized rules remain protected even with a forged digest (${workspace})`, async t => {
  const root = await legacy(t, workspace, '0.3.3');
  const relative = '.tiller/rules/core.md';
  put(root, relative, read(root, relative) + '\nExisting project-specific rule.\n');
  const before = snapshot(root);
  let plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  metadata.managedFiles[relative] = sha256(read(root, relative));
  put(root, '.tiller/project.json', JSON.stringify(metadata, null, 2) + '\n');
  const forged = snapshot(root);
  plan = await planUpgrade(root);
  assert.ok(plan.conflicts.some(issue => issue.includes('不能验证旧资源基线')));
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), forged);
});
