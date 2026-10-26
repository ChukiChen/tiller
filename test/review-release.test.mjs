import assert from 'node:assert/strict';
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readCaseLibrary } from '../dist/cases.js';
import { cli, confirmTask, failure, fixture, put, success } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
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
- 源码：\`src/value.txt\`

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

async function verifiedTask(root, id = '20261022-fixture') {
  success(cli(root, 'start', id, '--title', 'Fixture task', '--requirement', 'Keep the fixture behavior stable.',
    '--criterion', 'AC-1=Fixture behavior is verified', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  put(root, 'src/value.txt', 'two\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  return commit(root, 'feat(workflow): 更新夹具行为');
}

async function acceptedTask(root, id = '20261022-fixture') {
  const acceptanceCommit = await verifiedTask(root, id);
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

test('CASE-206 closed self-check omits long regression hints while check still reports them', async t => {
  const root = await project(t);
  const id = '20261024-closed-self-check';
  await acceptedTask(root, id);
  success(cli(root, 'close', id, '--reason', '交付完成'));
  const closedSelfCheck = section(read(root, taskPath(id)), '自检');
  assert.match(closedSelfCheck, /check/u);
  assert.doesNotMatch(closedSelfCheck, /提示：|本次改动涉及模块|回写|\.tiller\/specs/u);
  assert.ok(closedSelfCheck.split(/\r?\n/u).filter(Boolean).length <= 2, closedSelfCheck);

  const checked = success(cli(root, 'check', id));
  const warnings = checked.warnings.join('\n');
  assert.match(warnings, /本次改动涉及模块 workflow/u);
  assert.match(warnings, /回写/u);

  const selfCheck = section(read(root, taskPath(id)), '自检');
  assert.equal(selfCheck, closedSelfCheck);
});

test('CASE-107 start loads requirement from a project-relative file', async t => {
  const root = await project(t);
  put(root, 'docs/requirement.md', '从工程内需求文件建立任务，并保持需求正文完整可确认。\n');
  const id = '20261022-requirement-file';
  const started = success(cli(root, 'start', id, '--title', 'File requirement', '--requirement-file', 'docs/requirement.md',
    '--criterion', 'AC-1=Requirement file is loaded', '--size', 'small', '--target', 'src'));
  assert.equal(started.requirementFile, 'docs/requirement.md');
  const body = read(root, taskPath(id));
  assert.match(body, /需求来源：`docs\/requirement\.md`/u);
  assert.match(body, /从工程内需求文件建立任务/u);

  put(root, 'docs/empty.md', '\n');
  const empty = failure(cli(root, 'start', '20261022-empty-requirement', '--title', 'Empty', '--requirement-file', 'docs/empty.md',
    '--criterion', 'AC-1=Empty fails', '--size', 'small', '--target', 'src'));
  assert.equal(empty.error.code, 'EMPTY_REQUIREMENT_FILE');
  const invalid = failure(cli(root, 'start', '20261022-invalid-requirement', '--title', 'Invalid', '--requirement-file', '../outside.md',
    '--criterion', 'AC-1=Invalid path fails', '--size', 'small', '--target', 'src'));
  assert.equal(invalid.error.code, 'INVALID_REQUIREMENT_FILE');
  if (process.platform !== 'win32') {
    symlinkSync('requirement.md', join(root, 'docs/link.md'));
    const linked = failure(cli(root, 'start', '20261022-linked-requirement', '--title', 'Linked', '--requirement-file', 'docs/link.md',
      '--criterion', 'AC-1=Linked path fails', '--size', 'small', '--target', 'src'));
    assert.equal(linked.error.code, 'INVALID_REQUIREMENT_FILE');
  }
  const both = failure(cli(root, 'start', '20261022-both-requirement', '--title', 'Both', '--requirement', 'inline',
    '--requirement-file', 'docs/requirement.md', '--criterion', 'AC-1=One source only', '--size', 'small', '--target', 'src'));
  assert.equal(both.error.code, 'INVALID_ARGUMENT');
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
  for (const relative of ['README.md', 'resources/usage.md', '.tiller/usage.md']) {
    const content = read(repository, relative);
    assert.match(content, /review/u, relative);
    assert.match(content, /release/u, relative);
    assert.match(content, /验收提交|acceptance/u, relative);
  }
  assert.match(read(repository, 'README.md'), /可用工程内需求文件接入/u, 'README.md');
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    assert.match(read(repository, relative), /--requirement-file/u, relative);
  }
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
  assert.equal(library.cases.length, 222);
  for (const id of ['CASE-104', 'CASE-105', 'CASE-106', 'CASE-107', 'CASE-108', 'CASE-109']) {
    assert.ok(library.cases.find(item => item.id === id)?.tests.length, id);
  }
  const required = ['resources/entry.md', 'resources/usage.md', 'resources/rules/index.md', 'resources/rules/core.md'];
  assert.ok(required.reduce((sum, file) => sum + read(repository, file).length, 0) <= 7400);
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
});
