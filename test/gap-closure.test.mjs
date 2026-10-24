import assert from 'node:assert/strict';
import { chmodSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runnerFor } from '../dist/test-output.js';
import { cli, confirmTask, fixture, put, success } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function baseline(root) {
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
}

test('CASE-186 check locates specs and context writeback suggestions without blocking on them alone', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Existing behavior\n\nKeep behavior stable.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nUse the current flow.\n');
  put(root, 'src/value.txt', 'one\n');
  baseline(root);
  const id = '20261024-writeback-hint';
  success(cli(root, 'start', id, '--title', 'Writeback hint', '--requirement', 'Suggest durable writebacks.',
    '--criterion', 'AC-1=Writeback paths are visible', '--size', 'small',
    '--target', 'src', '--target', '.tiller/specs/modules/workflow'));
  success(confirmTask(root, id, 'requirements'));
  put(root, 'src/value.txt', 'two\n');
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'change without writeback');

  const checked = cli(root, 'check', id);
  const warning = checked.data.warnings.find(item => item.includes('回写'));
  assert.ok(warning, checked.data.warnings.join('\n'));
  assert.match(warning, /\.tiller\/specs\/modules\/workflow\/requirements\.md/u);
  assert.match(warning, /\.tiller\/specs\/modules\/workflow\/design\.md/u);
  assert.match(warning, /“## <能力>”/u);
  assert.match(warning, /“## <方案>”/u);
  assert.ok(!checked.data.issues.some(issue => issue.includes('回写')), checked.data.issues.join('\n'));
});

test('CASE-187 repeated failures stop retries only for the same AC or CASE and a verified pass resets the count', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Failure handling\n\nStop repeated retries.\n');
  put(root, 'src/value.mjs', 'export const value = 1;\n');
  put(root, 'test/fail.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('failing attempt', () => assert.equal(1, 2));\n");
  put(root, 'test/pass.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('recovery attempt', () => assert.equal(1, 1));\n");
  baseline(root);

  const id = '20261024-retry-stop';
  success(cli(root, 'start', id, '--title', 'Retry stop', '--requirement', 'Stop after repeated failures.',
    '--criterion', 'AC-1=Repeated failures are visible', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  success(confirmTask(root, id, 'requirements'));
  const first = cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/fail.test.mjs::failing attempt');
  assert.equal(first.status, 1);
  assert.equal(first.data.entries[0].result, 'failed');
  assert.equal(first.data.stop, undefined);
  const second = cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/fail.test.mjs::failing attempt');
  assert.equal(second.status, 1);
  assert.equal(second.data.stop, true);
  assert.ok(second.data.retryStops.some(stop => stop.target === 'AC-1' && stop.failures === 2));
  assert.match(second.data.next, /FLOW-05/u);
  assert.match(second.data.next, /停止自动重试/u);
  assert.match(second.data.next, /2～3 个可选方案/u);

  const checked = cli(root, 'check', id);
  assert.equal(checked.status, 1);
  assert.ok(checked.data.issues.some(issue => issue.includes('AC-1') && issue.includes('FLOW-05')
    && issue.includes('停止自动重试')), checked.data.issues.join('\n'));

  const recovered = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/pass.test.mjs::recovery attempt'));
  assert.equal(recovered.stop, undefined);
  const afterPass = cli(root, 'check', id);
  assert.ok(!afterPass.data.issues.some(issue => issue.includes('FLOW-05')), afterPass.data.issues.join('\n'));

  const fixtureCaseId = 'CASE-' + '001';
  const caseSource = [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    `test('${fixtureCaseId} failing case', () => assert.equal(1, 2));`,
    '',
  ].join('\n');
  put(root, 'test/case-fail.test.mjs', caseSource);
  git(root, 'add', 'test/case-fail.test.mjs');
  git(root, 'commit', '--quiet', '-m', 'add case failure');
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'Case retry stop', '--expected', 'The same case stops after two failures.',
    '--criterion', 'AC-1', '--source', 'src/value.mjs'));
  cli(root, 'verify', id, '--criterion', 'AC-1', '--case', added.id);
  const caseSecond = cli(root, 'verify', id, '--criterion', 'AC-1', '--case', added.id);
  assert.equal(caseSecond.status, 1);
  assert.ok(caseSecond.data.retryStops?.some(stop => stop.target === added.id), JSON.stringify(caseSecond.data));
  put(root, 'test/case-fail.test.mjs', caseSource.replace('assert.equal(1, 2)', 'assert.equal(1, 1)'));
  const casePass = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--case', added.id));
  assert.equal(casePass.stop, undefined);
});

test('CASE-188 pytest detection, skeleton, command construction and private XML verification work end to end', async t => {
  for (const kind of ['pytest.ini', 'pyproject', 'layout']) {
    const detected = fixture(t);
    if (kind === 'pytest.ini') put(detected, 'pytest.ini', '[pytest]\n');
    if (kind === 'pyproject') put(detected, 'pyproject.toml', '[tool.pytest.ini_options]\naddopts = "-q"\n');
    if (kind === 'layout') put(detected, 'tests/test_sample.py', 'def test_sample():\n    assert True\n');
    const initialized = success(cli(detected, 'init'));
    assert.equal(initialized.metadata.verify.runner, 'pytest', kind);
  }

  const root = fixture(t);
  put(root, 'pytest.ini', '[pytest]\n');
  success(cli(root, 'init'));
  put(root, '.tiller/specs/modules/verification/requirements.md', '# Verification\n\n## Python runner\n\nUse pytest.\n');
  put(root, '.tiller/specs/modules/verification/design.md', '# Verification design\n\nRead private JUnit XML.\n');
  put(root, 'src/app.py', 'value = 1\n');
  put(root, 'tests/__init__.py', '');
  const caseId = 'CASE-' + '001';
  put(root, 'tests/test_sample.py', ['# ' + caseId + ' pytest behavior', 'def test_' + caseId.replace('-', '_') + '():', '    assert True', ''].join('\n'));
  baseline(root);

  const id = '20261024-pytest-runner';
  success(cli(root, 'start', id, '--title', 'pytest runner', '--requirement', 'Verify pytest through XML.',
    '--criterion', 'AC-1=pytest results are verified', '--size', 'small', '--target', 'src', '--target', 'tests', '--target', '.tiller/cases'));
  success(confirmTask(root, id, 'requirements'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'verification', '--kind', 'interface',
    '--title', 'pytest XML evidence', '--expected', 'Private XML proves the named pytest result.',
    '--criterion', 'AC-1', '--source', 'src/app.py'));
  assert.equal(added.runner, 'pytest');
  assert.match(added.skeleton, new RegExp(`# ${added.id}`, 'u'));
  assert.match(added.skeleton, new RegExp(`def test_case_${added.id.replace(/[^0-9]/gu, '')}\\(`, 'u'));

  const paths = { reporter: './.tiller/local/verify-x/reporter.mjs', report: '.tiller/local/verify-x/report.xml' };
  const runner = runnerFor('pytest');
  const built = runner.build({ path: 'tests/test_sample.py', name: `test_case_${added.id.replace(/[^0-9]/gu, '')}` }, paths);
  assert.equal(built.executable, 'pytest');
  assert.deepEqual(built.args, ['--junitxml=.tiller/local/verify-x/report.xml', 'tests/test_sample.py']);
  const xml = (name, body = '') => `<?xml version="1.0"?><testsuite><testcase classname="tests.test_sample" name="${name}">${body}</testcase></testsuite>`;
  const reference = { path: 'tests/test_sample.py', name: 'test_CASE_001' };
  assert.equal(runner.parse(xml('test_CASE_001'), reference, 'ignored').verified, true);
  assert.equal(runner.parse(xml('test_CASE_001', '<failure/>'), reference, 'ignored').outcome, 'failed');
  assert.equal(runner.parse(xml('test_CASE_001', '<skipped/>'), reference, 'ignored').verified, false);
  assert.equal(runner.parse(xml('other'), reference, 'ignored').verified, false);
  assert.equal(runner.parse(xml('test_CASE_001') + xml('test_CASE_001'), reference, 'ignored').verified, false);

  const bin = join(root, 'fake-bin');
  const fake = [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    "const report = args.find(value => value.startsWith('--junitxml='))?.slice('--junitxml='.length);",
    "const source = args.at(-1);",
    "if (!report || !source?.endsWith('.py')) process.exit(2);",
    "const module = source.replace(/\\.py$/u, '').split('/').join('.');",
    "writeFileSync(report, `<?xml version=\"1.0\"?><testsuite><testcase classname=\"${module}\" name=\"test_CASE_001\"/></testsuite>\\n`);",
    '',
  ].join('\n');
  put(root, 'fake-bin/pytest', fake);
  chmodSync(join(bin, 'pytest'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${previous ?? ''}`;
  try {
    const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'tests/test_sample.py::test_CASE_001'));
    assert.equal(verified.entries[0].evidence, 'verified');
    assert.equal(verified.entries[0].result, 'passed');
    assert.match(verified.entries[0].command, /^pytest --junitxml=\.tiller\/local\/verify-[^ ]+\/report\.jsonl tests\/test_sample\.py$/u);
  } finally {
    process.env.PATH = previous;
  }
});

test('CASE-189 upgrade adopts managed content and plan attach links an existing task', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const before = JSON.parse(read(root, '.tiller/project.json')).managedFiles['.tiller/usage.md'];
  put(root, '.tiller/usage.md', `${read(root, '.tiller/usage.md')}\n本地补充说明。\n`);
  const drifted = cli(root, 'status');
  assert.equal(drifted.status, 1);
  assert.ok(drifted.data.issues.some(issue => issue.includes('.tiller/usage.md')), drifted.data.issues.join('\n'));
  const adopted = success(cli(root, 'upgrade', '--adopt', '.tiller/usage.md'));
  assert.equal(adopted.changed, true);
  assert.equal(adopted.adopted[0].path, '.tiller/usage.md');
  assert.match(read(root, '.tiller/usage.md'), /本地补充说明/u);
  const after = JSON.parse(read(root, '.tiller/project.json')).managedFiles['.tiller/usage.md'];
  assert.notEqual(after, before);
  assert.equal(success(cli(root, 'status')).ready, true);
  const unknown = cli(root, 'upgrade', '--adopt', 'README.md');
  assert.equal(unknown.status, 1);
  assert.match(unknown.data.error.message, /不是工程受管文件/u);

  success(cli(root, 'plan', 'start', '20261024-attach-plan', '--title', 'Attach plan', '--goal', 'Link existing tasks.',
    '--spec', '.tiller/specs/requirements.md',
    '--item', 'P-1=First item;size=small;deps=-',
    '--item', 'P-2=Second item;size=small;deps=-'));
  success(cli(root, 'plan', 'confirm', '20261024-attach-plan'));
  const id = '20261024-existing-task';
  success(cli(root, 'start', id, '--title', 'Existing task', '--requirement', 'Attach after creation.',
    '--criterion', 'AC-1=Attachment is visible', '--size', 'small'));
  const attached = success(cli(root, 'plan', 'attach', id, '--plan', '20261024-attach-plan', '--item', 'P-1'));
  assert.equal(attached.changed, true);
  const content = read(root, `.tiller/task/${id}/task.md`);
  assert.match(content, /"plan":"20261024-attach-plan","item":"P-1"/u);
  assert.match(content, /^## 规划$/mu);
  assert.match(content, /^- 规划：20261024-attach-plan$/mu);
  const status = success(cli(root, 'plan', 'status', '20261024-attach-plan'));
  assert.deepEqual(status.items[0].tasks.map(item => item.id), [id]);
  assert.equal(success(cli(root, 'plan', 'attach', id, '--plan', '20261024-attach-plan', '--item', 'P-1')).changed, false);
  const conflict = cli(root, 'plan', 'attach', id, '--plan', '20261024-attach-plan', '--item', 'P-2');
  assert.equal(conflict.status, 1);
  assert.equal(conflict.data.error.code, 'TASK_PLAN_CONFLICT');
});

test('CASE-189 repository specs and managed copies describe the gap-closure contract', () => {
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    const usage = read(repository, relative);
    assert.match(usage, /pytest/u, relative);
    assert.match(usage, /FLOW-05|停止自动重试/u, relative);
    assert.match(usage, /upgrade.*--adopt|--adopt/u, relative);
    assert.match(usage, /plan attach/u, relative);
  }
  for (const relative of ['resources/entry.md', 'AGENTS.md']) {
    const entry = read(repository, relative);
    assert.match(entry, /回写|提纲/u, relative);
    assert.match(entry, /连续两次|停止自动重试/u, relative);
  }
});
