import { lstat, readFile, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { applyChanges, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { readProjectMetadata } from './core.js';
import { validateTaskId } from './task-id.js';

export const CASE_ROOT = '.tiller/cases';
export const CASE_KINDS = ['behavior', 'interface', 'performance', 'security'] as const;
export const CASE_PRIORITIES = ['high', 'medium', 'low'] as const;
export type CaseKind = typeof CASE_KINDS[number];
export type CaseScope = CaseKind | 'scenario';
export type CasePriority = typeof CASE_PRIORITIES[number];
export type CaseStatus = 'implemented' | 'pending';

export interface TestReference { path: string; name?: string }

export interface GlobalCase {
  id: string;
  title: string;
  requirements: string[];
  modules: string[];
  source: string[];
  criteria: string[];
  kind: CaseScope;
  priority: CasePriority;
  preconditions: string[];
  steps: string[];
  inputs: string[];
  expected: string;
  tests: TestReference[];
  status: CaseStatus;
  file: string;
}

export interface AddCaseInput {
  task: string;
  title: string;
  criteria: string[];
  requirements: string[];
  source: string[];
  preconditions: string[];
  steps: string[];
  inputs: string[];
  expected: string;
  priority?: string;
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

export interface TestBlock { name: string; assertions: number; index: number }

export function testBlocks(content: string): TestBlock[] {
  const assertion = /\bassert(?:\.|\s)|\bexpect\s*\(/gu;
  const starts: { name: string; index: number }[] = [];
  for (const match of content.matchAll(/\b(?:test|it)\s*\(\s*(['"`])(.*?)\1\s*,/gu)) {
    starts.push({ name: match[2]!, index: match.index ?? 0 });
  }
  for (const match of content.matchAll(/^\s*(?:async\s+)?def\s+(test_[A-Za-z0-9_]+)\s*\(/gmu)) {
    starts.push({ name: match[1]!, index: match.index ?? 0 });
  }
  starts.sort((left, right) => left.index - right.index);
  return starts.map((start, index) => {
    const body = content.slice(start.index, starts[index + 1]?.index ?? content.length);
    return { name: start.name, assertions: [...body.matchAll(assertion)].length, index: start.index };
  });
}

export function referencePath(value: string): string | null {
  const relative = value.trim().split('::')[0]!.split('#')[0]!;
  if (!relative || path.isAbsolute(relative) || relative.includes('\\')) return null;
  try { validateRelativePath(relative); } catch { return null; }
  return relative;
}

export function fallbackTestReference(value: string): TestReference | null {
  const normalized = value.trim();
  const separator = normalized.includes('::') ? '::' : normalized.includes('#') ? '#' : null;
  const [pathPart, ...rest] = normalized.split(separator ?? '\0');
  const relative = referencePath(pathPart ?? '');
  if (!relative) return null;
  const name = rest.join(separator ?? '').trim();
  if (separator && !name) return null;
  return name ? { path: relative, name } : { path: relative };
}

function unprefixedTestName(value: string): string {
  return value.replace(/^(?:CASE-\d+\s+)+/u, '').trim();
}

export function sameTestReference(left: string | TestReference, right: string | TestReference): boolean {
  const a = typeof left === 'string' ? fallbackTestReference(left) : left;
  const b = typeof right === 'string' ? fallbackTestReference(right) : right;
  if (!a?.name || !b?.name || a.path !== b.path) return false;
  if (a.name === b.name) return true;
  const leftUnprefixed = unprefixedTestName(a.name);
  const rightUnprefixed = unprefixedTestName(b.name);
  return (leftUnprefixed === b.name && leftUnprefixed !== a.name)
    || (rightUnprefixed === a.name && rightUnprefixed !== b.name);
}

export function casesForTest(library: CaseLibrary, test: string | TestReference): GlobalCase[] {
  return library.cases.filter(item => item.tests.some(reference => sameTestReference(test, reference)));
}

export function testsForCase(library: CaseLibrary, id: string): TestReference[] {
  return library.cases.find(item => item.id === id)?.tests ?? [];
}

export function casesForCriterion(library: CaseLibrary, criterion: string): GlobalCase[] {
  return library.cases.filter(item => item.criteria.includes(criterion));
}

export function regressionWarnings(library: CaseLibrary, changed: string[]): string[] {
  const warnings: string[] = [];
  for (const summary of library.modules) {
    const moduleCases = library.cases.filter(item => item.kind !== 'scenario'
      && item.file === `${CASE_ROOT}/modules/${summary.module}/${item.kind}.md`);
    const scenarios = library.scenarios.filter(item => item.modules.includes(summary.module));
    const scenarioCases = library.cases.filter(item => item.kind === 'scenario' && item.modules.includes(summary.module));
    const evidence = [...moduleCases, ...scenarioCases];
    const sources = evidence.flatMap(item => item.source);
    const tests = evidence.flatMap(item => item.tests.map(test => test.path));
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

function references(value: string[], modules = false): string[] | null {
  if (!value.length || value.some(item => (!modules && !referencePath(item)) || (modules && !/^[a-z][a-z0-9_-]*$/u.test(item)))) return null;
  return [...new Set(value)];
}

function caseCriteria(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'
    || !/^((?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*)#(AC-\d+)$/u.test(item))) return null;
  return [...new Set(value as string[])];
}

async function directoryNames(root: string, relative: string): Promise<string[] | null> {
  try {
    return (await readdir(path.join(root, relative), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function fileExists(root: string, relative: string): Promise<boolean> {
  try { return (await lstat(path.join(root, relative))).isFile(); }
  catch { return false; }
}

function field(body: string, name: string): string {
  const match = new RegExp(`^- ${name}：\\s*(.*)$`, 'mu').exec(body);
  return match?.[1]?.trim() ?? '';
}

function subsection(body: string, name: string): string {
  const match = new RegExp(`^### ${name}\\s*$`, 'mu').exec(body);
  if (!match) return '';
  const rest = body.slice(match.index + match[0].length);
  const next = /^#{1,3}\s+/mu.exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}

function markdownList(value: string): string[] {
  return value.split(/\r?\n/u).map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/u, '').trim()).filter(Boolean);
}

function inlineValues(value: string): string[] {
  const quoted = [...value.matchAll(/`([^`]+)`/gu)].map(match => match[1]!.trim()).filter(Boolean);
  if (quoted.length) return quoted;
  return value.split(/[,，]/u).map(item => item.trim()).filter(Boolean);
}

interface ParsedMarkdown {
  cases: Omit<GlobalCase, 'tests' | 'status'>[];
  issues: string[];
}

export function parseCaseMarkdown(content: string, relative: string, kind: CaseScope, owner?: string): ParsedMarkdown {
  const cases: Omit<GlobalCase, 'tests' | 'status'>[] = [];
  const issues: string[] = [];
  const starts = [...content.matchAll(/^##\s+(CASE-\d+)\s+(.+?)\s*$/gmu)];
  if (!starts.length) issues.push(`用例文件 ${relative} 中没有 CASE-NNN 小节。`);
  for (const [index, match] of starts.entries()) {
    const id = match[1]!;
    const title = match[2]!.trim();
    const body = content.slice((match.index ?? 0) + match[0].length, starts[index + 1]?.index ?? content.length);
    const subject = `${relative} ${id}`;
    const type = field(body, '类型') as CaseScope;
    const priority = field(body, '优先级') as CasePriority;
    const modules = inlineValues(field(body, '模块'));
    const requirements = inlineValues(field(body, '需求'));
    const source = inlineValues(field(body, '源码'));
    const criterionText = field(body, '关联 AC');
    const criteria = !criterionText || criterionText === '无' ? [] : inlineValues(criterionText);
    const preconditions = markdownList(subsection(body, '前置条件'));
    const steps = markdownList(subsection(body, '步骤'));
    const inputs = markdownList(subsection(body, '输入'));
    const expected = subsection(body, '预期结果');
    if (!title) issues.push(`${subject} 缺少标题。`);
    if (type !== kind) issues.push(`${subject} 的类型必须是 ${kind}。`);
    if (!CASE_PRIORITIES.includes(priority)) issues.push(`${subject} 的优先级必须是 high、medium 或 low。`);
    const checkedModules = references(modules, true);
    const checkedRequirements = references(requirements);
    const checkedSource = references(source);
    const checkedCriteria = caseCriteria(criteria);
    if (!checkedModules) issues.push(`${subject} 的模块列表无效。`);
    if (!checkedRequirements) issues.push(`${subject} 的需求引用无效。`);
    if (!checkedSource) issues.push(`${subject} 的源码路径无效。`);
    if (checkedCriteria === null) issues.push(`${subject} 的关联 AC 必须是 <任务>#AC-<编号> 列表。`);
    if (!preconditions.length) issues.push(`${subject} 缺少前置条件。`);
    if (!steps.length) issues.push(`${subject} 缺少步骤。`);
    if (!inputs.length) issues.push(`${subject} 缺少输入。`);
    if (!expected) issues.push(`${subject} 缺少预期结果。`);
    if (owner && checkedModules && !checkedModules.includes(owner)) issues.push(`${subject} 的模块必须包含所属模块 ${owner}。`);
    if (type === kind && CASE_PRIORITIES.includes(priority) && checkedModules && checkedRequirements
      && checkedSource && checkedCriteria !== null && preconditions.length && steps.length && inputs.length && expected) {
      cases.push({ id, title, modules: checkedModules, requirements: checkedRequirements, source: checkedSource,
        criteria: checkedCriteria, kind, priority, preconditions, steps, inputs, expected, file: relative });
    }
  }
  return { cases, issues };
}

interface TestCoverageResult { byCase: Map<string, TestReference[]>; issues: string[] }

async function scanTestCoverage(root: string, knownIds: Set<string>, libraryIssues: string[]): Promise<TestCoverageResult> {
  const byCase = new Map<string, TestReference[]>();
  const issues: string[] = [];
  const files: string[] = [];
  const isTestFile = (relative: string, name: string): boolean => {
    if (/\.(?:test|spec)\.[cm]?[jt]s$/u.test(name)) return true;
    if (!name.endsWith('.py')) return false;
    if (/^(?:test_.+|.+_test)\.py$/u.test(name) && !relative.includes('/')) return true;
    return /^(?:test|tests)\//u.test(relative);
  };
  async function visit(relative: string): Promise<void> {
    let entries;
    try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && isTestFile(child, entry.name)) files.push(child);
    }
  }
  await visit('test');
  await visit('tests');
  let rootEntries: Dirent[];
  try { rootEntries = await readdir(root, { withFileTypes: true }); }
  catch { rootEntries = []; }
  for (const entry of rootEntries) {
    if (entry.isFile() && /^(?:test_.+|.+_test)\.py$/u.test(entry.name)) files.push(entry.name);
  }
  for (const relative of files) {
    const content = await readFile(path.join(root, relative), 'utf8');
    for (const block of testBlocks(content)) {
      const ids = new Set([...block.name.matchAll(/\bCASE-\d+\b/gu)].map(match => match[0]));
      const prefix = content.slice(0, block.index).split(/\r?\n/u);
      const comments: string[] = [];
      for (let index = prefix.length - 1; index >= 0; index -= 1) {
        const line = prefix[index]!.trim();
        if (!line) continue;
        if (!/^(?:\/\/|\/\*|\*|#)/u.test(line)) break;
        comments.unshift(line);
      }
      for (const match of comments.join('\n').matchAll(/\bCASE-\d+\b/gu)) ids.add(match[0]);
      const reference = { path: relative, name: block.name };
      for (const id of ids) {
        if (!knownIds.has(id)) {
          const issue = `测试 ${relative}::${block.name} 引用了不存在的用例 ${id}。`;
          issues.push(issue);
          libraryIssues.push(issue);
          continue;
        }
        const values = byCase.get(id) ?? [];
        if (!values.some(item => sameTestReference(item, reference))) values.push(reference);
        byCase.set(id, values);
      }
    }
  }
  return { byCase, issues };
}

export async function readCaseLibrary(root: string): Promise<CaseLibrary> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const rawCases: Omit<GlobalCase, 'tests' | 'status'>[] = [];
  const specs = await directoryNames(root, '.tiller/specs/modules');
  const specModules = specs ?? [];
  const specSet = new Set(specModules);
  const ids = new Map<string, string>();
  let historicalCases = 0;

  let rootEntries;
  try { rootEntries = await readdir(path.join(root, CASE_ROOT), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { cases: [], issues, warnings, modules: specModules.map(module => ({ module, behavior: 0, interface: 0, performance: 0, security: 0, total: 0 })), scenarios: [], uncovered: specModules };
    }
    issues.push(`无法读取全局用例目录 ${CASE_ROOT}：${(error as Error).message}`);
    return { cases: [], issues, warnings, modules: [], scenarios: [], uncovered: [] };
  }
  for (const entry of rootEntries.filter(item => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    issues.push(`旧式全局用例 ${CASE_ROOT}/${entry.name} 不受支持；请迁移为 Markdown 用例。`);
  }

  async function append(content: string, relative: string, kind: CaseScope, owner?: string): Promise<void> {
    const parsed = parseCaseMarkdown(content, relative, kind, owner);
    issues.push(...parsed.issues);
    for (const item of parsed.cases) {
      if (ids.has(item.id)) issues.push(`全局用例 ${item.id} 与 ${ids.get(item.id)} 的 id 重复。`);
      else ids.set(item.id, relative);
      for (const module of item.modules) if (!specSet.has(module)) issues.push(`全局用例 ${item.id} 的模块不存在：${module}`);
      for (const [name, values] of [['需求', item.requirements], ['源码', item.source]] as const) {
        for (const reference of values) {
          const relativePath = referencePath(reference);
          if (relativePath && !(await fileExists(root, relativePath))) issues.push(`全局用例 ${item.id} 的${name}文件不存在：${relativePath}`);
        }
      }
      if (!item.criteria.length) historicalCases++;
      rawCases.push(item);
    }
  }

  for (const module of await directoryNames(root, `${CASE_ROOT}/modules`) ?? []) {
    if (!specSet.has(module)) issues.push(`用例模块目录 ${CASE_ROOT}/modules/${module} 在 .tiller/specs/modules 中不存在。`);
    let entries;
    try { entries = await readdir(path.join(root, CASE_ROOT, 'modules', module), { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries.filter(item => item.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${CASE_ROOT}/modules/${module}/${entry.name}`;
      if (entry.name.endsWith('.json')) {
        issues.push(`旧式用例文件 ${relative} 不受支持；请迁移为 ${entry.name.slice(0, -5)}.md。`);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const kind = entry.name.slice(0, -3);
      if (!CASE_KINDS.includes(kind as CaseKind)) {
        issues.push(`用例类型文件 ${relative} 不在白名单：${CASE_KINDS.join(', ')}。`);
        continue;
      }
      await append(await readFile(path.join(root, relative), 'utf8'), relative, kind as CaseKind, module);
    }
  }

  let scenarioFiles: Dirent[];
  try { scenarioFiles = await readdir(path.join(root, CASE_ROOT, 'scenarios'), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') issues.push(`无法读取场景目录 ${CASE_ROOT}/scenarios：${(error as Error).message}`);
    scenarioFiles = [];
  }
  for (const entry of scenarioFiles.filter(item => item.isFile() && item.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = `${CASE_ROOT}/scenarios/${entry.name}`;
    await append(await readFile(path.join(root, relative), 'utf8'), relative, 'scenario');
  }
  for (const entry of scenarioFiles.filter(item => item.isFile() && item.name.endsWith('.json'))) {
    issues.push(`旧式场景文件 ${CASE_ROOT}/scenarios/${entry.name} 不受支持；请迁移为 Markdown 场景。`);
  }

  const coverage = await scanTestCoverage(root, new Set(ids.keys()), issues);
  const cases: GlobalCase[] = rawCases.map(item => {
    const tests = coverage.byCase.get(item.id) ?? [];
    return { ...item, tests, status: tests.length ? 'implemented' : 'pending' };
  });
  const scenarios: CaseScenarioSummary[] = cases.filter(item => item.kind === 'scenario')
    .map(item => ({ id: item.id, title: item.title, modules: item.modules }));
  const modules: CaseModuleSummary[] = specModules.map(module => {
    const summary: CaseModuleSummary = { module, behavior: 0, interface: 0, performance: 0, security: 0, total: 0 };
    for (const item of cases) if (item.kind !== 'scenario' && item.file === `${CASE_ROOT}/modules/${module}/${item.kind}.md`) {
      summary[item.kind] += 1;
      summary.total += 1;
    }
    return summary;
  });
  const scenarioModules = new Set(scenarios.flatMap(item => item.modules));
  const uncovered = specModules.filter(module => !scenarioModules.has(module));
  for (const module of uncovered) warnings.push(`模块 ${module} 未被任何场景覆盖；请按需补充端到端场景。`);
  if (historicalCases) warnings.push(`${historicalCases} 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。`);
  for (const item of cases.filter(value => value.status === 'pending')) warnings.push(`用例 ${item.id} 待实现：尚无测试名引用 ${item.id}。`);
  return { cases, issues: [...new Set(issues)], warnings: [...new Set(warnings)], modules, scenarios, uncovered };
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) {
    throw Object.assign(new Error(`${label}必须是非空单行文本，且不超过 ${maximum} 字符。`), { code: 'INVALID_CASE_INPUT' });
  }
  return value.trim();
}

function caseSkeleton(runner: string, id: string, title: string, expected: string): string {
  if (runner === 'junit-maven' || runner === 'junit-gradle') {
    const number = id.replace(/[^0-9]/gu, '');
    const comment = (value: string): string => value.replaceAll('*/', '* /');
    return `import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertTrue;\n\nclass TillerCase${number}Test {\n  @Test\n  void case${number}() {\n    // ${id} ${comment(title)}\n    // TODO: ${comment(expected)}\n    assertTrue(true);\n  }\n}\n`;
  }
  if (runner === 'pytest') {
    const number = id.replace(/[^0-9]/gu, '');
    const comment = (value: string): string => value.replace(/[\r\n]+/gu, ' ');
    return `# ${id} ${comment(title)}\ndef test_case_${number}():\n    # TODO: ${comment(expected)}\n    assert True\n`;
  }
  return `import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('${id} ${title.replaceAll("'", "\\'")}', () => {\n  // TODO: ${expected.replaceAll("'", "\\'")}\n  assert.ok(true);\n});\n`;
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
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const content = await readFile(path.join(root, child), 'utf8');
      for (const match of content.matchAll(/^##\s+CASE-(\d+)\b/gmu)) maximum = Math.max(maximum, Number(match[1]));
    }
  }
  await visit(CASE_ROOT);
  return `CASE-${String(maximum + 1).padStart(3, '0')}`;
}

function outputList(values: string[], fallback: string[]): string[] {
  const result = values.map(value => requiredText(value, '用例设计字段', 2000)).filter(Boolean);
  return result.length ? result : fallback;
}

function renderCase(input: {
  id: string; title: string; kind: CaseScope; priority: CasePriority; modules: string[]; criteria: string[];
  requirements: string[]; source: string[]; preconditions: string[]; steps: string[]; inputs: string[]; expected: string;
}): string {
  return [
    `## ${input.id} ${input.title}`,
    '',
    `- 类型：${input.kind}`,
    `- 优先级：${input.priority}`,
    `- 模块：${input.modules.join(', ')}`,
    `- 关联 AC：${input.criteria.length ? input.criteria.join(', ') : '无'}`,
    `- 需求：${input.requirements.map(value => `\`${value}\``).join(', ')}`,
    `- 源码：${input.source.map(value => `\`${value}\``).join(', ')}`,
    '',
    '### 前置条件',
    '',
    ...input.preconditions.map(value => `- ${value}`),
    '',
    '### 步骤',
    '',
    ...input.steps.map((value, index) => `${index + 1}. ${value}`),
    '',
    '### 输入',
    '',
    ...input.inputs.map(value => `- ${value}`),
    '',
    '### 预期结果',
    '',
    input.expected,
    '',
  ].join('\n');
}

export async function addGlobalCase(rootInput: string, input: AddCaseInput) {
  const root = path.resolve(rootInput);
  validateTaskId(input.task);
  const title = requiredText(input.title, '用例标题', 200);
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
  const priority = (input.priority ?? 'medium') as CasePriority;
  if (!CASE_PRIORITIES.includes(priority)) throw Object.assign(new Error(`优先级必须是：${CASE_PRIORITIES.join(', ')}。`), { code: 'INVALID_CASE_INPUT' });
  const expected = requiredText(input.expected, '预期结果', 4000);
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
    if (!(await fileExists(root, relative))) throw Object.assign(new Error(`需求引用文件不存在：${relative}`), { code: 'CASE_REFERENCE_NOT_FOUND' });
  }
  const source = references(input.source);
  if (!source) throw Object.assign(new Error('至少提供一个 --source，指向实现该用例的源码路径。'), { code: 'INVALID_CASE_INPUT' });
  const preconditions = outputList(input.preconditions, ['对应模块与运行环境可用。']);
  const steps = outputList(input.steps, ['执行覆盖本用例的测试。', '核对实际结果与预期结果一致。']);
  const inputs = outputList(input.inputs, ['按用例描述准备正常输入及必要的边界输入。']);
  return withProjectLock(root, async () => {
    const metadata = await readProjectMetadata(root);
    const runner = metadata.verify?.runner ?? 'node-test';
    const id = await allocateCaseId(root);
    const relative = scenario ? `${CASE_ROOT}/scenarios/${scenario}.md` : `${CASE_ROOT}/modules/${modules[0]}/${kind}.md`;
    const before = await readTextIfExists(root, relative);
    const header = scenario ? `# 场景：${scenario}\n\n` : `# ${modules[0]} / ${kind}\n\n`;
    const after = `${before === null ? header : `${before.trimEnd()}\n\n`}${renderCase({ id, title, kind, priority, modules, criteria, requirements,
      source, preconditions, steps, inputs, expected })}`;
    await applyChanges(root, [{ path: relative, before, after }]);
    return {
      id, title, path: relative, kind, priority, modules, criteria, status: 'pending', runner,
      next: `编写测试并在测试名中引用 ${id}，然后运行：tiller verify ${input.task} --criterion ${criteria[0]!.split('#')[1]} --case ${id}`,
      skeleton: caseSkeleton(runner, id, title, expected),
    };
  });
}
