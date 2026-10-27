import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readTask } from '../dist/flow.js';
import { cli, completeDesign, confirmTask, failure, fixture, put, success, taskRecordRoot, read } from './helpers.mjs';

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

  const content = read(taskRecordRoot(root, id), taskPath(id));
  const meta = marker(content);
  assert.equal(Object.hasOwn(meta, 'preExisting'), false);
  const sidecarPath = `.tiller/local/${id}/pre-existing.json`;
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

  const content = read(taskRecordRoot(root, id), taskPath(id));
  const meta = marker(content);
  meta.preExisting = { 'docs/legacy-dirty.md': hash('legacy dirty file\n') };
  put(taskRecordRoot(root, id), taskPath(id), content.replace(/<!-- tiller-task:v1 \{.*\} -->/u,
    `<!-- tiller-task:v1 ${JSON.stringify(meta)} -->`));
  rmSync(join(root, `.tiller/local/${id}/pre-existing.json`), { force: true });

  assert.equal((await readTask(root, id)).meta.preExisting['docs/legacy-dirty.md'], hash('legacy dirty file\n'));
  const checked = failure(cli(root, 'check', id));
  assert.deepEqual(checked.changedOutsideScope, []);
});

test('CASE-214 pre-existing sidecars prefer the task-local layout and fall back to the legacy path', async t => {
  const root = await project(t);
  put(root, 'docs/legacy-sidecar.md', 'legacy sidecar\n');
  const id = '20261026-pre-existing-fallback';
  success(cli(root, 'start', id, '--title', '旁路回退', '--requirement', 'Read new and legacy sidecars.',
    '--criterion', 'AC-1=Sidecars remain readable', '--size', 'small', '--target', 'src'));

  const currentPath = `.tiller/local/${id}/pre-existing.json`;
  const legacyPath = `.tiller/local/tasks/${id}/pre-existing.json`;
  put(root, legacyPath, read(root, currentPath));
  put(root, currentPath, `${JSON.stringify({ 'docs/new-preferred.md': hash('new value\n') }, null, 2)}\n`);
  assert.equal((await readTask(root, id)).meta.preExisting['docs/new-preferred.md'], hash('new value\n'));
  assert.equal((await readTask(root, id)).meta.preExisting['docs/legacy-sidecar.md'], undefined);

  rmSync(join(root, currentPath), { force: true });
  assert.equal((await readTask(root, id)).meta.preExisting['docs/legacy-sidecar.md'], hash('legacy sidecar\n'));
  assert.equal((await readTask(root, id)).meta.preExisting['docs/new-preferred.md'], undefined);
});

test('CASE-192 CASE-270 structured requirements keep business scope separate from target paths', async t => {
  const root = await project(t);
  const id = '20261024-requirement-template';
  success(cli(root, 'start', id, '--title', 'Requirement template', '--requirement', 'Write complete requirements.',
    '--criterion', 'AC-1=Template is complete', '--size', 'standard', '--target', 'src', '--target', 'test'));

  const content = read(taskRecordRoot(root, id), taskPath(id));
  const requirement = section(content, '需求');
  for (const heading of ['使用场景', '目标', '业务范围', '关键行为', '异常与边界', '验收条件']) {
    assert.match(requirement, new RegExp(`^### ${heading}$`, 'mu'));
  }
  const business = subSection(requirement, '业务范围');
  assert.match(business, /^- 做：/mu);
  assert.match(business, /^- 不做：/mu);
  assert.match(business, /^- 假设与待确认：/mu);
  assert.doesNotMatch(business, /src|test/u);
  assert.deepEqual(marker(content).scope, ['src', 'test']);
});

test('CASE-193 CASE-270 requirements confirmation rejects blank or placeholder sections while accepting the legacy scope section', async t => {
  const root = await project(t);
  const id = '20261024-requirement-confirm';
  success(cli(root, 'start', id, '--title', 'Requirement confirmation', '--requirement', 'Reject empty fields.',
    '--criterion', 'AC-1=Only substantive requirements confirm', '--size', 'small', '--target', 'src'));

  success(confirmTask(root, id, 'requirements'));

  const blankId = '20261024-requirement-blank';
  success(cli(root, 'start', blankId, '--title', 'Blank requirement', '--requirement', 'Reject blank fields after editing.',
    '--criterion', 'AC-1=Blank sections are rejected', '--size', 'small', '--target', 'src'));
  put(taskRecordRoot(root, blankId), taskPath(blankId), replaceRequirement(read(taskRecordRoot(root, blankId), taskPath(blankId)), [
    '### 使用场景', '', 'TODO', '',
    '### 目标', '', 'Reject blank fields after editing.', '',
    '### 业务范围', '', '- 做：待补充', '- 不做：TODO', '- 假设与待确认：待定', '',
    '### 关键行为', '', 'TBD', '',
    '### 异常与边界', '', 'N/A', '',
    '### 验收条件', '', '- AC-1: Blank sections are rejected',
  ].join('\n')));
  const blank = failure(cli(root, 'confirm', blankId, 'requirements'));
  assert.equal(blank.error.code, 'MISSING_REQUIREMENTS');
  for (const heading of ['使用场景', '业务范围', '关键行为', '异常与边界']) assert.match(blank.error.message, new RegExp(heading, 'u'));

  put(taskRecordRoot(root, blankId), taskPath(blankId), replaceRequirement(read(taskRecordRoot(root, blankId), taskPath(blankId)), [
    '### 使用场景', '', '编辑后的明确场景。', '',
    '### 目标', '', 'Reject blank fields after editing.', '',
    '### 业务范围', '', '- 做：待补充', '- 不做：TODO', '- 假设与待确认：待定', '',
    '### 关键行为', '', '编辑后的可观察行为。', '',
    '### 异常与边界', '', '编辑后的明确边界。', '',
    '### 验收条件', '', '- AC-1: Blank sections are rejected',
  ].join('\n')));
  const placeholder = failure(cli(root, 'confirm', blankId, 'requirements'));
  assert.equal(placeholder.error.code, 'MISSING_REQUIREMENTS');
  assert.match(placeholder.error.message, /业务范围/u);

  const legacy = '20261024-legacy-scope';
  success(cli(root, 'start', legacy, '--title', 'Legacy scope', '--requirement', 'Keep old records valid.',
    '--criterion', 'AC-1=Legacy scope confirms', '--size', 'small', '--target', 'src'));
  put(taskRecordRoot(root, legacy), taskPath(legacy), replaceRequirement(read(taskRecordRoot(root, legacy), taskPath(legacy)), [
    '### 目标', '', 'Keep old records valid.', '',
    '### 范围', '', '- 做：`src`', '',
    '### 验收条件', '', '- AC-1: Legacy scope confirms',
  ].join('\n')));
  success(cli(root, 'confirm', legacy, 'requirements'));
});

test('CASE-311 short goal start creates a confirmable structured requirement while requirement-file stays authoritative', async t => {
  const root = await project(t);
  const id = '20261027-short-goal-skeleton';
  const goal = '短目标会自动展开为可确认需求。';
  success(cli(root, 'start', id, '--title', '短目标骨架', '--requirement', goal,
    '--criterion', 'AC-1=短目标可确认', '--size', 'small', '--target', 'src'));

  const content = read(taskRecordRoot(root, id), taskPath(id));
  const requirement = section(content, '需求');
  for (const heading of ['使用场景', '目标', '业务范围', '关键行为', '异常与边界', '验收条件']) {
    assert.match(requirement, new RegExp(`^### ${heading}$`, 'mu'));
    assert.notEqual(subSection(requirement, heading).trim(), '', heading);
  }
  assert.match(subSection(requirement, '使用场景'), new RegExp(goal, 'u'));
  assert.match(subSection(requirement, '目标'), new RegExp(goal, 'u'));
  assert.match(subSection(requirement, '关键行为'), /AC-1/u);
  const confirmed = success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  assert.equal(confirmed.by, 'Tiller Test');

  const fileId = '20261027-requirement-file-priority';
  put(root, '.tiller/specs/modules/workflow/short-goal-source.md', [
    '# 文件需求', '', '## 使用场景', '', '文件中的明确场景。', '',
    '## 目标', '', '文件中的明确目标。', '',
    '## 业务范围', '', '- 做：按文件实现。', '- 不做：忽略文件。', '- 假设与待确认：无。', '',
    '## 关键行为', '', '文件定义的行为。', '',
    '## 异常与边界', '', '文件定义的边界。', '',
    '## 验收条件', '', '- AC-1: 文件验收条件生效',
  ].join('\n'));
  git(root, 'add', '.tiller/specs/modules/workflow/short-goal-source.md');
  git(root, 'commit', '--quiet', '-m', 'docs(workflow): 短目标文件夹具');
  success(cli(root, 'start', fileId, '--title', '文件需求优先', '--requirement-file',
    '.tiller/specs/modules/workflow/short-goal-source.md', '--size', 'small', '--target', 'src'));
  const fromFile = read(taskRecordRoot(root, fileId), taskPath(fileId));
  assert.match(subSection(section(fromFile, '需求'), '使用场景'), /文件中的明确场景/u);
  assert.match(subSection(section(fromFile, '需求'), '目标'), /文件中的明确目标/u);
  assert.doesNotMatch(subSection(section(fromFile, '需求'), '业务范围'), /短目标“/u);
  success(confirmTask(root, fileId, 'requirements', '--by', 'Tiller Test'));
});

test('CASE-194 design template covers failure handling and verification entry with located confirm and check feedback', async t => {
  const root = await project(t);
  const id = '20261024-design-template';
  success(cli(root, 'start', id, '--title', 'Design template', '--requirement', 'Write complete design.',
    '--criterion', 'AC-1=Design is substantive', '--type', 'feature', '--size', 'standard',
    '--target', 'src', '--target', 'test'));
  success(confirmTask(root, id, 'requirements'));

  const content = read(taskRecordRoot(root, id), taskPath(id));
  for (const heading of ['方案', '失败处理', '取舍', '影响与风险', '验证入口']) {
    assert.match(content, new RegExp(`^### ${heading}$`, 'mu'));
  }
  const blank = failure(cli(root, 'confirm', id, 'design'));
  for (const heading of ['方案', '失败处理', '影响与风险', '验证入口']) assert.match(blank.error.message, new RegExp(heading, 'u'));

  completeDesign(root, id);
  put(taskRecordRoot(root, id), taskPath(id), read(taskRecordRoot(root, id), taskPath(id)).replace('### 取舍\n\n不新增并行入口，保持现有接口。', '### 取舍\n\n'));
  const design = success(cli(root, 'confirm', id, 'design'));
  assert.ok(design.warnings.some(item => item.includes('取舍')));

  put(taskRecordRoot(root, id), taskPath(id), read(taskRecordRoot(root, id), taskPath(id))
    .replace('失败时返回明确结果并保留原记录。', 'TODO')
    .replace('运行引用本用例的具名测试。', ''));
  const checked = failure(cli(root, 'check', id));
  assert.match(checked.warnings.join('\n'), new RegExp(`任务设计“失败处理”.*仅空白或占位.*${taskPath(id).replaceAll('.', '\\.')}`, 'u'));
  assert.match(checked.warnings.join('\n'), new RegExp(`任务设计“验证入口”.*仅空白或占位.*${taskPath(id).replaceAll('.', '\\.')}`, 'u'));
});

test('CASE-195 CASE-270 CASE-272 init creates complete requirement and design section skeletons without long examples', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));

  const requirements = read(root, '.tiller/specs/requirements.md');
  for (const heading of ['使用场景', '目标', '业务范围', '关键行为', '异常与边界', '验收条件']) {
    assert.match(requirements, new RegExp(`^## ${heading}$`, 'mu'));
  }
  const design = read(root, '.tiller/specs/design.md');
  for (const heading of ['方案', '失败处理', '取舍', '影响与风险', '验证入口']) {
    assert.match(design, new RegExp(`^## ${heading}$`, 'mu'));
  }
  const modules = read(root, '.tiller/specs/modules/README.md');
  assert.match(modules, /requirements\.md.*使用场景/u);
  assert.match(modules, /design\.md.*验证入口/u);
  assert.match(read(root, '.tiller/rules/activities/requirements.md'), /任务记录固定写使用场景、目标/u);
  assert.match(read(root, '.tiller/rules/quality/documents.md'), /需求写使用场景、目标/u);
  for (const content of [requirements, design, modules]) {
    assert.doesNotMatch(content, /```/u);
    assert.ok(content.length < 1200);
  }

  for (const relative of ['rules/activities/requirements.md', 'rules/activities/design.md', 'rules/quality/documents.md', 'usage.md']) {
    assert.equal(read(root, `.tiller/${relative}`), readFileSync(new URL(`../resources/${relative}`, import.meta.url), 'utf8'));
  }
});

test('CASE-273 acceptance heading is always 验收条件 without the legacy stable suffix', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const requirements = read(root, '.tiller/specs/requirements.md');
  assert.match(requirements, /^## 验收条件$/mu);
  assert.match(requirements, /AC-n/u);
  assert.doesNotMatch(requirements, /^## 验收条件（稳定）$/mu);

  const id = '20261026-acceptance-heading';
  success(cli(root, 'start', id, '--title', 'Acceptance heading', '--requirement', 'Render the canonical heading.',
    '--criterion', 'AC-1=Heading has no legacy suffix', '--size', 'small', '--target', 'src'));
  const content = read(taskRecordRoot(root, id), taskPath(id));
  assert.match(content, /^### 验收条件$/mu);
  assert.match(content, /^- AC-1: Heading has no legacy suffix$/mu);
  assert.doesNotMatch(content, /验收条件（稳定）/u);
});

test('CASE-207 requirement and design guidance reduces noise while confirmation gates remain', async t => {
  const root = await project(t);
  const id = '20261024-doc-noise';
  success(cli(root, 'start', id, '--title', 'Documentation noise', '--requirement', 'Keep business constraints prominent.',
    '--criterion', 'AC-1=Guidance stays focused', '--type', 'feature', '--size', 'standard', '--target', 'src', '--target', 'test'));
  const content = read(taskRecordRoot(root, id), taskPath(id));
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
