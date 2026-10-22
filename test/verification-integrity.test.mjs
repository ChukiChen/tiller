import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { initialize, parseMetadata } from '../dist/core.js';
import { verifyFlow } from '../dist/flow.js';
import { namePattern, runnerFor, TEST_RUNNERS } from '../dist/test-output.js';
import { applyUpgrade, planUpgrade } from '../dist/upgrade.js';
import { cli, failure, fixture, put, success } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const taskFile = (id) => `.tiller/task/${id}/task.md`;

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
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nRun declared tests through verify.\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

function startSmall(root, id, target = ['src', 'test', '.tiller/cases']) {
  return success(cli(root, 'start', id, '--title', `Task ${id}`, '--requirement', 'Observe the real verification result.',
    '--criterion', 'AC-1=Evidence is observed', '--size', 'small',
    ...target.flatMap(value => ['--target', value])));
}

function prepareTask(root, id, target) {
  startSmall(root, id, target);
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
}

function addCase(root, id, testRef, name = 'value behavior') {
  return success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', name,
    '--test', testRef, '--criterion', 'AC-1', '--source', 'src/value.mjs'));
}

function commitAll(root, message) {
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', message);
}

function setVerifyConfig(root, verify) {
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  put(root, '.tiller/project.json', `${JSON.stringify({ ...metadata, verify }, null, 2)}\n`);
}

function reportLine(values) {
  return JSON.stringify({ type: 'pass', outcome: 'passed', ...values });
}

test('verify executes the recorded command, rejects legacy inputs and reads old records', async t => {
  const root = await project(t);
  const id = '20261022-verify-single-command';
  prepareTask(root, id);
  addCase(root, id, 'test/value.test.mjs::value behavior');
  put(root, 'src/value.mjs', 'export const value = 2;\n');
  commitAll(root, 'feat(workflow): 实现验证示例');

  const legacy = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::value behavior',
    '--run', 'node test/value.test.mjs'));
  assert.equal(legacy.error.code, 'INVALID_ARGUMENT');
  assert.match(legacy.error.message, /--run/u);
  assert.match(legacy.error.message, /--test/u);
  const externalWithoutFlag = failure(cli(root, 'verify', id, '--criterion', 'AC-1',
    '--test', 'test/value.test.mjs::value behavior', '--command', 'node test/value.test.mjs'));
  assert.equal(externalWithoutFlag.error.code, 'INVALID_ARGUMENT');
  assert.match(externalWithoutFlag.error.message, /--reported/u);

  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1',
    '--test', 'test/value.test.mjs::value behavior'));
  assert.equal(verified.entries[0].source, 'executed');
  assert.equal(verified.entries[0].evidence, 'verified');
  assert.equal(verified.entries[0].result, 'passed');
  assert.match(verified.entries[0].command, /--test-name-pattern=\^value behavior\$/u);
  assert.match(verified.entries[0].command, /--test-reporter=\.\/\.tiller\/local\/verify-/u);
  assert.match(verified.entries[0].command, /test\/value\.test\.mjs$/u);
  assert.match(read(root, taskFile(id)), /^- 命令：node .*--test-name-pattern=.*test\/value\.test\.mjs$/mu);
  assert.equal(verified.log, `.tiller/local/logs/${id}/run-1.log`);
  assert.ok(existsSync(join(root, verified.log)));

  const fileId = '20261022-file-level-report';
  prepareTask(root, fileId);
  const fileLevel = success(cli(root, 'verify', fileId, '--criterion', 'AC-1', '--test', 'test/value.test.mjs'));
  assert.equal(fileLevel.entries[0].evidence, 'verified');
  assert.doesNotMatch(fileLevel.entries[0].command, /--test-name-pattern/u);

  put(root, taskFile(id), read(root, taskFile(id)).replace('\n- 核实：已核实', ''));
  const legacyRecord = success(cli(root, 'check', id));
  assert.equal(legacyRecord.ready, true, legacyRecord.issues.join('\n'));
  assert.ok(!legacyRecord.issues.some(issue => issue.includes('未核实')), legacyRecord.issues.join('\n'));
});

test('verify constructs and executes node:test without a user command', async t => {
  const root = await project(t);
  const id = '20261022-self-run-command';
  prepareTask(root, id);
  addCase(root, id, 'test/value.test.mjs::value behavior');
  commitAll(root, 'test(workflow): 登记自主执行用例');

  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1',
    '--test', 'test/value.test.mjs::value behavior'));
  assert.equal(verified.entries[0].command, verified.entries[0].command.trim());
  assert.match(verified.entries[0].command, /^node '--test-name-pattern=\^value behavior\$' --test-reporter=\.\/\.tiller\/local\/verify-[^/]+\/reporter\.mjs --test-reporter-destination=\.tiller\/local\/verify-[^/]+\/report\.jsonl test\/value\.test\.mjs$/u);
  assert.equal(verified.entries[0].source, 'executed');
  assert.equal(verified.entries[0].evidence, 'verified');
});

test('verify ignores forged stdout and rejects missing, duplicate, failed and corrupt private reports', async t => {
  const source = [
    "import { writeSync } from 'node:fs';",
    "import test from 'node:test';",
    "console.log('ok 1 - ghost');",
    "writeSync(1, 'ok 1 - ghost\\n');",
    "writeSync(1, '✔ ghost\\n');",
    "test('real behavior', () => {});",
    "if (false) test('ghost', () => {});",
    "test('broken behavior', () => { throw new Error('expected failure'); });",
    "test('parent case', async t => {",
    "  await t.test('same child', () => {});",
    "  await t.test('same child', () => {});",
    '});',
    '',
  ].join('\n');
  const root = await project(t, source);
  const fakeId = '20261022-forged-stdout';
  prepareTask(root, fakeId);
  commitAll(root, 'test(workflow): 构造伪造输出');
  const forged = success(cli(root, 'verify', fakeId, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::ghost'));
  assert.equal(forged.entries[0].result, 'passed');
  assert.equal(forged.entries[0].evidence, 'unverified');
  const blocked = failure(cli(root, 'check', fakeId));
  assert.ok(blocked.issues.some(issue => issue.includes('验证未核实')), blocked.issues.join('\n'));

  const realId = '20261022-real-private-report';
  prepareTask(root, realId);
  const real = success(cli(root, 'verify', realId, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::real behavior'));
  assert.equal(real.entries[0].evidence, 'verified');

  const duplicateId = '20261022-duplicate-private-report';
  prepareTask(root, duplicateId);
  const duplicate = success(cli(root, 'verify', duplicateId, '--criterion', 'AC-1',
    '--test', 'test/value.test.mjs::parent case > same child'));
  assert.equal(duplicate.entries[0].evidence, 'unverified');
  assert.match(duplicate.entries[0].evidence === 'unverified' ? '匹配到 2 个测试' : '', /匹配到 2 个测试/u);

  const failedId = '20261022-failed-private-report';
  prepareTask(root, failedId);
  const failedRun = cli(root, 'verify', failedId, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::broken behavior');
  assert.notEqual(failedRun.status, 0);
  const failed = failedRun.data;
  assert.equal(failed.entries[0].result, 'failed');
  assert.equal(failed.entries[0].evidence, 'verified');

  const runner = runnerFor('node-test');
  const expectedFile = join(root, 'test/value.test.mjs');
  const parse = (report, name = 'ghost') => runner.parse(report, { path: 'test/value.test.mjs', name }, expectedFile);
  const valid = reportLine({ name: 'ghost', path: 'ghost', file: expectedFile });
  assert.equal(parse(`${valid}\n${JSON.stringify({ type: 'summary', success: true })}\n`).verified, true);
  assert.equal(parse('').verified, false);
  assert.equal(parse('not json\n').verified, false);
  assert.equal(parse(`${reportLine({ name: 'other', path: 'other', file: expectedFile })}\n`).verified, false);
  assert.equal(parse(`${valid}\n${valid}\n`).verified, false);
  assert.equal(parse(`${reportLine({ name: 'ghost', path: 'ghost', file: join(root, 'test/other.test.mjs') })}\n`).verified, false);
  assert.equal(parse(`${reportLine({ name: 'ghost', path: 'ghost' })}\n`).verified, false);
  assert.equal(parse(`${reportLine({ name: 'ghost', path: 'different', file: expectedFile })}\n`).verified, false);
  assert.equal(parse(`${valid}\n${JSON.stringify({ type: 'summary', success: false })}\n`).verified, false);
  const failedReport = parse(`${JSON.stringify({ type: 'fail', name: 'ghost', path: 'ghost', outcome: 'failed', file: expectedFile })}\n${JSON.stringify({ type: 'summary', success: true })}\n`);
  assert.equal(failedReport.verified, true);
  assert.equal(failedReport.outcome, 'failed');
});

test('a failed private report cannot pass when the test process exits zero', async t => {
  const root = await project(t);
  const id = '20261022-zero-exit-failure';
  prepareTask(root, id);
  const runner = TEST_RUNNERS.find(item => item.name === 'node-test');
  assert.ok(runner);
  const originalBuild = runner.build;
  runner.build = (reference, paths) => {
    const report = JSON.stringify({
      type: 'fail', name: 'value behavior', path: 'value behavior', outcome: 'failed', file: join(root, reference.path),
    });
    const summary = JSON.stringify({ type: 'summary', success: false });
    const script = `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(paths.report)}, ${JSON.stringify(`${report}\n${summary}\n`)}); process.exit(0);`;
    return { executable: process.execPath, args: ['-e', script], display: 'node fake-failing-report' };
  };
  try {
    const verified = await verifyFlow(root, id, {
      criteria: ['AC-1'], test: 'test/value.test.mjs::value behavior',
    });
    assert.equal(verified.entries[0].exitCode, 0);
    assert.equal(verified.entries[0].result, 'failed');
    assert.equal(verified.entries[0].evidence, 'verified');
    assert.equal(verified.ready, false);
  } finally {
    runner.build = originalBuild;
  }
});

test('reported verification is blocked by default and allowed explicitly', async t => {
  const root = await project(t);
  const id = '20261022-reported-verification';
  prepareTask(root, id);
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
  const name = 'parent case > nested / escaped [x] # hash';
  const id = '20261022-nested-private-report';
  prepareTask(root, id);
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `test/value.test.mjs::${name}`));
  assert.equal(verified.entries[0].evidence, 'verified');
  assert.equal(verified.entries[0].source, 'executed');
  assert.equal(verified.entries[0].result, 'passed');
  assert.match(verified.entries[0].command, /--test-name-pattern=\^parent case\$/u);
  assert.match(verified.entries[0].command, /test\/value\.test\.mjs$/u);
  assert.equal(verified.log, `.tiller/local/logs/${id}/run-1.log`);

  const special = "import test from 'node:test';\n\ntest('literal [x] + (y) # hash', () => {});\n";
  const second = await project(t, special);
  const specialId = '20261022-escaped-private-report';
  prepareTask(second, specialId);
  const escaped = success(cli(second, 'verify', specialId, '--criterion', 'AC-1',
    '--test', 'test/value.test.mjs::literal [x] + (y) # hash'));
  assert.equal(escaped.entries[0].evidence, 'verified');
  assert.match(escaped.entries[0].command, /--test-name-pattern=\^literal \\\[x\\\] \\\+ \\\(y\\\) # hash\$/u);
  assert.equal(namePattern({ path: 'test/value.test.mjs' }), undefined);
});

test('bugfix verification requires baseline failure and current passing evidence', async t => {
  const failing = "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { add } from '../src/bug.mjs';\n\ntest('bugfix addition: [1+1] # result', () => assert.equal(add(1, 1), 2));\n";
  const root = fixture(t);
  await initialize({ root });
  put(root, 'src/bug.mjs', 'export const add = (a, b) => a - b;\n');
  put(root, 'test/bug.test.mjs', failing);
  const preparedMarker = join(root, '.tiller/local/baseline-prepared.txt');
  put(root, 'prepare-baseline.mjs', `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(preparedMarker)}, process.cwd());\n`);
  setVerifyConfig(root, { prepare: ['node', 'prepare-baseline.mjs'] });
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Verification\n\nEvidence must be observed.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nRun declared tests through verify.\n');
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

  const baseline = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', testRef, '--expect-fail'));
  assert.equal(baseline.result, 'failed');
  assert.equal(baseline.entries[0].expectFail, true);
  assert.equal(baseline.entries[0].evidence, 'verified');
  assert.match(baseline.entries[0].command, /--test-reporter=\.\/\.tiller\/local\/verify-/u);
  assert.match(baseline.entries[0].baseline, /^[a-f0-9]{40,64}$/u);
  assert.match(read(root, '.tiller/local/baseline-prepared.txt'), /tiller-baseline-/u);
  assert.equal(git(root, 'worktree', 'list', '--porcelain').trim().split(/\n(?=worktree )/u).length, 1);

  put(root, 'src/bug.mjs', 'export const add = (a, b) => a + b;\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', testRef));
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
  success(cli(root, 'verify', missingId, '--criterion', 'AC-1', '--test', testRef));
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
  const noFailure = failure(cli(root, 'verify', noFailureId, '--criterion', 'AC-1', '--test', testRef, '--expect-fail'));
  assert.equal(noFailure.error.code, 'EXPECTED_FAILURE_NOT_OBSERVED');
  assert.equal(git(root, 'worktree', 'list', '--porcelain').trim().split(/\n(?=worktree )/u).length, 1);
});

test('verify runner configuration and prepare are enforced', async t => {
  const root = await project(t);
  put(root, 'prepare.mjs', "import { writeFileSync } from 'node:fs';\nwriteFileSync('prepared.txt', 'yes');\n");
  put(root, 'prepare-fail.mjs', "process.exit(3);\n");
  put(root, 'test/prepared.test.mjs', "import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport test from 'node:test';\ntest('prepared behavior', () => assert.equal(readFileSync('prepared.txt', 'utf8'), 'yes'));\n");
  setVerifyConfig(root, { prepare: ['node', 'prepare.mjs'] });

  const id = '20261022-verify-prepare';
  prepareTask(root, id);
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/prepared.test.mjs::prepared behavior'));
  assert.equal(verified.entries[0].evidence, 'verified');
  assert.equal(read(root, 'prepared.txt'), 'yes');

  setVerifyConfig(root, { runner: 'node-test', prepare: ['node', 'prepare-fail.mjs'] });
  const failed = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/prepared.test.mjs::prepared behavior'));
  assert.equal(failed.error.code, 'VERIFY_PREPARE_FAILED');

  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  assert.throws(() => parseMetadata(JSON.stringify({ ...metadata, verify: { runner: 'other' } })), /node-test/u);
  assert.throws(() => runnerFor('other'), error => error?.code === 'UNKNOWN_VERIFY_RUNNER');

  setVerifyConfig(root, { prepare: ['node', 'prepare.mjs'] });
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  const upgraded = await applyUpgrade(root, plan.planId);
  assert.equal(upgraded.ready, true, upgraded.issues.join('\n'));
  assert.deepEqual(JSON.parse(read(root, '.tiller/project.json')).verify, { prepare: ['node', 'prepare.mjs'] });
});

test('verify writes a concise summary and verbose log', async t => {
  const source = "import { writeSync } from 'node:fs';\nimport test from 'node:test';\nwriteSync(1, 'TILLER_LOG_MARKER\\n');\ntest('logging behavior', () => {});\n";
  const root = await project(t, source);
  const id = '20261022-verify-log';
  prepareTask(root, id);
  const quiet = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::logging behavior'));
  assert.equal(quiet.log, `.tiller/local/logs/${id}/run-1.log`);
  assert.ok(read(root, quiet.log).includes('TILLER_LOG_MARKER'), read(root, quiet.log));
  assert.ok(!quiet.entries[0].command.includes('TILLER_LOG_MARKER'));
  assert.ok(!read(root, quiet.log).includes(root));
  assert.ok(quiet.entries.length === 1);
  assert.equal(quiet.entries[0].evidence, 'verified');

  const verboseRun = cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/value.test.mjs::logging behavior', '--verbose');
  const verbose = success(verboseRun);
  assert.equal(verbose.log, `.tiller/local/logs/${id}/run-2.log`);
  assert.ok(verboseRun.stderr.includes('TILLER_LOG_MARKER'), verboseRun.stderr);
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
