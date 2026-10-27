import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readTask } from '../dist/flow.js';
import { resolveTaskCheckout } from '../dist/project-root.js';
import {  cli, confirmTask, fixture, put, success, taskRecordRoot, read } from './helpers.mjs';

const taskPath = id => `.tiller/task/${id}/task.md`;

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
  put(root, 'src/worktree-fixture.ts', 'export const worktreeFixture = true;\n');
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Worktree truth\n\nTask records follow the active checkout.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nResolve one task root per command.\n');
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

function startTask(root, id) {
  return success(cli(root, 'start', id, '--title', `Task ${id}`, '--requirement', 'Keep task records in the active worktree.',
    '--criterion', 'AC-1=Task commands use the active worktree record', '--size', 'small', '--target', '.'));
}

test('CASE-302 CASE-293 CASE-295 start leaves no primary seed; worktree root commands stay local', async t => {
  const root = project(t);
  const id = '20261027-worktree-command-root';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  assert.equal(existsSync(join(root, taskPath(id))), false, 'primary must not keep a task seed');
  assert.equal(existsSync(join(worktree, taskPath(id))), true);

  const added = success(cli(worktree, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'Worktree root command record', '--expected', 'The worktree record is used.'));
  assert.equal(added.path, '.tiller/cases/modules/workflow/behavior.md');
  assert.ok(existsSync(join(worktree, added.path)));
  assert.equal(existsSync(join(root, added.path)), false);

  success(confirmTask(worktree, id, 'requirements'));
  const testName = `${added.id} worktree command record`;
  put(worktree, 'test/worktree-command.test.mjs', `import test from 'node:test';\n\ntest('${testName}', () => {});\n`);
  git(worktree, 'add', '-A');
  git(worktree, 'commit', '--quiet', '-m', 'test(workflow): worktree command record');
  success(cli(worktree, 'verify', id, '--criterion', 'AC-1', '--case', added.id));
  const checked = success(cli(worktree, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));

  const worktreeTask = read(worktree, taskPath(id));
  assert.match(worktreeTask, /tiller-confirm:v1/u);
  assert.match(worktreeTask, /tiller-verify:v1/u);
  assert.equal(existsSync(join(root, taskPath(id))), false);
});

test('CASE-294 dual task records resolve to cwd worktree and explicit primary stays selectable', async t => {
  const root = project(t);
  const id = '20261027-dual-task-records';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  const worktreeRecord = read(worktree, taskPath(id)).replace(/^# .+$/mu, '# WORKTREE TASK RECORD');
  const primaryRecord = worktreeRecord.replace('WORKTREE TASK RECORD', 'PRIMARY TASK RECORD');
  put(root, taskPath(id), primaryRecord);
  put(worktree, taskPath(id), worktreeRecord);

  const selected = await resolveTaskCheckout(worktree, id);
  assert.equal(realpathSync(selected.primary), realpathSync(root));
  assert.equal(realpathSync(selected.taskRoot), realpathSync(worktree));
  assert.equal((await readTask(selected.taskRoot, id)).title, 'WORKTREE TASK RECORD');

  const primary = await resolveTaskCheckout(root, id);
  assert.equal(realpathSync(primary.taskRoot), realpathSync(root));
  assert.equal((await readTask(primary.taskRoot, id)).title, 'PRIMARY TASK RECORD');

  rmSync(join(taskRecordRoot(worktree, id), `.tiller/task/${id}`), { recursive: true, force: true });
  const missing = await resolveTaskCheckout(worktree, id);
  assert.equal(realpathSync(missing.taskRoot), realpathSync(worktree));
  await assert.rejects(readTask(missing.taskRoot, id), error => error?.code === 'TASK_NOT_FOUND');
});

test('CASE-297 task-root resolution has one entry used by task commands', () => {
  const source = relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  const body = (text, name) => {
    const start = text.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} is exported`);
    const rest = text.slice(start + 1);
    const end = rest.search(/\nexport (?:async )?function /u);
    return end < 0 ? rest : rest.slice(0, end);
  };

  const flow = source('src/flow.ts');
  for (const name of ['attachFlowTask', 'resumeFlow', 'confirmFlow', 'taskStage', 'inspectFlow', 'checkFlow',
    'verifyFlow', 'acceptFlow', 'reviewFlow', 'releaseFlow', 'closeFlow', 'reopenFlow']) {
    assert.match(body(flow, name), /resolveTaskCheckout/u, name);
  }
  assert.match(body(source('src/cases.ts'), 'addGlobalCase'), /resolveTaskCheckout/u);
  assert.match(body(source('src/pr.ts'), 'draftPullRequest'), /resolveTaskCheckout/u);
  assert.equal((flow.match(/const root = path\.resolve\(rootInput\);/gu) ?? []).length, 1,
    'only start should resolve its creation path directly');
  assert.match(flow, /const root = path\.resolve\(rootInput\); validateTaskId\(idInput\);/u);
});

test('CASE-303 confirm and accept auto-commit task records', async t => {
  const root = project(t);
  const id = '20261027-confirm-autocommit';
  const started = startTask(root, id);
  const worktree = join(root, started.worktreeRoot);
  const confirmed = success(confirmTask(worktree, id, 'requirements', '--by', 'Tiller Test'));
  assert.ok(confirmed.recordsCommit || !confirmed.warnings?.length, confirmed.warnings);
  const status = git(worktree, 'status', '--porcelain', '--', `.tiller/task/${id}`);
  assert.equal(status, '');
  const log = git(worktree, 'log', '-1', '--pretty=%s');
  assert.match(log, /chore: 需求确认/u);

  const added = success(cli(worktree, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'Auto commit acceptance', '--expected', 'Accept commits task records.'));
  const testName = `${added.id} auto commit acceptance`;
  put(worktree, 'test/auto-commit.test.mjs', `import test from 'node:test';\n\ntest('${testName}', () => {});\n`);
  git(worktree, 'add', '-A');
  git(worktree, 'commit', '--quiet', '-m', 'test(workflow): auto commit acceptance');
  success(cli(worktree, 'verify', id, '--criterion', 'AC-1', '--case', added.id));
  success(cli(worktree, 'check', id));
  const accepted = success(cli(worktree, 'accept', id, '--by', 'Tiller Test'));
  assert.ok(accepted.recordsCommit || !accepted.warnings?.length, accepted.warnings);
  assert.equal(git(worktree, 'status', '--porcelain', '--', `.tiller/task/${id}`), '');
  assert.match(git(worktree, 'log', '-1', '--pretty=%s'), /chore: 验收确认/u);
});
