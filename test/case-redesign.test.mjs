import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseCaseMarkdown, readCaseLibrary } from '../dist/cases.js';
import { cli, completeDesign, confirmTask, failure, fixture, put, success, read, commitFixtures } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const taskId = '20261022-fixture';

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function project(t) {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, '.tiller/specs/modules/workflow/requirements.md',
    '# Workflow\n\n## Case design\n\nCases describe tests before implementation.\n');
  put(root, '.tiller/specs/modules/workflow/design.md',
    '# Workflow design\n\nTests reference stable case ids.\n');
  put(root, 'src/value.txt', 'one\n');
  return root;
}

function baseline(root) {
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'chore(workflow): 建立测试基线');
}

function start(root, id, size = 'small') {
  return success(cli(root, 'start', id, '--title', '用例设计资产', '--requirement', '用例先写清测试设计，再由测试名称引用。',
    '--criterion', 'AC-1=用例与测试可以双向定位', '--size', size, '--target', 'src', '--target', 'test', '--target', '.tiller'));
}

function addCase(root, id, extra = {}) {
  const args = ['case', 'add', id, '--module', extra.module ?? 'workflow', '--kind', extra.kind ?? 'behavior',
    '--title', extra.title ?? '用例设计可先于测试登记',
    '--precondition', '任务与模块规范存在。', '--step', '登记用例，然后由测试名称引用编号。',
    '--input', '正常输入与必要边界。', '--expected', '用例可被引用它的具名测试定位。'];
  if (extra.scenario) args.push('--scenario', extra.scenario);
  return success(cli(root, ...args));
}

function caseMarkdown(id, title, options = {}) {
  const kind = options.kind ?? 'behavior';
  const module = options.module ?? 'workflow';
  return `# ${module} / ${kind}

## ${id} ${title}

- 类型：${kind}
- 优先级：medium
- 模块：${module}
- 关联 AC：无
- 需求：\`.tiller/specs/modules/${module}/requirements.md\`

### 前置条件

- 模块与测试环境可用。

### 步骤

1. 执行引用 ${id} 的测试。

### 输入

- 正常输入。

### 预期结果

测试通过。
`;
}

const sourceTest = (name, body) => `test(${JSON.stringify(name)}, () => ${body});`;

function fillDesign(root, id) {
  completeDesign(root, id);
}

test('CASE-098 case add registers a complete test design before any test exists', async t => {
  const root = await project(t);
  start(root, taskId);
  const first = addCase(root, taskId);
  assert.equal(first.id, 'CASE-001');
  assert.equal(first.status, 'pending');
  assert.match(first.skeleton, /CASE-001/u);
  const path = '.tiller/cases/modules/workflow/behavior.md';
  const content = read(root, path);
  for (const expected of ['### 前置条件', '### 步骤', '### 输入', '### 预期结果', '- 类型：behavior',
    '- 优先级：medium', '- 关联 AC：无']) assert.ok(content.includes(expected), expected);
  assert.doesNotMatch(content, /test_ref|文件::测试名/u);
  assert.deepEqual(readdirSync(join(root, 'test')), ['.gitkeep']);

  put(root, path, `${content.trimEnd()}\n\n<!-- 手工示例引用 CASE-999 不应占用编号。 -->\n`);
  const second = addCase(root, taskId, { title: '第二条用例' });
  assert.equal(second.id, 'CASE-002');
});

test('CASE-263 case add needs no criterion, writes no task AC and rejects the old option', async t => {
  const root = await project(t);
  start(root, taskId);
  const added = addCase(root, taskId, { title: '稳定需求用例' });
  assert.deepEqual(added.criteria, []);
  const content = read(root, added.path);
  assert.match(content, /- 关联 AC：无/u);
  assert.match(content, /- 需求：`\.tiller\/specs\/modules\/workflow\/requirements\.md`/u);
  assert.doesNotMatch(content, new RegExp(`${taskId}#AC-`, 'u'));

  const help = success(cli(root, '--help')).help;
  assert.doesNotMatch(help, /case add[^\n]*--criterion/u);
  const rejected = failure(cli(root, 'case', 'add', taskId, '--module', 'workflow', '--kind', 'behavior',
    '--title', '旧 criterion 应拒绝', '--expected', '拒绝旧参数。', '--criterion', 'AC-1'));
  assert.equal(rejected.error.code, 'INVALID_ARGUMENT');

  put(root, 'docs/requirement.md', '# 不稳定需求\n');
  const unstable = failure(cli(root, 'case', 'add', taskId, '--module', 'workflow', '--kind', 'behavior',
    '--title', '需求路径必须稳定', '--expected', '拒绝非 specs 路径。', '--spec', 'docs/requirement.md'));
  assert.equal(unstable.error.code, 'INVALID_CASE_INPUT');
});

test('CASE-258 case add writes no source field and rejects the removed --source option', async t => {
  const root = await project(t);
  start(root, taskId);
  const added = success(cli(root, 'case', 'add', taskId, '--module', 'workflow', '--kind', 'behavior',
    '--title', '无源码字段的用例', '--expected', '用例设计只关联测试与 CASE 编号。'));
  const content = read(root, added.path);
  assert.doesNotMatch(content, /^- 源码：|--source/mu);
  assert.match(content, new RegExp(`^## ${added.id} `, 'mu'));

  const rejected = failure(cli(root, 'case', 'add', taskId, '--module', 'workflow', '--kind', 'behavior',
    '--title', '旧参数应失败', '--expected', '旧参数被拒绝。', '--source', 'src/value.txt'));
  assert.match(rejected.error.message, /Unknown option '--source'|--source.*不适用|--source.*未知/u);
  assert.doesNotMatch(read(root, added.path), /旧参数应失败/u);
});

test('CASE-259 historical cases parse without a source field and ignore residual source lines', async t => {
  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  assert.ok(library.cases.length > 0);
  assert.ok(library.cases.every(item => !Object.hasOwn(item, 'source')));

  const relative = '.tiller/cases/modules/workflow/behavior.md';
  const withoutSource = parseCaseMarkdown(caseMarkdown('CASE-990', '无源码字段仍可解析'), relative, 'behavior', 'workflow');
  assert.deepEqual(withoutSource.issues, []);
  assert.equal(withoutSource.cases.length, 1);
  assert.equal(Object.hasOwn(withoutSource.cases[0], 'source'), false);

  const legacy = caseMarkdown('CASE-991', '旧源码行被忽略').replace(
    '- 需求：', '- 源码：`src/legacy-path-that-is-no-longer-required.ts`\n- 需求：');
  const parsed = parseCaseMarkdown(legacy, relative, 'behavior', 'workflow');
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.cases.length, 1);
  assert.equal(Object.hasOwn(parsed.cases[0], 'source'), false);
});

test('CASE-266 historical task AC and empty criteria stay readable without hard blocking', async t => {
  const root = fixture(t);
  const relative = '.tiller/cases/modules/workflow/behavior.md';
  const empty = parseCaseMarkdown(caseMarkdown('CASE-992', '空关联 AC 可读').replace('- 关联 AC：无\n', ''), relative, 'behavior', 'workflow');
  assert.deepEqual(empty.issues, []);
  assert.deepEqual(empty.cases[0].criteria, []);
  const legacy = parseCaseMarkdown(caseMarkdown('CASE-993', '历史 task AC 可读').replace('- 关联 AC：无', '- 关联 AC：20260101-old-task#AC-1'),
    relative, 'behavior', 'workflow');
  assert.deepEqual(legacy.issues, []);
  assert.deepEqual(legacy.cases[0].criteria, ['20260101-old-task#AC-1']);

  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  assert.ok(library.warnings.some(value => value.includes('历史用例') && value.includes('任务') && value.includes('AC')));
  assert.ok(library.warnings.some(value => value.includes('关联 AC 为无')));
  assert.equal(success(cli(root, '--version')).version, '0.5.0');
});

test('CASE-099 test scan derives case to test links without stored test refs', async t => {
  const root = await project(t);
  const path = '.tiller/cases/modules/workflow/behavior.md';
  put(root, path, caseMarkdown('CASE-001', 'scan target'));
  put(root, 'test/coverage.test.mjs', `import assert from 'node:assert/strict';
import test from 'node:test';

${sourceTest('CASE-001 named fixture', 'assert.equal(1, 1)')}
// CASE-001
${sourceTest('comment fixture', 'assert.equal(2, 2)')}
`);
  const library = await readCaseLibrary(root);
  assert.deepEqual(library.issues, []);
  const item = library.cases[0];
  assert.equal(item.id, 'CASE-001');
  assert.equal(item.status, 'implemented');
  assert.deepEqual(item.tests.map(value => value.name), ['CASE-001 named fixture', 'comment fixture']);
  assert.equal('testRef' in item, false);
  assert.equal('test_ref' in item, false);
  const help = success(cli(root, '--help')).help;
  assert.doesNotMatch(help, /case link|test_ref/u);
});

test('CASE-100 pending cases unknown ids and many-to-many coverage are explicit', async t => {
  const root = await project(t);
  put(root, '.tiller/cases/modules/workflow/behavior.md',
    `${caseMarkdown('CASE-001', 'shared target')}\n${caseMarkdown('CASE-002', 'second target')}\n${caseMarkdown('CASE-003', 'pending target')}`);
  put(root, 'test/coverage.test.mjs', `import assert from 'node:assert/strict';
import test from 'node:test';

${sourceTest('CASE-001 CASE-002 shared fixture', 'assert.equal(1, 1)')}
// CASE-002
${sourceTest('second fixture', 'assert.equal(2, 2)')}
${sourceTest('CASE-999 unknown fixture', 'assert.equal(3, 3)')}
`);
  const library = await readCaseLibrary(root);
  const byId = new Map(library.cases.map(item => [item.id, item]));
  assert.deepEqual(byId.get('CASE-001').tests.map(value => value.name), ['CASE-001 CASE-002 shared fixture']);
  assert.deepEqual(byId.get('CASE-002').tests.map(value => value.name), ['CASE-001 CASE-002 shared fixture', 'second fixture']);
  assert.equal(byId.get('CASE-003').status, 'pending');
  assert.ok(library.warnings.some(value => value.includes('CASE-003 待实现')));
  assert.ok(library.issues.some(value => value.includes('测试 test/coverage.test.mjs::CASE-999 unknown fixture 引用了不存在的用例 CASE-999')));
});

test('CASE-101 verify case executes every covering test', async t => {
  const root = await project(t);
  baseline(root);
  start(root, taskId);
  success(confirmTask(root, taskId, 'requirements', '--by', 'Tiller Test'));
  const added = addCase(root, taskId);
  put(root, 'test/covered.test.mjs', `import assert from 'node:assert/strict';
import test from 'node:test';

${sourceTest('CASE-001 first covering test', 'assert.equal(1, 1)')}
${sourceTest('CASE-001 second covering test', 'assert.equal(2, 2)')}
`);
  const verified = success(cli(root, 'verify', taskId, '--criterion', 'AC-1', '--case', added.id));
  assert.equal(verified.ready, true);
  assert.deepEqual(verified.cases, ['CASE-001']);
  assert.deepEqual(verified.tests, ['test/covered.test.mjs::CASE-001 first covering test',
    'test/covered.test.mjs::CASE-001 second covering test']);
  assert.equal(verified.entries.length, 2);
  assert.ok(verified.entries.every(entry => entry.source === 'executed' && entry.evidence === 'verified'));
});

test('CASE-102 check enforces cases after design and tests after verification', async t => {
  const root = await project(t);
  baseline(root);
  start(root, taskId, 'standard');
  fillDesign(root, taskId);
  success(confirmTask(root, taskId, 'requirements', '--by', 'Tiller Test'));
  success(confirmTask(root, taskId, 'design', '--by', 'Tiller Test'));
  const missingCase = failure(cli(root, 'check', taskId));
  assert.ok(missingCase.issues.some(value => value.includes('AC-1 未绑定全局用例')), missingCase.issues.join('\n'));

  const added = addCase(root, taskId);
  const missingTest = failure(cli(root, 'check', taskId));
  assert.ok(!missingTest.issues.some(value => value.includes('未绑定全局用例')), missingTest.issues.join('\n'));
  assert.ok(!missingTest.issues.some(value => value.includes(`${added.id} 待实现`)), missingTest.issues.join('\n'));
  assert.ok(missingTest.issues.some(value => value.includes('AC-1 尚无验证')), missingTest.issues.join('\n'));

  put(root, 'test/covered.test.mjs', `import assert from 'node:assert/strict';
import test from 'node:test';

${sourceTest('CASE-001 staged coverage', 'assert.equal(1, 1)')}
`);
  success(cli(root, 'verify', taskId, '--criterion', 'AC-1', '--case', added.id));
  commitFixtures(root, 'test(workflow): 补充用例测试');
  const checked = success(cli(root, 'check', taskId));
  assert.equal(checked.ready, true, checked.issues.join('\n'));

  put(root, 'test/covered.test.mjs', `import test from 'node:test';

${sourceTest('staged coverage without a case id', 'undefined')}
`);
  const stale = failure(cli(root, 'check', taskId));
  assert.ok(stale.issues.some(value => value.includes(`${added.id} 待实现`)), stale.issues.join('\n'));
  assert.ok(stale.issues.some(value => value.includes('验证已过期')), stale.issues.join('\n'));
  assert.ok(!stale.issues.some(value => value.includes(`${added.id} 的验证测试`) && value.includes('测试引用不一致')),
    '过期验证只报告过期，不再叠加新的测试引用阻断');
});

test('CASE-103 CASE-156 repository history and docs use the new case model', async () => {
  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  assert.equal(library.cases.length, 296);
  assert.ok(library.cases.every(item => item.preconditions.length && item.steps.length && item.inputs.length && item.expected));
  assert.ok(library.cases.every(item => item.tests.length > 0), 'every case should be referenced by a test');
  assert.ok(library.cases.every(item => item.tests.every(reference => reference.name?.includes(item.id))));
  for (const relative of ['resources/usage.md', '.tiller/usage.md', 'resources/rules/core.md', '.tiller/rules/core.md',
    'README.md', '.tiller/cases/index.md', '.tiller/specs/design.md']) {
    const content = read(repository, relative);
    assert.doesNotMatch(content, /test_ref|case link|behavior\.json/u, relative);
  }
  assert.match(read(repository, 'resources/usage.md'), /测试名[^。\n]*CASE/u);
  assert.match(read(repository, 'resources/usage.md'), /--case CASE-\d{3}/u);
  assert.match(read(repository, '.tiller/cases/index.md'), /modules\/<模块>\/behavior\.md/u);
});

test('CASE-158 case-backfill task.md retains mapping table for historical test names', () => {
  const task = read(repository, '.tiller/task/20261023-case-backfill/task.md');
  assert.match(task, /^## 映射\s*$/mu);
  assert.match(task, /\| 文件::旧测试名 \| CASE \| 方式 \| 理由 \|/u);
  assert.match(task, /`test\/core\.test\.mjs::initialization digests tolerate managed line-ending conversion but reject content changes` \| CASE-114/u);
  assert.match(task, /`test\/flow-cli\.test\.mjs::default workflow source uses flow naming instead of lite` \| CASE-155/u);
  const mapping = task.split('## 映射')[1];
  assert.ok((mapping.match(/\| `test\//g) || []).length >= 50, 'mapping should list inventory rows');
  assert.match(mapping, /\| reuse \|/u);
  assert.match(mapping, /\| new \|/u);
  assert.match(task, /CASE-900\/901\/999/u);
});

