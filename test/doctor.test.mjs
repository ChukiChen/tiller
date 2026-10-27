import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { cli, failure, fixture, put, success } from './helpers.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function project(t) {
  const root = fixture(t);
  success(cli(root, 'init'));
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'chore(workflow): 建立 doctor 基线');
  const relative = '.tiller/project.json';
  const metadata = JSON.parse(readFileSync(join(root, relative), 'utf8'));
  if (metadata.initBaseline) {
    delete metadata.initBaseline;
    put(root, relative, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  // Worktree-only init keeps pending baseline under .tiller/local/; clear it when the
  // fixture wants a stock project without an init gate.
  rmSync(join(root, '.tiller/local'), { recursive: true, force: true });
  return root;
}

test('CASE-281 doctor 过程卫生扫描与退出码', async t => {
  const root = project(t);
  const branch = git(root, 'branch', '--show-current');
  const clean = success(cli(root, 'doctor'));
  assert.equal(clean.ready, true, clean.issues.join('\n'));
  assert.equal(clean.branch, branch);
  assert.ok(clean.checks.some(check => check.id === 'init-baseline' && check.status === 'pass'));

  const relativeMetadata = '.tiller/project.json';
  const metadata = JSON.parse(readFileSync(join(root, relativeMetadata), 'utf8'));
  put(root, relativeMetadata, `${JSON.stringify({
    ...metadata,
    initBaseline: {
      id: '20261027-tiller-init', branch: 'chore/tiller-init', commit: 'a'.repeat(40), status: 'pending',
    },
  }, null, 2)}\n`);
  const pending = failure(cli(root, 'doctor'));
  assert.equal(pending.ready, false);
  assert.ok(pending.issues.some(issue => issue.includes('初始化基线')));

  delete metadata.initBaseline;
  put(root, relativeMetadata, `${JSON.stringify(metadata, null, 2)}\n`);
  const dirtyPath = '.tiller/specs/modules/workflow/doctor-dirty.md';
  put(root, dirtyPath, '# dirty\n');
  const dirty = failure(cli(root, 'doctor'));
  assert.ok(dirty.checks.find(check => check.id === 'default-specs')?.paths?.includes(dirtyPath), JSON.stringify(dirty));
  rmSync(join(root, dirtyPath));

  const residual = 'feat/20261027-doctor-residual';
  git(root, 'branch', residual);
  const branches = failure(cli(root, 'doctor'));
  assert.ok(branches.checks.find(check => check.id === 'task-branches')?.branches?.includes(residual), JSON.stringify(branches));
  git(root, 'branch', '-D', residual);

  const restored = success(cli(root, 'doctor'));
  assert.equal(restored.ready, true, restored.issues.join('\n'));
  assert.equal(restored.summary.fail, 0);
});

test('CASE-315 doctor checks tasks that exist only in an active worktree', async t => {
  const root = project(t);
  const id = '20261027-doctor-worktree-truth';
  const started = success(cli(root, 'start', id, '--title', 'Doctor worktree truth',
    '--requirement', 'Doctor inspects the active worktree task record.',
    '--criterion', 'AC-1=The worktree task coverage is visible', '--size', 'small', '--target', '.'));
  const worktree = join(root, started.worktreeRoot);
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);

  const report = success(cli(root, 'doctor'));
  const coverage = report.checks.find(check => check.id === `ac-coverage:${id}`);
  assert.ok(coverage, JSON.stringify(report));
  assert.equal(coverage.status, 'warn');
  assert.match(coverage.message, /AC-1/u);

  rmSync(join(worktree, `.tiller/task/${id}`), { recursive: true, force: true });
  const missing = failure(cli(root, 'doctor'));
  assert.equal(missing.ready, false);
  assert.ok(missing.issues.some(issue => issue.includes(started.worktrees[0].branch)), JSON.stringify(missing));
});
