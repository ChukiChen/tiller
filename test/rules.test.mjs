import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cli, fixture, success } from './helpers.mjs';

const resources = fileURLToPath(new URL('../resources/', import.meta.url));
const read = path => readFileSync(join(resources, path), 'utf8');

test('entry keeps the small and standard flows explicit and bounded', () => {
  const entry = read('entry.md');
  assert.match(entry, /小改动走“需求确认 → 实现 → 验证”/u);
  assert.match(entry, /标准或大功能走“需求确认 → 设计确认 → 实现 → 验证”/u);
  assert.match(entry, /默认人工节点只有需求、设计和交付验收/u);
  assert.match(entry, /规划、合入、发布按需确认/u);
  assert.match(entry, /只修改本次范围内的文件/u);
  assert.match(entry, /同一问题连续两次修复失败就停止/u);
  assert.match(entry, /验收条件必须编号，并映射到具体测试引用/u);
  assert.match(entry, /不保存原始日志、文件全文快照、自举工程或安装包/u);
  assert.match(entry, /不得出现密钥、token、凭据或本机绝对路径/u);
  assert.match(entry, /同步更新 `\.tiller\/context\/`/u);
  assert.doesNotMatch(entry, /advanced/u);
});

test('core and usage describe the only supported default-flow record path', () => {
  const core = read('rules/core.md');
  assert.match(core, /小改动 \| 需求确认 → 实现 → 验证/u);
  assert.match(core, /标准\/大功能 \| 需求确认 → 设计确认 → 实现 → 验证/u);
  assert.match(core, /规划不是默认人工节点/u);
  assert.match(core, /轻量工作只维护 `\.tiller\/work\/<id>\/work\.md`/u);
  assert.match(core, /不保存被确认文件全文快照、原始日志、自举工程、安装包或重复证据/u);
  assert.match(core, /同一问题连续两次尝试失败时停止自动修复/u);
  assert.match(core, /以下变化需要同步 `\.tiller\/context\/`/u);
  assert.match(core, /交付前自检：逐条核对验收条件；检查 diff 是否越界；确认测试未被删除或弱化/u);
  assert.match(core, /只支持当前资源契约/u);
  assert.match(core, /版本号只在正式发布时修改/u);
  assert.doesNotMatch(core, /advanced|上一版本升级/u);
  const usage = read('usage.md');
  for (const command of ['start', 'resume', 'confirm', 'verify', 'check', 'accept']) assert.ok(usage.includes(`run.cjs ${command}`), command);
  assert.match(usage, /--size small/u);
  assert.match(usage, /--size standard/u);
  assert.match(usage, /不保存全文快照和日志/u);
  assert.match(usage, /只检查当前资源契约/u);
  assert.doesNotMatch(usage, /advanced|上一版本到当前版本/u);
  assert.match(read('rules/index.md'), /规则按需读取/u);
});

test('required reading stays within the default-flow budget', () => {
  const required = ['entry.md', 'usage.md', 'rules/index.md', 'rules/core.md'];
  const total = required.reduce((sum, name) => sum + read(name).length, 0);
  assert.ok(total <= 5000, `required reading is ${total} characters`);
  assert.ok(read('rules/core.md').length < 3000, 'core rules should stay concise');
});

test('initialization preserves the guidance reading chain and valid links', t => {
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
});

test('work records use Git and one work.md rather than snapshots or evidence packages', () => {
  const core = read('rules/core.md');
  assert.match(core, /确认记录用户原话、提交和对象摘要/u);
  assert.match(core, /验证记录命令、结果、提交和代码树摘要/u);
  assert.match(core, /从 Git 取回或重跑命令/u);
  assert.doesNotMatch(core, /record\.json.*必须|reviews\/|证据包/u);
  assert.doesNotMatch(read('rules/activities/delivery.md'), /advanced/u);
  assert.doesNotMatch(read('rules/quality/verification.md'), /advanced/u);
});

test('activity rules keep requirements, design, implementation and delivery bounded', () => {
  assert.match(read('rules/activities/requirements.md'), /行为|接口|边界/u);
  assert.match(read('rules/activities/design.md'), /对比有实质影响的候选方案/u);
  assert.match(read('rules/activities/implementation.md'), /只修改本次声明的文件范围/u);
  assert.match(read('rules/activities/implementation.md'), /连续两次修复失败/u);
  assert.match(read('rules/activities/delivery.md'), /逐条核对验收条件/u);
  assert.match(read('rules/activities/delivery.md'), /测试未被删除、跳过或弱化/u);
  assert.match(read('rules/activities/delivery.md'), /合入与发布仍需各自授权/u);
});

test('README describes only the default flow and release-time versioning', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /小改动：需求确认 → 实现 → 验证/u);
  assert.match(readme, /标准或大功能：需求确认 → 设计确认 → 实现 → 验证/u);
  assert.match(readme, /默认人工节点只有需求、设计/u);
  assert.match(readme, /只以 `work\.md` 与 Git 作为记录来源/u);
  assert.match(readme, /版本号只在正式发布正式包时修改/u);
  assert.match(readme, /升级命令只核对当前契约/u);
  assert.doesNotMatch(readme, /advanced|0\.4\.0 升级到 0\.5\.0/u);
});
