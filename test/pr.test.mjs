import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { branchDescriptionForTask, branchNameIssue, normalizeBranchSlug, suggestedBranchName, suggestedBranchNameFor } from '../dist/branch-conventions.js';
import { commitSubjectIssue } from '../dist/commit-conventions.js';
import { GITLAB_TEMPLATE, initialize } from '../dist/core.js';
import { cliPath, cli, completeDesign, confirmTask, failure, fixture, put, spawnCaptured, success } from './helpers.mjs';

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
  put(root, 'test/workflow.test.mjs', "import test from 'node:test';\n\ntest('CASE-001 workflow behavior', () => {});\n");
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# 工作流\n\n## 行为\n\n流程可验证。\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# 工作流设计\n\n使用任务记录。\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
}

function commitTaskRecords(root, id, ...paths) {
  git(root, 'add', `.tiller/task/${id}`, ...paths);
  git(root, 'commit', '--quiet', '-m', 'chore(workflow): 同步任务记录');
}

function fillDesign(root, id) {
  completeDesign(root, id);
  const relative = `.tiller/task/${id}/task.md`;
  put(root, relative, read(root, relative).replace('影响限于本任务范围，按现有测试复核。', 'PR/MR 标题和说明需要人工复核。'));
}

function commitAll(root, message = 'chore(workflow): 同步验收夹具') {
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', message);
}

function acceptTaskForPr(root, id) {
  const task = success(cli(root, 'resume', id));
  if (!task.confirmations.some(item => item.gate === 'requirements')) {
    success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  }
  if (task.size === 'standard' && !task.confirmations.some(item => item.gate === 'design')) {
    fillDesign(root, id);
    success(cli(root, 'confirm', id, 'design', '--by', 'Tiller Test'));
  }
  if (!task.verifications.length) {
    const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
      '--title', 'PR 验收夹具', '--expected', '任务可进入交付验收'));
    const testPath = 'test/pr-acceptance.test.mjs';
    const testName = `${added.id} pr acceptance fixture`;
    const testSource = existsSync(join(root, testPath))
      ? read(root, testPath)
      : "import assert from 'node:assert/strict';\nimport test from 'node:test';\n";
    put(root, testPath, `${testSource}\ntest('${testName}', () => assert.equal(1, 1));\n`);
    success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `${testPath}::${testName}`));
  }
  commitAll(root, 'test(workflow): 准备 PR 验收夹具');
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
  commitAll(root, 'chore(workflow): 记录交付验收');
}

test('CASE-070 branch names follow type and task prefix rules', () => {
  assert.equal(suggestedBranchName('feat', '20261022-round11'), 'feat/20261022-round11');
  for (const branch of ['feat/20261022-round11', 'feat/20261022-round11-pr-conventions', 'fix/bug-1']) {
    assert.equal(branchNameIssue(branch, branch.startsWith('fix/') ? 'bug-1' : '20261022-round11'), null, branch);
  }
  for (const branch of ['main', 'master', '']) assert.equal(branchNameIssue(branch, '20261022-round11'), null, branch);
  assert.equal(normalizeBranchSlug(' PR_Draft  2 '), 'pr-draft-2');
  assert.equal(suggestedBranchNameFor('feat', '20261022-round11', 'PR_Draft 2'), 'feat/20261022-round11-pr-draft-2');
  assert.equal(branchDescriptionForTask('feat/20261022-round11-pr-draft-2', '20261022-round11'), 'pr-draft-2');
  assert.match(branchNameIssue('Codex/20261022-round11', '20261022-round11') ?? '', /分支名应为/u);
  assert.match(branchNameIssue('codex/20261022-round11', '20261022-round11') ?? '', /分支名应为/u);
  assert.match(branchNameIssue('feat/other-task', '20261022-round11') ?? '', /任务编号.*不符/u);
  assert.match(branchNameIssue('feat/20261022-round11-', '20261022-round11') ?? '', /分支名应为/u);
});

test('CASE-208 branch slug already present in the task id is not appended twice', () => {
  const id = '20261024-slim-verify-render';
  assert.equal(suggestedBranchNameFor('feat', id, 'slim-verify-render'), `feat/${id}`);
  assert.equal(suggestedBranchNameFor('feat', id, 'Slim Verify Render'), `feat/${id}`);
  assert.equal(suggestedBranchNameFor('feat', 'slim-verify-render', 'slim-verify-render'), 'feat/slim-verify-render');
  assert.equal(suggestedBranchNameFor('feat', id, 'extra-detail'), `feat/${id}-extra-detail`);
  assert.equal(branchDescriptionForTask(`feat/${id}`, id), null);
  assert.equal(branchNameIssue(`feat/${id}`, id), null);
});

test('CASE-073 commit subjects enforce type, module, Chinese summary and no task links', () => {
  assert.equal(commitSubjectIssue('feat(workflow): 添加 PR 草稿', ['workflow']), null);
  assert.equal(commitSubjectIssue('chore: 更新受管资源'), null);
  assert.match(commitSubjectIssue('feature(workflow): 添加草稿', ['workflow']) ?? '', /类型/u);
  assert.match(commitSubjectIssue('feat(unknown): 添加草稿', ['workflow']) ?? '', /不在 specs\/modules/u);
  assert.match(commitSubjectIssue('feat(workflow): add draft', ['workflow']) ?? '', /中文/u);
  assert.match(commitSubjectIssue('feat(workflow): 添加草稿 #123', ['workflow']) ?? '', /任务链接/u);
  assert.match(commitSubjectIssue('feat(workflow): 添加草稿 [任务](https://example.invalid)', ['workflow']) ?? '', /任务链接/u);
});

test('CASE-068 pr draft derives title, five sections and current AC state', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-pr-draft';
  success(cli(root, 'start', id, '--title', '确认去原话化与结构化任务正文',
    '--requirement', '生成可人工修订的 PR 草稿。', '--criterion', 'AC-1=PR 草稿包含固定五段',
    '--size', 'standard', '--target', 'src', '--target', 'test', '--target', '.tiller/cases',
    '--target', '.tiller/specs/modules/workflow'));
  fillDesign(root, id);
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'confirm', id, 'design', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'PR 草稿结构', '--expected', 'PR 草稿包含固定五段'));
  assert.equal(added.id, 'CASE-001');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'feat(workflow): 生成固定五段 PR 草稿');
  git(root, 'checkout', '--quiet', '-b', `feat/${id}-pr-draft`);
  acceptTaskForPr(root, id);

  const draft = success(cli(root, 'pr', id));
  assert.equal(draft.title, `feat(workflow): 生成固定五段 PR 草稿 [${id}]`);
  assert.equal(draft.module, 'workflow');
  assert.equal(draft.branch, `feat/${id}`);
  assert.match(draft.body, /^## 关联任务$/mu);
  for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) {
    assert.equal(draft.body.split(`## ${heading}`).length - 1, 1, heading);
  }
  assert.doesNotMatch(draft.body, /范围外|不在范围/u);
  assert.match(draft.body, /任务 20261022-pr-draft，记录见 `\.tiller\/task\/20261022-pr-draft\/task\.md`/u);
  assert.doesNotMatch(draft.body, /\]\(\.tiller\/task\//u);
  assert.match(draft.body, /- feat\(workflow\): 生成固定五段 PR 草稿/u);
  assert.match(draft.body, /- \[x\] AC-1: PR 草稿包含固定五段/u);
  assert.match(draft.body, /当前有效/u);
  assert.match(draft.body, /PR\/MR 标题和说明需要人工复核/u);

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

test('CASE-069 check warns about nonconforming commit subjects and skips merge subjects', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-commit-warning';
  success(cli(root, 'start', id, '--title', '提交信息检查', '--requirement', '提示不合规提交主题。',
    '--criterion', 'AC-1=提交主题违规只产生提示', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases',
    '--target', '.tiller/specs/modules/workflow'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', '提交信息检查', '--expected', '不合规提交只产生提示'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
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

test('CASE-075 pr title selects first declared module and omits unknown modules', async t => {
  const root = fixture(t);
  await initialize({ root });
  for (const module of ['initialization', 'workflow']) {
    put(root, `.tiller/specs/modules/${module}/requirements.md`, `# ${module}\n`);
    put(root, `.tiller/specs/modules/${module}/design.md`, `# ${module}\n`);
  }
  put(root, 'src/workflow.ts', 'export const value = 1;\n');
  put(root, 'test/workflow.test.mjs', "import test from 'node:test';\n\ntest('CASE-001 workflow behavior', () => {});\n");
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', 'baseline workflow');
  const id = '20261022-module-title';
  success(cli(root, 'start', id, '--title', '模块标题', '--requirement', '从范围选择首个主模块。',
    '--criterion', 'AC-1=标题包含首个模块', '--size', 'small',
    '--target', '.tiller/specs/modules/initialization', '--target', '.tiller/specs/modules/workflow',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  acceptTaskForPr(root, id);
  const draft = success(cli(root, 'pr', id));
  assert.equal(draft.module, 'initialization');
  assert.equal(draft.title, `feat(initialization): 模块标题 [${id}]`);
  assert.match(draft.warnings.join('\n'), /多个模块.*首个主模块 initialization/u);

  const unknown = fixture(t);
  await initialize({ root: unknown });
  setupRepository(unknown);
  const unknownId = '20261022-unknown-module';
  success(cli(unknown, 'start', unknownId, '--title', '未知模块标题', '--requirement', '没有可推导模块。',
    '--criterion', 'AC-1=标题省略模块', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  acceptTaskForPr(unknown, unknownId);
  const fallback = success(cli(unknown, 'pr', unknownId));
  assert.equal(fallback.module, null);
  assert.equal(fallback.title, `feat: 未知模块标题 [${unknownId}]`);
});

test('CASE-076 branch slug precedence uses flag then task metadata then current branch', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const metadataTask = '20261022-slug-meta';
  const started = success(cli(root, 'start', metadataTask, '--title', '元数据分支描述', '--requirement', '记录英文标识。',
    '--criterion', 'AC-1=分支包含元数据描述', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases', '--slug', 'Structured Task'));
  assert.equal(started.slug, 'structured-task');
  acceptTaskForPr(root, metadataTask);
  assert.equal(success(cli(root, 'pr', metadataTask)).branch, `feat/${metadataTask}-structured-task`);
  assert.equal(success(cli(root, 'pr', metadataTask, '--slug', 'PR_Draft 2')).branch, `feat/${metadataTask}-pr-draft-2`);

  const branchTask = '20261022-slug-branch';
  success(cli(root, 'start', branchTask, '--title', '当前分支描述', '--requirement', '从当前分支读取描述。',
    '--criterion', 'AC-1=分支包含当前分支描述', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  git(root, 'checkout', '--quiet', '-b', `fix/${branchTask}-from-current`);
  acceptTaskForPr(root, branchTask);
  assert.equal(success(cli(root, 'pr', branchTask)).branch, `feat/${branchTask}-from-current`);
});

test('CASE-077 pr verification section lists every recorded run in order', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-all-verifications';
  success(cli(root, 'start', id, '--title', '全部验证记录', '--requirement', '输出每条 AC 的全部验证。',
    '--criterion', 'AC-1=保留每次验证', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', '全部验证记录', '--expected', '保留每次验证记录'));
  const firstRun = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  const secondRun = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  const first = firstRun.entries[0].command;
  const second = secondRun.entries[0].command;

  acceptTaskForPr(root, id);
  const draft = success(cli(root, 'pr', id));
  assert.ok(draft.body.indexOf(`命令：\`${first}\``) >= 0, draft.body);
  assert.ok(draft.body.indexOf(`命令：\`${second}\``) > draft.body.indexOf(`命令：\`${first}\``), draft.body);
  assert.match(draft.body, new RegExp(`${added.id}`, 'u'));
  assert.ok(draft.body.includes(`  - 测试：\`test/workflow.test.mjs::CASE-001 workflow behavior\`；命令：\`${first}\`；结果：passed；提交：\`${firstRun.entries[0].commit}\`；用例：${added.id}`), draft.body);
  assert.ok(draft.body.includes(`  - 测试：\`test/workflow.test.mjs::CASE-001 workflow behavior\`；命令：\`${second}\`；结果：passed；提交：\`${secondRun.entries[0].commit}\`；用例：${added.id}`), draft.body);
  assert.doesNotMatch(draft.body, /^\s*- \d+\./mu);
});

test('CASE-081 pr summary prefers flag then metadata then earliest conventional commit then task title', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);

  const metadataId = '20261022-summary-metadata';
  const started = success(cli(root, 'start', metadataId, '--title', '英文标题 fallback',
    '--summary', '元数据中文摘要', '--requirement', '标题摘要优先取任务元数据。',
    '--criterion', 'AC-1=使用元数据摘要', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  assert.equal(started.summary, '元数据中文摘要');
  acceptTaskForPr(root, metadataId);
  assert.equal(success(cli(root, 'pr', metadataId)).title, `feat(workflow): 元数据中文摘要 [${metadataId}]`);
  assert.equal(success(cli(root, 'pr', metadataId, '--summary', '命令行中文摘要')).title,
    `feat(workflow): 命令行中文摘要 [${metadataId}]`);

  const commitId = '20261022-summary-commit';
  success(cli(root, 'start', commitId, '--title', '提交摘要回退标题', '--requirement', '从提交历史取最早摘要。',
    '--criterion', 'AC-1=使用最早提交摘要', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  put(root, 'src/workflow.ts', 'export const value = 2;\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'chore: 准备提交');
  put(root, 'src/workflow.ts', 'export const value = 3;\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'feat(workflow): 最早中文摘要');
  put(root, 'src/workflow.ts', 'export const value = 4;\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fix(workflow): 后续中文摘要');
  acceptTaskForPr(root, commitId);
  assert.equal(success(cli(root, 'pr', commitId)).title, `feat(workflow): 最早中文摘要 [${commitId}]`);

  const fallbackRoot = fixture(t);
  success(cli(fallbackRoot, 'init'));
  setupRepository(fallbackRoot);
  const fallbackId = '20261022-summary-fallback';
  success(cli(fallbackRoot, 'start', fallbackId, '--title', '任务标题回退', '--requirement', '没有提交摘要时使用任务标题。',
    '--criterion', 'AC-1=使用任务标题', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  acceptTaskForPr(fallbackRoot, fallbackId);
  assert.equal(success(cli(fallbackRoot, 'pr', fallbackId)).title, `feat: 任务标题回退 [${fallbackId}]`);
});

test('CASE-082 pr change list orders commits from oldest to newest', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-commit-order';
  success(cli(root, 'start', id, '--title', '提交顺序', '--requirement', '变更内容按时间正序。',
    '--criterion', 'AC-1=较早提交在前', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  put(root, 'src/workflow.ts', 'export const value = 2;\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'feat(workflow): 较早提交');
  put(root, 'src/workflow.ts', 'export const value = 3;\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fix(workflow): 较晚提交');
  acceptTaskForPr(root, id);

  const draft = success(cli(root, 'pr', id));
  const changeSection = draft.body.split('## 变更内容\n\n')[1].split('\n\n## 验收条件')[0];
  assert.ok(changeSection.indexOf('- feat(workflow): 较早提交') < changeSection.indexOf('- fix(workflow): 较晚提交'), changeSection);
  const subjects = draft.commits.map(commit => commit.subject);
  assert.ok(subjects.indexOf('feat(workflow): 较早提交') < subjects.indexOf('fix(workflow): 较晚提交'), subjects.join('\n'));
});

test('CASE-083 pr verification section uses plain nested records without numbered bullets', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-verification-format';
  success(cli(root, 'start', id, '--title', '验证格式', '--requirement', '验证记录使用普通嵌套列表。',
    '--criterion', 'AC-1=每条记录单独一行', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', '验证格式', '--expected', '验证记录使用普通嵌套列表'));
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  const command = verified.entries[0].command;

  acceptTaskForPr(root, id);
  const draft = success(cli(root, 'pr', id));
  assert.match(draft.body, /^- AC-1：每条记录单独一行（当前有效）$/mu);
  assert.ok(draft.body.includes(`  - 测试：\`test/workflow.test.mjs::CASE-001 workflow behavior\`；命令：\`${command}\`；结果：passed；提交：\`${verified.entries[0].commit}\`；用例：${added.id}`), draft.body);
  assert.doesNotMatch(draft.body, /^\s*- \d+\./mu);
});

test('CASE-071 init installs a managed pull request template and preserves an existing one', async t => {
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

test('CASE-078 init platform selects github gitlab or both managed templates', async t => {
  const github = fixture(t);
  success(cli(github, 'init'));
  assert.ok(existsSync(join(github, '.github/pull_request_template.md')));
  assert.ok(!existsSync(join(github, GITLAB_TEMPLATE)));

  const gitlab = fixture(t);
  success(cli(gitlab, 'init', '--platform', 'gitlab'));
  const gitlabMetadata = JSON.parse(read(gitlab, '.tiller/project.json'));
  assert.equal(gitlabMetadata.platform, 'gitlab');
  assert.ok(existsSync(join(gitlab, GITLAB_TEMPLATE)));
  assert.ok(!existsSync(join(gitlab, '.github/pull_request_template.md')));
  assert.ok(Object.hasOwn(gitlabMetadata.managedFiles, GITLAB_TEMPLATE));
  assert.equal(read(gitlab, GITLAB_TEMPLATE), readFileSync(new URL('../resources/merge_request_template.md', import.meta.url), 'utf8'));

  const both = fixture(t);
  success(cli(both, 'init', '--platform', 'both'));
  const bothMetadata = JSON.parse(read(both, '.tiller/project.json'));
  assert.equal(bothMetadata.platform, 'both');
  assert.equal(read(both, '.github/pull_request_template.md'), read(both, GITLAB_TEMPLATE));
  assert.ok(Object.hasOwn(bothMetadata.managedFiles, '.github/pull_request_template.md'));
  assert.ok(Object.hasOwn(bothMetadata.managedFiles, GITLAB_TEMPLATE));

  const custom = fixture(t);
  put(custom, GITLAB_TEMPLATE, '# 团队 MR 模板\n');
  await initialize({ root: custom, platform: 'gitlab' });
  assert.equal(read(custom, GITLAB_TEMPLATE), '# 团队 MR 模板\n');
  assert.ok(Object.hasOwn(JSON.parse(read(custom, '.tiller/project.json')).managedFiles, GITLAB_TEMPLATE));
});

test('CASE-072 upgrade adds the pull request template to a previous managed set', async t => {
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
  assert.ok(!existsSync(join(root, GITLAB_TEMPLATE)));
  assert.ok(Object.hasOwn(JSON.parse(read(root, '.tiller/project.json')).managedFiles, '.github/pull_request_template.md'));
});

test('CASE-079 upgrade adds only templates for the configured platform', async t => {
  const root = fixture(t);
  await initialize({ root, platform: 'gitlab' });
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  delete metadata.managedFiles[GITLAB_TEMPLATE];
  put(root, '.tiller/project.json', `${JSON.stringify(metadata, null, 2)}\n`);
  rmSync(join(root, GITLAB_TEMPLATE));

  const preview = success(cli(root, 'upgrade', '--plan'));
  assert.ok(preview.changes.some(change => change.path === GITLAB_TEMPLATE));
  assert.ok(!preview.changes.some(change => change.path === '.github/pull_request_template.md'));
  success(cli(root, 'upgrade', '--apply', preview.planId));
  assert.ok(existsSync(join(root, GITLAB_TEMPLATE)));
  assert.ok(!existsSync(join(root, '.github/pull_request_template.md')));
});

test('CASE-080 pr task section is plain text and PR MR neutral', async t => {
  const root = fixture(t);
  await initialize({ root });
  setupRepository(root);
  const id = '20261022-neutral-output';
  success(cli(root, 'start', id, '--title', '中性文案', '--requirement', '关联任务使用纯文本。',
    '--criterion', 'AC-1=输出纯文本记录路径', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  acceptTaskForPr(root, id);
  const draft = success(cli(root, 'pr', id));
  assert.match(draft.body, new RegExp(`^## 关联任务\\n\\n任务 ${id}，记录见 \`\\.tiller/task/${id}/task\\.md\`$`, 'mu'));
  assert.doesNotMatch(draft.body, /\[[^\]]+\]\(\.tiller\/task\//u);
  const help = success(cli(root, '--help')).help;
  assert.match(help, /五段 PR\/MR 草稿/u);
  const githubTemplate = readFileSync(new URL('../resources/pull_request_template.md', import.meta.url), 'utf8');
  const gitlabTemplate = readFileSync(new URL('../resources/merge_request_template.md', import.meta.url), 'utf8');
  assert.equal(gitlabTemplate, githubTemplate);
  assert.match(githubTemplate, /任务 <id>，记录见 `\.tiller\/task\/<id>\/task\.md`/u);
});

test('CASE-216 pr blocks uncommitted task records and lists relative paths', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261026-pr-records-dirty';
  success(cli(root, 'start', id, '--title', 'PR 前同步记录', '--requirement', '任务记录必须已提交。',
    '--criterion', 'AC-1=未提交记录阻断 PR 草稿', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases', '--target', '.tiller/specs'));
  acceptTaskForPr(root, id);

  const taskPath = `.tiller/task/${id}/task.md`;
  put(root, taskPath, `${read(root, taskPath)}\n<!-- 临时任务记录改动 -->\n`);
  const taskDirty = failure(cli(root, 'pr', id));
  assert.equal(taskDirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.ok(taskDirty.error.message.includes(taskPath), taskDirty.error.message);

  git(root, 'add', taskPath);
  git(root, 'commit', '--quiet', '-m', 'chore(workflow): 记录任务');

  const casePath = '.tiller/cases/modules/workflow/behavior.md';
  put(root, casePath, '# workflow behavior\n\n## CASE-900 临时用例\n');
  const caseDirty = failure(cli(root, 'pr', id));
  assert.equal(caseDirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.ok(caseDirty.error.message.includes(casePath), caseDirty.error.message);

  git(root, 'add', casePath);
  git(root, 'commit', '--quiet', '-m', 'test(workflow): 记录用例');

  const specPath = '.tiller/specs/modules/workflow/requirements.md';
  put(root, specPath, `${read(root, specPath)}\n临时规格改动。\n`);
  const specDirty = failure(cli(root, 'pr', id));
  assert.equal(specDirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.ok(specDirty.error.message.includes(specPath), specDirty.error.message);
  assert.equal(Object.hasOwn(specDirty, 'body'), false);
});

test('CASE-217 pr generates the five-section draft after task records are committed', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261026-pr-records-clean';
  success(cli(root, 'start', id, '--title', '已提交记录', '--requirement', '干净记录生成草稿。',
    '--criterion', 'AC-1=干净记录生成五段草稿', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases', '--target', '.tiller/specs'));
  acceptTaskForPr(root, id);
  const specPath = '.tiller/specs/modules/workflow/requirements.md';
  put(root, specPath, `${read(root, specPath)}\n## 记录同步\n\nPR 前记录已提交。\n`);
  git(root, 'add', `.tiller/task/${id}`, specPath);
  git(root, 'commit', '--quiet', '-m', 'feat(workflow): 记录 PR 前同步');

  const draft = success(cli(root, 'pr', id));
  assert.ok(draft.title.endsWith(`[${id}]`));
  for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) {
    assert.equal(draft.body.split(`## ${heading}`).length - 1, 1, heading);
  }
  assert.ok(!draft.warnings.some(item => item.includes('未提交改动')), draft.warnings.join('\n'));
});

test('CASE-218 another dirty task does not block this task pr', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261026-pr-records-current';
  success(cli(root, 'start', id, '--title', '当前任务', '--requirement', '其他任务不误伤。',
    '--criterion', 'AC-1=其他任务记录不阻断', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  acceptTaskForPr(root, id);
  put(root, '.tiller/task/20261026-pr-records-other/task.md', '# 其他任务\n\n未提交记录。\n');

  const draft = success(cli(root, 'pr', id));
  assert.ok(draft.body.includes(`.tiller/task/${id}/task.md`));
  assert.doesNotMatch(draft.body, /20261026-pr-records-other/u);
});

test('CASE-219 pr skips the record gate with a warning when Git is unavailable', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261026-pr-records-no-git';
  success(cli(root, 'start', id, '--title', '无 Git', '--requirement', '无 Git 时降级提示。',
    '--criterion', 'AC-1=无 Git 时跳过门禁', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  acceptTaskForPr(root, id);
  rmSync(join(root, '.git'), { recursive: true, force: true });

  const draft = success(cli(root, 'pr', id));
  assert.ok(draft.warnings.some(item => /无法读取.*未提交改动.*跳过/u.test(item)), draft.warnings.join('\n'));
  assert.match(draft.body, /^## 关联任务$/mu);
});

test('CASE-220 delivery docs require committing task records before pr', () => {
  const usage = readFileSync(new URL('../resources/usage.md', import.meta.url), 'utf8');
  const delivery = readFileSync(new URL('../resources/rules/activities/delivery.md', import.meta.url), 'utf8');
  const decisions = readFileSync(new URL('../.tiller/specs/decisions.md', import.meta.url), 'utf8');
  const requirements = readFileSync(new URL('../.tiller/specs/modules/workflow/requirements.md', import.meta.url), 'utf8');
  const design = readFileSync(new URL('../.tiller/specs/modules/workflow/design.md', import.meta.url), 'utf8');
  for (const text of [usage, delivery, decisions]) assert.match(text, /提交任务记录/u);
  assert.match(usage, /PR_TASK_RECORDS_DIRTY/u);
  assert.match(usage, /accept.*提交任务记录.*pr/su);
  assert.match(usage, /收尾不改 `task\.md`/u);
  assert.doesNotMatch(usage, /合入后\s*`accept`\/`close`[^。\n]*另作收尾提交/u);
  assert.match(delivery, /其他任务.*不阻断/su);
  assert.match(decisions, /不自动提交/u);
  assert.match(requirements, /FLOW-35/u);
  assert.match(design, /PR_TASK_RECORDS_DIRTY/u);
  assert.equal(readFileSync(new URL('../.tiller/usage.md', import.meta.url), 'utf8'), usage);
  assert.equal(readFileSync(new URL('../.tiller/rules/activities/delivery.md', import.meta.url), 'utf8'), delivery);
});

test('CASE-221 closed task accept/close records are committed on this branch', () => {
  const closed = readFileSync(new URL('../.tiller/task/20261026-local-task-layout/task.md', import.meta.url), 'utf8');
  assert.match(closed, /^## 确认$/mu);
  assert.match(closed, /交付验收/u);
  assert.match(closed, /^## 关闭$/mu);
  assert.match(closed, /tiller-confirm:v1.*"gate":"acceptance"/su);
});

test('CASE-222 package stays 0.5.0 and pr dirty-record coverage exists', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const smoke = readFileSync(new URL('../scripts/package-smoke.mjs', import.meta.url), 'utf8');
  const prSrc = readFileSync(new URL('../src/pr.ts', import.meta.url), 'utf8');
  assert.equal(pkg.version, '0.5.0');
  assert.match(readme, /0\.5\.0/u);
  assert.match(smoke, /0\.5\.0/u);
  assert.match(prSrc, /PR_TASK_RECORDS_DIRTY/u);
});

test('CASE-223 pr blocks a task without a valid delivery acceptance', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261026-pr-not-accepted';
  success(cli(root, 'start', id, '--title', 'PR 前验收', '--requirement', '开 PR 前必须先完成验收。',
    '--criterion', 'AC-1=未验收不能生成 PR 草稿', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'PR 前验收', '--expected', '未验收时阻断 PR'));
  const testPath = 'test/pr-not-accepted.test.mjs';
  const testName = `${added.id} unaccepted pr fixture`;
  put(root, testPath, `import assert from 'node:assert/strict';\nimport test from 'node:test';\n\ntest('${testName}', () => assert.equal(1, 1));\n`);
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `${testPath}::${testName}`));
  commitAll(root, 'test(workflow): 准备未验收 PR 夹具');

  const blocked = failure(cli(root, 'pr', id));
  assert.equal(blocked.error.code, 'PR_NOT_ACCEPTED');
  assert.match(blocked.error.message, new RegExp(`accept ${id}`, 'u'));
  assert.match(blocked.error.message, /提交任务记录/u);
});

test('CASE-225 delivery docs freeze shared task records after merge', () => {
  const usage = readFileSync(new URL('../resources/usage.md', import.meta.url), 'utf8');
  const delivery = readFileSync(new URL('../resources/rules/activities/delivery.md', import.meta.url), 'utf8');
  const decisions = readFileSync(new URL('../.tiller/specs/decisions.md', import.meta.url), 'utf8');
  const requirements = readFileSync(new URL('../.tiller/specs/modules/workflow/requirements.md', import.meta.url), 'utf8');
  const design = readFileSync(new URL('../.tiller/specs/modules/workflow/design.md', import.meta.url), 'utf8');
  for (const text of [usage, delivery, decisions]) {
    assert.match(text, /合入即交付完成|合入后.*交付完成/u);
    assert.match(text, /accept.*pr 前|pr 前.*accept/su);
    assert.match(text, /close.*只.*local|close.*不改.*task\.md/su);
    assert.doesNotMatch(text, /合入后\s*`accept`\/`close`[^。\n]*另作收尾提交/u);
  }
  assert.match(requirements, /PR_NOT_ACCEPTED|先验收/u);
  assert.match(design, /PR_NOT_ACCEPTED/u);
  assert.equal(readFileSync(new URL('../.tiller/usage.md', import.meta.url), 'utf8'), usage);
  assert.equal(readFileSync(new URL('../.tiller/rules/activities/delivery.md', import.meta.url), 'utf8'), delivery);
});

test('CASE-226 pr-task-sync record converges to the merged content without post-merge sections', () => {
  const relative = '.tiller/task/20261026-pr-task-sync/task.md';
  const content = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  assert.doesNotMatch(content, /^## 关闭$/mu);
  assert.doesNotMatch(content, /"gate":"acceptance"/u);
  const diff = spawnSync('git', ['diff', '--name-only', '--', relative], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(diff.status, 0, diff.stderr);
  assert.equal(diff.stdout.trim(), '');
});

test('CASE-227 version stays 0.5.0 and freeze behavior remains covered', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const smoke = readFileSync(new URL('../scripts/package-smoke.mjs', import.meta.url), 'utf8');
  const tests = readFileSync(new URL('./pr.test.mjs', import.meta.url), 'utf8');
  assert.equal(pkg.version, '0.5.0');
  assert.match(readme, /0\.5\.0/u);
  assert.match(smoke, /0\.5\.0/u);
  assert.match(tests, /CASE-223/u);
  assert.match(tests, /CASE-225/u);
  assert.match(tests, /CASE-226/u);
});
