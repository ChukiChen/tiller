import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { equivalentManagedContent, initialize, inspectProject, matchesManagedDigest, parseMetadata, PR_TEMPLATE, RESOURCE_VERSION, sha256, SHARED_RESOURCES } from '../dist/core.js';
import { applyUpgrade, planUpgrade } from '../dist/upgrade.js';
import { spawnSync } from 'node:child_process';
import { fixture, gitRepository, put, settleInitBaseline, snapshot } from './helpers.mjs';

const read = (root, name) => readFileSync(join(root, name), 'utf8');
const added = ['.tiller/usage.md'];

function mergeInitBaseline(root, result) {
  const baseline = result.initBaseline;
  if (!baseline?.branch) return settleInitBaseline(root, result);
  const merge = spawnSync('git', [
    '-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid',
    'merge', '--quiet', '--no-edit', baseline.branch,
  ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  if (merge.status === 0) return result;
  return settleInitBaseline(root, result);
}

async function initialized(options) {
  const result = await initialize(options);
  return mergeInitBaseline(options.root, result);
}

test('CASE-050 initialization supplies current usage with discoverable links and no machine paths', async t => {
  const root = fixture(t);
  const result = await initialized({ root });
  assert.equal(RESOURCE_VERSION, '0.5.0');
  assert.equal(result.metadata.resourceVersion, RESOURCE_VERSION);
  assert.equal(Object.keys(result.metadata.managedFiles).length, SHARED_RESOURCES.length + 4);
  assert.ok(existsSync(join(root, PR_TEMPLATE)));
  assert.ok(Object.hasOwn(result.metadata.managedFiles, PR_TEMPLATE));
  for (const name of added) {
    assert.equal(read(root, name), readFileSync(new URL(`../resources/${name.slice(8)}`, import.meta.url), 'utf8'));
    assert.ok(!read(root, name).includes(root));
  }
  assert.ok(!existsSync(join(root, 'resources/workflows')));
  assert.ok(!existsSync(join(root, 'resources/templates')));
  assert.ok(!existsSync(join(root, '.tiller/run.cjs')));
  assert.match(read(root, 'AGENTS.md'), /\.tiller\/usage\.md/u);
  assert.match(read(root, '.tiller/index.md'), /\]\(usage\.md\)/u);
  const usage = read(root, '.tiller/usage.md');
  for (const command of ['start', 'resume', 'confirm', 'verify', 'check', 'accept']) assert.ok(usage.includes(command), command);
  assert.match(usage, /reopen/u);
  assert.ok(!usage.includes('advanced'), 'old audit path must not be advertised');
  assert.match(usage, /--size small/u);
  assert.match(usage, /standard 另生成/u);
  const before = snapshot(root);
  assert.equal((await initialized({ root })).changed, false);
  assert.deepEqual(snapshot(root), before);
});

test('CASE-084 current entry and rules retain default-flow stage, scope, context and compatibility navigation', async t => {
  const root = fixture(t);
  await initialized({ root });
  const rules = read(root, '.tiller/rules/core.md');
  for (const heading of ['任务记录约定', '按目标选择流程', '范围与卡住', 'context 更新', '兼容与升级']) {
    assert.ok(rules.includes(`## ${heading}`), heading);
  }
  assert.match(rules, /小改动.*需求确认.*实现.*验证/u);
  assert.match(rules, /标准\/大功能.*设计确认/u);
  assert.match(rules, /确认绑定 `task\.md` 的结构化正文/u);
  assert.match(rules, /原话可选/u);
  assert.match(read(root, '.tiller/rules/activities/implementation.md'), /只修改本次声明的文件范围/u);
  assert.match(read(root, '.tiller/rules/activities/design.md'), /同步计划更新 `\.tiller\/context\/`/u);
});

for (const workspace of [false, true]) test(`CASE-140 current noop preserves index surroundings and explicit mappings (${workspace})`, async t => {
  const root = fixture(t);
  if (workspace) gitRepository(root, 'repositories/service-a');
  await initialized({ root, mode: workspace ? 'workspace' : 'project', repositories: workspace ? ['repositories/service-a'] : [] });
  const index = '前文\r\n' + read(root, '.tiller/index.md') + '\r\n用户导航\r\n';
  put(root, '.tiller/index.md', index);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.deepEqual(plan.changes, []);
  assert.deepEqual(snapshot(root), before);
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.equal(result.changed, false);
  assert.deepEqual(result.metadata.repositories, metadata.repositories);
  assert.equal(Object.hasOwn(result.metadata, 'repositoryPaths'), false);
  assert.equal(Object.hasOwn(metadata, 'repositoryPaths'), false);
  assert.equal(read(root, '.tiller/index.md'), index);
  assert.match(index, /\]\(usage\.md\)/u);
  assert.ok(index.includes(workspace ? '管理方式：独立管理工程。' : '管理方式：当前工程。'));
  assert.deepEqual(snapshot(root), before);
});

for (const name of added) test(`CASE-141 existing customized ${name} is protected on init and current noop`, async t => {
  const fresh = fixture(t);
  put(fresh, name, '用户原文\n');
  const before = snapshot(fresh);
  await assert.rejects(initialize({ root: fresh }), /冲突/u);
  assert.deepEqual(snapshot(fresh), before);
  const root = fixture(t);
  await initialized({ root });
  put(root, name, '用户原文\n');
  const modified = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), modified);
});

test('CASE-142 current noop binds raw shared-resource bytes even across permitted EOL conversion', async t => {
  const root = fixture(t);
  await initialized({ root });
  const plan = await planUpgrade(root);
  const usage = read(root, '.tiller/usage.md');
  const alternate = usage.includes('\r\n') ? usage.replace(/\r\n/gu, '\n') : usage.replace(/\n/gu, '\r\n');
  assert.notEqual(alternate, usage);
  put(root, '.tiller/usage.md', alternate);
  const converted = snapshot(root);
  assert.equal((await inspectProject(root)).ready, true);
  await assert.rejects(applyUpgrade(root, plan.planId), /过期/u);
  assert.deepEqual(snapshot(root), converted);
  const current = await planUpgrade(root);
  assert.equal(current.ready, true, current.conflicts.join('\n'));
  assert.equal((await applyUpgrade(root, current.planId)).changed, false);
  assert.deepEqual(snapshot(root), converted);
  put(root, '.tiller/rules/core.md', read(root, '.tiller/rules/core.md') + '\n用户修改。\n');
  assert.equal((await inspectProject(root)).ready, false);
  assert.equal((await planUpgrade(root)).ready, false);
});

test('CASE-028 current metadata requires the complete managed set and rejects historical versions', async t => {
  const root = fixture(t);
  await initialized({ root });
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  for (const relative of Object.keys(metadata.managedFiles)) {
    if (relative === PR_TEMPLATE) continue;
    const missing = structuredClone(metadata);
    delete missing.managedFiles[relative];
    assert.throws(() => parseMetadata(JSON.stringify(missing)), /受管文件依据/u);
  }
  const extra = structuredClone(metadata);
  extra.managedFiles['.tiller/unexpected.md'] = sha256('unexpected');
  assert.throws(() => parseMetadata(JSON.stringify(extra)), /受管文件依据/u);
  const previous = structuredClone(metadata);
  delete previous.managedFiles[PR_TEMPLATE];
  assert.equal(parseMetadata(JSON.stringify(previous)).resourceVersion, RESOURCE_VERSION);
  const legacy = structuredClone(metadata);
  legacy.repositories = ['service-a'];
  delete legacy.repositoryPaths;
  assert.throws(() => parseMetadata(JSON.stringify(legacy)), /映射/u);
  const noSidecar = structuredClone(metadata);
  delete noSidecar.repositoryPaths;
  assert.equal(parseMetadata(JSON.stringify(noSidecar)).repositories.length, 0);
  const before = snapshot(root);
  for (const version of ['0.1.0', '0.2.0', '0.3.0', '0.5.1', '99.0.0']) {
    assert.throws(() => parseMetadata(JSON.stringify({ ...metadata, resourceVersion: version })), /版本不受支持/u);
  }
  assert.equal(parseMetadata(JSON.stringify({ ...metadata, resourceVersion: '0.4.0' })).resourceVersion, '0.4.0');
  assert.deepEqual(snapshot(root), before);
});

test('CASE-036 ignored current entry paths block inspection and noop without changing originals', async t => {
  const root = fixture(t);
  gitRepository(root, '.');
  await initialized({ root });
  put(root, '.gitignore', read(root, '.gitignore') + '\n/.tiller/rules/core.md\n');
  assert.equal((await inspectProject(root)).ready, false);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  assert.ok(plan.conflicts.some(issue => issue.includes('共享资料被 Git 忽略')));
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
});

test('CASE-143 managed resource EOL equivalence is bidirectional and restricted to the distributed allowlist', () => {
  const lf = 'first line\nsecond line\n';
  const crlf = lf.replace(/\n/gu, '\r\n');
  for (const relative of ['AGENTS.md', '.gitignore', '.tiller/index.md', PR_TEMPLATE, ...SHARED_RESOURCES.map(name => `.tiller/${name}`)]) {
    assert.equal(equivalentManagedContent(relative, lf, crlf), true, relative);
    assert.equal(equivalentManagedContent(relative, crlf, lf), true, relative);
    assert.equal(matchesManagedDigest(relative, lf, sha256(crlf)), true, relative);
    assert.equal(matchesManagedDigest(relative, crlf, sha256(lf)), true, relative);
    assert.equal(equivalentManagedContent(relative, lf, crlf.replace('second', 'changed')), false, relative);
    assert.equal(matchesManagedDigest(relative, crlf.replace('second', 'changed'), sha256(lf)), false, relative);
  }
  for (const relative of ['.tiller/task/example/task.md', '.tiller/task/example/confirmations.json', '.tiller/rules/project.md', '.tiller/context/notes.md', 'src/code.ts']) {
    assert.equal(equivalentManagedContent(relative, lf, crlf), false, relative);
    assert.equal(matchesManagedDigest(relative, lf, sha256(crlf)), false, relative);
    assert.equal(matchesManagedDigest(relative, crlf, sha256(lf)), false, relative);
    assert.equal(matchesManagedDigest(relative, lf, sha256(lf)), true, relative);
  }
});

test('CASE-144 resource checkout EOL conversion keeps inspection ready and preserves bytes on repeated init', async t => {
  for (const eol of ['\n', '\r\n']) {
    const root = fixture(t);
    await initialized({ root });
    const metadata = JSON.parse(read(root, '.tiller/project.json'));
    for (const name of SHARED_RESOURCES) {
      const relative = `.tiller/${name}`;
      const normalized = read(root, relative).replace(/\r\n/gu, '\n');
      metadata.managedFiles[relative] = sha256(normalized.replace(/\n/gu, eol === '\n' ? '\r\n' : '\n'));
      put(root, relative, normalized.replace(/\n/gu, eol));
    }
    put(root, '.tiller/project.json', JSON.stringify(metadata));
    assert.equal((await inspectProject(root)).ready, true);
    const before = snapshot(root);
    assert.equal((await initialized({ root })).changed, false);
    assert.deepEqual(snapshot(root), before);
    put(root, '.tiller/rules/core.md', read(root, '.tiller/rules/core.md') + '用户修改。\n');
    assert.equal((await inspectProject(root)).ready, false);
  }
});

test('CASE-145 initialization and upgrade accept existing distributed resources with alternate EOL without rewriting them', async t => {
  const files = Object.fromEntries(added.map(relative => {
    const source = readFileSync(new URL(`../resources/${relative.slice(8)}`, import.meta.url), 'utf8');
    return [relative, source.includes('\r\n') ? source.replace(/\r\n/gu, '\n') : source.replace(/\n/gu, '\r\n')];
  }));
  const fresh = fixture(t);
  for (const [relative, text] of Object.entries(files)) put(fresh, relative, text);
  assert.equal((await initialized({ root: fresh })).ready, true);
  for (const [relative, text] of Object.entries(files)) assert.equal(read(fresh, relative), text);
  const root = fixture(t);
  await initialized({ root });
  for (const [relative, text] of Object.entries(files)) put(root, relative, text);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal((await applyUpgrade(root, plan.planId)).ready, true);
  for (const [relative, text] of Object.entries(files)) assert.equal(read(root, relative), text);
});

test('CASE-215 docs describe task-local layout and close cleanup lifecycle', () => {
  const usage = readFileSync(new URL('../resources/usage.md', import.meta.url), 'utf8');
  const core = readFileSync(new URL('../resources/rules/core.md', import.meta.url), 'utf8');
  const delivery = readFileSync(new URL('../resources/rules/activities/delivery.md', import.meta.url), 'utf8');
  const design = readFileSync(new URL('../.tiller/specs/modules/workflow/design.md', import.meta.url), 'utf8');
  const requirements = readFileSync(new URL('../.tiller/specs/modules/workflow/requirements.md', import.meta.url), 'utf8');
  const decisions = readFileSync(new URL('../.tiller/specs/decisions.md', import.meta.url), 'utf8');
  for (const text of [usage, core, delivery, design, decisions]) {
    assert.match(text, /\.tiller\/local\/<id>\//u);
  }
  assert.match(usage, /worktrees\//u);
  assert.match(core, /worktrees\//u);
  assert.match(requirements, /FLOW-34|任务 worktree 生命周期|\.tiller\/local\//u);
  assert.match(design, /worktrees\//u);
  assert.match(decisions, /聚合|worktrees\.json/u);
  assert.match(decisions, /\.tiller\/local\/<id>\//u);
});
