import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, cliPath, failure, fixture, put, success } from './helpers.mjs';
import { startPlatformMock } from './platform-api-mock.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const emptyTokens = { GITHUB_TOKEN: '', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' };

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  return result;
}

function okGit(root, ...args) {
  const result = git(root, ...args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function configure(root) {
  okGit(root, 'config', 'user.name', 'Tiller Test');
  okGit(root, 'config', 'user.email', 'tiller@example.invalid');
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

async function initialize(t, options = {}) {
  const platform = options.platform ?? 'github';
  const root = fixture(t);
  configure(root);
  const mock = await startPlatformMock(t, {
    platform, mode: options.mode ?? 'success', remoteHead: okGit(root, 'rev-parse', 'HEAD'),
    git: options.gitPush !== false,
  });
  okGit(root, 'remote', 'add', 'origin', `${mock.origin}${platform === 'github' ? '/owner/repo.git' : '/group/project.git'}`);
  const tokenEnvironment = options.token === false
    ? emptyTokens
    : platform === 'github'
      ? { GITHUB_TOKEN: 'mock-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' }
      : { GITHUB_TOKEN: '', GH_TOKEN: '', GITLAB_TOKEN: 'mock-token', GL_TOKEN: '' };
  const environment = tokenEnvironment;
  const result = await cliAt(root, environment, 'init', '--platform', platform);
  return { root, result, mock, environment };
}

test('CASE-228 init creates a committed initialization worktree and creates the titled PR through GitHub API', async t => {
  const initialized = await initialize(t);
  if (!initialized) return;
  const { root, result, mock } = initialized;
  const data = success(result);
  const baseline = data.initBaseline;
  assert.match(baseline.id, /^[0-9]{8}-tiller-init$/u);
  assert.equal(baseline.branch, 'chore/tiller-init');
  assert.equal(baseline.worktree, `.tiller/local/${baseline.id}/worktrees`);
  assert.equal(baseline.prUrl, 'https://example.invalid/tiller/pr/1');

  const worktree = join(root, baseline.worktree);
  assert.ok(existsSync(worktree));
  assert.equal(okGit(worktree, 'branch', '--show-current'), 'chore/tiller-init');
  assert.equal(okGit(worktree, 'log', '-1', '--format=%s'), 'chore(tiller): 完成工程初始化');
  assert.equal(okGit(worktree, 'status', '--porcelain'), '');
  assert.equal(okGit(worktree, 'merge-base', '--is-ancestor', baseline.commit, 'HEAD'), '');

  assert.equal(existsSync(join(root, '.tiller/project.json')), false, 'primary must not seed project.json');
  const metadata = JSON.parse(read(worktree, '.tiller/project.json'));
  assert.deepEqual(metadata.initBaseline, {
    id: baseline.id, branch: baseline.branch, commit: baseline.commit, status: 'pending',
  });
  const localBaseline = JSON.parse(read(root, `.tiller/local/${baseline.id}/baseline.json`));
  assert.equal(localBaseline.id, baseline.id);
  assert.equal(localBaseline.status, 'pending');
  assert.equal(localBaseline.commit, baseline.commit);
  const initRequests = mock.state.requests;
  assert.ok(!initRequests.some(item => item.path.includes('/git/')));
  assert.ok(initRequests.some(item => item.method === 'POST' && item.path.endsWith('/pulls')));
  assert.ok(initRequests.filter(item => /\/git\/|pulls/u.test(item.path)).every(item => item.hasAuthorization));
  assert.deepEqual(data.warnings.filter(warning => warning.includes('回退')), []);

  const before = okGit(root, 'rev-parse', 'HEAD');
  const merged = git(root, 'merge-base', '--is-ancestor', baseline.commit, before);
  assert.notEqual(merged.status, 0, 'initialization must not be merged automatically');
});

test('CASE-229 failed PR creation keeps the worktree and commit and returns API/token next steps', async t => {
  const initialized = await initialize(t, { mode: 'pr-failure' });
  if (!initialized) return;
  const { root, result } = initialized;
  const data = success(result);
  const baseline = data.initBaseline;
  const worktree = join(root, baseline.worktree);
  assert.equal(baseline.prUrl, undefined);
  assert.ok(existsSync(worktree));
  assert.equal(okGit(worktree, 'branch', '--show-current'), 'chore/tiller-init');
  assert.equal(okGit(worktree, 'log', '-1', '--format=%s'), 'chore(tiller): 完成工程初始化');
  assert.ok(data.warnings.some(warning => warning.includes('初始化分支推送或 PR/MR 创建失败')), data.warnings.join('\n'));
  assert.doesNotMatch(`${data.warnings.join('\n')}\n${baseline.next.join('\n')}`, /mock-token/u);
  assert.ok(baseline.next.some(command => command.includes('GITHUB_TOKEN')));
  assert.ok(baseline.next.some(command => command.includes('tiller init') && command.includes('创建 PR/MR')));
  assert.ok(baseline.next.every(command => !/github pr create|gitlab mr create|\bgh\b|\bglab\b/u.test(command)));
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);
  assert.ok(existsSync(join(worktree, '.tiller/project.json')));
});

test('CASE-247 init without platform CLI falls back to GitHub API push and REST PR', async t => {
  const initialized = await initialize(t, { gitPush: false });
  if (!initialized) return;
  const { root, result, mock } = initialized;
  const data = success(result);
  const baseline = data.initBaseline;
  assert.equal(baseline.prUrl, 'https://example.invalid/tiller/pr/1');
  assert.equal(mock.state.refs.get('refs/heads/chore/tiller-init'), okGit(root, 'rev-parse', baseline.head));
  const requests = mock.state.requests;
  assert.ok(requests.some(item => item.method === 'POST' && item.path.endsWith('/git/commits')));
  assert.ok(requests.some(item => item.method === 'POST' && item.path.endsWith('/git/refs')));
  assert.ok(requests.some(item => item.method === 'POST' && item.path.endsWith('/pulls')));
  assert.ok(requests.filter(item => item.path.startsWith('/api/v3/')).every(item => item.hasAuthorization));
  assert.ok(requests.some(item => item.path.includes('.git/')), 'tokenized git push is attempted before fallback');
  assert.ok(data.warnings.some(warning => warning.includes('回退到 Git Data API')), data.warnings.join('\n'));
  assert.ok(baseline.next.every(command => !/github pr create|\bgh\b/u.test(command)));
});

test('CASE-248 init without token keeps local state and gives API/token guidance in Chinese', async t => {
  for (const platform of ['github', 'gitlab']) {
    const initialized = await initialize(t, { platform, token: false });
    if (!initialized) return;
    const { result, mock } = initialized;
    const data = success(result);
    const baseline = data.initBaseline;
    assert.ok(existsSync(join(initialized.root, baseline.worktree)));
    assert.equal(mock.state.requests.length, 0);
    assert.ok(data.warnings.some(warning => warning.includes('缺少') && warning.includes('token')), data.warnings.join('\n'));
    const next = baseline.next.join('\n');
    assert.match(next, platform === 'github' ? /GITHUB_TOKEN/u : /GITLAB_TOKEN/u);
    assert.match(next, /tiller init|REST API/u);
    assert.doesNotMatch(next, /github pr create|gitlab mr create|\bgh\b|\bglab\b/u);
  }
});

test('CASE-253 CASE-306 init baseline merged through the platform API unlocks start and records merged', async t => {
  for (const platform of ['github', 'gitlab']) {
    const initialized = await initialize(t, { platform });
    if (!initialized) continue;
    const { root, environment, result, mock } = initialized;
    const baseline = success(result).initBaseline;
    assert.notEqual(git(root, 'merge-base', '--is-ancestor', baseline.commit, 'HEAD').status, 0,
      'the rewritten platform merge must not be treated as an ancestor');

    mock.state.mergedBranches.add(baseline.branch);
    mock.resetRequests();
    const id = `20261026-${platform}-api-merged`;
    success(await cliAt(root, environment, 'start', id, '--title', 'API merged baseline',
      '--requirement', 'A platform-merged initialization can start work.', '--criterion', 'AC-1=Start succeeds',
      '--size', 'small', '--target', '.'));

    const metadata = JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json'));
    assert.equal(metadata.initBaseline.status, 'pending', 'tracked project.json keeps pending snapshot');
    assert.equal(existsSync(join(root, '.tiller/project.json')), false);
    const marker = JSON.parse(read(root, '.tiller/local/init-baseline-merged.json'));
    assert.equal(marker.id, baseline.id);
    assert.equal(marker.status, 'merged');
    const query = mock.state.requests.find(item => item.method === 'GET' && item.search.includes('state=all'));
    assert.ok(query, `${platform} should query merged integrations`);
    assert.match(query.search, platform === 'github'
      ? /head=owner%3Achore%2Ftiller-init/u
      : /source_branch=chore%2Ftiller-init/u);
    assert.ok(mock.state.requests.every(item => item.hasAuthorization || item.hasPrivateToken));
  }
});

test('CASE-288 doctor and close use platform merge evidence for a pending init baseline', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, environment, result, mock } = initialized;
  const baseline = success(result).initBaseline;
  mock.state.mergedBranches.add(baseline.branch);

  const report = success(await cliAt(root, environment, 'doctor'));
  assert.equal(report.ready, true, report.issues.join('\n'));
  assert.ok(report.checks.some(check => check.id === 'init-baseline' && check.status === 'pass'));
  assert.equal(JSON.parse(read(root, '.tiller/local/init-baseline-merged.json')).status, 'merged');
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.status, 'pending');
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);

  // Removing the local marker should still allow close to re-prove and rewrite local merged.
  rmSync(join(root, '.tiller/local/init-baseline-merged.json'), { force: true });
  // Snapshot pending before close removes the init worktree.
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.status, 'pending');
  success(await cliAt(root, environment, 'close', baseline.id, '--reason', '初始化基线已合入'));
  assert.equal(JSON.parse(read(root, '.tiller/local/init-baseline-merged.json')).status, 'merged');
  assert.equal(existsSync(join(root, baseline.worktree)), false);
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);
});

test('CASE-288 ancestor proof records merged for doctor and close init-id', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  assert.notEqual(git(root, 'merge-base', '--is-ancestor', baseline.commit, 'HEAD').status, 0);
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);

  okGit(root, 'merge', '--quiet', '--no-edit', baseline.branch);
  const report = success(await cliAt(root, emptyTokens, 'doctor'));
  assert.equal(report.ready, true, report.issues?.join('\n'));
  assert.equal(JSON.parse(read(root, '.tiller/local/init-baseline-merged.json')).status, 'merged');
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, 'pending');

  rmSync(join(root, '.tiller/local/init-baseline-merged.json'), { force: true });
  success(await cliAt(root, emptyTokens, 'close', baseline.id, '--reason', '初始化基线已合入'));
  assert.equal(JSON.parse(read(root, '.tiller/local/init-baseline-merged.json')).status, 'merged');
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, 'pending');
});

test('CASE-289 CASE-305 init leaves no untracked managed residue', async t => {
  const root = fixture(t);
  configure(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test'));
  put(root, 'notes/user-file.txt', 'keep user data\n');
  const mock = await startPlatformMock(t, { remoteHead: okGit(root, 'rev-parse', 'HEAD') });
  okGit(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  const environment = { ...emptyTokens, GITHUB_TOKEN: 'mock-token' };
  // Use async spawn (cliAt): spawnSync can deadlock nested git when stdin is piped.
  const raw = await cliAt(root, { ...environment, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' }, 'init', '--platform', 'github');
  assert.equal(raw.status, 0, raw.stderr || raw.stdout);
  const created = raw.data;
  assert.ok(created.initBaseline);

  const status = okGit(root, 'status', '--porcelain=v1', '--untracked-files=all').split(/\r?\n/u).filter(Boolean);
  assert.deepEqual(status.filter(line => !line.endsWith('notes/user-file.txt')), [], status.join('\n'));
  for (const relative of ['AGENTS.md', '.gitignore', '.tiller/project.json', '.tiller/usage.md', '.tiller/cases/index.md', 'src/.gitkeep', 'test/.gitkeep']) {
    assert.equal(existsSync(join(root, relative)), false, relative);
  }
  const worktreeMeta = join(created.initBaseline.worktree, '.tiller/project.json');
  assert.ok(existsSync(join(root, worktreeMeta)), worktreeMeta);
  assert.equal(JSON.parse(read(root, worktreeMeta)).initBaseline.status, 'pending');
  assert.equal(read(root, 'notes/user-file.txt'), 'keep user data\n');
});

test('CASE-291 init includes gitkeeps for empty src and test in the baseline commit', async t => {
  const root = fixture(t);
  configure(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test'));
  const mock = await startPlatformMock(t, { remoteHead: okGit(root, 'rev-parse', 'HEAD') });
  okGit(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  const created = success(await cliAt(root, { ...emptyTokens, GITHUB_TOKEN: 'mock-token' }, 'init', '--platform', 'github'));
  const baseline = created.initBaseline;
  assert.ok(baseline);
  const files = okGit(root, 'show', '--name-only', '--format=', '--no-renames', baseline.commit).split(/\r?\n/u).filter(Boolean);
  for (const relative of ['.tiller/cases/modules/.gitkeep', '.tiller/cases/scenarios/.gitkeep', 'src/.gitkeep', 'test/.gitkeep']) {
    assert.ok(files.includes(relative), `${relative} should be in ${baseline.commit}`);
    assert.equal(okGit(join(root, baseline.worktree), 'show', `${baseline.commit}:${relative}`), '');
  }
});

test('CASE-299 init adds gitkeep when src and test directories are missing', async t => {
  const initialized = await initialize(t);
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  assert.ok(baseline);
  const files = okGit(root, 'show', '--name-only', '--format=', '--no-renames', baseline.commit)
    .split(/\r?\n/u).filter(Boolean);
  for (const relative of ['src/.gitkeep', 'test/.gitkeep']) {
    assert.ok(files.includes(relative), `${relative} should be created in ${baseline.commit}`);
    assert.equal(okGit(join(root, baseline.worktree), 'show', `${baseline.commit}:${relative}`), '');
  }
});

test('CASE-254 missing token or platform API failure keeps the init gate closed', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, environment, result, mock } = initialized;
  const baseline = success(result).initBaseline;
  const common = ['--title', 'Gate remains closed', '--requirement', 'Do not bypass initialization without evidence.',
    '--criterion', 'AC-1=Start requires merge evidence', '--size', 'small', '--target', '.'];

  mock.resetRequests();
  const noToken = failure(await cliAt(root, emptyTokens, 'start', '20261026-init-no-token', ...common));
  assert.equal(noToken.error.code, 'INIT_BASELINE_PENDING');
  assert.match(noToken.error.message, /GITHUB_TOKEN|GH_TOKEN/u);
  assert.match(noToken.error.message, /--skip-init-gate/u);
  assert.equal(mock.state.requests.length, 0);

  mock.setMode('query-failure');
  const queryFailure = failure(await cliAt(root, environment, 'start', '20261026-init-query-failure', ...common));
  assert.equal(queryFailure.error.code, 'INIT_BASELINE_PENDING');
  assert.match(queryFailure.error.message, /平台合入状态查询失败|query rejected/u);
  assert.ok(mock.state.requests.some(item => item.method === 'GET' && item.search.includes('state=all')));
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.status, 'pending');
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);
  assert.equal(existsSync(join(root, '.tiller/task/20261026-init-query-failure/task.md')), false);
  assert.equal(baseline.status, 'pending');
});

test('CASE-230 close init-id only clears that initialization local and preserves task locals', async t => {
  const initialized = await initialize(t, { mode: 'pr-failure' });
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  const taskId = '20261026-keep-task-local';
  success(await cliAt(root, {}, 'start', taskId, '--skip-init-gate', '--title', 'Keep task local',
    '--requirement', 'Keep an unrelated task local.', '--criterion', 'AC-1=Local stays', '--size', 'small', '--target', '.'));
  const taskLocal = join(root, '.tiller/local', taskId, 'worktrees');
  assert.ok(existsSync(taskLocal));

  const closed = success(await cliAt(root, {}, 'close', baseline.id, '--reason', '初始化基线已合入'));
  assert.equal(closed.stage, '已关闭');
  assert.ok(closed.worktrees.some(item => item === baseline.worktree || String(item).endsWith(baseline.worktree) || String(item).includes(baseline.id)), JSON.stringify(closed.worktrees));
  assert.equal(existsSync(join(root, '.tiller/local', baseline.id)), false);
  assert.ok(existsSync(taskLocal));
  assert.doesNotMatch(okGit(root, 'worktree', 'list', '--porcelain'), /20261026-tiller-init/u);
});

test('CASE-231 start blocks a pending initialization commit, supports skip and merged detection', async t => {
  const initialized = await initialize(t, { mode: 'pr-failure' });
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  const common = ['--title', 'Gate behavior', '--requirement', 'Check initialization gate behavior.',
    '--criterion', 'AC-1=Gate is observable', '--size', 'small', '--target', '.'];

  const blocked = await cliAt(root, {}, 'start', '20261026-init-gate-blocked', ...common);
  assert.equal(blocked.status, 1);
  assert.equal(blocked.data.error.code, 'INIT_BASELINE_PENDING');
  assert.equal(existsSync(join(root, '.tiller/task/20261026-init-gate-blocked/task.md')), false);

  const skipped = success(await cliAt(root, {}, 'start', '20261026-init-gate-skipped', '--skip-init-gate', ...common));
  assert.ok(skipped.warnings.some(warning => warning.includes('--skip-init-gate')));

  okGit(root, 'merge', '--quiet', '--no-edit', baseline.branch);
  success(await cliAt(root, {}, 'start', '20261026-init-gate-merged', ...common));

  const statusRoot = fixture(t);
  configure(statusRoot);
  const statusMock = await startPlatformMock(t, { remoteHead: okGit(statusRoot, 'rev-parse', 'HEAD'), mode: 'pr-failure' });
  okGit(statusRoot, 'remote', 'add', 'origin', `${statusMock.origin}/owner/repo.git`);
  const statusInit = success(await cliAt(statusRoot, { ...emptyTokens, GITHUB_TOKEN: 'mock-token' }, 'init'));
  const baselinePending = statusInit.initBaseline;
  put(statusRoot, '.tiller/local/init-baseline-merged.json', `${JSON.stringify({
    id: baselinePending.id, status: 'merged', at: '2026-10-27T00:00:00.000Z', commit: baselinePending.commit, branch: baselinePending.branch,
  }, null, 2)}\n`);
  success(await cliAt(statusRoot, {}, 'start', '20261026-init-status-merged', ...common));
  assert.equal(baselinePending.status, 'pending');
  assert.equal(JSON.parse(read(join(statusRoot, baselinePending.worktree), '.tiller/project.json')).initBaseline.status, 'pending');
});

test('CASE-232 usage, core and delivery document initialization order and task worktree specs', () => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) {
    assert.equal(read(repository, pair[0]), read(repository, pair[1]), pair.join(' == '));
  }
  const usage = read(repository, 'resources/usage.md');
  assert.match(usage, /init` → 初始化 PR\/MR → 人工合入 → `start/u);
  assert.match(usage, /--skip-init-gate/u);
  assert.match(usage, /`specs`.*任务 worktree.*合入/u);
  assert.match(usage, /close <init-id>/u);
  const core = read(repository, 'resources/rules/core.md');
  assert.match(core, /初始化 PR\/MR → 人工合入 → `start`/u);
  assert.match(core, /specs.*任务 worktree/u);
  const delivery = read(repository, 'resources/rules/activities/delivery.md');
  assert.match(delivery, /chore\/tiller-init/u);
  assert.match(delivery, /INIT_BASELINE_PENDING/u);
  assert.match(delivery, /close <init-id>/u);
});

test('CASE-233 initialization baseline stays at version 0.5.0 with named test coverage', () => {
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  assert.match(read(repository, 'src/cli.ts'), /CLI_VERSION = '0\.5\.0'/u);
  const source = read(repository, 'test/init-baseline.test.mjs');
  for (const id of ['CASE-228', 'CASE-229', 'CASE-230', 'CASE-231', 'CASE-232', 'CASE-233', 'CASE-247', 'CASE-248']) {
    assert.match(source, new RegExp(`test\\('[^'\\n]*${id}\\b`, 'u'));
  }
});

test('CASE-313 main path uses one PATH tiller without init runtime binding', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  assert.equal(existsSync(join(root, '.tiller/local/runtime.json')), false);
  const started = success(cli(root, 'start', '20261027-path-only-tiller', '--title', 'PATH 单一 tiller',
    '--requirement', '主路径只使用 PATH 中的 tiller。', '--criterion', 'AC-1=不依赖 bind', '--size', 'small',
    '--target', 'src'));
  assert.ok(started.worktreeRoot);

  for (const relative of ['README.md', 'resources/usage.md', '.tiller/usage.md']) {
    const content = read(repository, relative);
    assert.match(content, /tiller start|tiller init/u, relative);
    assert.doesNotMatch(content, /node \.tiller\/run\.cjs|tiller runtime (?:status|bind)/u, relative);
  }
  const smoke = read(repository, 'scripts/package-smoke.mjs');
  assert.match(smoke, /const cli = join\(install, 'node_modules\/tiller\/dist\/cli\.js'\)/u);
  assert.doesNotMatch(smoke, /spawnSync\([^)]*\.tiller\/run\.cjs|invoke\(\['runtime', '(?:status|bind)'\]/su);
  const help = success(cli(root, '--help')).help;
  assert.doesNotMatch(help, /runtime (?:status|bind)/u);
});
