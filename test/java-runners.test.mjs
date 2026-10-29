import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseMetadata } from '../dist/core.js';
import { readRepositoryRecords } from '../dist/repository-paths.js';
import { normalizeVerifyConfig, platformProcessInvocation, resolveVerifyTarget, runnerFor } from '../dist/test-output.js';
import { applyUpgrade, planUpgrade } from '../dist/upgrade.js';
import {  cli, failure, fixture, gitRepository, initializeSettled, put, success, taskRecordRoot, read } from './helpers.mjs';

const repository = fileURLToPath(new URL('..', import.meta.url));
const initialize = initializeSettled;
const paths = {
  reporter: './.tiller/local/verify-x/reporter.mjs',
  report: '.tiller/local/verify-x/report.jsonl',
};
const javaFile = 'src/test/java/com/example/BillingTest.java';
const methodRef = { path: javaFile, name: 'addsInvoice' };
const classRef = { path: 'notes.txt', name: 'com.example.BillingTest' };

function xml(cases) {
  return `<?xml version="1.0"?><testsuite>${cases}</testsuite>`;
}
function testcase(name, body = '', classname = 'com.example.BillingTest') {
  return `<testcase classname="${classname}" name="${name}">${body}</testcase>`;
}

function installJavaTools(root) {
  const bin = join(root, 'fake-bin');
  const mvn = [
    '#!/usr/bin/env node',
    "import { mkdirSync, writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    "const directory = args.find(arg => arg.startsWith('-Dsurefire.reportsDirectory='))?.slice('-Dsurefire.reportsDirectory='.length);",
    "const selected = args.find(arg => arg.startsWith('-Dtest='))?.slice('-Dtest='.length);",
    "if (!directory || !selected || !args.includes('test')) process.exit(2);",
    "const hash = selected.indexOf('#');",
    'const className = hash < 0 ? selected : selected.slice(0, hash);',
    "const method = hash < 0 ? 'wholeClass' : selected.slice(hash + 1);",
    'mkdirSync(directory, { recursive: true });',
    "const body = process.env.FAKE_MAVEN_FAIL === '1' ? '<failure message=\"fixture failure\"/>' : '';",
    'writeFileSync(`${directory}/TEST-${className}.xml`,',
    "  `<?xml version=\"1.0\"?><testsuite><testcase classname=\"${className}\" name=\"${method}\">${body}</testcase></testsuite>\\n`);",
    "process.exit(process.env.FAKE_MAVEN_FAIL === '1' ? 7 : 0);",
    '',
  ].join('\n');
  const gradle = [
    '#!/usr/bin/env node',
    "import { existsSync, mkdirSync, writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    "const directory = args.find(arg => arg.startsWith('-Dtiller.junit.reports='))?.slice('-Dtiller.junit.reports='.length);",
    "const scriptAt = args.indexOf('--init-script');",
    'const script = scriptAt < 0 ? undefined : args[scriptAt + 1];',
    "const testsAt = args.indexOf('--tests');",
    'const selector = testsAt < 0 ? undefined : args[testsAt + 1];',
    "if (!directory || !script || !existsSync(script) || !selector || !args.includes('test')) process.exit(2);",
    'const dot = selector.lastIndexOf(\'.\');',
    'const className = selector.slice(0, dot);',
    'const method = selector.slice(dot + 1);',
    'mkdirSync(directory, { recursive: true });',
    'writeFileSync(`${directory}/TEST-${className}.xml`,',
    "  `<?xml version=\"1.0\"?><testsuite><testcase classname=\"${className}\" name=\"${method}\"/></testsuite>\\n`);",
    '',
  ].join('\n');
  put(root, 'fake-bin/mvn', mvn);
  if (process.platform === 'win32') {
    put(root, 'fake-bin/mvn.cmd', ['@echo off', 'node "%~dp0mvn" %*', ''].join('\r\n'));
  } else {
    symlinkSync('mvn', join(bin, 'mvn.cmd'));
  }
  put(root, 'fake-bin/gradle', gradle);
  chmodSync(join(bin, 'mvn'), 0o755);
  chmodSync(join(bin, 'mvn.cmd'), 0o755);
  chmodSync(join(bin, 'gradle'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${previous ?? ''}`;
  return () => { process.env.PATH = previous; };
}

function windowsCommandTokens(value) {
  const tokens = [];
  let index = 0;
  while (index < value.length) {
    while (value[index] === ' ') index++;
    if (index >= value.length) break;
    let token = '';
    if (value[index] === '"') {
      index++;
      while (index < value.length && value[index] !== '"') token += value[index++];
      if (value[index] !== '"') throw new Error(`unterminated quoted token: ${value}`);
      index++;
    } else {
      while (index < value.length && value[index] !== ' ') token += value[index++];
    }
    tokens.push(token);
  }
  return tokens;
}

function installWindowsCmdFixture(root) {
  if (process.platform === 'win32') return process.env.ComSpec || 'cmd.exe';
  const script = [
    '#!/usr/bin/env node',
    "import { spawnSync } from 'node:child_process';",
    'const args = process.argv.slice(2);',
    "if (args[0] !== '/d' || args[1] !== '/s' || args[2] !== '/c' || typeof args[3] !== 'string') process.exit(2);",
    'const commandLine = args[3];',
    "if (!commandLine.startsWith('\"') || !commandLine.endsWith('\"')) process.exit(3);",
    'const stripped = commandLine.slice(1, -1);',
    "if (stripped.startsWith('\"')) process.exit(1);",
    'const tokens = [];',
    'let index = 0;',
    'while (index < stripped.length) {',
    "  while (stripped[index] === ' ') index++;",
    '  if (index >= stripped.length) break;',
    "  let token = '';",
    "  if (stripped[index] === '\"') {",
    '    index++;',
    "    while (index < stripped.length && stripped[index] !== '\"') token += stripped[index++];",
    "    if (stripped[index] !== '\"') process.exit(4);",
    '    index++;',
    '  } else {',
    "    while (index < stripped.length && stripped[index] !== ' ') token += stripped[index++];",
    '  }',
    '  tokens.push(token);',
    '}',
    "const result = spawnSync(tokens[0], tokens.slice(1), { env: process.env, stdio: 'inherit', windowsHide: true });",
    'process.exit(result.status === null ? 1 : result.status);',
    '',
  ].join('\n');
  put(root, 'fake-bin/cmd.mjs', script);
  chmodSync(join(root, 'fake-bin/cmd.mjs'), 0o755);
  symlinkSync('cmd.mjs', join(root, 'fake-bin/cmd.exe'));
  return join(root, 'fake-bin/cmd.exe');
}

function projectMetadata(overrides) {
  return {
    schemaVersion: 1, resourceVersion: '0.5.0', mode: 'workspace', repositories: [],
    managedFiles: {}, createdAt: '2026-10-23T00:00:00.000Z', ...overrides,
  };
}

test('CASE-169 junit-maven builds a precise selector and counts only the declared result', async () => {
  const maven = runnerFor('junit-maven');
  const built = maven.build(methodRef, paths);
  assert.equal(built.executable, 'mvn');
  assert.deepEqual(built.args, [
    '-Dsurefire.reportsDirectory=.tiller/local/verify-x',
    '-Dtest=com.example.BillingTest#addsInvoice',
    'test',
  ]);
  assert.match(built.display, /mvn -Dsurefire\.reportsDirectory=\.tiller\/local\/verify-x '-Dtest=com\.example\.BillingTest#addsInvoice' test/u);
  const named = maven.build({ path: 'anywhere.txt', name: 'com.example.BillingTest#addsInvoice' }, paths);
  assert.equal(named.args[1], '-Dtest=com.example.BillingTest#addsInvoice');
  const whole = maven.build({ path: javaFile }, paths);
  assert.equal(whole.args[1], '-Dtest=com.example.BillingTest');
  assert.throws(() => maven.build({ path: 'BillingTest.java', name: 'addsInvoice' }, paths), error => error.code === 'VERIFY_SELECTOR_INVALID');
  const passing = xml(testcase('addsInvoice') + testcase('other', '<failure/>', 'com.example.Other'));
  assert.equal(maven.parse(passing, methodRef, 'ignored').verified, true);
  assert.equal(maven.parse(xml(testcase('addsInvoice') + testcase('addsInvoice')), methodRef, 'ignored').verified, false);
  assert.equal(maven.parse(xml(testcase('missing')), methodRef, 'ignored').verified, false);
  assert.equal(maven.parse(xml(testcase('addsInvoice', '<skipped/>')), methodRef, 'ignored').verified, false);
  assert.equal(maven.parse(xml(testcase('addsInvoice') + testcase('other', '<failure/>')), methodRef, 'ignored').verified, false);
  assert.equal(maven.parse('not xml', methodRef, 'ignored').verified, false);
  assert.equal(maven.parse('', methodRef, 'ignored').verified, false);
  assert.equal(maven.parse(xml(testcase('addsInvoice') + testcase('skips', '<skipped/>')), classRef, 'ignored').verified, false);
  assert.equal(maven.parse(xml(testcase('addsInvoice') + testcase('also')), classRef, 'ignored').outcome, 'passed');
  const directory = mkdtempSync(join(tmpdir(), 'tiller-junit-'));
  writeFileSync(join(directory, 'b.xml'), xml(testcase('later')));
  writeFileSync(join(directory, 'a.xml'), xml(testcase('addsInvoice')));
  const loaded = await maven.loadReport(join(directory, 'report.jsonl'), directory);
  assert.equal(maven.parse(loaded, methodRef, 'ignored').verified, true);
});

test('CASE-353 Windows junit-maven cmd fixture writes and verifies the private Surefire report', async t => {
  const root = fixture(t);
  const restore = installJavaTools(root);
  try {
    mkdirSync(join(root, 'src/test/java/com/example'), { recursive: true });
    writeFileSync(join(root, javaFile), 'package com.example; class BillingTest {}\n');
    put(root, '.tiller/project.json', `${JSON.stringify(projectMetadata({
      mode: 'project', verify: { runner: 'junit-maven' },
    }), null, 2)}\n`);
    const comSpec = installWindowsCmdFixture(root);
    const maven = runnerFor('junit-maven');
    const report = '.tiller/local/verify-x/report.jsonl';
    const built = maven.build(methodRef, { reporter: './reporter.mjs', report });
    const invocation = platformProcessInvocation(built.executable, built.args, 'win32', comSpec);
    assert.equal(invocation.windowsVerbatimArguments, true);
    const stripped = invocation.args[3].slice(1, -1);
    assert.equal(stripped.startsWith('mvn.cmd '), true, invocation.args[3]);
    assert.deepEqual(windowsCommandTokens(stripped), ['mvn.cmd', ...built.args]);
    assert.match(stripped, /-Dsurefire\.reportsDirectory=\.tiller\/local\/verify-x/u);
    assert.match(stripped, /-Dtest=com\.example\.BillingTest#addsInvoice/u);

    const passed = spawnSync(invocation.executable, invocation.args, {
      cwd: root, env: process.env, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    });
    assert.ifError(passed.error);
    assert.equal(passed.status, 0, passed.stderr || passed.stdout);
    const reportDirectory = join(root, '.tiller/local/verify-x');
    const passedReport = await maven.loadReport(join(reportDirectory, 'report.jsonl'), reportDirectory);
    const passedEvidence = maven.parse(passedReport, methodRef, join(root, javaFile));
    assert.equal(passedEvidence.verified, true, passedEvidence.reason);
    assert.equal(passedEvidence.outcome, 'passed');

    const failed = spawnSync(invocation.executable, invocation.args, {
      cwd: root, env: { ...process.env, FAKE_MAVEN_FAIL: '1' }, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    });
    assert.ifError(failed.error);
    assert.equal(failed.status, 7);
    const failedReport = await maven.loadReport(join(reportDirectory, 'report.jsonl'), reportDirectory);
    const failedEvidence = maven.parse(failedReport, methodRef, join(root, javaFile));
    assert.equal(failedEvidence.verified, true, failedEvidence.reason);
    assert.equal(failedEvidence.outcome, 'failed');

    rmSync(reportDirectory, { recursive: true, force: true });
    assert.equal(maven.parse(await maven.loadReport(join(reportDirectory, 'report.jsonl'), reportDirectory), methodRef,
      join(root, javaFile)).verified, false);
  } finally {
    restore();
  }
});

test('CASE-170 junit-gradle builds a precise selector and counts only the declared result', async () => {
  const gradle = runnerFor('junit-gradle');
  const built = gradle.build({ path: 'anywhere.txt', name: 'com.example.BillingTest#addsInvoice' }, paths);
  assert.equal(built.executable, 'gradle');
  assert.deepEqual(built.args, [
    '-Dtiller.junit.reports=.tiller/local/verify-x',
    '--init-script',
    '.tiller/local/verify-x/junit-gradle.init.gradle',
    'test',
    '--tests',
    'com.example.BillingTest.addsInvoice',
  ]);
  assert.equal(built.files?.[0]?.name, 'junit-gradle.init.gradle');
  assert.match(built.files?.[0]?.content ?? '', /tiller\.junit\.reports/u);
  assert.match(built.files?.[0]?.content ?? '', /junitXml/u);
  assert.match(built.display, /gradle -Dtiller\.junit\.reports=\.tiller\/local\/verify-x --init-script \.tiller\/local\/verify-x\/junit-gradle\.init\.gradle test --tests com\.example\.BillingTest\.addsInvoice/u);
  const whole = gradle.build({ path: javaFile }, paths);
  assert.equal(whole.args.at(-1), 'com.example.BillingTest');
  assert.throws(() => gradle.build({ path: 'BillingTest.java', name: 'adds invoice' }, paths), error => error.code === 'VERIFY_SELECTOR_INVALID');
  const passing = xml(testcase('addsInvoice') + testcase('bad', '<error/>', 'com.example.Other'));
  assert.equal(gradle.parse(passing, methodRef, 'ignored').verified, true);
  assert.equal(gradle.parse(xml(testcase('addsInvoice', '<skipped/>')), methodRef, 'ignored').verified, false);
  assert.equal(gradle.parse(xml(testcase('addsInvoice') + testcase('addsInvoice')), methodRef, 'ignored').reason, '私有报告匹配到 2 个测试。');
  assert.equal(gradle.parse('<testcase', methodRef, 'ignored').verified, false);
  const directory = mkdtempSync(join(tmpdir(), 'tiller-gradle-'));
  writeFileSync(join(directory, 'TEST-com.example.BillingTest.xml'), xml(testcase('addsInvoice', '<failure/>')));
  const loaded = await gradle.loadReport(join(directory, 'report.jsonl'), directory);
  const failed = gradle.parse(loaded, methodRef, 'ignored');
  assert.equal(failed.verified, true);
  assert.equal(failed.outcome, 'failed');
});

test('CASE-172 verify fails closed for an unknown runner or a path that is not uniquely owned', () => {
  assert.deepEqual(normalizeVerifyConfig({ runner: 'pytest' }, '工程'), { runner: 'pytest' });
  assert.throws(() => normalizeVerifyConfig({ runner: 'cargo' }, '工程'), /node-test、junit-maven、junit-gradle、pytest/);
  assert.throws(() => readRepositoryRecords({
    repositories: [{ id: 'billing', path: 'repositories/billing', verify: { runner: 'cargo' } }],
  }), /junit-maven/);
  assert.throws(() => runnerFor('cargo'), error => error.code === 'UNKNOWN_VERIFY_RUNNER');
  const shared = projectMetadata({
    verify: { runner: 'junit-gradle', prepare: ['node', 'root-prepare.mjs'] },
    repositories: [
      { id: 'billing', path: 'repositories/billing', verify: { prepare: ['node', 'billing-prepare.mjs'] } },
      { id: 'web', path: 'repositories/web', verify: { runner: 'node-test' } },
      { id: 'group', path: 'repositories' },
    ],
  });
  const billing = resolveVerifyTarget(shared, { path: 'repositories/billing/src/test/java/com/example/BillingTest.java', name: 'addsInvoice' });
  assert.equal(billing.runner, 'junit-gradle');
  assert.deepEqual(billing.prepare, ['node', 'billing-prepare.mjs']);
  assert.equal(billing.cwd, 'repositories/billing');
  assert.equal(billing.reference.path, 'src/test/java/com/example/BillingTest.java');
  assert.equal(billing.repositoryId, 'billing');
  const webJava = resolveVerifyTarget(shared, { path: 'repositories/web/src/test/java/com/example/WebTest.java', name: 'renders' });
  assert.equal(webJava.runner, 'node-test');
  assert.deepEqual(webJava.prepare, ['node', 'root-prepare.mjs']);
  const script = resolveVerifyTarget(shared, { path: 'repositories/billing/test/billing.test.mjs', name: 'totals' });
  assert.equal(script.runner, 'junit-gradle');
  assert.throws(() => resolveVerifyTarget(shared, { path: 'test/orphan.test.mjs' }), error => error.code === 'VERIFY_REPOSITORY_UNRESOLVED');
  assert.throws(() => resolveVerifyTarget(shared, { path: 'repositories/billing/../web/file.java' }), error => error.code === 'VERIFY_REPOSITORY_UNRESOLVED');
  const tied = projectMetadata({
    repositories: [{ id: 'left', path: 'same/path' }, { id: 'right', path: 'same/path' }],
  });
  assert.throws(() => resolveVerifyTarget(tied, { path: 'same/path/File.java' }), /同时属于多个仓库/);
  const project = resolveVerifyTarget(projectMetadata({
    mode: 'project', verify: { runner: 'junit-maven', prepare: ['node', 'prepare.mjs'] },
  }), { path: javaFile, name: 'addsInvoice' });
  assert.equal(project.runner, 'junit-maven');
  assert.equal(project.cwd, '.');
  assert.equal(project.repositoryId, undefined);
});

test('CASE-168 workspace uses each repository runner and runs prepare in that repository', async t => {
  const root = fixture(t);
  const restore = installJavaTools(root);
  try {
    gitRepository(root, 'repositories/billing');
    gitRepository(root, 'repositories/web');
    gitRepository(root, 'repositories/ledger');
    await initialize({
      root, mode: 'workspace',
      repositories: ['repositories/billing', 'repositories/web', 'repositories/ledger'],
    });
    const metadata = JSON.parse(read(root, '.tiller/project.json'));
    metadata.verify = { runner: 'junit-maven' };
    metadata.repositories = metadata.repositories.map(item => {
      if (item.id === 'billing') return { ...item, verify: { prepare: ['node', 'prepare.mjs'] } };
      if (item.id === 'web') return { ...item, verify: { runner: 'node-test' } };
      return { ...item, verify: { runner: 'junit-gradle' } };
    });
    put(root, '.tiller/project.json', `${JSON.stringify(metadata, null, 2)}\n`);
    put(root, 'repositories/billing/prepare.mjs', "import { writeFileSync } from 'node:fs';\nwriteFileSync('prepare-cwd.txt', process.cwd());\n");
    put(root, 'repositories/billing/src/test/java/com/example/BillingTest.java', 'class BillingTest {}\n');
    put(root, 'repositories/ledger/src/test/java/com/example/BillingTest.java', 'class BillingTest {}\n');
    put(root, 'repositories/web/test/web.test.mjs', "import test from 'node:test';\n\ntest('web passes', () => {});\n");
    put(root, 'test/orphan.test.mjs', "import test from 'node:test';\n\ntest('orphan', () => {});\n");
    const id = '20261023-repo-runners';
    success(cli(root, 'start', id, '--title', '多仓库验证', '--requirement', '按所属仓库选择运行器。',
      '--criterion', 'AC-1=命中所属仓库', '--size', 'small', '--target', 'repositories', '--target', 'test'));
    const billing = success(cli(root, 'verify', id, '--criterion', 'AC-1',
      '--test', 'repositories/billing/src/test/java/com/example/BillingTest.java::com.example.BillingTest#addsInvoice'));
    assert.equal(billing.entries[0].evidence, 'verified');
    assert.equal(billing.entries[0].result, 'passed');
    assert.match(billing.entries[0].command, /^repositories\/billing\$ mvn /u);
    assert.match(billing.entries[0].command, /'-Dtest=com\.example\.BillingTest#addsInvoice'/u);
    assert.match(billing.entries[0].command, /-Dsurefire\.reportsDirectory=\.\.\/\.\.\/\.tiller\/local\/verify-/u);
    assert.match(read(root, 'repositories/billing/prepare-cwd.txt'), /(?:^|\/)repositories\/billing$/u);
    assert.equal(read(existsSync(join(root, billing.log)) ? root : taskRecordRoot(root, id), billing.log).includes(root), false);
    assert.equal(read(taskRecordRoot(root, id), `.tiller/task/${id}/task.md`).includes(root), false);
    const web = success(cli(root, 'verify', id, '--criterion', 'AC-1',
      '--test', 'repositories/web/test/web.test.mjs::web passes'));
    assert.equal(web.entries[0].evidence, 'verified');
    assert.match(web.entries[0].command, /^repositories\/web\$ node /u);
    assert.match(web.entries[0].command, /--test-reporter=\.\/\.\.\/\.\.\/\.tiller\/local\/verify-/u);
    assert.match(web.entries[0].command, /test\/web\.test\.mjs$/u);
    assert.equal(read(existsSync(join(root, web.log)) ? root : taskRecordRoot(root, id), web.log).includes(root), false);
    const ledger = success(cli(root, 'verify', id, '--criterion', 'AC-1',
      '--test', 'repositories/ledger/src/test/java/com/example/BillingTest.java::com.example.BillingTest#addsInvoice'));
    assert.equal(ledger.entries[0].evidence, 'verified');
    assert.match(ledger.entries[0].command, /^repositories\/ledger\$ gradle /u);
    assert.match(ledger.entries[0].command, /--tests com\.example\.BillingTest\.addsInvoice/u);
    assert.match(ledger.entries[0].command, /--init-script \.\.\/\.\.\/\.tiller\/local\/verify-[^ ]+\/junit-gradle\.init\.gradle/u);
    const orphan = failure(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/orphan.test.mjs::orphan'));
    assert.equal(orphan.error.code, 'VERIFY_REPOSITORY_UNRESOLVED');
    const reported = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/orphan.test.mjs::orphan',
      '--reported', '--command', 'cargo test -q', '--result', 'passed', '--reason', '该框架尚未适配'));
    assert.equal(reported.entries[0].source, 'reported');
    assert.equal(reported.entries[0].evidence, 'not-run');
    assert.equal(reported.entries[0].command, 'cargo test -q');
  } finally {
    restore();
  }
});

test('CASE-171 repository records keep id and path and still read a legacy string list', async t => {
  const project = fixture(t);
  const initialized = await initialize({ root: project });
  assert.deepEqual(initialized.metadata.repositories, []);
  assert.equal(Object.hasOwn(initialized.metadata, 'repositoryPaths'), false);
  const withSidecar = JSON.parse(read(project, '.tiller/project.json'));
  withSidecar.repositoryPaths = {};
  put(project, '.tiller/project.json', `${JSON.stringify(withSidecar, null, 2)}\n`);
  const dropSidecar = await planUpgrade(project);
  assert.equal(dropSidecar.ready, true, dropSidecar.conflicts.join('\n'));
  assert.ok(dropSidecar.changes.some(change => change.path === '.tiller/project.json'));
  assert.equal((await applyUpgrade(project, dropSidecar.planId)).ready, true);
  assert.equal(Object.hasOwn(JSON.parse(read(project, '.tiller/project.json')), 'repositoryPaths'), false);
  assert.deepEqual((await planUpgrade(project)).changes, []);

  const root = fixture(t);
  gitRepository(root, 'repositories/service-a');
  await initialize({ root, mode: 'workspace', repositories: ['repositories/service-a'] });
  const filename = '.tiller/project.json';
  const current = JSON.parse(read(root, filename));
  assert.deepEqual(current.repositories, [{ id: 'service-a', path: 'repositories/service-a' }]);
  current.repositories[0].verify = { runner: 'junit-maven' };
  const withVerify = `${JSON.stringify(current, null, 2)}\n`;
  put(root, filename, withVerify);
  assert.equal(parseMetadata(withVerify).repositories[0].verify.runner, 'junit-maven');
  assert.deepEqual((await planUpgrade(root)).changes, []);
  const legacy = {
    ...current,
    repositories: ['service-a'],
    repositoryPaths: { 'service-a': 'repositories/service-a' },
  };
  put(root, filename, `${JSON.stringify(legacy, null, 2)}\n`);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.ok(plan.changes.some(change => change.path === '.tiller/project.json' && !change.after.includes('repositoryPaths')));
  assert.equal((await applyUpgrade(root, plan.planId)).ready, true);
  const migrated = JSON.parse(read(root, filename));
  assert.deepEqual(migrated.repositories, [{ id: 'service-a', path: 'repositories/service-a' }]);
  assert.equal(Object.hasOwn(migrated, 'repositoryPaths'), false);
  assert.deepEqual((await planUpgrade(root)).changes, []);
  assert.throws(() => parseMetadata(JSON.stringify({ ...migrated, repositories: ['service-a'] })), /映射/u);
});

test('CASE-173 decisions and usage name the Java runners and keep version 0.5.0', () => {
  const decisions = read(repository, '.tiller/specs/decisions.md');
  const design = read(repository, '.tiller/specs/modules/verification/design.md');
  assert.match(decisions, /2026-10-23 多仓库验证与 Java 运行器/u);
  assert.match(decisions, /junit-maven/u);
  assert.match(decisions, /junit-gradle/u);
  assert.match(decisions, /0\.5\.0/u);
  assert.match(decisions, /--reported/u);
  assert.match(design, /junit-maven/u);
  assert.match(design, /junit-gradle/u);
  assert.match(design, /mvn -Dsurefire\.reportsDirectory/u);
  assert.match(design, /gradle -Dtiller\.junit\.reports/u);
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    const usage = read(repository, relative);
    assert.match(usage, /junit-maven/u, relative);
    assert.match(usage, /junit-gradle/u, relative);
  }
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
});
