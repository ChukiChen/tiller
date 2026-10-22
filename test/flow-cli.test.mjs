import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { initialize } from '../dist/core.js';
import { cli, failure, fixture, put, success } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const task = (root, id) => `.tiller/task/${id}/task.md`;

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function project(t) {
  const root = fixture(t);
  await initialize({ root });
  put(root, 'src/value.txt', 'one\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('baseline', () => assert.equal(1, 1));\n");
  git(root, 'init', '--quiet');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

function editTask(root, id, change) {
  const relative = task(root, id);
  const before = read(root, relative);
  const after = change(before);
  assert.notEqual(after, before);
  put(root, relative, after);
}

function addCaseLibrary(root, files) {
  put(root, '.tiller/specs/cases.md', '# Regression cases\n\nProduct-level requirements.\n');
  for (const [name, value] of Object.entries(files)) {
    put(root, `.tiller/cases/${name}`, `${JSON.stringify(value, null, 2)}\n`);
  }
  git(root, 'add', '.tiller/specs/cases.md', '.tiller/cases');
  git(root, 'commit', '--quiet', '-m', 'global regression cases');
}

test('small flow produces one task file and records verified acceptance without raw logs', async t => {
  const root = await project(t);
  const id = '20261022-small-flow';
  const started = success(cli(root, 'start', id, '--title', 'Small flow', '--requirement', 'Keep the command reliable.',
    '--criterion', 'AC-1=Command exits successfully', '--size', 'small', '--target', 'src', '--target', 'test'));
  assert.equal(started.next.includes('confirm'), true);
  assert.deepEqual(readdirSync(join(root, '.tiller/task', id)), ['task.md']);
  const confirmed = success(cli(root, 'confirm', id, 'requirements', '--quote', '确认这个范围和验收条件'));
  assert.equal(confirmed.object, '需求正文（目标与验收条件）');

  put(root, 'src/value.txt', 'two\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('baseline', () => assert.equal(2, 2));\n");
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::baseline',
    '--command', 'node -e "console.log(1)"', '--run', 'node -e "console.log(1)"'));
  assert.equal(verified.result, 'passed');
  assert.equal(verified.entries[0].source, 'executed');
  git(root, 'add', 'src/value.txt', 'test/baseline.test.mjs');
  git(root, 'commit', '--quiet', '-m', 'implement small change');

  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.deepEqual(checked.criteria, [{ id: 'AC-1', covered: true, test: 'test/baseline.test.mjs::baseline', result: 'passed', commit: verified.commit }]);
  const accepted = success(cli(root, 'accept', id, '--quote', '验收通过'));
  assert.equal(accepted.gate, 'acceptance');
  const content = read(root, task(root, id));
  assert.match(content, /^<!-- tiller-task:v1 /mu);
  assert.match(content, /^## 需求$/mu);
  assert.match(content, /^- 对象：需求正文（目标与验收条件）$/mu);
  assert.match(content, /^- 原话用途：确认凭证，不替代已写明的正文$/mu);
  assert.match(content, /用户原话：确认这个范围和验收条件/u);
  assert.match(content, /用户原话：验收通过/u);
  assert.match(content, /代码树摘要：[a-f0-9]{64}/u);
  assert.deepEqual(readdirSync(join(root, '.tiller/task', id)), ['task.md']);
  assert.equal(existsSync(join(root, '.tiller/task', id, 'reviews')), false);
  assert.equal(existsSync(join(root, '.tiller/task', id, 'verification')), false);
});

test('requirements confirmation binds the written requirement rather than the quote', async t => {
  const root = await project(t);
  const id = '20261022-written-requirement';
  success(cli(root, 'start', id, '--title', 'Written requirement', '--requirement', 'Return a nonzero exit code on failure.',
    '--criterion', 'AC-1=Failure exits nonzero', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认这个需求'));
  editTask(root, id, content => content.replace('Return a nonzero exit code on failure.', 'Return a zero exit code on failure.'));
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('需求确认后需求正文、范围或验收条件已变化')));
});

test('an empty requirement cannot be confirmed by a user quote alone', async t => {
  const root = await project(t);
  const id = '20261022-quote-is-not-requirement';
  success(cli(root, 'start', id, '--title', 'Quote evidence', '--requirement', 'Implement the documented behavior.',
    '--criterion', 'AC-1=Behavior exists', '--size', 'small', '--target', 'src'));
  editTask(root, id, content => content.replace('## 需求\n\nImplement the documented behavior.', '## 需求'));
  const rejected = failure(cli(root, 'confirm', id, 'requirements', '--quote', 'Implement the documented behavior.'));
  assert.equal(rejected.error.code, 'INVALID_FLOW_TASK');
});

test('legacy work records stay read-only and are not listed as current tasks', async t => {
  const root = await project(t);
  put(root, '.tiller/work/legacy/work.md', '# Legacy task\n\nHistorical record only.\n');
  assert.deepEqual(success(cli(root, 'resume')).tasks, []);
  const id = '20261022-current-task';
  success(cli(root, 'start', id, '--title', 'Current task', '--requirement', 'Use the current task directory.',
    '--criterion', 'AC-1=Task is discoverable', '--size', 'small', '--target', 'src'));
  const resumed = success(cli(root, 'resume'));
  assert.deepEqual(resumed.tasks.map(item => item.id), [id]);
  assert.equal(read(root, '.tiller/work/legacy/work.md'), '# Legacy task\n\nHistorical record only.\n');
});

test('standard flow blocks before design confirmation and accepts design after requirements', async t => {
  const root = await project(t);
  const id = '20261022-standard-flow';
  success(cli(root, 'start', id, '--title', 'Standard flow', '--requirement', 'Add a visible behavior.',
    '--criterion', 'AC-1=Behavior is observable', '--type', 'feature', '--size', 'standard', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '需求确认'));
  put(root, 'src/value.txt', 'standard\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'standard implementation');
  const blocked = failure(cli(root, 'check', id));
  assert.ok(blocked.issues.some(issue => issue.includes('设计')));
  failure(cli(root, 'confirm', id, 'design', '--quote', '设计确认'));
  editTask(root, id, content => content.replace('## 确认', '## 设计\n\nUse the existing command boundary.\n\n## 确认'));
  success(cli(root, 'confirm', id, 'design', '--quote', '设计确认'));
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
});

test('verification becomes stale after an in-scope change', async t => {
  const root = await project(t);
  const id = '20261022-stale-verification';
  success(cli(root, 'start', id, '--title', 'Stale verification', '--requirement', 'Detect a stale proof.',
    '--criterion', 'AC-1=Current tree is tested', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  put(root, 'src/value.txt', 'changed after verification\n');
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'change after verification');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.startsWith('AC-1 的验证已过期')));
});

test('requirements confirmation binds the declared scope', async t => {
  const root = await project(t);
  const id = '20261022-scope-confirmation';
  success(cli(root, 'start', id, '--title', 'Scope binding', '--requirement', 'Keep the approved scope.',
    '--criterion', 'AC-1=Scope stays explicit', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认该范围'));
  editTask(root, id, content => content.replace('"scope":["src"]', '"scope":["src","test"]'));
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('需求确认后需求正文、范围或验收条件已变化')));
});

test('scope checks report committed and uncommitted out-of-scope changes', async t => {
  const root = await project(t);
  const id = '20261022-scope-check';
  success(cli(root, 'start', id, '--title', 'Scope check', '--requirement', 'Stay inside src.',
    '--criterion', 'AC-1=src is verified', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'scoped\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'scoped change');
  put(root, 'docs/outside.md', 'outside\n');
  const outside = failure(cli(root, 'check', id));
  assert.ok(outside.issues.some(issue => issue.includes('改动超出范围：docs/outside.md')));
  git(root, 'add', 'docs/outside.md');
  git(root, 'commit', '--quiet', '-m', 'outside change');
  put(root, 'src/value.txt', 'uncommitted scoped change\n');
  const uncommitted = failure(cli(root, 'check', id));
  assert.ok(uncommitted.issues.some(issue => issue.includes('未提交改动：src/value.txt')));
  const committed = failure(cli(root, 'check', id));
  assert.ok(committed.issues.some(issue => issue.includes('改动超出范围：docs/outside.md')));
});

test('pre-existing changes are excluded from scope findings only while unchanged', async t => {
  const root = await project(t);
  put(root, 'docs/outside.md', 'pre-existing edit\n');
  const id = '20261022-preexisting';
  success(cli(root, 'start', id, '--title', 'Pre-existing change', '--requirement', 'Ignore an unrelated dirty file.',
    '--criterion', 'AC-1=src is verified', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'implemented\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'implement scoped change');
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.equal(checked.changedOutsideScope.includes('docs/outside.md'), false);
  put(root, 'docs/outside.md', 'pre-existing edit changed again\n');
  const changed = failure(cli(root, 'check', id));
  assert.ok(changed.issues.some(issue => issue.includes('改动超出范围：docs/outside.md')));
});

test('test weakening and skipped tests block the delivery self-check', async t => {
  const root = await project(t);
  const id = '20261022-test-weakening';
  success(cli(root, 'start', id, '--title', 'Protect tests', '--requirement', 'Do not weaken coverage.',
    '--criterion', 'AC-1=Assertion remains active', '--size', 'small', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  put(root, 'test/baseline.test.mjs', "import test from 'node:test';\ntest('baseline', () => {});\ntest.skip('skipped baseline', () => {});\n");
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', 'test/baseline.test.mjs');
  git(root, 'commit', '--quiet', '-m', 'weaken test');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('弱化测试断言')));
  assert.ok(checked.issues.some(issue => issue.includes('新增跳过或独占测试')));
});

test('removing a test with its retired feature is reported without masking retained assertion loss', async t => {
  const root = await project(t);
  put(root, 'test/legacy.test.mjs', "import test from 'node:test';\ntest('legacy', () => {});\n");
  git(root, 'add', 'test/legacy.test.mjs');
  git(root, 'commit', '--quiet', '-m', 'old feature test');
  const id = '20261022-test-removal';
  success(cli(root, 'start', id, '--title', 'Review test removal', '--requirement', 'Keep retained tests intact.',
    '--criterion', 'AC-1=The retained test proves behavior', '--size', 'small', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  unlinkSync(join(root, 'test/legacy.test.mjs'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs', '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'remove old feature test');
  const removed = success(cli(root, 'check', id));
  assert.ok(removed.warnings.some(issue => issue.includes('删除 1 个测试文件')));
  put(root, 'test/baseline.test.mjs', "import test from 'node:test';\ntest('baseline', () => {});\n");
  git(root, 'add', 'test/baseline.test.mjs');
  git(root, 'commit', '--quiet', '-m', 'weaken retained test');
  const weakened = failure(cli(root, 'check', id));
  assert.ok(weakened.issues.some(issue => issue.includes('弱化测试断言：test/baseline.test.mjs::baseline')));
});

test('unsafe paths and secrets are rejected from records before acceptance', async t => {
  const root = await project(t);
  const id = '20261022-safe-record';
  failure(cli(root, 'start', id, '--title', 'Unsafe', '--requirement', 'Read /home/person/private.txt',
    '--criterion', 'AC-1=No absolute path', '--size', 'small'));
  failure(cli(root, 'start', id, '--title', 'Unsafe quoted path', '--requirement', 'Read "/home/person/private.txt"',
    '--criterion', 'AC-1=No absolute path', '--size', 'small'));
  success(cli(root, 'start', id, '--title', 'Safe record', '--requirement', 'Keep records portable.',
    '--criterion', 'AC-1=No secrets or absolute paths', '--size', 'small', '--target', 'src'));
  failure(cli(root, 'confirm', id, 'requirements', '--quote', 'Use token = abcdefghijklmnop'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  editTask(root, id, content => content.replace('## 确认', '## 设计\n\nAccess token = abcdefghijklmnop\n\n## 确认'));
  failure(cli(root, 'confirm', id, 'design', '--quote', '设计确认'));
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('疑似密钥赋值')));
});

test('accept refuses an unverified task and leaves no acceptance record', async t => {
  const root = await project(t);
  const id = '20261022-accept-block';
  success(cli(root, 'start', id, '--title', 'Accept gate', '--requirement', 'Require proof first.',
    '--criterion', 'AC-1=Proof exists', '--size', 'small', '--target', 'src'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  const rejected = failure(cli(root, 'accept', id, '--quote', '验收通过'));
  assert.equal(rejected.error.code, 'NOT_READY');
  assert.doesNotMatch(read(root, task(root, id)), /验收通过/u);
});

test('global cases accept resolvable refs and report unmapped verification tests', async t => {
  const root = await project(t);
  put(root, 'test/other.test.mjs', "import test from 'node:test';\ntest('other', () => {});\n");
  git(root, 'add', 'test/other.test.mjs');
  addCaseLibrary(root, {
    'flow.json': {
      schemaVersion: 1,
      cases: [{
        id: 'CASE-OTHER', title: 'Other behavior',
        requirements: ['.tiller/specs/cases.md#regression-cases'],
        modules: ['src/value.txt'],
        test_ref: 'test/other.test.mjs::other',
        source: ['src/value.txt'],
      }],
    },
  });
  const id = '20261022-global-cases-mapped';
  success(cli(root, 'start', id, '--title', 'Global case mapping', '--requirement', 'Check regression facts.',
    '--criterion', 'AC-1=The baseline test remains relevant', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'mapped\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::baseline',
    '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'mapped change');
  const checked = success(cli(root, 'check', id));
  assert.deepEqual(checked.cases, { count: 1, matched: 0 });
  assert.ok(checked.warnings.some(item => item.includes('未落在全局用例 test_ref')));
});

test('global cases block broken references and duplicate ids', async t => {
  const root = await project(t);
  addCaseLibrary(root, {
    'a.json': {
      schemaVersion: 1,
      cases: [{
        id: 'CASE-DUP', title: 'Broken case',
        requirements: ['missing.md'], modules: ['src/value.txt'],
        test_ref: 'test/baseline.test.mjs::missing', source: ['src/value.txt'],
      }],
    },
    'b.json': {
      schemaVersion: 1,
      cases: [{
        id: 'CASE-DUP', title: 'Duplicate case',
        requirements: ['.tiller/specs/cases.md'], modules: ['src/value.txt'],
        test_ref: 'test/baseline.test.mjs::baseline', source: ['src/value.txt'],
      }],
    },
  });
  const id = '20261022-global-cases-broken';
  success(cli(root, 'start', id, '--title', 'Broken global cases', '--requirement', 'Reject stale facts.',
    '--criterion', 'AC-1=The test exists', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'broken cases\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::baseline',
    '--command', 'node --test test/baseline.test.mjs', '--result', 'passed'));
  git(root, 'add', 'src/value.txt');
  git(root, 'commit', '--quiet', '-m', 'checked change');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(item => item.includes('id 重复')));
  assert.ok(checked.issues.some(item => item.includes('文件不存在：missing.md')));
  assert.ok(checked.issues.some(item => item.includes('test_ref 用例不存在')));
});

test('default help names the default flow and old audit commands are gone', t => {
  const root = fixture(t);
  const normal = success(cli(root, '--help'));
  assert.match(normal.help, /默认工作流/u);
  assert.match(normal.help, /tiller start/u);
  assert.match(normal.help, /--requirement/u);
  assert.match(normal.help, /task\.md/u);
  assert.doesNotMatch(normal.help, /--goal|work\.md/u);
  assert.doesNotMatch(normal.help, /lite|lightweight/iu);
  assert.doesNotMatch(normal.help, /advanced|work plan register|workflow list/u);
  for (const args of [['advanced'], ['work', 'create'], ['workflow', 'list'], ['planning'], ['task'], ['delivery-check']]) {
    const rejected = failure(cli(root, ...args));
    assert.equal(rejected.error.code, 'INVALID_ARGUMENT', args.join(' '));
    assert.match(rejected.error.message, /未知命令/u, args.join(' '));
  }
});

test('default workflow source uses flow naming instead of lite', () => {
  const source = readFileSync(new URL('../src/flow.ts', import.meta.url), 'utf8');
  assert.equal(existsSync(new URL('../src/lite.ts', import.meta.url)), false);
  assert.match(source, /export async function startFlow/u);
  assert.doesNotMatch(source, /\bLite\b|\blite\b|tiller-lite/u);
});
