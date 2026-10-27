import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { cli, completeDesign, confirmTask, failure, fixture, initializeSettled, put, success, read, taskRecordRoot, commitFixtures } from './helpers.mjs';

const initialize = initializeSettled;
const task = (root, id) => `.tiller/task/${id}/task.md`;
const subSection = (content, title) => {
  const start = content.search(new RegExp(`^### ${title}\\s*$`, 'mu'));
  if (start < 0) return '';
  const rest = content.slice(start).replace(/^###[^\n]*\n?/u, '');
  return rest.split(/^#{2,3}\s+/mu)[0];
};
const section = (content, title) => {
  const start = content.search(new RegExp(`^## ${title}\\s*$`, 'mu'));
  if (start < 0) return '';
  const rest = content.slice(start).replace(/^##[^\n]*\n?/u, '');
  return rest.split(/^##\s+/mu)[0];
};
const confirmationSidecars = content => [...content.matchAll(/^<!-- tiller-confirm:v1 (\{.*\}) -->$/gmu)]
  .map(match => JSON.parse(match[1]));

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
  await initialize({ root });
  put(root, 'src/value.txt', 'one\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(1, 1));\n");
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Baseline behavior\n\nThe baseline test guards a task change.\n');
  put(root, '.tiller/cases/modules/workflow/behavior.md', `# workflow / behavior

## CASE-001 Baseline behavior is regression tested

- 类型：behavior
- 优先级：medium
- 模块：workflow
- 关联 AC：无
- 需求：\`.tiller/specs/modules/workflow/requirements.md#baseline-behavior\`

### 前置条件

- 工作流模块和测试环境可用。

### 步骤

1. 执行引用 CASE-001 的具名测试。

### 输入

- 正常的工作流输入。

### 预期结果

测试通过，基线行为保持在回归范围内。
`);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

function editTask(root, id, change) {
  const relative = task(root, id);
  const checkout = taskRecordRoot(root, id);
  const before = read(root, relative);
  const after = change(before);
  assert.notEqual(after, before);
  put(checkout, relative, after);
}

function addCaseLibrary(root, files) {
  for (const [name, content] of Object.entries(files)) put(root, `.tiller/cases/${name}`, content);
  commitFixtures(root, 'test(workflow): 更新全局用例');
}

function caseMarkdown({ id, title, kind = 'behavior', module = 'workflow', modules = [module], criteria = [],
  requirements = ['.tiller/specs/modules/workflow/requirements.md#baseline-behavior'] }) {
  return `# ${module} / ${kind}

## ${id} ${title}

- 类型：${kind}
- 优先级：medium
- 模块：${modules.join(', ')}
- 关联 AC：${criteria.length ? criteria.join(', ') : '无'}
- 需求：${requirements.map(value => `\`${value}\``).join(', ')}

### 前置条件

- 工作流模块和测试环境可用。

### 步骤

1. 执行引用 ${id} 的具名测试。

### 输入

- 正常输入与必要边界输入。

### 预期结果

测试通过，${title}。
`;
}

function scenarioMarkdown({ id, title, modules, criteria = [],
  requirements = ['.tiller/specs/modules/workflow/requirements.md#baseline-behavior'] }) {
  return `# 场景：${id.toLowerCase()}

## ${id} ${title}

- 类型：scenario
- 优先级：medium
- 模块：${modules.join(', ')}
- 关联 AC：${criteria.length ? criteria.join(', ') : '无'}
- 需求：${requirements.map(value => `\`${value}\``).join(', ')}

### 前置条件

- 经过模块的规格和运行环境可用。

### 步骤

1. 执行引用 ${id} 的端到端测试。

### 输入

- 跨模块正常输入。

### 预期结果

测试通过，${title}。
`;
}

test('CASE-001 CASE-066 small flow produces one task file and records verified acceptance without raw logs', async t => {
  const root = await project(t);
  const id = '20261022-small-flow';
  const started = success(cli(root, 'start', id, '--title', 'Small flow', '--requirement', 'Keep the command reliable.',
    '--criterion', 'AC-1=Command exits successfully', '--size', 'small', '--target', 'src', '--target', 'test'));
  assert.equal(started.next.includes('confirm'), true);
  assert.deepEqual(readdirSync(join(taskRecordRoot(root, id), '.tiller/task', id)), ['task.md']);
  const confirmed = success(confirmTask(root, id, 'requirements', '--quote', '确认这个范围和验收条件'));
  assert.equal(confirmed.object, '需求正文（目标、范围与验收条件）');
  assert.equal(confirmed.by, 'Tiller Test');

  put(root, 'src/value.txt', 'two\n');
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(2, 2));\n");
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  assert.equal(verified.result, 'passed');
  assert.equal(verified.entries[0].source, 'executed');
  assert.deepEqual(verified.entries[0].cases, ['CASE-001']);
  commitFixtures(root, 'implement small change');

  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.deepEqual(checked.criteria, [{ id: 'AC-1', covered: true, test: 'test/baseline.test.mjs::CASE-001 baseline',
    cases: ['CASE-001'], result: 'passed', commit: verified.commit }]);
  assert.equal(checked.cases.matched, 1);
  assert.deepEqual(checked.cases.modules, [{ module: 'workflow', behavior: 1, interface: 0, performance: 0, security: 0, total: 1 }]);
  const accepted = success(cli(root, 'accept', id, '--by', '验收人'));
  assert.equal(accepted.gate, 'acceptance');
  assert.equal(accepted.by, '验收人');
  assert.equal('quote' in accepted, false);
  const content = read(root, task(root, id));
  assert.match(content, /^<!-- tiller-task:v1 /mu);
  assert.match(content, /^## 需求$/mu);
  assert.match(content, /^\| 部分 \| 确认人 \| 时间 \| 短提交 \| 原话 \|$/mu);
  assert.match(content, /^\| 需求 \| Tiller Test \| .* \| [a-f0-9]{12} \| 确认这个范围和验收条件 \|$/mu);
  assert.match(content, /^\| 交付验收 \| 验收人 \| .* \| [a-f0-9]{12} \| — \|$/mu);
  const confirmations = confirmationSidecars(content);
  assert.equal(confirmations.length, 2);
  assert.equal(confirmations.find(item => item.gate === 'requirements').quote, '确认这个范围和验收条件');
  assert.equal(confirmations.find(item => item.gate === 'acceptance').quote, '');
  assert.match(content, /^### 目标$/mu);
  assert.match(content, /^### 使用场景$/mu);
  assert.match(content, /^### 业务范围$/mu);
  assert.match(content, /^### 关键行为$/mu);
  assert.match(content, /^### 异常与边界$/mu);
  assert.match(content, /^### 验收条件$/mu);
  assert.doesNotMatch(section(content, '确认'), /^- (?:确认部分|对象|确认人|用户原话|原话用途|提交|对象摘要|时间)：/mu);
  assert.doesNotMatch(content, /验收通过/u);
  assert.match(content, /^<!-- tiller-verify:v1 .*"tree":"[a-f0-9]{64}".* -->$/mu);
  assert.doesNotMatch(content, /^- 代码树摘要：/mu);
  assert.match(content, /^- 用例：CASE-001$/mu);
  assert.deepEqual(readdirSync(join(taskRecordRoot(root, id), '.tiller/task', id)), ['task.md']);
  assert.equal(existsSync(join(taskRecordRoot(root, id), '.tiller/task', id, 'reviews')), false);
  assert.equal(existsSync(join(taskRecordRoot(root, id), '.tiller/task', id, 'verification')), false);
});

test('CASE-013 requirements confirmation binds the written requirement rather than the quote', async t => {
  const root = await project(t);
  const id = '20261022-written-requirement';
  success(cli(root, 'start', id, '--title', 'Written requirement', '--requirement', 'Return a nonzero exit code on failure.',
    '--criterion', 'AC-1=Failure exits nonzero', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认这个需求'));
  editTask(root, id, content => content.replace('Return a nonzero exit code on failure.', 'Return a zero exit code on failure.'));
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('需求确认后需求正文、范围或验收条件已变化')));
});

test('CASE-014 an empty requirement cannot be confirmed by a user quote alone', async t => {
  const root = await project(t);
  const id = '20261022-quote-is-not-requirement';
  success(cli(root, 'start', id, '--title', 'Quote evidence', '--requirement', 'Implement the documented behavior.',
    '--criterion', 'AC-1=Behavior exists', '--size', 'small', '--target', 'src'));
  editTask(root, id, content => content.replace('Implement the documented behavior.', ''));
  const rejected = failure(cli(root, 'confirm', id, 'requirements', '--quote', 'Implement the documented behavior.'));
  assert.equal(rejected.error.code, 'MISSING_REQUIREMENTS');
  assert.match(rejected.error.message, /目标/u);
});

test('CASE-015 CASE-112 legacy work records stay read-only and are not listed as current tasks', async t => {
  const root = await project(t);
  put(root, '.tiller/work/legacy/work.md', '# Legacy task\n\nHistorical record only.\n');
  assert.deepEqual(success(cli(root, 'resume')).tasks, []);
  const id = '20261022-current-task';
  success(cli(root, 'start', id, '--title', 'Current task', '--requirement', 'Use the current task directory.',
    '--criterion', 'AC-1=Task is discoverable', '--size', 'small', '--target', 'src'));
  const resumed = success(cli(root, 'resume'));
  assert.deepEqual(resumed.tasks.map(item => item.id), [id]);
  assert.equal(read(root, '.tiller/work/legacy/work.md'), '# Legacy task\n\nHistorical record only.\n');
  assert.equal(existsSync(join(root, '.tiller/work/legacy/task.md')), false);
});

test('CASE-002 CASE-067 standard flow blocks before design confirmation and accepts design after requirements', async t => {
  const root = await project(t);
  const id = '20261022-standard-flow';
  success(cli(root, 'start', id, '--title', 'Standard flow', '--requirement', 'Add a visible behavior.',
    '--criterion', 'AC-1=Behavior is observable', '--type', 'feature', '--size', 'standard', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '需求确认'));
  const blocked = failure(cli(root, 'check', id));
  assert.ok(blocked.issues.some(issue => issue.includes('设计')));
  failure(cli(root, 'confirm', id, 'design', '--quote', '设计确认'));
  completeDesign(root, id);
  success(confirmTask(root, id, 'design', '--quote', '设计确认'));
  put(root, 'src/value.txt', 'standard\n');
  commitFixtures(root, 'feat(workflow): standard 实现');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
});

test('CASE-060 CASE-062 structured task template validates written requirements and records confirmer without a quote', async t => {
  const root = await project(t);
  const id = '20261022-structured-confirm';
  success(cli(root, 'start', id, '--title', 'Structured confirmation', '--requirement', 'Write the structured requirement.',
    '--criterion', 'AC-1=Structured confirmation is recorded', '--size', 'small', '--target', 'src'));
  const original = read(root, task(root, id));
  assert.match(original, /^### 目标$/mu);
  assert.match(original, /^### 使用场景$/mu);
  assert.match(original, /^### 业务范围$/mu);
  assert.match(original, /^### 关键行为$/mu);
  assert.match(original, /^### 异常与边界$/mu);
  assert.doesNotMatch(original, /^### 范围$/mu);
  assert.doesNotMatch(subSection(original, '业务范围'), /`src`|`test`/u);
  assert.match(original, /^### 验收条件$/mu);
  assert.doesNotMatch(original, /^## 验收条件$/mu);
  editTask(root, id, content => content.replace('Write the structured requirement.', ''));
  const incomplete = failure(cli(root, 'confirm', id, 'requirements'));
  assert.equal(incomplete.error.code, 'MISSING_REQUIREMENTS');
  assert.match(incomplete.error.message, /目标/u);
  put(taskRecordRoot(root, id), task(root, id), original);

  const confirmed = success(confirmTask(root, id, 'requirements'));
  assert.equal(confirmed.by, 'Tiller Test');
  assert.equal('quote' in confirmed, false);
  const content = read(root, task(root, id));
  assert.match(content, /^\| 部分 \| 确认人 \| 时间 \| 短提交 \| 原话 \|$/mu);
  assert.match(content, /^\| 需求 \| Tiller Test \| .* \| [a-f0-9]{12} \| — \|$/mu);
  const [record] = confirmationSidecars(content);
  assert.equal(record.by, 'Tiller Test');
  assert.equal(record.quote, '');
  assert.equal(record.subject, confirmed.subject);
  assert.equal(record.commit, confirmed.commit);
  assert.doesNotMatch(content, /^- 用户原话：/mu);

  const second = '20261022-explicit-confirmer';
  success(cli(root, 'start', second, '--title', 'Explicit confirmer', '--requirement', 'Record the named confirmer.',
    '--criterion', 'AC-1=Confirmer is explicit', '--size', 'small', '--target', 'src'));
  const explicit = success(confirmTask(root, second, 'requirements', '--by', 'Product Owner'));
  assert.equal(explicit.by, 'Product Owner');
  const explicitContent = read(root, task(root, second));
  assert.match(explicitContent, /^\| 需求 \| Product Owner \|/mu);
  assert.equal(confirmationSidecars(explicitContent)[0].by, 'Product Owner');
});

test('CASE-204 confirmations render a compact table with a complete machine sidecar', async t => {
  const root = await project(t);
  const id = '20261024-confirmation-table';
  success(cli(root, 'start', id, '--title', 'Compact confirmation', '--requirement', 'Keep confirmations readable.',
    '--criterion', 'AC-1=Confirmation remains valid', '--size', 'small', '--target', 'src'));
  const confirmed = success(confirmTask(root, id, 'requirements', '--quote', '确认 | 范围'));
  const content = read(root, task(root, id));
  assert.match(content, /^\| 部分 \| 确认人 \| 时间 \| 短提交 \| 原话 \|$/mu);
  assert.match(content, /^\| 需求 \| Tiller Test \| .* \| [a-f0-9]{12} \| 确认 \\\| 范围 \|$/mu);
  const [record] = confirmationSidecars(content);
  assert.deepEqual({
    gate: record.gate, object: record.object, subject: record.subject, commit: record.commit,
    by: record.by, quote: record.quote, at: record.at,
  }, {
    gate: 'requirements', object: '需求正文（目标、范围与验收条件）', subject: confirmed.subject,
    commit: confirmed.commit, by: 'Tiller Test', quote: '确认 | 范围', at: record.at,
  });
  assert.ok(Number.isFinite(Date.parse(record.at)));
  const checked = failure(cli(root, 'check', id));
  assert.equal(checked.confirmations.find(item => item.gate === 'requirements').confirmed, true);
  editTask(root, id, value => value.replace('Keep confirmations readable.', 'Change the confirmed requirement.'));
  const invalidated = failure(cli(root, 'check', id));
  assert.equal(invalidated.confirmations.find(item => item.gate === 'requirements').confirmed, false);
  assert.ok(invalidated.issues.some(issue => issue.includes('需求确认后需求正文、范围或验收条件已变化')));
});

test('CASE-063 requirement and design confirmations use independent digests', async t => {
  const root = await project(t);
  const id = '20261022-independent-confirmations';
  success(cli(root, 'start', id, '--title', 'Independent confirmations', '--requirement', 'Implement structured confirmations.',
    '--criterion', 'AC-1=Confirmation scopes stay independent', '--size', 'standard', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--by', 'Requirements Owner'));
  completeDesign(root, id);
  editTask(root, id, content => content.replace('### 取舍\n\n不新增并行入口，保持现有接口。', '### 取舍\n\n'));
  const design = success(cli(root, 'confirm', id, 'design', '--by', 'Design Owner'));
  assert.equal(design.by, 'Design Owner');
  assert.ok(design.warnings.some(warning => warning.includes('取舍')));

  editTask(root, id, content => content.replace('沿用现有命令边界实现本次行为。', '调整现有命令边界实现本次行为。'));
  const afterDesign = failure(cli(root, 'check', id));
  assert.equal(afterDesign.confirmations.find(item => item.gate === 'requirements').confirmed, true);
  assert.equal(afterDesign.confirmations.find(item => item.gate === 'design').confirmed, false);
  const resumed = success(cli(root, 'resume', id));
  assert.equal(resumed.stage, '需求已确认');

  editTask(root, id, content => content.replace('Implement structured confirmations.', 'Implement changed confirmations.'));
  const afterRequirements = failure(cli(root, 'check', id));
  assert.equal(afterRequirements.confirmations.find(item => item.gate === 'requirements').confirmed, false);
});

test('CASE-064 CASE-205 legacy task text and quoted confirmation remain readable and valid', async t => {
  const root = await project(t);
  const id = '20261022-legacy-confirmation';
  success(cli(root, 'start', id, '--title', 'Legacy record', '--requirement', 'Initial structured requirement.',
    '--criterion', 'AC-1=Legacy requirements remain valid', '--size', 'small', '--target', 'src'));
  const initial = read(root, task(root, id));
  const meta = JSON.parse(/<!-- tiller-task:v1 (\{.*\}) -->/u.exec(initial)[1]);
  delete meta.format;
  const requirement = 'Legacy requirement text.';
  const criteria = [{ id: 'AC-1', text: 'Legacy behavior remains valid' }];
  const normalize = value => value.replace(/\s+/gu, ' ').trim();
  const subject = createHash('sha256').update(JSON.stringify({
    type: meta.type, size: meta.size, scope: meta.scope,
    requirement: normalize(requirement), criteria: criteria.map(item => [item.id, normalize(item.text)]),
  }), 'utf8').digest('hex');
  put(taskRecordRoot(root, id), task(root, id), [
    '# Legacy record',
    `<!-- tiller-task:v1 ${JSON.stringify(meta)} -->`,
    '',
    '## 需求',
    '',
    requirement,
    '',
    '## 验收条件',
    '',
    '- AC-1: Legacy behavior remains valid',
    '',
    '## 确认',
    '',
    '### requirements',
    '- 对象：需求正文（目标与验收条件）',
    '- 用户原话：旧格式确认',
    '- 原话用途：确认凭证，不替代已写明的正文',
    `- 提交：${meta.base}`,
    `- 对象摘要：${subject}`,
    '- 时间：2026-10-22T00:00:00.000Z',
    '',
    '## 验证',
    '',
    '尚无验证。',
    '',
    '## 自检',
    '',
    '交付前运行 check。',
    '',
  ].join('\n'));
  const resumed = success(cli(root, 'resume', id));
  assert.equal(resumed.stage, '需求已确认');
  assert.equal(resumed.confirmations[0].quote, '旧格式确认');
  const checked = failure(cli(root, 'check', id));
  assert.equal(checked.confirmations.find(item => item.gate === 'requirements').confirmed, true);
  const rewritten = read(root, task(root, id));
  assert.match(rewritten, /^\| 部分 \| 确认人 \| 时间 \| 短提交 \| 原话 \|$/mu);
  assert.match(rewritten, /^\| 需求 \| — \| .* \| [a-f0-9]{12} \| 旧格式确认 \|$/mu);
  const [record] = confirmationSidecars(rewritten);
  assert.equal(record.style, 'legacy');
  assert.equal(record.by, '');
  assert.equal(record.quote, '旧格式确认');
  assert.equal(record.subject, subject);
  assert.doesNotMatch(rewritten, /^- 原话用途：/mu);
  assert.doesNotMatch(rewritten, /^- 确认人：/mu);
  assert.equal(success(cli(root, 'resume', id)).stage, '需求已确认');

  const mixed = rewritten.replace(/## 确认\n\n[\s\S]*?(?=\n## 验证)/u, [
    '## 确认', '', '<!-- tiller-confirm:v1 {broken -->', '', '### requirements',
    '- 对象：需求正文（目标与验收条件）', '- 用户原话：旧格式确认', '- 原话用途：确认凭证，不替代已写明的正文',
    `- 提交：${meta.base}`, `- 对象摘要：${subject}`, '- 时间：2026-10-22T00:00:00.000Z',
  ].join('\n'));
  put(taskRecordRoot(root, id), task(root, id), mixed);
  assert.equal(success(cli(root, 'resume', id)).stage, '需求已确认');
  put(taskRecordRoot(root, id), task(root, id), mixed.replace(`- 对象摘要：${subject}\n`, ''));
  const missingField = success(cli(root, 'resume', id));
  assert.deepEqual(missingField.confirmations, []);
  assert.equal(missingField.stage, '已开始');
});

test('CASE-061 plan confirmation records a confirmer without a quote', async t => {
  const root = await project(t);
  const result = success(cli(root, 'plan', 'start', 'round9-plan', '--title', '第9轮规划', '--goal', '验证规划确认去原话化',
    '--spec', '.tiller/specs/modules/workflow/requirements.md#2-开始与接续',
    '--item', 'P-1=确认记录;size=small;deps=-;specs=.tiller/specs/modules/workflow/requirements.md#2-开始与接续'));
  assert.match(result.next, /plan confirm/);
  const confirmed = success(cli(root, 'plan', 'confirm', 'round9-plan', '--by', 'Planning Owner'));
  assert.equal(confirmed.by, 'Planning Owner');
  assert.equal('quote' in confirmed, false);
  const content = read(root, '.tiller/plans/round9-plan.md');
  assert.match(content, /^- 确认部分：规划$/mu);
  assert.match(content, /^- 确认人：Planning Owner$/mu);
  assert.doesNotMatch(content, /^- 用户原话：/mu);
  assert.equal(success(cli(root, 'plan', 'status', 'round9-plan')).confirmed, true);
});

test('CASE-006 verification becomes stale after an in-scope change', async t => {
  const root = await project(t);
  const id = '20261022-stale-verification';
  success(cli(root, 'start', id, '--title', 'Stale verification', '--requirement', 'Detect a stale proof.',
    '--criterion', 'AC-1=Current tree is tested', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  put(root, 'src/value.txt', 'changed after verification\n');
  commitFixtures(root, 'change after verification');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.startsWith('AC-1 的验证已过期')));
});

test('CASE-003 requirements confirmation binds the declared scope', async t => {
  const root = await project(t);
  const id = '20261022-scope-confirmation';
  success(cli(root, 'start', id, '--title', 'Scope binding', '--requirement', 'Keep the approved scope.',
    '--criterion', 'AC-1=Scope stays explicit', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认该范围'));
  editTask(root, id, content => content.replace('"scope":["src"]', '"scope":["src","test"]'));
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('需求确认后需求正文、范围或验收条件已变化')));
});

test('CASE-004 scope checks report committed and uncommitted out-of-scope changes', async t => {
  const root = await project(t);
  const id = '20261022-scope-check';
  success(cli(root, 'start', id, '--title', 'Scope check', '--requirement', 'Stay inside src.',
    '--criterion', 'AC-1=src is verified', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'scoped\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  commitFixtures(root, 'scoped change');
  put(root, 'docs/outside.md', 'outside\n');
  const outside = failure(cli(root, 'check', id));
  assert.ok(outside.issues.some(issue => issue.includes('改动超出范围：docs/outside.md')));
  commitFixtures(root, 'outside change');
  put(root, 'src/value.txt', 'uncommitted scoped change\n');
  const uncommitted = failure(cli(root, 'check', id));
  assert.ok(uncommitted.issues.some(issue => issue.includes('未提交改动：src/value.txt')));
  const committed = failure(cli(root, 'check', id));
  assert.ok(committed.issues.some(issue => issue.includes('改动超出范围：docs/outside.md')));
});

test('CASE-005 pre-existing changes are excluded from scope findings only while unchanged', async t => {
  const root = await project(t);
  put(root, 'docs/outside.md', 'pre-existing edit\n');
  const id = '20261022-preexisting';
  success(cli(root, 'start', id, '--title', 'Pre-existing change', '--requirement', 'Ignore an unrelated dirty file.',
    '--criterion', 'AC-1=src is verified', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'implemented\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  commitFixtures(root, 'implement scoped change');
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.equal(checked.changedOutsideScope.includes('docs/outside.md'), false);
  put(root, 'docs/outside.md', 'pre-existing edit changed again\n');
  const changed = failure(cli(root, 'check', id));
  assert.ok(changed.issues.some(issue => issue.includes('改动超出范围：docs/outside.md')));
});

test('CASE-007 test weakening and skipped tests block the delivery self-check', async t => {
  const root = await project(t);
  const id = '20261022-test-weakening';
  success(cli(root, 'start', id, '--title', 'Protect tests', '--requirement', 'Do not weaken coverage.',
    '--criterion', 'AC-1=Assertion remains active', '--size', 'small', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'test/baseline.test.mjs', "import test from 'node:test';\ntest('CASE-001 baseline', () => {});\ntest.skip('skipped baseline', () => {});\n");
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  commitFixtures(root, 'weaken test');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('弱化测试断言')));
  assert.ok(checked.issues.some(issue => issue.includes('新增跳过或独占测试')));
});

test('CASE-008 removing a test with its retired feature is reported without masking retained assertion loss', async t => {
  const root = await project(t);
  put(root, 'test/legacy.test.mjs', "import test from 'node:test';\ntest('legacy', () => {});\n");
  commitFixtures(root, 'old feature test');
  const id = '20261022-test-removal';
  success(cli(root, 'start', id, '--title', 'Review test removal', '--requirement', 'Keep retained tests intact.',
    '--criterion', 'AC-1=The retained test proves behavior', '--size', 'small', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  unlinkSync(join(root, 'test/legacy.test.mjs'));
  const removalCheckout = taskRecordRoot(root, id);
  if (removalCheckout !== root && existsSync(join(removalCheckout, 'test/legacy.test.mjs'))) {
    unlinkSync(join(removalCheckout, 'test/legacy.test.mjs'));
  }
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  commitFixtures(root, 'remove old feature test');
  const removed = success(cli(root, 'check', id));
  assert.ok(removed.warnings.some(issue => issue.includes('删除 1 个测试文件')));
  put(root, 'test/baseline.test.mjs', "import test from 'node:test';\ntest('CASE-001 baseline', () => {});\n");
  commitFixtures(root, 'weaken retained test');
  const weakened = failure(cli(root, 'check', id));
  assert.ok(weakened.issues.some(issue => issue.includes('弱化测试断言：test/baseline.test.mjs::CASE-001 baseline')));
});

test('CASE-009 unsafe paths and secrets are rejected from records before acceptance', async t => {
  const root = await project(t);
  const id = '20261022-safe-record';
  failure(cli(root, 'start', id, '--title', 'Unsafe', '--requirement', 'Read /home/person/private.txt',
    '--criterion', 'AC-1=No absolute path', '--size', 'small'));
  failure(cli(root, 'start', id, '--title', 'Unsafe quoted path', '--requirement', 'Read "/home/person/private.txt"',
    '--criterion', 'AC-1=No absolute path', '--size', 'small'));
  success(cli(root, 'start', id, '--title', 'Safe record', '--requirement', 'Keep records portable.',
    '--criterion', 'AC-1=No secrets or absolute paths', '--size', 'small', '--target', 'src'));
  failure(cli(root, 'confirm', id, 'requirements', '--quote', 'Use token = abcdefghijklmnop'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  editTask(root, id, content => content.replace('\n## 确认\n',
    '\n## 设计\n\n### 方案\n\nAccess token = abcdefghijklmnop\n\n### 影响与风险\n\nSecret handling.\n\n## 确认\n'));
  failure(cli(root, 'confirm', id, 'design', '--quote', '设计确认'));
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(issue => issue.includes('疑似密钥赋值')));
});

test('CASE-010 accept refuses an unverified task and leaves no acceptance record', async t => {
  const root = await project(t);
  const id = '20261022-accept-block';
  success(cli(root, 'start', id, '--title', 'Accept gate', '--requirement', 'Require proof first.',
    '--criterion', 'AC-1=Proof exists', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  const rejected = failure(cli(root, 'accept', id, '--quote', '验收通过'));
  assert.equal(rejected.error.code, 'NOT_READY');
  assert.doesNotMatch(read(root, task(root, id)), /验收通过/u);
});

test('CASE-012 check blocks a criterion whose verification test has no global case', async t => {
  const root = await project(t);
  put(root, 'test/other.test.mjs', "import test from 'node:test';\ntest('other', () => {});\n");
  git(root, 'add', 'test/other.test.mjs');
  const id = '20261022-global-cases-mapped';
  success(cli(root, 'start', id, '--title', 'Global case mapping', '--requirement', 'Check regression facts.',
    '--criterion', 'AC-1=The baseline test remains relevant', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'mapped\n');
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/other.test.mjs::other'));
  assert.deepEqual(verified.cases, []);
  commitFixtures(root, 'mapped change');
  const checked = failure(cli(root, 'check', id));
  assert.equal(checked.cases.matched, 0);
  assert.ok(checked.issues.some(item => item.includes('未绑定全局用例')));
});

test('CASE-154 file-level verification references do not bind every test in the file', async t => {
  const root = await project(t);
  const id = '20261022-file-level-test';
  success(cli(root, 'start', id, '--title', 'Exact test binding', '--requirement', 'Require named tests.',
    '--criterion', 'AC-1=Only the named test is bound', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'file-level\n');
  const verified = success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs'));
  assert.deepEqual(verified.cases, []);
  commitFixtures(root, 'file-level verification');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(item => item.includes('AC-1 未绑定全局用例')));
});

test('CASE-047 module cases and scenarios report counts and regression hints', async t => {
  const root = await project(t);
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(1, 1));\ntest('CASE-002 scenario baseline', () => assert.equal(1, 1));\n");
  commitFixtures(root, 'test(workflow): 增加场景测试');
  addCaseLibrary(root, {
    'scenarios/value-round.md': scenarioMarkdown({ id: 'CASE-002', title: 'A value change crosses the workflow', modules: ['workflow'] }),
  });
  // The scenario test name must contain its CASE id; rewrite the fixture test accordingly.
  put(root, 'test/baseline.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\ntest('CASE-001 baseline', () => assert.equal(1, 1));\ntest('CASE-002 A value change crosses the workflow', () => assert.equal(1, 1));\n");
  commitFixtures(root, 'test(workflow): 对齐场景用例编号');
  const id = '20261022-case-summary';
  success(cli(root, 'start', id, '--title', 'Case summary', '--requirement', 'Report module coverage.',
    '--criterion', 'AC-1=The scenario is visible', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'summary\n');
  put(root, 'test/baseline.test.mjs', `${read(root, 'test/baseline.test.mjs').trimEnd()}\n// CASE-001 CASE-002 module regression fixture.\n`);
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  commitFixtures(root, 'feat(workflow): 汇总用例');
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.cases.count, 2);
  assert.equal(checked.cases.matched, 1);
  assert.deepEqual(checked.cases.modules, [{ module: 'workflow', behavior: 1, interface: 0, performance: 0, security: 0, total: 1 }]);
  assert.deepEqual(checked.cases.scenarios, [{ id: 'CASE-002', title: 'A value change crosses the workflow', modules: ['workflow'] }]);
  assert.deepEqual(checked.cases.uncovered, []);
  assert.ok(checked.warnings.some(item => item.includes('本次改动涉及模块 workflow') && item.includes('CASE-002')));
});

test('CASE-045 check rejects a recorded case whose referenced test no longer matches', async t => {
  const root = await project(t);
  put(root, 'test/other.test.mjs', "import test from 'node:test';\ntest('CASE-003 other', () => {});\n");
  git(root, 'add', 'test/other.test.mjs');
  addCaseLibrary(root, {
    'modules/workflow/interface.md': caseMarkdown({ id: 'CASE-003', title: 'Other interface', kind: 'interface' }),
  });
  const id = '20261022-case-mismatch';
  success(cli(root, 'start', id, '--title', 'Case mismatch', '--requirement', 'Bind the recorded case.',
    '--criterion', 'AC-1=The recorded case is current', '--size', 'small', '--target', 'src'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'mismatch\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  editTask(root, id, content => content.replace('- 用例：CASE-001', '- 用例：CASE-003'));
  commitFixtures(root, 'fix(workflow): 制造用例错配');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(item => item.includes('与全局用例 CASE-003 的测试引用不一致')), checked.issues.join('\n'));
});

test('CASE-046 global cases block legacy layout, unknown kinds, missing modules and broken references', async t => {
  const root = await project(t);
  put(root, 'test/missing-case.test.mjs', "import test from 'node:test';\ntest('CASE-999 missing case', () => {});\n");
  git(root, 'add', 'test/missing-case.test.mjs');
  addCaseLibrary(root, {
    'legacy.json': '{}\n',
    'modules/ghost/behavior.md': caseMarkdown({ id: 'CASE-900', title: 'Ghost module', module: 'ghost', modules: ['ghost'] }),
    'modules/workflow/custom.md': '# workflow / custom\n',
    'modules/workflow/interface.md': caseMarkdown({ id: 'CASE-001', title: 'Broken duplicate', kind: 'interface', requirements: ['missing.md'] }),
    'scenarios/missing.md': scenarioMarkdown({ id: 'CASE-901', title: 'Missing module', modules: ['missing'] }),
  });
  const id = '20261022-global-cases-broken';
  success(cli(root, 'start', id, '--title', 'Broken global cases', '--requirement', 'Reject stale facts.',
    '--criterion', 'AC-1=The test exists', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认'));
  put(root, 'src/value.txt', 'broken cases\n');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', 'test/baseline.test.mjs::CASE-001 baseline'));
  commitFixtures(root, 'fix(workflow): 检查用例结构');
  const checked = failure(cli(root, 'check', id));
  assert.ok(checked.issues.some(item => item.includes('id 重复')));
  assert.ok(checked.issues.some(item => item.includes('旧式全局用例')));
  assert.ok(checked.issues.some(item => item.includes('不在白名单')));
  assert.ok(checked.issues.some(item => item.includes('模块目录') && item.includes('ghost')));
  assert.ok(checked.issues.some(item => item.includes('模块不存在：ghost')));
  assert.ok(checked.issues.some(item => item.includes('模块不存在：missing')));
  assert.ok(checked.issues.some(item => item.includes('文件不存在：missing.md')));
  assert.ok(checked.issues.some(item => item.includes('引用了不存在的用例 CASE-999')));
});

test('CASE-042 CASE-043 CLI JSON version and invalid argument contracts stay stable', t => {
  const root = fixture(t);
  const version = success(cli(root, '--version'));
  assert.deepEqual(version, { ok: true, version: '0.5.0' });
  const rejected = cli(root, 'unknown-command'); failure(rejected);
  assert.equal(rejected.status, 2);
  assert.deepEqual(Object.keys(rejected.data.error).sort(), ['code', 'message']);
  assert.equal(rejected.data.error.code, 'INVALID_ARGUMENT');
  assert.match(rejected.data.error.message, /未知命令/u);
});

test('CASE-044 start rejects missing requirement or criterion with exit code 2', t => {
  const root = fixture(t);
  const missingRequirement = cli(root, 'start', '20261022-interface-input', '--title', 'Interface',
    '--criterion', 'AC-1=Input is checked', '--size', 'small'); failure(missingRequirement);
  assert.equal(missingRequirement.status, 2);
  assert.equal(missingRequirement.data.error.code, 'INVALID_ARGUMENT');
  const missingCriterion = cli(root, 'start', '20261022-interface-input', '--title', 'Interface',
    '--requirement', 'Reject incomplete starts.', '--size', 'small'); failure(missingCriterion);
  assert.equal(missingCriterion.status, 2);
  assert.equal(missingCriterion.data.error.code, 'INVALID_ARGUMENT');
  assert.equal(existsSync(join(root, '.tiller/task/20261022-interface-input')), false);
});

test('CASE-011 default help names the default flow and old audit commands are gone', t => {
  const root = fixture(t);
  const normal = success(cli(root, '--help'));
  assert.match(normal.help, /默认工作流/u);
  assert.match(normal.help, /tiller start/u);
  assert.match(normal.help, /--requirement/u);
  assert.match(normal.help, /tiller plan start/u);
  assert.match(normal.help, /tiller case add/u);
  assert.match(normal.help, /tiller close/u);
  assert.match(normal.help, /tiller reopen/u);
  assert.match(normal.help, /task\.md/u);
  assert.doesNotMatch(normal.help, /work\.md/u);
  assert.doesNotMatch(normal.help, /lite|lightweight/iu);
  assert.doesNotMatch(normal.help, /advanced|work plan register|workflow list/u);
  for (const args of [['advanced'], ['work', 'create'], ['workflow', 'list'], ['planning'], ['task'], ['delivery-check']]) {
    const rejected = failure(cli(root, ...args));
    assert.equal(rejected.error.code, 'INVALID_ARGUMENT', args.join(' '));
    assert.match(rejected.error.message, /未知命令/u, args.join(' '));
  }
});

test('CASE-155 default workflow source uses flow naming instead of lite', () => {
  const source = readFileSync(new URL('../src/flow.ts', import.meta.url), 'utf8');
  assert.equal(existsSync(new URL('../src/lite.ts', import.meta.url)), false);
  assert.match(source, /export async function startFlow/u);
  assert.doesNotMatch(source, /\bLite\b|\blite\b|tiller-lite/u);
});
