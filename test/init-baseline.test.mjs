import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

async function okGitAsync(root, ...args) {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
      cwd: root, encoding: 'utf8', timeout: 60_000, windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status, signal) => {
      if (signal || status !== 0) reject(new Error(stderr || `git exited with ${status ?? signal}`));
      else resolve(stdout.trim());
    });
  });
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
  if (options.mainBranch) okGit(root, 'branch', '-M', options.mainBranch);
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
  const result = await cliAt(root, environment, 'init', '--platform', platform, ...(options.apply ? ['--apply'] : []));
  return { root, result, mock, environment };
}

test('CASE-228 CASE-321 init creates a committed initialization worktree and a uniquely titled, traceable PR', async t => {
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
  assert.equal(okGit(worktree, 'log', '-1', '--format=%s'), 'chore(tiller): 记录初始化基线');
  assert.equal(okGit(worktree, 'log', '-2', '--format=%s').split(/\r?\n/u).at(-1), 'chore(tiller): 完成工程初始化');
  assert.notEqual(okGit(worktree, 'log', '-1', '--format=%s'), okGit(worktree, 'log', '-2', '--format=%s').split(/\r?\n/u).at(-1));
  assert.equal(okGit(worktree, 'status', '--porcelain'), '');
  assert.equal(okGit(worktree, 'merge-base', '--is-ancestor', baseline.commit, 'HEAD'), '');
  assert.match(baseline.head, /^[a-f0-9]{40,64}$/u);
  assert.equal(baseline.headRef, undefined);
  assert.equal(baseline.status, undefined);
  assert.equal(data.initBaselineStatus.status, 'pending');

  assert.equal(existsSync(join(root, '.tiller/project.json')), false, 'primary must not seed project.json');
  const metadata = JSON.parse(read(worktree, '.tiller/project.json'));
  assert.deepEqual(metadata.initBaseline, {
    id: baseline.id, branch: baseline.branch, commit: baseline.commit,
  });
  const localBaseline = JSON.parse(read(root, `.tiller/local/${baseline.id}/baseline.json`));
  assert.equal(localBaseline.id, baseline.id);
  assert.equal(localBaseline.commit, baseline.commit);
  assert.equal(localBaseline.head, baseline.head);
  assert.equal(localBaseline.headRef, undefined);
  assert.equal(localBaseline.status, undefined);
  const initRequests = mock.state.requests;
  assert.ok(!initRequests.some(item => item.path.includes('/git/')));
  assert.ok(initRequests.some(item => item.method === 'POST' && item.path.endsWith('/pulls')));
  const created = initRequests.find(item => item.method === 'POST' && item.path.endsWith('/pulls'));
  assert.equal(JSON.parse(created.body).title, `chore(tiller): 完成工程初始化 [${baseline.id}]`);
  assert.deepEqual([...mock.state.refs.keys()].filter(ref => ref.startsWith('refs/tags/')), []);
  assert.equal(okGit(root, 'tag', '--list', 'tiller-init/*'), '');
  assert.ok(initRequests.filter(item => /\/git\/|pulls/u.test(item.path)).every(item => item.hasAuthorization));
  assert.deepEqual(data.warnings.filter(warning => warning.includes('回退')), []);

  const before = okGit(root, 'rev-parse', 'HEAD');
  const merged = git(root, 'merge-base', '--is-ancestor', baseline.commit, before);
  assert.notEqual(merged.status, 0, 'initialization must not be merged automatically');
});

test('CASE-346 init preflight rejects missing token or invalid origin before creating artifacts', async t => {
  const root = fixture(t);
  configure(root);
  const head = okGit(root, 'rev-parse', 'HEAD');
  const mock = await startPlatformMock(t, { remoteHead: head });
  okGit(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);

  const assertNoArtifacts = () => {
    assert.equal(existsSync(join(root, '.tiller/local')), false);
    assert.equal(existsSync(join(root, '.tiller/project.json')), false);
    assert.notEqual(git(root, 'show-ref', '--verify', '--quiet', 'refs/heads/chore/tiller-init').status, 0);
    assert.equal(okGit(root, 'rev-parse', 'HEAD'), head);
  };

  const noToken = failure(await cliAt(root, emptyTokens, 'init', '--platform', 'github'));
  assert.equal(noToken.error.code, 'INIT_PREFLIGHT_TOKEN');
  assert.match(noToken.error.message, /GITHUB_TOKEN.*GH_TOKEN/u);
  assertNoArtifacts();

  const noTokenApply = failure(await cliAt(root, emptyTokens, 'init', '--platform', 'github', '--apply'));
  assert.equal(noTokenApply.error.code, 'INIT_PREFLIGHT_TOKEN');
  assertNoArtifacts();

  okGit(root, 'remote', 'set-url', 'origin', 'not-a-valid-remote');
  const invalidOrigin = failure(await cliAt(root, { ...emptyTokens, GITHUB_TOKEN: 'mock-token' }, 'init', '--platform', 'github'));
  assert.equal(invalidOrigin.error.code, 'INIT_PREFLIGHT_REMOTE');
  assert.match(invalidOrigin.error.message, /origin.*git remote add origin/u);
  assertNoArtifacts();
});

test('CASE-345 init preflight rejects unavailable git before creating artifacts for init and --apply', async t => {
  const root = fixture(t);
  configure(root);
  const head = okGit(root, 'rev-parse', 'HEAD');
  const mock = await startPlatformMock(t, { remoteHead: head });
  okGit(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  const environment = {
    PATH: '', GITHUB_TOKEN: 'mock-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '',
  };

  for (const apply of [false, true]) {
    const target = apply ? 'new-project-apply' : 'new-project';
    const result = await cliAt(root, environment,
      'init', target, '--platform', 'github', ...(apply ? ['--apply'] : []));
    const data = failure(result);
    assert.equal(data.error.code, 'INIT_PREFLIGHT_GIT');
    assert.match(data.error.message, /安装 Git/u);
    assert.match(data.error.message, /git --version/u);
    assert.equal(existsSync(join(root, target)), false);
    assert.equal(existsSync(join(root, '.tiller/local')), false);
    assert.equal(existsSync(join(root, '.tiller/project.json')), false);
    assert.notEqual(git(root, 'show-ref', '--verify', '--quiet', 'refs/heads/chore/tiller-init').status, 0);
    assert.equal(okGit(root, 'rev-parse', 'HEAD'), head);
  }
  assert.equal(mock.state.requests.length, 0);
});

test('CASE-340 init --apply merges, cleans up and fast-forwards; rejected merge stays resumable', async t => {
  for (const platform of ['github', 'gitlab']) {
    const initialized = await initialize(t, { platform, mainBranch: 'main', apply: true });
    const { root, result, mock } = initialized;
    const data = success(result);
    const baseline = data.initBaseline;
    assert.equal(data.apply.merged, true);
    assert.equal(data.apply.branch, 'chore/tiller-init');
    assert.equal(data.apply.base, 'main');
    assert.equal(data.apply.fastForward.branch, 'main');
    assert.equal(existsSync(join(root, baseline.worktree)), false);
    assert.equal(existsSync(join(root, `.tiller/local/${baseline.id}`)), false);
    assert.equal(existsSync(join(root, '.tiller/project.json')), true);
    assert.equal(existsSync(join(root, '.tiller/usage.md')), true);
    assert.equal(okGit(root, 'branch', '--show-current'), 'main');
    assert.equal(okGit(root, 'status', '--porcelain'), '');
    assert.equal(okGit(root, 'rev-parse', 'HEAD'), okGit(root, 'rev-parse', 'refs/remotes/origin/main'));
    assert.equal(mock.state.refs.has('refs/heads/chore/tiller-init'), false);
    assert.ok(mock.state.requests.some(request => request.method === 'PUT' && request.path.endsWith('/merge')
      && (platform === 'github' ? request.body.includes('squash') : true)));
    const status = success(await cliAt(root, emptyTokens, 'status'));
    assert.equal(status.initBaselineStatus.status, 'merged');
  }

  const failed = await initialize(t, { platform: 'github', mainBranch: 'main', mode: 'failure', apply: true });
  const failureData = failure(failed.result);
  assert.equal(failureData.error.code, 'INIT_APPLY_MERGE_FAILED');
  assert.match(failureData.error.message, /tiller merge [0-9]{8}-tiller-init/u);
  assert.match(failureData.error.message, /git pull --ff-only/u);
  const ids = readdirSync(join(failed.root, '.tiller/local')).filter(name => /^[0-9]{8}-tiller-init$/u.test(name));
  assert.equal(ids.length, 1);
  const localBaseline = JSON.parse(read(failed.root, `.tiller/local/${ids[0]}/baseline.json`));
  assert.ok(existsSync(join(failed.root, '.tiller/local', ids[0], 'worktrees')));
  assert.equal(existsSync(join(failed.root, '.tiller/project.json')), false);
  assert.equal(existsSync(join(failed.root, '.tiller/local/init-baseline-merged.json')), false);
  assert.ok([...failed.mock.state.openIntegrations.values()].some(items => items.some(item => item.sha === localBaseline.head)));
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
  assert.equal(okGit(worktree, 'log', '-1', '--format=%s'), 'chore(tiller): 记录初始化基线');
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

test('CASE-248 CASE-346 init without token fails preflight with API/token guidance and no local state', async t => {
  for (const platform of ['github', 'gitlab']) {
    const initialized = await initialize(t, { platform, token: false });
    const { root, result, mock } = initialized;
    const data = failure(result);
    assert.equal(data.error.code, 'INIT_PREFLIGHT_TOKEN');
    assert.match(data.error.message, platform === 'github' ? /GITHUB_TOKEN.*GH_TOKEN/u : /GITLAB_TOKEN.*GL_TOKEN/u);
    assert.equal(mock.state.requests.length, 0);
    assert.equal(existsSync(join(root, '.tiller/local')), false);
    assert.equal(existsSync(join(root, '.tiller/project.json')), false);
    assert.equal(git(root, 'show-ref', '--verify', '--quiet', 'refs/heads/chore/tiller-init').status === 0, false);
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
    assert.equal(metadata.initBaseline.status, undefined, 'tracked project.json has no status snapshot');
    assert.equal(metadata.initBaseline.headRef, undefined, 'tracked project.json has no tag ref');
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
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.status, undefined);
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);

  // Removing the local marker should still allow close to re-prove and rewrite local merged.
  rmSync(join(root, '.tiller/local/init-baseline-merged.json'), { force: true });
  // The tracked snapshot has no status field before close removes the init worktree.
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.status, undefined);
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
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, undefined);

  rmSync(join(root, '.tiller/local/init-baseline-merged.json'), { force: true });
  success(await cliAt(root, emptyTokens, 'close', baseline.id, '--reason', '初始化基线已合入'));
  assert.equal(JSON.parse(read(root, '.tiller/local/init-baseline-merged.json')).status, 'merged');
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, undefined);
});

test('CASE-320 fresh clone rejects merged PR without baseline commit binding', async t => {
  const initialized = await initialize(t, { mainBranch: 'main' });
  if (!initialized) return;
  const { root, environment, result, mock } = initialized;
  const baseline = success(result).initBaseline;
  const worktree = join(root, baseline.worktree);
  const local = join(root, `.tiller/local/${baseline.id}`);

  const refused = failure(await cliAt(root, environment, 'close', baseline.id, '--reason', '尚未证明合入'));
  assert.equal(refused.error.code, 'INIT_BASELINE_PENDING');
  assert.ok(existsSync(worktree), 'failed proof keeps the init worktree');
  assert.ok(existsSync(local), 'failed proof keeps the init local state');
  assert.equal(git(root, 'show-ref', '--verify', '--quiet', `refs/heads/${baseline.branch}`).status, 0);

  // Simulate the squash merge landing only the final tree on main; the init commits
  // themselves are absent from main history and the merged PR did not contain them.
  okGit(root, 'checkout', baseline.head, '--', '.');
  okGit(root, 'add', '-A');
  okGit(root, 'commit', '--quiet', '-m', 'chore(tiller): squash 初始化基线');
  await okGitAsync(root, 'push', 'origin', 'main');
  await okGitAsync(root, 'push', 'origin', '--delete', baseline.branch);

  const cloneParent = mkdtempSync(join(tmpdir(), 'tiller-fresh-clone-'));
  t.after(() => rmSync(cloneParent, { recursive: true, force: true }));
  await okGitAsync(cloneParent, 'clone', '--quiet', '--branch', 'main', `${mock.origin}/owner/repo.git`, 'repo');
  const clone = join(cloneParent, 'repo');
  configure(clone);
  assert.equal(await okGitAsync(clone, 'ls-remote', '--heads', 'origin', baseline.branch), '');
  assert.equal(await okGitAsync(clone, 'ls-remote', '--tags', 'origin', 'tiller-init/*'), '');
  assert.equal(existsSync(join(clone, '.tiller/local/init-baseline-merged.json')), false);
  const tracked = JSON.parse(read(clone, '.tiller/project.json')).initBaseline;
  assert.equal(tracked.head, undefined);
  assert.equal(tracked.headRef, undefined);
  assert.equal(tracked.status, undefined);

  mock.setMergedCommitLists(baseline.branch, [{ head: baseline.head, commits: ['f'.repeat(40)] }]);
  const refusedDoctor = failure(await cliAt(clone, environment, 'doctor'));
  assert.match(refusedDoctor.issues.join('\n'), /未找到唯一包含初始化提交/u);
  const refusedStart = failure(await cliAt(clone, environment, 'start', '20261028-fresh-clone-blocked',
    '--title', 'Fresh clone blocked', '--requirement', 'A fresh clone without local proof must stay pending.',
    '--criterion', 'AC-1=Start stays blocked', '--size', 'small', '--target', '.'));
  assert.equal(refusedStart.error.code, 'INIT_BASELINE_PENDING');
  const refusedClose = failure(await cliAt(clone, environment, 'close', baseline.id, '--reason', '尚未证明合入'));
  assert.equal(refusedClose.error.code, 'INIT_BASELINE_PENDING');
  assert.equal(existsSync(join(clone, `.tiller/local/${baseline.id}`)), false);

  put(clone, `.tiller/local/${baseline.id}/baseline.json`, `${JSON.stringify({
    id: baseline.id, branch: baseline.branch, commit: baseline.commit, head: baseline.head,
    prUrl: baseline.prUrl, prNumber: 1,
  }, null, 2)}\n`);
  const report = success(await cliAt(clone, environment, 'doctor'));
  assert.equal(report.ready, true, report.issues.join('\n'));
  assert.ok(report.checks.some(check => check.id === 'init-baseline' && check.status === 'pass'));

  rmSync(join(clone, '.tiller/local/init-baseline-merged.json'), { force: true });
  const id = '20261028-fresh-clone-start';
  const started = success(await cliAt(clone, environment, 'start', id, '--title', 'Fresh clone start',
    '--requirement', 'A squash-merged init can start after restoring the local expected head.',
    '--criterion', 'AC-1=Start requires the recorded expected head', '--size', 'small', '--target', '.'));
  assert.ok(existsSync(join(clone, started.worktreeRoot)));
  assert.ok(mock.state.requests.some(item => item.method === 'GET' && item.search.includes('state=all')));
});

test('CASE-327 status overlays current merged init proof without rewriting tracked metadata', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  okGit(root, 'merge', '--quiet', '--no-edit', baseline.branch);
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, undefined);

  const status = success(await cliAt(root, emptyTokens, 'status'));
  assert.equal(status.initBaselineStatus.id, baseline.id);
  assert.equal(status.initBaselineStatus.status, 'merged');
  assert.equal(status.initBaselineStatus.trackedStatus, undefined);
  assert.match(status.initBaselineStatus.detail, /已合入|当前历史/u);
  assert.equal(status.metadata.initBaseline.status, undefined);
  assert.equal(status.metadata.initBaseline.headRef, undefined);
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, undefined);
});

test('CASE-329 init uses tip SHA and platform proof without tags or headRef', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, environment, result, mock } = initialized;
  const data = success(result);
  const baseline = data.initBaseline;
  assert.equal(okGit(root, 'tag', '--list', 'tiller-init/*'), '');
  assert.deepEqual([...mock.state.refs.keys()].filter(ref => ref.startsWith('refs/tags/')), []);
  assert.equal(baseline.headRef, undefined);
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.head, undefined);

  mock.setMergedHeads(baseline.branch, [baseline.head]);
  mock.resetRequests();
  okGit(root, 'checkout', baseline.head, '--', '.');
  okGit(root, 'add', '-A');
  okGit(root, 'commit', '--quiet', '-m', 'chore(tiller): squash 初始化基线');
  okGit(root, 'worktree', 'remove', '--force', join(root, baseline.worktree));
  okGit(root, 'branch', '-D', baseline.branch);
  mock.state.refs.delete(`refs/heads/${baseline.branch}`);
  assert.ok(existsSync(join(root, '.tiller/local', baseline.id, 'baseline.json')));

  const status = success(await cliAt(root, environment, 'status'));
  assert.equal(status.initBaselineStatus.status, 'merged');
  assert.match(status.initBaselineStatus.detail, /平台确认合入/u);
  const doctor = success(await cliAt(root, environment, 'doctor'));
  assert.equal(doctor.ready, true, doctor.issues.join('\n'));
  const started = success(await cliAt(root, environment, 'start', '20261028-tip-proof',
    '--title', 'Tip proof', '--requirement', 'Tip SHA and platform proof do not need tags.',
    '--criterion', 'AC-1=Start succeeds after branch deletion', '--size', 'small', '--target', '.'));
  assert.equal(started.id, '20261028-tip-proof');
  assert.ok(mock.state.requests.some(item => item.method === 'GET'
    && item.search.includes(`head=owner%3A${encodeURIComponent(baseline.branch)}`)));
  assert.equal(okGit(root, 'tag', '--list', 'tiller-init/*'), '');

  const closed = success(await cliAt(root, environment, 'close', baseline.id, '--reason', '初始化基线已合入'));
  assert.equal(closed.stage, '已关闭');
  assert.equal(existsSync(join(root, '.tiller/local', baseline.id)), false);
});

test('CASE-330 init and status expose effective state while stripping legacy tracked fields', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, result } = initialized;
  const data = success(result);
  const baseline = data.initBaseline;
  assert.deepEqual(Object.keys(data.initBaselineStatus).sort(), ['branch', 'detail', 'id', 'status']);
  assert.equal(data.initBaselineStatus.status, 'pending');
  assert.equal(data.initBaselineStatus.trackedStatus, undefined);
  const initialMetadata = JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json'));
  assert.deepEqual(initialMetadata.initBaseline, {
    id: baseline.id, branch: baseline.branch, commit: baseline.commit,
  });

  okGit(root, 'merge', '--quiet', '--no-edit', baseline.branch);
  const trackedPath = '.tiller/project.json';
  const legacy = JSON.parse(read(root, trackedPath));
  legacy.initBaseline.status = 'pending';
  legacy.initBaseline.headRef = `refs/tags/tiller-init/${baseline.id}`;
  const legacyText = `${JSON.stringify(legacy, null, 2)}\n`;
  put(root, trackedPath, legacyText);
  const status = success(await cliAt(root, emptyTokens, 'status'));
  assert.equal(status.initBaselineStatus.status, 'merged');
  assert.equal(status.initBaselineStatus.trackedStatus, undefined);
  assert.deepEqual(Object.keys(status.initBaselineStatus).sort(), ['branch', 'detail', 'id', 'status']);
  assert.deepEqual(status.metadata.initBaseline, {
    id: baseline.id, branch: baseline.branch, commit: baseline.commit,
  });
  assert.equal(read(root, trackedPath), legacyText, 'reading status must not rewrite tracked legacy fields');
  const doctor = success(await cliAt(root, emptyTokens, 'doctor'));
  assert.equal(doctor.ready, true, doctor.issues.join('\n'));
});

test('CASE-331 CASE-333 same-day reinitialization records the new expected head and discards old proof', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, environment, result, mock } = initialized;
  const first = success(result).initBaseline;
  const oldHead = first.head;
  const firstLocal = JSON.parse(read(root, `.tiller/local/${first.id}/baseline.json`));
  assert.equal(firstLocal.head, oldHead);
  assert.equal(firstLocal.prUrl, first.prUrl);
  assert.equal(firstLocal.prNumber, 1);
  okGit(root, 'tag', `tiller-init/${first.id}`, oldHead);
  okGit(root, 'worktree', 'remove', '--force', join(root, first.worktree));
  okGit(root, 'branch', '-D', first.branch);
  okGit(root, '--git-dir', mock.gitRepo, 'update-ref', '-d', `refs/heads/${first.branch}`);
  mock.state.refs.delete(`refs/heads/${first.branch}`);
  rmSync(join(root, '.tiller/local', first.id), { recursive: true, force: true });
  put(root, '.tiller/local/init-baseline-merged.json', `${JSON.stringify({
    id: first.id, status: 'merged', at: '2026-10-28T00:00:00.000Z', commit: first.commit, branch: first.branch, head: oldHead,
  }, null, 2)}\n`);
  mock.resetRequests();

  const second = success(await cliAt(root, environment, 'init', '--platform', 'github'));
  assert.equal(second.initBaseline.id, first.id);
  assert.notEqual(second.initBaseline.head, oldHead);
  assert.equal(second.initBaselineStatus.status, 'pending', 'a marker for the previous same-day baseline is stale');
  const secondLocal = JSON.parse(read(root, `.tiller/local/${second.initBaseline.id}/baseline.json`));
  assert.equal(secondLocal.head, second.initBaseline.head);
  assert.notEqual(secondLocal.head, oldHead);
  assert.equal(secondLocal.prUrl, second.initBaseline.prUrl);
  assert.equal(secondLocal.prNumber, 1);
  assert.equal(existsSync(join(root, '.tiller/local/init-baseline-merged.json')), false,
    're-init must discard the previous merged marker');
  assert.equal(okGit(root, 'rev-parse', `refs/tags/tiller-init/${first.id}`), oldHead);
  assert.deepEqual([...mock.state.refs.keys()].filter(ref => ref.startsWith('refs/tags/')), []);
  assert.doesNotMatch(JSON.stringify(second), /tag.*(?:冲突|failed)|matches more than one/iu);
  assert.deepEqual(Object.keys(JSON.parse(read(join(root, second.initBaseline.worktree), '.tiller/project.json')).initBaseline).sort(),
    ['branch', 'commit', 'id']);
});

test('CASE-332 historical merged PR with the same branch and init id cannot prove a new head before merge', async t => {
  const initialized = await initialize(t, { platform: 'github' });
  if (!initialized) return;
  const { root, environment, result, mock } = initialized;
  const first = success(result).initBaseline;
  mock.setMergedHeads(first.branch, [first.head]);

  okGit(root, 'worktree', 'remove', '--force', join(root, first.worktree));
  okGit(root, 'branch', '-D', first.branch);
  okGit(root, '--git-dir', mock.gitRepo, 'update-ref', '-d', `refs/heads/${first.branch}`);
  mock.state.refs.delete(`refs/heads/${first.branch}`);
  rmSync(join(root, '.tiller/local', first.id), { recursive: true, force: true });
  mock.resetRequests();

  const second = success(await cliAt(root, environment, 'init', '--platform', 'github'));
  const baseline = second.initBaseline;
  assert.equal(baseline.id, first.id);
  assert.notEqual(baseline.head, first.head);
  assert.equal(second.initBaselineStatus.status, 'pending', 'the historical merged head must not prove the new head');
  assert.match(second.initBaselineStatus.detail, /平台未找到|expected head/u);
  assert.equal(existsSync(join(root, '.tiller/local/init-baseline-merged.json')), false);
  assert.ok(mock.state.requests.some(item => item.method === 'GET' && item.search.includes('state=all')),
    'init must query merged PRs by the new expected head');

  const status = failure(await cliAt(root, environment, 'status'));
  assert.equal(status.initBaselineStatus.status, 'pending');
  const doctor = failure(await cliAt(root, environment, 'doctor'));
  assert.ok(doctor.checks.some(check => check.id === 'init-baseline' && check.status === 'fail'));
  const common = ['--title', 'Blocked by stale init proof', '--requirement', 'A historical merged PR must not unlock a new init.',
    '--criterion', 'AC-1=Start stays blocked', '--size', 'small', '--target', '.'];
  const started = failure(await cliAt(root, environment, 'start', '20261028-stale-init-proof', ...common));
  assert.equal(started.error.code, 'INIT_BASELINE_PENDING');

  const closed = failure(await cliAt(root, environment, 'close', baseline.id, '--reason', '尚未合入'));
  assert.equal(closed.error.code, 'INIT_BASELINE_PENDING');
  assert.ok(existsSync(join(root, baseline.worktree)), 'failed close keeps the init worktree');
  assert.ok(existsSync(join(root, `.tiller/local/${baseline.id}/baseline.json`)), 'failed close keeps local proof');
  assert.equal(git(root, 'show-ref', '--verify', '--quiet', `refs/heads/${baseline.branch}`).status, 0,
    'failed close keeps the local init branch');
  assert.equal(mock.state.refs.has(`refs/heads/${baseline.branch}`), true,
    'failed close keeps the remote init branch');
  assert.ok((mock.state.openIntegrations.get(baseline.branch) ?? []).some(item => item.sha === baseline.head),
    'failed close keeps the open init PR');
  assert.equal(existsSync(join(root, '.tiller/local/init-baseline-merged.json')), false,
    'a rejected close must not write a merged marker');
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
  assert.equal(JSON.parse(read(root, worktreeMeta)).initBaseline.status, undefined);
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
  assert.equal(JSON.parse(read(join(root, baseline.worktree), '.tiller/project.json')).initBaseline.status, undefined);
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);
  assert.equal(existsSync(join(root, '.tiller/task/20261026-init-query-failure/task.md')), false);
  assert.equal(baseline.status, undefined);
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
  okGit(root, 'merge', '--quiet', '--no-edit', baseline.branch);

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
    id: baselinePending.id, status: 'merged', at: '2026-10-27T00:00:00.000Z', commit: baselinePending.commit,
    branch: baselinePending.branch, head: baselinePending.head,
  }, null, 2)}\n`);
  success(await cliAt(statusRoot, {}, 'start', '20261026-init-status-merged', ...common));
  assert.equal(baselinePending.status, undefined);
  assert.equal(JSON.parse(read(join(statusRoot, baselinePending.worktree), '.tiller/project.json')).initBaseline.status, undefined);
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
  for (const id of ['CASE-228', 'CASE-229', 'CASE-230', 'CASE-231', 'CASE-232', 'CASE-233', 'CASE-247', 'CASE-248',
    'CASE-329', 'CASE-330', 'CASE-331']) {
    assert.match(source, new RegExp(`test\\('[^'\\n]*${id}\\b`, 'u'));
  }
});
