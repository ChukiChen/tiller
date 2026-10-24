import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { cli, cliPath, confirmTask, failure, fixture, put, spawnCaptured, success } from './helpers.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commit(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', message);
}

function initializeGit(root) {
  git(root, 'init', '--quiet');
  commit(root, 'baseline');
}

function project(t) {
  const root = fixture(t);
  success(cli(root, 'init'));
  initializeGit(root);
  return root;
}

function workspace(t) {
  const root = fixture(t);
  initializeGit(root);
  for (const name of ['service-a', 'service-b']) {
    const repository = join(root, 'repositories', name);
    mkdirSync(repository, { recursive: true });
    initializeGit(repository);
  }
  success(cli(root, 'init', '--mode', 'workspace', '--repo', 'repositories/service-a', '--repo', 'repositories/service-b'));
  commit(root, 'workspace metadata');
  return root;
}

function startTask(root, id, extra = []) {
  return success(cli(root, 'start', id, '--title', `Task ${id}`, '--requirement', 'Create and clean task worktrees.',
    '--criterion', 'AC-1=Task worktree behavior is observable', '--size', 'small', '--target', '.', ...extra));
}

function acceptTask(root, id) {
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Worktrees\n\nTask worktrees follow the lifecycle.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nUse task-scoped worktrees and logs.\n');
  put(root, 'src/worktree-fixture.ts', 'export const worktreeFixture = true;\n');
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', `${id} worktree cleanup`, '--criterion', 'AC-1', '--expected', 'The task can be accepted and closed.',
    '--source', 'src/worktree-fixture.ts'));
  const testFile = `test/${id}.test.mjs`;
  put(root, testFile, [
    "import test from 'node:test';",
    '',
    `test('${added.id} accepted task fixture', () => {});`,
    '',
  ].join('\n'));
  commit(root, `test: accept ${id}`);
  success(confirmTask(root, id, 'requirements'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `${testFile}::${added.id} accepted task fixture`));
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
}

function worktreePath(id, relative = '') {
  return ['.tiller/local/worktrees', id, relative].filter(Boolean).join('/');
}

test('CASE-196 project start creates a task worktree on the task branch and returns its path', async t => {
  const root = project(t);
  const id = '20261024-project-worktree';
  const started = startTask(root, id, ['--type', 'bugfix', '--slug', 'Fix Exit']);
  const relative = worktreePath(id);
  assert.equal(started.worktreeRoot, relative);
  assert.deepEqual(started.worktrees, [{ repository: 'management', path: relative, branch: `fix/${id}-fix-exit` }]);
  assert.ok(existsSync(join(root, relative)));
  assert.equal(git(join(root, relative), 'branch', '--show-current'), `fix/${id}-fix-exit`);
  assert.match(git(root, 'worktree', 'list', '--porcelain'), new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.ok(existsSync(join(root, `.tiller/task/${id}/task.md`)));
  assert.equal(existsSync(join(root, relative, `.tiller/task/${id}/task.md`)), false);
});

test('CASE-197 workspace start mirrors management and registered repositories under one task branch', async t => {
  const root = workspace(t);
  const id = '20261024-workspace-worktree';
  const started = startTask(root, id, ['--type', 'feature', '--slug', 'workspace-layout']);
  const branch = `feat/${id}-workspace-layout`;
  assert.equal(started.worktreeRoot, worktreePath(id));
  assert.deepEqual(started.worktrees.map(item => item.path).sort(), [
    worktreePath(id, 'management'),
    worktreePath(id, 'repositories/service-a'),
    worktreePath(id, 'repositories/service-b'),
  ].sort());
  for (const relative of ['', 'repositories/service-a', 'repositories/service-b']) {
    const repository = relative || 'management';
    const target = join(root, started.worktrees.find(item => item.repository === repository).path);
    assert.equal(git(target, 'branch', '--show-current'), branch);
  }
  assert.ok(existsSync(join(root, `.tiller/task/${id}/task.md`)));
  assert.equal(existsSync(join(root, worktreePath(id, 'management'), `.tiller/task/${id}/task.md`)), false);
  assert.ok(existsSync(join(root, worktreePath(id, 'management'), '.tiller/project.json')));
});

test('CASE-198 close and abandon force-remove every task worktree and only clear that task log', async t => {
  const root = project(t);
  const acceptedId = '20261024-close-worktree';
  const abandonedId = '20261024-abandon-worktree';
  const bystanderId = '20261024-open-worktree';
  startTask(root, acceptedId);
  startTask(root, abandonedId);
  put(root, worktreePath(acceptedId, 'dirty.txt'), 'uncommitted\n');
  put(root, `.tiller/local/logs/${abandonedId}/run-1.log`, 'abandoned log\n');
  put(root, `.tiller/local/logs/${bystanderId}/run-1.log`, 'bystander log\n');
  acceptTask(root, acceptedId);

  const closed = success(cli(root, 'close', acceptedId, '--reason', '交付完成'));
  assert.deepEqual(closed.worktrees, [worktreePath(acceptedId)]);
  assert.equal(closed.logsRemoved, true);
  assert.equal(existsSync(join(root, worktreePath(acceptedId))), false);
  assert.ok(existsSync(join(root, worktreePath(abandonedId))));
  assert.equal(existsSync(join(root, `.tiller/local/logs/${acceptedId}`)), false);
  assert.equal(existsSync(join(root, `.tiller/local/logs/${abandonedId}/run-1.log`)), true);
  assert.equal(existsSync(join(root, `.tiller/local/logs/${bystanderId}/run-1.log`)), true);

  const abandoned = success(cli(root, 'close', abandonedId, '--reason', '需求取消', '--abandon'));
  assert.deepEqual(abandoned.worktrees, [worktreePath(abandonedId)]);
  assert.equal(abandoned.logsRemoved, true);
  assert.equal(existsSync(join(root, worktreePath(abandonedId))), false);
  assert.equal(existsSync(join(root, `.tiller/local/logs/${abandonedId}`)), false);
  assert.equal(existsSync(join(root, `.tiller/local/logs/${bystanderId}/run-1.log`)), true);
});

test('CASE-199 old tasks without worktrees still close or abandon and clear their logs', async t => {
  const root = project(t);
  const closedId = '20261024-old-close-worktree';
  const abandonedId = '20261024-old-abandon-worktree';
  startTask(root, closedId);
  startTask(root, abandonedId);
  acceptTask(root, closedId);
  for (const id of [closedId, abandonedId]) {
    git(root, 'worktree', 'remove', '--force', join(root, worktreePath(id)));
    git(root, 'worktree', 'prune');
    rmSync(join(root, '.tiller/local/tasks', id, 'worktrees.json'), { force: true });
    put(root, `.tiller/local/logs/${id}/run-1.log`, `${id}\n`);
  }

  const closed = success(cli(root, 'close', closedId, '--reason', '旧任务收尾'));
  assert.deepEqual(closed.missingWorktrees, [worktreePath(closedId)]);
  assert.equal(closed.logsRemoved, true);
  assert.equal(existsSync(join(root, `.tiller/local/logs/${closedId}`)), false);

  const abandoned = success(cli(root, 'close', abandonedId, '--reason', '旧任务放弃', '--abandon'));
  assert.deepEqual(abandoned.missingWorktrees, [worktreePath(abandonedId)]);
  assert.equal(abandoned.logsRemoved, true);
  assert.equal(existsSync(join(root, `.tiller/local/logs/${abandonedId}`)), false);
});

test('CASE-200 start failures leave no task record or partially created worktree', async t => {
  const projectRoot = project(t);
  const occupiedId = '20261024-occupied-worktree';
  put(projectRoot, `${worktreePath(occupiedId)}/sentinel.txt`, 'occupied\n');
  const occupied = failure(cli(projectRoot, 'start', occupiedId, '--title', 'Occupied', '--requirement', 'Reject occupied worktree paths.',
    '--criterion', 'AC-1=Path conflict fails', '--size', 'small', '--target', '.'));
  assert.equal(occupied.error.code, 'WORKTREE_PATH_EXISTS');
  assert.equal(existsSync(join(projectRoot, `.tiller/task/${occupiedId}/task.md`)), false);
  assert.equal(readFileSync(join(projectRoot, worktreePath(occupiedId, 'sentinel.txt')), 'utf8'), 'occupied\n');

  const workspaceRoot = workspace(t);
  const id = '20261024-invalid-repository-worktree';
  rmSync(join(workspaceRoot, 'repositories/service-b/.git'), { recursive: true, force: true });
  const rejected = failure(cli(workspaceRoot, 'start', id, '--title', 'Invalid repo', '--requirement', 'Reject a business path that is not Git.',
    '--criterion', 'AC-2=Every repository must be Git', '--size', 'small', '--target', '.'));
  assert.equal(rejected.error.code, 'WORKTREE_NOT_GIT_REPOSITORY');
  assert.equal(existsSync(join(workspaceRoot, `.tiller/task/${id}/task.md`)), false);
  assert.equal(existsSync(join(workspaceRoot, worktreePath(id, 'management'))), false);

  const rollbackRoot = workspace(t);
  const rollbackId = '20261024-rollback-worktree';
  const branch = `feat/${rollbackId}`;
  git(join(rollbackRoot, 'repositories/service-b'), 'checkout', '--quiet', '-b', branch);
  const rolledBack = failure(cli(rollbackRoot, 'start', rollbackId, '--title', 'Rollback partial worktrees',
    '--requirement', 'Fail while creating a later repository worktree.', '--criterion', 'AC-2=No partial worktree remains',
    '--size', 'small', '--target', '.'));
  assert.equal(rolledBack.error.code, 'WORKTREE_ADD_FAILED');
  assert.equal(existsSync(join(rollbackRoot, `.tiller/task/${rollbackId}/task.md`)), false);
  assert.equal(existsSync(join(rollbackRoot, worktreePath(rollbackId))), false);

  const noGitId = '20261024-no-git-worktree';
  const noGit = spawnCaptured(process.execPath, [cliPath, 'start', noGitId, '--title', 'No Git',
    '--requirement', 'Fail when Git is unavailable.', '--criterion', 'AC-1=Git is required', '--size', 'small',
    '--target', '.', '--json'], { cwd: projectRoot, env: { PATH: '' }, timeout: 20_000 });
  assert.equal(noGit.status, 1, noGit.stderr);
  assert.equal(JSON.parse(noGit.stdout).error.code, 'GIT_UNAVAILABLE');
  assert.equal(existsSync(join(projectRoot, `.tiller/task/${noGitId}/task.md`)), false);
  assert.equal(existsSync(join(projectRoot, worktreePath(noGitId))), false);
});
