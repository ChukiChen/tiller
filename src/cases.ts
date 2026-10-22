import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { applyChanges, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { readProjectMetadata } from './core.js';
import { validateTaskId } from './task-id.js';

export const CASE_ROOT = '.tiller/cases';
export const CASE_KINDS = ['behavior', 'interface', 'performance', 'security'] as const;
export type CaseKind = typeof CASE_KINDS[number];
export type CaseScope = CaseKind | 'scenario';

export interface GlobalCase {
  id: string;
  title: string;
  requirements: string[];
  modules: string[];
  test_ref: string;
  source: string[];
  criteria: string[];
  kind: CaseScope;
  file: string;
}

export interface AddCaseInput {
  task: string;
  title: string;
  test: string;
  criteria: string[];
  requirements: string[];
  source: string[];
  module?: string;
  modules?: string[];
  kind?: string;
  scenario?: string;
}

export interface CaseModuleSummary {
  module: string;
  behavior: number;
  interface: number;
  performance: number;
  security: number;
  total: number;
}

export interface CaseScenarioSummary { id: string; title: string; modules: string[] }

export interface CaseLibrary {
  cases: GlobalCase[];
  issues: string[];
  warnings: string[];
  modules: CaseModuleSummary[];
  scenarios: CaseScenarioSummary[];
  uncovered: string[];
}

export interface TestBlock { name: string; assertions: number }

export function testBlocks(content: string): TestBlock[] {
  const assertion = /\bassert\.|\bexpect\s*\(/gu;
  const starts = [...content.matchAll(/\b(?:test|it)\s*\(\s*(['"`])(.*?)\1\s*,/gu)];
  return starts.map((match, index) => {
    const body = content.slice(match.index, starts[index + 1]?.index ?? content.length);
    return { name: match[2]!, assertions: [...body.matchAll(assertion)].length };
  });
}

export function referencePath(value: string): string | null {
  const relative = value.trim().split('::')[0]!.split('#')[0]!;
  if (!relative || path.isAbsolute(relative) || relative.includes('\\')) return null;
  try { validateRelativePath(relative); } catch { return null; }
  return relative;
}

export function fallbackTestReference(value: string): { path: string; name?: string } | null {
  const normalized = value.trim();
  const separator = normalized.includes('::') ? '::' : normalized.includes('#') ? '#' : null;
  const [pathPart, ...rest] = normalized.split(separator ?? '\0');
  const relative = referencePath(pathPart ?? '');
  if (!relative) return null;
  const name = rest.join(separator ?? '').trim();
  if (separator && !name) return null;
  return { path: relative, ...(name ? { name } : {}) };
}

export function sameTestReference(left: string, right: string): boolean {
  const a = fallbackTestReference(left); const b = fallbackTestReference(right);
  return Boolean(a?.name && b?.name && a.path === b.path && a.name === b.name);
}

export function casesForTest(library: CaseLibrary, test: string): GlobalCase[] {
  return library.cases.filter(item => sameTestReference(test, item.test_ref));
}

export function regressionWarnings(library: CaseLibrary, changed: string[]): string[] {
  const warnings: string[] = [];
  for (const summary of library.modules) {
    const moduleCases = library.cases.filter(item => item.kind !== 'scenario'
      && item.file === `${CASE_ROOT}/modules/${summary.module}/${item.kind}.json`);
    const scenarios = library.scenarios.filter(item => item.modules.includes(summary.module));
    const scenarioCases = library.cases.filter(item => item.kind === 'scenario' && item.modules.includes(summary.module));
    const evidence = [...moduleCases, ...scenarioCases];
    const sources = evidence.flatMap(item => item.source);
    const tests = evidence.flatMap(item => referencePath(item.test_ref) ?? []);
    const touched = changed.some(relative => relative === `.tiller/specs/modules/${summary.module}`
      || relative.startsWith(`.tiller/specs/modules/${summary.module}/`)
      || relative.startsWith(`${CASE_ROOT}/modules/${summary.module}/`)
      || tests.includes(relative)
      || sources.some(source => relative === source || relative.startsWith(`${source.replace(/\/+$/u, '')}/`)));
    if (!touched) continue;
    const scenarioIds = scenarios.map(item => item.id);
    warnings.push(`本次改动涉及模块 ${summary.module}：建议回归该模块 ${summary.total} 条用例${scenarioIds.length ? `及经过它的场景 ${scenarioIds.join(', ')}` : '；暂无场景覆盖该模块'}。`);
  }
  return warnings;
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) return null;
  return value.trim();
}

function references(value: unknown, modules = false): string[] | null {
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== 'string'
    || (!modules && !referencePath(item)) || (modules && !/^[a-z][a-z0-9_-]*$/u.test(item)))) return null;
  return [...new Set(value.map(item => item.trim()))];
}

function caseCriteria(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'
    || !/^(?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*#AC-\d+$/u.test(item))) return null;
  return [...new Set(value.map(item => item.trim()))];
}

async function directoryNames(root: string, relative: string): Promise<string[] | null> {
  try {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function readJson(root: string, relative: string, issues: string[]): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(root, relative), 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push(`用例文件 ${relative} 必须是 JSON 对象。`);
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    issues.push(`用例文件 ${relative} 不是有效 JSON。`);
    return null;
  }
}

export async function readCaseLibrary(root: string): Promise<CaseLibrary> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const cases: GlobalCase[] = [];
  const specs = await directoryNames(root, '.tiller/specs/modules');
  const specModules = specs ?? [];
  const specSet = new Set(specModules);
  const ids = new Map<string, string>();
  const fileExists = new Map<string, boolean>();
  const testContents = new Map<string, string | null>();
  let historicalCases = 0;

  let rootEntries;
  try { rootEntries = await readdir(path.join(root, CASE_ROOT), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { cases, issues, warnings, modules: specModules.map(module => ({ module, behavior: 0, interface: 0, performance: 0, security: 0, total: 0 })), scenarios: [], uncovered: specModules };
    }
    issues.push(`无法读取全局用例目录 ${CASE_ROOT}：${(error as Error).message}`);
    return { cases, issues, warnings, modules: [], scenarios: [], uncovered: [] };
  }
  for (const entry of rootEntries.filter(item => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    issues.push(`旧式全局用例 ${CASE_ROOT}/${entry.name} 不受支持；请迁移到 ${CASE_ROOT}/modules/<模块>/<类型>.json 或 ${CASE_ROOT}/scenarios/。`);
  }

  async function addCase(raw: unknown, relative: string, index: number, kind: CaseScope, owner?: string): Promise<void> {
    const label = `${relative} 第 ${index + 1} 条${kind === 'scenario' ? '场景' : '用例'}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push(`${label} 格式无效。`); return; }
    const item = raw as Record<string, unknown>;
    const id = text(item.id, 80);
    const title = text(item.title, 200);
    const requirements = references(item.requirements);
    const modules = references(item.modules, true);
    const source = references(item.source);
    const criteria = caseCriteria(item.criteria);
    const testRef = text(item.test_ref, 1000);
    if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) { issues.push(`${label} 缺少有效 id。`); return; }
    const subject = `全局${kind === 'scenario' ? '场景' : '用例'} ${relative} ${id}`;
    if (!title) issues.push(`${subject} 缺少有效标题。`);
    if (!requirements) issues.push(`${subject} 的 requirements 必须是非空路径数组。`);
    if (!modules) issues.push(`${subject} 的 modules 必须是非空模块名数组。`);
    if (!source) issues.push(`${subject} 的 source 必须是非空路径数组。`);
    if (criteria === null) issues.push(`${subject} 的 criteria 必须是 <任务标识>#AC-<编号> 数组。`);
    const test = testRef ? fallbackTestReference(testRef) : null;
    if (!testRef || !test) issues.push(`${subject} 缺少有效 test_ref。`);
    else if (!test.name) issues.push(`${subject} 的 test_ref 必须用 :: 指定测试名。`);
    if (ids.has(id)) issues.push(`${subject} 与 ${ids.get(id)} 的 id 重复。`);
    else ids.set(id, relative);
    for (const module of modules ?? []) if (!specSet.has(module)) issues.push(`${subject} 的模块不存在：${module}`);
    if (owner && modules && !modules.includes(owner)) issues.push(`${subject} 的 modules 必须包含所属模块 ${owner}。`);
    for (const [field, values] of [['requirements', requirements], ['source', source]] as const) {
      for (const reference of values ?? []) {
        const relativePath = referencePath(reference);
        if (!relativePath) continue;
        let exists = fileExists.get(relativePath);
        if (exists === undefined) {
          try { exists = (await lstat(path.join(root, relativePath))).isFile(); } catch { exists = false; }
          fileExists.set(relativePath, exists);
        }
        if (!exists) issues.push(`${subject} 的 ${field} 文件不存在：${relativePath}`);
      }
    }
    if (test) {
      let content = testContents.get(test.path);
      if (content === undefined) {
        try { content = (await lstat(path.join(root, test.path))).isFile() ? await readFile(path.join(root, test.path), 'utf8') : null; }
        catch { content = null; }
        testContents.set(test.path, content);
      }
      if (content === null) issues.push(`${subject} 的 test_ref 文件不存在：${test.path}`);
      else if (test.name && !testBlocks(content).some(block => block.name === test.name)) {
        issues.push(`${subject} 的 test_ref 用例不存在：${test.path}::${test.name}`);
      }
    }
    if (title && requirements && modules && source && criteria && test?.name) {
      if (!criteria.length) historicalCases++;
      cases.push({ id, title, requirements, modules, test_ref: testRef!, source, criteria, kind, file: relative });
    }
  }

  const moduleNames = await directoryNames(root, `${CASE_ROOT}/modules`);
  for (const module of moduleNames ?? []) {
    if (!specSet.has(module)) issues.push(`用例模块目录 ${CASE_ROOT}/modules/${module} 在 .tiller/specs/modules 中不存在。`);
    let files;
    try { files = await readdir(path.join(root, CASE_ROOT, 'modules', module), { withFileTypes: true }); }
    catch { continue; }
    for (const entry of files.filter(item => item.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${CASE_ROOT}/modules/${module}/${entry.name}`;
      if (!entry.name.endsWith('.json')) continue;
      const kind = entry.name.slice(0, -5);
      if (!CASE_KINDS.includes(kind as CaseKind)) {
        issues.push(`用例类型文件 ${relative} 不在白名单：${CASE_KINDS.join(', ')}。`);
        continue;
      }
      const value = await readJson(root, relative, issues);
      if (!value) continue;
      if (value.schemaVersion !== 1 || !Array.isArray(value.cases)) {
        issues.push(`用例文件 ${relative} 必须包含 schemaVersion: 1 和 cases 数组。`);
        continue;
      }
      if (value.module !== module) issues.push(`用例文件 ${relative} 的 module 必须是 ${module}。`);
      if (value.kind !== kind) issues.push(`用例文件 ${relative} 的 kind 必须是 ${kind}。`);
      for (const [index, item] of value.cases.entries()) await addCase(item, relative, index, kind as CaseKind, module);
    }
  }

  const scenarios: CaseScenarioSummary[] = [];
  let scenarioFiles: import('node:fs').Dirent[];
  try { scenarioFiles = await readdir(path.join(root, CASE_ROOT, 'scenarios'), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issues.push(`无法读取场景目录 ${CASE_ROOT}/scenarios：${(error as Error).message}`);
    scenarioFiles = [];
  }
  for (const entry of scenarioFiles.filter(item => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = `${CASE_ROOT}/scenarios/${entry.name}`;
    const value = await readJson(root, relative, issues);
    if (!value) continue;
    if (value.schemaVersion !== 1 || !Array.isArray(value.scenarios)) {
      issues.push(`场景文件 ${relative} 必须包含 schemaVersion: 1 和 scenarios 数组。`);
      continue;
    }
    for (const [index, item] of value.scenarios.entries()) {
      const before = cases.length;
      await addCase(item, relative, index, 'scenario');
      if (cases.length > before) {
        const added = cases[cases.length - 1]!;
        scenarios.push({ id: added.id, title: added.title, modules: added.modules });
      }
    }
  }

  const modules: CaseModuleSummary[] = specModules.map(module => {
    const summary: CaseModuleSummary = { module, behavior: 0, interface: 0, performance: 0, security: 0, total: 0 };
    for (const item of cases) if (item.kind !== 'scenario'
      && item.file === `${CASE_ROOT}/modules/${module}/${item.kind}.json`) {
      summary[item.kind] += 1;
      summary.total += 1;
    }
    return summary;
  });
  const scenarioModules = new Set(scenarios.flatMap(item => item.modules));
  const uncovered = specModules.filter(module => !scenarioModules.has(module));
  for (const module of uncovered) warnings.push(`模块 ${module} 未被任何场景覆盖；请按需补充端到端场景。`);
  if (historicalCases) warnings.push(`${historicalCases} 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。`);
  return { cases, issues: [...new Set(issues)], warnings: [...new Set(warnings.filter(Boolean))], modules, scenarios, uncovered };
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) {
    throw Object.assign(new Error(`${label}必须是非空单行文本，且不超过 ${maximum} 字符。`), { code: 'INVALID_CASE_INPUT' });
  }
  return value.trim();
}

function sectionBody(content: string, title: string): string {
  const match = new RegExp(`^## ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = /^##\s+/mu.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

function subSectionBody(content: string, title: string): string {
  const match = new RegExp(`^### ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = /^#{1,3}\s+/mu.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

async function taskCriteria(root: string, taskId: string): Promise<Set<string>> {
  validateTaskId(taskId);
  const content = await readTextIfExists(root, `.tiller/task/${taskId}/task.md`);
  if (content === null || !content.includes(`<!-- tiller-task:v1 {"version":1,"id":"${taskId}"`)) {
    throw Object.assign(new Error(`任务 ${taskId} 不存在或不是当前格式；先执行 start。`), { code: 'TASK_NOT_FOUND' });
  }
  const ids = new Set<string>();
  const requirement = sectionBody(content, '需求');
  const nested = subSectionBody(requirement, '验收条件');
  const criteria = nested || sectionBody(content, '验收条件');
  for (const match of criteria.matchAll(/^-\s+(AC-\d+):/gmu)) ids.add(match[1]!);
  if (!ids.size) throw Object.assign(new Error(`任务 ${taskId} 没有验收条件。`), { code: 'MISSING_REQUIREMENTS' });
  return ids;
}

async function allocateCaseId(root: string): Promise<string> {
  let maximum = 0;
  async function visit(relative: string): Promise<void> {
    let entries;
    try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) { await visit(child); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      let value: unknown;
      try { value = JSON.parse(await readFile(path.join(root, child), 'utf8')); } catch { continue; }
      const entriesValue = value && typeof value === 'object' && !Array.isArray(value)
        ? [...((value as Record<string, unknown>).cases as unknown[] ?? []), ...((value as Record<string, unknown>).scenarios as unknown[] ?? [])]
        : [];
      for (const item of entriesValue) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const id = (item as Record<string, unknown>).id;
        const match = typeof id === 'string' ? /^CASE-(\d+)$/u.exec(id) : null;
        if (match) maximum = Math.max(maximum, Number(match[1]));
      }
    }
  }
  await visit(CASE_ROOT);
  return `CASE-${String(maximum + 1).padStart(3, '0')}`;
}

export async function addGlobalCase(rootInput: string, input: AddCaseInput) {
  const root = path.resolve(rootInput);
  validateTaskId(input.task);
  const title = requiredText(input.title, '用例标题', 200);
  const test = fallbackTestReference(requiredText(input.test, '测试引用', 1000));
  if (!test?.name) throw Object.assign(new Error('测试引用必须是 文件::测试名（或 文件#测试名）。'), { code: 'INVALID_TEST_REFERENCE' });
  const testRef = `${test.path}::${test.name}`;
  const available = await taskCriteria(root, input.task);
  const criteria = [...new Set(input.criteria.map(raw => {
    const value = raw.trim();
    const direct = /^((?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*)#(AC-\d+)$/u.exec(value);
    if (direct) {
      if (direct[1] !== input.task) throw Object.assign(new Error(`来源 AC 必须属于任务 ${input.task}：${value}`), { code: 'INVALID_CASE_INPUT' });
      if (!available.has(direct[2]!)) throw Object.assign(new Error(`任务 ${input.task} 没有验收条件：${direct[2]}`), { code: 'UNKNOWN_CRITERION' });
      return value;
    }
    if (!/^AC-\d+$/u.test(value)) throw Object.assign(new Error(`来源 AC 格式为 AC-1 或 ${input.task}#AC-1：${value}`), { code: 'INVALID_CASE_INPUT' });
    if (!available.has(value)) throw Object.assign(new Error(`任务 ${input.task} 没有验收条件：${value}`), { code: 'UNKNOWN_CRITERION' });
    return `${input.task}#${value}`;
  }))];
  if (!criteria.length) throw Object.assign(new Error('case add 至少需要一个 --criterion，记录来源 AC。'), { code: 'INVALID_CASE_INPUT' });
  const moduleNames = await directoryNames(root, '.tiller/specs/modules') ?? [];
  const scenario = input.scenario === undefined ? undefined : requiredText(input.scenario, '场景名', 64);
  if (scenario && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(scenario)) {
    throw Object.assign(new Error('场景名须为小写字母、数字和连字符。'), { code: 'INVALID_CASE_INPUT' });
  }
  let modules: string[];
  let kind: CaseScope;
  if (scenario) {
    modules = [...new Set([...(input.modules ?? []), ...(input.module ? [input.module] : [])].map(value => value.trim()))];
    if (!modules.length) throw Object.assign(new Error('场景用例至少需要一个 --module，声明经过的模块。'), { code: 'INVALID_CASE_INPUT' });
    kind = 'scenario';
  } else {
    const module = requiredText(input.module, '模块名', 64);
    if (!/^[a-z][a-z0-9_-]*$/u.test(module)) throw Object.assign(new Error('模块名须为小写字母、数字、下划线或连字符。'), { code: 'INVALID_CASE_INPUT' });
    if (!CASE_KINDS.includes(input.kind as CaseKind)) {
      throw Object.assign(new Error(`用例类型必须是：${CASE_KINDS.join(', ')}。`), { code: 'INVALID_CASE_KIND' });
    }
    modules = [module]; kind = input.kind as CaseKind;
  }
  for (const module of modules) {
    if (!moduleNames.includes(module)) {
      throw Object.assign(new Error(`模块 ${module} 不存在；先建立 .tiller/specs/modules/${module}/requirements.md 与 design.md，再登记用例。`), {
        code: 'CASE_MODULE_NOT_FOUND',
      });
    }
  }
  const requirements = references(input.requirements.length ? input.requirements : [`.tiller/specs/modules/${modules[0]}/requirements.md`]);
  if (!requirements) throw Object.assign(new Error('需求引用必须是存在的工程路径数组。'), { code: 'INVALID_CASE_INPUT' });
  for (const reference of requirements) {
    const relative = referencePath(reference);
    if (!relative) throw Object.assign(new Error(`需求引用无效：${reference}`), { code: 'INVALID_CASE_INPUT' });
    try { if (!(await lstat(path.join(root, relative))).isFile()) throw new Error(); }
    catch { throw Object.assign(new Error(`需求引用文件不存在：${relative}`), { code: 'CASE_REFERENCE_NOT_FOUND' }); }
  }
  const sources = references(input.source);
  if (!sources) throw Object.assign(new Error('至少提供一个 --source，指向实现该用例的源码路径。'), { code: 'INVALID_CASE_INPUT' });
  return withProjectLock(root, async () => {
    await readProjectMetadata(root);
    const id = await allocateCaseId(root);
    const relative = scenario ? `${CASE_ROOT}/scenarios/${scenario}.json` : `${CASE_ROOT}/modules/${modules[0]}/${kind}.json`;
    const before = await readTextIfExists(root, relative);
    let value: Record<string, unknown>;
    if (before === null) {
      value = scenario
        ? { schemaVersion: 1, scenarios: [] }
        : { schemaVersion: 1, module: modules[0], kind, cases: [] };
    } else {
      try { value = JSON.parse(before) as Record<string, unknown>; }
      catch { throw Object.assign(new Error(`已有用例文件不是有效 JSON：${relative}`), { code: 'INVALID_CASE_LIBRARY' }); }
    }
    const entry = { id, title, requirements, modules, test_ref: testRef, source: sources, criteria };
    const field = scenario ? 'scenarios' : 'cases';
    const current = value[field];
    if (!Array.isArray(current)) throw Object.assign(new Error(`已有用例文件缺少 ${field} 数组：${relative}`), { code: 'INVALID_CASE_LIBRARY' });
    const after = `${JSON.stringify({ ...value, [field]: [...current, entry] }, null, 2)}\n`;
    await applyChanges(root, [{ path: relative, before, after }]);
    let testExists = false;
    try { testExists = (await lstat(path.join(root, test.path))).isFile(); } catch { testExists = false; }
    return {
      id, title, path: relative, kind, modules, criteria, test_ref: testRef,
      next: testExists ? `运行测试并记录：tiller verify ${input.task} --criterion ${criteria[0]!.split('#')[1]} --test "${testRef}"`
        : `先编写测试 ${test.path}::${test.name}，再运行 verify。`,
      ...(testExists ? {} : { skeleton: `import test from 'node:test';\n\ntest('${test.name}', () => {\n  // TODO: 实现 ${criteria.join(', ')} 的断言\n});\n` }),
    };
  });
}
