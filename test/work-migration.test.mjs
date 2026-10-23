import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { initialize, RESOURCE_VERSION } from '../dist/core.js';
import { CLI_VERSION } from '../dist/cli.js';
import { fixture } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFileSync(join(repository, relative), 'utf8');

const migrated = {
  '20261015-isolated-delivery': '隔离开发与评审合入',
  '20261015-unify-entry': '统一通用工作入口',
  '20261015-work-artifacts': '工作记录约定与阶段产物',
  '20261016-functional-planning': '功能分块与项目骨架推进',
  '20261016-implementation-progress': 'tiller 实现进度记录',
  '20261016-project-onboarding': '项目接手与开发规范建立',
  '20261016-repository-layout': '独立管理仓库分组布局',
  '20261016-usage-entry': '使用入口与命令定位',
  '20261017-implementation-planning': '实施规划与任务拆分流程完善',
  '20261019-task-delivery-gates': '任务推进与交付门禁',
  '20261019-testing-verification': '测试用例与验证证据管理',
  '20261020-typed-workflows': '按任务类型选择与组合工作流程',
  '20261022-flow-naming': '将默认工作流模块从 lite 重命名为 flow',
  '20261022-global-cases': '恢复轻量全局用例事实库',
  '20261022-lightweight-flow': '精简 tiller 为轻量标准流程并删除旧审计',
  'human-confirmation': '关键节点人工确认',
  'initial-delivery': '首个可用交付',
};

test('CASE-110 migrated history keeps one structured task record for every work id', () => {
  assert.equal(existsSync(join(repository, '.tiller/work')), false);
  for (const [id, title] of Object.entries(migrated)) {
    const relative = `.tiller/task/${id}/task.md`;
    assert.ok(existsSync(join(repository, relative)), `${id}: missing ${relative}`);
    const content = read(relative);
    assert.ok(content.startsWith(`# ${title}\n`), `${id}: title`);
    assert.match(content, new RegExp(`<!-- tiller-task:v1 \\{"version":1,"id":"${id}"`, 'u'), `${id}: marker`);
    assert.match(content, /^## 需求$/mu, `${id}: requirement`);
    assert.match(content, /^### 迁移说明$/mu, `${id}: migration note`);
    assert.match(content, /^### 历史记录$/mu, `${id}: history body`);
    assert.match(content, /^## 确认\n\n尚无确认。$/mu, `${id}: no invented confirmation`);
    assert.match(content, /^## 验证\n\n尚无验证。$/mu, `${id}: no invented verification`);
  }
});

test('CASE-111 current documentation and initialization expose task, not the legacy work tree', async t => {
  const root = fixture(t);
  await initialize({ root });
  assert.equal(existsSync(join(root, '.tiller/work')), false);
  const index = readFileSync(join(root, '.tiller/index.md'), 'utf8');
  assert.doesNotMatch(index, /`work\/`|\(work\//u);
  assert.match(index, /`task\/`：当前任务记录/u);

  const currentDocs = [
    'README.md',
    '.tiller/usage.md',
    '.tiller/index.md',
    '.tiller/rules/project.md',
    '.tiller/context/project.md',
    '.tiller/specs/requirements.md',
    '.tiller/specs/decisions.md',
    '.tiller/specs/modules/workflow/requirements.md',
  ];
  for (const relative of currentDocs) {
    const content = read(relative);
    assert.doesNotMatch(content, /\]\((?:\.\.\/)?work\//u, `${relative}: current work link`);
    assert.doesNotMatch(content, /`work\/`：|\.tiller\/work\/`? 只读保留/u, `${relative}: current work model`);
  }
  assert.match(read('.tiller/usage.md'), /外部仓.*只读遗留/u);
  assert.match(read('.tiller/context/project.md'), /历史实现记录.*task\//u);
});

test('CASE-113 migration preserves the 0.5.0 release contract and full verification entry', () => {
  const packageVersion = JSON.parse(read('package.json')).version;
  const projectVersion = JSON.parse(read('.tiller/project.json')).resourceVersion;
  assert.equal(packageVersion, '0.5.0');
  assert.equal(CLI_VERSION, packageVersion);
  assert.equal(RESOURCE_VERSION, packageVersion);
  assert.equal(projectVersion, packageVersion);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts.test, /test-suites\.mjs all/u);
  assert.ok(scripts['test:package']);
  const suites = JSON.parse(read('test/suites.json'));
  assert.equal(Object.values(suites).flat().filter(file => file === 'work-migration.test.mjs').length, 1);
});
