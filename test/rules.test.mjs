import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cli, fixture, success } from './helpers.mjs';

const resources = fileURLToPath(new URL('../resources/', import.meta.url));
const repository = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(resources, path), 'utf8');

test('entry keeps the small and standard flows explicit and bounded', () => {
  const entry = read('entry.md');
  assert.match(entry, /小改动走“需求确认 → 实现 → 验证”/u);
  assert.match(entry, /标准或大功能走“需求确认 → 设计确认 → 实现 → 验证”/u);
  assert.match(entry, /默认人工节点只有需求、设计和交付验收/u);
  assert.match(entry, /规划、合入、发布按需确认/u);
  assert.match(entry, /只修改本次范围内的文件/u);
  assert.match(entry, /同一问题两次修复失败即停止/u);
  assert.match(entry, /验收条件必须编号，先转为全局用例，再映射具体测试引用/u);
  assert.match(entry, /不保存原始日志、全文快照、自举工程或安装包/u);
  assert.match(entry, /不得出现密钥、token、凭据或本机绝对路径/u);
  assert.match(entry, /变化时同步 `\.tiller\/context\/`/u);
  assert.doesNotMatch(entry, /advanced/u);
});

test('core and usage describe the only supported default-flow record path', () => {
  const core = read('rules/core.md');
  assert.match(core, /小改动 \| 需求确认 → 实现 → 验证/u);
  assert.match(core, /标准\/大功能 \| 需求确认 → 设计确认 → 实现 → 验证/u);
  assert.match(core, /规划不是默认人工节点/u);
  assert.match(core, /轻量任务只维护 `\.tiller\/task\/<id>\/task\.md`/u);
  assert.match(core, /确认绑定 `task\.md` 的结构化正文/u);
  assert.match(core, /原话可选/u);
  assert.match(core, /不保存全文快照.*自举工程或安装包/u);
  assert.match(core, /同一问题连续两次尝试失败时停止自动修复/u);
  assert.match(core, /变化需同步 `\.tiller\/context\/`/u);
  assert.match(core, /交付前自检：逐条核对验收条件；检查 diff 是否越界；确认测试未被删除或弱化/u);
  assert.match(core, /只支持当前及直接兼容的上一资源契约/u);
  assert.match(core, /版本号只在正式发布时修改/u);
  assert.doesNotMatch(core, /advanced|上一版本升级/u);
  const usage = read('usage.md');
  for (const command of ['start', 'resume', 'confirm', 'verify', 'check', 'accept', 'close']) assert.ok(usage.includes(`run.cjs ${command}`), command);
  assert.match(usage, /reopen/u);
  assert.match(usage, /--size small/u);
  assert.match(usage, /standard 另生成/u);
  assert.match(usage, /\.tiller\/cases\//u);
  assert.match(usage, /单任务只有 `\.tiller\/task\/<id>\/task\.md`/u);
  assert.match(usage, /`--quote` 可选/u);
  assert.match(usage, /`--by` 默认取 `git config user\.name`/u);
  assert.match(usage, /--abandon/u);
  assert.match(usage, /不保存全文快照和日志/u);
  assert.match(usage, /当前及上一资源契约/u);
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

test('task records use Git and one task.md rather than snapshots or evidence packages', () => {
  const core = read('rules/core.md');
  assert.match(core, /确认前校验必填段/u);
  assert.match(core, /需求和设计独立摘要/u);
  assert.match(core, /验证记录用例、命令、结果、提交和代码树摘要/u);
  assert.match(core, /从 Git 取回或重跑/u);
  assert.doesNotMatch(core, /`work\.md`/u);
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
  assert.match(readme, /单次任务以 `task\.md` 与 Git 追溯/u);
  assert.match(readme, /原话只是可选凭证，不能替代正文/u);
  assert.match(readme, /确认部分、确认人、时间、提交/u);
  assert.match(readme, /单个任务只保留一份 `task\.md`/u);
  assert.match(readme, /close --abandon/u);
  assert.match(readme, /reopen --reason/u);
  assert.match(readme, /\.tiller\/cases\//u);
  assert.match(readme, /版本号只在正式发布正式包时修改/u);
  assert.match(readme, /升级命令|升级支持当前及直接兼容的上一资源契约/u);
  assert.doesNotMatch(readme, /advanced|0\.4\.0 升级到 0\.5\.0/u);
});

test('global cases use module kinds and scenarios with resolvable named tests', () => {
  const directory = join(repository, '.tiller/cases');
  assert.deepEqual(readdirSync(directory).sort(), ['index.md', 'modules', 'scenarios']);
  const specs = readdirSync(join(repository, '.tiller/specs/modules'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const kinds = ['behavior', 'interface', 'performance', 'security'];
  const cases = [];
  const counts = {};
  for (const module of readdirSync(join(directory, 'modules'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    assert.ok(specs.includes(module), `unknown case module ${module}`);
    counts[module] = { behavior: 0, interface: 0, performance: 0, security: 0 };
    for (const name of readdirSync(join(directory, 'modules', module)).sort()) {
      const kind = name.slice(0, -5);
      assert.ok(name.endsWith('.json') && kinds.includes(kind), `${module}/${name}`);
      const value = JSON.parse(readFileSync(join(directory, 'modules', module, name), 'utf8'));
      assert.equal(value.schemaVersion, 1);
      assert.equal(value.module, module);
      assert.equal(value.kind, kind);
      assert.ok(value.cases.length > 0);
      counts[module][kind] += value.cases.length;
      cases.push(...value.cases.map(item => ({ ...item, file: `${module}/${name}` })));
    }
  }
  const scenarios = readdirSync(join(directory, 'scenarios')).filter(name => name.endsWith('.json')).sort()
    .flatMap(name => JSON.parse(readFileSync(join(directory, 'scenarios', name), 'utf8')).scenarios);
  cases.push(...scenarios.map(item => ({ ...item, file: `scenarios/${item.id}` })));
  assert.equal(cases.length, 67);
  assert.deepEqual(cases.map(item => item.id).sort(), Array.from({ length: 67 }, (_, index) => `CASE-${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(counts, {
    initialization: { behavior: 3, interface: 0, performance: 11, security: 0 },
    standards: { behavior: 3, interface: 0, performance: 0, security: 0 },
    verification: { behavior: 4, interface: 5, performance: 15, security: 0 },
    workflow: { behavior: 15, interface: 6, performance: 0, security: 3 },
  });
  for (const item of scenarios) {
    assert.ok(item.modules.length > 0 && item.modules.every(module => specs.includes(module)), `${item.id}: modules`);
  }
  for (const item of cases.filter(entry => Number(entry.id.slice(5)) >= 50)) {
    assert.ok(Array.isArray(item.criteria) && item.criteria.length > 0, `${item.id}: criteria`);
  }
  const slug = value => value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/gu, '-');
  for (const item of cases) {
    assert.ok(item.requirements.length > 0 && item.source.length > 0, `${item.id}: references`);
    for (const reference of [...item.requirements, ...item.source]) {
      const [file, anchor] = reference.split('#');
      const target = join(repository, file);
      assert.ok(existsSync(target), `${item.id}: missing ${reference}`);
      if (anchor) {
        const headings = [...readFileSync(target, 'utf8').matchAll(/^#+\s+(.+)$/gmu)].map(match => slug(match[1]));
        assert.ok(headings.includes(decodeURIComponent(anchor)), `${item.id}: missing heading ${reference}`);
      }
    }
    const [testFile, testName] = item.test_ref.split('::');
    assert.ok(testFile && testName, `${item.id}: named test_ref`);
    const content = readFileSync(join(repository, testFile), 'utf8');
    const names = [...content.matchAll(/\b(?:test|it)\s*\(\s*(['"`])(.*?)\1\s*,/gu)].map(match => match[2]);
    assert.ok(names.includes(testName), `${item.id}: missing ${item.test_ref}`);
  }
});

test('structured confirmation guidance is synchronized across help and durable docs', () => {
  const help = success(cli(repository, '--help')).help;
  assert.match(help, /--by/u);
  assert.match(help, /原话可选/u);
  assert.match(help, /start 生成结构化需求/u);
  assert.doesNotMatch(help, /验收始终需要真实用户原话|confirm 需要 --quote/u);
  for (const relative of ['README.md', 'resources/entry.md', 'resources/usage.md', 'resources/rules/core.md',
    'resources/rules/activities/requirements.md', 'resources/rules/activities/design.md', 'resources/rules/activities/delivery.md']) {
    const content = readFileSync(join(repository, relative), 'utf8');
    assert.doesNotMatch(content, /只接受真实原话|需要真实用户原话|再取得真实用户原话|原话只作凭证，不能替代正文/u, relative);
  }
  const specs = readFileSync(join(repository, '.tiller/specs/modules/workflow/requirements.md'), 'utf8');
  assert.match(specs, /确认人/u);
  assert.match(specs, /原话可选/u);
  assert.match(specs, /目标、范围/u);
  assert.match(specs, /方案.*影响与风险/u);
  const decisions = readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8');
  assert.match(decisions, /原话不再必填/u);
  const cases = readFileSync(join(repository, '.tiller/cases/index.md'), 'utf8');
  assert.match(cases, /原话可选/u);
  assert.match(cases, /结构化/u);
});
