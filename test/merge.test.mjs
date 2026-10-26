import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, cliPath, confirmTask, failure, fixture, put, success } from './helpers.mjs';
import { fakeGitForTokenizedPush, realGitPath, startPlatformMock } from './platform-api-mock.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function configure(root) {
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');
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

async function initialize(t, platform = 'github') {
  const root = fixture(t);
  configure(root);
  const mock = await startPlatformMock(t, { platform, remoteHead: git(root, 'rev-parse', 'HEAD') });
  git(root, 'remote', 'add', 'origin', `${mock.origin}${platform === 'github' ? '/owner/repo.git' : '/group/project.git'}`);
  const wrapper = platform === 'gitlab' ? fakeGitForTokenizedPush(t, root, realGitPath()) : null;
  if (platform === 'gitlab' && wrapper === null) return null;
  const environment = platform === 'github'
    ? { GITHUB_TOKEN: 'mock-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' }
    : { GITHUB_TOKEN: '', GH_TOKEN: '', GITLAB_TOKEN: 'mock-token', GL_TOKEN: '', ...wrapper.environment };
  const initialized = success(await cliAt(root, environment, 'init', '--platform', platform));
  return { root, environment, mock, wrapper, baseline: initialized.initBaseline };
}

async function acceptTask(root, id) {
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Merge\n\nAccepted tasks can be merged.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nDelegate merge and cleanup.\n');
  put(root, 'src/merge-fixture.ts', 'export const mergeFixture = true;\n');
  success(cli(root, 'start', id, '--title', `Merge ${id}`, '--requirement', 'Merge an accepted task.',
    '--criterion', 'AC-1=Merge behavior is observable', '--size', 'small', '--target', '.'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'Merge fixture', '--expected', 'The accepted task can be merged.', '--criterion', 'AC-1',
    '--source', 'src/merge-fixture.ts'));
  const testPath = `test/${id}.test.mjs`;
  const testName = `${added.id} merge fixture`;
  put(root, testPath, `import test from 'node:test';\n\ntest('${testName}', () => {});\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'test(workflow): 准备 merge 夹具');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `${testPath}::${testName}`));
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
}

test('CASE-234 README 面向最终用户的介绍与快速开始', () => {
  const readme = read(repository, 'README.md');
  assert.match(readme, /^# tiller\n/u);
  assert.deepEqual([...readme.matchAll(/^## (.+)$/gmu)].map(match => match[1]), ['快速开始']);
  assert.deepEqual([...readme.matchAll(/^### (.+)$/gmu)].map(match => match[1]), ['安装', '初始化工程', '用 AI 开发一个功能']);
  assert.match(readme, /npm install -g \.\/tiller-0\.5\.0\.tgz/u);
  assert.match(readme, /chore\(tiller\): 完成工程初始化/u);
  assert.match(readme, /合入[^\n]*git pull/u);
  assert.match(readme, /用 Codex 等 AI 编程工具/u);
  assert.match(readme, /`start` →（standard 任务先完成设计确认）→ 实现 → `verify` → `pr` → `merge`\/`close`/u);
  assert.match(readme, /需求范围、standard 任务的设计，以及最终交付验收/u);
  assert.match(readme, /合入与本机清理由 AI 按 tiller 约定完成/u);
  assert.match(readme, /合入操作由 AI 推进/u);
  assert.deepEqual([...readme.matchAll(/```[^\n]*\n([\s\S]*?)```/gu)].map(match => match[1].trim()),
    ['npm install -g ./tiller-0.5.0.tgz', 'tiller init .']);
  assert.doesNotMatch(readme, /尚未发布到 npm|维护者|决策记录/u);
});

test('CASE-242 README 以 AI 执行为主并使用 REST API 与 token', () => {
  const readme = read(repository, 'README.md');
  assert.match(readme, /AI 会按工程内的 tiller 约定执行/u);
  assert.match(readme, /你主要负责在关键节点确认/u);
  assert.match(readme, /合入与本机清理由 AI 按 tiller 约定完成/u);
  assert.match(readme, /REST API/u);
  assert.match(readme, /GITHUB_TOKEN|GITLAB_TOKEN/u);
  assert.doesNotMatch(readme, /\bgh\b|\bglab\b/u);
  assert.doesNotMatch(readme, /```[^\n]*\n[^`]*(?:tiller\s+)?(?:pr|merge|close)\b/u);
  assert.doesNotMatch(readme, /squash|平台 CLI|底层工具名/u);
});

test('CASE-235 CASE-249 GitHub merge 经 REST API squash 成功后自动清理本机任务', async t => {
  const initialized = await initialize(t, 'github');
  if (!initialized) return;
  const { root, environment, mock } = initialized;
  const id = '20261026-github-merge';
  await acceptTask(root, id);
  const local = join(root, '.tiller/local', id);
  assert.ok(existsSync(local));

  mock.resetRequests();
  const merged = success(await cliAt(root, environment, 'merge', id));
  assert.equal(merged.merged, true);
  assert.equal(merged.platform, 'github');
  assert.equal(merged.branch, `feat/${id}`);
  assert.match(merged.command, /^github-api PUT .*\/pulls\/1\/merge \(squash\)$/u);
  assert.equal(merged.close.id, id);
  assert.equal(existsSync(local), false);
  assert.deepEqual(mock.state.requests.map(item => `${item.method} ${item.path}`), [
    'GET /api/v3/repos/owner/repo/pulls',
    'PUT /api/v3/repos/owner/repo/pulls/1/merge',
  ]);
  assert.ok(mock.state.requests.every(item => item.hasAuthorization));
  assert.deepEqual(JSON.parse(mock.state.requests[1].body), { merge_method: 'squash' });
});

test('CASE-236 CASE-250 GitHub merge API 失败时保留本机任务', async t => {
  const initialized = await initialize(t, 'github');
  if (!initialized) return;
  const { root, environment, mock } = initialized;
  const id = '20261026-github-merge-failed';
  await acceptTask(root, id);
  const local = join(root, '.tiller/local', id);

  mock.setMode('failure');
  mock.resetRequests();
  const failed = failure(await cliAt(root, environment, 'merge', id));
  assert.equal(failed.error.code, 'MERGE_FAILED');
  assert.match(failed.error.message, /merge rejected/u);
  assert.doesNotMatch(`${failed.stdout}\n${failed.stderr}`, /mock-token/u);
  assert.ok(existsSync(local));
  assert.ok(existsSync(join(local, 'worktrees')));
  assert.ok(mock.state.requests.some(item => item.method === 'PUT' && item.path.endsWith('/pulls/1/merge')));
});

test('CASE-237 GitLab merge 经 REST API squash 成功后自动清理本机任务', async t => {
  const initialized = await initialize(t, 'gitlab');
  if (!initialized) return;
  const { root, environment, mock, wrapper } = initialized;
  const id = '20261026-gitlab-merge';
  await acceptTask(root, id);
  const local = join(root, '.tiller/local', id);

  mock.resetRequests();
  const merged = success(await cliAt(root, environment, 'merge', id));
  assert.equal(merged.platform, 'gitlab');
  assert.match(merged.command, /^gitlab-api PUT .*\/merge_requests\/7\/merge \(squash\)$/u);
  assert.equal(existsSync(local), false);
  assert.deepEqual(mock.state.requests.map(item => `${item.method} ${item.path}`), [
    'GET /api/v4/projects/group%2Fproject/merge_requests',
    'PUT /api/v4/projects/group%2Fproject/merge_requests/7/merge',
  ]);
  assert.ok(mock.state.requests.every(item => item.hasPrivateToken));
  assert.deepEqual(JSON.parse(mock.state.requests[1].body), { squash: true });
  assert.equal(readFileSync(wrapper.log, 'utf8').trim().split('\n').length, 1);
});

test('CASE-238 GitLab merge API 失败时保留本机任务', async t => {
  const initialized = await initialize(t, 'gitlab');
  if (!initialized) return;
  const { root, environment, mock } = initialized;
  const id = '20261026-gitlab-merge-failed';
  await acceptTask(root, id);
  const local = join(root, '.tiller/local', id);

  mock.setMode('failure');
  mock.resetRequests();
  const failed = failure(await cliAt(root, environment, 'merge', id));
  assert.equal(failed.error.code, 'MERGE_FAILED');
  assert.match(failed.error.message, /merge rejected/u);
  assert.doesNotMatch(`${failed.stdout}\n${failed.stderr}`, /mock-token/u);
  assert.ok(existsSync(local));
  assert.ok(existsSync(join(local, 'worktrees')));
  assert.ok(mock.state.requests.some(item => item.method === 'PUT' && item.path.endsWith('/merge_requests/7/merge')));
});

test('CASE-239 init-id merge 通过 REST API 合入初始化分支并清理 local', async t => {
  const initialized = await initialize(t, 'github');
  if (!initialized) return;
  const { root, environment, mock, baseline } = initialized;

  mock.resetRequests();
  const merged = success(await cliAt(root, environment, 'merge', baseline.id));
  assert.equal(merged.branch, 'chore/tiller-init');
  assert.equal(merged.close.stage, '已关闭');
  assert.equal(existsSync(join(root, '.tiller/local', baseline.id)), false);
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, 'merged');
  assert.match(merged.command, /pulls\/1\/merge \(squash\)/u);
  assert.ok(mock.state.requests.every(item => item.hasAuthorization));

  const started = success(await cliAt(root, {}, 'start', '20261026-after-init-merge', '--title', 'After init',
    '--requirement', 'The merged initialization does not block tasks.', '--criterion', 'AC-1=Start succeeds',
    '--size', 'small', '--target', '.'));
  assert.equal(started.id, '20261026-after-init-merge');
});

test('CASE-244 远端操作只调用平台 REST API 与 tokenized git transport', () => {
  const sources = ['src/platform-api.ts', 'src/init-baseline.ts', 'src/pr.ts'].map(relative => read(repository, relative)).join('\n');
  assert.doesNotMatch(sources, /resolvePlatformCli|platform-cli|platformCliUnavailable/u);
  assert.doesNotMatch(sources, /execFileAsync\(['"](?:github|gitlab|gh|glab)['"]/u);
  assert.match(sources, /GitHub REST API/u);
  assert.match(sources, /tokenized HTTPS git push/u);
  assert.equal(existsSync(join(repository, 'src/platform-cli.ts')), false);
});

test('CASE-240 接入文档说明 API merge 与网页合入手动 close', () => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) assert.equal(read(repository, pair[0]), read(repository, pair[1]), pair.join(' == '));

  for (const relative of ['resources/usage.md', 'resources/rules/core.md', 'resources/rules/activities/delivery.md']) {
    const content = read(repository, relative);
    assert.match(content, /merge <id>/u, relative);
    assert.match(content, /merge <init-id>/u, relative);
    assert.match(content, /网页合入[^\n]*(?:手动|`close`)[^\n]*close/u, relative);
  }
  assert.match(read(repository, 'resources/usage.md'), /REST API.*squash/u);
  assert.match(read(repository, 'resources/rules/activities/delivery.md'), /失败不清理/u);
});

test('CASE-243 受管文档与 CLI help 使用 REST API 并保持镜像一致', () => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) {
    const content = read(repository, pair[0]);
    assert.equal(content, read(repository, pair[1]), pair.join(' == '));
    assert.doesNotMatch(content, /\bgh\b|\bglab\b/u, pair[0]);
    assert.match(content, /REST API/u, pair[0]);
  }
  assert.match(read(repository, 'resources/usage.md'), /GitHub.*GitLab|GitLab.*GitHub/u);
  const help = success(cli(repository, '--help')).help;
  assert.match(help, /REST API/u);
  assert.match(help, /GITHUB_TOKEN|GITLAB_TOKEN/u);
  assert.doesNotMatch(help, /\bgh\b|\bglab\b/u);
});

test('CASE-251 文档以 token/API 为主且 decisions 记录 push 选择', () => {
  const combined = ['README.md', 'resources/usage.md', 'resources/rules/core.md',
    'resources/rules/activities/delivery.md', 'src/cli.ts'].map(relative => read(repository, relative)).join('\n');
  for (const token of ['GITHUB_TOKEN', 'GH_TOKEN', 'GITLAB_TOKEN', 'GL_TOKEN']) assert.match(combined, new RegExp(token, 'u'));
  assert.match(combined, /REST API/u);
  assert.doesNotMatch(combined, /安装[^\n]*(?:github|gitlab) CLI|请先安装并登录/u);
  const decisions = read(repository, '.tiller/specs/decisions.md');
  assert.match(decisions, /Git Data API/u);
  assert.match(decisions, /tokenized HTTPS `git push`/u);
  assert.match(decisions, /平台 CLI/u);
});

test('CASE-241 CASE-245 CASE-252 API 远端操作保持 0.5.0 且打包模块同步', () => {
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  assert.match(read(repository, 'src/cli.ts'), /CLI_VERSION = '0\.5\.0'/u);
  const source = read(repository, 'test/merge.test.mjs');
  for (const id of ['CASE-234', 'CASE-235', 'CASE-236', 'CASE-237', 'CASE-238', 'CASE-239', 'CASE-240',
    'CASE-241', 'CASE-242', 'CASE-243', 'CASE-244', 'CASE-245', 'CASE-249', 'CASE-250', 'CASE-251', 'CASE-252']) {
    assert.match(source, new RegExp(`test\\('[^'\\n]*${id}\\b`, 'u'));
  }
  const smoke = read(repository, 'scripts/package-smoke.mjs');
  assert.match(smoke, /'platform-api'/u);
  assert.doesNotMatch(smoke, /'platform-cli'/u);
});
