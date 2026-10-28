import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, commitFixtures, completeDesign, confirmTask, failure, fixture, put, snapshot, success, taskRecordRoot } from './helpers.mjs';

const read = (root, relative) => readFileSync(join(root, relative), 'utf8');
const taskId = '20261022-first-batch';

async function initialized(t) {
  const root = fixture(t);
  success(cli(root, 'init'));
  return root;
}

function commitAll(root, message = 'test: 夹具提交') {
  commitFixtures(root, message);
}

function checkoutTaskBranch(root, id) {
  const checkedOut = spawnSync('git', ['checkout', '--quiet', '-b', `fix/${id}-fixture`], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(checkedOut.error && checkedOut.error.code !== 'EPERM' ? checkedOut.error : null);
  assert.equal(checkedOut.status, 0, checkedOut.stderr);
}

function moduleSpec(root, name, heading = '默认工作流') {
  put(root, `.tiller/specs/modules/${name}/requirements.md`, `# ${heading}\n\n## 行为\n\n模块行为应可验证。\n`);
  put(root, `.tiller/specs/modules/${name}/design.md`, `# ${heading}设计\n\n测试引用可定位到具体行为。\n`);
}

function topSpec(root) {
  put(root, '.tiller/specs/first-batch.md', '# 第一批功能\n\n## R1 基础能力\n\n## R2 后续能力\n\n## R3 待拆分能力\n');
}

function stageTask(root, id) {
  return success(cli(root, 'resume', id)).stage;
}

function addDesign(root, id) {
  const relative = `.tiller/task/${id}/task.md`;
  const checkout = taskRecordRoot(root, id);
  const content = read(checkout, relative);
  assert.match(content, /^### 方案$/mu);
  completeDesign(checkout, id);
}

function activeFiles(root) {
  const files = [];
  const visit = relative => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (/\.(?:md|json|cjs|ts)$/u.test(entry.name)) files.push(child);
    }
  };
  for (const relative of ['.tiller/specs', '.tiller/rules', '.tiller/cases', 'resources']) visit(relative);
  files.push('README.md', 'AGENTS.md', '.tiller/usage.md', '.tiller/index.md', '.tiller/context/project.md');
  return files;
}

test('CASE-050 empty init creates the guided skeleton without overwriting existing files', async t => {
  const root = fixture(t);
  put(root, '.tiller/specs/requirements.md', '# 用户已有需求\n\n保留原文。\n');
  const result = success(cli(root, 'init'));
  assert.equal(result.ready, true);
  assert.equal(read(root, '.tiller/specs/requirements.md'), '# 用户已有需求\n\n保留原文。\n');
  for (const relative of [
    '.github/pull_request_template.md',
    '.tiller/specs/design.md', '.tiller/specs/decisions.md', '.tiller/specs/modules/README.md',
    '.tiller/context/project.md', '.tiller/cases/index.md', '.tiller/cases/modules/.gitkeep',
    '.tiller/cases/scenarios/.gitkeep', '.tiller/plans/README.md',
  ]) assert.ok(existsSync(join(root, relative)), relative);
  const before = snapshot(root);
  assert.equal(success(cli(root, 'init')).changed, false);
  assert.deepEqual(snapshot(root), before);
});

test('CASE-052 planning blocks unfinished dependencies, reports uncovered requirements and invalidates body edits', async t => {
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

test('CASE-053 case add allocates unique ids for module cases and scenarios without task ACs', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'alpha');
  moduleSpec(root, 'beta');
  success(cli(root, 'start', taskId, '--title', '用例登记', '--requirement', '按验收条件登记模块用例和场景',
    '--criterion', 'AC-1=模块用例可登记', '--criterion', 'AC-2=场景可登记', '--size', 'small', '--target', '.tiller', '--target', 'test'));
  success(confirmTask(root, taskId, 'requirements', '--quote', '测试确认该需求'));
  const first = success(cli(root, 'case', 'add', taskId, '--module', 'alpha', '--kind', 'behavior',
    '--title', '模块行为', '--expected', '模块行为通过测试',
    '--spec', '.tiller/specs/modules/alpha/requirements.md'));
  assert.equal(first.id, 'CASE-001');
  assert.equal(first.path, '.tiller/cases/modules/alpha/behavior.md');
  assert.deepEqual(first.criteria, []);
  assert.match(first.skeleton, /CASE-001 模块行为/u);
  const scenario = success(cli(root, 'case', 'add', taskId, '--scenario', 'alpha-to-beta', '--module', 'alpha', '--module', 'beta',
    '--title', '跨模块场景', '--expected', '跨模块场景通过测试',
    '--spec', '.tiller/specs/modules/alpha/requirements.md'));
  assert.equal(scenario.id, 'CASE-002');
  assert.equal(scenario.path, '.tiller/cases/scenarios/alpha-to-beta.md');
  const stored = read(root, scenario.path);
  assert.match(stored, /- 模块：alpha, beta/u);
  assert.match(stored, /- 关联 AC：无/u);
  const unknown = failure(cli(root, 'case', 'add', taskId, '--module', 'missing', '--kind', 'security',
    '--title', '不存在模块', '--expected', '模块不存在'));
  assert.equal(unknown.error.code, 'CASE_MODULE_NOT_FOUND');
  assert.match(unknown.error.message, /specs\/modules\/missing/u);
});

test('CASE-054 CASE-264 check accepts verified coverage without a task AC back-reference', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'alpha');
  success(cli(root, 'start', taskId, '--title', '反向绑定', '--requirement', '每条 AC 必须与全局用例双向对应',
    '--criterion', 'AC-1=验证命中正确用例', '--size', 'small', '--target', 'src', '--target', 'test', '--target', '.tiller/cases'));
  success(confirmTask(root, taskId, 'requirements', '--quote', '测试确认该需求'));
  const added = success(cli(root, 'case', 'add', taskId, '--module', 'alpha', '--kind', 'behavior',
    '--title', '稳定需求覆盖', '--expected', '验证记录直接承载 AC 到测试与 CASE 的关联。'));
  assert.deepEqual(added.criteria, []);
  put(root, 'src/alpha.mjs', 'export const alpha = true;\n');
  put(root, 'test/alpha.test.mjs', `import assert from 'node:assert/strict';\nimport test from 'node:test';\n\ntest('${added.id} alpha behaves', () => { assert.equal(true, true); });\n`);
  commitAll(root, 'test: alpha 行为夹具');
  success(cli(root, 'verify', taskId, '--criterion', 'AC-1', '--test', `test/alpha.test.mjs::${added.id} alpha behaves`));
  checkoutTaskBranch(root, taskId);
  const checked = success(cli(root, 'check', taskId));
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.deepEqual(checked.criteria[0].cases, [added.id]);
});

test('CASE-055 new project runs init, plan, start, confirm, case add, verify, check and accept end to end', async t => {
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
    '--criterion', 'AC-1=接入链路可验收', '--target', 'src', '--target', 'test', '--target', '.tiller', '--plan', 'onboarding', '--item', 'P-1'));
  assert.equal(started.size, 'small');
  assert.equal(started.plan, 'onboarding');
  success(confirmTask(root, taskId, 'requirements', '--quote', '测试确认该需求'));
  const added = success(cli(root, 'case', 'add', taskId, '--module', 'sample', '--kind', 'behavior',
    '--title', '接入链路行为', '--expected', '接入流程返回预期结果',
    '--spec', '.tiller/specs/modules/sample/requirements.md'));
  assert.equal(added.id, 'CASE-001');
  put(root, 'src/sample.mjs', 'export const sample = () => 42;\n');
  put(root, 'test/sample.test.mjs', `import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { sample } from '../src/sample.mjs';\n\ntest('${added.id} sample flow works', () => { assert.equal(sample(), 42); });\n`);
  commitAll(root, 'test: sample 流程夹具');
  const verified = success(cli(root, 'verify', taskId, '--criterion', 'AC-1', '--test', `test/sample.test.mjs::${added.id} sample flow works`));
  assert.deepEqual(verified.cases, ['CASE-001']);
  checkoutTaskBranch(root, taskId);
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

test('CASE-051 upgrade previews and applies a compatible resource refresh while preserving user edits', async t => {
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

test('CASE-056 task stages derive from task facts and fall back on invalid confirmation or stale verification', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'workflow');
  put(root, 'src/lifecycle.mjs', 'export const lifecycle = 1;\n');
  const id = '20261022-stage-flow';
  success(cli(root, 'start', id, '--title', '阶段推导', '--requirement', 'Task stage behavior is derived from records.',
    '--criterion', 'AC-1=Each confirmed fact advances the stage', '--size', 'standard',
    '--target', 'src', '--target', 'test', '--target', '.tiller'));
  assert.equal(stageTask(root, id), '已开始');
  success(confirmTask(root, id, 'requirements', '--quote', '确认阶段需求'));
  assert.equal(stageTask(root, id), '需求已确认');
  addDesign(root, id);
  assert.equal(stageTask(root, id), '需求已确认');
  success(confirmTask(root, id, 'design', '--quote', '确认阶段设计'));
  assert.equal(stageTask(root, id), '设计已确认');
  const stageCase = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', '阶段推进',
    '--expected', '阶段随任务事实推进',
    '--spec', '.tiller/specs/modules/workflow/requirements.md#2-开始与接续'));
  put(root, 'test/lifecycle.test.mjs', `import assert from 'node:assert/strict';\nimport test from 'node:test';\n\ntest('${stageCase.id} lifecycle stage behavior', () => assert.equal(1, 1));\n`);
  commitAll(root, 'test: 生命周期阶段夹具');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `test/lifecycle.test.mjs::${stageCase.id} lifecycle stage behavior`));
  assert.equal(stageTask(root, id), '已验证');
  checkoutTaskBranch(root, id);
  success(cli(root, 'accept', id, '--quote', '验收阶段流程'));
  assert.equal(stageTask(root, id), '已验收');
  const taskPath = `.tiller/task/${id}/task.md`;
  put(taskRecordRoot(root, id), taskPath, read(taskRecordRoot(root, id), taskPath).replace('Task stage behavior is derived from records.', 'Task stage behavior changed after confirmation.'));
  const invalidated = success(cli(root, 'resume', id));
  assert.equal(invalidated.stage, '已开始');
  assert.match(invalidated.stageReason, /需求确认已失效/u);

  const staleId = '20261022-stale-verification';
  put(root, 'src/stale.mjs', 'export const stale = 1;\n');
  success(cli(root, 'start', staleId, '--title', '验证过期', '--requirement', 'A stale verification falls back to requirements confirmed.',
    '--criterion', 'AC-1=Expired verification is visible', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller'));
  success(confirmTask(root, staleId, 'requirements', '--quote', '确认过期验证需求'));
  const staleCase = success(cli(root, 'case', 'add', staleId, '--module', 'workflow', '--kind', 'behavior', '--title', '验证过期回退',
    '--expected', '代码变化后显示验证过期',
    '--spec', '.tiller/specs/modules/workflow/requirements.md#flow-09-依据验证结果判断交付'));
  put(root, 'test/stale.test.mjs', `import assert from 'node:assert/strict';\nimport test from 'node:test';\n\ntest('${staleCase.id} stale verification behavior', () => assert.equal(1, 1));\n`);
  success(cli(root, 'verify', staleId, '--criterion', 'AC-1', '--test', `test/stale.test.mjs::${staleCase.id} stale verification behavior`));
  assert.equal(stageTask(root, staleId), '已验证');
  put(root, 'src/stale.mjs', 'export const stale = 2;\n');
  const stale = success(cli(root, 'resume', staleId));
  assert.equal(stale.stage, '需求已确认');
  assert.match(stale.stageReason, /验证已过期/u);
});

test('CASE-057 CASE-308 accepted close cleans local state without materializing; reopen after merge simulation', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'workflow');
  put(root, 'src/close.mjs', 'export const close = 1;\n');
  commitAll(root, 'test: 关闭流程初始化夹具');
  const id = '20261022-close-flow';
  success(cli(root, 'start', id, '--title', '关闭流程', '--requirement', 'An accepted task can be closed and reopened.',
    '--criterion', 'AC-1=Close blocks terminal changes', '--size', 'small',
    '--target', 'src', '--target', 'test', '--target', '.tiller'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认关闭需求'));
  const closeCase = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior', '--title', '关闭与重开',
    '--expected', '关闭后阻止变更并可重开',
    '--spec', '.tiller/specs/modules/workflow/requirements.md#flow-15-在关键节点取得人工确认'));
  put(root, 'test/close.test.mjs', `import assert from 'node:assert/strict';
import test from 'node:test';

test('${closeCase.id} close lifecycle behavior', () => assert.equal(1, 1));
`);
  commitAll(root, 'test: 关闭生命周期夹具');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `test/close.test.mjs::${closeCase.id} close lifecycle behavior`));
  success(cli(root, 'accept', id, '--quote', '验收关闭流程'));
  const alreadyAccepted = failure(cli(root, 'close', id, '--reason', '不能放弃', '--abandon'));
  assert.equal(alreadyAccepted.error.code, 'ALREADY_ACCEPTED');
  const taskFile = `.tiller/task/${id}/task.md`;
  const beforeClose = read(taskRecordRoot(root, id), taskFile);
  assert.equal(existsSync(join(root, taskFile)), false);
  put(root, taskFile, beforeClose);
  commitAll(root, 'chore(workflow): 模拟合入关闭任务记录');
  put(root, `.tiller/local/${id}/cleanup-marker.txt`, 'local only\n');
  const closed = success(cli(root, 'close', id, '--reason', '交付完成并收尾'));
  assert.equal(closed.stage, '已验收');
  assert.match(closed.stageReason, /本机清理完成/u);
  assert.equal(existsSync(join(root, `.tiller/local/${id}`)), false);
  assert.equal(existsSync(join(root, taskFile)), true, 'the merged task record remains tracked on primary');
  const status = spawnSync('git', ['status', '--porcelain', '--', taskFile], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(status.status, 0, status.stderr);
  assert.doesNotMatch(status.stdout, /^\?\?/mu);
  assert.doesNotMatch(beforeClose, /^## 关闭$/mu);

  const listed = success(cli(root, 'resume'));
  assert.equal(listed.tasks.find(entry => entry.id === id).stage, '已验收');
  const reopened = success(cli(root, 'reopen', id, '--reason', '需要再次交付'));
  assert.equal(reopened.stage, '已验证');
  const checked = success(cli(root, 'check', id));
  assert.equal(checked.confirmations.find(entry => entry.gate === 'acceptance').confirmed, false);
  success(cli(root, 'accept', id, '--quote', '重新验收关闭流程'));
  assert.equal(stageTask(root, id), '已验收');
});

test('CASE-308 abandon does not materialize an untracked task onto primary', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'workflow');
  const id = '20261027-abandon-no-materialize';
  const started = success(cli(root, 'start', id, '--title', '放弃不复制', '--requirement', 'Abandon only cleans the task checkout.',
    '--criterion', 'AC-1=Abandon does not seed primary', '--size', 'small'));
  const worktree = join(root, started.worktreeRoot);
  success(confirmTask(root, id, 'requirements'));
  assert.equal(existsSync(join(root, `.tiller/task/${id}/task.md`)), false);

  const refused = failure(cli(worktree, 'close', id, '--reason', '需求取消', '--abandon'));
  assert.equal(refused.error.code, 'ABANDON_NOT_PERSISTABLE');
  assert.ok(existsSync(worktree));
  assert.equal(existsSync(join(root, `.tiller/task/${id}`)), false);

  const live = read(taskRecordRoot(worktree, id), `.tiller/task/${id}/task.md`);
  put(root, `.tiller/task/${id}/task.md`, live);
  commitAll(root, 'chore(workflow): 持久化待放弃任务记录');
  const abandoned = success(cli(root, 'close', id, '--reason', '需求取消', '--abandon'));
  assert.equal(abandoned.stage, '已放弃');
  assert.match(read(root, `.tiller/task/${id}/task.md`), /^- 状态：已放弃$/mu);
});

test('CASE-058 abandoned tasks are terminal, reopenable, and not counted as active or accepted plan work', async t => {
  const root = await initialized(t);
  moduleSpec(root, 'workflow');
  success(cli(root, 'plan', 'start', 'abandon-plan', '--title', '放弃统计', '--goal', '验证放弃任务不污染规划状态',
    '--spec', '.tiller/specs/modules/workflow/requirements.md#3-规划拆分',
    '--item', 'P-1=可放弃任务;size=small;deps=-;specs=.tiller/specs/modules/workflow/requirements.md#3-规划拆分'));
  success(cli(root, 'plan', 'confirm', 'abandon-plan', '--quote', '确认放弃统计规划'));
  const id = '20261022-abandon-flow';
  success(cli(root, 'start', id, '--title', '放弃任务', '--requirement', 'An abandoned task stops active plan work.',
    '--criterion', 'AC-1=Abandonment is visible in planning', '--plan', 'abandon-plan', '--item', 'P-1'));
  success(confirmTask(root, id, 'requirements', '--quote', '确认放弃任务需求'));
  const active = success(cli(root, 'plan', 'status', 'abandon-plan'));
  assert.equal(active.items[0].status, '进行中');
  assert.equal(active.items[0].tasks[0].stage, '需求已确认');
  const refused = failure(cli(root, 'close', id, '--reason', '未验收不能收尾'));
  assert.equal(refused.error.code, 'NOT_ACCEPTED');
  // Seed primary with the live task record so abandon refreshes an existing copy (no materialize).
  const liveTask = read(taskRecordRoot(root, id), `.tiller/task/${id}/task.md`);
  put(root, `.tiller/task/${id}/task.md`, liveTask);
  commitAll(root, 'chore(workflow): 模拟已合入任务记录后放弃');
  const abandoned = success(cli(root, 'close', id, '--reason', '需求取消', '--abandon'));
  assert.equal(abandoned.stage, '已放弃');
  assert.match(read(root, `.tiller/task/${id}/task.md`), /^- 状态：已放弃$/mu);
  const status = success(cli(root, 'plan', 'status', 'abandon-plan'));
  assert.equal(status.items[0].status, '已放弃');
  assert.equal(status.items[0].tasks[0].stage, '已放弃');
  assert.equal(status.items[0].tasks[0].accepted, false);
  assert.equal(success(cli(root, 'resume')).tasks.find(entry => entry.id === id).stage, '已放弃');
  assert.equal(failure(cli(root, 'confirm', id, 'requirements', '--quote', '放弃后不能确认')).error.code, 'TASK_ABANDONED');
  assert.equal(failure(cli(root, 'verify', id, '--criterion', 'AC-1',
    '--test', 'test/missing.test.mjs::missing')).error.code, 'TASK_ABANDONED');
  assert.equal(failure(cli(root, 'accept', id, '--quote', '放弃后不能验收')).error.code, 'TASK_ABANDONED');
  const reopened = success(cli(root, 'reopen', id, '--reason', '需求恢复'));
  assert.equal(reopened.stage, '需求已确认');
  const resumedPlan = success(cli(root, 'plan', 'status', 'abandon-plan'));
  assert.equal(resumedPlan.items[0].status, '进行中');
  assert.equal(resumedPlan.items[0].tasks[0].stage, '需求已确认');
});

test('CASE-059 specs archive is removed and active guidance has no archival references', () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  assert.equal(existsSync(join(repositoryRoot, '.tiller/specs/archive')), false);
  for (const relative of activeFiles(repositoryRoot)) {
    const content = readFileSync(join(repositoryRoot, relative), 'utf8');
    assert.doesNotMatch(content, /specs\/archive|archive\/|归档|旧规格/u, relative);
  }
});
