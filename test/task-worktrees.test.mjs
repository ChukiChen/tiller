import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { cleanupTaskWorktrees } from '../dist/task-worktrees.js';
import { cli, cliPath, confirmTask, failure, fixture, put, spawnCaptured, success, taskRecordRoot} from './helpers.mjs';
import { startPlatformMock } from './platform-api-mock.mjs';

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

function branchExists(root, branch) {
  return spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  }).status === 0;
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

function acceptTask(primaryOrWorktree, id) {
  const primary = primaryOrWorktree.includes(`${sep}.tiller${sep}local${sep}`)
    ? primaryOrWorktree.slice(0, primaryOrWorktree.indexOf(`${sep}.tiller${sep}local${sep}`))
    : primaryOrWorktree;
  const worktree = join(primary, worktreePath(id));
  put(worktree, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Worktrees\n\nTask worktrees follow the lifecycle.\n');
  put(worktree, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nUse task-scoped worktrees and logs.\n');
  put(worktree, 'src/worktree-fixture.ts', 'export const worktreeFixture = true;\n');
  const added = success(cli(worktree, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', `${id} worktree cleanup`, '--expected', 'The task can be accepted and closed.'));
  const testFile = `test/${id}.test.mjs`;
  put(worktree, testFile, [
    "import test from 'node:test';",
    '',
    `test('${added.id} accepted task fixture', () => {});`,
    '',
  ].join('\n'));
  commit(worktree, `test: accept ${id}`);
  success(confirmTask(worktree, id, 'requirements'));
  success(cli(worktree, 'verify', id, '--criterion', 'AC-1', '--test', `${testFile}::${added.id} accepted task fixture`));
  success(cli(worktree, 'accept', id, '--by', 'Tiller Test'));
}

async function cliWithEnv(root, environment, ...args) {
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

function worktreePath(id, relative = '') {
  return taskLocalPath(id, ['worktrees', relative].filter(Boolean).join('/'));
}

function taskLocalPath(id, relative = '') {
  return ['.tiller/local', id, relative].filter(Boolean).join('/');
}

function legacyWorktreePath(id, relative = '') {
  return ['.tiller/local/worktrees', id, relative].filter(Boolean).join('/');
}

function legacyLogPath(id, relative = '') {
  return ['.tiller/local/logs', id, relative].filter(Boolean).join('/');
}

function legacySidecarPath(id, relative = '') {
  return ['.tiller/local/tasks', id, relative].filter(Boolean).join('/');
}

test('CASE-196 CASE-209 CASE-287 project start creates a task-local worktree, sidecars and logs in one directory', async t => {
  const root = project(t);
  const id = '20261024-project-worktree';
  put(root, 'docs/pre-start.md', 'before the task\n');
  const started = startTask(root, id, ['--type', 'bugfix', '--slug', 'Fix Exit']);
  const relative = worktreePath(id);
  assert.equal(started.worktreeRoot, relative);
  assert.deepEqual(started.worktrees, [{ repository: 'management', path: relative, branch: `fix/${id}-fix-exit` }]);
  assert.ok(existsSync(join(root, relative)));
  assert.equal(git(join(root, relative), 'branch', '--show-current'), `fix/${id}-fix-exit`);
  assert.match(git(root, 'worktree', 'list', '--porcelain'), new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);
  assert.match(readFileSync(join(root, relative, `.tiller/task/${id}/task.md`), 'utf8'), new RegExp(id, 'u'));
  const state = JSON.parse(readFileSync(join(root, taskLocalPath(id, 'worktrees.json')), 'utf8'));
  assert.equal(state.root, relative);
  assert.deepEqual(state.worktrees.map(item => item.path), [relative]);
  assert.ok(existsSync(join(root, taskLocalPath(id, 'pre-existing.json'))));
  put(root, taskLocalPath(id, 'logs/run-1.log'), 'task log\n');
  assert.ok(existsSync(join(root, taskLocalPath(id, 'logs/run-1.log'))));
  assert.equal(existsSync(join(root, legacyWorktreePath(id))), false);
  assert.equal(existsSync(join(root, legacySidecarPath(id))), false);
  assert.equal(existsSync(join(root, legacyLogPath(id))), false);
});

test('CASE-197 CASE-210 CASE-287 workspace start keeps management and registered repositories under the task worktree root', async t => {
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
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);
  assert.ok(existsSync(join(root, worktreePath(id, 'management'), `.tiller/task/${id}/task.md`)));
  assert.ok(existsSync(join(root, worktreePath(id, 'management'), '.tiller/project.json')));
  const state = JSON.parse(readFileSync(join(root, taskLocalPath(id, 'worktrees.json')), 'utf8'));
  assert.equal(state.root, worktreePath(id));
  assert.deepEqual(state.worktrees.map(item => item.path).sort(), started.worktrees.map(item => item.path).sort());
  assert.equal(existsSync(join(root, legacyWorktreePath(id, 'management'))), false);
  assert.equal(existsSync(join(root, legacySidecarPath(id))), false);
  assert.equal(existsSync(join(root, legacyLogPath(id))), false);
});

test('CASE-208 worktree branch and path use the task id once when slug is already its suffix', async t => {
  const root = project(t);
  const id = '20261024-slim-verify-render';
  const started = startTask(root, id, ['--type', 'feature', '--slug', 'slim-verify-render']);
  assert.equal(started.worktreeRoot, worktreePath(id));
  assert.deepEqual(started.worktrees.map(item => item.path), [worktreePath(id)]);
  assert.deepEqual(started.worktrees.map(item => item.branch), [`feat/${id}`]);
  assert.equal(git(join(root, worktreePath(id)), 'branch', '--show-current'), `feat/${id}`);
});

test('CASE-198 CASE-211 close and abandon remove the whole task-local directory and preserve other tasks', async t => {
  const root = project(t);
  const acceptedId = '20261024-close-worktree';
  const abandonedId = '20261024-abandon-worktree';
  const bystanderId = '20261024-open-worktree';
  startTask(root, acceptedId);
  startTask(root, abandonedId);
  put(root, worktreePath(acceptedId, 'dirty.txt'), 'uncommitted\n');
  put(root, taskLocalPath(acceptedId, 'logs/run-1.log'), 'accepted log\n');
  put(root, taskLocalPath(abandonedId, 'logs/run-1.log'), 'abandoned log\n');
  put(root, taskLocalPath(bystanderId, 'logs/run-1.log'), 'bystander log\n');
  acceptTask(root, acceptedId);
  assert.match(readFileSync(join(root, worktreePath(acceptedId), `.tiller/task/${acceptedId}/task.md`), 'utf8'), /"gate":"acceptance"/u);
  put(root, `.tiller/task/${acceptedId}/task.md`, readFileSync(join(taskRecordRoot(root, acceptedId), `.tiller/task/${acceptedId}/task.md`), 'utf8'));
  assert.match(readFileSync(join(root, `.tiller/task/${acceptedId}/task.md`), 'utf8'), /"gate":"acceptance"/u);
  put(root, `.tiller/task/${abandonedId}/task.md`, readFileSync(join(taskRecordRoot(root, abandonedId), `.tiller/task/${abandonedId}/task.md`), 'utf8'));
  commit(root, 'chore(workflow): 持久化收尾任务记录');

  const closed = success(cli(root, 'close', acceptedId, '--reason', '交付完成'));
  assert.deepEqual(closed.worktrees, [worktreePath(acceptedId)]);
  assert.equal(closed.logsRemoved, true);
  assert.equal(existsSync(join(root, taskLocalPath(acceptedId))), false);
  assert.ok(existsSync(join(root, taskLocalPath(abandonedId, 'worktrees'))));
  assert.equal(existsSync(join(root, taskLocalPath(abandonedId, 'logs/run-1.log'))), true);
  assert.equal(existsSync(join(root, taskLocalPath(bystanderId, 'logs/run-1.log'))), true);

  const abandoned = success(cli(root, 'close', abandonedId, '--reason', '需求取消', '--abandon'));
  assert.deepEqual(abandoned.worktrees, [worktreePath(abandonedId)]);
  assert.equal(abandoned.logsRemoved, true);
  assert.equal(existsSync(join(root, taskLocalPath(abandonedId))), false);
  assert.equal(existsSync(join(root, taskLocalPath(bystanderId, 'logs/run-1.log'))), true);
});

test('CASE-280 worktree 根 close 可删本地任务分支', async t => {
  const root = project(t);
  const id = '20261027-worktree-root-close';
  const started = startTask(root, id);
  const branch = started.worktrees[0].branch;
  const worktree = join(root, started.worktreeRoot);
  acceptTask(worktree, id);
  // Simulate merge: the accepted record is tracked on primary before local cleanup.
  put(root, `.tiller/task/${id}/task.md`, readFileSync(join(worktree, `.tiller/task/${id}/task.md`), 'utf8'));
  put(root, '.tiller/cases/modules/workflow/behavior.md',
    readFileSync(join(worktree, '.tiller/cases/modules/workflow/behavior.md'), 'utf8'));
  put(root, `test/${id}.test.mjs`, readFileSync(join(worktree, `test/${id}.test.mjs`), 'utf8'));
  put(root, '.tiller/specs/modules/workflow/requirements.md',
    readFileSync(join(worktree, '.tiller/specs/modules/workflow/requirements.md'), 'utf8'));
  put(root, '.tiller/specs/modules/workflow/design.md',
    readFileSync(join(worktree, '.tiller/specs/modules/workflow/design.md'), 'utf8'));
  commit(root, 'chore(workflow): 模拟合入关闭任务记录');
  const mock = await startPlatformMock(t, { platform: 'github' });
  mock.setMode('branch-delete-missing');
  git(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  const environment = { GITHUB_TOKEN: 'mock-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' };
  assert.ok(branchExists(root, branch));

  const closed = success(await cliWithEnv(worktree, environment, 'close', id, '--reason', '从任务 worktree 收尾'));
  assert.deepEqual(closed.worktrees, [started.worktreeRoot]);
  assert.equal(existsSync(worktree), false);
  assert.equal(branchExists(root, branch), false);
  assert.ok(mock.state.requests.some(item => item.method === 'DELETE' && item.path.includes(branch)));
  assert.ok(!closed.warnings?.some(warning => warning.includes('远端分支')), closed.warnings?.join('\n'));

  const repeated = success(await cliWithEnv(root, environment, 'close', id, '--reason', '重复收尾'));
  assert.equal(existsSync(join(root, `.tiller/local/${id}`)), false);
  assert.equal(branchExists(root, branch), false);
  assert.ok(!repeated.warnings?.some(warning => warning.includes('远端分支')), repeated.warnings?.join('\n'));
  assert.equal(repeated.stage, '已验收');
});

test('CASE-280 worktree 根 close 可读取仅存在于 worktree 的任务记录', async t => {
  const root = project(t);
  const id = '20261027-worktree-only-record-close';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);
  assert.ok(existsSync(join(taskRecordRoot(worktree, id), `.tiller/task/${id}/task.md`)));

  acceptTask(root, id);
  const refused = failure(cli(worktree, 'close', id, '--reason', '从仅含任务记录的 worktree 收尾'));
  assert.equal(refused.error.code, 'CLOSE_MERGE_PROOF_MISSING');
  assert.ok(existsSync(worktree));
  assert.ok(branchExists(root, started.worktrees[0].branch));

  put(root, `.tiller/task/${id}/task.md`, readFileSync(join(taskRecordRoot(worktree, id), `.tiller/task/${id}/task.md`), 'utf8'));
  commit(root, 'chore(workflow): 模拟合入任务记录');
  const closed = success(cli(worktree, 'close', id, '--reason', '从仅含任务记录的 worktree 收尾'));
  assert.deepEqual(closed.worktrees, [started.worktreeRoot]);
  assert.equal(existsSync(worktree), false);
  assert.equal(branchExists(root, started.worktrees[0].branch), false);
});

test('CASE-283 CASE-309 合入后 close 不改共享 task.md、无 closed 标记且重复 close 安全', async t => {
  const root = project(t);
  const id = '20261027-repeat-close';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  acceptTask(root, id);
  // Simulate merge: task record + cases land on primary from the task branch.
  const shared = readFileSync(join(worktree, `.tiller/task/${id}/task.md`), 'utf8');
  put(root, `.tiller/task/${id}/task.md`, shared);
  put(root, '.tiller/cases/modules/workflow/behavior.md',
    readFileSync(join(worktree, '.tiller/cases/modules/workflow/behavior.md'), 'utf8'));
  put(root, `test/${id}.test.mjs`, readFileSync(join(worktree, `test/${id}.test.mjs`), 'utf8'));
  put(root, '.tiller/specs/modules/workflow/requirements.md',
    readFileSync(join(worktree, '.tiller/specs/modules/workflow/requirements.md'), 'utf8'));
  put(root, '.tiller/specs/modules/workflow/design.md',
    readFileSync(join(worktree, '.tiller/specs/modules/workflow/design.md'), 'utf8'));
  commit(root, 'chore(workflow): 固化交付验收');
  const taskPath = join(root, `.tiller/task/${id}/task.md`);
  const before = readFileSync(taskPath, 'utf8');

  const first = success(cli(root, 'close', id, '--reason', '合入后收尾'));
  assert.equal(first.stage, '已验收');
  assert.equal(existsSync(join(root, started.worktreeRoot)), false);
  const second = success(cli(root, 'close', id, '--reason', '重复收尾'));
  assert.equal(second.stage, '已验收');
  assert.equal(readFileSync(taskPath, 'utf8'), before);
  assert.ok(existsSync(taskPath), 'shared task.md stays after close');
  assert.equal(existsSync(join(root, `.tiller/local/closed/${id}.json`)), false);
});

test('CASE-199 tasks without worktrees still close or abandon and clear task-local logs', async t => {
  const root = project(t);
  const closedId = '20261024-old-close-worktree';
  const abandonedId = '20261024-old-abandon-worktree';
  startTask(root, closedId);
  startTask(root, abandonedId);
  acceptTask(root, closedId);
  // Preserve accepted delivery artifacts on primary before dismantling worktrees.
  const closedWorktree = join(root, worktreePath(closedId));
  put(root, '.tiller/cases/modules/workflow/behavior.md',
    readFileSync(join(closedWorktree, '.tiller/cases/modules/workflow/behavior.md'), 'utf8'));
  put(root, `test/${closedId}.test.mjs`, readFileSync(join(closedWorktree, `test/${closedId}.test.mjs`), 'utf8'));
  put(root, '.tiller/specs/modules/workflow/requirements.md',
    readFileSync(join(closedWorktree, '.tiller/specs/modules/workflow/requirements.md'), 'utf8'));
  put(root, '.tiller/specs/modules/workflow/design.md',
    readFileSync(join(closedWorktree, '.tiller/specs/modules/workflow/design.md'), 'utf8'));
  for (const id of [closedId, abandonedId]) {
    const worktree = join(root, worktreePath(id));
    mkdirSync(join(taskRecordRoot(root, id), `.tiller/task/${id}`), { recursive: true });
    put(root, `.tiller/task/${id}/task.md`, readFileSync(join(taskRecordRoot(worktree, id), `.tiller/task/${id}/task.md`), 'utf8'));
    git(root, 'worktree', 'remove', '--force', worktree);
    git(root, 'worktree', 'prune');
    rmSync(join(root, taskLocalPath(id, 'worktrees.json')), { force: true });
    put(root, taskLocalPath(id, 'logs/run-1.log'), `${id}\n`);
  }
  commit(root, 'chore(workflow): 保留旧任务记录');

  const closed = success(cli(root, 'close', closedId, '--reason', '旧任务收尾'));
  assert.ok(closed.missingWorktrees.includes(worktreePath(closedId)));
  assert.equal(closed.logsRemoved, true);
  assert.equal(existsSync(join(root, taskLocalPath(closedId))), false);

  const abandoned = success(cli(root, 'close', abandonedId, '--reason', '旧任务放弃', '--abandon'));
  assert.ok(abandoned.missingWorktrees.includes(worktreePath(abandonedId)));
  assert.equal(abandoned.logsRemoved, true);
  assert.equal(existsSync(join(root, taskLocalPath(abandonedId))), false);
});

test('CASE-212 close cleans legacy worktrees, logs and sidecars without touching other task paths', async t => {
  const root = project(t);
  const acceptedId = '20261024-legacy-close-layout';
  const abandonedId = '20261024-legacy-abandon-layout';
  const bystanderId = '20261024-legacy-bystander';
  startTask(root, acceptedId);
  startTask(root, abandonedId);
  acceptTask(root, acceptedId);
  // Persist abandoned start seed onto primary before dismantling the worktree (no auto-commit yet).
  mkdirSync(join(taskRecordRoot(root, abandonedId), `.tiller/task/${abandonedId}`), { recursive: true });
  put(root, `.tiller/task/${abandonedId}/task.md`,
    readFileSync(join(root, worktreePath(abandonedId), `.tiller/task/${abandonedId}/task.md`), 'utf8'));
  put(root, `.tiller/task/${acceptedId}/task.md`,
    readFileSync(join(taskRecordRoot(root, acceptedId), `.tiller/task/${acceptedId}/task.md`), 'utf8'));
  for (const relative of [
    '.tiller/cases/modules/workflow/behavior.md',
    `test/${acceptedId}.test.mjs`,
    '.tiller/specs/modules/workflow/requirements.md',
    '.tiller/specs/modules/workflow/design.md',
  ]) put(root, relative, readFileSync(join(root, worktreePath(acceptedId), relative), 'utf8'));
  commit(root, 'chore(workflow): 模拟合入旧任务记录');

  const legacyPaths = (id) => {
    const current = worktreePath(id);
    const legacy = legacyWorktreePath(id);
    const branch = `feat/${id}`;
    git(root, 'worktree', 'remove', '--force', join(root, current));
    git(root, 'worktree', 'prune');
    mkdirSync(join(root, '.tiller/local/worktrees'), { recursive: true });
    git(root, 'worktree', 'add', join(root, legacy), branch);
    put(root, legacySidecarPath(id, 'worktrees.json'), `${JSON.stringify({
      schemaVersion: 1, id, branch, root: legacy,
      worktrees: [{ repository: 'management', source: '.', path: legacy, branch }],
    }, null, 2)}\n`);
    put(root, legacySidecarPath(id, 'pre-existing.json'), '{}\n');
    put(root, legacyLogPath(id, 'run-1.log'), `${id}\n`);
    rmSync(join(root, taskLocalPath(id)), { recursive: true, force: true });
    return legacy;
  };
  const acceptedLegacy = legacyPaths(acceptedId);
  const abandonedLegacy = legacyPaths(abandonedId);
  const movedStage = success(cli(root, 'resume', acceptedId));
  assert.equal(movedStage.stage, '已验收', movedStage.stageReason);
  put(root, legacyWorktreePath(bystanderId, 'sentinel.txt'), 'keep\n');
  put(root, legacySidecarPath(bystanderId, 'pre-existing.json'), '{}\n');
  put(root, legacyLogPath(bystanderId, 'run-1.log'), 'keep\n');

  const closed = success(cli(root, 'close', acceptedId, '--reason', '旧任务收尾'));
  assert.deepEqual(closed.worktrees, [acceptedLegacy]);
  assert.equal(closed.logsRemoved, true);
  for (const path of [acceptedLegacy, legacyLogPath(acceptedId), legacySidecarPath(acceptedId), taskLocalPath(acceptedId)]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
  assert.ok(existsSync(join(root, legacyWorktreePath(bystanderId, 'sentinel.txt'))));
  assert.ok(existsSync(join(root, legacySidecarPath(bystanderId, 'pre-existing.json'))));
  assert.ok(existsSync(join(root, legacyLogPath(bystanderId, 'run-1.log'))));

  const metadata = JSON.parse(readFileSync(join(root, '.tiller/project.json'), 'utf8'));
  const repeated = await cleanupTaskWorktrees(root, acceptedId, metadata);
  assert.deepEqual(repeated.removedWorktrees, []);
  assert.equal(repeated.logsRemoved, false);

  const abandoned = success(cli(root, 'close', abandonedId, '--reason', '旧任务放弃', '--abandon'));
  assert.deepEqual(abandoned.worktrees, [abandonedLegacy]);
  assert.equal(abandoned.logsRemoved, true);
  for (const path of [abandonedLegacy, legacyLogPath(abandonedId), legacySidecarPath(abandonedId), taskLocalPath(abandonedId)]) {
    assert.equal(existsSync(join(root, path)), false, path);
  }
  assert.ok(existsSync(join(root, legacyWorktreePath(bystanderId, 'sentinel.txt'))));
});

test('CASE-316 close reports no executable reopen when only platform merge evidence survives', async t => {
  const root = project(t);
  const id = '20261027-platform-proof-close';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  const branch = started.worktrees[0].branch;
  acceptTask(root, id);

  const refused = failure(cli(worktree, 'close', id, '--reason', '尚无合入证明'));
  assert.equal(refused.error.code, 'CLOSE_MERGE_PROOF_MISSING');
  assert.ok(existsSync(worktree));
  assert.ok(branchExists(root, branch));

  const mock = await startPlatformMock(t, { platform: 'github' });
  mock.setMergedHeads(branch, [git(root, 'rev-parse', branch)]);
  git(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  const environment = { GITHUB_TOKEN: 'mock-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' };
  const closed = success(await cliWithEnv(worktree, environment, 'close', id, '--reason', '平台已合入'));
  assert.deepEqual(closed.worktrees, [started.worktreeRoot]);
  assert.equal(existsSync(join(root, `.tiller/task/${id}`)), false);
  assert.doesNotMatch(closed.next, /tiller reopen/u);
  assert.ok(mock.state.requests.some(item => item.method === 'GET' && item.path.endsWith('/pulls')));
});

test('CASE-318 close rejects historical same-branch merges until the current tip matches', async t => {
  const root = project(t);
  const id = '20261027-reused-branch-proof';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  const branch = started.worktrees[0].branch;
  acceptTask(root, id);
  const currentTip = git(root, 'rev-parse', branch);

  const mock = await startPlatformMock(t, { platform: 'github' });
  mock.setMergedHeads(branch, ['2'.repeat(40), '3'.repeat(40)]);
  git(root, 'remote', 'add', 'origin', `${mock.origin}/owner/repo.git`);
  const environment = { GITHUB_TOKEN: 'mock-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' };

  const refused = failure(await cliWithEnv(worktree, environment, 'close', id, '--reason', '历史同名分支不应放行'));
  assert.equal(refused.error.code, 'CLOSE_MERGE_PROOF_MISSING');
  assert.ok(existsSync(worktree));
  assert.ok(existsSync(join(root, taskLocalPath(id))));
  assert.ok(branchExists(root, branch));

  mock.setMergedHeads(branch, ['2'.repeat(40), currentTip]);
  const closed = success(await cliWithEnv(worktree, environment, 'close', id, '--reason', '当前 tip 已合入'));
  assert.deepEqual(closed.worktrees, [started.worktreeRoot]);
  assert.equal(existsSync(worktree), false);
  assert.equal(branchExists(root, branch), false);
});

test('CASE-317 abandon refuses to erase a worktree-only task and persists when primary has a record', async t => {
  const root = project(t);
  const id = '20261027-abandon-durability';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  const branch = started.worktrees[0].branch;

  const refused = failure(cli(worktree, 'close', id, '--reason', '需求取消', '--abandon'));
  assert.equal(refused.error.code, 'ABANDON_NOT_PERSISTABLE');
  assert.doesNotMatch(refused.error.message, /tiller reopen/u);
  assert.ok(existsSync(worktree));
  assert.ok(existsSync(join(root, taskLocalPath(id))));
  assert.ok(branchExists(root, branch));

  put(root, `.tiller/task/${id}/task.md`, readFileSync(join(taskRecordRoot(worktree, id), `.tiller/task/${id}/task.md`), 'utf8'));
  commit(root, 'chore(workflow): 持久化待放弃任务记录');
  const abandoned = success(cli(worktree, 'close', id, '--reason', '需求取消', '--abandon'));
  assert.equal(abandoned.stage, '已放弃');
  assert.match(abandoned.next, /tiller reopen/u);
  assert.match(readFileSync(join(root, `.tiller/task/${id}/task.md`), 'utf8'), /^- 状态：已放弃$/mu);
  assert.equal(existsSync(worktree), false);
  const reopened = success(cli(root, 'reopen', id, '--reason', '重新评估'));
  assert.notEqual(reopened.stage, '已放弃');
});

test('CASE-200 start failures leave no task record or partially created worktree', async t => {
  const projectRoot = project(t);
  const occupiedId = '20261024-occupied-worktree';
  put(projectRoot, `${worktreePath(occupiedId)}/sentinel.txt`, 'occupied\n');
  const occupied = failure(cli(projectRoot, 'start', occupiedId, '--title', 'Occupied', '--requirement', 'Reject occupied worktree paths.',
    '--criterion', 'AC-1=Path conflict fails', '--size', 'small', '--target', '.'));
  assert.equal(occupied.error.code, 'WORKTREE_PATH_EXISTS');
  assert.equal(existsSync(join(taskRecordRoot(projectRoot, occupiedId), `.tiller/task/${occupiedId}/task.md`)), false);
  assert.equal(readFileSync(join(projectRoot, worktreePath(occupiedId, 'sentinel.txt')), 'utf8'), 'occupied\n');

  const workspaceRoot = workspace(t);
  const id = '20261024-invalid-repository-worktree';
  rmSync(join(workspaceRoot, 'repositories/service-b/.git'), { recursive: true, force: true });
  const rejected = failure(cli(workspaceRoot, 'start', id, '--title', 'Invalid repo', '--requirement', 'Reject a business path that is not Git.',
    '--criterion', 'AC-2=Every repository must be Git', '--size', 'small', '--target', '.'));
  assert.equal(rejected.error.code, 'WORKTREE_NOT_GIT_REPOSITORY');
  assert.equal(existsSync(join(taskRecordRoot(workspaceRoot, id), `.tiller/task/${id}/task.md`)), false);
  assert.equal(existsSync(join(workspaceRoot, worktreePath(id, 'management'))), false);

  const rollbackRoot = workspace(t);
  const rollbackId = '20261024-rollback-worktree';
  const branch = `feat/${rollbackId}`;
  git(join(rollbackRoot, 'repositories/service-b'), 'checkout', '--quiet', '-b', branch);
  const rolledBack = failure(cli(rollbackRoot, 'start', rollbackId, '--title', 'Rollback partial worktrees',
    '--requirement', 'Fail while creating a later repository worktree.', '--criterion', 'AC-2=No partial worktree remains',
    '--size', 'small', '--target', '.'));
  assert.equal(rolledBack.error.code, 'WORKTREE_ADD_FAILED');
  assert.equal(existsSync(join(taskRecordRoot(rollbackRoot, rollbackId), `.tiller/task/${rollbackId}/task.md`)), false);
  assert.equal(existsSync(join(rollbackRoot, worktreePath(rollbackId))), false);

  const noGitId = '20261024-no-git-worktree';
  const noGit = spawnCaptured(process.execPath, [cliPath, 'start', noGitId, '--title', 'No Git',
    '--requirement', 'Fail when Git is unavailable.', '--criterion', 'AC-1=Git is required', '--size', 'small',
    '--target', '.', '--json'], { cwd: projectRoot, env: { PATH: '' }, timeout: 20_000 });
  assert.equal(noGit.status, 1, noGit.stderr);
  assert.equal(JSON.parse(noGit.stdout).error.code, 'GIT_UNAVAILABLE');
  assert.equal(existsSync(join(taskRecordRoot(projectRoot, noGitId), `.tiller/task/${noGitId}/task.md`)), false);
  assert.equal(existsSync(join(projectRoot, worktreePath(noGitId))), false);
});
