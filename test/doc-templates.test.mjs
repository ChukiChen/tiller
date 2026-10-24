import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readTask } from '../dist/flow.js';
import { cli, completeDesign, completeRequirement, confirmTask, failure, fixture, put, success } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const taskPath = (id, name = 'task.md') => `.tiller/task/${id}/${name}`;

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
  put(root, 'src/value.txt', 'one\n');
  put(root, 'test/baseline.test.mjs', "import test from 'node:test';\ntest('CASE-190 baseline', () => {});\n");
  git(root, 'init', '--quiet');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'baseline');
  return root;
}

function section(content, title) {
  const start = content.search(new RegExp(`^## ${title}\\s*$`, 'mu'));
  if (start < 0) return '';
  const rest = content.slice(start).replace(/^##[^\n]*\n?/u, '');
  return rest.split(/^##\s+/mu)[0];
}

function subSection(content, title) {
  const start = content.search(new RegExp(`^### ${title}\\s*$`, 'mu'));
  if (start < 0) return '';
  const rest = content.slice(start).replace(/^###[^\n]*\n?/u, '');
  return rest.split(/^#{2,3}\s+/mu)[0];
}

function marker(content) {
  return JSON.parse(/<!-- tiller-task:v1 (\{.*\}) -->/u.exec(content)?.[1] ?? '{}');
}

function replaceRequirement(content, requirement) {
  const start = content.indexOf('## 需求');
  const next = content.indexOf('\n## ', start + 1);
  assert.ok(start >= 0 && next > start);
  return `${content.slice(0, start)}## 需求\n\n${requirement.trim()}\n${content.slice(next)}`;
}

test('CASE-190 new task marker omits preExisting and keeps the snapshot in the local sidecar', async t => {
  const root = await project(t);
  put(root, 'docs/pre-existing.md', 'before the task\n');
  const id = '20261024-marker-sidecar';
  success(cli(root, 'start', id, '--title', 'Marker sidecar', '--requirement', 'Keep comments small.',
    '--criterion', 'AC-1=Marker stays compact', '--size', 'small', '--target', 'src'));

  const content = read(root, taskPath(id));
  const meta = marker(content);
  assert.equal(Object.hasOwn(meta, 'preExisting'), false);
  const sidecarPath = `.tiller/local/tasks/${id}/pre-existing.json`;
  const sidecar = JSON.parse(read(root, sidecarPath));
  assert.equal(sidecar['docs/pre-existing.md'], hash('before the task\n'));
  assert.equal((await readTask(root, id)).meta.preExisting['docs/pre-existing.md'], hash('before the task\n'));

  const checked = failure(cli(root, 'check', id));
  assert.deepEqual(checked.changedOutsideScope, []);
});

test('CASE-191 legacy marker preExisting is still loaded and does not report an unchanged dirty file as scope drift', async t => {
  const root = await project(t);
  put(root, 'docs/legacy-dirty.md', 'legacy dirty file\n');
  const id = '20261024-legacy-marker';
  success(cli(root, 'start', id, '--title', 'Legacy marker', '--requirement', 'Read old snapshots.',
    '--criterion', 'AC-1=Legacy marker remains readable', '--size', 'small', '--target', 'src'));

  const content = read(root, taskPath(id));
  const meta = marker(content);
  meta.preExisting = { 'docs/legacy-dirty.md': hash('legacy dirty file\n') };
  put(root, taskPath(id), content.replace(/<!-- tiller-task:v1 \{.*\} -->/u,
    `<!-- tiller-task:v1 ${JSON.stringify(meta)} -->`));
  rmSync(join(root, `.tiller/local/tasks/${id}/pre-existing.json`), { force: true });

  assert.equal((await readTask(root, id)).meta.preExisting['docs/legacy-dirty.md'], hash('legacy dirty file\n'));
  const checked = failure(cli(root, 'check', id));
  assert.deepEqual(checked.changedOutsideScope, []);
});

test('CASE-192 structured requirements keep business scope separate from target paths', async t => {
  const root = await project(t);
  const id = '20261024-requirement-template';
  success(cli(root, 'start', id, '--title', 'Requirement template', '--requirement', 'Write complete requirements.',
    '--criterion', 'AC-1=Template is complete', '--size', 'standard', '--target', 'src', '--target', 'test'));

  const content = read(root, taskPath(id));
  const requirement = section(content, '需求');
  for (const heading of ['面向谁与问题', '目标', '业务范围', '关键行为', '异常与边界', '验收条件']) {
    assert.match(requirement, new RegExp(`^### ${heading}$`, 'mu'));
  }
  const business = subSection(requirement, '业务范围');
  assert.match(business, /^- 做：/mu);
  assert.match(business, /^- 不做：/mu);
  assert.match(business, /^- 假设与待确认：/mu);
  assert.doesNotMatch(business, /src|test/u);
  assert.deepEqual(marker(content).scope, ['src', 'test']);
});

test('CASE-193 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section', async t => {
  const root = await project(t);
  const id = '20261024-requirement-confirm';
  success(cli(root, 'start', id, '--title', 'Requirement confirmation', '--requirement', 'Reject empty fields.',
    '--criterion', 'AC-1=Only substantive requirements confirm', '--size', 'small', '--target', 'src'));

  const blank = failure(cli(root, 'confirm', id, 'requirements'));
  assert.equal(blank.error.code, 'MISSING_REQUIREMENTS');
  for (const heading of ['面向谁与问题', '业务范围', '关键行为', '异常与边界']) assert.match(blank.error.message, new RegExp(heading, 'u'));

  completeRequirement(root, id);
  put(root, taskPath(id), read(root, taskPath(id)).replace(
    '- 做：实现确认的验收条件。\n- 不做：范围外变更。\n- 假设与待确认：无。',
    '- 做：待补充\n- 不做：TODO\n- 假设与待确认：待定'));
  const placeholder = failure(cli(root, 'confirm', id, 'requirements'));
  assert.match(placeholder.error.message, /业务范围/u);

  success(confirmTask(root, id, 'requirements'));

  const legacy = '20261024-legacy-scope';
  success(cli(root, 'start', legacy, '--title', 'Legacy scope', '--requirement', 'Keep old records valid.',
    '--criterion', 'AC-1=Legacy scope confirms', '--size', 'small', '--target', 'src'));
  put(root, taskPath(legacy), replaceRequirement(read(root, taskPath(legacy)), [
    '### 目标', '', 'Keep old records valid.', '',
    '### 范围', '', '- 做：`src`', '',
    '### 验收条件', '', '- AC-1: Legacy scope confirms',
  ].join('\n')));
  success(cli(root, 'confirm', legacy, 'requirements'));
});

test('CASE-194 design template covers failure handling and verification entry with located confirm and check feedback', async t => {
  const root = await project(t);
  const id = '20261024-design-template';
  success(cli(root, 'start', id, '--title', 'Design template', '--requirement', 'Write complete design.',
    '--criterion', 'AC-1=Design is substantive', '--type', 'feature', '--size', 'standard',
    '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));

  const content = read(root, taskPath(id));
  for (const heading of ['方案', '失败处理', '取舍', '影响与风险', '验证入口']) {
    assert.match(content, new RegExp(`^### ${heading}$`, 'mu'));
  }
  const blank = failure(cli(root, 'confirm', id, 'design'));
  for (const heading of ['方案', '失败处理', '影响与风险', '验证入口']) assert.match(blank.error.message, new RegExp(heading, 'u'));

  completeDesign(root, id);
  put(root, taskPath(id), read(root, taskPath(id)).replace('### 取舍\n\n不新增并行入口，保持现有接口。', '### 取舍\n\n'));
  const design = success(cli(root, 'confirm', id, 'design'));
  assert.ok(design.warnings.some(item => item.includes('取舍')));

  put(root, taskPath(id), read(root, taskPath(id))
    .replace('失败时返回明确结果并保留原记录。', 'TODO')
    .replace('运行引用本用例的具名测试。', ''));
  const checked = failure(cli(root, 'check', id));
  assert.match(checked.warnings.join('\n'), new RegExp(`任务设计“失败处理”.*仅空白或占位.*${taskPath(id).replaceAll('.', '\\.')}`, 'u'));
  assert.match(checked.warnings.join('\n'), new RegExp(`任务设计“验证入口”.*仅空白或占位.*${taskPath(id).replaceAll('.', '\\.')}`, 'u'));
});

test('CASE-195 init creates complete requirement and design section skeletons without long examples', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));

  const requirements = read(root, '.tiller/specs/requirements.md');
  for (const heading of ['面向谁与问题', '目标', '业务范围', '关键行为', '异常与边界', '验收条件']) {
    assert.match(requirements, new RegExp(`^## ${heading}$`, 'mu'));
  }
  const design = read(root, '.tiller/specs/design.md');
  for (const heading of ['方案', '失败处理', '取舍', '影响与风险', '验证入口']) {
    assert.match(design, new RegExp(`^## ${heading}$`, 'mu'));
  }
  const modules = read(root, '.tiller/specs/modules/README.md');
  assert.match(modules, /requirements\.md.*面向谁与问题/u);
  assert.match(modules, /design\.md.*验证入口/u);
  for (const content of [requirements, design, modules]) {
    assert.doesNotMatch(content, /```/u);
    assert.ok(content.length < 1200);
  }

  for (const relative of ['rules/activities/requirements.md', 'rules/activities/design.md', 'rules/quality/documents.md', 'usage.md']) {
    assert.equal(read(root, `.tiller/${relative}`), readFileSync(new URL(`../resources/${relative}`, import.meta.url), 'utf8'));
  }
});

test('CASE-207 requirement and design guidance reduces noise while confirmation gates remain', async t => {
  const root = await project(t);
  const id = '20261024-doc-noise';
  success(cli(root, 'start', id, '--title', 'Documentation noise', '--requirement', 'Keep business constraints prominent.',
    '--criterion', 'AC-1=Guidance stays focused', '--type', 'feature', '--size', 'standard', '--target', 'src', '--target', 'test'));
  const content = read(root, taskPath(id));
  assert.match(content, /业务做\/不做\/假设和防跑偏约束.*交付路径.*不在此枚举/u);
  assert.match(content, /不复制规格全文/u);
  assert.match(content, /不塞长命令/u);
  assert.match(content, /引用已有规格，不复制全文/u);
  assert.match(content, /可重跑的短测试入口.*不塞长命令菜谱/u);

  success(confirmTask(root, id, 'requirements'));
  const blankDesign = failure(cli(root, 'confirm', id, 'design'));
  assert.equal(blankDesign.error.code, 'MISSING_DESIGN');
  assert.match(blankDesign.error.message, /方案/u);
  assert.match(blankDesign.error.message, /验证入口/u);

  for (const [resource, managed] of [
    ['resources/rules/quality/documents.md', '.tiller/rules/quality/documents.md'],
    ['resources/rules/activities/requirements.md', '.tiller/rules/activities/requirements.md'],
    ['resources/rules/activities/design.md', '.tiller/rules/activities/design.md'],
  ]) assert.equal(readFileSync(new URL(`../${managed}`, import.meta.url), 'utf8'),
    readFileSync(new URL(`../${resource}`, import.meta.url), 'utf8'));
  const quality = readFileSync(new URL('../resources/rules/quality/documents.md', import.meta.url), 'utf8');
  assert.match(quality, /业务约束.*不枚举交付路径/u);
  assert.match(quality, /不复制全文或展开长命令菜谱/u);
  const requirements = readFileSync(new URL('../resources/rules/activities/requirements.md', import.meta.url), 'utf8');
  assert.match(requirements, /防跑偏约束.*不罗列交付路径.*不复制全文/u);
  const design = readFileSync(new URL('../resources/rules/activities/design.md', import.meta.url), 'utf8');
  assert.match(design, /引用已有 specs.*不复制全文.*长命令菜谱.*交付路径/u);
});
