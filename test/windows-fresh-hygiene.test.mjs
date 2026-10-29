import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startPlatformMock } from './platform-api-mock.mjs';

const repository = fileURLToPath(new URL('..', import.meta.url));

// verify --expect-fail runs this file from a detached base worktree. Build that
// worktree first so the same behavioral test fails there for the product defect,
// not merely because dist/ is absent.
if (!existsSync(join(repository, 'dist/flow.js'))) {
  const built = spawnSync(process.execPath, ['scripts/build.mjs'], {
    cwd: repository, encoding: 'utf8', timeout: 120_000, windowsHide: true,
  });
  assert.ifError(built.error);
  assert.equal(built.status, 0, built.stderr || built.stdout);
}

const distModule = relative => import(pathToFileURL(join(repository, 'dist', relative)).href);

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true,
  });
  assert.ifError(result.error);
  return result;
}

function okGit(root, ...args) {
  const result = git(root, ...args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tiller-windows-hygiene-'));
  okGit(root, 'init', '--quiet');
  okGit(root, 'commit', '--quiet', '--allow-empty', '-m', 'baseline');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function projectMetadata(overrides = {}) {
  const metadata = JSON.parse(readFileSync(join(repository, '.tiller/project.json'), 'utf8'));
  const result = { ...metadata, ...overrides };
  if (result.platform === 'gitlab') {
    delete result.managedFiles['.github/pull_request_template.md'];
    result.managedFiles['.gitlab/merge_request_templates/Default.md'] = '0'.repeat(64);
  }
  return result;
}

function put(root, relative, content) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function invoke(root, args, environment = {}) {
  const result = spawnSync(process.execPath, [join(repository, 'dist/cli.js'), ...args, '--json'], {
    cwd: root, encoding: 'utf8', timeout: 90_000, windowsHide: true,
    env: { ...process.env, ...environment },
  });
  assert.ifError(result.error);
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { assert.fail(`Expected JSON output: ${result.stdout}\n${result.stderr}`); }
  return { status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, data };
}

async function invokeAsync(root, args, environment = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repository, 'dist/cli.js'), ...args, '--json'], {
      cwd: root, env: { ...process.env, ...environment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 90_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (status, signal) => {
      clearTimeout(timer);
      let data;
      try { data = JSON.parse(stdout); }
      catch { reject(new Error(`Expected JSON output: ${stdout}\n${stderr}`)); return; }
      resolve({ status, signal, stdout, stderr, data });
    });
  });
}

function tokenEnvironment(platform, token = 'test-token') {
  return platform === 'github'
    ? { GITHUB_TOKEN: token, GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '' }
    : { GITHUB_TOKEN: '', GH_TOKEN: '', GITLAB_TOKEN: token, GL_TOKEN: '' };
}

function replaceSection(content, title, body) {
  const lines = content.split('\n');
  const start = lines.findIndex(line => line.trim() === `### ${title}`);
  assert.notEqual(start, -1, `missing section: ${title}`);
  let end = start + 1;
  while (end < lines.length && !/^#{2,3}\s+/u.test(lines[end])) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return [...lines.slice(0, start + 1), '', body, '', ...lines.slice(end)].join('\n');
}

function commitFixture(root, message) {
  okGit(root, 'add', '.');
  okGit(root, 'commit', '--quiet', '-m', message);
}

function taskRecord(root, id) {
  return join(root, '.tiller/local', id, 'worktrees/.tiller/task', id, 'task.md');
}

test('CASE-347 LF, CRLF and isolated CR design bodies keep confirmation subjects stable', async t => {
  const root = fixture(t);
  put(root, '.tiller/project.json', `${JSON.stringify(projectMetadata(), null, 2)}\n`);
  okGit(root, 'add', '.tiller/project.json');
  okGit(root, 'commit', '--quiet', '-m', 'project metadata');

  const id = '20261029-line-ending-proof';
  const started = invoke(root, ['start', id, '--title', 'Line ending proof', '--type', 'feature', '--size', 'standard',
    '--requirement', 'Prove line-ending-independent confirmations.', '--criterion', 'AC-1=Confirmations survive line endings',
    '--target', '.']);
  assert.equal(started.status, 0, started.stdout || started.stderr);
  const record = join(root, '.tiller/local', id, 'worktrees/.tiller/task', id, 'task.md');
  let content = readFileSync(record, 'utf8');
  content = replaceSection(content, '使用场景', 'Windows checkouts use autocrlf and must keep confirmations.');
  content = replaceSection(content, '业务范围', ['- 做：验证确认摘要跨换行稳定。', '- 不做：改变确认字段。', '- 假设与待确认：无。'].join('\n'));
  content = replaceSection(content, '关键行为', 'The same design text has one confirmation subject.');
  content = replaceSection(content, '异常与边界', 'Substantive changes still invalidate confirmation.');
  content = replaceSection(content, '方案', 'Normalize CRLF and isolated CR before trimming the design subject.');
  content = replaceSection(content, '失败处理', 'A substantive design change requires confirmation again.');
  content = replaceSection(content, '取舍', 'Do not collapse ordinary whitespace inside the body.');
  content = replaceSection(content, '影响与风险', 'Historical LF confirmations remain compatible.');
  content = replaceSection(content, '验证入口', 'Compare LF, CRLF and isolated CR variants.');
  writeFileSync(record, content);

  assert.equal(invoke(root, ['confirm', id, 'requirements', '--by', 'ChukiChen']).status, 0);
  assert.equal(invoke(root, ['confirm', id, 'design', '--by', 'ChukiChen']).status, 0);

  content = readFileSync(record, 'utf8');
  content = content.replace(/\r\n?/gu, '\n').replace(/\n/gu, '\r\n');
  writeFileSync(record, content);
  const resumed = invoke(root, ['resume', id]);
  assert.equal(resumed.status, 0, resumed.stdout || resumed.stderr);
  const checked = invoke(root, ['check', id]);
  const byGate = new Map(checked.data.confirmations.map(item => [item.gate, item]));
  assert.ok(byGate.has('requirements'), JSON.stringify(checked.data.confirmations));
  assert.ok(byGate.has('design'), JSON.stringify(checked.data.confirmations));
  assert.equal(byGate.get('requirements').confirmed, true);
  assert.equal(byGate.get('design').confirmed, true);

  const changed = content.replace('Normalize CRLF and isolated CR before trimming the design subject.',
    'Normalize CRLF and isolated CR before trimming the design subject, then verify an extra substantive sentence.');
  writeFileSync(record, changed);
  const invalidated = invoke(root, ['resume', id]);
  assert.equal(invalidated.status, 0, invalidated.stdout || invalidated.stderr);
  const rechecked = invoke(root, ['check', id]);
  const changedGates = new Map(rechecked.data.confirmations.map(item => [item.gate, item]));
  assert.equal(changedGates.get('design').confirmed, false);
});

test('CASE-351 isolated CR keeps task criteria, confirmations, verification and acceptance', async t => {
  const root = fixture(t);
  put(root, '.tiller/project.json', `${JSON.stringify(projectMetadata({ verify: { runner: 'node-test' } }), null, 2)}\n`);
  put(root, '.tiller/specs/modules/workflow/residual.md', '# Residual\n\n## 验收条件\n\n- AC-1: 生命周期在三种换行下等价\n');
  put(root, '.tiller/cases/modules/workflow/behavior.md', `# workflow / behavior

## CASE-351 lifecycle record

- 类型：behavior
- 优先级：high
- 模块：workflow
- 关联 AC：AC-1
- 需求：\`.tiller/specs/modules/workflow/residual.md\`

### 前置条件

- 任务记录已确认并验收。

### 步骤

1. 运行 CASE-351 具名测试。

### 输入

- 正常输入。

### 预期结果

生命周期事实保持不变。
`);
  put(root, 'test/eol-proof.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-351 lifecycle proof', () => assert.equal(1, 1));\n");
  commitFixture(root, 'test fixture');

  const id = '20261029-isolated-cr-lifecycle';
  const started = invoke(root, ['start', id, '--title', 'Isolated CR lifecycle', '--type', 'feature', '--size', 'standard',
    '--requirement', 'Lifecycle body remains stable.', '--criterion', 'AC-1=Lifecycle survives all EOLs',
    '--target', '.']);
  assert.equal(started.status, 0, started.stdout || started.stderr);
  let content = readFileSync(taskRecord(root, id), 'utf8');
  content = replaceSection(content, '使用场景', 'A Windows record may use isolated carriage returns.');
  content = replaceSection(content, '业务范围', ['- 做：保留任务事实。', '- 不做：改写用户正文。', '- 假设与待确认：无。'].join('\n'));
  content = replaceSection(content, '关键行为', 'Lifecycle body remains stable.');
  content = replaceSection(content, '异常与边界', 'Substantive changes still invalidate confirmation.');
  content = replaceSection(content, '方案', 'Keep parsing in one logical-line helper.');
  content = replaceSection(content, '失败处理', 'Damaged records still fail closed.');
  content = replaceSection(content, '取舍', 'Read without normalizing or writing the record.');
  content = replaceSection(content, '影响与风险', 'Only task line parsing changes.');
  content = replaceSection(content, '验证入口', 'Run CASE-351 across LF, CRLF and isolated CR.');
  writeFileSync(taskRecord(root, id), content);

  assert.equal(invoke(root, ['confirm', id, 'requirements', '--by', 'ChukiChen']).status, 0);
  assert.equal(invoke(root, ['confirm', id, 'design', '--by', 'ChukiChen']).status, 0);
  const verified = invoke(root, ['verify', id, '--criterion', 'AC-1',
    '--test', 'test/eol-proof.test.mjs::CASE-351 lifecycle proof']);
  assert.equal(verified.status, 0, verified.stdout || verified.stderr);
  assert.equal(verified.data.entries[0].evidence, 'verified');
  assert.equal(invoke(root, ['accept', id, '--by', 'ChukiChen']).status, 0);

  const canonical = readFileSync(taskRecord(root, id), 'utf8').replace(/\r\n|\r|\n/gu, '\n');
  const flow = await distModule('flow.js');
  for (const [label, eol] of [['LF', '\n'], ['CRLF', '\r\n'], ['isolated CR', '\r']]) {
    const variant = canonical.replace(/\n/gu, eol);
    writeFileSync(taskRecord(root, id), variant);
    const before = readFileSync(taskRecord(root, id));
    const resumed = invoke(root, ['resume', id]);
    assert.equal(resumed.status, 0, `${label}: ${resumed.stdout || resumed.stderr}`);
    assert.ok(before.equals(readFileSync(taskRecord(root, id))), `${label}: resume rewrote task.md`);
    assert.equal(resumed.data.stage, '已验收', label);
    assert.deepEqual(resumed.data.criteria.map(item => item.id), ['AC-1'], label);
    assert.deepEqual(resumed.data.confirmations.map(item => item.gate), ['requirements', 'design', 'acceptance'], label);
    assert.equal(resumed.data.verifications.length, 1, label);
    assert.equal(resumed.data.verifications[0].cases[0], 'CASE-351', label);
    const inspected = await flow.inspectFlow(root, id);
    assert.deepEqual(inspected.confirmations.map(item => [item.gate, item.confirmed]),
      [['requirements', true], ['design', true], ['acceptance', true]], label);
    assert.equal(inspected.acceptance.confirmed, true, label);
  }

  const requirementChanged = canonical.replace('Lifecycle body remains stable.', 'Lifecycle body has changed.');
  writeFileSync(taskRecord(root, id), requirementChanged);
  const staleRequirements = await flow.inspectFlow(root, id);
  assert.equal(staleRequirements.confirmations.find(item => item.gate === 'requirements').confirmed, false);
  assert.equal(staleRequirements.acceptance.confirmed, false);

  const designChanged = canonical.replace('Keep parsing in one logical-line helper.', 'Keep parsing in two helpers.');
  writeFileSync(taskRecord(root, id), designChanged);
  const staleDesign = await flow.inspectFlow(root, id);
  assert.equal(staleDesign.confirmations.find(item => item.gate === 'design').confirmed, false);
  assert.equal(staleDesign.acceptance.confirmed, false);

  const verificationChanged = canonical.replace('- 结果：passed', '- 结果：failed');
  writeFileSync(taskRecord(root, id), verificationChanged);
  const staleVerification = await flow.inspectFlow(root, id);
  assert.equal(staleVerification.acceptance.confirmed, false);
});

test('CASE-348 fresh clone uniquely binds initBaseline.commit through merged integration commits', async t => {
  for (const platform of ['github', 'gitlab']) {
    const root = fixture(t);
    const base = okGit(root, 'rev-parse', 'HEAD');
    const tree = `${base}^{tree}`;
    const baselineCommit = okGit(root, 'commit-tree', tree, '-p', base, '-m', 'initialization baseline');
    const otherHead = okGit(root, 'commit-tree', tree, '-p', base, '-m', 'other merged head');
    const matchedHead = okGit(root, 'commit-tree', tree, '-p', base, '-m', 'matched merged head');
    const mock = await startPlatformMock(t, { platform, remoteHead: base });
    okGit(root, 'remote', 'add', 'origin', `${mock.origin}${platform === 'github' ? '/owner/repo.git' : '/group/project.git'}`);
    put(root, '.tiller/project.json', `${JSON.stringify(projectMetadata({
      platform,
      initBaseline: { id: '20261029-tiller-init', branch: 'chore/tiller-init', commit: baselineCommit },
    }), null, 2)}\n`);
    okGit(root, 'add', '.tiller/project.json');
    okGit(root, 'commit', '--quiet', '-m', 'fresh clone metadata');
    const environment = tokenEnvironment(platform);
    const branch = 'chore/tiller-init';
    const marker = join(root, '.tiller/local/init-baseline-merged.json');

    const assertPending = async (taskId, label) => {
      const status = await invokeAsync(root, ['status'], environment);
      assert.ok(status.data.initBaselineStatus, `${platform} ${label}: ${status.stdout}\n${status.stderr}`);
      assert.equal(status.data.initBaselineStatus.status, 'pending', `${platform} ${label}: ${status.stdout}`);
      const started = await invokeAsync(root, ['start', taskId, '--title', `Pending ${label}`, '--requirement', 'Pending init gate.',
        '--criterion', 'AC-1=Pending', '--target', '.'], environment);
      assert.notEqual(started.status, 0, `${platform} ${label}`);
      assert.equal(started.data.error.code, 'INIT_BASELINE_PENDING', `${platform} ${label}`);
    };

    await assertPending(`20261029-${platform}-zero`, 'zero candidates');

    mock.state.mergedBranches.add(branch);
    mock.state.mergedHeads.set(branch, [otherHead, matchedHead]);
    mock.state.mergedCommitLists = new Map([
      [`${branch}:1`, [baselineCommit]],
      [`${branch}:2`, [baselineCommit]],
    ]);
    await assertPending(`20261029-${platform}-multi`, 'multiple matching candidates');

    mock.state.mode = 'query-failure';
    await assertPending(`20261029-${platform}-api`, 'API failure');

    mock.state.mode = 'commit-list-failure';
    mock.state.mergedCommitLists = new Map([[`${branch}:1`, [baselineCommit]]]);
    mock.state.mergedHeads.set(branch, [matchedHead]);
    await assertPending(`20261029-${platform}-list`, 'unreadable commit list');

    mock.state.mode = 'success';
    mock.state.mergedCommitLists = new Map([
      [`${branch}:1`, [otherHead]],
      [`${branch}:2`, [baselineCommit]],
    ]);
    mock.state.mergedHeads.set(branch, [otherHead, matchedHead]);

    const noToken = await invokeAsync(root, ['status'], tokenEnvironment(platform, ''));
    assert.equal(noToken.data.initBaselineStatus.status, 'pending', `${platform} no token`);
    const noTokenStart = await invokeAsync(root, ['start', `20261029-${platform}-token`, '--title', 'No token',
      '--requirement', 'No token pending.', '--criterion', 'AC-1=Pending', '--target', '.'], tokenEnvironment(platform, ''));
    assert.equal(noTokenStart.data.error.code, 'INIT_BASELINE_PENDING', `${platform} no token start`);

    const status = await invokeAsync(root, ['status'], environment);
    assert.equal(status.data.initBaselineStatus.status, 'merged', `${platform} unique: ${status.stdout}`);
    const written = JSON.parse(readFileSync(marker, 'utf8'));
    assert.equal(written.commit, baselineCommit);
    assert.equal(written.head, matchedHead);

    const doctor = await invokeAsync(root, ['doctor'], environment);
    assert.equal(doctor.status, 0, `${platform} doctor: ${doctor.stdout}\n${doctor.stderr}`);
    assert.ok(doctor.data.checks.some(check => check.id === 'init-baseline' && check.status === 'pass'),
      `${platform} doctor: ${doctor.stdout}`);
    const closed = await invokeAsync(root, ['close', '20261029-tiller-init', '--reason', '初始化基线已合入'], environment);
    assert.equal(closed.status, 0, `${platform} close: ${closed.stdout}\n${closed.stderr}`);
    assert.equal(closed.data.proof.merged, true, `${platform} close: ${closed.stdout}`);

    rmSync(marker, { force: true });
    const started = await invokeAsync(root, ['start', `20261029-${platform}-fresh`, '--title', 'Fresh clone start',
      '--requirement', 'Unique commit proof allows a fresh clone to start.', '--criterion', 'AC-1=Start allowed', '--target', '.'], environment);
    assert.equal(started.status, 0, `${platform} start: ${started.stdout || started.stderr}`);
  }
});

test('CASE-349 Windows test invocation and adapter helpers avoid POSIX shell dependencies', async () => {
  const output = await distModule('test-output.js');
  assert.equal(typeof output.platformProcessInvocation, 'function');
  const cases = await import(pathToFileURL(join(repository, 'dist/cases.js')).href);
  assert.equal(typeof cases.caseSkeleton, 'function');
  const paths = { reporter: './reporter.mjs', report: '.tiller/local/verify-x/report.jsonl' };
  const expected = new Map([
    ['junit-maven', 'mvn.cmd'],
    ['junit-gradle', 'gradle.bat'],
    ['pytest', 'pytest.exe'],
  ]);
  for (const [runnerName, executable] of expected) {
    const built = output.runnerFor(runnerName).build(
      runnerName === 'pytest' ? { path: 'tests/test_billing.py', name: 'test_adds_invoice' } : { path: 'notes.txt', name: 'com.example.BillingTest#addsInvoice' },
      paths,
    );
    const invocation = output.platformProcessInvocation(built.executable, built.args, 'win32', 'C:\\Windows\\System32\\cmd.exe');
    if (runnerName === 'pytest') {
      assert.equal(invocation.executable, 'pytest.exe', runnerName);
      assert.deepEqual(invocation.args, built.args, runnerName);
    } else {
      assert.equal(invocation.executable, 'C:\\Windows\\System32\\cmd.exe', runnerName);
      assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c'], runnerName);
      assert.match(invocation.args[3], new RegExp(executable.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), runnerName);
    }
  }

  const tricky = output.platformProcessInvocation('mvn', ['space here', 'a&b', '$HOME', '"quoted"'], 'win32',
    'C:\\Windows\\System32\\cmd.exe');
  assert.ok(tricky.args[3].includes('^"space^ here^"'), tricky.args[3]);
  assert.ok(tricky.args[3].includes('^"a^&b^"'), tricky.args[3]);
  assert.ok(tricky.args[3].includes('^"$HOME^"'), tricky.args[3]);
  assert.ok(tricky.args[3].includes('\\^"quoted\\^"'), tricky.args[3]);
  for (const unsupported of ['100%', 'a!b', 'a^b']) {
    assert.throws(() => output.platformProcessInvocation('mvn', [unsupported], 'win32',
      'C:\\Windows\\System32\\cmd.exe'), error => error.code === 'VERIFY_COMMAND_UNSUPPORTED', unsupported);
  }

  for (const runner of ['junit-maven', 'junit-gradle']) {
    const skeleton = cases.caseSkeleton(runner, 'CASE-900', 'Windows adapter', 'real runner passes');
    assert.match(skeleton, /process\.platform === 'win32'/u, runner);
    assert.match(skeleton, runner === 'junit-maven' ? /mvn\.cmd/u : /gradle\.bat/u, runner);
    assert.match(skeleton, /ComSpec|cmd\.exe/u, runner);
  }

  for (const relative of ['test/helpers.mjs', 'scripts/package-smoke.mjs', '.tiller/run.cjs']) {
    const content = readFileSync(join(repository, relative), 'utf8');
    assert.doesNotMatch(content, /\/bin\/sh/u, relative);
  }
});

test('CASE-352 CASE-357 Windows cmd invocation keeps one outer command layer and exact Maven argv', async t => {
  const output = await distModule('test-output.js');
  const built = output.runnerFor('junit-maven').build(
    { path: 'src/test/java/com/example/BillingTest.java', name: 'com.example.BillingTest#addsInvoice' },
    { reporter: './reporter.mjs', report: '.tiller/local/verify-x/report.jsonl' },
  );
  const invocation = output.platformProcessInvocation(built.executable, built.args, 'win32', 'C:\\Windows\\System32\\cmd.exe');
  assert.equal(invocation.executable, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(invocation.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(invocation.windowsVerbatimArguments, true);
  assert.equal(invocation.args.length, 4);

  const commandLine = invocation.args[3];
  assert.equal(commandLine.startsWith('"'), true, commandLine);
  assert.equal(commandLine.endsWith('"'), true, commandLine);
  const stripped = commandLine.slice(1, -1);
  assert.equal(stripped, 'mvn.cmd ^"-Dtest=com.example.BillingTest#addsInvoice^" ^"test^"', commandLine);
  assert.deepEqual(built.args, [
    '-Dtest=com.example.BillingTest#addsInvoice',
    'test',
  ]);

  const tricky = output.platformProcessInvocation('mvn', ['space here', 'a&b', '$HOME', '"quoted"'], 'win32',
    'C:\\Windows\\System32\\cmd.exe');
  assert.equal(tricky.args[3], `"mvn.cmd ^"space^ here^" ^"a^&b^" ^"$HOME^" ^"\\^"quoted\\^"^""`);
  assert.doesNotMatch(tricky.args[3], /[^\\^]"\s*"|'b" "\$HOME""/u);

  for (const unsupported of ['100%', 'a!b', 'a^b', 'a\nb']) {
    assert.throws(() => output.platformProcessInvocation('mvn', [unsupported], 'win32',
      'C:\\Windows\\System32\\cmd.exe'), error => error.code === 'VERIFY_COMMAND_UNSUPPORTED', unsupported);
  }

  if (process.platform === 'win32') {
    const root = fixture(t);
    const directory = join(root, 'space dir');
    mkdirSync(directory, { recursive: true });
    const script = join(directory, 'record.cmd');
    writeFileSync(script, [
      '@echo off',
      'setlocal EnableDelayedExpansion',
      'set "ARG1=%~1"',
      'set "ARG2=%~2"',
      'set "ARG3=%~3"',
      'set "ARG4=%~4"',
      '> "%~dp0argv.txt" (',
      '  echo(!ARG1!',
      '  echo(!ARG2!',
      '  echo(!ARG3!',
      '  echo(!ARG4!',
      ')',
      '',
    ].join('\r\n'));
    const native = output.platformProcessInvocation(script, ['space here', 'a&b', '$HOME', '"quoted"'], 'win32',
      process.env.ComSpec || 'cmd.exe');
    const run = spawnSync(native.executable, native.args, { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.deepEqual(readFileSync(join(directory, 'argv.txt'), 'utf8').trim().split(/\r?\n/u),
      ['space here', 'a&b', '$HOME', '"quoted"']);
  }
});

test('CASE-350 unreachable origin fails init preflight before any initialization artifact', async t => {
  const closed = createServer();
  await new Promise((resolve, reject) => {
    closed.once('error', reject);
    closed.listen(0, '127.0.0.1', resolve);
  });
  const address = closed.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise(resolve => closed.close(resolve));

  for (const origin of [`http://127.0.0.1:${port}/owner/repo.git`, 'https://example.invalid/owner/repo.git']) {
    for (const apply of [false, true]) {
      const root = fixture(t);
      okGit(root, 'remote', 'add', 'origin', origin);
      const before = {
        head: okGit(root, 'rev-parse', 'HEAD'),
        refs: okGit(root, 'for-each-ref', '--format=%(refname) %(objectname)'),
        status: okGit(root, 'status', '--porcelain'),
        worktrees: okGit(root, 'worktree', 'list', '--porcelain'),
      };
      const result = invoke(root, ['init', '--platform', 'github', ...(apply ? ['--apply'] : [])], {
        GITHUB_TOKEN: 'preflight-secret-token', GH_TOKEN: '', GITLAB_TOKEN: '', GL_TOKEN: '',
      });
      assert.notEqual(result.status, 0, `${origin} apply=${apply}`);
      assert.equal(result.data.error.code, 'INIT_PREFLIGHT_REMOTE_UNREACHABLE', `${origin} apply=${apply}: ${result.stdout}`);
      assert.match(result.data.error.message, /ls-remote/u);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /preflight-secret-token/u);
      assert.equal(existsSync(join(root, '.tiller/local')), false, `${origin} apply=${apply}`);
      assert.equal(existsSync(join(root, '.tiller/project.json')), false, `${origin} apply=${apply}`);
      assert.equal(okGit(root, 'rev-parse', 'HEAD'), before.head);
      assert.equal(okGit(root, 'for-each-ref', '--format=%(refname) %(objectname)'), before.refs);
      assert.equal(okGit(root, 'status', '--porcelain'), before.status);
      assert.equal(okGit(root, 'worktree', 'list', '--porcelain'), before.worktrees);
    }
  }
});
