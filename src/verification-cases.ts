import { lstat, readdir, readFile } from 'node:fs/promises';
import { assertSharedPaths, requireReadyProject } from './core.js';
import { resolveRepositoryRoot } from './delivery-location.js';
import { applyChanges, assertSafePath, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { repositoryPath } from './repository-paths.js';
import type { ProjectMetadata } from './types.js';
import { parseVerificationYaml } from './verification-yaml.js';

export const verificationCategories = ['unit', 'interface', 'integration', 'scenario', 'performance', 'security', 'reliability', 'compatibility', 'usability'] as const;
export type VerificationCategory = typeof verificationCategories[number];
export type VerificationReference = { repository: string; path: string };
export type VerificationSuite = { id: string; repository: string; command: string; args: string[]; cwd: string; timeoutMs: number; inputs: VerificationReference[] };
export type VerificationConfig = {
  schemaVersion: 1;
  modules: { id: string; design: VerificationReference }[];
  requirements: { id: string; source: VerificationReference }[];
  categories: Record<VerificationCategory, { applicability: 'applicable' | 'not-applicable' | 'pending'; reason: string }>;
  suites: VerificationSuite[];
};
export type VerificationCase = {
  id: string; title: string; modules: string[]; categories: VerificationCategory[]; requirements: string[];
  given: string[]; when: string[]; then: string[]; file: string;
  automation?: { suite: string; test_ref: string; source: VerificationReference };
  criteria?: Record<string, unknown>;
};
export type VerificationInspection = { ready: boolean; issues: string[]; cases: VerificationCase[]; config: VerificationConfig | null; files: Record<string, string> };
const ROOT = '.tiller/verification';
const CONFIG = `${ROOT}/config.json`;
const INDEX = `${ROOT}/index.md`;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象。`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} 含未知字段：${key}`);
}
function string(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) throw new Error(`${label} 必须是非空字符串。`);
}
function id(value: unknown): asserts value is string {
  string(value, '标识');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) throw new Error(`无效标识：${value}`);
}
function array(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error(`${label} 必须是有限数组。`);
}
function strings(value: unknown, label: string, empty = false): asserts value is string[] {
  array(value, label);
  if (!empty && !value.length) throw new Error(`${label} 不能为空。`);
  value.forEach(item => string(item, label));
  if (new Set(value).size !== value.length) throw new Error(`${label} 含重复项。`);
}
function reference(value: unknown): asserts value is VerificationReference {
  const ref = object(value, '文件引用'); keys(ref, ['repository', 'path'], '文件引用');
  string(ref.repository, '仓库'); string(ref.path, '路径'); validateRelativePath(ref.path);
  if (ref.path.split('/').some(part => ['.git', 'node_modules'].includes(part.toLowerCase())) ||
      /^\.tiller\/local(?:\/|$)/iu.test(ref.path)) throw new Error('文件引用必须指向共享资料，不能指向 Git、本机数据或依赖目录。');
}
function crossesRepositoryBoundary(metadata: ProjectMetadata, relative: string): boolean {
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  const normalized = relative.toLowerCase();
  return boundaries.some(boundary => normalized === boundary || normalized.startsWith(`${boundary}/`));
}
export async function readVerificationReference(root: string, ref: VerificationReference): Promise<string> {
  reference(ref);
  const metadata = await requireReadyProject(root, { write: false });
  if (ref.repository !== '.' && !metadata.repositories.includes(ref.repository)) throw new Error(`仓库未登记：${ref.repository}`);
  if (ref.repository === '.' && crossesRepositoryBoundary(metadata, ref.path)) throw new Error('业务仓库文件须使用已登记仓库标识。');
  const repositoryRoot = await resolveRepositoryRoot(root, ref.repository);
  await assertSharedPaths(repositoryRoot, [ref.path]);
  const target = await assertSafePath(repositoryRoot, ref.path);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error(`引用必须是最多 4 MiB 的文本文件：${ref.path}`);
  const text = await readTextIfExists(repositoryRoot, ref.path);
  if (text === null) throw new Error(`引用文件不存在：${ref.path}`);
  return text;
}

export async function readVerificationBinary(root: string, ref: VerificationReference): Promise<Buffer> {
  reference(ref);
  const metadata = await requireReadyProject(root, { write: false });
  if (ref.repository !== '.' && !metadata.repositories.includes(ref.repository)) throw new Error(`仓库未登记：${ref.repository}`);
  if (ref.repository === '.' && crossesRepositoryBoundary(metadata, ref.path)) throw new Error('业务仓库文件须使用已登记仓库标识。');
  const repositoryRoot = await resolveRepositoryRoot(root, ref.repository);
  const target = await assertSafePath(repositoryRoot, ref.path);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 64 * 1024 * 1024) throw new Error('受检二进制须为最多 64 MiB 的普通独立文件。');
  return readFile(target);
}

function validateConfig(input: unknown): VerificationConfig {
  const value = object(input, '验证配置');
  keys(value, ['schemaVersion', 'modules', 'requirements', 'categories', 'suites'], '验证配置');
  if (value.schemaVersion !== 1) throw new Error('不支持的验证配置版本。');
  for (const [name, refName] of [['modules', 'design'], ['requirements', 'source']] as const) {
    array(value[name], name); const seen = new Set<string>();
    for (const raw of value[name]) {
      const entry = object(raw, name); keys(entry, ['id', refName], name); id(entry.id); reference(entry[refName]);
      if (seen.has(entry.id.toLowerCase())) throw new Error(`重复标识：${entry.id}`);
      seen.add(entry.id.toLowerCase());
    }
  }
  const categories = object(value.categories, '测试类别'); keys(categories, [...verificationCategories], '测试类别');
  for (const category of verificationCategories) {
    const entry = object(categories[category], category); keys(entry, ['applicability', 'reason'], category);
    if (!['applicable', 'not-applicable', 'pending'].includes(String(entry.applicability))) throw new Error(`无效类别适用性：${category}`);
    string(entry.reason, '适用性依据');
  }
  array(value.suites, '执行套件'); const suites = new Set<string>();
  for (const raw of value.suites) {
    const entry = object(raw, '执行套件'); keys(entry, ['id', 'repository', 'command', 'args', 'cwd', 'timeoutMs', 'inputs'], '执行套件');
    id(entry.id); string(entry.repository, '套件仓库'); string(entry.command, '执行程序');
    if (/[\r\n]/u.test(entry.command)) throw new Error('执行程序不能包含换行。');
    array(entry.args, '程序参数'); for (const arg of entry.args) if (typeof arg !== 'string' || arg.length > 10000 || /\x00/u.test(arg)) throw new Error('程序参数必须是最多 10000 字符的字符串且不能含 NUL。');
    string(entry.cwd, '运行目录'); if (entry.cwd !== '.') validateRelativePath(entry.cwd);
    if (entry.cwd !== '.' && (entry.cwd.split('/').some(part => ['.git', 'node_modules'].includes(part.toLowerCase())) || /^\.tiller\/local(?:\/|$)/iu.test(entry.cwd))) throw new Error('运行目录不能指向本机数据或内部目录。');
    if (!Number.isSafeInteger(entry.timeoutMs) || Number(entry.timeoutMs) < 1 || Number(entry.timeoutMs) > 3600000) throw new Error('执行超时必须为 1 至 3600000 毫秒。');
    array(entry.inputs, '套件输入'); if (!entry.inputs.length) throw new Error('执行套件必须明确登记相关输入文件。');
    entry.inputs.forEach(reference);
    if (suites.has(entry.id.toLowerCase())) throw new Error(`重复套件：${entry.id}`);
    suites.add(entry.id.toLowerCase());
  }
  return value as unknown as VerificationConfig;
}

function validateCase(input: unknown, file: string, config: VerificationConfig): VerificationCase {
  const value = object(input, '测试用例');
  keys(value, ['id', 'title', 'modules', 'categories', 'requirements', 'given', 'when', 'then', 'automation', 'criteria'], '测试用例');
  id(value.id); string(value.title, '用例标题');
  strings(value.modules, '模块', file.startsWith(`${ROOT}/system/`));
  strings(value.categories, '类别'); strings(value.requirements, '需求');
  for (const field of ['given', 'when', 'then']) strings(value[field], field);
  for (const module of value.modules) if (!config.modules.some(item => item.id === module)) throw new Error(`用例模块未登记：${module}`);
  for (const req of value.requirements) if (!config.requirements.some(item => item.id === req)) throw new Error(`用例需求未登记：${req}`);
  for (const category of value.categories) {
    if (!verificationCategories.includes(category as VerificationCategory)) throw new Error(`未知测试类别：${category}`);
    if (config.categories[category as VerificationCategory].applicability === 'not-applicable') throw new Error(`用例与不适用类别冲突：${category}`);
  }
  if (file.startsWith(`${ROOT}/modules/`)) {
    const module = file.split('/')[3];
    if (value.modules.length !== 1 || value.modules[0] !== module) throw new Error('模块用例必须只归属于所在目录的模块。');
    const category = file.split('/')[4]!.slice(0, -5);
    if (!value.categories.includes(category)) throw new Error(`模块用例必须包含文件名对应类别：${category}`);
  } else if (file.startsWith(`${ROOT}/cross-module/`) && value.modules.length < 2) throw new Error('跨模块用例至少涉及两个模块。');
  if (value.automation !== undefined) {
    const automation = object(value.automation, '自动化映射'); keys(automation, ['suite', 'test_ref', 'source'], '自动化映射');
    string(automation.suite, '套件'); string(automation.test_ref, '测试引用'); reference(automation.source);
    if (!config.suites.some(suite => suite.id === automation.suite)) throw new Error(`执行套件未登记：${automation.suite}`);
  }
  if (value.criteria !== undefined) object(value.criteria, '类别特有条件');
  return { ...value, file } as VerificationCase;
}

export async function inspectVerification(root: string, options: { definitionsOnly?: boolean } = {}): Promise<VerificationInspection> {
  const result: VerificationInspection = { ready: false, issues: [], cases: [], config: null, files: {} };
  try {
    await requireReadyProject(root, { write: false });
    let totalBytes = 0;
    const remember = async (ref: VerificationReference) => {
      const key = `${ref.repository}::${ref.path}`;
      if (!Object.hasOwn(result.files, key)) {
        if (Object.keys(result.files).length >= 1000) throw new Error('验证引用文件超过 1000 个。');
        const text = await readVerificationReference(root, ref);
        totalBytes += Buffer.byteLength(text, 'utf8');
        if (totalBytes > 64 * 1024 * 1024) throw new Error('验证引用总内容超过 64 MiB。');
        result.files[key] = text;
      }
      return result.files[key]!;
    };
    const configText = await remember({ repository: '.', path: CONFIG });
    result.config = validateConfig(JSON.parse(configText));
    const config = result.config;
    const metadata = await requireReadyProject(root, { write: false });
    const registered = (ref: VerificationReference) => {
      if (ref.repository !== '.' && !metadata.repositories.includes(ref.repository)) throw new Error(`仓库未登记：${ref.repository}`);
      if (ref.repository === '.' && crossesRepositoryBoundary(metadata, ref.path)) throw new Error('业务仓库文件须使用已登记仓库标识。');
    };
    for (const module of config.modules) { registered(module.design); if (!options.definitionsOnly) await remember(module.design); }
    for (const req of config.requirements) { registered(req.source); if (!options.definitionsOnly) await remember(req.source); }
    for (const suite of config.suites) {
      if (suite.repository !== '.' && !metadata.repositories.includes(suite.repository)) throw new Error(`套件仓库未登记：${suite.repository}`);
      if (suite.repository === '.' && crossesRepositoryBoundary(metadata, suite.cwd)) throw new Error('套件必须通过业务仓库标识选择运行目录。');
      suite.inputs.forEach(registered);
      if (options.definitionsOnly) continue;
      const suiteRoot = await resolveRepositoryRoot(root, suite.repository);
      const cwd = suite.cwd === '.' ? suiteRoot : await assertSafePath(suiteRoot, suite.cwd);
      if (!(await lstat(cwd)).isDirectory()) throw new Error(`套件运行目录不存在：${suite.cwd}`);
      if (suite.cwd !== '.') await assertSharedPaths(suiteRoot, [suite.cwd]);
      for (const input of suite.inputs) await remember(input);
    }
    let entries = 0;
    async function walk(relative: string, depth: number): Promise<string[]> {
      if (depth > 3) throw new Error(`验证用例目录层级无效：${relative}`);
      const location = await assertSafePath(root, relative);
      let children;
      try { children = await readdir(location, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
      const files: string[] = [];
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (++entries > 2000) throw new Error('验证目录条目超过 2000 个。');
        const target = `${relative}/${child.name}`; await assertSafePath(root, target);
        if (child.isDirectory()) files.push(...await walk(target, depth + 1));
        else if (/\.ya?ml$/iu.test(target)) files.push(target);
      }
      return files;
    }
    const seen = new Set<string>(); const refs = new Set<string>();
    for (const file of await walk(ROOT, 0)) {
      if (!/^\.tiller\/verification\/(?:modules\/[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9_-]*|(?:cross-module|system)\/[A-Za-z0-9][A-Za-z0-9_-]*)\.yaml$/u.test(file)) throw new Error(`用例文件位置无效：${file}`);
      if (file.startsWith(`${ROOT}/modules/`) && !verificationCategories.includes(file.split('/')[4]!.slice(0, -5) as VerificationCategory)) throw new Error(`模块用例文件名必须为已定义测试类别：${file}`);
      const document = object(parseVerificationYaml(await remember({ repository: '.', path: file })), '用例文件');
      keys(document, ['schema_version', 'cases'], '用例文件');
      if (document.schema_version !== 1) throw new Error(`不支持的用例版本：${file}`);
      array(document.cases, '用例列表');
      for (const raw of document.cases) {
        const entry = validateCase(raw, file, config);
        if (seen.has(entry.id.toLowerCase())) throw new Error(`重复用例标识：${entry.id}`);
        seen.add(entry.id.toLowerCase());
        if (entry.automation) {
          const key = `${entry.automation.suite}::${entry.automation.test_ref}`;
          if (refs.has(key)) throw new Error(`同套件重复测试引用：${key}`);
          refs.add(key); registered(entry.automation.source);
          if (!options.definitionsOnly) await remember(entry.automation.source);
        }
        result.cases.push(entry);
      }
    }
    result.ready = true;
  } catch (error) { result.issues.push(error instanceof Error ? error.message : String(error)); }
  return result;
}

export async function scaffoldVerification(root: string): Promise<{ changed: boolean; ready: boolean; issues: string[] }> {
  return withProjectLock(root, async () => {
    await requireReadyProject(root, { write: true }); await assertSharedPaths(root, [CONFIG, INDEX]);
    const before = await readTextIfExists(root, CONFIG); const index = await readTextIfExists(root, INDEX);
    if (before !== null || index !== null) {
      if (before === null || index === null) throw new Error('验证资料仅部分存在，保留现状；请先协调 config.json 与 index.md。');
      const inspection = await inspectVerification(root);
      return { changed: false, ready: inspection.ready, issues: inspection.issues };
    }
    try {
      if ((await readdir(await assertSafePath(root, ROOT))).length) throw new Error('验证目录已有未登记内容，保留现状；请先整理配置。');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const config: VerificationConfig = {
      schemaVersion: 1, modules: [], requirements: [], suites: [],
      categories: Object.fromEntries(verificationCategories.map(category => [category, { applicability: 'pending', reason: '尚待结合项目需求与设计明确。' }])) as VerificationConfig['categories'],
    };
    const content = '# 测试与验证\n\n范围和适用性在 config.json 维护；此入口不重复维护用例清单。\n\n- 模块用例：modules/<模块>/<类别>.yaml。模块标识与设计保持一致。\n- 跨模块场景：cross-module/<场景>.yaml；每个场景至少关联两个模块。\n- 系统整体：system/<专题>.yaml。仅创建适用资料，不生成示例通过记录。\n- 使用 `node .tiller/run.cjs verification check` 检查当前关联与分类；结构通过不代表实际测试通过。\n- 需求形成验收条件，设计细化用例，实施任务编写并执行测试；真实结果与证据记录在对应 work。\n- 用例 YAML 采用受限声明格式，流程步骤不会直接执行；项目原有框架负责测试代码。\n';
    await applyChanges(root, [{ path: CONFIG, before: null, after: JSON.stringify(config, null, 2) + '\n' }, { path: INDEX, before: null, after: content }]);
    return { changed: true, ready: true, issues: [] };
  });
}
