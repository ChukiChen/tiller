import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cli, fixture, success } from './helpers.mjs';

const resources = fileURLToPath(new URL('../resources/', import.meta.url));
const read = (path) => readFileSync(join(resources, path), 'utf8');

// These checks guard shipped guidance and installation, not actual AI compliance.
test('entry exposes human checkpoints without relying only on a linked rule', () => {
  const entry = read('entry.md');
  assert.match(entry, /需求.*用户确认.*设计/);
  assert.match(entry, /设计.*用户确认.*代码与测试/);
  assert.match(entry, /交付验收与发布分别确认/);
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
      const target = resolve(root, dirname(file), relative);
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
  for (const filename of ['work.md', 'requirements.md', 'design.md', 'record.json', 'README.md']) {
    assert.ok(entry.includes(`\`${filename}\``), filename);
  }
  assert.match(entry, /record\.json.*不自行编造/);
  assert.match(entry, /README\.md.*不能替代上述产物/);
  assert.match(read('rules/index.md'), /必读其中的\[工作记录约定\]/);
  const core = read('rules/core.md');
  assert.equal((core.match(/^## 工作记录约定$/gm) ?? []).length, 1);
  assert.match(core, /简单工作仅可合并.*过程信息.*需求与设计保持分开/);
  assert.match(core, /规则升级不迁移工作记录/);
  assert.match(core, /不回填历史批准、不自动批准设计/);
  assert.match(core, /单个产物交付完成不表示整项软件工作完成/);
  for (const directory of ['activities', 'quality']) {
    for (const filename of readdirSync(join(resources, 'rules', directory))) {
      assert.match(read(`rules/${directory}/${filename}`), /\[工作记录约定\]\(\.\.\/core\.md#工作记录约定\)/);
    }
  }
});

test('tiller uses the same single managed entry as a newly initialized project', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const normalize = text => text.replaceAll('\r\n', '\n');
  const installed = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const self = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
  assert.equal(normalize(self), normalize(installed), 'self-hosted entry must not maintain a second generic body');
  assert.equal((installed.match(/<!-- tiller:entry:start -->/g) ?? []).length, 1);
  const before = installed;
  success(cli(root, 'init'));
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), before);
});
