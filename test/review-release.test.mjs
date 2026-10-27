import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readCaseLibrary } from '../dist/cases.js';
import { cli, confirmTask, failure, fixture, put, success } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const legacyScenarioHeading = ['面向谁', '与问题'].join('');
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const taskPath = id => `.tiller/task/${id}/task.md`;
const section = (content, title) => {
  const start = content.search(new RegExp(`^## ${title}\\s*$`, 'mu'));
  if (start < 0) return '';
  const rest = content.slice(start).replace(/^##[^\n]*\n?/u, '');
  return rest.split(/^##\s+/mu)[0].trim();
};

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function commit(root, message) {
  git(root, 'add', 'src', 'test', '.tiller/cases', '.tiller/specs', '.tiller/context');
  git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD').trim();
}

async function project(t, releaseReady = false) {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, 'src/value.txt', 'one\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(1, 1));\n");
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Baseline behavior\n\nThe baseline test guards a task change.\n');
  put(root, '.tiller/cases/modules/workflow/behavior.md', `# workflow / behavior

## CASE-001 Baseline behavior is regression tested

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：\`.tiller/specs/modules/workflow/requirements.md#baseline-behavior\`

### 前置条件

- 工作流模块和测试环境可用。

### 步骤

1. 执行引用 CASE-001 的具名测试。

### 输入

- 正常的工作流输入。

### 预期结果

测试通过，基线行为保持在回归范围内。
`);
  if (releaseReady) {
    put(root, 'package.json', JSON.stringify({ name: 'tiller-fixture', version: '1.2.3', description: 'Release fixture' }, null, 2) + '\n');
    put(root, 'README.md', '# tiller fixture\n\n当前版本 1.2.3。\n\n```sh\nnpm test\n```\n');
  }
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

async function verifiedTask(root, id = '20261022-fixture', options = {}) {
  success(cli(root, 'start', id, '--title', 'Fixture task', '--requirement', 'Keep the fixture behavior stable.',
    '--criterion', 'AC-1=Fixture behavior is verified', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  put(root, 'src/value.txt', 'two\n');
  if (options.touchModuleTest) {
    put(root, 'test/baseline.test.mjs', `${read(root, 'test/baseline.test.mjs').trimEnd()}\n// CASE-001 module regression fixture.\n`);
  }
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  return commit(root, 'feat(workflow): 更新夹具行为');
}

async function acceptedTask(root, id = '20261022-fixture', options = {}) {
  const acceptanceCommit = await verifiedTask(root, id, options);
  success(cli(root, 'check', id));
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
  return acceptanceCommit;
}

test('CASE-104 review findings persist and blocking findings stop acceptance', async t => {
  const root = await project(t);
  const id = '20261022-review-gate';
  await verifiedTask(root, id);
  assert.equal(success(cli(root, 'check', id)).ready, true);

  const reviewed = cli(root, 'review', id, '--by', 'Independent Reviewer', '--blocking', '缺少边界输入验证');
  assert.equal(reviewed.status, 1);
  assert.equal(reviewed.data.ready, false);
  assert.deepEqual(reviewed.data.openBlockers, ['REV-001']);
  const body = read(root, taskPath(id));
  assert.match(body, /^## 评审$/mu);
  assert.match(body, /^### REV-001$/mu);
  assert.match(body, /^- 阻塞：是$/mu);
  assert.match(body, /^- 状态：未解决$/mu);
  const blocked = failure(cli(root, 'accept', id, '--by', 'Tiller Test'));
  assert.equal(blocked.error.code, 'NOT_READY');
  assert.match(blocked.error.message, /REV-001/u);

  const resolved = success(cli(root, 'review', id, '--by', 'Independent Reviewer', '--resolve', 'REV-001'));
  assert.equal(resolved.ready, true);
  assert.match(read(root, taskPath(id)), /^- 状态：已解决$/mu);
  assert.equal(success(cli(root, 'check', id)).ready, true);
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
});

test('CASE-105 release checklist is executable and exposed by check', async t => {
  const root = await project(t, true);
  const id = '20261022-release-gate';
  await verifiedTask(root, id);
  const early = cli(root, 'release', id);
  assert.equal(early.status, 1);
  assert.ok(early.data.items.some(item => item.id === 'accepted' && item.status === 'fail'));

  success(cli(root, 'check', id));
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
  const released = success(cli(root, 'release', id));
  assert.equal(released.ready, true, released.failures.join('\n'));
  assert.ok(released.items.some(item => item.id === 'version-doc' && item.status === 'pass'));
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.release.ready, true);
  assert.ok(checked.release.items.some(item => item.id === 'scope-clean' && item.status === 'pass'));

  put(root, 'src/value.txt', 'dirty\n');
  const dirty = cli(root, 'release', id);
  assert.equal(dirty.status, 1);
  assert.ok(dirty.data.items.some(item => item.id === 'scope-clean' && item.status === 'fail'));
});

test('CASE-106 check warns when specs were not written back', async t => {
  const root = await project(t);
  const id = '20261022-spec-warning';
  await verifiedTask(root, id);
  const checked = success(cli(root, 'check', id));
  assert.ok(checked.warnings.some(warning => warning.includes('.tiller/specs/') && warning.includes('回写')), checked.warnings.join('\n'));
  assert.ok(!checked.issues.some(issue => issue.includes('回写')));
});

test('CASE-206 accepted close preserves the shared self-check while check still reports hints', async t => {
  const root = await project(t);
  const id = '20261024-closed-self-check';
  await acceptedTask(root, id, { touchModuleTest: true });
  const beforeClose = read(root, taskPath(id));
  success(cli(root, 'close', id, '--reason', '交付完成'));
  assert.equal(read(root, taskPath(id)), beforeClose);
  assert.doesNotMatch(beforeClose, /^## 关闭$/mu);

  const checked = success(cli(root, 'check', id));
  const warnings = checked.warnings.join('\n');
  assert.match(warnings, /本次改动涉及模块 workflow/u);
  assert.match(warnings, /回写/u);

  assert.equal(read(root, taskPath(id)), beforeClose);
});

test('CASE-224 accepted close only cleans local state and leaves shared task content unchanged', async t => {
  const root = await project(t);
  const id = '20261026-post-merge-close';
  await acceptedTask(root, id);
  const before = read(root, taskPath(id));
  const digestBefore = createHash('sha256').update(before).digest('hex');
  const mtimeBefore = statSync(join(root, taskPath(id))).mtimeMs;
  put(root, `.tiller/local/${id}/cleanup-marker.txt`, 'local only\n');

  const closed = success(cli(root, 'close', id, '--reason', '合入后清理本机'));
  assert.equal(closed.stage, '已验收');
  assert.match(closed.stageReason, /本机清理完成/u);
  assert.equal(createHash('sha256').update(read(root, taskPath(id))).digest('hex'), digestBefore);
  assert.equal(statSync(join(root, taskPath(id))).mtimeMs, mtimeBefore);
  assert.equal(read(root, taskPath(id)), before);
  assert.doesNotMatch(before, /^## 关闭$/mu);
  assert.equal(existsSync(join(root, `.tiller/local/${id}`)), false);

  const checked = success(cli(root, 'check', id));
  assert.equal(checked.acceptance.confirmed, true);
  assert.equal(success(cli(root, 'resume', id)).stage, '已验收');
});

test('CASE-107 CASE-265 CASE-271 start requirement-file preserves structured multiline content and source', async t => {
  const root = await project(t);
  const requirementFile = '.tiller/specs/modules/workflow/requirement-file.md';
  put(root, requirementFile, `# 文件需求

## ${legacyScenarioHeading}

维护者需要从稳定需求建立任务。

## 目标

从工程内需求文件建立任务。

保持多行结构和可追溯来源。

## 业务范围

- 做：保留结构化小节。
- 不做：把正文压成一行。

## 验收条件

- AC-9: 文件内验收条件导入任务。
`);
  const id = '20261022-requirement-file';
  const started = success(cli(root, 'start', id, '--title', 'File requirement', '--requirement-file', requirementFile,
    '--size', 'small', '--target', 'src'));
  assert.equal(started.requirementFile, requirementFile);
  assert.deepEqual(started.criteria, [{ id: 'AC-9', text: '文件内验收条件导入任务。' }]);
  const body = read(root, taskPath(id));
  assert.match(body, /需求来源：`\.tiller\/specs\/modules\/workflow\/requirement-file\.md`/u);
  assert.match(body, /### 使用场景\n\n维护者需要从稳定需求建立任务。/u);
  assert.doesNotMatch(body, new RegExp(legacyScenarioHeading, 'u'));
  assert.match(body, /### 目标\n\n需求来源：`\.tiller\/specs\/modules\/workflow\/requirement-file\.md`\n\n从工程内需求文件建立任务。\n\n保持多行结构和可追溯来源。/u);
  assert.match(body, /### 业务范围\n\n- 做：保留结构化小节。\n- 不做：把正文压成一行。/u);
  assert.match(body, /- AC-9: 文件内验收条件导入任务。/u);
  assert.doesNotMatch(body, /对照|LIB-AC/u);

  put(root, '.tiller/specs/modules/workflow/empty.md', '\n');
  const empty = failure(cli(root, 'start', '20261022-empty-requirement', '--title', 'Empty', '--requirement-file', '.tiller/specs/modules/workflow/empty.md',
    '--criterion', 'AC-1=Empty fails', '--size', 'small', '--target', 'src'));
  assert.equal(empty.error.code, 'EMPTY_REQUIREMENT_FILE');
  const invalid = failure(cli(root, 'start', '20261022-invalid-requirement', '--title', 'Invalid', '--requirement-file', '../outside.md',
    '--criterion', 'AC-1=Invalid path fails', '--size', 'small', '--target', 'src'));
  assert.equal(invalid.error.code, 'INVALID_REQUIREMENT_FILE');
  if (process.platform !== 'win32') {
    symlinkSync('requirement-file.md', join(root, '.tiller/specs/modules/workflow/link.md'));
    const linked = failure(cli(root, 'start', '20261022-linked-requirement', '--title', 'Linked', '--requirement-file', '.tiller/specs/modules/workflow/link.md',
      '--criterion', 'AC-1=Linked path fails', '--size', 'small', '--target', 'src'));
    assert.equal(linked.error.code, 'INVALID_REQUIREMENT_FILE');
  }
  const both = failure(cli(root, 'start', '20261022-both-requirement', '--title', 'Both', '--requirement', 'inline',
    '--requirement-file', requirementFile, '--criterion', 'AC-1=One source only', '--size', 'small', '--target', 'src'));
  assert.equal(both.error.code, 'INVALID_ARGUMENT');
});

test('CASE-274 requirement-file imports AC-n from canonical or legacy headings without a parallel list', async t => {
  const root = await project(t);
  const legacyFile = '.tiller/specs/modules/workflow/legacy-acceptance.md';
  put(root, legacyFile, `# 历史验收条件标题

## 使用场景

维护者从 specs 开任务。

## 目标

复用文件中的验收条件。

## 验收条件（稳定）

- AC-2: 第二条条件来自历史标题。
- AC-1: 第一条条件来自历史标题。
`);
  const aliasId = '20261026-legacy-ac-import';
  const alias = success(cli(root, 'start', aliasId, '--title', 'Legacy AC import', '--requirement-file', legacyFile,
    '--size', 'small', '--target', 'src'));
  assert.deepEqual(alias.criteria, [
    { id: 'AC-1', text: '第一条条件来自历史标题。' },
    { id: 'AC-2', text: '第二条条件来自历史标题。' },
  ]);
  const aliasBody = read(root, taskPath(aliasId));
  assert.match(aliasBody, /### 验收条件\n\n- AC-1: 第一条条件来自历史标题。\n- AC-2: 第二条条件来自历史标题。/u);
  assert.match(aliasBody, /需求来源：`\.tiller\/specs\/modules\/workflow\/legacy-acceptance\.md`/u);
  assert.doesNotMatch(aliasBody, /验收条件（稳定）|LIB-AC|对照/u);

  const canonicalFile = '.tiller/specs/modules/workflow/canonical-acceptance.md';
  put(root, canonicalFile, `# 文件条件优先

## 目标

文件条件优先于命令行条件。

## 验收条件

- AC-1: 文件中的正文。
`);
  const conflictId = '20261026-file-ac-priority';
  const conflict = success(cli(root, 'start', conflictId, '--title', 'File AC priority', '--requirement-file', canonicalFile,
    '--criterion', 'AC-1=命令行正文', '--size', 'small', '--target', 'src'));
  assert.deepEqual(conflict.criteria, [{ id: 'AC-1', text: '文件中的正文。' }]);
  assert.ok(conflict.warnings.some(item => item.includes('需求文件中的 AC-n')));
  const conflictBody = read(root, taskPath(conflictId));
  assert.match(conflictBody, /- AC-1: 文件中的正文。/u);
  assert.doesNotMatch(conflictBody, /命令行正文|对照|LIB-AC/u);

  const noAcFile = '.tiller/specs/modules/workflow/no-acceptance.md';
  put(root, noAcFile, '# 无 AC\n\n## 目标\n\n文件没有验收条件节。\n');
  const missing = failure(cli(root, 'start', '20261026-no-file-ac', '--title', 'No file AC', '--requirement-file', noAcFile,
    '--size', 'small', '--target', 'src'));
  assert.equal(missing.error.code, 'INVALID_FLOW_INPUT');
  assert.match(missing.error.message, /--criterion|AC-n/u);
  assert.equal(existsSync(join(root, taskPath('20261026-no-file-ac'))), false);
});

test('CASE-269 requirement-file rejects local paths and keeps specs multiline source', async t => {
  const root = await project(t);
  for (const [relative, title] of [
    ['.tiller/local/20261022-requirement-source.md', 'stable requirement'],
    ['docs/requirement.md', 'temporary requirement'],
  ]) {
    put(root, relative, `# ${title}\n\n## 目标\n\n该路径不应成为任务需求来源。\n`);
    const rejected = failure(cli(root, 'start', `20261022-${relative.startsWith('.tiller/local/') ? 'local' : 'docs'}-requirement`,
      '--title', 'Unstable requirement', '--requirement-file', relative,
      '--criterion', 'AC-1=Unstable source fails', '--size', 'small', '--target', 'src'));
    assert.equal(rejected.error.code, 'REQUIREMENT_FILE_NOT_STABLE');
    assert.match(rejected.error.message, /\.tiller\/specs\//u);
    assert.match(rejected.error.message, /写入或拷贝/u);
  }

  const stable = '.tiller/specs/modules/workflow/case-req-link.md';
  put(root, stable, `# 稳定需求

## 使用场景

维护者需要可追踪的需求来源。

## 目标

保留多行结构并指向稳定 specs。

## 业务范围

- 做：引用稳定需求。
- 不做：引用临时路径。
`);
  const id = '20261022-stable-requirement';
  const started = success(cli(root, 'start', id, '--title', 'Stable requirement', '--requirement-file', stable,
    '--criterion', 'AC-1=Stable source succeeds', '--size', 'small', '--target', 'src'));
  assert.equal(started.requirementFile, stable);
  const body = read(root, taskPath(id));
  assert.match(body, /需求来源：`\.tiller\/specs\/modules\/workflow\/case-req-link\.md`/u);
  assert.match(body, /### 使用场景\n\n维护者需要可追踪的需求来源。/u);
  assert.match(body, /### 目标\n\n需求来源：`\.tiller\/specs\/modules\/workflow\/case-req-link\.md`\n\n保留多行结构并指向稳定 specs。/u);
  assert.match(body, /### 业务范围\n\n- 做：引用稳定需求。\n- 不做：引用临时路径。/u);
});

test('CASE-108 accepted tasks verify against their acceptance commit', async t => {
  const root = await project(t);
  const id = '20261022-acceptance-pin';
  const acceptanceCommit = await acceptedTask(root, id);
  assert.match(acceptanceCommit, /^[a-f0-9]{40}$/u);
  put(root, 'src/value.txt', 'three\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(3, 3));\n");
  commit(root, 'feat(workflow): 验收后继续演进');

  const checked = success(cli(root, 'check', id));
  assert.ok(!checked.issues.some(issue => issue.includes('验证已过期')), checked.issues.join('\n'));
  assert.equal(checked.acceptance.commit, acceptanceCommit);
  assert.equal(success(cli(root, 'resume', id)).stage, '已验收');
});

test('CASE-108 renamed tests after acceptance do not invalidate the accepted record', async t => {
  const root = await project(t);
  const id = '20261022-acceptance-test-rename';
  const acceptanceCommit = await acceptedTask(root, id);
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline evolved', () => assert.equal(2, 2));\n");
  commit(root, 'test(workflow): 调整验收后的测试名称');

  const checked = success(cli(root, 'check', id));
  assert.equal(checked.acceptance.commit, acceptanceCommit);
  assert.ok(!checked.issues.some(issue => issue.includes('测试引用不一致')), checked.issues.join('\n'));
});

test('CASE-108 accepted tasks still fail when acceptance evidence was not verified', async t => {
  const root = await project(t);
  const id = '20261022-acceptance-unverified';
  success(cli(root, 'start', id, '--title', 'Unverified acceptance', '--requirement', 'Keep reported evidence visible.',
    '--criterion', 'AC-1=Reported evidence remains visible', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  put(root, 'src/value.txt', 'two\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline',
    '--reported', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed', '--reason', 'Runner unavailable in fixture'));
  const acceptanceCommit = commit(root, 'feat(workflow): 记录外部报告');
  success(cli(root, 'check', id, '--allow-reported'));
  success(cli(root, 'accept', id, '--by', 'Tiller Test', '--allow-reported'));

  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('外部报告')), checked.issues.join('\n'));
  assert.ok(!checked.issues.some(issue => issue.includes('验证已过期')), checked.issues.join('\n'));
  assert.equal(checked.acceptance.commit, acceptanceCommit);
});

test('CASE-108 invalidated acceptance falls back to the current workspace', async t => {
  const root = await project(t);
  const id = '20261022-acceptance-invalidated';
  const acceptanceCommit = await acceptedTask(root, id);
  put(root, 'src/value.txt', 'three\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(3, 3));\n");
  commit(root, 'feat(workflow): 验收后继续演进');
  const record = taskPath(id);
  put(root, record, read(root, record).replace('Keep the fixture behavior stable.', 'Requirement changed after acceptance.'));

  const checked = failure(cli(root, 'check', id));
  assert.equal(checked.acceptance.confirmed, false);
  assert.equal(checked.acceptance.commit, acceptanceCommit);
  assert.ok(checked.issues.some(issue => issue.includes('验证已过期')), checked.issues.join('\n'));
  assert.equal(success(cli(root, 'resume', id)).stage, '已开始');
});

test('CASE-109 repository docs and suite include review release and pinned checks', async () => {
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    const content = read(repository, relative);
    assert.match(content, /review/u, relative);
    assert.match(content, /release/u, relative);
    assert.match(content, /验收提交|acceptance/u, relative);
  }
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    assert.match(read(repository, relative), /--requirement-file/u, relative);
  }
  const readme = read(repository, 'README.md');
  assert.match(readme, /快速开始/u, 'README.md');
  assert.match(readme, /`merge`\/`close`/u, 'README.md');
  assert.match(readme, /chore\(tiller\): 完成工程初始化/u, 'README.md');
  assert.match(readme, /npm install -g \.\/tiller-0\.5\.0\.tgz/u, 'README.md');
  const decisions = read(repository, '.tiller/specs/decisions.md');
  assert.match(decisions, /评审/u);
  assert.match(decisions, /验收提交/u);
  const index = read(repository, '.tiller/index.md');
  assert.match(index, /review|评审/u);
  assert.match(index, /release|发布/u);
  assert.match(index, /验收提交/u);
  const suite = JSON.parse(read(repository, 'test/suites.json'));
  assert.ok(suite.e2e.includes('review-release.test.mjs'));
  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  assert.equal(library.cases.length, 286);
  for (const id of ['CASE-104', 'CASE-105', 'CASE-106', 'CASE-107', 'CASE-108', 'CASE-109']) {
    assert.ok(library.cases.find(item => item.id === id)?.tests.length, id);
  }
  const required = ['resources/entry.md', 'resources/usage.md', 'resources/rules/index.md', 'resources/rules/core.md'];
  assert.ok(required.reduce((sum, file) => sum + read(repository, file).length, 0) <= 7400);
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
});
