import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { branchDescriptionForTask, branchNameIssue, normalizeBranchSlug, suggestedBranchName, suggestedBranchNameFor } from '../dist/branch-conventions.js';
import { prOutputFormat } from '../dist/cli.js';
import { commitSubjectIssue } from '../dist/commit-conventions.js';
import { GITLAB_TEMPLATE, initialize as initializeCore } from '../dist/core.js';
import {  cliPath, cli, completeDesign, confirmTask, failure, fixture, initializeSettled, put, settleInitBaseline, spawnCaptured, success, taskRecordRoot, read } from './helpers.mjs';
import { startPlatformMock } from './platform-api-mock.mjs';

const emptyTokens = { GITHUB_TOKEN: '', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' };

async function initialize(options) {
  return initializeSettled(options);
}

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function taskCheckout(root, id) {
  return taskRecordRoot(root, id);
}

function setupRepository(root) {
  put(root, 'src/workflow.ts', 'export const value = 1;\n');
  put(root, 'test/workflow.test.mjs', "import test from 'node:test';\n\ntest('CASE-001 workflow behavior', () => {});\n");
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# 工作流\n\n## 行为\n\n流程可验证。\n\n## 验收条件\n\n- AC-1: 流程行为可观察。\n');
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
  const checkout = taskRecordRoot(root, id);
  completeDesign(checkout, id);
  const relative = `.tiller/task/${id}/task.md`;
  put(checkout, relative, read(checkout, relative).replace('影响限于本任务范围，按现有测试复核。', 'PR/MR 标题和说明需要人工复核。'));
}

function commitAll(root, message = 'chore(workflow): 同步验收夹具') {
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', message);
}

function moveTaskRecordTo(source, target, id) {
  mkdirSync(join(target, '.tiller/task'), { recursive: true });
  rmSync(join(target, `.tiller/task/${id}`), { recursive: true, force: true });
  renameSync(join(source, `.tiller/task/${id}`), join(target, `.tiller/task/${id}`));
}

function acceptTaskForPr(root, id) {
  const checkout = taskRecordRoot(root, id);
  const task = success(cli(checkout, 'resume', id));
  if (!task.confirmations.some(item => item.gate === 'requirements')) {
    success(confirmTask(checkout, id, 'requirements', '--by', 'Tiller Test'));
  }
  if (task.size === 'standard' && !task.confirmations.some(item => item.gate === 'design')) {
    fillDesign(checkout, id);
    success(cli(checkout, 'confirm', id, 'design', '--by', 'Tiller Test'));
  }
  if (!task.verifications.length) {
    const added = success(cli(checkout, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
      '--title', 'PR 验收夹具', '--expected', '任务可进入交付验收', '--criterion', 'AC-1'));
    const testPath = 'test/pr-acceptance.test.mjs';
    const testName = `${added.id} pr acceptance fixture`;
    const testSource = existsSync(join(checkout, testPath))
      ? read(checkout, testPath)
      : "import assert from 'node:assert/strict';\nimport test from 'node:test';\n";
    put(checkout, testPath, `${testSource}\ntest('${testName}', () => assert.equal(1, 1));\n`);
    success(cli(checkout, 'verify', id, '--criterion', 'AC-1', '--test', `${testPath}::${testName}`));
  }
  commitAll(checkout, 'test(workflow): 准备 PR 验收夹具');
  success(cli(checkout, 'accept', id, '--by', 'Tiller Test'));
  // accept already auto-commits task records; keep an explicit commit only if anything else remains dirty.
  const dirty = git(checkout, 'status', '--porcelain');
  if (dirty.trim()) commitAll(checkout, 'chore(workflow): 记录交付验收');
}

async function cliAt(root, environment, ...args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args, '--json'], {
      cwd: root, env: { ...process.env, ...environment }, windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 60_000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', (status, signal) => {
      clearTimeout(timeout);
      assert.equal(signal, null, stderr || stdout);
      let data;
      try { data = JSON.parse(stdout); }
      catch { assert.fail(`Expected JSON output: ${stdout}\n${stderr}`); }
      resolve({ status, signal, stdout, stderr, data });
    });
  });
}

function prepareTaskBranch(root, id) {
  const started = success(cli(root, 'start', id, '--title', '真实 PR 交付', '--requirement', '默认创建真实 PR/MR。',
    '--criterion', 'AC-1=PR/MR 返回 URL 与编号', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases', '--target', '.tiller/specs/modules/workflow'));
  const worktree = join(root, started.worktreeRoot);
  const branch = started.worktrees[0].branch;
  // Persist the worktree-only start seed onto the task branch before dismantling the worktree.
  git(worktree, 'add', `--`, `.tiller/task/${id}`);
  git(worktree, 'commit', '--quiet', '-m', `chore: 开工记录 ${id}`);
  git(root, 'worktree', 'remove', '--force', worktree);
  git(root, 'worktree', 'prune');
  git(root, 'checkout', '--quiet', branch);
  return branch;
}

test('CASE-279 CASE-292 pr 经 API 创建真实 PR 并返回稳定字段', async t => {
  for (const platform of ['github', 'gitlab']) {
    const root = fixture(t);
    success(cli(root, 'init', '--platform', platform));
    setupRepository(root);
    const id = `20261027-real-${platform}-pr`;
    const branch = prepareTaskBranch(root, id);
    const remoteHead = git(root, 'rev-parse', 'HEAD').trim();
    const mock = await startPlatformMock(t, { platform, remoteHead });
    git(root, 'remote', 'add', 'origin', `${mock.origin}${platform === 'github' ? '/owner/repo.git' : '/group/project.git'}`);
    acceptTaskForPr(root, id);
    const environment = platform === 'github'
      ? { ...emptyTokens, GITHUB_TOKEN: 'mock-token' }
      : { ...emptyTokens, GITLAB_TOKEN: 'mock-token' };

    const created = success(await cliAt(root, environment, 'pr', id));
    assert.equal(created.platform, platform);
    assert.equal(created.pushed.method, 'tokenized-git');
    assert.equal(created.branch, branch);
    assert.match(created.title, new RegExp(`\\[${id}\\]$`, 'u'));
    assert.equal(created.draftOnly, false);
    assert.match(created.url, /^https:\/\/example\.invalid\/tiller\/(?:pr|mr)\/\d+$/u);
    assert.equal(created.number, platform === 'github' ? 1 : 7);
    assert.match(created.markdown, new RegExp(created.url.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    const createPath = platform === 'github' ? '/pulls' : '/merge_requests';
    assert.ok(mock.state.requests.some(item => item.method === 'POST' && item.path.endsWith(createPath)));
    assert.ok(mock.state.requests.some(item => platform === 'github' ? item.hasAuthorization : item.hasPrivateToken));

    const missing = failure(await cliAt(root, emptyTokens, 'pr', id));
    assert.equal(missing.error.code, 'PR_TOKEN_MISSING');
    assert.match(missing.error.message, platform === 'github' ? /缺少 GitHub token/u : /缺少 GitLab token/u);

    const postsBefore = mock.state.requests.filter(item => item.method === 'POST' && item.path.endsWith(createPath)).length;
    const reused = success(await cliAt(root, environment, 'pr', id));
    assert.equal(reused.number, created.number);
    assert.equal(reused.url, created.url);
    assert.match(reused.next, /已复用/u);
    assert.ok(reused.warnings.some(warning => warning.includes('同一 head branch+SHA')), reused.warnings.join('\n'));
    assert.equal(mock.state.requests.filter(item => item.method === 'POST' && item.path.endsWith(createPath)).length, postsBefore);

    mock.state.openIntegrations.delete(branch);
    mock.setMode('pr-exists');
    const existing = failure(await cliAt(root, environment, 'pr', id));
    assert.equal(existing.error.code, 'PR_ALREADY_EXISTS');
    assert.match(existing.error.message, /已存在|already exists/u);
  }
});

test('CASE-323 pr reuses the same head branch and SHA after a lost create response', async t => {
  for (const platform of ['github', 'gitlab']) {
    const root = fixture(t);
    success(cli(root, 'init', '--platform', platform));
    setupRepository(root);
    const id = `20261028-idempotent-${platform}-pr`;
    const branch = prepareTaskBranch(root, id);
    const remoteHead = git(root, 'rev-parse', 'HEAD').trim();
    const mock = await startPlatformMock(t, { platform, mode: 'pr-created-lost', remoteHead });
    git(root, 'remote', 'add', 'origin', `${mock.origin}${platform === 'github' ? '/owner/repo.git' : '/group/project.git'}`);
    acceptTaskForPr(root, id);
    const environment = platform === 'github'
      ? { ...emptyTokens, GITHUB_TOKEN: 'mock-token' }
      : { ...emptyTokens, GITLAB_TOKEN: 'mock-token' };
    const createPath = platform === 'github' ? '/pulls' : '/merge_requests';

    const recovered = success(await cliAt(root, environment, 'pr', id));
    assert.match(recovered.next, /已复用/u);
    assert.ok(recovered.warnings.some(warning => warning.includes('同一 head branch+SHA')), recovered.warnings.join('\n'));
    assert.equal(mock.state.requests.filter(item => item.method === 'POST' && item.path.endsWith(createPath)).length, 1);
    assert.equal(mock.state.openIntegrations.get(branch)?.length, 1);

    mock.setMode('success');
    const retried = success(await cliAt(root, environment, 'pr', id));
    assert.equal(retried.number, recovered.number);
    assert.equal(retried.url, recovered.url);
    assert.equal(mock.state.requests.filter(item => item.method === 'POST' && item.path.endsWith(createPath)).length, 1);
    assert.equal(mock.state.openIntegrations.get(branch)?.length, 1);
  }
});

test('CASE-325 global specs tasks use the specs scope despite module paths in the requirement', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261028-global-specs-scope';
  success(cli(root, 'start', id, '--title', '全局规格收口', '--requirement',
    '同步 `.tiller/specs/modules/workflow/requirements.md` 描述的全局规格。',
    '--criterion', 'AC-1=全局规格标题使用 specs scope', '--size', 'small',
    '--target', '.tiller/specs', '--target', '.tiller/cases', '--target', 'test'));
  acceptTaskForPr(root, id);

  const draft = success(cli(root, 'pr', id, '--draft-only'));
  assert.equal(draft.module, 'specs');
  assert.match(draft.title, new RegExp(`^feat\\(specs\\): .+ \\[${id}\\]$`, 'u'));
  assert.ok(!draft.warnings.some(warning => warning.includes('多个模块')), draft.warnings.join('\n'));
});

test('CASE-298 GitHub pr prefers tokenized git push and keeps pull request creation on REST API', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-github-tokenized-push';
  const branch = prepareTaskBranch(root, id);
  const remoteHead = git(root, 'rev-parse', 'HEAD').trim();
  const mock = await startPlatformMock(t, { platform: 'github', remoteHead });
  git(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  acceptTaskForPr(root, id);
  const environment = { ...emptyTokens, GITHUB_TOKEN: 'mock-token' };

  const created = success(await cliAt(root, environment, 'pr', id));
  assert.equal(created.pushed.method, 'tokenized-git');
  assert.equal(mock.state.requests.some(item => item.path.includes('/git/')), false,
    mock.state.requests.map(item => `${item.method} ${item.path}`).join('\n'));
  const pushed = git(root, '--git-dir', mock.gitRepo, 'rev-parse', `refs/heads/${branch}`).trim();
  assert.equal(pushed, git(root, 'rev-parse', branch).trim());
  const create = mock.state.requests.find(item => item.method === 'POST' && item.path.endsWith('/pulls'));
  assert.ok(create?.hasAuthorization);

  const source = readFileSync(new URL('../src/platform-api.ts', import.meta.url), 'utf8');
  const pushBranch = source.slice(source.indexOf('export async function pushBranch'));
  assert.ok(pushBranch.indexOf('tokenizedPush') < pushBranch.indexOf('pushGitHubApi'),
    'pushBranch must try tokenizedPush before the optional Git Data API fallback');
});

test('CASE-284 pr draft-only 仅输出草稿不联网', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-draft-only';
  success(cli(root, 'start', id, '--title', '草稿预览', '--requirement', '只输出五段草稿。',
    '--criterion', 'AC-1=草稿不联网', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases', '--target', '.tiller/specs/modules/workflow'));
  acceptTaskForPr(root, id);

  const draft = success(cli(root, 'pr', id, '--draft-only'));
  assert.equal(draft.draftOnly, true);
  assert.equal(Object.hasOwn(draft, 'url'), false);
  assert.equal(Object.hasOwn(draft, 'number'), false);
  assert.match(draft.markdown, /^feat\(workflow\): 草稿预览 \[20261027-draft-only\]/u);
  for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) {
    assert.equal(draft.body.split(`## ${heading}`).length - 1, 1, heading);
  }
});

test('CASE-292 pr 非 TTY 默认输出 JSON 且 TTY 保持 Markdown', async t => {
  assert.equal(prOutputFormat({ json: false, tty: false }), 'json');
  assert.equal(prOutputFormat({ json: false, tty: undefined }), 'json');
  assert.equal(prOutputFormat({ json: false, tty: true }), 'markdown');
  assert.equal(prOutputFormat({ json: true, tty: true }), 'json');

  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-machine-output';
  success(cli(root, 'start', id, '--title', '机器输出', '--requirement', '非 TTY 默认输出稳定 JSON。',
    '--criterion', 'AC-1=默认 JSON 可解析', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases', '--target', '.tiller/specs/modules/workflow'));
  acceptTaskForPr(root, id);

  const plain = spawnCaptured(process.execPath, [cliPath, 'pr', id, '--draft-only'], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(plain.status, 0, plain.stderr);
  const data = JSON.parse(plain.stdout);
  assert.equal(data.ok, true);
  assert.equal(data.platform, 'github');
  assert.equal(data.branch, `feat/${id}`);
  assert.match(data.title, new RegExp(`\\[${id}\\]$`, 'u'));
  assert.equal(data.draftOnly, true);
  assert.equal(typeof data.markdown, 'string');
  assert.equal(Object.hasOwn(data, 'url'), false);
  assert.equal(Object.hasOwn(data, 'number'), false);
});

test('CASE-285 任务记录仅在 worktree 时 pr 不误报缺失', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-worktree-pr-record';
  const started = success(cli(root, 'start', id, '--title', 'worktree 任务记录', '--requirement', '从记录所在检出生成 PR 草稿。',
    '--criterion', 'AC-1=主仓缺少记录仍可生成草稿', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases', '--target', '.tiller/specs/modules/workflow'));
  const worktree = join(root, started.worktreeRoot);
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);
  assert.equal(existsSync(join(worktree, `.tiller/task/${id}/task.md`)), true);

  acceptTaskForPr(worktree, id);
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);
  const draft = success(cli(worktree, 'pr', id, '--draft-only'));
  assert.equal(draft.draftOnly, true);
  assert.match(draft.body, new RegExp(`\\.tiller/task/${id}/task\\.md`, 'u'));
});

test('CASE-296 worktree PR push and cleanup keep primary as the main checkout', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-worktree-primary-delivery';
  const started = success(cli(root, 'start', id, '--title', 'worktree 交付', '--requirement', '从 worktree 交付仍使用主仓推送和清理。',
    '--criterion', 'AC-1=交付使用主仓句柄', '--size', 'small', '--target', '.'));
  const worktree = join(root, started.worktreeRoot);
  const branch = started.worktrees[0].branch;
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);
  const primaryMetadata = JSON.parse(read(root, '.tiller/project.json'));
  delete primaryMetadata.managedFiles['.tiller/usage.md'];
  put(root, '.tiller/project.json', `${JSON.stringify(primaryMetadata, null, 2)}\n`);
  const remoteHead = git(root, 'rev-parse', 'HEAD').trim();
  const mock = await startPlatformMock(t, { platform: 'github', remoteHead });
  git(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  acceptTaskForPr(worktree, id);

  const environment = { ...emptyTokens, GITHUB_TOKEN: 'mock-token' };
  const created = success(await cliAt(worktree, environment, 'pr', id));
  assert.equal(created.branch, branch);
  assert.equal(created.draftOnly, false);
  assert.ok(mock.state.requests.some(item => item.method === 'POST' && item.path.endsWith('/pulls')));

  mock.state.mergedBranches.add(branch);
  const closed = success(await cliAt(worktree, environment, 'close', id, '--reason', '夹具清理'));
  assert.deepEqual(closed.worktrees, [started.worktreeRoot]);
  assert.equal(existsSync(worktree), false);
  assert.notEqual(spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  }).status, 0);
});

test('CASE-286 任务在所有相关检出均不存在时 pr 仍报缺失', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const fixtureId = '20261027-worktree-missing-record';
  const started = success(cli(root, 'start', fixtureId, '--title', '缺失记录夹具', '--requirement', '提供任务 worktree。',
    '--criterion', 'AC-1=缺失任务保持原错误码', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  const worktree = join(root, started.worktreeRoot);
  const absentId = '20261027-absent-task-record';
  const missing = failure(cli(worktree, 'pr', absentId, '--draft-only'));
  assert.equal(missing.error.code, 'TASK_NOT_FOUND');
  assert.match(missing.error.message, new RegExp(absentId, 'u'));
});

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
  const wt = taskCheckout(root, id);
  fillDesign(wt, id);
  success(confirmTask(wt, id, 'requirements', '--by', 'Tiller Test'));
  success(cli(wt, 'confirm', id, 'design', '--by', 'Tiller Test'));
  const added = success(cli(wt, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'PR 草稿结构', '--expected', 'PR 草稿包含固定五段', '--criterion', 'AC-1'));
  assert.equal(added.id, 'CASE-001');
  success(cli(wt, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  git(wt, 'add', '.');
  git(wt, 'commit', '--quiet', '-m', 'feat(workflow): 生成固定五段 PR 草稿');
  acceptTaskForPr(wt, id);

  const draft = success(cli(wt, 'pr', id, '--draft-only'));
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

  const plain = spawnCaptured(process.execPath, [cliPath, 'pr', id, '--draft-only'], { cwd: wt, encoding: 'utf8', timeout: 60_000 });
  assert.equal(plain.status, 0, plain.stderr);
  const machine = JSON.parse(plain.stdout);
  assert.equal(machine.ok, true);
  assert.equal(machine.title, draft.title);
  assert.equal(machine.branch, draft.branch);
  assert.equal(machine.draftOnly, true);
  assert.ok(machine.markdown.startsWith(`${draft.title}\n\n建议分支：\`${draft.branch}\`\n\n## 关联任务`), machine.markdown);

  const checked = success(cli(wt, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.ok(!checked.warnings.some(item => item.includes('分支')), checked.warnings.join('\n'));
  git(wt, 'checkout', '--quiet', '-b', 'fix/other-task');
  const mismatched = success(cli(wt, 'check', id));
  assert.match(mismatched.warnings.join('\n'), /任务编号与当前任务 .* 不符/u);
  git(wt, 'checkout', '--quiet', '-b', `codex/${id}`);
  const malformed = success(cli(wt, 'check', id));
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
  const wt = taskCheckout(root, id);
  success(confirmTask(wt, id, 'requirements', '--by', 'Tiller Test'));
  success(cli(wt, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', '提交信息检查', '--expected', '不合规提交只产生提示', '--criterion', 'AC-1'));
  success(cli(wt, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  git(wt, 'add', '.');
  git(wt, 'commit', '--quiet', '-m', 'update stuff');
  const branch = git(wt, 'branch', '--show-current').trim();
  git(wt, 'checkout', '--quiet', '-b', 'side');
  git(wt, 'commit', '--allow-empty', '--quiet', '-m', 'feat(workflow): 合并前有效提交');
  git(wt, 'checkout', '--quiet', branch);
  git(wt, 'merge', '--no-ff', '--quiet', '-m', 'merge side without convention', 'side');

  const checked = success(cli(wt, 'check', id));
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
    put(root, `.tiller/specs/modules/${module}/requirements.md`, `# ${module}\n\n## 验收条件\n\n- AC-1: ${module} behavior is observable.\n`);
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
  const draft = success(cli(root, 'pr', id, '--draft-only'));
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
  const fallback = success(cli(unknown, 'pr', unknownId, '--draft-only'));
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
  assert.equal(success(cli(root, 'pr', metadataTask, '--draft-only')).branch, `feat/${metadataTask}-structured-task`);
  assert.equal(success(cli(root, 'pr', metadataTask, '--slug', 'PR_Draft 2', '--draft-only')).branch, `feat/${metadataTask}-pr-draft-2`);

  const branchTask = '20261022-slug-branch';
  success(cli(root, 'start', branchTask, '--title', '当前分支描述', '--requirement', '从当前分支读取描述。',
    '--criterion', 'AC-1=分支包含当前分支描述', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/cases'));
  const branchWt = taskCheckout(root, branchTask);
  git(branchWt, 'branch', '-m', `fix/${branchTask}-from-current`);
  acceptTaskForPr(branchWt, branchTask);
  assert.equal(success(cli(branchWt, 'pr', branchTask, '--draft-only')).branch, `feat/${branchTask}-from-current`);
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
    '--title', '全部验证记录', '--expected', '保留每次验证记录', '--criterion', 'AC-1'));
  const firstRun = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  const secondRun = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  const first = firstRun.entries[0].command;
  const second = secondRun.entries[0].command;

  acceptTaskForPr(root, id);
  const draft = success(cli(root, 'pr', id, '--draft-only'));
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
  assert.equal(success(cli(root, 'pr', metadataId, '--draft-only')).title, `feat(workflow): 元数据中文摘要 [${metadataId}]`);
  assert.equal(success(cli(root, 'pr', metadataId, '--summary', '命令行中文摘要', '--draft-only')).title,
    `feat(workflow): 命令行中文摘要 [${metadataId}]`);

  const commitId = '20261022-summary-commit';
  success(cli(root, 'start', commitId, '--title', '提交摘要回退标题', '--requirement', '从提交历史取最早摘要。',
    '--criterion', 'AC-1=使用最早提交摘要', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  const commitWt = taskCheckout(root, commitId);
  put(commitWt, 'src/workflow.ts', 'export const value = 2;\n');
  git(commitWt, 'add', '.');
  git(commitWt, 'commit', '--quiet', '-m', 'chore: 准备提交');
  put(commitWt, 'src/workflow.ts', 'export const value = 3;\n');
  git(commitWt, 'add', '.');
  git(commitWt, 'commit', '--quiet', '-m', 'feat(workflow): 最早中文摘要');
  put(commitWt, 'src/workflow.ts', 'export const value = 4;\n');
  git(commitWt, 'add', '.');
  git(commitWt, 'commit', '--quiet', '-m', 'fix(workflow): 后续中文摘要');
  acceptTaskForPr(commitWt, commitId);
  assert.equal(success(cli(commitWt, 'pr', commitId, '--draft-only')).title, `feat(workflow): 最早中文摘要 [${commitId}]`);

  const fallbackRoot = fixture(t);
  success(cli(fallbackRoot, 'init'));
  setupRepository(fallbackRoot);
  const fallbackId = '20261022-summary-fallback';
  success(cli(fallbackRoot, 'start', fallbackId, '--title', '任务标题回退', '--requirement', '没有提交摘要时使用任务标题。',
    '--criterion', 'AC-1=使用任务标题', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  acceptTaskForPr(fallbackRoot, fallbackId);
  assert.equal(success(cli(fallbackRoot, 'pr', fallbackId, '--draft-only')).title, `feat: 任务标题回退 [${fallbackId}]`);
});

test('CASE-082 pr change list orders commits from oldest to newest', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261022-commit-order';
  success(cli(root, 'start', id, '--title', '提交顺序', '--requirement', '变更内容按时间正序。',
    '--criterion', 'AC-1=较早提交在前', '--size', 'small', '--target', 'src', '--target', 'test',
    '--target', '.tiller/specs/modules/workflow', '--target', '.tiller/cases'));
  const wt = taskCheckout(root, id);
  put(wt, 'src/workflow.ts', 'export const value = 2;\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '--quiet', '-m', 'feat(workflow): 较早提交');
  put(wt, 'src/workflow.ts', 'export const value = 3;\n');
  git(wt, 'add', '.');
  git(wt, 'commit', '--quiet', '-m', 'fix(workflow): 较晚提交');
  acceptTaskForPr(wt, id);

  const draft = success(cli(wt, 'pr', id, '--draft-only'));
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
    '--title', '验证格式', '--expected', '验证记录使用普通嵌套列表', '--criterion', 'AC-1'));
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/workflow.test.mjs::CASE-001 workflow behavior'));
  const command = verified.entries[0].command;

  acceptTaskForPr(root, id);
  const draft = success(cli(root, 'pr', id, '--draft-only'));
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
  const draft = success(cli(root, 'pr', id, '--draft-only'));
  assert.match(draft.body, new RegExp(`^## 关联任务\\n\\n任务 ${id}，记录见 \`\\.tiller/task/${id}/task\\.md\`$`, 'mu'));
  assert.doesNotMatch(draft.body, /\[[^\]]+\]\(\.tiller\/task\//u);
  const help = success(cli(root, '--help')).help;
  assert.match(help, /五段 PR\/MR 说明/u);
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
  const wt = taskCheckout(root, id);
  acceptTaskForPr(wt, id);

  const taskPath = `.tiller/task/${id}/task.md`;
  put(wt, taskPath, `${read(wt, taskPath)}\n<!-- 临时任务记录改动 -->\n`);
  const taskDirty = failure(cli(wt, 'pr', id, '--draft-only'));
  assert.equal(taskDirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.ok(taskDirty.error.message.includes(taskPath), taskDirty.error.message);

  git(wt, 'add', taskPath);
  git(wt, 'commit', '--quiet', '-m', 'chore(workflow): 记录任务');

  const casePath = '.tiller/cases/modules/workflow/behavior.md';
  put(wt, casePath, '# workflow behavior\n\n## CASE-900 临时用例\n');
  const caseDirty = failure(cli(wt, 'pr', id, '--draft-only'));
  assert.equal(caseDirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.ok(caseDirty.error.message.includes(casePath), caseDirty.error.message);

  git(wt, 'add', casePath);
  git(wt, 'commit', '--quiet', '-m', 'test(workflow): 记录用例');

  const specPath = '.tiller/specs/modules/workflow/requirements.md';
  put(wt, specPath, `${read(wt, specPath)}\n临时规格改动。\n`);
  const specDirty = failure(cli(wt, 'pr', id, '--draft-only'));
  assert.equal(specDirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.ok(specDirty.error.message.includes(specPath), specDirty.error.message);
  assert.equal(Object.hasOwn(specDirty, 'body'), false);
});

test('CASE-301 pr identifies worktree records separately from primary residual copies', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-dirty-records-primary';
  const started = success(cli(root, 'start', id, '--title', '区分任务记录残留', '--requirement', '任务记录位置应清晰。',
    '--criterion', 'AC-1=PR 指出 worktree 与 primary 的脏记录', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases', '--target', '.tiller/specs'));
  const worktree = join(root, started.worktreeRoot);
  acceptTaskForPr(worktree, id);

  put(root, `.tiller/task/${id}/primary-residual.md`, 'primary residual copy\n');
  put(worktree, '.tiller/specs/modules/workflow/pending-record.md', '# pending record\n');

  const dirty = failure(cli(worktree, 'pr', id, '--draft-only'));
  assert.equal(dirty.error.code, 'PR_TASK_RECORDS_DIRTY');
  assert.match(dirty.error.message, /当前任务检出（worktree）/u);
  assert.match(dirty.error.message, /primary 主检出（残留副本）/u);
  assert.match(dirty.error.message, /不会自动删除用户文件/u);
  assert.ok(existsSync(join(root, `.tiller/task/${id}/primary-residual.md`)),
    'tiller must not delete the primary residual copy');
});

test('CASE-301 repeated accept rechecks the current code tree', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261027-repeat-accept-current-tree';
  success(cli(root, 'start', id, '--title', '重复验收当前树', '--requirement', '重复验收要重新核实当前工作区。',
    '--criterion', 'AC-1=改代码后重复验收被阻断', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases', '--target', '.tiller/specs'));
  const wt = taskCheckout(root, id);
  acceptTaskForPr(wt, id);

  put(wt, 'src/workflow.ts', 'export const value = 2;\n');
  git(wt, 'add', 'src/workflow.ts');
  git(wt, 'commit', '--quiet', '-m', 'feat(workflow): change accepted tree');
  const repeated = failure(cli(wt, 'accept', id, '--by', 'Tiller Test'));
  assert.equal(repeated.error.code, 'NOT_READY');
  assert.match(repeated.error.message, /验证已过期|当前工作区|重新验证/u);
});

test('CASE-301 CASE-304 multiline requirement stays short-goal only and points to requirement-file', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const rejected = failure(cli(root, 'start', '20261027-multiline-requirement', '--title', '多行需求',
    '--requirement', '第一行\n第二行', '--criterion', 'AC-1=多行需求指向文件', '--size', 'small', '--target', 'src'));
  assert.equal(rejected.error.code, 'INVALID_FLOW_INPUT');
  assert.match(rejected.error.message, /短目标|单行/u);
  assert.match(rejected.error.message, /--requirement-file/u);
  assert.match(rejected.error.message, /\.tiller\/specs\//u);
  const help = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--requirement 仅短目标单行/u);
  assert.match(help.stdout, /--requirement-file/u);
});

test('CASE-217 pr generates the five-section draft after task records are committed', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  setupRepository(root);
  const id = '20261026-pr-records-clean';
  success(cli(root, 'start', id, '--title', '已提交记录', '--requirement', '干净记录生成草稿。',
    '--criterion', 'AC-1=干净记录生成五段草稿', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases', '--target', '.tiller/specs'));
  const wt = taskCheckout(root, id);
  acceptTaskForPr(wt, id);
  const specPath = '.tiller/specs/modules/workflow/requirements.md';
  put(wt, specPath, `${read(wt, specPath)}\n## 记录同步\n\nPR 前记录已提交。\n`);
  git(wt, 'add', `.tiller/task/${id}`, specPath);
  git(wt, 'commit', '--quiet', '-m', 'feat(workflow): 记录 PR 前同步');

  const draft = success(cli(wt, 'pr', id, '--draft-only'));
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
  const wt = taskCheckout(root, id);
  acceptTaskForPr(wt, id);
  put(root, '.tiller/task/20261026-pr-records-other/task.md', '# 其他任务\n\n未提交记录。\n');

  const draft = success(cli(wt, 'pr', id, '--draft-only'));
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
  const wt = taskCheckout(root, id);
  acceptTaskForPr(wt, id);
  rmSync(join(root, '.git'), { recursive: true, force: true });

  const draft = success(cli(wt, 'pr', id, '--draft-only'));
  assert.ok(draft.warnings.some(item => /无法读取.*未提交改动.*跳过/u.test(item)), draft.warnings.join('\n'));
  assert.match(draft.body, /^## 关联任务$/mu);
});

test('CASE-220 delivery docs require committing task records before pr', () => {
  const usage = readFileSync(new URL('../resources/usage.md', import.meta.url), 'utf8');
  const delivery = readFileSync(new URL('../resources/rules/activities/delivery.md', import.meta.url), 'utf8');
  const decisions = readFileSync(new URL('../.tiller/specs/decisions.md', import.meta.url), 'utf8');
  const requirements = readFileSync(new URL('../.tiller/specs/modules/workflow/requirements.md', import.meta.url), 'utf8');
  const design = readFileSync(new URL('../.tiller/specs/modules/workflow/design.md', import.meta.url), 'utf8');
  for (const text of [usage, delivery, decisions]) assert.match(text, /提交.*任务记录|自动提交本任务记录/u);
  assert.match(usage, /PR_TASK_RECORDS_DIRTY/u);
  assert.match(usage, /accept.*pr 前|自动提交本任务记录/su);
  assert.match(usage, /收尾不改 `task\.md`/u);
  assert.doesNotMatch(usage, /合入后\s*`accept`\/`close`[^。\n]*另作收尾提交/u);
  assert.match(delivery, /其他任务.*不阻断/su);
  assert.match(decisions, /自动提交本任务记录|其它路径仍不自动/u);
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
  const wt = taskCheckout(root, id);
  success(confirmTask(wt, id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(wt, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'PR 前验收', '--expected', '未验收时阻断 PR', '--criterion', 'AC-1'));
  const testPath = 'test/pr-not-accepted.test.mjs';
  const testName = `${added.id} unaccepted pr fixture`;
  put(wt, testPath, `import assert from 'node:assert/strict';\nimport test from 'node:test';\n\ntest('${testName}', () => assert.equal(1, 1));\n`);
  success(cli(wt, 'verify', id, '--criterion', 'AC-1', '--test', `${testPath}::${testName}`));
  commitAll(wt, 'test(workflow): 准备未验收 PR 夹具');

  const blocked = failure(cli(wt, 'pr', id, '--draft-only'));
  assert.equal(blocked.error.code, 'PR_NOT_ACCEPTED');
  assert.match(blocked.error.message, new RegExp(`accept ${id}`, 'u'));
  assert.match(blocked.error.message, /提交任务记录|accept/u);
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
