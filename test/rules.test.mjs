import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cli, fixture, success } from './helpers.mjs';
import { readCaseLibrary } from '../dist/cases.js';
import { managedFilesForPlatform, RULES, sha256 } from '../dist/core.js';

const resources = fileURLToPath(new URL('../resources/', import.meta.url));
const repository = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(resources, path), 'utf8');

test('CASE-084 entry keeps the small and standard flows explicit and bounded', () => {
  const entry = read('entry.md');
  assert.match(entry, /小改动走“需求确认 → 实现 → 验证”/u);
  assert.match(entry, /标准或大功能走“需求确认 → 设计确认 → 实现 → 验证”/u);
  assert.match(entry, /默认人工节点只有需求、设计和交付验收/u);
  assert.match(entry, /规划、.*合入、发布按需确认/u);
  assert.match(entry, /只修改本次范围内的文件/u);
  assert.match(entry, /同一问题两次修复失败即停止/u);
  assert.match(entry, /验收条件必须编号，先转为全局用例.*CASE-NNN/u);
  assert.match(entry, /不提交日志、全文快照、自举工程或安装包/u);
  assert.match(entry, /不得出现密钥、token、凭据或本机绝对路径/u);
  assert.match(entry, /变化时同步 `\.tiller\/context\/`/u);
  assert.doesNotMatch(entry, /advanced/u);
});

test('CASE-103 core and usage describe the only supported default-flow record path', () => {
  const core = read('rules/core.md');
  assert.match(core, /小改动 \| 需求确认 → 实现 → 验证/u);
  assert.match(core, /标准\/大功能 \| 需求确认 → 设计确认 → 实现 → 验证/u);
  assert.match(core, /规划不是默认人工节点/u);
  assert.match(core, /轻量任务只维护 `\.tiller\/task\/<id>\/task\.md`/u);
  assert.match(core, /确认绑定 `task\.md` 的结构化正文/u);
  assert.match(core, /原话可选/u);
  assert.match(core, /不提交全文快照.*自举工程或安装包/u);
  assert.match(core, /同一问题连续两次失败即停止/u);
  assert.match(core, /变化需同步 `\.tiller\/context\/`/u);
  assert.match(core, /交付前逐条核对 AC、diff 边界、测试弱化和记录安全/u);
  assert.match(core, /只支持当前及直接兼容的上一资源契约/u);
  assert.match(core, /版本号只在正式发布时修改/u);
  assert.doesNotMatch(core, /advanced|上一版本升级/u);
  const usage = read('usage.md');
  for (const command of ['start', 'resume', 'confirm', 'verify', 'review', 'check', 'accept', 'release', 'close', 'pr']) assert.ok(usage.includes(`run.cjs ${command}`), command);
  assert.match(usage, /reopen/u);
  assert.match(usage, /--size small/u);
  assert.match(usage, /standard 另生成/u);
  assert.match(usage, /\.tiller\/cases\//u);
  assert.match(usage, /单任务只有 `\.tiller\/task\/<id>\/task\.md`/u);
  assert.match(usage, /`--quote` 可选/u);
  assert.match(usage, /`--by` 默认取 `git config user\.name`/u);
  assert.match(usage, /--abandon/u);
  assert.match(usage, /不提交全文快照或日志/u);
  assert.match(usage, /当前及上一资源契约/u);
  assert.doesNotMatch(usage, /advanced|上一版本到当前版本/u);
  assert.match(usage, /类型\(模块\): 中文摘要/u);
  assert.match(usage, /\[任务编号\]/u);
  assert.match(usage, /类型\/任务编号/u);
  assert.match(usage, /--requirement-file/u);
  assert.match(usage, /已验收任务钉在验收提交/u);
  const delivery = read('rules/activities/delivery.md');
  assert.match(delivery, /类型\(模块\): 中文摘要/u);
  assert.match(delivery, /PR\/MR 标题.*\[任务编号\]/u);
  assert.match(delivery, /`pr <task-id>`/u);
  assert.match(delivery, /main\/master 与 detached HEAD/u);
  const template = read('pull_request_template.md');
  for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) {
    assert.equal(template.split(`## ${heading}`).length - 1, 1, heading);
  }
  assert.doesNotMatch(template, /范围外|不在范围/u);
  assert.match(read('rules/index.md'), /规则按需读取/u);
});

test('CASE-049 CASE-074 CASE-085 required reading budget allows clear guidance within 7000 characters', () => {
  const required = ['entry.md', 'usage.md', 'rules/index.md', 'rules/core.md'];
  const total = required.reduce((sum, name) => sum + read(name).length, 0);
  assert.ok(total <= 8000, `required reading is ${total} characters (about 7000, slight overflow allowed)`);
  assert.ok(read('rules/core.md').length < 4000, 'core rules should stay concise');
});

test('CASE-084 restored guidance keeps complete commands and explicit boundaries', () => {
  const usage = read('usage.md');
  assert.match(usage, /node \.tiller\/run\.cjs resume/u);
  assert.match(usage, /--summary/u);
  assert.match(usage, /标题摘要优先取 `pr --summary`/u);
  assert.match(usage, /变更内容按提交时间正序/u);
  assert.match(usage, /平台在初始化时选定[，；]之后不能通过 CLI 切换/u);
  assert.match(usage, /需手动修改 `\.tiller\/project\.json` 并补齐对应模板/u);

  const core = read('rules/core.md');
  assert.match(core, /CLI 只检查受控操作和读取到的数据/u);
  assert.match(core, /不认证身份，也不阻止宿主直接写入/u);
  assert.match(core, /约 7000 字符/u);

  const delivery = read('rules/activities/delivery.md');
  assert.match(delivery, /`pr <task-id>`.*生成标题、五段说明和建议分支/u);
  assert.match(delivery, /平台在初始化时选定[，；]之后不能通过 CLI 切换/u);
});

test('CASE-091 verification guidance requires execution, reporting reasons and failure-first evidence', () => {
  const usage = read('usage.md');
  assert.match(usage, /只声明测试/u);
  assert.match(usage, /私有临时报告/u);
  assert.match(usage, /--verbose/u);
  assert.match(usage, /--reported --command .*--result .*--reason/u);
  assert.match(usage, /--allow-reported/u);
  assert.match(usage, /--expect-fail/u);
  assert.match(usage, /基线.*工作树/u);
  assert.match(usage, /--run.*已删除/u);

  const core = read('rules/core.md');
  assert.match(core, /verify.*自主执行|tiller 自主执行/u);
  assert.match(core, /外部报告.*理由/u);
  assert.match(core, /失败先行/u);
  assert.match(core, /standard 任务.*--target/u);

  const delivery = read('rules/activities/delivery.md');
  assert.match(delivery, /--reported/u);
  assert.match(delivery, /--allow-reported/u);

  const readme = readFileSync(join(repository, 'README.md'), 'utf8');
  assert.match(readme, /^## 快速开始$/mu);
  assert.match(readme, /合入与本机清理由 AI 按 tiller 约定完成/u);
  assert.match(readme, /`merge`\/`close`/u);
  assert.doesNotMatch(readme, /私有.*报告|--reported|失败先行/u);
});

test('CASE-097 verification guidance requires self-run tests and private reports', () => {
  const usage = read('usage.md');
  assert.match(usage, /只声明测试.*tiller 构造并执行/u);
  assert.match(usage, /stdout\/stderr 不参与判定/u);
  assert.match(usage, /verify\.prepare/u);
  assert.match(usage, /verify\.runner/u);
  assert.match(usage, /\.tiller\/local\/<任务编号>\/logs\//u);
  assert.match(usage, /报告缺失或损坏、匹配 0 个或多个测试、失败或跳过/u);

  const verification = read('rules/quality/verification.md');
  assert.match(verification, /完整名称.*精确匹配.*仅命中一个通过事件/u);
  assert.match(verification, /TestRunner/u);
  assert.match(verification, /verify\.prepare/u);

  const core = read('rules/core.md');
  assert.match(core, /私有报告/u);
  assert.match(core, /stdout\/stderr 不参与判定/u);
});

test('CASE-050 initialization preserves the guidance reading chain and valid links', t => {
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

test('CASE-111 task records use Git and one task.md rather than snapshots or evidence packages', () => {
  const core = read('rules/core.md');
  assert.match(core, /确认前校验必填段/u);
  assert.match(core, /需求和设计独立摘要/u);
  assert.match(core, /验证留摘要与旁路.*完整命令.*日志/u);
  assert.match(core, /从 Git 取回或重跑/u);
  assert.doesNotMatch(core, /`work\.md`/u);
  assert.doesNotMatch(core, /record\.json.*必须|reviews\/|证据包/u);
  assert.doesNotMatch(read('rules/activities/delivery.md'), /advanced/u);
  assert.doesNotMatch(read('rules/quality/verification.md'), /advanced/u);
});

test('CASE-151 activity rules keep requirements, design, implementation and delivery bounded', () => {
  assert.match(read('rules/activities/requirements.md'), /行为|接口|边界/u);
  assert.match(read('rules/activities/design.md'), /对比有实质影响的候选方案/u);
  assert.match(read('rules/activities/implementation.md'), /只修改本次声明的文件范围/u);
  assert.match(read('rules/activities/implementation.md'), /连续两次修复失败/u);
  assert.match(read('rules/activities/delivery.md'), /逐条核对验收条件/u);
  assert.match(read('rules/activities/delivery.md'), /测试未被删除、跳过或弱化/u);
  assert.match(read('rules/activities/delivery.md'), /合入与发布仍需各自授权/u);
});

test('CASE-246 code quality and security rules stay mirrored and managed', () => {
  const code = read('rules/quality/code.md');
  const codePatterns = [
    /规则标识：QUALITY-CODE/u,
    /\*\*命名\*\*：.*名称清楚.*一致.*无意义缩写/u,
    /\*\*结构\*\*：.*小步可改.*模块边界清晰/u,
    /\*\*扩展性\*\*：.*真实变化.*假想场景/u,
    /\*\*反过度设计\*\*：.*过早泛化.*多层包装.*未使用.*依赖/u,
    /\*\*可读性\*\*：.*意图.*公共 API.*稳定.*内部实现.*简化/u,
    /\*\*边界校验一次\*\*：.*未知输入.*边界.*类型化值.*内部.*重复.*防御/u,
    /\*\*保持简单\*\*：.*一个函数.*单次使用.*helper.*内联/u,
    /\*\*假想风险\*\*：.*竞态.*安全边角.*失败模式.*概率.*代价/u,
    /\*\*注释\*\*：.*非显而易见.*约束.*流水账/u,
  ];
  for (const pattern of codePatterns) assert.match(code, pattern);

  const documents = read('rules/quality/documents.md');
  for (const pattern of [
    /日志、PR\/MR 和任务记录.*密钥、token、凭据.*本机绝对路径/u,
    /\*\*输入与授权\*\*：.*边界校验.*授权范围.*类型化值/u,
    /\*\*依赖来源\*\*：.*来源可信.*版本/u,
    /\*\*危险操作\*\*：.*显式确认/u,
    /\*\*加固边界\*\*：.*具体威胁.*过度加固.*威胁与失败模式/u,
  ]) assert.match(documents, pattern);

  for (const relative of ['rules/quality/code.md', 'rules/quality/documents.md', 'rules/index.md',
    'rules/activities/implementation.md', 'rules/activities/delivery.md']) {
    assert.equal(readFileSync(join(repository, '.tiller', relative), 'utf8'), read(relative), `${relative}: mirror differs`);
  }

  const implementation = read('rules/activities/implementation.md');
  assert.match(implementation, /\[代码质量\]\(\.\.\/quality\/code\.md\)/u);
  assert.match(implementation, /\[安全约定\]\(\.\.\/quality\/documents\.md#安全\)/u);
  const delivery = read('rules/activities/delivery.md');
  assert.match(delivery, /交付前.*\[代码质量\]\(\.\.\/quality\/code\.md\).*\[安全约定\]\(\.\.\/quality\/documents\.md#安全\)/u);
  const index = read('rules/index.md');
  assert.match(index, /代码质量 \| \[代码质量\]\(quality\/code\.md\)/u);
  assert.match(index, /文档质量与安全.*documents\.md/u);

  assert.ok(RULES.includes('rules/quality/code.md'));
  assert.ok(managedFilesForPlatform('github').includes('.tiller/rules/quality/code.md'));
  const metadata = JSON.parse(readFileSync(join(repository, '.tiller/project.json'), 'utf8'));
  assert.deepEqual(Object.keys(metadata.managedFiles).sort(), managedFilesForPlatform('github').sort());
  for (const relative of ['rules/quality/code.md', 'rules/quality/documents.md', 'rules/index.md',
    'rules/activities/implementation.md', 'rules/activities/delivery.md']) {
    const managed = `.tiller/${relative}`;
    assert.equal(metadata.managedFiles[managed], sha256(readFileSync(join(repository, managed), 'utf8')), managed);
  }
  assert.equal(metadata.resourceVersion, '0.5.0');
  assert.equal(JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version, '0.5.0');
});

test('CASE-109 README is a user-facing quick start without internal flow detail', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /^## 快速开始$/mu);
  assert.match(readme, /^### 安装$/mu);
  assert.match(readme, /^### 初始化工程$/mu);
  assert.match(readme, /^### 用 AI 开发一个功能$/mu);
  assert.match(readme, /`merge`\/`close`/u);
  assert.doesNotMatch(readme, /小改动：|标准或大功能：|默认人工节点|task\.md|close --abandon|reopen --reason|私有报告|--reported|失败先行|advanced/u);
});

test('CASE-048 global cases use module kinds and scenarios with resolvable named tests', async () => {
  const directory = join(repository, '.tiller/cases');
  assert.deepEqual(readdirSync(directory).sort(), ['index.md', 'modules', 'scenarios']);
  const specs = readdirSync(join(repository, '.tiller/specs/modules'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const kinds = ['behavior', 'interface', 'performance', 'security'];
  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  assert.equal(library.cases.length, 307);
  assert.deepEqual(library.cases.map(item => item.id).sort(),
    Array.from({ length: 307 }, (_, index) => `CASE-${String(index + 1).padStart(3, '0')}`));
  assert.deepEqual(library.modules.map(item => ({ module: item.module, behavior: item.behavior, interface: item.interface,
    performance: item.performance, security: item.security })), [
    { module: 'initialization', behavior: 31, interface: 10, performance: 11, security: 17 },
    { module: 'standards', behavior: 22, interface: 15, performance: 0, security: 0 },
    { module: 'verification', behavior: 13, interface: 13, performance: 15, security: 4 },
    { module: 'workflow', behavior: 93, interface: 54, performance: 0, security: 7 },
  ]);
  assert.equal(library.scenarios.length, 2);
  for (const item of library.scenarios) assert.ok(item.modules.length > 0 && item.modules.every(module => specs.includes(module)));
  for (const module of specs) {
    const files = readdirSync(join(directory, 'modules', module));
    assert.ok(files.length > 0, `missing cases for ${module}`);
    for (const name of files) {
      assert.ok(name.endsWith('.md') && kinds.includes(name.slice(0, -3)), `${module}/${name}`);
    }
  }
  const slug = value => value.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/gu, '-');
  for (const item of library.cases) {
    assert.ok(item.requirements.length > 0, `${item.id}: references`);
    assert.ok(item.preconditions.length && item.steps.length && item.inputs.length && item.expected, `${item.id}: design fields`);
    // CASE>=50 may use 关联 AC：无 for inventory-only backfill; representative AC cases keep criteria.
    for (const reference of item.requirements) {
      const [file, anchor] = reference.split('#');
      const target = join(repository, file);
      assert.ok(existsSync(target), `${item.id}: missing ${reference}`);
      if (anchor) {
        const headings = [...readFileSync(target, 'utf8').matchAll(/^#+\s+(.+)$/gmu)].map(match => slug(match[1]));
        assert.ok(headings.includes(decodeURIComponent(anchor)), `${item.id}: missing heading ${reference}`);
      }
    }
    assert.ok(item.tests.length > 0, `${item.id}: pending test`);
    for (const reference of item.tests) {
      assert.ok(reference.name?.includes(item.id), `${item.id}: test name lacks CASE id`);
      const content = readFileSync(join(repository, reference.path), 'utf8');
      const names = [...content.matchAll(/\b(?:test|it)\s*\(\s*(['"`])(.*?)\1\s*,/gu)].map(match => match[2]);
      assert.ok(names.includes(reference.name), `${item.id}: missing ${reference.path}::${reference.name}`);
    }
    const content = readFileSync(join(repository, item.file), 'utf8');
    assert.doesNotMatch(content, /test_ref/u, `${item.id}: obsolete test_ref`);
  }
});

test('CASE-245 全局用例库同步文档 CLI 名称与版本', async () => {
  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  assert.equal(library.cases.length, 307);
  const added = library.cases.filter(item => Number(item.id.slice(5)) >= 242 && Number(item.id.slice(5)) <= 245);
  assert.deepEqual(added.map(item => item.id), ['CASE-242', 'CASE-243', 'CASE-244', 'CASE-245']);
  const standards = library.modules.find(item => item.module === 'standards');
  assert.deepEqual({ behavior: standards?.behavior, interface: standards?.interface,
    performance: standards?.performance, security: standards?.security },
  { behavior: 22, interface: 15, performance: 0, security: 0 });
  for (const item of added) assert.ok(item.tests.some(reference => reference.name?.includes(item.id)));
  const sceneCases = library.cases.filter(item => Number(item.id.slice(5)) >= 270 && Number(item.id.slice(5)) <= 272)
    .sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(sceneCases.map(item => item.id), ['CASE-270', 'CASE-271', 'CASE-272']);
  for (const item of sceneCases) assert.ok(item.tests.some(reference => reference.name?.includes(item.id)));
  assert.equal(JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version, '0.5.0');
  assert.equal(JSON.parse(readFileSync(join(repository, '.tiller/project.json'), 'utf8')).resourceVersion, '0.5.0');
});

test('CASE-065 structured confirmation guidance is synchronized across help and durable docs', () => {
  const help = success(cli(repository, '--help')).help;
  assert.match(help, /--by/u);
  assert.match(help, /原话可选/u);
  assert.match(help, /start 生成结构化需求/u);
  assert.match(help, /tiller pr/u);
  assert.match(help, /类型\/任务编号/u);
  assert.doesNotMatch(help, /验收始终需要真实用户原话|confirm 需要 --quote/u);
  for (const relative of ['README.md', 'resources/entry.md', 'resources/usage.md', 'resources/rules/core.md',
    'resources/rules/activities/requirements.md', 'resources/rules/activities/design.md', 'resources/rules/activities/delivery.md']) {
    const content = readFileSync(join(repository, relative), 'utf8');
    assert.doesNotMatch(content, /只接受真实原话|需要真实用户原话|再取得真实用户原话|原话只作凭证，不能替代正文/u, relative);
  }
  const specs = readFileSync(join(repository, '.tiller/specs/modules/workflow/requirements.md'), 'utf8');
  assert.match(specs, /确认人/u);
  assert.match(specs, /原话可选/u);
  assert.match(specs, /使用场景.*业务范围/u);
  assert.match(specs, /方案.*影响与风险/u);
  const decisions = readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8');
  assert.match(decisions, /原话不再必填/u);
  const requirements = readFileSync(join(repository, '.tiller/specs/requirements.md'), 'utf8');
  assert.match(requirements, /原话可选/u);
  assert.match(requirements, /结构化/u);
});

test('CASE-159 repository spec requirements stay business-observable and exclude technical contracts', () => {
  const requirements = [
    '.tiller/specs/requirements.md',
    '.tiller/specs/modules/workflow/requirements.md',
    '.tiller/specs/modules/verification/requirements.md',
    '.tiller/specs/modules/initialization/requirements.md',
    '.tiller/specs/modules/standards/requirements.md',
  ];
  const forbidden = [
    ['CLI switch', /(?:^|[\s`])--[a-z][\w-]*/mu],
    ['repository implementation path', /(?:^|[\s`(])(?:\.tiller\/|src\/|test\/|resources\/|scripts\/)/mu],
    ['test execution internal', /node:test|TestRunner|verify\.(?:runner|prepare)|stdout|stderr|私有报告|适配器/u],
    ['source module name', /\b[\w-]+\.(?:ts|mjs|cjs)\b/u],
    ['case identifier literal', /CASE-\d{3}/u],
    ['delivery naming format', /类型\(模块\)|\[任务编号\]|类型\/任务编号/u],
    ['task record file name', /task\.md/u],
    ['scope-only section', /^#{1,6}\s*(?:范围内|范围外)\s*$/mu],
  ];
  for (const relative of requirements) {
    const content = readFileSync(join(repository, relative), 'utf8');
    assert.match(content, /^## \d+\. 验收方向$/mu, `${relative}: missing acceptance direction`);
    for (const [label, pattern] of forbidden) assert.doesNotMatch(content, pattern, `${relative}: ${label}`);
  }
});

test('CASE-160 migrated technical contracts remain locatable in module and overall designs', () => {
  const required = new Map([
    ['.tiller/specs/design.md', ['src/flow.ts', 'src/test-output.ts', 'node:test', 'stdout/stderr',
      '--requirement-file', '--allow-reported', '类型(模块)', '类型/任务编号', '.tiller/task/<id>/task.md']],
    ['.tiller/specs/modules/workflow/design.md', ['.tiller/task/<id>/task.md', '--requirement-file', '--target',
      '--case', '--test', '--reported', '--expect-fail', '--abandon', 'REV-NNN', '类型(模块)', '类型/任务编号']],
    ['.tiller/specs/modules/verification/design.md', ['.tiller/cases/modules/', 'test/**/*.test.*', 'CASE-NNN',
      'src/test-output.ts', 'src/test-reporter.ts', 'verify.runner', 'verify.prepare', '--allow-reported', 'criteria']],
    ['.tiller/specs/modules/initialization/design.md', ['.tiller/specs/requirements.md', '.tiller/index.md',
      '--platform github|gitlab|both', '.github/pull_request_template.md', '.gitlab/merge_request_templates/Default.md',
      'project.json', 'resourceVersion', '0.5.0', '0.4.0', 'recover']],
    ['.tiller/specs/modules/standards/design.md', ['AGENTS.md', '.tiller/usage.md', '7000', '--requirement-file',
      '--target', '--allow-reported', '类型(模块)', '[任务编号]', '类型/任务编号', 'CASE-NNN', 'src/test-output.ts',
      '--expect-fail']],
  ]);
  for (const [relative, fragments] of required) {
    const content = readFileSync(join(repository, relative), 'utf8');
    for (const fragment of fragments) assert.ok(content.includes(fragment), `${relative}: missing ${fragment}`);
  }
});

test('CASE-161 guidance and case references remain consistent with purified requirements', async () => {
  const requirementsRule = readFileSync(join(repository, '.tiller/rules/activities/requirements.md'), 'utf8');
  assert.match(requirementsRule, /验收条件.*可观察.*可验证/u);
  assert.match(requirementsRule, /行为|边界/u);
  assert.doesNotMatch(requirementsRule, /node:test|--test|类型\(模块\)/u);
  const designRule = readFileSync(join(repository, '.tiller/rules/activities/design.md'), 'utf8');
  assert.match(designRule, /接口|数据流/u);
  for (const relative of ['README.md', 'AGENTS.md', '.tiller/index.md', '.tiller/usage.md', '.tiller/cases/index.md']) {
    const content = readFileSync(join(repository, relative), 'utf8');
    assert.doesNotMatch(content, /requirements\.md[^\n]*(?:--[a-z]|node:test|src\/)/u, relative);
  }
  const library = await readCaseLibrary(repository);
  assert.deepEqual(library.issues, []);
  for (const [id, criterion] of [['CASE-159', 'AC-1'], ['CASE-160', 'AC-2'], ['CASE-161', 'AC-3'], ['CASE-162', 'AC-4']]) {
    const item = library.cases.find(entry => entry.id === id);
    assert.ok(item, `missing ${id}`);
    assert.ok(item.criteria.includes(`20261023-specs-pure-req#${criterion}`), `${id}: criteria`);
    assert.ok(item.tests.length > 0, `${id}: test reference`);
  }
});

test('CASE-267 guidance and decisions use task-to-specs and case-to-specs links', () => {
  const usage = read('usage.md');
  assert.match(usage, /task → 需求/u);
  assert.match(usage, /用例 → 需求/u);
  assert.match(usage, /关联 AC 固定写“无”/u);
  assert.match(usage, /AC→测试→CASE/u);
  const core = read('rules/core.md');
  assert.match(core, /用例“需求”指向稳定 `\.tiller\/specs\/\.\.\.`/u);
  assert.match(core, /关联 AC 写“无”/u);
  assert.match(core, /AC→测试→CASE/u);
  assert.doesNotMatch(core, /来源 AC/u);
  const requirements = read('rules/activities/requirements.md');
  assert.match(requirements, /taskId#AC/u);
  assert.match(requirements, /保留多行\/结构化正文/u);
  assert.doesNotMatch(requirements, /来源 `criteria`/u);
  const delivery = read('rules/activities/delivery.md');
  assert.match(delivery, /AC→测试→CASE/u);
  assert.doesNotMatch(delivery, /`criteria` 对当前 AC 的回指/u);
  const verification = read('rules/quality/verification.md');
  assert.match(verification, /AC 覆盖只认 `verify` 的 AC→测试→CASE/u);
  assert.doesNotMatch(verification, /未回指当前 AC|新用例必须绑定/u);
  const decisions = readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8');
  assert.match(decisions, /2026-10-26 用例锚定稳定需求/u);
  assert.match(decisions, /task→需求/u);
  assert.match(decisions, /用例→需求/u);
  assert.match(decisions, /关联 AC”固定写“无|关联 AC 固定写“无”/u);
  assert.doesNotMatch(decisions, /新用例仍必须绑定当前任务验收条件/u);
  const coreSource = readFileSync(join(repository, 'src/core.ts'), 'utf8');
  assert.match(coreSource, /AC 覆盖由 verify 的 AC→测试→CASE 记录承担/u);
  assert.doesNotMatch(coreSource, /来源 AC/u);
});

test('CASE-268 AC bodies use path-scoped AC-n and tasks link specs', () => {
  const verification = readFileSync(join(repository, '.tiller/specs/modules/verification/requirements.md'), 'utf8');
  for (const id of ['VER-CASE-REQ-1', 'VER-CASE-REQ-2', 'VER-CASE-REQ-3']) {
    assert.match(verification, new RegExp(`^### ${id} `, 'mu'), id);
  }
  const workflow = readFileSync(join(repository, '.tiller/specs/modules/workflow/requirements.md'), 'utf8');
  for (const id of ['FLOW-SPEC-AC-1', 'FLOW-SPEC-AC-2']) {
    assert.match(workflow, new RegExp(`^### ${id} `, 'mu'), id);
  }
  const caseSpec = readFileSync(join(repository, '.tiller/specs/modules/verification/case-req-link.md'), 'utf8');
  assert.match(caseSpec, /^## 验收条件$/mu);
  for (const index of [1, 2, 3, 4, 5]) assert.match(caseSpec, new RegExp(`^- AC-${index}: `, 'mu'));
  assert.doesNotMatch(caseSpec, /^## 验收条件（稳定）$/mu);
  assert.doesNotMatch(caseSpec, /VER-CASE-REQ|FLOW-SPEC-AC|LIB-AC/u);

  const task = readFileSync(join(repository, '.tiller/task/20261026-case-req-link/task.md'), 'utf8');
  assert.match(task, /需求来源：`\.tiller\/specs\/modules\/verification\/case-req-link\.md`/u);
  assert.doesNotMatch(task, /20261026-case-req-link#AC-/u);
});

test('CASE-275 rules and examples guide path-scoped AC-n without prefixed acceptance IDs', () => {
  const documents = [
    ...RULES.map(relative => [`resources/${relative}`, read(relative)]),
    ...RULES.map(relative => [`.tiller/${relative}`, readFileSync(join(repository, '.tiller', relative), 'utf8')]),
    ['resources/usage.md', read('usage.md')],
    ['.tiller/usage.md', readFileSync(join(repository, '.tiller/usage.md'), 'utf8')],
    ['.tiller/specs/decisions.md', readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8')],
    ['.tiller/specs/modules/verification/case-req-link.md', readFileSync(join(repository, '.tiller/specs/modules/verification/case-req-link.md'), 'utf8')],
    ['.tiller/specs/modules/workflow/req-scene-heading.md', readFileSync(join(repository, '.tiller/specs/modules/workflow/req-scene-heading.md'), 'utf8')],
  ];
  for (const [name, content] of documents) {
    assert.doesNotMatch(content, /^#{2,3}\s+验收条件（稳定）\s*$/mu, name);
    assert.doesNotMatch(content, /LIB-AC/u, name);
    assert.doesNotMatch(content, /对照\s*(?:VER|FLOW|AC)/u, name);
  }

  const requirements = read('rules/activities/requirements.md');
  assert.match(requirements, /文件路径区分模块/u);
  assert.match(requirements, /同一套 `AC-n`/u);
  assert.match(requirements, /可省略 `--criterion`/u);
  const verification = read('rules/quality/verification.md');
  assert.match(verification, /文件路径作用域使用普通 `AC-n`/u);
  for (const relative of ['resources/usage.md', '.tiller/usage.md']) {
    const usage = readFileSync(join(repository, relative), 'utf8');
    assert.match(usage, /路径作用域用 AC-n/u, relative);
    assert.match(usage, /有 AC 可省略 `--criterion`/u, relative);
  }
  const decisions = readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8');
  assert.match(decisions, /由文件路径区分模块/u);
  assert.match(decisions, /同一套 `AC-n`/u);
  for (const relative of ['.tiller/specs/modules/verification/case-req-link.md', '.tiller/specs/modules/workflow/req-scene-heading.md']) {
    const example = readFileSync(join(repository, relative), 'utf8');
    assert.match(example, /^## 验收条件$/mu, relative);
    assert.match(example, /^- AC-1: /mu, relative);
  }
  const help = success(cli(repository, '--help')).help;
  assert.match(help, /文件“验收条件”中的 - AC-n:/u);
  assert.match(help, /可省略 --criterion/u);
});

test('CASE-278 docs require specs changes through task worktrees and forbid direct default-branch changes', async t => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) assert.equal(readFileSync(join(repository, pair[0]), 'utf8'), readFileSync(join(repository, pair[1]), 'utf8'), pair.join(' == '));

  const help = success(cli(repository, '--help')).help;
  const documents = [
    ['resources/usage.md', readFileSync(join(repository, 'resources/usage.md'), 'utf8')],
    ['resources/rules/core.md', read(join('rules/core.md'))],
    ['resources/rules/activities/delivery.md', read(join('rules/activities/delivery.md'))],
    ['.tiller/specs/decisions.md', readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8')],
    ['--help', help],
  ];
  for (const [name, content] of documents) {
    assert.match(content, /specs/u, name);
    assert.match(content, /start/u, name);
    assert.match(content, /任务 worktree[^\n]*任务 PR\/MR[^\n]*合入/u, name);
    assert.match(content, /禁止[^\n]*(?:main\/master|默认分支)[^\n]*直改[或/]直推/u, name);
    assert.doesNotMatch(content, /LIB-AC/u, name);
    assert.doesNotMatch(content, /^#{2,3}\s+验收条件（稳定）\s*$/mu, name);
  }
});

test('CASE-282 docs use the real pr path without a hand-built API alternative', () => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) assert.equal(readFileSync(join(repository, pair[0]), 'utf8'), readFileSync(join(repository, pair[1]), 'utf8'), pair.join(' == '));

  const help = success(cli(repository, '--help')).help;
  const documents = [
    ['resources/usage.md', readFileSync(join(repository, 'resources/usage.md'), 'utf8')],
    ['resources/rules/core.md', readFileSync(join(repository, 'resources/rules/core.md'), 'utf8')],
    ['resources/rules/activities/delivery.md', readFileSync(join(repository, 'resources/rules/activities/delivery.md'), 'utf8')],
    ['AGENTS.md', readFileSync(join(repository, 'AGENTS.md'), 'utf8')],
    ['--help', help],
  ];
  for (const [name, content] of documents) {
    assert.match(content, /accept[^\n]*pr/u, name);
    assert.match(content, /pr[^\n]*(?:平台 API|真实 PR\/MR)/u, name);
    assert.match(content, /merge/u, name);
    assert.match(content, /--draft-only/u, name);
    assert.doesNotMatch(content, /curl[^\n]*(?:\/pulls|merge_requests)/iu, name);
    assert.doesNotMatch(content, /`pr` 只(?:输出|生成)草稿/u, name);
    assert.doesNotMatch(content, /^#{2,3}\s+验收条件（稳定）\s*$/mu, name);
    assert.doesNotMatch(content, /LIB-AC|对照\s*(?:VER|FLOW|AC)/u, name);
  }
  assert.match(help, /tiller doctor \[path\]/u);
  assert.match(help, /tiller pr <YYYYMMDD-task-id>[^\n]*--draft-only/u);
});

test('CASE-162 repository keeps the 0.5.0 release contract and five full verification entries', () => {
  const packageJson = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, '0.5.0');
  assert.deepEqual(packageJson.scripts, {
    build: 'node scripts/build.mjs',
    typecheck: 'tsc --noEmit',
    lint: 'node scripts/lint.mjs',
    test: 'node scripts/test-suites.mjs all',
    'test:rules': 'node scripts/test-suites.mjs rules',
    'test:contracts': 'node scripts/test-suites.mjs contracts',
    'test:integration': 'node scripts/test-suites.mjs integration',
    'test:e2e': 'node scripts/test-suites.mjs e2e',
    check: 'npm run lint && npm run typecheck && npm test',
    'test:package': 'node scripts/package-smoke.mjs',
    prepack: 'npm run build',
  });
  const metadata = JSON.parse(readFileSync(join(repository, '.tiller/project.json'), 'utf8'));
  assert.equal(metadata.resourceVersion, '0.5.0');
});

test('CASE-163 recent accepted tasks are closed without fabricating legacy acceptance', () => {
  const stages = new Map(success(cli(repository, 'resume')).tasks.map(item => [item.id, item.stage]));
  for (const id of [
    '20261022-first-batch', '20261022-round8', '20261022-round9', '20261022-round11',
    '20261022-round12', '20261022-round13', '20261022-round14', '20261022-round15',
    '20261022-round16', '20261022-round17', '20261023-migrate-work',
    '20261023-case-backfill', '20261023-specs-pure-req',
  ]) assert.equal(stages.get(id), '已关闭', id);
});

test('CASE-164 historical empty AC cases stay warned without fabricated backfill', async () => {
  const decisions = readFileSync(join(repository, '.tiller/specs/decisions.md'), 'utf8');
  assert.match(decisions, /2026-10-23 历史空 AC 长期提示/u);
  assert.match(decisions, /长期只提示/u);
  assert.match(decisions, /不批量回填/u);
  assert.match(decisions, /不.*冒充历史来源/u);
  const library = await readCaseLibrary(repository);
  assert.equal(library.cases.filter(item => item.criteria.length === 0).length, 135);
});

test('CASE-165 project rules and context match 0.5.0 without stale workflow guidance', () => {
  const rules = readFileSync(join(repository, '.tiller/rules/project.md'), 'utf8');
  const context = readFileSync(join(repository, '.tiller/context/project.md'), 'utf8');
  for (const [name, content] of [['rules', rules], ['context', context]]) {
    assert.match(content, /0\.5\.0/u, name);
    assert.doesNotMatch(content, /\.tiller\/work|archive|归档|讨论稿|待验收|round17|实现进度记录/u, name);
  }
  assert.match(rules, /close|reopen/u);
  assert.match(context, /close/u);
  assert.match(context, /默认人工节点只有需求、设计和交付验收/u);
});

test('CASE-166 local stale branches are removed while main remains', () => {
  const listed = spawnSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], {
    cwd: repository, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(listed.status, 0, listed.stderr);
  const branches = listed.stdout.trim().split(/\r?\n/u).filter(Boolean);
  for (const stale of [
    'backup/lightweight-before-author-fix', 'codex/lightweight', 'codex/task-records-backfill',
    'feat/20261022-round11-pr-conventions', 'feat/20261022-round12-pr-gitlab',
    'fix/20261022-round13-pr-polish-docs',
  ]) assert.ok(!branches.includes(stale), stale);
  assert.ok(branches.includes('main'));
});

test('CASE-167 README keeps the user quick start and removes maintainer detail', () => {
  const readme = readFileSync(join(repository, 'README.md'), 'utf8');
  assert.match(readme, /npm install -g \.\/tiller-0\.5\.0\.tgz/u);
  assert.match(readme, /chore\(tiller\): 完成工程初始化/u);
  assert.match(readme, /合入[^\n]*git pull/u);
  assert.match(readme, /用 Codex 等 AI 编程工具/u);
  assert.match(readme, /`merge`\/`close`/u);
  assert.match(readme, /合入与本机清理由 AI 按 tiller 约定完成/u);
  assert.doesNotMatch(readme, /尚未发布到 npm|维护者|决策记录|verify\.prepare|verify\.runner|--reported|失败先行|advanced/u);
  assert.ok(readme.length < 6000, `README is ${readme.length} characters`);
});
