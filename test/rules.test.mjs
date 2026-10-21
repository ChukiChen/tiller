import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cli, fixture, success } from './helpers.mjs';
import { ENTRY_START, ENTRY_END, RESOURCE_VERSION, trackedContent, matchesManagedDigest } from '../dist/core.js';

const resources = fileURLToPath(new URL('../resources/', import.meta.url));
const read = (path) => readFileSync(join(resources, path), 'utf8');

// These checks guard shipped guidance and installation, not actual AI compliance.
test('entry exposes human checkpoints without relying only on a linked rule', () => {
  const entry = read('entry.md');
  assert.match(entry, /功能开发及适用的变更阶段仍先确认需求、设计和规划，再编写代码与测试/);
  assert.match(entry, /分析、审查可按明确请求调查并交付报告，不自动修复/);
  assert.match(entry, /交付、验收和发布分别判断/);
  assert.match(entry, /类型名称、任务简单或一般授权不能减免适用节点/);
  const core = read('rules/core.md');
  assert.doesNotMatch(core, /已有授权无需逐阶段重复确认/);
  assert.match(core, /小任务.*不能自行免除确认/);
  assert.match(core, /沉默和等待时间不能代替用户决定/);
});

test('guidance covers the student-service shortcut and distinguishes acceptance from approval', () => {
  const core = read('rules/core.md');
  assert.match(core, /Java 接口、增删改查、内存实现.*并未确认尚未展示/);
  assert.match(core, /已有代码和旧完成记录不能证明此前获批/);
  assert.match(read('rules/activities/implementation.md'), /设计未确认不编写代码与测试/);
  assert.match(read('rules/activities/delivery.md'), /交付验收不自动授予发布权限/);
  assert.match(read('rules/quality/verification.md'), /不能自行写一个来源文件冒充批准/);
});

test('shipped guidance separates planning approval from task execution and historical evidence', () => {
  const core = read('rules/core.md');
  assert.match(core, /总体设计确认 → 实施规划确认 → 逐任务细化必要需求与设计/);
  assert.match(core, /骨架.*首个任务.*不作为独立流程阶段/);
  assert.match(core, /总体设计确认不能自动代替实施规划确认/);
  assert.match(core, /必要验证失败或缺项.*不进入依赖它的任务/);
  assert.match(core, /最终成品的测试.*不能倒填/);
  assert.match(core, /每任务技术验证不默认增加人工批准/);
  for (const command of ['work plan register', 'work plan activate', 'work task status', 'work task start', 'work task verify', 'work task resume', 'work delivery-check', 'work delivery-ready']) {
    assert.ok(core.includes(`\`${command}\``), command);
  }
  assert.doesNotMatch(core, /当前 CLI 尚无实施规划确认类型|work adopt|migrate-confirmations/);
  assert.match(core, /历史回执只证明当时成功.*当前有效性仍须重算/);
  assert.match(core, /旧版机器记录、未知版本或字段明确拒绝.*保留原文/);
  assert.match(core, /不得把技术未通过改写成通过/);
  assert.match(read('entry.md'), /取得 planning 确认并激活.*逐任务/);
  assert.match(read('rules/activities/implementation.md'), /并行改串行.*重新核对当前任务与依赖/);
  assert.match(read('rules/activities/delivery.md'), /必要任务未验证.*不能报告整体技术检查已完成/);
  assert.match(read('templates/product-design.md'), /展示生成的审阅视图并取得 planning 确认后激活/);
  const delivery = read('rules/activities/delivery.md');
  for (const status of ['technicalReady', 'operationAllowed', 'processEvidence', 'acceptance']) assert.ok(delivery.includes(status), status);
  assert.match(delivery, /accepted-with-exceptions.*保留技术未就绪事实/);
  assert.match(delivery, /delivery-ready 或 merge 例外不适用/);
  assert.match(delivery, /普通文档验收不增加整体任务完成前置/);
  assert.match(read('rules/quality/verification.md'), /verification capture.*captureId/);
  assert.doesNotMatch(read('entry.md'), /work adopt|migrate-confirmations/);
});

test('initialization preserves the guidance reading chain and ships no preapproved templates', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  assert.ok(readFileSync(join(root, 'AGENTS.md'), 'utf8').includes(read('entry.md').trim()));
  const files = ['AGENTS.md', '.tiller/rules/index.md', '.tiller/rules/core.md'];
  for (const dir of ['activities', 'quality']) {
    for (const name of readdirSync(join(resources, 'rules', dir))) files.push(`.tiller/rules/${dir}/${name}`);
  }
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    if (file.startsWith('.tiller/rules/')) {
      assert.equal(text.replaceAll('\r\n', '\n'), read(file.slice('.tiller/'.length)).replaceAll('\r\n', '\n'), `${file}: installed guidance differs from shipped resource`);
    }
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const [relative, anchor] = match[1].split('#');
      const target = relative ? resolve(root, dirname(file), relative) : resolve(root, file);
      assert.ok(existsSync(target), `${file}: broken reading link ${match[1]}`);
      if (anchor) {
        const headings = [...readFileSync(target, 'utf8').matchAll(/^#+ (.+)$/gm)].map(heading => heading[1].trim());
        assert.ok(headings.includes(decodeURIComponent(anchor)), `${file}: missing rule section ${match[1]}`);
      }
    }
  }
  for (const section of ['已有项目接手', '项目开发规范']) {
    for (const file of ['AGENTS.md', '.tiller/rules/index.md']) {
      assert.ok(readFileSync(join(root, file), 'utf8').includes(`core.md#${section}`), `${file}: missing onboarding navigation to ${section}`);
    }
  }
  for (const file of readdirSync(join(resources, 'templates'))) {
    const text = read(`templates/${file}`);
    assert.match(text, /> 状态：草稿，尚未确认。/, file);
    assert.doesNotMatch(text, /> 状态：(?:已确认|已批准|已验收)/, file);
    assert.match(text, /确认来源、内容版本和下一步另记工作记录/, file);
  }
});

test('entry and reading chain expose work contracts without permitting merged specifications', t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const entry = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(entry, /必须使用对应命令创建或登记/);
  for (const filename of ['work.md', 'record.json', 'README.md']) {
    assert.ok(entry.includes(`\`${filename}\``), filename);
  }
  assert.match(entry, /产物按图按需建立或引用/);
  assert.match(entry, /适用的需求和设计分别维护，不为分析或审查补造规格/);
  assert.match(entry, /record\.json.*不自行编造/);
  assert.match(entry, /README\.md.*不能替代上述产物/);
  assert.match(read('rules/index.md'), /必读其中的\[工作记录约定\]/);
  const core = read('rules/core.md');
  assert.match(core, /`requirements\.md`、`design\.md`.*按活动需要生成.*需求有效确认后才能补充对应设计/);
  assert.equal((core.match(/^## 工作记录约定$/gm) ?? []).length, 1);
  assert.match(core, /简单工作仅可合并.*过程信息.*需求与设计保持分开/);
  assert.match(core, /工程资源升级独立进行，不迁移工作记录/);
  assert.match(core, /当前确认与事件按真实顺序重新建立，不复制旧批准或完成状态/);
  assert.match(core, /登记引用不表示文档合格或用户已确认/);
  assert.match(read('rules/activities/delivery.md'), /一个产物完成不等于整项软件交付完成/);
  assert.match(core, /单份文档验收.*不代替整体交付绑定/);
  for (const directory of ['activities', 'quality']) {
    for (const filename of readdirSync(join(resources, 'rules', directory))) {
      assert.match(read(`rules/${directory}/${filename}`), /\[工作记录约定\]\(\.\.\/core\.md#工作记录约定\)/);
    }
  }
});

test('current initialization and fixed management each preserve their registered single entry', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const normalize = text => text.replaceAll('\r\n', '\n');
  const installed = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const self = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  const installedMetadata = JSON.parse(readFileSync(join(root, '.tiller/project.json'), 'utf8'));
  const selfMetadata = JSON.parse(readFileSync(new URL('../.tiller/project.json', import.meta.url), 'utf8'));
  assert.equal(installedMetadata.resourceVersion, RESOURCE_VERSION);
  assert.equal(selfMetadata.resourceVersion, '0.4.0', 'fixed management resources must not be upgraded with the candidate');
  assert.equal(normalize(installed).trim(), `${ENTRY_START}\n${normalize(read('entry.md')).trimEnd()}\n${ENTRY_END}`);
  for (const [label, entry, metadata] of [['current', installed, installedMetadata], ['management', self, selfMetadata]]) {
    const section = trackedContent('AGENTS.md', entry);
    assert.equal(normalize(entry).trim(), normalize(section), `${label}: no second generic body outside the managed entry`);
    assert.ok(matchesManagedDigest('AGENTS.md', section, metadata.managedFiles['AGENTS.md']), `${label} ${metadata.resourceVersion}: entry differs from its registered managed digest`);
  }
  const before = installed;
  success(cli(root, 'init'));
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), before);
});
