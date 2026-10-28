import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  cli, commitFixtures, failure, fixture, initializeSettled, put, read, success, taskRecordRoot,
} from './helpers.mjs';

const initialize = initializeSettled;
const repository = fileURLToPath(new URL('../', import.meta.url));
const taskPath = id => `.tiller/task/${id}/task.md`;
const specPath = '.tiller/specs/modules/workflow/stable-behavior.md';

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function baseline(root) {
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
}

function stableSpec(acceptance = '- AC-1: 已挂载行为可确认') {
  return [
    '# 稳定行为',
    '',
    '## 使用场景',
    '',
    '任务引用稳定规格实现已知行为。',
    '',
    '## 目标',
    '',
    '让任务验收点挂载到全局规格。',
    '',
    '## 业务范围',
    '',
    '- 做：复用稳定 AC-n。',
    '- 不做：只在任务正文新增验收点。',
    '- 假设与待确认：无。',
    '',
    '## 关键行为',
    '',
    '验收点以引用 specs 的正文为准。',
    '',
    '## 异常与边界',
    '',
    '无法挂载时阻断。',
    '',
    '## 验收条件',
    '',
    acceptance,
    '',
  ].join('\n');
}

function editTask(root, id, change) {
  const file = join(taskRecordRoot(root, id), taskPath(id));
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  assert.notEqual(after, before);
  writeFileSync(file, after);
}

function addAcceptance(root, id, line) {
  editTask(root, id, content => content.replace(
    /(^### 验收条件\s*\n[\s\S]*?)(?=^##\s)/mu,
    (_match, block) => `${String(block).trimEnd()}\n${line}\n\n`,
  ));
}

function replaceAcceptance(root, id, before, after) {
  editTask(root, id, content => {
    assert.ok(content.includes(before), content);
    return content.replace(before, after);
  });
}

async function project(t, acceptance) {
  const root = fixture(t);
  await initialize({ root });
  put(root, specPath, stableSpec(acceptance));
  put(root, 'src/value.mjs', 'export const value = 1;\n');
  baseline(root);
  return root;
}

test('CASE-335 specs overflow blocks confirm, check and accept until the referenced specs are written back', async t => {
  const root = await project(t);
  const id = '20261028-overflow-writeback';
  success(cli(root, 'start', id, '--title', '规格溢出回写', '--requirement-file', specPath,
    '--size', 'small', '--target', 'src', '--target', '.tiller/specs'));

  addAcceptance(root, id, '- AC-2: 仅存在于任务的新增验收点');
  const blocked = failure(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  assert.equal(blocked.error.code, 'SPEC_OVERFLOW');
  assert.match(blocked.error.message, /AC-2/u);
  assert.match(blocked.error.message, /规格溢出/u);
  assert.ok(blocked.error.message.includes(specPath), blocked.error.message);
  assert.match(blocked.error.message, /回写/u);
  assert.match(blocked.error.message, /重新确认/u);

  const checked = cli(root, 'check', id);
  assert.notEqual(checked.status, 0);
  assert.ok(checked.data.issues.some(issue => issue.includes('规格溢出') && issue.includes('AC-2')),
    checked.data.issues.join('\n'));

  const accepted = failure(cli(root, 'accept', id, '--by', 'Tiller Test'));
  assert.equal(accepted.error.code, 'SPEC_OVERFLOW');
  assert.match(accepted.error.message, /回写/u);

  put(root, specPath, stableSpec([
    '- AC-1: 已挂载行为可确认',
    '- AC-2: 仅存在于任务的新增验收点',
  ].join('\n')));
  const confirmed = success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  assert.equal(confirmed.confirmed, true);
});

test('CASE-336 spec gate uses referenced paths and AC-n and rejects missing specs, unmounted ACs and divergent text', async t => {
  const root = await project(t);

  const unmountedId = '20261028-overflow-unmounted';
  success(cli(root, 'start', unmountedId, '--title', '未挂载验收点', '--requirement',
    `需求来源：\`${specPath}\``, '--criterion', 'AC-2=任务私有验收点', '--size', 'small',
    '--target', 'src', '--target', '.tiller/specs'));
  const unmounted = failure(cli(root, 'confirm', unmountedId, 'requirements', '--by', 'Tiller Test'));
  assert.equal(unmounted.error.code, 'SPEC_OVERFLOW');
  assert.match(unmounted.error.message, /AC-2/u);
  assert.match(unmounted.error.message, /未挂载/u);

  const missingId = '20261028-overflow-missing';
  success(cli(root, 'start', missingId, '--title', '缺失规格', '--requirement',
    '需求来源：`.tiller/specs/modules/workflow/missing.md`',
    '--criterion', 'AC-1=缺失规格必须失败', '--size', 'small', '--target', 'src'));
  const missing = failure(cli(root, 'confirm', missingId, 'requirements', '--by', 'Tiller Test'));
  assert.equal(missing.error.code, 'SPEC_OVERFLOW');
  assert.match(missing.error.message, /\.tiller\/specs\/modules\/workflow\/missing\.md/u);
  assert.match(missing.error.message, /不存在/u);

  const divergentId = '20261028-overflow-divergent';
  success(cli(root, 'start', divergentId, '--title', '正文差异', '--requirement-file', specPath,
    '--size', 'small', '--target', 'src', '--target', '.tiller/specs'));
  replaceAcceptance(root, divergentId, '- AC-1: 已挂载行为可确认', '- AC-1: 任务私自改写的行为');
  const divergent = failure(cli(root, 'confirm', divergentId, 'requirements', '--by', 'Tiller Test'));
  assert.equal(divergent.error.code, 'SPEC_OVERFLOW');
  assert.match(divergent.error.message, /正文与 specs 不一致/u);

  put(root, specPath, stableSpec('- AC-1: 任务私自改写的行为'));
  success(cli(root, 'confirm', divergentId, 'requirements', '--by', 'Tiller Test'));
});

test('CASE-337 accepted tasks stay on their acceptance evidence when referenced specs change later', async t => {
  const root = await project(t);
  const id = '20261028-overflow-accepted';
  success(cli(root, 'start', id, '--title', '已验收历史', '--requirement-file', specPath,
    '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/specs', '--target', '.tiller/cases'));
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', '已验收历史行为', '--expected', '验收后 specs 变化不追溯失败', '--criterion', 'AC-1', '--spec', specPath));
  put(root, 'test/overflow-accepted.test.mjs', [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    `test('${added.id} accepted history survives later specs drift', () => {`,
    '  assert.ok(true);',
    '});',
    '',
  ].join('\n'));
  commitFixtures(root, 'test(workflow): 适配器历史验收夹具');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--case', added.id));
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));

  put(root, specPath, stableSpec('- AC-9: 验收后新增但不是追溯要求'));
  const checked = cli(root, 'check', id);
  assert.ok(!checked.data.issues.some(issue => issue.includes('规格溢出')), checked.data.issues.join('\n'));
});

test('CASE-338 managed docs and case add require a scanned adapter entry for cross-language CASE coverage', async t => {
  const root = fixture(t);
  put(root, 'pom.xml', 'fixture build file\n');
  const initialized = success(cli(root, 'init'));
  assert.equal(initialized.metadata.verify.runner, 'junit-maven');
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Adapter\n\nUse the adapter.\n\n## 验收条件\n\n- AC-1: 适配器入口挂 CASE\n');
  put(root, 'src/value.mjs', 'export const value = 1;\n');
  baseline(root);

  const id = '20261028-adapter-skeleton';
  success(cli(root, 'start', id, '--title', '适配器骨架', '--requirement', '生成 Java 适配器骨架。',
    '--criterion', 'AC-1=适配器入口挂 CASE', '--size', 'small', '--target', 'src'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'interface',
    '--title', 'Java adapter', '--expected', 'Node 入口转调 Maven', '--criterion', 'AC-1'));
  assert.equal(added.runner, 'junit-maven');
  assert.match(added.skeleton, /import test from 'node:test'/u);
  assert.ok(added.skeleton.includes(added.id), added.skeleton);
  assert.match(added.skeleton, /spawnSync\('mvn'.*ExampleTest#method/u);
  assert.match(added.skeleton, /TODO/u);

  const adapterSpec = readFileSync(join(repository, '.tiller/specs/modules/verification/cross-language-case-adapter.md'), 'utf8');
  assert.match(adapterSpec, /可扫描入口/u);
  assert.match(adapterSpec, /Class#method/u);
  assert.match(adapterSpec, /node-test/u);
  const quality = readFileSync(join(repository, 'resources/rules/quality/verification.md'), 'utf8');
  assert.match(quality, /可扫描入口挂 CASE/u);
  assert.match(quality, /真实 runner/u);
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    const usage = readFileSync(join(repository, relative), 'utf8');
    assert.match(usage, /适配器/u, relative);
    assert.match(usage, /node-test/u, relative);
  }
  assert.equal(JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version, '0.5.0');
  assert.equal(JSON.parse(readFileSync(join(repository, '.tiller/project.json'), 'utf8')).resourceVersion, '0.5.0');
});

test('CASE-339 a node adapter can call junit-maven and remain the CASE-linked verification entry', async t => {
  const root = await project(t);
  const id = '20261028-adapter-verify';
  success(cli(root, 'start', id, '--title', '适配器验证', '--requirement', '通过 Node 入口执行 Maven。',
    '--criterion', 'AC-1=适配器真实转调', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'interface',
    '--title', 'Node 转调 Maven', '--expected', '真实 Maven 结果被核实', '--criterion', 'AC-1', '--spec', specPath));

  const bin = join(root, 'fake-bin');
  mkdirSync(bin, { recursive: true });
  const marker = join(root, 'maven-call.txt');
  const mvn = [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    'const args = process.argv.slice(2);',
    "if (!args.includes('-Dtest=com.example.BillingTest#addsInvoice') || !args.includes('test')) process.exit(2);",
    `writeFileSync(${JSON.stringify(marker)}, args.join(' '));`,
    '',
  ].join('\n');
  put(root, 'fake-bin/mvn', mvn);
  chmodSync(join(bin, 'mvn'), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${previous ?? ''}`;
  try {
    put(root, 'test/adapter.test.mjs', [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { spawnSync } from 'node:child_process';",
      '',
      `test('${added.id} node adapter calls maven', () => {`,
      "  const result = spawnSync('mvn', ['-q', '-Dtest=com.example.BillingTest#addsInvoice', 'test'], { encoding: 'utf8' });",
      "  assert.equal(result.status, 0, result.stderr);",
      '});',
      '',
    ].join('\n'));
    const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--case', added.id));
    assert.equal(verified.entries[0].result, 'passed');
    assert.equal(verified.entries[0].evidence, 'verified');
    assert.match(verified.entries[0].command, /test\/adapter\.test\.mjs/u);
    assert.match(read(root, 'maven-call.txt'), /BillingTest#addsInvoice/u);

    put(root, 'fake-bin/mvn', '#!/usr/bin/env node\nprocess.exit(3);\n');
    const failed = cli(root, 'verify', id, '--criterion', 'AC-1', '--case', added.id);
    assert.notEqual(failed.status, 0);
    assert.equal(failed.data.entries[0].result, 'failed');
    assert.equal(failed.data.entries[0].evidence, 'verified');
  } finally {
    process.env.PATH = previous;
  }
});
