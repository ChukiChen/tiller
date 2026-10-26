import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cliPath, fixture, put, spawnCaptured, success } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

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

function fakeGitHub(t, root, mode) {
  if (process.platform === 'win32') {
    t.skip('The fake github executable uses a POSIX shell script.');
    return null;
  }
  const directory = join(root, 'fake-bin');
  put(root, 'fake-bin/github', [
    '#!/bin/sh',
    'printf "%s|%s\\n" "$(basename "$0")" "$*" >> "${TILLER_FAKE_GITHUB_LOG:?}"',
    `[ "${mode}" = success ] && printf "https://example.invalid/tiller/pr/1\\n"`,
    `[ "${mode}" = success ] || exit 7`,
    '',
  ].join('\n'));
  chmodSync(join(directory, 'github'), 0o755);
  return directory;
}

function platformCalls(log) {
  return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const [name, ...args] = line.split('|');
    return { name, args: args.join('|') };
  });
}

function cliAt(root, environment, ...args) {
  const result = spawnCaptured(process.execPath, [cliPath, ...args, '--json'], {
    cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...environment },
  });
  assert.equal(result.signal, null, result.stderr);
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { assert.fail(`Expected JSON output: ${result.stdout}\n${result.stderr}`); }
  return { ...result, data };
}

function initializeWithGitHub(t, mode) {
  const root = fixture(t);
  configure(root);
  const directory = fakeGitHub(t, root, mode);
  if (!directory) return null;
  const log = join(root, 'github.log');
  const result = cliAt(root, {
    PATH: `${directory}:${process.env.PATH ?? ''}`,
    TILLER_FAKE_GITHUB_LOG: log,
  }, 'init');
  return { root, result, log };
}

test('CASE-228 init creates a committed initialization worktree and attempts the titled PR', async t => {
  const initialized = initializeWithGitHub(t, 'success');
  if (!initialized) return;
  const { root, result, log } = initialized;
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

  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  assert.deepEqual(metadata.initBaseline, {
    id: baseline.id, branch: baseline.branch, commit: baseline.commit, status: 'pending',
  });
  assert.deepEqual(JSON.parse(read(worktree, '.tiller/project.json')).initBaseline, metadata.initBaseline);
  assert.deepEqual(platformCalls(log), [{ name: 'github',
    args: 'pr create --head chore/tiller-init --title chore(tiller): 完成工程初始化 --body 初始化 tiller 工程结构。' }]);

  const before = okGit(root, 'rev-parse', 'HEAD');
  const merged = git(root, 'merge-base', '--is-ancestor', baseline.commit, before);
  assert.notEqual(merged.status, 0, 'initialization must not be merged automatically');
});

test('CASE-229 failed PR creation keeps the worktree and commit and returns copyable commands', async t => {
  const initialized = initializeWithGitHub(t, 'failure');
  if (!initialized) return;
  const { root, result } = initialized;
  const data = success(result);
  const baseline = data.initBaseline;
  const worktree = join(root, baseline.worktree);
  assert.equal(baseline.prUrl, undefined);
  assert.ok(existsSync(worktree));
  assert.equal(okGit(worktree, 'branch', '--show-current'), 'chore/tiller-init');
  assert.equal(okGit(worktree, 'log', '-1', '--format=%s'), 'chore(tiller): 完成工程初始化');
  assert.ok(data.warnings.some(warning => warning.includes('自动创建初始化 PR/MR 失败')), data.warnings.join('\n'));
  assert.ok(baseline.next.some(command => command.includes('git -C') && command.includes('push -u origin chore/tiller-init')));
  assert.ok(baseline.next.some(command => command.includes('github pr create') && command.includes('chore(tiller): 完成工程初始化')));
  assert.ok(existsSync(join(root, '.tiller/project.json')));
});

test('CASE-230 close init-id only clears that initialization local and preserves task locals', async t => {
  const initialized = initializeWithGitHub(t, 'failure');
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  const taskId = '20261026-keep-task-local';
  success(cliAt(root, {}, 'start', taskId, '--skip-init-gate', '--title', 'Keep task local',
    '--requirement', 'Keep an unrelated task local.', '--criterion', 'AC-1=Local stays', '--size', 'small', '--target', '.'));
  const taskLocal = join(root, '.tiller/local', taskId, 'worktrees');
  assert.ok(existsSync(taskLocal));

  const closed = success(cliAt(root, {}, 'close', baseline.id, '--reason', '初始化基线已合入'));
  assert.equal(closed.stage, '已关闭');
  assert.ok(closed.worktrees.includes(baseline.worktree));
  assert.equal(existsSync(join(root, '.tiller/local', baseline.id)), false);
  assert.ok(existsSync(taskLocal));
  assert.doesNotMatch(okGit(root, 'worktree', 'list', '--porcelain'), /20261026-tiller-init/u);
});

test('CASE-231 start blocks a pending initialization commit, supports skip and merged detection', async t => {
  const initialized = initializeWithGitHub(t, 'failure');
  if (!initialized) return;
  const { root, result } = initialized;
  const baseline = success(result).initBaseline;
  const common = ['--title', 'Gate behavior', '--requirement', 'Check initialization gate behavior.',
    '--criterion', 'AC-1=Gate is observable', '--size', 'small', '--target', '.'];

  const blocked = cliAt(root, {}, 'start', '20261026-init-gate-blocked', ...common);
  assert.equal(blocked.status, 1);
  assert.equal(blocked.data.error.code, 'INIT_BASELINE_PENDING');
  assert.equal(existsSync(join(root, '.tiller/task/20261026-init-gate-blocked/task.md')), false);

  const skipped = success(cliAt(root, {}, 'start', '20261026-init-gate-skipped', '--skip-init-gate', ...common));
  assert.ok(skipped.warnings.some(warning => warning.includes('--skip-init-gate')));

  okGit(root, 'add', '-A');
  okGit(root, 'commit', '--quiet', '-m', 'test: preserve initialized files');
  okGit(root, 'merge', '--quiet', '--no-edit', baseline.branch);
  success(cliAt(root, {}, 'start', '20261026-init-gate-merged', ...common));

  const statusRoot = fixture(t);
  configure(statusRoot);
  const directory = fakeGitHub(t, statusRoot, 'failure');
  if (!directory) return;
  const statusInit = success(cliAt(statusRoot, {
    PATH: `${directory}:${process.env.PATH ?? ''}`,
    TILLER_FAKE_GITHUB_LOG: join(statusRoot, 'github.log'),
  }, 'init'));
  const metadata = JSON.parse(read(statusRoot, '.tiller/project.json'));
  metadata.initBaseline.status = 'merged';
  put(statusRoot, '.tiller/project.json', `${JSON.stringify(metadata, null, 2)}\n`);
  success(cliAt(statusRoot, {}, 'start', '20261026-init-status-merged', ...common));
  assert.equal(statusInit.initBaseline.status, 'pending');
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
  for (const id of ['CASE-228', 'CASE-229', 'CASE-230', 'CASE-231', 'CASE-232', 'CASE-233']) {
    assert.match(source, new RegExp(`test\\('[^'\\n]*${id}\\b`, 'u'));
  }
});
