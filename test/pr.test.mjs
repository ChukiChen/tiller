import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { branchNameIssue, suggestedBranchName } from '../dist/branch-conventions.js';
import { commitSubjectIssue } from '../dist/commit-conventions.js';
import { initialize } from '../dist/core.js';
import { cliPath, cli, failure, fixture, put, spawnCaptured, success } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function setupRepository(root) {
  put(root, 'src/workflow.ts', 'export const value = 1;\n');
  put(root, 'test/workflow.test.mjs', "import test from 'node:test';\n\ntest('workflow behavior', () => {});\n");
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# 工作流\n\n## 行为\n\n流程可验证。\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# 工作流设计\n\n使用任务记录。\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
}

function fillDesign(root, id) {
  const relative = `.tiller/task/${id}/task.md`;
  const content = read(root, relative);
  put(root, relative, content.replace('### 方案\n\n### 取舍\n\n### 影响与风险',
    '### 方案\n\n从 task.md 与 Git 生成 PR 草稿。\n\n### 取舍\n\n不调用 GitHub。\n\n### 影响与风险\n\nPR 标题和说明需要人工复核。'));
}

test('branch names follow type and task prefix rules', () => {
  assert.equal(suggestedBranchName('feat', '20261022-round11'), 'feat/20261022-round11');
  for (const branch of ['feat/20261022-round11', 'feat/20261022-round11-pr-conventions', 'fix/bug-1']) {
    assert.equal(branchNameIssue(branch, branch.startsWith('fix/') ? 'bug-1' : '20261022-round11'), null, branch);
  }
  for (const branch of ['main', 'master', '']) assert.equal(branchNameIssue(branch, '20261022-round11'), null, branch);
  assert.match(branchNameIssue('Codex/20261022-round11', '20261022-round11') ?? '', /分支名应为/u);
  assert.match(branchNameIssue('codex/20261022-round11', '20261022-round11') ?? '', /分支名应为/u);
  assert.match(branchNameIssue('feat/other-task', '20261022-round11') ?? '', /任务编号.*不符/u);
  assert.match(branchNameIssue('feat/20261022-round11-', '20261022-round11') ?? '', /分支名应为/u);
});

test('commit subjects enforce type, module, Chinese summary and no task links', () => {
  assert.equal(commitSubjectIssue('feat(workflow): 添加 PR 草稿', ['workflow']), null);
  assert.equal(commitSubjectIssue('chore: 更新受管资源'), null);
  assert.match(commitSubjectIssue('feature(workflow): 添加草稿', ['workflow']) ?? '', /类型/u);
  assert.match(commitSubjectIssue('feat(unknown): 添加草稿', ['workflow']) ?? '', /不在 specs\/modules/u);
  assert.match(commitSubjectIssue('feat(workflow): add draft', ['workflow']) ?? '', /中文/u);
  assert.match(commitSubjectIssue('feat(workflow): 添加草稿 #123', ['workflow']) ?? '', /任务链接/u);
  assert.match(commitSubjectIssue('feat(workflow): 添加草稿 [任务](https://example.invalid)', ['workflow']) ?? '', /任务链接/u);
});

test('pr draft derives title, five sections and current AC state', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-pr-draft';
  success(cli(root, 'start', id, '--title', '确认去原话化与结构化任务正文',
    '--requirement', '生成可人工修订的 PR 草稿。', '--criterion', 'AC-1=PR 草稿包含固定五段',
    '--size', 'standard', '--target', 'src', '--target', 'test', '--target', '.tiller/cases',
    '--target', '.tiller/specs/modules/workflow'));
  fillDesign(root, id);
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'confirm', id, 'design', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'PR 草稿结构', '--test', 'test/workflow.test.mjs::workflow behavior', '--criterion', 'AC-1',
    '--source', 'src/workflow.ts'));
  assert.equal(added.id, 'CASE-001');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::workflow behavior',
    '--command', 'node --test test/workflow.test.mjs', '--run', 'node --test test/workflow.test.mjs'));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'feat(workflow): 生成固定五段 PR 草稿');
  git(root, 'checkout', '--quiet', '-b', `feat/${id}-pr-draft`);

  const draft = success(cli(root, 'pr', id));
  assert.equal(draft.title, `feat(workflow): 确认去原话化与结构化任务正文 [${id}]`);
  assert.equal(draft.module, 'workflow');
  assert.equal(draft.branch, `feat/${id}`);
  assert.match(draft.body, /^## 关联任务$/mu);
  for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) {
    assert.equal(draft.body.split(`## ${heading}`).length - 1, 1, heading);
  }
  assert.doesNotMatch(draft.body, /范围外|不在范围/u);
  assert.match(draft.body, /\[20261022-pr-draft\]\(\.tiller\/task\/20261022-pr-draft\/task\.md\)/u);
  assert.match(draft.body, /- feat\(workflow\): 生成固定五段 PR 草稿/u);
  assert.match(draft.body, /- \[x\] AC-1: PR 草稿包含固定五段/u);
  assert.match(draft.body, /当前有效/u);
  assert.match(draft.body, /PR 标题和说明需要人工复核/u);

  const plain = spawnCaptured(process.execPath, [cliPath, 'pr', id], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(plain.stdout.startsWith(`${draft.title}\n\n建议分支：\`${draft.branch}\`\n\n## 关联任务`), plain.stdout);

  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.ok(!checked.warnings.some(item => item.includes('分支')), checked.warnings.join('\n'));
  git(root, 'checkout', '--quiet', '-b', 'fix/other-task');
  const mismatched = success(cli(root, 'check', id));
  assert.match(mismatched.warnings.join('\n'), /任务编号与当前任务 .* 不符/u);
  git(root, 'checkout', '--quiet', '-b', `codex/${id}`);
  const malformed = success(cli(root, 'check', id));
  assert.match(malformed.warnings.join('\n'), /分支名应为“类型\/任务编号\[-简短描述\]”/u);
});

test('check warns about nonconforming commit subjects and skips merge subjects', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-commit-warning';
  success(cli(root, 'start', id, '--title', '提交信息检查', '--requirement', '提示不合规提交主题。',
    '--criterion', 'AC-1=提交主题违规只产生提示', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases',
    '--target', '.tiller/specs/modules/workflow'));
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', '提交信息检查',
    '--test', 'test/workflow.test.mjs::workflow behavior', '--criterion', 'AC-1', '--source', 'src/workflow.ts'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::workflow behavior',
    '--command', 'node --test test/workflow.test.mjs', '--run', 'node --test test/workflow.test.mjs'));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'update stuff');
  const branch = git(root, 'branch', '--show-current').trim();
  git(root, 'checkout', '--quiet', '-b', 'side');
  git(root, 'commit', '--allow-empty', '--quiet', '-m', 'feat(workflow): 合并前有效提交');
  git(root, 'checkout', '--quiet', branch);
  git(root, 'merge', '--no-ff', '--quiet', '-m', 'merge side without convention', 'side');

  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  const formatWarnings = checked.warnings.filter(item => item.includes('不符合提交信息规范'));
  assert.equal(formatWarnings.length, 1, formatWarnings.join('\n'));
  assert.match(formatWarnings[0], /update stuff/u);
  assert.doesNotMatch(formatWarnings[0], /merge side without convention/u);
});

test('init installs a managed pull request template and preserves an existing one', async t => {
  const root = fixture(t);
  await initialize({ root });
  const template = read(root, '.github/pull_request_template.md');
  assert.match(template, /^## 关联任务$/mu);
  for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) assert.match(template, new RegExp(`^## ${heading}$`, 'mu'));
  assert.match(template, /\.tiller\/task\/<id>\/task\.md/u);
  assert.ok(Object.hasOwn(JSON.parse(read(root, '.tiller/project.json')).managedFiles, '.github/pull_request_template.md'));

  const custom = fixture(t);
  put(custom, '.github/pull_request_template.md', '# 团队模板\n\n保留原文。\n');
  await initialize({ root: custom });
  assert.equal(read(custom, '.github/pull_request_template.md'), '# 团队模板\n\n保留原文。\n');
  assert.ok(existsSync(join(custom, '.tiller/project.json')));
  assert.ok(Object.hasOwn(JSON.parse(read(custom, '.tiller/project.json')).managedFiles, '.github/pull_request_template.md'));
  assert.equal((await initialize({ root: custom })).changed, false);
  const plan = failure(cli(custom, 'upgrade', '--plan'));
  assert.match(plan.issues.join('\n'), /用户已有 \.github\/pull_request_template\.md 与分发模板不同/u);
});

test('upgrade adds the pull request template to a previous managed set', async t => {
  const root = fixture(t);
  await initialize({ root });
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  delete metadata.managedFiles['.github/pull_request_template.md'];
  put(root, '.tiller/project.json', `${JSON.stringify(metadata, null, 2)}\n`);
  rmSync(join(root, '.github/pull_request_template.md'));

  const preview = success(cli(root, 'upgrade', '--plan'));
  assert.ok(preview.changes.some(change => change.path === '.github/pull_request_template.md'));
  success(cli(root, 'upgrade', '--apply', preview.planId));
  assert.ok(existsSync(join(root, '.github/pull_request_template.md')));
  assert.ok(Object.hasOwn(JSON.parse(read(root, '.tiller/project.json')).managedFiles, '.github/pull_request_template.md'));
});
