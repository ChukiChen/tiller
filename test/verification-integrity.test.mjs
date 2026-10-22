import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectTestOutput } from '../dist/test-output.js';
import { initialize } from '../dist/core.js';
import { cli, failure, fixture, put, success } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function project(t, testSource = "import test from 'node:test';\n\ntest('value behavior', () => {});\n") {
  const root = fixture(t);
  await initialize({ root });
  put(root, 'src/value.mjs', 'export const value = 1;\n');
  put(root, 'test/value.test.mjs', testSource);
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Verification\n\nEvidence must be observed.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nRun commands through verify.\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

function startSmall(root, id, target = ['src', 'test', '.tiller/cases']) {
  return success(cli(root, 'start', id, '--title', `Task ${id}`, '--requirement', 'Observe the real verification command.',
    '--criterion', 'AC-1=Evidence is observed', '--size', 'small',
    ...target.flatMap(value => ['--target', value])));
}

function addCase(root, id, testRef, name = 'value behavior') {
  return success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', name,
    '--test', testRef, '--criterion', 'AC-1', '--source', 'src/value.mjs'));
}

function commitAll(root, message) {
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', message);
}

test('verify executes the recorded command, rejects legacy inputs and reads old records', async t => {
  const root = await project(t);
  const id = '20261022-verify-single-command';
  startSmall(root, id);
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  addCase(root, id, 'test/value.test.mjs::value behavior');
  put(root, 'src/value.mjs', 'export const value = 2;\n');
  commitAll(root, 'feat(workflow): 实现验证示例');

  const split = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::value behavior',
    '--command', 'node test/value.test.mjs', '--run', 'node test/value.test.mjs'));
  assert.equal(split.error.code, 'INVALID_ARGUMENT');
  assert.match(split.error.message, /--run/u);
  assert.match(split.error.message, /--command/u);
  const contradictory = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::value behavior',
    '--run', 'node test/value.test.mjs', '--result', 'passed'));
  assert.equal(contradictory.error.code, 'INVALID_ARGUMENT');

  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::value behavior',
    '--run', 'node test/value.test.mjs'));
  assert.equal(verified.entries[0].command, 'node test/value.test.mjs');
  assert.equal(verified.entries[0].source, 'executed');
  assert.equal(verified.entries[0].evidence, 'verified');
  assert.match(read(root, `.tiller/task/${id}/task.md`), /^- 命令：node test\/value\.test\.mjs$/mu);

  const taskFile = `.tiller/task/${id}/task.md`;
  put(root, taskFile, read(root, taskFile).replace('\n- 核实：已核实', ''));
  const legacy = success(cli(root, 'check', id));
  assert.equal(legacy.ready, true, legacy.issues.join('\n'));
  assert.ok(!legacy.issues.some(issue => issue.includes('未核实')), legacy.issues.join('\n'));
});

test('reported verification is blocked by default and allowed explicitly', async t => {
  const root = await project(t);
  const id = '20261022-reported-verification';
  startSmall(root, id);
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  addCase(root, id, 'test/value.test.mjs::value behavior');
  put(root, 'src/value.mjs', 'export const value = 3;\n');
  commitAll(root, 'feat(workflow): 准备外部报告');
  const reason = 'CI 已运行同一条命令并归档结果';
  const missingReason = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::value behavior',
    '--reported', '--command', 'node test/value.test.mjs', '--result', 'passed'));
  assert.equal(missingReason.error.code, 'INVALID_ARGUMENT');
  assert.match(missingReason.error.message, /--reason/u);
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::value behavior',
    '--reported', '--command', 'node test/value.test.mjs', '--result', 'passed', '--reason', reason));
  assert.equal(verified.entries[0].source, 'reported');
  assert.equal(verified.entries[0].evidence, 'not-run');
  assert.equal(verified.entries[0].reason, reason);

  const blocked = failure(cli(root, 'check', id));
  assert.ok(blocked.issues.some(issue => issue.includes('未实际执行（外部报告）') && issue.includes(reason)), blocked.issues.join('\n'));
  const allowed = success(cli(root, 'check', id, '--allow-reported'));
  assert.equal(allowed.ready, true, allowed.issues.join('\n'));
  const draft = success(cli(root, 'pr', id));
  assert.ok(draft.body.includes(`未执行（外部报告）：${reason}`), draft.body);
  assert.equal(failure(cli(root, 'accept', id, '--by', 'Tiller Test')).error.code, 'NOT_READY');
  assert.equal(success(cli(root, 'accept', id, '--by', 'Tiller Test', '--allow-reported')).gate, 'acceptance');
});

test('named node test output is verified for TAP, spec and nested special characters', async t => {
  const nested = "import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('parent case', async t => {\n  await t.test('nested / escaped [x] # hash', () => assert.equal(1, 1));\n});\n";
  const root = await project(t, nested);
  const name = 'nested / escaped [x] # hash';
  const testRef = `test/value.test.mjs::${name}`;

  const tapId = '20261022-tap-evidence';
  startSmall(root, tapId);
  success(cli(root, 'confirm', tapId, 'requirements', '--by', 'Tiller Test'));
  addCase(root, tapId, testRef, name);
  const tap = success(cli(root, 'verify', tapId, '--criterion', 'AC-1', '--test', testRef,
    '--run', 'node --test-name-pattern="parent case" test/value.test.mjs'));
  assert.equal(tap.entries[0].evidence, 'verified');

  const specId = '20261022-spec-evidence';
  startSmall(root, specId);
  success(cli(root, 'confirm', specId, 'requirements', '--by', 'Tiller Test'));
  addCase(root, specId, testRef, name);
  const spec = success(cli(root, 'verify', specId, '--criterion', 'AC-1', '--test', testRef,
    '--run', 'node --test-reporter=spec --test-name-pattern="parent case" test/value.test.mjs'));
  assert.equal(spec.entries[0].evidence, 'verified');

  const unverifiedId = '20261022-unverified-output';
  startSmall(root, unverifiedId);
  success(cli(root, 'confirm', unverifiedId, 'requirements', '--by', 'Tiller Test'));
  addCase(root, unverifiedId, testRef, name);
  commitAll(root, 'chore: 准备未核实输出示例');
  const unverified = success(cli(root, 'verify', unverifiedId, '--criterion', 'AC-1', '--test', testRef,
    '--run', `node -e "console.log('ok')"`));
  assert.equal(unverified.entries[0].evidence, 'unverified');
  const blocked = failure(cli(root, 'check', unverifiedId));
  assert.ok(blocked.issues.some(issue => issue.includes('验证未核实')), blocked.issues.join('\n'));

  const fileId = '20261022-file-evidence';
  startSmall(root, fileId);
  success(cli(root, 'confirm', fileId, 'requirements', '--by', 'Tiller Test'));
  const fileLevel = success(cli(root, 'verify', fileId, '--criterion', 'AC-1', '--test', 'test/value.test.mjs',
    '--run', 'node test/value.test.mjs'));
  assert.equal(fileLevel.entries[0].evidence, 'verified');

  // A faked `ok` line next to real failures (e.g. console.log inside a failing test, exit masked by `; true`)
  // still exposes the failures, so verify must not treat the run as verified.
  const masked = inspectTestOutput('ok 99 - ghost\n# Subtest: liar\nnot ok 1 - liar\n# fail 1\n', { path: 'test/a.test.mjs', name: 'ghost' });
  assert.equal(masked.outcome, 'passed');
  assert.equal(masked.failures, 1);
  assert.equal(inspectTestOutput('ok 1 - ghost\n# fail 2\n', { path: 'test/a.test.mjs', name: 'ghost' }).failures, 2);
  assert.equal(inspectTestOutput('✔ ghost (1ms)\nℹ fail 3\n', { path: 'test/a.test.mjs', name: 'ghost' }).failures, 3);
});

test('bugfix verification requires baseline failure and current passing evidence', async t => {
  const failing = "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { add } from '../src/bug.mjs';\n\ntest('bugfix addition: [1+1] # result', () => assert.equal(add(1, 1), 2));\n";
  const root = fixture(t);
  await initialize({ root });
  put(root, 'src/bug.mjs', 'export const add = (a, b) => a - b;\n');
  put(root, 'test/bug.test.mjs', failing);
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Verification\n\nEvidence must be observed.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nRun commands through verify.\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline buggy implementation');

  const id = '20261022-bugfix-evidence';
  const name = 'bugfix addition: [1+1] # result';
  const testRef = `test/bug.test.mjs::${name}`;
  success(cli(root, 'start', id, '--title', '修复加法', '--requirement', '修复加法并保留回归证据。',
    '--criterion', 'AC-1=失败先行且当前通过', '--type', 'bugfix', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', '加法回归',
    '--test', testRef, '--criterion', 'AC-1', '--source', 'src/bug.mjs'));

  const baseline = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', testRef,
    '--expect-fail', '--run', 'node test/bug.test.mjs'));
  assert.equal(baseline.result, 'failed');
  assert.equal(baseline.entries[0].expectFail, true);
  assert.equal(baseline.entries[0].evidence, 'verified');
  assert.match(baseline.entries[0].baseline, /^[a-f0-9]{40,64}$/u);
  assert.equal(git(root, 'worktree', 'list', '--porcelain').trim().split(/\n(?=worktree )/u).length, 1);

  put(root, 'src/bug.mjs', 'export const add = (a, b) => a + b;\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', testRef, '--run', 'node test/bug.test.mjs'));
  commitAll(root, 'fix(workflow): 修复加法并记录基线失败');
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));

  const missingId = '20261022-bugfix-missing-baseline';
  success(cli(root, 'start', missingId, '--title', '缺少失败先行', '--requirement', '检查失败先行证据。',
    '--criterion', 'AC-1=证据完整', '--type', 'bugfix', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  success(cli(root, 'confirm', missingId, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'case', 'add', missingId, '--module', 'workflow', '--kind', 'behavior', '--title', '缺少基线',
    '--test', testRef, '--criterion', 'AC-1', '--source', 'src/bug.mjs'));
  success(cli(root, 'verify', missingId, '--criterion', 'AC-1', '--test', testRef, '--run', 'node test/bug.test.mjs'));
  commitAll(root, 'chore: 记录缺少失败先行的任务');
  const missing = failure(cli(root, 'check', missingId));
  assert.ok(missing.issues.some(issue => issue.includes('缺少失败先行验证')), missing.issues.join('\n'));

  const noFailureId = '20261022-bugfix-without-failure';
  success(cli(root, 'start', noFailureId, '--title', '基线已通过', '--requirement', '拒绝伪造失败先行证据。',
    '--criterion', 'AC-1=基线必须失败', '--type', 'bugfix', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  success(cli(root, 'confirm', noFailureId, 'requirements', '--by', 'Tiller Test'));
  success(cli(root, 'case', 'add', noFailureId, '--module', 'workflow', '--kind', 'behavior', '--title', '基线已通过',
    '--test', testRef, '--criterion', 'AC-1', '--source', 'src/bug.mjs'));
  const noFailure = failure(cli(root, 'verify', noFailureId, '--criterion', 'AC-1', '--test', testRef,
    '--expect-fail', '--run', 'node test/bug.test.mjs'));
  assert.equal(noFailure.error.code, 'EXPECTED_FAILURE_NOT_OBSERVED');
  assert.equal(git(root, 'worktree', 'list', '--porcelain').trim().split(/\n(?=worktree )/u).length, 1);
});

test('standard starts require explicit targets while small defaults to repository root', async t => {
  const root = await project(t);
  const standard = failure(cli(root, 'start', '20261022-standard-no-target', '--title', '标准任务',
    '--requirement', '标准任务必须声明范围。', '--criterion', 'AC-1=范围明确', '--size', 'standard'));
  assert.equal(standard.error.code, 'MISSING_FLOW_SCOPE');
  const small = success(cli(root, 'start', '20261022-small-default-target', '--title', '小任务',
    '--requirement', '小任务可以默认整个仓库。', '--criterion', 'AC-1=小任务可开工', '--size', 'small'));
  assert.deepEqual(small.scope, ['.']);
});
