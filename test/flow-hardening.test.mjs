import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, failure, fixture, put, success } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function baseline(root) {
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
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
}

test('CASE-174 start warns on a missing task date prefix without rewriting it', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const started = success(cli(root, 'start', 'legacy-task', '--title', 'Legacy id', '--requirement', 'Keep the supplied id.',
    '--criterion', 'AC-1=Legacy id remains readable', '--size', 'small', '--target', 'src'));
  assert.match(started.warnings.join('\n'), /YYYYMMDD-/u);
  assert.equal(started.id, 'legacy-task');
  assert.ok(existsSync(join(root, '.tiller/task/legacy-task/task.md')));
  assert.equal(existsSync(join(root, '.tiller/task/20261023-legacy-task/task.md')), false);

  const help = success(cli(root, '--help')).help;
  assert.match(help, /start <YYYYMMDD-task-id>/u);
  for (const relative of ['resources/usage.md', '.tiller/usage.md', 'AGENTS.md']) {
    const content = read(repository, relative);
    assert.match(content, /20261023-[a-z]/u, relative);
    assert.doesNotMatch(content, /start <task-id>/u, relative);
  }
});

test('CASE-175 standard check flags verification recorded before design confirmation', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-process-order';
  success(cli(root, 'start', id, '--title', 'Process order', '--requirement', 'Keep verification ordered after design.',
    '--criterion', 'AC-1=Ordering is visible', '--type', 'feature', '--size', 'standard', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements'));
  const early = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  assert.equal(early.entries[0].evidence, 'verified');

  const taskPath = `.tiller/task/${id}/task.md`;
  put(root, taskPath, read(root, taskPath).replace('### 方案\n\n### 取舍\n\n### 影响与风险',
    '### 方案\n\nKeep the existing flow.\n\n### 取舍\n\nDo not add a second command.\n\n### 影响与风险\n\nOrdering checks only.'));
  success(cli(root, 'confirm', id, 'design'));

  const checked = cli(root, 'check', id);
  assert.equal(checked.status, 1, JSON.stringify(checked.data));
  assert.ok(checked.data.issues.some(issue => issue.includes('过程卫生') && issue.includes('设计确认前')), checked.data.issues.join('\n'));
  const accepted = failure(cli(root, 'accept', id, '--by', 'Tiller Test'));
  assert.equal(accepted.error.code, 'NOT_READY');
  assert.match(accepted.error.message, /过程卫生/u);
});

test('CASE-175 confirmations expose uncommitted business changes but ignore tiller metadata', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-confirm-dirty';
  success(cli(root, 'start', id, '--title', 'Confirmation hygiene', '--requirement', 'Report uncommitted business changes after confirmation.',
    '--criterion', 'AC-1=Business dirt is visible', '--size', 'small', '--target', '.'));
  success(cli(root, 'confirm', id, 'requirements'));

  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Baseline behavior\n\nMetadata-only edit.\n');
  const metadataOnly = cli(root, 'check', id);
  assert.ok(!metadataOnly.data.issues.some(issue => issue.includes('过程卫生')), metadataOnly.data.issues.join('\n'));

  put(root, 'src/value.txt', 'dirty business change\n');
  const dirty = cli(root, 'check', id);
  assert.equal(dirty.status, 1);
  assert.ok(dirty.data.issues.some(issue => issue.includes('过程卫生') && issue.includes('需求确认提交') && issue.includes('src/value.txt')),
    dirty.data.issues.join('\n'));
  const accepted = failure(cli(root, 'accept', id, '--by', 'Tiller Test'));
  assert.equal(accepted.error.code, 'NOT_READY');
});

for (const [buildFile, runner, marker] of [
  ['pom.xml', 'junit-maven', 'org.junit.jupiter.api.Test'],
  ['build.gradle', 'junit-gradle', 'org.junit.jupiter.api.Test'],
  ['build.gradle.kts', 'junit-gradle', 'org.junit.jupiter.api.Test'],
  [null, 'node-test', "import test from 'node:test';"],
]) test(`CASE-176 ${runner} is detected for init and case skeletons`, async t => {
  const root = fixture(t);
  if (buildFile) put(root, buildFile, 'fixture build file\n');
  const initialized = success(cli(root, 'init'));
  if (runner === 'node-test') assert.equal(initialized.metadata.verify, undefined);
  else assert.equal(initialized.metadata.verify.runner, runner);
  assert.ok(initialized.firstCommit.paths.includes('.tiller/project.json'));
  assert.ok(initialized.firstCommit.paths.includes('AGENTS.md'));
  assert.ok(initialized.firstCommit.paths.includes('.github/pull_request_template.md'));

  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Runner behavior\n\nUse the detected runner.\n');
  put(root, 'src/app.mjs', 'export const app = true;\n');
  const id = '20261023-runner-case';
  success(cli(root, 'start', id, '--title', 'Runner case', '--requirement', 'Generate a matching test skeleton.',
    '--criterion', 'AC-1=Skeleton matches runner', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', 'Runner skeleton',
    '--expected', 'Skeleton uses the configured runner', '--criterion', 'AC-1', '--source', buildFile ?? 'src/app.mjs'));
  assert.equal(added.runner, runner);
  assert.match(added.skeleton, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal(added.skeleton.includes('node:test'), runner === 'node-test');
});

test('CASE-177 untracked managed entries are visible in check and block release', async t => {
  const root = fixture(t);
  const initialized = success(cli(root, 'init'));
  assert.ok(initialized.firstCommit.paths.includes('.tiller/project.json'));
  assert.ok(initialized.firstCommit.paths.includes('AGENTS.md'));
  assert.ok(initialized.firstCommit.paths.includes('.github/pull_request_template.md'));
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');

  const id = '20261023-managed-tracking';
  success(cli(root, 'start', id, '--title', 'Managed tracking', '--requirement', 'Keep managed entries in Git.',
    '--criterion', 'AC-1=Managed entries are tracked', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements'));
  const checked = cli(root, 'check', id);
  assert.ok(checked.data.warnings.some(warning => warning.includes('AGENTS.md') && warning.includes('未纳入 Git')), checked.data.warnings.join('\n'));

  const released = cli(root, 'release', id);
  assert.equal(released.status, 1);
  const item = released.data.items.find(entry => entry.id === 'managed-entry-tracking');
  assert.equal(item.status, 'fail');
  assert.match(item.detail, /\.tiller\/project\.json/u);
  assert.match(item.detail, /AGENTS\.md/u);
  assert.match(item.detail, /\.github\/pull_request_template\.md/u);

  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'chore(workflow): 提交受管入口');
  const committed = cli(root, 'release', id);
  const tracked = committed.data.items.find(entry => entry.id === 'managed-entry-tracking');
  assert.equal(tracked.status, 'pass');
});

test('CASE-178 hardening regression names and version stay linked at 0.5.0', () => {
  const source = read(repository, 'test/flow-hardening.test.mjs');
  for (const id of ['CASE-174', 'CASE-175', 'CASE-176', 'CASE-177']) assert.match(source, new RegExp(id, 'u'));
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    assert.match(read(repository, relative), /`verify` 本身不要求设计确认/u, relative);
    assert.match(read(repository, relative), /骨架随当前 runner 生成/u, relative);
  }
});
