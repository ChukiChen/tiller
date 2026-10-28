import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, completeDesign, completeRequirement, confirmTask, failure, fixture, put, success, read, commitFixtures, taskRecordRoot } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function baseline(root, module = 'workflow') {
  put(root, 'src/value.txt', 'one\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(1, 1));\n");
  put(root, `.tiller/specs/modules/${module}/requirements.md`, `# ${module}\n\n## Baseline behavior\n\nThe baseline test guards a task change.\n`);
  put(root, `.tiller/cases/modules/${module}/behavior.md`, `# ${module} / behavior

## CASE-001 Baseline behavior is regression tested

- 类型：behavior
- 优先级：medium
- 模块：${module}
- 关联 AC：无
- 需求：\`.tiller/specs/modules/${module}/requirements.md#baseline-behavior\`

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
  assert.equal(existsSync(join(root, '.tiller/task/legacy-task/task.md')), false);
  assert.ok(existsSync(join(taskRecordRoot(root, 'legacy-task'), '.tiller/task/legacy-task/task.md')));
  assert.equal(existsSync(join(root, '.tiller/task/20261023-legacy-task/task.md')), false);

  const help = success(cli(root, '--help')).help;
  assert.match(help, /start <YYYYMMDD-task-id>/u);
  for (const relative of ['resources/usage.md', '.tiller/usage.md', 'AGENTS.md']) {
    const content = read(repository, relative);
    assert.match(content, /20261023-[a-z]/u, relative);
    assert.doesNotMatch(content, /start <task-id>/u, relative);
  }
});

test('CASE-175 CASE-307 standard verify before design is rejected; clear-premature restores hygiene', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-process-order';
  success(cli(root, 'start', id, '--title', 'Process order', '--requirement', 'Keep verification ordered after design.',
    '--criterion', 'AC-1=Ordering is visible', '--type', 'feature', '--size', 'standard', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));
  const early = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  assert.equal(early.error.code, 'VERIFY_BEFORE_DESIGN');
  assert.match(early.error.message, /confirm .* design|clear-premature/u);
  const taskBefore = read(taskRecordRoot(root, id), `.tiller/task/${id}/task.md`);
  assert.doesNotMatch(taskBefore, /### run-/u);

  // Plant a historical premature verify segment, then confirm design — hygiene still blocks.
  const plantedAt = '2020-01-01T00:00:00.000Z';
  const planted = taskBefore.replace(
    '## 验证\n\n尚无验证。',
    [
      '## 验证',
      '',
      '### run-1',
      '<!-- tiller-verify:v1 {"command":"node --test","exitCode":0,"tree":"' + 'a'.repeat(64) + '","commit":"' + 'b'.repeat(40) + '"} -->',
      '- 条件：AC-1',
      '- 测试：test/baseline.test.mjs::CASE-001 baseline',
      '- 用例：无',
      '- 结果：passed',
      '- 来源：executed',
      '- 核实：已核实',
      `- 时间：${plantedAt}`,
      '',
    ].join('\n'),
  );
  put(taskRecordRoot(root, id), `.tiller/task/${id}/task.md`, planted);
  completeDesign(root, id);
  success(confirmTask(root, id, 'design'));
  const checked = cli(root, 'check', id);
  assert.equal(checked.status, 1, JSON.stringify(checked.data));
  assert.ok(checked.data.issues.some(issue => issue.includes('过程卫生') && issue.includes('设计确认前')), checked.data.issues.join('\n'));

  const cleared = success(cli(root, 'verify', id, '--clear-premature'));
  assert.equal(cleared.cleared, 1);
  const taskAfter = read(taskRecordRoot(root, id), `.tiller/task/${id}/task.md`);
  assert.doesNotMatch(taskAfter, /### run-1/u);
  const checkedClean = cli(root, 'check', id);
  assert.ok(!checkedClean.data.issues.some(issue => issue.includes('设计确认前')), checkedClean.data.issues.join('\n'));
});

test('CASE-175 confirmations expose uncommitted business changes but ignore tiller metadata', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-confirm-dirty';
  success(cli(root, 'start', id, '--title', 'Confirmation hygiene', '--requirement', 'Report uncommitted business changes after confirmation.',
    '--criterion', 'AC-1=Business dirt is visible', '--size', 'small', '--target', '.'));
  success(confirmTask(root, id, 'requirements'));
  git(root, 'checkout', '--quiet', '-b', `feat/${id}-confirm-dirty`);

  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Baseline behavior\n\nMetadata-only edit.\n\n## 验收条件\n\n- AC-1: Baseline behavior is retained.\n');
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

async function assertRunnerCase(t, buildFile, runner, marker) {
  const root = fixture(t);
  if (buildFile) put(root, buildFile, 'fixture build file\n');
  const initialized = success(cli(root, 'init'));
  if (runner === 'node-test') assert.equal(initialized.metadata.verify, undefined);
  else assert.equal(initialized.metadata.verify.runner, runner);
  assert.ok(initialized.firstCommit.paths.includes('.tiller/project.json'));
  assert.ok(initialized.firstCommit.paths.includes('AGENTS.md'));
  assert.ok(initialized.firstCommit.paths.includes('.github/pull_request_template.md'));

  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Runner behavior\n\nUse the detected runner.\n\n## 验收条件\n\n- AC-1: Skeleton matches runner.\n');
  put(root, 'src/app.mjs', 'export const app = true;\n');
  const id = '20261023-runner-case';
  success(cli(root, 'start', id, '--title', 'Runner case', '--requirement', 'Generate a matching test skeleton.',
    '--criterion', 'AC-1=Skeleton matches runner', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', 'Runner skeleton',
    '--expected', 'Skeleton uses the configured runner', '--criterion', 'AC-1'));
  assert.equal(added.runner, runner);
  assert.match(added.skeleton, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal(added.skeleton.includes('node:test'), true);
  assert.match(added.skeleton, new RegExp(`CASE-\\d+ Runner skeleton`, 'u'));
  if (runner === 'junit-maven') assert.match(added.skeleton, /spawnSync\('mvn'.*Class#method|spawnSync\('mvn'.*ExampleTest#method/u);
  if (runner === 'junit-gradle') assert.match(added.skeleton, /spawnSync\('gradle'.*ExampleTest\.method/u);
  if (runner === 'node-test') assert.match(added.skeleton, /assert\.ok\(true\)/u);
}

test('CASE-176 pom detects junit-maven for init and case skeletons', async t => {
  await assertRunnerCase(t, 'pom.xml', 'junit-maven', 'junit-maven');
});

test('CASE-176 gradle detects junit-gradle for init and case skeletons', async t => {
  await assertRunnerCase(t, 'build.gradle', 'junit-gradle', 'junit-gradle');
});

test('CASE-176 gradle-kts detects junit-gradle for init and case skeletons', async t => {
  await assertRunnerCase(t, 'build.gradle.kts', 'junit-gradle', 'junit-gradle');
});

test('CASE-176 node detects node-test for init and case skeletons', async t => {
  await assertRunnerCase(t, null, 'node-test', "import test from 'node:test';");
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
  success(confirmTask(root, id, 'requirements'));
  const checked = cli(root, 'check', id);
  assert.ok(checked.data.warnings.some(warning => warning.includes('AGENTS.md') && warning.includes('未纳入 Git')), checked.data.warnings.join('\n'));

  const released = cli(root, 'release', id);
  assert.equal(released.status, 1);
  const item = released.data.items.find(entry => entry.id === 'managed-entry-tracking');
  assert.equal(item.status, 'fail');
  assert.match(item.detail, /AGENTS\.md/u);
  assert.match(item.detail, /\.github\/pull_request_template\.md/u);
  assert.match(item.detail, /\.gitignore/u);

  const trackingCheckout = taskRecordRoot(root, id);
  git(trackingCheckout, 'add', '.');
  git(trackingCheckout, 'commit', '--quiet', '-m', 'chore(workflow): 提交受管入口');
  const committed = cli(root, 'release', id);
  const tracked = committed.data.items.find(entry => entry.id === 'managed-entry-tracking');
  assert.equal(tracked.status, 'pass', JSON.stringify(committed.data));
});

test('CASE-178 hardening regression names and version stay linked at 0.5.0', () => {
  const source = read(repository, 'test/flow-hardening.test.mjs');
  for (const id of ['CASE-174', 'CASE-175', 'CASE-176', 'CASE-177']) assert.match(source, new RegExp(id, 'u'));
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    assert.match(read(repository, relative), /VERIFY_BEFORE_DESIGN|须先设计确认再 `verify`/u, relative);
    assert.match(read(repository, relative), /clear-premature/u, relative);
    assert.match(read(repository, relative), /骨架.*runner.*生成|init` → 初始化/u, relative);
  }
});

test('CASE-179 standard design fields that are blank or placeholders get located warnings', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-thin-design';
  success(cli(root, 'start', id, '--title', 'Thin design', '--requirement', 'Warn before accepting thin design content.',
    '--criterion', 'AC-1=Thin design fields are visible', '--type', 'feature', '--size', 'standard',
    '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));
  const relative = `.tiller/task/${id}/task.md`;
  completeDesign(root, id);
  success(confirmTask(root, id, 'design'));
  put(taskRecordRoot(root, id), relative, read(root, relative)
    .replace('沿用现有命令边界实现本次行为。', '待补充')
    .replace('失败时返回明确结果并保留原记录。', 'TODO')
    .replace('不新增并行入口，保持现有接口。', '')
    .replace('影响限于本任务范围，按现有测试复核。', '<待补充>')
    .replace('运行引用本用例的具名测试。', '…'));

  const checked = failure(cli(root, 'check', id));
  const warnings = checked.warnings.join('\n');
  for (const field of ['方案', '失败处理', '取舍', '影响与风险', '验证入口']) {
    assert.match(warnings, new RegExp(`任务设计“${field}”.*仅空白或占位.*${relative.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u'));
  }
  assert.ok(!checked.issues.some(issue => issue.includes('仅空白或占位')), checked.issues.join('\n'));
});

test('CASE-180 empty decisions and touched module design are located in check warnings', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-thin-specs';
  success(cli(root, 'start', id, '--title', 'Thin specs', '--requirement', 'Warn before accepting empty specs.',
    '--criterion', 'AC-1=Empty specs are visible', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/specs'));
  success(confirmTask(root, id, 'requirements'));
  put(root, '.tiller/specs/decisions.md', '# 长期决定\n\n只记录仍然有效、会约束后续实现的取舍。\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n');
  put(root, 'src/value.txt', 'changed for module detection\n');

  const checked = failure(cli(root, 'check', id));
  const warnings = checked.warnings.join('\n');
  assert.match(warnings, /缺少有效决定条目.*\.tiller\/specs\/decisions\.md/u);
  assert.match(warnings, /模块 design\.md.*仅有标题或占位.*\.tiller\/specs\/modules\/workflow\/design\.md/u);
});

test('CASE-182 check and resume explicitly report an expired verification', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-expired-verification';
  success(cli(root, 'start', id, '--title', 'Expired verification', '--requirement', 'Keep expiry wording visible.',
    '--criterion', 'AC-1=Current tree remains verified', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  put(root, 'src/value.txt', 'changed after verification\n');
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'change after verification');

  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('验证已过期') && issue.includes('记录时的代码树')), checked.issues.join('\n'));
  const resumed = success(cli(root, 'resume', id));
  assert.match(resumed.stageReason, /验证已过期/u);
});

test('CASE-183 check explains a branch name missing the task id', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261023-branch-name';
  success(cli(root, 'start', id, '--title', 'Branch name', '--requirement', 'Keep branch names traceable.',
    '--criterion', 'AC-1=Branch naming is visible', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));
  git(taskRecordRoot(root, id), 'branch', '-m', 'feat/flow-hardening');

  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.warnings.some(warning => warning.includes('feat/flow-hardening')
    && warning.includes(`未包含当前任务编号 ${id}`) && warning.includes(`类型/${id}`)), checked.warnings.join('\n'));
});

test('CASE-260 check warns about delivery paths inside the business scope do list', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  const id = '20261026-scope-delivery-path';
  success(cli(root, 'start', id, '--title', 'Scope path warning', '--requirement', 'Keep scope constraints separate.',
    '--criterion', 'AC-1=The warning is visible', '--size', 'small', '--target', 'src', '--target', 'test'));

  const relative = `.tiller/task/${id}/task.md`;
  completeRequirement(root, id);
  const content = read(root, relative);
  const scope = `### 业务范围\n\n- 做：实现 \`src/flow.ts\` 与测试 \`test/flow-hardening.test.mjs\`。\n- 不做：修改范围外文件。\n- 假设与待确认：无。\n\n### 关键行为`;
  put(taskRecordRoot(root, id), relative, content.replace(/### 业务范围[\s\S]*?### 关键行为/u, scope));
  success(cli(root, 'confirm', id, 'requirements'));

  const checked = failure(cli(root, 'check', id));
  const warnings = checked.warnings.join('\n');
  assert.match(warnings, /业务范围·做.*src\/flow\.ts/u);
  assert.match(warnings, /业务范围·做.*test\/flow-hardening\.test\.mjs/u);
  assert.match(warnings, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.ok(!checked.issues.some(issue => issue.includes('业务范围') && issue.includes('交付路径')), checked.issues.join('\n'));
});

test('CASE-312 check does not report conventional global or workflow commit scopes as missing modules', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root, 'core');
  const id = '20261027-commit-scope';
  success(cli(root, 'start', id, '--title', '提交 scope 识别', '--requirement', '区分约定 scope 与真实缺失模块。',
    '--criterion', 'AC-1=scope 提示准确', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));
  const checkout = taskRecordRoot(root, id);
  git(checkout, 'commit', '--allow-empty', '--quiet', '-m', 'feat(specs): 同步全局规格');
  git(checkout, 'commit', '--allow-empty', '--quiet', '-m', 'feat(workflow): 编排工作流');
  git(checkout, 'commit', '--allow-empty', '--quiet', '-m', 'feat(ghost): 添加未知模块');

  const checked = failure(cli(root, 'check', id));
  const warnings = checked.warnings.join('\n');
  assert.doesNotMatch(warnings, /模块 specs 不在 specs\/modules/u);
  assert.doesNotMatch(warnings, /模块 workflow 不在 specs\/modules/u);
  assert.match(warnings, /feat\(ghost\): 添加未知模块.*模块 ghost 不在 specs\/modules/u);
});

test('CASE-276 check blocks specs changes on the default branch', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  if (git(root, 'branch', '--show-current').trim() === 'master') git(root, 'branch', '-m', 'main');
  const id = '20261026-specs-default-branch';
  success(cli(root, 'start', id, '--title', 'Default branch specs gate', '--requirement', 'Keep specs changes on task branches.',
    '--criterion', 'AC-1=Default branch changes are blocked', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/specs'));
  success(confirmTask(root, id, 'requirements'));
  const specsCheckout = taskRecordRoot(root, id);
  put(specsCheckout, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nSpecs changes use task worktrees.\n');
  // Free the default branch name on primary, then point the task checkout at it.
  const primaryBranch = git(root, 'branch', '--show-current').trim() || 'main';
  if (primaryBranch === 'main' || primaryBranch === 'master') {
    git(root, 'branch', '-m', primaryBranch, `primary-${primaryBranch}`);
  }
  git(specsCheckout, 'branch', '-M', 'main');

  const mainChecked = failure(cli(root, 'check', id));
  const mainIssue = mainChecked.issues.find(issue => issue.includes('过程卫生') && issue.includes('.tiller/specs/'));
  assert.ok(mainIssue, mainChecked.issues.join('\n'));
  assert.match(mainIssue, /默认分支 main/u);
  assert.match(mainIssue, /任务 worktree/u);
  assert.match(mainIssue, /任务 PR\/MR/u);
  assert.match(mainIssue, /请勿.*默认分支.*直改.*直推/u);

  git(taskRecordRoot(root, id), 'branch', '-M', 'master');
  const masterChecked = failure(cli(root, 'check', id));
  assert.ok(masterChecked.issues.some(issue => issue.includes('过程卫生') && issue.includes('默认分支 master')
    && issue.includes('.tiller/specs/')), masterChecked.issues.join('\n'));
});

test('CASE-277 check allows specs changes on a task branch', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  baseline(root);
  if (git(root, 'branch', '--show-current').trim() === 'master') git(root, 'branch', '-m', 'main');
  const id = '20261026-specs-task-branch';
  success(cli(root, 'start', id, '--title', 'Task branch specs gate', '--requirement', 'Allow specs changes on task branches.',
    '--criterion', 'AC-1=Task branch changes are allowed', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/specs'));
  success(confirmTask(root, id, 'requirements'));
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nSpecs changes use task worktrees.\n');
  git(root, 'checkout', '--quiet', '-b', `feat/${id}-branch-check`);

  const checked = failure(cli(root, 'check', id));
  assert.ok(!checked.issues.some(issue => issue.includes('过程卫生') && issue.includes('.tiller/specs/')
    && issue.includes('默认分支')), checked.issues.join('\n'));
});

test('CASE-184 help, usage and AGENTS explain thin checks, readable logs and branch naming', async t => {
  const root = fixture(t);
  const help = success(cli(root, '--help')).help;
  assert.match(help, /过薄.*decisions.*模块设计/u);
  assert.match(help, /日志.*起止.*退出码/u);
  assert.match(help, /分支.*未包含任务编号/u);

  const usage = read(repository, 'resources/usage.md');
  assert.equal(usage, read(repository, '.tiller/usage.md'));
  assert.match(usage, /过薄.*decisions.*模块设计/u);
  assert.match(usage, /日志.*起止.*退出码/u);
  assert.match(usage, /分支.*未包含任务编号/u);

  for (const relative of ['resources/entry.md', 'AGENTS.md']) {
    const entry = read(repository, relative);
    assert.match(entry, /过薄.*decisions.*模块设计/u, relative);
    assert.match(entry, /日志.*起止.*退出码/u, relative);
    assert.match(entry, /分支.*未包含任务编号/u, relative);
  }
});

test('CASE-185 wave-two cases are referenced by named tests at version 0.5.0', () => {
  const source = `${read(repository, 'test/flow-hardening.test.mjs')}\n${read(repository, 'test/verification-integrity.test.mjs')}`;
  for (const id of ['CASE-179', 'CASE-180', 'CASE-181', 'CASE-182', 'CASE-183', 'CASE-184', 'CASE-185']) {
    assert.match(source, new RegExp(`test\\('[^'\\n]*${id}\\b`, 'u'));
  }
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  assert.match(read(repository, 'src/cli.ts'), /CLI_VERSION = '0\.5\.0'/u);
});
