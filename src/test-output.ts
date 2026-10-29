import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectMetadata, VerifyConfig } from './types.js';

export interface TestReference {
  path: string;
  name?: string;
}

export interface TestEvidence {
  verified: boolean;
  outcome?: 'passed' | 'failed';
  reason: string;
}

export interface TestRunPaths {
  reporter: string;
  report: string;
}

export interface TestRunFile {
  name: string;
  content: string;
}

export interface TestRunCommand {
  executable: string;
  args: string[];
  display: string;
  files?: TestRunFile[];
  /** Directories under cwd that must be removed before launch so default output cannot be stale. */
  freshDirectories?: string[];
}

export interface ProcessInvocation {
  executable: string;
  args: string[];
  windowsVerbatimArguments?: true;
}

export interface TestRunner {
  name: string;
  build(reference: TestReference, paths: TestRunPaths, pattern?: string): TestRunCommand;
  parse(report: string, reference: TestReference, expectedFile: string): TestEvidence;
  /** Read the report after the subprocess. The default is the report file itself. */
  loadReport?(reportFile: string, reportDirectory: string, cwd: string): Promise<string>;
}

export interface VerifyTarget {
  runner: string;
  prepare?: string[];
  /** Working directory relative to the management or project root. `.` is that root. */
  cwd: string;
  /** Test reference with `path` relative to `cwd`. */
  reference: TestReference;
  repositoryId?: string;
}

export const VERIFY_RUNNER_NAMES = ['node-test', 'junit-maven', 'junit-gradle', 'pytest'] as const;
export type VerifyRunnerName = typeof VERIFY_RUNNER_NAMES[number];

const JAVA_IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;
const JAVA_CLASS_NAME = new RegExp(`^(?:${JAVA_IDENTIFIER}\\.)*${JAVA_IDENTIFIER}$`, 'u');
const JAVA_METHOD_NAME = new RegExp(`^${JAVA_IDENTIFIER}$`, 'u');
const PYTHON_IDENTIFIER = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const PYTHON_NAME = new RegExp(`^${PYTHON_IDENTIFIER}$`, 'u');
const GRADLE_INIT_SCRIPT = `gradle.projectsEvaluated {
  rootProject.allprojects {
    tasks.withType(org.gradle.api.tasks.testing.Test).configureEach {
      def destination = project.file(System.getProperty('tiller.junit.reports'))
      reports.junitXml.required = true
      def xml = reports.junitXml
      if (xml.hasProperty('outputLocation')) {
        xml.outputLocation.set(destination)
      } else {
        xml.destination = destination
      }
    }
  }
}
`;

interface ReportEvent {
  type?: string;
  name?: string;
  path?: string;
  outcome?: string;
  file?: string | null;
  success?: boolean;
}

interface JUnitCase {
  classname: string;
  name: string;
  outcome: 'passed' | 'failed' | 'skipped';
}

interface JUnitSelector {
  className: string;
  method?: string;
}

interface PytestSelector {
  classNames: string[];
  method?: string;
}

function coded(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function quote(value: string): string {
  return /^[A-Za-z0-9_./:=@%+-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function commandDisplay(executable: string, args: string[]): string {
  return [executable, ...args.map(quote)].join(' ');
}

function cmdArgument(value: string): string {
  if (/[\0\r\n%!^]/u.test(value)) throw Object.assign(new Error('Windows 测试命令参数不能包含 NUL、换行或 cmd 元字符（% ! ^）。'), {
    code: 'VERIFY_COMMAND_UNSUPPORTED',
  });
  const escaped = value
    .replaceAll('"', '\\"')
    .replace(/(\\+)$/u, '$1$1');
  return `"${escaped}"`;
}

function windowsExecutable(executable: string): string {
  const mapping = new Map([
    ['mvn', 'mvn.cmd'], ['gradle', 'gradle.bat'], ['pytest', 'pytest.exe'],
    ['npm', 'npm.cmd'], ['npx', 'npx.cmd'],
  ]);
  const name = path.basename(executable).toLowerCase();
  const replacement = mapping.get(name);
  return replacement ? `${executable.slice(0, -name.length)}${replacement}` : executable;
}

function cmdExecutable(value: string): string {
  return /^[A-Za-z0-9_./:\\-]+$/u.test(value) ? value : cmdArgument(value);
}

/** Resolve a logical test tool to the platform executable and command interpreter. */
export function platformProcessInvocation(executable: string, args: string[], platform = process.platform,
  comSpec = process.env.ComSpec || 'cmd.exe'): ProcessInvocation {
  if (platform !== 'win32') return { executable, args };
  const resolved = windowsExecutable(executable);
  if (!/\.(?:cmd|bat)$/iu.test(resolved)) return { executable: resolved, args };
  const commandLine = `"${[cmdExecutable(resolved), ...args.map(cmdArgument)].join(' ')}"`;
  return { executable: comSpec, args: ['/d', '/s', '/c', commandLine], windowsVerbatimArguments: true };
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function normalizeVerifyConfig(value: unknown, label: string): VerifyConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} verify 配置必须是对象。`);
  const data = value as Record<string, unknown>;
  const unknown = Object.keys(data).filter(key => key !== 'runner' && key !== 'prepare');
  if (unknown.length) throw new Error(`${label} verify 配置含未知字段：${unknown.join('、')}。`);
  if (data.runner !== undefined && (typeof data.runner !== 'string' || !VERIFY_RUNNER_NAMES.includes(data.runner as VerifyRunnerName))) {
    throw new Error(`${label} verify.runner 当前仅支持 ${VERIFY_RUNNER_NAMES.join('、')}。`);
  }
  if (data.prepare !== undefined) {
    if (!Array.isArray(data.prepare) || !data.prepare.length
      || data.prepare.some(item => typeof item !== 'string' || !item.trim() || item.length > 1000 || /[\x00-\x1f]/u.test(item))) {
      throw new Error(`${label} verify.prepare 必须是非空字符串参数数组。`);
    }
  }
  const result: VerifyConfig = {};
  for (const key of Object.keys(data)) {
    if (key === 'runner') result.runner = data.runner as string;
    if (key === 'prepare') result.prepare = [...data.prepare as string[]];
  }
  return result.runner === undefined && result.prepare === undefined ? undefined : result;
}

function normalizeTestPath(value: string): string {
  const normalized = value.trim().split('\\').join('/').replace(/^\.\//u, '');
  const parts = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || parts.some(part => part === '' || part === '.' || part === '..')) {
    coded('VERIFY_REPOSITORY_UNRESOLVED', '测试路径无效，不能定位所属仓库。');
  }
  return normalized;
}

function owns(file: string, repositoryPath: string): boolean {
  const root = repositoryPath.split('\\').join('/').replace(/\/+$/u, '');
  return file === root || file.startsWith(`${root}/`);
}

function stripRoot(file: string, repositoryPath: string): string {
  const root = repositoryPath.split('\\').join('/').replace(/\/+$/u, '');
  if (!root || root === '.') return file;
  if (file.startsWith(`${root}/`)) return file.slice(root.length + 1);
  return file;
}

/**
 * Pick the runner from the registered repository that owns the test file.
 * A workspace path that matches none, or more than one equal-length repository, fails closed.
 * Project mode has no business repositories and uses the root verify config.
 */
export function resolveVerifyTarget(metadata: ProjectMetadata, reference: TestReference): VerifyTarget {
  const file = normalizeTestPath(reference.path);
  const matches = metadata.repositories.filter(repository => owns(file, repository.path));
  matches.sort((left, right) => right.path.length - left.path.length);
  const name = reference.name ? { name: reference.name } : {};
  if (matches.length > 0) {
    const longest = matches[0]!.path.length;
    const best = matches.filter(repository => repository.path.length === longest);
    if (best.length !== 1) {
      coded('VERIFY_REPOSITORY_UNRESOLVED', `测试路径同时属于多个仓库（${best.map(repository => repository.id).join('、')}），已拒绝执行。`);
    }
    const selected = best[0]!;
    const prepare = selected.verify?.prepare ?? metadata.verify?.prepare;
    return {
      runner: selected.verify?.runner ?? metadata.verify?.runner ?? 'node-test',
      ...(prepare ? { prepare: [...prepare] } : {}),
      cwd: selected.path,
      reference: { path: stripRoot(file, selected.path), ...name },
      repositoryId: selected.id,
    };
  }
  if (metadata.mode === 'project' && metadata.repositories.length === 0) {
    const prepare = metadata.verify?.prepare;
    return {
      runner: metadata.verify?.runner ?? 'node-test',
      ...(prepare ? { prepare: [...prepare] } : {}),
      cwd: '.',
      reference: { path: file, ...name },
    };
  }
  coded('VERIFY_REPOSITORY_UNRESOLVED', '测试路径不属于任何已登记仓库，已拒绝执行。');
}

function reportEvents(report: string): ReportEvent[] | null {
  const events: ReportEvent[] = [];
  for (const line of report.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let value: unknown;
    try { value = JSON.parse(line); }
    catch { return null; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (typeof item.type !== 'string') return null;
    events.push({
      type: item.type,
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
      ...(typeof item.path === 'string' ? { path: item.path } : {}),
      ...(typeof item.outcome === 'string' ? { outcome: item.outcome } : {}),
      ...(typeof item.file === 'string' || item.file === null ? { file: item.file } : {}),
      ...(typeof item.success === 'boolean' ? { success: item.success } : {}),
    });
  }
  return events;
}

function sameFile(left: string | null | undefined, right: string): boolean {
  if (!left) return false;
  return path.resolve(left) === path.resolve(right);
}

function matches(reference: TestReference, event: ReportEvent): boolean {
  if (!reference.name) return true;
  return event.path === reference.name;
}

function inspectEvents(events: ReportEvent[], reference: TestReference, expectedFile: string): TestEvidence {
  const tests = events.filter(event => (event.type === 'pass' || event.type === 'fail' || event.type === 'skip')
    && event.name && sameFile(event.file, expectedFile));
  const target = tests.filter(event => matches(reference, event));
  const failures = tests.filter(event => event.outcome === 'failed');
  if (!tests.length) return { verified: false, reason: '私有报告中没有可用的测试事件。' };
  if (target.length !== 1) {
    return { verified: false, reason: target.length ? `私有报告匹配到 ${target.length} 个测试。` : '私有报告未找到指定测试。' };
  }
  const found = target[0]!;
  if (found.outcome === 'skipped') return { verified: false, reason: `测试被跳过：${found.path ?? found.name}。` };
  if (reference.name && found.outcome === 'failed' && failures.length !== 1) {
    return { verified: false, reason: '私有报告包含额外的失败事件。' };
  }
  if (found.outcome === 'passed' && failures.length) return { verified: false, reason: '私有报告包含失败事件。' };
  if (events.some(event => event.type === 'summary' && event.success === false) && found.outcome !== 'failed') {
    return { verified: false, reason: '私有报告总结为失败。' };
  }
  if (!reference.name) {
    if (tests.some(event => event.outcome !== 'passed')) return { verified: false, reason: '文件内存在失败或跳过的测试。' };
    return { verified: true, outcome: 'passed', reason: '文件内测试全部通过。' };
  }
  return { verified: true, outcome: found.outcome === 'failed' ? 'failed' : 'passed', reason: '私有报告中的测试结果已核实。' };
}

function classFromJavaTestPath(filePath: string): string | null {
  const normalized = filePath.split('\\').join('/');
  const marker = 'src/test/java/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0 || (index > 0 && normalized[index - 1] !== '/')) return null;
  const rest = normalized.slice(index + marker.length);
  if (!rest.endsWith('.java')) return null;
  const className = rest.slice(0, -'.java'.length).split('/').join('.');
  if (!JAVA_CLASS_NAME.test(className)) return null;
  return className;
}

function junitSelector(reference: TestReference): JUnitSelector {
  const name = reference.name?.trim();
  if (name?.includes('#')) {
    const hash = name.indexOf('#');
    const className = name.slice(0, hash);
    const method = name.slice(hash + 1);
    if (!JAVA_CLASS_NAME.test(className) || !JAVA_METHOD_NAME.test(method) || name.includes('#', hash + 1)) {
      coded('VERIFY_SELECTOR_INVALID', `JUnit 测试选择器无效：${name}。请使用“类名”或“类名#方法名”。`);
    }
    return { className, method };
  }
  if (name && name.includes('.')) {
    if (!JAVA_CLASS_NAME.test(name)) coded('VERIFY_SELECTOR_INVALID', `JUnit 测试选择器无效：${name}。请使用“类名”或“类名#方法名”。`);
    return { className: name };
  }
  const derived = classFromJavaTestPath(reference.path);
  if (name) {
    if (!derived || !JAVA_METHOD_NAME.test(name)) {
      coded('VERIFY_SELECTOR_INVALID', '无法确定 JUnit 测试类。请使用“类名”或“类名#方法名”，或把文件放在 src/test/java 下。');
    }
    return { className: derived, method: name };
  }
  if (!derived) coded('VERIFY_SELECTOR_INVALID', '无法确定 JUnit 测试类。请使用“类名”或“类名#方法名”，或把文件放在 src/test/java 下。');
  return { className: derived };
}

function reportDirectory(reportFile: string): string {
  const normalized = reportFile.split('\\').join('/');
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '.' : normalized.slice(0, index);
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"').replace(/&apos;/gu, "'");
}

function readAttributes(tag: string): Record<string, string> | null {
  const body = tag.replace(/^<testcase\b/u, '').replace(/\/?\s*>$/u, '');
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'))?/gu;
  let consumed = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index === undefined) return null;
    if (body.slice(consumed, match.index).trim()) return null;
    attributes[match[1]!] = decodeXml(match[2] ?? match[3] ?? '');
    consumed = match.index + match[0].length;
  }
  if (body.slice(consumed).trim()) return null;
  return attributes;
}

function parseJUnitCases(report: string): JUnitCase[] | null {
  const text = report.replace(/^\uFEFF/u, '');
  if (!text.trim()) return [];
  if (!text.includes('<')) return null;
  const cases: JUnitCase[] = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('<testcase', index);
    if (start < 0) break;
    const boundary = text[start + '<testcase'.length];
    if (boundary && !/[\s/>]/u.test(boundary)) {
      index = start + 1;
      continue;
    }
    const tagEnd = text.indexOf('>', start);
    if (tagEnd < 0) return null;
    const opening = text.slice(start, tagEnd + 1);
    const attributes = readAttributes(opening);
    if (!attributes || typeof attributes.name !== 'string' || typeof attributes.classname !== 'string' || !attributes.name || !attributes.classname) {
      return null;
    }
    let outcome: JUnitCase['outcome'] = 'passed';
    const selfClosing = /\/\s*>$/u.test(opening);
    if (selfClosing) index = tagEnd + 1;
    else {
      const close = text.indexOf('</testcase>', tagEnd + 1);
      if (close < 0) return null;
      const body = text.slice(tagEnd + 1, close);
      if (/<failure(?:\s|>|\/)/u.test(body) || /<error(?:\s|>|\/)/u.test(body)) outcome = 'failed';
      else if (/<skipped(?:\s|>|\/)/u.test(body)) outcome = 'skipped';
      index = close + '</testcase>'.length;
    }
    cases.push({ classname: attributes.classname, name: attributes.name, outcome });
  }
  if (!cases.length && !/<testsuites?\b/u.test(text)) return null;
  return cases;
}

function inspectJUnit(cases: JUnitCase[], selector: JUnitSelector): TestEvidence {
  const inClass = cases.filter(item => item.classname === selector.className);
  const target = selector.method ? inClass.filter(item => item.name === selector.method) : inClass;
  const failures = inClass.filter(item => item.outcome === 'failed');
  if (!inClass.length) return { verified: false, reason: '私有报告中没有可用的测试事件。' };
  if (selector.method) {
    if (target.length !== 1) {
      return { verified: false, reason: target.length ? `私有报告匹配到 ${target.length} 个测试。` : '私有报告未找到指定测试。' };
    }
    const found = target[0]!;
    if (found.outcome === 'skipped') return { verified: false, reason: `测试被跳过：${selector.className}#${found.name}。` };
    if (found.outcome === 'failed' && failures.length !== 1) return { verified: false, reason: '私有报告包含额外的失败事件。' };
    if (found.outcome === 'passed' && failures.length) return { verified: false, reason: '私有报告包含失败事件。' };
    return { verified: true, outcome: found.outcome === 'failed' ? 'failed' : 'passed', reason: '私有报告中的测试结果已核实。' };
  }
  if (inClass.some(item => item.outcome !== 'passed')) return { verified: false, reason: '文件内存在失败或跳过的测试。' };
  return { verified: true, outcome: 'passed', reason: '文件内测试全部通过。' };
}

function parseJUnit(report: string, reference: TestReference): TestEvidence {
  let selector: JUnitSelector;
  try { selector = junitSelector(reference); }
  catch (error) { return { verified: false, reason: (error as Error).message }; }
  const cases = parseJUnitCases(report);
  if (cases === null) return { verified: false, reason: '私有报告损坏或无法解析。' };
  return inspectJUnit(cases, selector);
}

async function readJUnitDirectory(reportDirectory: string): Promise<string> {
  let names: string[];
  try { names = await readdir(reportDirectory); }
  catch { return ''; }
  const parts: string[] = [];
  for (const name of names.filter(item => item.endsWith('.xml')).sort()) {
    parts.push(await readFile(path.join(reportDirectory, name), 'utf8'));
  }
  return parts.join('\n');
}

async function loadJUnitReport(_reportFile: string, reportDirectory: string): Promise<string> {
  return readJUnitDirectory(reportDirectory);
}

async function loadMavenJUnitReport(_reportFile: string, _reportDirectory: string, cwd: string): Promise<string> {
  return readJUnitDirectory(path.join(cwd, 'target/surefire-reports'));
}

function pythonModule(filePath: string): string | null {
  const normalized = filePath.split('\\').join('/').replace(/^\.\//u, '');
  if (!normalized.endsWith('.py')) return null;
  const parts = normalized.slice(0, -'.py'.length).split('/');
  if (!parts.length || parts.some(part => !PYTHON_NAME.test(part))) return null;
  return parts.join('.');
}

function pytestSelector(reference: TestReference): PytestSelector {
  const module = pythonModule(reference.path);
  if (!module) coded('VERIFY_SELECTOR_INVALID', '无法从 Python 测试路径确定模块；请使用只含字母、数字和下划线的 .py 路径。');
  const name = reference.name?.trim();
  if (!name) return { classNames: [module] };
  const parts = name.split('::');
  if (parts.length > 2 || parts.some(part => !part.trim())) {
    coded('VERIFY_SELECTOR_INVALID', `pytest 测试选择器无效：${name}。请使用“test_name”或“TestClass::test_name”。`);
  }
  const method = parts.at(-1)!.trim();
  if (/\s/u.test(method)) {
    coded('VERIFY_SELECTOR_INVALID', `pytest 测试选择器无效：${name}。测试函数名不能包含空白。`);
  }
  if (parts.length === 2) {
    const className = parts[0]!.trim();
    if (!PYTHON_NAME.test(className)) {
      coded('VERIFY_SELECTOR_INVALID', `pytest 测试类名无效：${className}。`);
    }
    return { classNames: [`${module}.${className}`], method };
  }
  return { classNames: [module], method };
}

function inspectPytest(cases: JUnitCase[], selector: PytestSelector): TestEvidence {
  const inModule = cases.filter(item => selector.classNames.some(className =>
    item.classname === className || item.classname.endsWith(`.${className}`)));
  if (!inModule.length) return { verified: false, reason: '私有报告中没有可用的测试事件。' };
  if (!selector.method) {
    if (inModule.some(item => item.outcome !== 'passed')) return { verified: false, reason: '文件内存在失败或跳过的测试。' };
    return { verified: true, outcome: 'passed', reason: '文件内测试全部通过。' };
  }
  const target = inModule.filter(item => item.name === selector.method);
  const failures = inModule.filter(item => item.outcome === 'failed');
  if (target.length !== 1) {
    return { verified: false, reason: target.length ? `私有报告匹配到 ${target.length} 个测试。` : '私有报告未找到指定测试。' };
  }
  const found = target[0]!;
  if (found.outcome === 'skipped') return { verified: false, reason: `测试被跳过：${found.name}。` };
  if (found.outcome === 'failed' && failures.length !== 1) return { verified: false, reason: '私有报告包含额外的失败事件。' };
  if (found.outcome === 'passed' && failures.length) return { verified: false, reason: '私有报告包含失败事件。' };
  return { verified: true, outcome: found.outcome === 'failed' ? 'failed' : 'passed', reason: '私有报告中的测试结果已核实。' };
}

function parsePytest(report: string, reference: TestReference): TestEvidence {
  let selector: PytestSelector;
  try { selector = pytestSelector(reference); }
  catch (error) { return { verified: false, reason: (error as Error).message }; }
  const cases = parseJUnitCases(report);
  if (cases === null) return { verified: false, reason: '私有报告损坏或无法解析。' };
  return inspectPytest(cases, selector);
}

const nodeTestRunner: TestRunner = {
  name: 'node-test',
  build(reference, paths, pattern) {
    const args = [
      ...(pattern ? [`--test-name-pattern=${pattern}`] : []),
      `--test-reporter=${paths.reporter}`,
      `--test-reporter-destination=${paths.report}`,
      reference.path,
    ];
    return { executable: process.execPath, args, display: ['node', ...args.map(quote)].join(' ') };
  },
  parse(report, reference, expectedFile) {
    const events = reportEvents(report);
    if (events === null) return { verified: false, reason: '私有报告损坏或无法解析。' };
    return inspectEvents(events, reference, expectedFile);
  },
};

// Real Maven, cwd = business repo root (single module). Surefire 3.2.5 may
// ignore -Dsurefire.reportsDirectory, so verify uses its default output.
// mvn -Dtest=com.example.BillingTest#addsInvoice test
const junitMavenRunner: TestRunner = {
  name: 'junit-maven',
  build(reference) {
    const selector = junitSelector(reference);
    const test = selector.method ? `${selector.className}#${selector.method}` : selector.className;
    const args = [`-Dtest=${test}`, 'test'];
    return { executable: 'mvn', args, display: commandDisplay('mvn', args), freshDirectories: ['target/surefire-reports'] };
  },
  parse: parseJUnit,
  loadReport: loadMavenJUnitReport,
};

// Real Gradle, cwd = business repo root:
// gradle -Dtiller.junit.reports=<private dir> --init-script <private dir>/junit-gradle.init.gradle test --tests com.example.BillingTest.addsInvoice
const junitGradleRunner: TestRunner = {
  name: 'junit-gradle',
  build(reference, paths) {
    const selector = junitSelector(reference);
    const directory = reportDirectory(paths.report);
    const tests = selector.method ? `${selector.className}.${selector.method}` : selector.className;
    const args = [`-Dtiller.junit.reports=${directory}`, '--init-script', `${directory}/junit-gradle.init.gradle`, 'test', '--tests', tests];
    return {
      executable: 'gradle', args, display: commandDisplay('gradle', args),
      files: [{ name: 'junit-gradle.init.gradle', content: GRADLE_INIT_SCRIPT }],
    };
  },
  parse: parseJUnit,
  loadReport: loadJUnitReport,
};

// pytest writes one JUnit XML file to the private report path. Exact selection
// happens while parsing that report because -k cannot represent every identifier.
const pytestRunner: TestRunner = {
  name: 'pytest',
  build(reference, paths) {
    const args = [`--junitxml=${paths.report}`, reference.path];
    return { executable: 'pytest', args, display: commandDisplay('pytest', args) };
  },
  parse: parsePytest,
};

export const TEST_RUNNERS: TestRunner[] = [nodeTestRunner, junitMavenRunner, junitGradleRunner, pytestRunner];

export function runnerFor(name = 'node-test'): TestRunner {
  const runner = TEST_RUNNERS.find(item => item.name === name);
  if (!runner) throw Object.assign(new Error(`未知验证运行器：${name}。`), { code: 'UNKNOWN_VERIFY_RUNNER' });
  return runner;
}

export function namePattern(reference: TestReference): string | undefined {
  if (!reference.name) return undefined;
  const top = reference.name.split(' > ')[0]!.trim();
  return top ? `^${escapePattern(top)}$` : undefined;
}
