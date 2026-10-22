import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { cli, failure, fixture, put, snapshot, success } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const taskId = '20261022-first-batch';

async function initialized(t) {
  const root = fixture(t);
  success(cli(root, 'init'));
  return root;
}

function moduleSpec(root, name, heading = '默认工作流') {
  put(root, `.tiller/specs/modules/${name}/requirements.md`, `# ${heading}\n\n## 行为\n\n模块行为应可验证。\n`);
  put(root, `.tiller/specs/modules/${name}/design.md`, `# ${heading}设计\n\n测试引用可定位到具体行为。\n`);
}

function topSpec(root) {
  put(root, '.tiller/specs/first-batch.md', '# 第一批功能\n\n## R1 基础能力\n\n## R2 后续能力\n\n## R3 待拆分能力\n');
}

test('empty init creates the guided skeleton without overwriting existing files', async t => {
  const root = fixture(t);
  put(root, '.tiller/specs/requirements.md', '# 用户已有需求\n\n保留原文。\n');
  const result = success(cli(root, 'init'));
  assert.equal(result.ready, true);
  assert.equal(read(root, '.tiller/specs/requirements.md'), '# 用户已有需求\n\n保留原文。\n');
  for (const relative of [
    '.tiller/specs/design.md', '.tiller/specs/decisions.md', '.tiller/specs/modules/README.md',
    '.tiller/context/project.md', '.tiller/cases/index.md', '.tiller/cases/modules/.gitkeep',
    '.tiller/cases/scenarios/.gitkeep', '.tiller/plans/README.md',
  ]) assert.ok(existsSync(join(root, relative)), relative);
  const before = snapshot(root);
  assert.equal(success(cli(root, 'init')).changed, false);
  assert.deepEqual(snapshot(root), before);
});

test('planning blocks unfinished dependencies, reports uncovered requirements and invalidates body edits', async t => {
  const root = await initialized(t);
  topSpec(root);
  const started = success(cli(root, 'plan', 'start', 'first-batch',
    '--title', '第一批规划', '--goal', '拆分并推进第一批能力',
    '--spec', '.tiller/specs/first-batch.md#R1', '--spec', '.tiller/specs/first-batch.md#R2',
    '--spec', '.tiller/specs/first-batch.md#R3',
    '--item', 'P-1=基础能力;size=small;deps=-;specs=.tiller/specs/first-batch.md#R1;plan=module-plan',
    '--item', 'P-2=后续能力;size=standard;deps=P-1;specs=.tiller/specs/first-batch.md#R2'));
  assert.deepEqual(started.items, ['P-1', 'P-2']);
  success(cli(root, 'plan', 'confirm', 'first-batch', '--quote', '测试确认该规划'));
  const status = success(cli(root, 'plan', 'status', 'first-batch'));
  assert.equal(status.confirmed, true);
  assert.deepEqual(status.uncoveredRequirements, ['.tiller/specs/first-batch.md#R3']);
  assert.equal(status.items.find(item => item.id === 'P-1').childPlan, 'module-plan');
  assert.deepEqual(status.items.find(item => item.id === 'P-2').blockedBy, ['P-1']);
  const blocked = failure(cli(root, 'start', 'blocked-task', '--title', '被阻塞', '--requirement', '依赖未完成不能开工',
    '--criterion', 'AC-1=阻塞后不生成任务', '--plan', 'first-batch', '--item', 'P-2'));
  assert.equal(blocked.error.code, 'PLAN_DEPENDENCY_BLOCKED');
  assert.ok(!existsSync(join(root, '.tiller/task/blocked-task/task.md')));
  const planPath = '.tiller/plans/first-batch.md';
  put(root, planPath, read(root, planPath).replace('# 第一批规划', '# 被修改的规划'));
  const changed = success(cli(root, 'plan', 'status', 'first-batch'));
  assert.equal(changed.confirmed, false);
  assert.match(changed.confirmationIssue, /正文已变化/u);
  const refused = failure(cli(root, 'plan', 'confirm', 'first-batch', '--quote', '测试再次确认'));
  assert.equal(refused.error.code, 'PLAN_BODY_CHANGED');
  const missing = failure(cli(root, 'plan', 'start', 'missing-ref', '--title', '缺引用', '--goal', '检查引用',
    '--spec', '.tiller/specs/missing.md#R1', '--item', 'P-1=缺引用'));
  assert.equal(missing.error.code, 'PLAN_REFERENCE_NOT_FOUND');
  const missingItem = failure(cli(root, 'plan', 'start', 'missing-item-ref', '--title', '缺条目引用', '--goal', '检查条目引用',
    '--spec', '.tiller/specs/first-batch.md#R1', '--item', 'P-1=缺条目;specs=.tiller/specs/missing.md#R1'));
  assert.equal(missingItem.error.code, 'PLAN_REFERENCE_NOT_FOUND');
});

test('case add allocates unique ids for module cases and scenarios with source ACs', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'alpha');
  moduleSpec(root, 'beta');
  success(cli(root, 'start', taskId, '--title', '用例登记', '--requirement', '按验收条件登记模块用例和场景',
    '--criterion', 'AC-1=模块用例可登记', '--criterion', 'AC-2=场景可登记', '--size', 'small', '--target', '.tiller', '--target', 'test'));
  success(cli(root, 'confirm', taskId, 'requirements', '--quote', '测试确认该需求'));
  const first = success(cli(root, 'case', 'add', taskId, '--module', 'alpha', '--kind', 'behavior',
    '--title', '模块行为', '--test', 'test/alpha.test.mjs::alpha behaves',
    '--criterion', 'AC-1', '--spec', '.tiller/specs/modules/alpha/requirements.md', '--source', 'src/alpha.mjs'));
  assert.equal(first.id, 'CASE-001');
  assert.equal(first.path, '.tiller/cases/modules/alpha/behavior.json');
  assert.deepEqual(first.criteria, [`${taskId}#AC-1`]);
  assert.match(first.skeleton, /alpha behaves/u);
  const scenario = success(cli(root, 'case', 'add', taskId, '--scenario', 'alpha-to-beta', '--module', 'alpha', '--module', 'beta',
    '--title', '跨模块场景', '--test', 'test/scenario.test.mjs::alpha reaches beta', '--criterion', 'AC-2',
    '--spec', '.tiller/specs/modules/alpha/requirements.md', '--source', 'src/alpha.mjs'));
  assert.equal(scenario.id, 'CASE-002');
  assert.equal(scenario.path, '.tiller/cases/scenarios/alpha-to-beta.json');
  const stored = JSON.parse(read(root, scenario.path)).scenarios[0];
  assert.deepEqual(stored.modules, ['alpha', 'beta']);
  assert.deepEqual(stored.criteria, [`${taskId}#AC-2`]);
  const unknown = failure(cli(root, 'case', 'add', taskId, '--module', 'missing', '--kind', 'security',
    '--title', '不存在模块', '--test', 'test/missing.test.mjs::missing', '--criterion', 'AC-1', '--source', 'src/missing.mjs'));
  assert.equal(unknown.error.code, 'CASE_MODULE_NOT_FOUND');
  assert.match(unknown.error.message, /specs\/modules\/missing/u);
});

test('check blocks a verified case whose criteria do not point back to the task AC', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'alpha');
  success(cli(root, 'start', taskId, '--title', '反向绑定', '--requirement', '每条 AC 必须与全局用例双向对应',
    '--criterion', 'AC-1=验证命中正确用例', '--size', 'small', '--target', 'src', '--target', 'test'));
  success(cli(root, 'confirm', taskId, 'requirements', '--quote', '测试确认该需求'));
  put(root, 'src/alpha.mjs', 'export const alpha = true;\n');
  put(root, 'test/alpha.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\n\n test('alpha behaves', () => { assert.equal(true, true); });\n");
  put(root, '.tiller/cases/modules/alpha/behavior.json', JSON.stringify({
    schemaVersion: 1, module: 'alpha', kind: 'behavior', cases: [{
      id: 'CASE-003', title: '历史错配用例', requirements: ['.tiller/specs/modules/alpha/requirements.md'],
      modules: ['alpha'], test_ref: 'test/alpha.test.mjs::alpha behaves', source: ['src/alpha.mjs'],
      criteria: ['20260101-other-task#AC-1'],
    }],
  }, null, 2) + '\n');
  success(cli(root, 'verify', taskId, '--criterion', 'AC-1', '--test', 'test/alpha.test.mjs::alpha behaves',
    '--command', 'node --test test/alpha.test.mjs', '--result', 'passed'));
  const checked = failure(cli(root, 'check', taskId));
  assert.ok(checked.issues.some(issue => issue.includes('未在其 criteria 中回指')), checked.issues.join('\n'));
});

test('new project runs init, plan, start, confirm, case add, verify, check and accept end to end', async t => {
  const root = await initialized(t);
  assert.match(read(root, 'AGENTS.md'), /tiller 工作入口/u);
  assert.match(read(root, '.tiller/usage.md'), /case add/u);
  assert.match(read(root, '.tiller/rules/core.md'), /全局用例/u);
  topSpec(root);
  moduleSpec(root, 'sample');
  success(cli(root, 'plan', 'start', 'onboarding', '--title', '新项目接入', '--goal', '完成一条可验收的默认流程',
    '--spec', '.tiller/specs/first-batch.md#R1',
    '--item', 'P-1=接入并验证;size=small;deps=-;specs=.tiller/specs/first-batch.md#R1'));
  success(cli(root, 'plan', 'confirm', 'onboarding', '--quote', '测试确认该接入规划'));
  const started = success(cli(root, 'start', taskId, '--title', '接入冒烟', '--requirement', '空项目接入后能完成一条受控任务',
    '--criterion', 'AC-1=接入链路可验收', '--target', 'src', '--target', 'test', '--plan', 'onboarding', '--item', 'P-1'));
  assert.equal(started.size, 'small');
  assert.equal(started.plan, 'onboarding');
  success(cli(root, 'confirm', taskId, 'requirements', '--quote', '测试确认该需求'));
  const added = success(cli(root, 'case', 'add', taskId, '--module', 'sample', '--kind', 'behavior',
    '--title', '接入链路行为', '--test', 'test/sample.test.mjs::sample flow works', '--criterion', 'AC-1',
    '--spec', '.tiller/specs/modules/sample/requirements.md', '--source', 'src/sample.mjs'));
  assert.equal(added.id, 'CASE-001');
  put(root, 'src/sample.mjs', 'export const sample = () => 42;\n');
  put(root, 'test/sample.test.mjs', "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { sample } from '../src/sample.mjs';\n\ntest('sample flow works', () => { assert.equal(sample(), 42); });\n");
  const verified = success(cli(root, 'verify', taskId, '--criterion', 'AC-1', '--test', 'test/sample.test.mjs::sample flow works',
    '--command', 'node --test test/sample.test.mjs', '--run', 'node --test test/sample.test.mjs'));
  assert.deepEqual(verified.cases, ['CASE-001']);
  const checked = success(cli(root, 'check', taskId));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.equal(checked.cases.matched, 1);
  success(cli(root, 'accept', taskId, '--quote', '测试验收该接入链路'));
  const status = success(cli(root, 'plan', 'status', 'onboarding'));
  assert.equal(status.items[0].status, '已验收');
  const resumed = success(cli(root, 'resume', taskId));
  assert.equal(resumed.plan, 'onboarding');
  assert.equal(resumed.item, 'P-1');
});

test('upgrade previews and applies a compatible resource refresh while preserving user edits', async t => {
  const root = await initialized(t);
  const metadataPath = '.tiller/project.json';
  const corePath = '.tiller/rules/core.md';
  const metadata = JSON.parse(read(root, metadataPath));
  const previous = '# Previous core rules\n';
  put(root, corePath, previous);
  metadata.resourceVersion = '0.4.0';
  metadata.managedFiles[corePath] = (await import('node:crypto')).createHash('sha256').update(previous, 'utf8').digest('hex');
  put(root, metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  const before = snapshot(root);
  const preview = success(cli(root, 'upgrade', '--plan'));
  assert.equal(preview.sourceVersion, '0.4.0');
  assert.equal(preview.targetVersion, '0.5.0');
  assert.ok(preview.changes.some(change => change.path === corePath));
  assert.deepEqual(snapshot(root), before);
  success(cli(root, 'upgrade', '--apply', preview.planId));
  assert.equal(read(root, corePath), readFileSync(new URL('../resources/rules/core.md', import.meta.url), 'utf8'));
  assert.equal(JSON.parse(read(root, metadataPath)).resourceVersion, '0.5.0');
  const modified = previous + '用户修改\n';
  put(root, corePath, modified);
  const plan = JSON.parse(read(root, metadataPath));
  plan.managedFiles[corePath] = (await import('node:crypto')).createHash('sha256').update(previous, 'utf8').digest('hex');
  put(root, metadataPath, JSON.stringify(plan, null, 2) + '\n');
  const conflict = failure(cli(root, 'upgrade', '--plan'));
  assert.ok(conflict.issues.some(issue => issue.includes('用户修改了受管文件') && issue.includes('首个差异')), conflict.issues.join('\n'));
  assert.equal(read(root, corePath), modified);
});
