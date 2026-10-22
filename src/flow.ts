import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readProjectMetadata } from './core.js';
import { applyChanges, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { validateWorkId } from './work-id.js';

const execFileAsync = promisify(execFile);
const MARKER_PREFIX = '<!-- tiller-flow:v1 ';
const MARKER_SUFFIX = ' -->';
const FLOW_VERSION = 1;
const DEFAULT_TYPE = 'feature';
const TYPES = ['requirements', 'analysis', 'research', 'feature', 'bugfix', 'improvement', 'review', 'validation', 'documentation', 'migration', 'operations'] as const;
const CODE_TYPES = new Set(['feature', 'bugfix', 'improvement', 'migration', 'operations']);
const CONFIRMATION_GATES = ['requirements', 'design', 'acceptance'] as const;
const RESULTS = ['passed', 'failed', 'skipped'] as const;

export type FlowType = typeof TYPES[number];
export type FlowSize = 'small' | 'standard';
export type FlowGate = typeof CONFIRMATION_GATES[number];
export type FlowResult = typeof RESULTS[number];

export interface FlowMeta {
  version: 1; id: string; type: FlowType; size: FlowSize; created: string; base: string; scope: string[]; preExisting: Record<string, string>;
}
export interface FlowCriterion { id: string; text: string }
export interface FlowConfirmation {
  gate: FlowGate; quote: string; commit: string; subject: string; at: string;
}
export interface FlowVerification {
  id: string; criterion: string; test: string; command: string; result: FlowResult;
  exitCode: number | null; commit: string; at: string; tree: string; source: 'executed' | 'reported';
}
export interface FlowWork {
  meta: FlowMeta; title: string; goal: string; design: string; criteria: FlowCriterion[];
  confirmations: FlowConfirmation[]; verifications: FlowVerification[]; content: string; path: string;
}

export interface FlowStartInput {
  title: string; goal: string; type?: string; size?: string; targets?: string[]; criteria: string[];
}
export interface FlowVerifyInput {
  criteria: string[]; test: string; command: string; result?: string; run?: string;
}

interface GlobalCase {
  id: string; title: string; requirements: string[]; modules: string[]; test_ref: string; source: string[];
}
interface CaseLibrary { cases: GlobalCase[]; issues: string[]; warnings: string[] }

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}
function text(value: unknown, label: string, maximum = 10000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) {
    fail('INVALID_FLOW_INPUT', `${label}必须是非空单行文本，且不超过 ${maximum} 字符。`);
  }
  return value.trim();
}
function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function normalizeLine(value: string): string { return value.replace(/\s+/gu, ' ').trim(); }
function safeInput(value: string, label: string): string {
  const safety = recordSafety(value);
  if (safety.length) fail('UNSAFE_RECORD', `${label}${safety.join('；')}`);
  return value;
}
function workPath(id: string): string { return `.tiller/work/${id}/work.md`; }
function scopeValues(values: string[] | undefined): string[] {
  const raw = values?.length ? values : ['.'];
  const result = raw.map(value => value.trim().replace(/^\.\//u, '').replace(/\/+$/u, '') || '.');
  for (const value of result) {
    if (value !== '.') validateRelativePath(value);
    if (path.posix.isAbsolute(value) || value.includes('\\')) fail('INVALID_FLOW_SCOPE', `范围必须是工程相对路径：${value}`);
  }
  return [...new Set(result)];
}
function flowType(value: string | undefined): FlowType {
  const actual = value ?? DEFAULT_TYPE;
  if (!TYPES.includes(actual as FlowType)) fail('INVALID_FLOW_TYPE', `任务类型必须是：${TYPES.join(', ')}。`);
  return actual as FlowType;
}
function flowSize(value: string | undefined): FlowSize {
  if (value === 'large') return 'standard';
  const actual = value ?? 'standard';
  if (actual !== 'small' && actual !== 'standard') fail('INVALID_FLOW_SIZE', '任务规模必须是 small 或 standard（large 作为 standard 的别名）。');
  return actual;
}
function codeType(meta: FlowMeta): boolean { return CODE_TYPES.has(meta.type); }
function requiresDesign(work: Pick<FlowWork, 'meta'>): boolean { return codeType(work.meta) && work.meta.size === 'standard'; }

async function git(root: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string; code?: number | null };
    return { ok: false, stdout: item.stdout ?? '', stderr: item.stderr ?? (error as Error).message, code: item.code ?? null };
  }
}
async function head(root: string): Promise<string | null> {
  const result = await git(root, ['rev-parse', 'HEAD']);
  return result.ok && /^[a-f0-9]{40,64}$/u.test(result.stdout.trim()) ? result.stdout.trim() : null;
}
function validCommit(value: string): boolean { return value === 'no-git' || /^[a-f0-9]{7,64}$/u.test(value); }
async function currentCommit(root: string, requested?: string): Promise<string> {
  if (requested !== undefined) {
    if (!validCommit(requested)) fail('INVALID_COMMIT', '提交必须为 7-64 位 Git OID，非 Git 工程使用 no-git。');
    if (requested !== 'no-git') {
      const checked = await git(root, ['cat-file', '-e', `${requested}^{commit}`]);
      if (!checked.ok) fail('INVALID_COMMIT', `提交不存在：${requested}`);
    }
    return requested;
  }
  return (await head(root)) ?? 'no-git';
}

function parseMeta(marker: string, id: string): FlowMeta {
  let raw: unknown;
  try { raw = JSON.parse(marker); } catch { fail('INVALID_FLOW_WORK', '工作元信息不是有效 JSON。'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_FLOW_WORK', '工作元信息格式无效。');
  const value = raw as Record<string, unknown>;
  for (const key of ['version', 'id', 'type', 'size', 'created', 'base', 'scope']) if (!Object.hasOwn(value, key)) fail('INVALID_FLOW_WORK', `工作元信息缺少 ${key}。`);
  if (value.version !== FLOW_VERSION || value.id !== id) fail('INVALID_FLOW_WORK', '工作元信息版本或标识不匹配。');
  const type = flowType(String(value.type));
  const size = flowSize(String(value.size));
  const created = text(value.created, '创建时间', 64);
  if (!Number.isFinite(Date.parse(created))) fail('INVALID_FLOW_WORK', '工作创建时间无效。');
  const base = text(value.base, '基线提交', 64);
  if (!validCommit(base)) fail('INVALID_FLOW_WORK', '工作基线提交无效。');
  if (!Array.isArray(value.scope) || !value.scope.length || value.scope.some(item => typeof item !== 'string')) fail('INVALID_FLOW_WORK', '工作范围无效。');
  const preExisting: Record<string, string> = {};
  if (value.preExisting !== undefined) {
    if (!value.preExisting || typeof value.preExisting !== 'object' || Array.isArray(value.preExisting)) fail('INVALID_FLOW_WORK', '开工前改动摘要格式无效。');
    for (const [relative, digest] of Object.entries(value.preExisting as Record<string, unknown>)) {
      validateRelativePath(relative);
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest)) fail('INVALID_FLOW_WORK', '开工前改动摘要无效。');
      preExisting[relative] = digest;
    }
  }
  return { version: 1, id, type, size, created, base, scope: scopeValues(value.scope as string[]), preExisting };
}
function sectionBody(content: string, title: string): string {
  const match = new RegExp(`^## ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const next = /^##\s+/mu.exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}
function parseCriteria(content: string): FlowCriterion[] {
  const body = sectionBody(content, '验收条件');
  const result: FlowCriterion[] = [];
  for (const line of body.split(/\r?\n/u)) {
    const match = /^-\s+(AC-\d+):\s*(.+)$/u.exec(line.trim());
    if (match) result.push({ id: match[1]!, text: match[2]!.trim() });
  }
  return result;
}
function parseConfirmations(content: string): FlowConfirmation[] {
  const body = sectionBody(content, '确认');
  const chunks = body.split(/^###\s+/mu).slice(1);
  const result: FlowConfirmation[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/u);
    const gate = lines.shift()?.trim() as FlowGate | undefined;
    if (!gate || !CONFIRMATION_GATES.includes(gate)) continue;
    const field = (name: string) => {
      const prefix = `- ${name}：`;
      return lines.find(line => line.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
    };
    const quote = field('用户原话');
    const commit = field('提交');
    const subject = field('对象摘要');
    const at = field('时间');
    if (quote && validCommit(commit) && /^[a-f0-9]{64}$/u.test(subject) && Number.isFinite(Date.parse(at))) {
      result.push({ gate, quote, commit, subject, at });
    }
  }
  return result;
}
function parseVerifications(content: string): FlowVerification[] {
  const body = sectionBody(content, '验证');
  const chunks = body.split(/^###\s+/mu).slice(1);
  const result: FlowVerification[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/u);
    const id = lines.shift()?.trim();
    if (!id) continue;
    const field = (name: string) => {
      const prefix = `- ${name}：`;
      return lines.find(line => line.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
    };
    const criterion = field('条件');
    const test = field('测试');
    const command = field('命令');
    const resultValue = field('结果') as FlowResult;
    const exitText = field('退出码');
    const commit = field('提交');
    const at = field('时间');
    const tree = field('代码树摘要');
    const source = field('来源') as FlowVerification['source'];
    if (criterion && test && command && RESULTS.includes(resultValue) && validCommit(commit)
      && /^[a-f0-9]{64}$/u.test(tree) && Number.isFinite(Date.parse(at)) && (source === 'executed' || source === 'reported')) {
      result.push({ id, criterion, test, command, result: resultValue, exitCode: exitText === '无' ? null : Number(exitText),
        commit, at, tree, source });
    }
  }
  return result;
}
function parseWork(content: string, id: string, relative: string): FlowWork {
  const marker = new RegExp(`${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(\\{.*\\})${MARKER_SUFFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u').exec(content);
  if (!marker) fail('FLOW_WORK_NOT_FOUND', `工作 ${id} 不是当前轻量记录。`);
  const title = /^#\s+(.+)$/mu.exec(content)?.[1]?.trim();
  if (!title) fail('INVALID_FLOW_WORK', '工作记录缺少标题。');
  const goal = sectionBody(content, '目标');
  if (!goal) fail('INVALID_FLOW_WORK', '工作记录缺少目标。');
  return {
    meta: parseMeta(marker[1]!, id), title, goal, design: sectionBody(content, '设计'),
    criteria: parseCriteria(content), confirmations: parseConfirmations(content),
    verifications: parseVerifications(content), content, path: relative,
  };
}
async function readWork(root: string, id: string): Promise<FlowWork> {
  validateWorkId(id);
  await readProjectMetadata(root);
  const relative = workPath(id);
  const content = await readTextIfExists(root, relative);
  if (content === null) fail('WORK_NOT_FOUND', `工作 ${id} 不存在；请先执行 start。`);
  return parseWork(content, id, relative);
}

function renderConfirmations(values: FlowConfirmation[]): string {
  if (!values.length) return '';
  return values.map(value => [
    `### ${value.gate}`,
    `- 用户原话：${normalizeLine(value.quote)}`,
    `- 提交：${value.commit}`,
    `- 对象摘要：${value.subject}`,
    `- 时间：${value.at}`,
  ].join('\n')).join('\n\n');
}
function renderVerifications(values: FlowVerification[]): string {
  if (!values.length) return '';
  return values.map(value => [
    `### ${value.id}`,
    `- 条件：${value.criterion}`,
    `- 测试：${value.test}`,
    `- 命令：${value.command}`,
    `- 结果：${value.result}`,
    `- 退出码：${value.exitCode === null ? '无' : value.exitCode}`,
    `- 提交：${value.commit}`,
    `- 代码树摘要：${value.tree}`,
    `- 来源：${value.source}`,
    `- 时间：${value.at}`,
  ].join('\n')).join('\n\n');
}
function renderWork(work: Omit<FlowWork, 'content' | 'path'>, selfCheck = ''): string {
  const parts = [
    `# ${work.title}`,
    `${MARKER_PREFIX}${JSON.stringify(work.meta)}${MARKER_SUFFIX}`,
    '## 目标', work.goal,
    '## 验收条件', work.criteria.map(item => `- ${item.id}: ${normalizeLine(item.text)}`).join('\n'),
  ];
  if (work.design.trim()) parts.push('## 设计', work.design.trim());
  parts.push('## 确认', renderConfirmations(work.confirmations) || '尚无确认。');
  parts.push('## 验证', renderVerifications(work.verifications) || '尚无验证。');
  parts.push('## 自检', selfCheck.trim() || '交付前运行 check；验收后运行 accept。');
  return `${parts.join('\n\n').trimEnd()}\n`;
}
async function writeWork(root: string, id: string, before: string, after: string): Promise<void> {
  if (before === after) return;
  await applyChanges(root, [{ path: workPath(id), before, after }]);
}

function criteriaList(values: string[]): FlowCriterion[] {
  if (!values.length) fail('INVALID_FLOW_INPUT', '至少提供一个 --criterion。');
  const result: FlowCriterion[] = [];
  for (const raw of values) {
    const match = /^(AC-\d+)\s*[=:：]\s*(.+)$/u.exec(raw.trim());
    const id = match?.[1] ?? `AC-${result.length + 1}`;
    const body = normalizeLine(match?.[2] ?? raw);
    if (!body) fail('INVALID_FLOW_INPUT', '验收条件不能为空。');
    if (result.some(item => item.id === id)) fail('INVALID_FLOW_INPUT', `验收条件编号重复：${id}`);
    result.push({ id, text: body });
  }
  return result.sort((left, right) => Number(left.id.slice(3)) - Number(right.id.slice(3)));
}
function requirementsSubject(work: Pick<FlowWork, 'meta' | 'goal' | 'criteria'>): string {
  return sha(JSON.stringify({
    type: work.meta.type, size: work.meta.size, scope: work.meta.scope,
    goal: normalizeLine(work.goal), criteria: work.criteria.map(item => [item.id, normalizeLine(item.text)]),
  }));
}
function designSubject(work: Pick<FlowWork, 'meta' | 'goal' | 'criteria' | 'design'>): string {
  return sha(JSON.stringify({ requirements: requirementsSubject(work), design: work.design.trim() }));
}
function latestVerification(work: Pick<FlowWork, 'verifications'>, criterion: string): FlowVerification | undefined {
  return [...work.verifications].reverse().find(item => item.criterion === criterion);
}
function deliverySubject(work: FlowWork, commit: string): string {
  return sha(JSON.stringify({
    requirements: requirementsSubject(work), design: work.design.trim() ? designSubject(work) : null,
    commit, criteria: work.criteria.map(item => {
      const run = latestVerification(work, item.id);
      return [item.id, run ? { test: run.test, command: run.command, result: run.result, tree: run.tree } : null];
    }),
  }));
}
function expectedSubject(work: FlowWork, gate: FlowGate, commit: string): string {
  if (gate === 'requirements') return requirementsSubject(work);
  if (gate === 'design') return designSubject(work);
  return deliverySubject(work, commit);
}

export async function startFlow(rootInput: string, idInput: string, input: FlowStartInput) {
  const root = path.resolve(rootInput); validateWorkId(idInput);
  const title = safeInput(text(input.title, '标题', 200), '标题');
  const goal = safeInput(text(input.goal, '目标'), '目标');
  const type = flowType(input.type); const size = flowSize(input.size);
  const scope = scopeValues(input.targets);
  const criteria = criteriaList(input.criteria).map(item => ({ ...item, text: safeInput(item.text, `${item.id} 验收条件`) }));
  const relative = workPath(idInput);
  return withProjectLock(root, async () => {
    await readProjectMetadata(root);
    if (await readTextIfExists(root, relative) !== null) fail('WORK_EXISTS', `工作 ${idInput} 已存在，不能覆盖。`);
    const base = (await head(root)) ?? 'no-git';
    const preExisting: Record<string, string> = {};
    for (const changed of (await changedFiles(root, base)) ?? []) {
      if (excludedPath(changed, idInput) || changed.startsWith('.tiller/work/')) continue;
      try { preExisting[changed] = sha(await readFile(path.join(root, changed), 'utf8')); }
      catch { /* Deleted pre-existing paths cannot be compared later. */ }
    }
    const created = new Date().toISOString();
    const work = { meta: { version: 1 as const, id: idInput, type, size, created, base, scope, preExisting }, title, goal, design: '', criteria, confirmations: [], verifications: [] };
    const content = renderWork(work);
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await applyChanges(root, [{ path: relative, before: null, after: content }]);
    return { id: idInput, path: relative, type, size, base, scope, criteria, next: `确认需求：tiller confirm ${idInput} requirements --quote "<用户原话>"` };
  });
}

export async function resumeFlow(rootInput: string, id?: string) {
  const root = path.resolve(rootInput); await readProjectMetadata(root);
  if (id) {
    const work = await readWork(root, id);
    return { id, title: work.title, type: work.meta.type, size: work.meta.size, scope: work.meta.scope,
      path: work.path, criteria: work.criteria, confirmations: work.confirmations, verifications: work.verifications };
  }
  const directory = path.join(root, '.tiller/work');
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { works: [] }; throw error; }
  const works = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    try {
      const content = await readTextIfExists(root, workPath(entry.name));
      if (content?.includes(MARKER_PREFIX)) {
        const work = parseWork(content, entry.name, workPath(entry.name));
        works.push({ id: entry.name, title: work.title, type: work.meta.type, size: work.meta.size, path: work.path,
          confirmed: work.confirmations.length, verified: work.verifications.length });
      }
    } catch { /* Other work formats are outside the default flow index. */ }
  }
  return { works };
}

export async function confirmFlow(rootInput: string, id: string, gateInput: string, quoteInput: string, commitInput?: string) {
  const root = path.resolve(rootInput);
  return withProjectLock(root, async () => {
    const work = await readWork(root, id);
    if (!CONFIRMATION_GATES.includes(gateInput as FlowGate)) fail('INVALID_CONFIRMATION_GATE', `确认节点必须是：${CONFIRMATION_GATES.join(', ')}。`);
    const gate = gateInput as FlowGate; const quote = safeInput(text(quoteInput, '用户原话', 4000), '用户原话');
    if (gate === 'requirements' && !work.criteria.length) fail('MISSING_REQUIREMENTS', '没有可确认的验收条件。');
    if (gate === 'design') {
      const requirements = [...work.confirmations].reverse().find(item => item.gate === 'requirements');
      if (!requirements || requirements.subject !== requirementsSubject(work)) fail('MISSING_REQUIREMENTS', '确认设计前需要当前有效的需求确认。');
    }
    if (gate === 'design') {
      if (!work.design.trim()) fail('MISSING_DESIGN', '工作记录没有“## 设计”正文，不能确认设计。');
      const safety = recordSafety(work.design);
      if (safety.length) fail('UNSAFE_RECORD', `设计正文${safety.join('；')}`);
    }
    if (gate === 'acceptance') {
      const checked = await inspectFlow(root, id);
      if (!checked.ready) fail('NOT_READY', `技术自检未通过：${checked.issues.join('；')}`);
    }
    const commit = await currentCommit(root, commitInput);
    const subject = expectedSubject(work, gate, commit);
    const confirmation: FlowConfirmation = { gate, quote: normalizeLine(quote), commit, subject, at: new Date().toISOString() };
    const next = { ...work, confirmations: [...work.confirmations.filter(item => item.gate !== gate), confirmation] };
    const { content: _content, path: _path, ...body } = next;
    await writeWork(root, id, work.content, renderWork(body, sectionBody(work.content, '自检')));
    return { id, gate, confirmed: true, quote: confirmation.quote, commit, subject, path: work.path };
  });
}

function testReference(value: string): string {
  const normalized = value.trim();
  const pathPart = normalized.split('::')[0]!.split('#')[0]!;
  if (!pathPart || path.isAbsolute(pathPart) || pathPart.includes('\\')) fail('INVALID_TEST_REFERENCE', '测试引用必须是工程相对文件路径，可用 :: 或 # 附加用例名。');
  validateRelativePath(pathPart);
  return normalized;
}
async function testExists(root: string, value: string): Promise<boolean> {
  const relative = value.split('::')[0]!.split('#')[0]!;
  try { const stat = await lstat(path.join(root, relative)); return stat.isFile(); }
  catch { return false; }
}

function referencePath(value: string): string | null {
  const relative = value.trim().split('::')[0]!.split('#')[0]!;
  if (!relative || path.isAbsolute(relative) || relative.includes('\\')) return null;
  try { validateRelativePath(relative); } catch { return null; }
  return relative;
}
function fallbackTestReference(value: string): { path: string; name?: string } | null {
  const normalized = value.trim();
  const separator = normalized.includes('::') ? '::' : normalized.includes('#') ? '#' : null;
  const [pathPart, ...rest] = normalized.split(separator ?? '\0');
  const relative = referencePath(pathPart ?? '');
  if (!relative) return null;
  const name = rest.join(separator ?? '').trim();
  if (separator && !name) return null;
  return { path: relative, ...(name ? { name } : {}) };
}
function sameTestReference(left: string, right: string): boolean {
  const a = fallbackTestReference(left); const b = fallbackTestReference(right);
  if (!a || !b || a.path !== b.path) return false;
  return !a.name || !b.name || a.name === b.name;
}
function caseText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) return null;
  return value.trim();
}
function caseReferences(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== 'string' || !referencePath(item))) return null;
  return [...new Set(value.map(item => item.trim()))];
}
async function readGlobalCases(root: string): Promise<CaseLibrary> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const cases: GlobalCase[] = [];
  const ids = new Map<string, string>();
  const fileExists = new Map<string, boolean>();
  const testContents = new Map<string, string | null>();
  let entries;
  try { entries = await readdir(path.join(root, '.tiller/cases'), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { cases, issues, warnings };
    return { cases, issues: [`无法读取全局用例目录 .tiller/cases：${(error as Error).message}`], warnings };
  }
  for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = `.tiller/cases/${entry.name}`;
    let value: unknown;
    try { value = JSON.parse(await readFile(path.join(root, relative), 'utf8')); }
    catch { issues.push(`全局用例 ${relative} 不是有效 JSON。`); continue; }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || (value as Record<string, unknown>).schemaVersion !== 1 || !Array.isArray((value as Record<string, unknown>).cases)) {
      issues.push(`全局用例 ${relative} 必须包含 schemaVersion: 1 和 cases 数组。`);
      continue;
    }
    for (const [index, raw] of ((value as { cases: unknown[] }).cases).entries()) {
      const label = `${relative} 第 ${index + 1} 个用例`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push(`${label} 格式无效。`); continue; }
      const item = raw as Record<string, unknown>;
      const id = caseText(item.id, 80);
      const title = caseText(item.title, 200);
      const requirements = caseReferences(item.requirements);
      const modules = caseReferences(item.modules);
      const source = caseReferences(item.source);
      const testRef = caseText(item.test_ref, 1000);
      if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) { issues.push(`${label} 缺少有效 id。`); continue; }
      const subject = `全局用例 ${relative} ${id}`;
      if (!title) issues.push(`${subject} 缺少有效标题。`);
      if (!requirements) issues.push(`${subject} 的 requirements 必须是非空路径数组。`);
      if (!modules) issues.push(`${subject} 的 modules 必须是非空路径数组。`);
      if (!source) issues.push(`${subject} 的 source 必须是非空路径数组。`);
      const test = testRef ? fallbackTestReference(testRef) : null;
      if (!test) issues.push(`${subject} 缺少有效 test_ref。`);
      if (ids.has(id)) issues.push(`${subject} 与 ${ids.get(id)} 的 id 重复。`);
      else ids.set(id, relative);
      for (const [field, values] of [['requirements', requirements], ['modules', modules], ['source', source]] as const) {
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
      if (title && requirements && modules && source && test) {
        cases.push({ id, title, requirements, modules, test_ref: testRef!, source });
      }
    }
  }
  return { cases, issues: [...new Set(issues)], warnings };
}

async function evaluateGlobalCases(root: string, work: FlowWork): Promise<CaseLibrary & { matched: number }> {
  const library = await readGlobalCases(root);
  let matched = 0;
  for (const criterion of work.criteria) {
    const run = latestVerification(work, criterion.id);
    if (!run) continue;
    if (library.cases.some(item => sameTestReference(run.test, item.test_ref))) matched++;
    else if (library.cases.length) library.warnings.push(`${criterion.id} 的测试引用未落在全局用例 test_ref：${run.test}`);
  }
  return { ...library, warnings: [...new Set(library.warnings)], matched };
}

function excludedPath(relative: string, id: string): boolean {
  return relative === `.tiller/work/${id}` || relative.startsWith(`.tiller/work/${id}/`)
    || relative.startsWith('.tiller/local/') || relative.startsWith('.git/') || relative.includes('/node_modules/');
}
function inScope(relative: string, scope: string[]): boolean {
  return scope.includes('.') || scope.some(root => relative === root || relative.startsWith(`${root}/`));
}
async function walkFiles(root: string, scope: string[], id: string): Promise<string[]> {
  const files = new Set<string>();
  async function visit(relative: string): Promise<void> {
    const absolute = path.join(root, relative);
    let entries;
    try { entries = await readdir(absolute, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (excludedPath(child, id)) continue;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() || entry.isSymbolicLink()) files.add(child);
    }
  }
  for (const target of scope) {
    if (target === '.') await visit('');
    else await visit(target);
  }
  return [...files].sort();
}
async function scopeFiles(root: string, scope: string[], id: string): Promise<string[]> {
  const repo = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!repo.ok) return walkFiles(root, scope, id);
  const result = await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...scope]);
  if (!result.ok) return walkFiles(root, scope, id);
  return [...new Set(result.stdout.split('\0').filter(Boolean))].filter(relative => !excludedPath(relative, id) && inScope(relative, scope)).sort();
}
export async function treeDigest(root: string, scope: string[], id: string): Promise<string> {
  const entries: [string, string][] = [];
  for (const relative of await scopeFiles(root, scope, id)) {
    try { entries.push([relative, sha(await readFile(path.join(root, relative), 'utf8'))]); }
    catch { /* A file removed during measurement is a stale observation. */ }
  }
  return sha(JSON.stringify(entries));
}

function recordSafety(content: string): string[] {
  const issues: string[] = [];
  const lines = content.split(/\r?\n/u);
  const patterns: [RegExp, string][] = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, '包含私钥'],
    [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/u, '包含疑似访问令牌'],
    [/(?:^|[\s"'`=:(])(?:\/(?:home|Users|workspace|tmp|var|private|mnt|opt|srv)\/|[A-Za-z]:\\)/u, '包含本机绝对路径'],
    [/\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'`]?[^\s"'`]{8,}/iu, '包含疑似密钥赋值'],
  ];
  for (const [index, line] of lines.entries()) for (const [pattern, message] of patterns) if (pattern.test(line)) issues.push(`第 ${index + 1} 行${message}`);
  return [...new Set(issues)];
}

async function changedFiles(root: string, base: string): Promise<string[] | null> {
  if (base === 'no-git') return null;
  const tracked = await git(root, ['diff', '--name-only', '-z', base, '--']);
  const untracked = await git(root, ['ls-files', '-z', '--others', '--exclude-standard']);
  if (!tracked.ok || !untracked.ok) return null;
  return [...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean))];
}
async function scopedWorkingChanges(root: string, scope: string[], id: string): Promise<string[] | null> {
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok) return null;
  const tracked = await git(root, ['diff', '--name-only', '-z', 'HEAD', '--']);
  const untracked = await git(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...scope]);
  if (!tracked.ok || !untracked.ok) return null;
  return [...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean))]
    .filter(relative => !excludedPath(relative, id) && !relative.startsWith('.tiller/work/') && inScope(relative, scope)).sort();
}
interface TestFindings { issues: string[]; warnings: string[] }
interface TestBlock { name: string; assertions: number }

function testBlocks(content: string): TestBlock[] {
  const assertion = /\bassert\.|\bexpect\s*\(/gu;
  const starts = [...content.matchAll(/\b(?:test|it)\s*\(\s*(['"`])(.*?)\1\s*,/gu)];
  return starts.map((match, index) => {
    const body = content.slice(match.index, starts[index + 1]?.index ?? content.length);
    return { name: match[2]!, assertions: [...body.matchAll(assertion)].length };
  });
}

async function weakensTests(root: string, base: string): Promise<TestFindings> {
  if (base === 'no-git') return { issues: [], warnings: [] };
  const issues: string[] = [];
  const warnings: string[] = [];
  let deletedFiles = 0;
  let removedCases = 0;
  const status = await git(root, ['diff', '--name-status', '-z', base, '--']);
  if (status.ok) {
    const fields = status.stdout.split('\0').filter(Boolean);
    for (let index = 0; index < fields.length; index += 2) {
      const kind = fields[index];
      const relative = fields[index + 1];
      if (kind === 'D' && relative && /(?:^|\/)test\/|\.test\.|\.spec\./u.test(relative)) deletedFiles++;
    }
  }
  if (deletedFiles) warnings.push(`删除 ${deletedFiles} 个测试文件（请确认对应功能已删除；详情见 Git diff）。`);
  const changed = await git(root, ['diff', '--name-only', '-z', base, '--']);
  if (!changed.ok) return { issues, warnings };
  const count = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;
  const skipped = /\b(?:test|it|describe)\.(?:skip|todo|only)\s*\(/gu;
  for (const relative of changed.stdout.split('\0').filter(Boolean)) {
    if (!/(?:^|\/)test\/|\.test\.|\.spec\./u.test(relative)) continue;
    const before = await git(root, ['show', `${base}:${relative}`]);
    if (!before.ok) continue;
    let after: string;
    try { after = await readFile(path.join(root, relative), 'utf8'); } catch { continue; }
    const skippedBefore = count(before.stdout, skipped);
    const skippedAfter = count(after, skipped);
    const beforeBlocks = new Map(testBlocks(before.stdout).map(block => [block.name, block.assertions]));
    const afterBlocks = new Map(testBlocks(after).map(block => [block.name, block.assertions]));
    for (const [name, assertions] of afterBlocks) {
      const previous = beforeBlocks.get(name);
      if (previous !== undefined && assertions < previous) issues.push(`弱化测试断言：${relative}::${name}`);
    }
    const removed = [...beforeBlocks.keys()].filter(name => !afterBlocks.has(name));
    removedCases += removed.length;
    if (skippedAfter > skippedBefore) issues.push(`新增跳过或独占测试：${relative}`);
  }
  if (removedCases) warnings.push(`修改的测试文件移除了 ${removedCases} 个测试用例（请确认对应功能已删除；详情见 Git diff）。`);
  return { issues: [...new Set(issues)], warnings: [...new Set(warnings)] };
}

export interface FlowCheck {
  id: string; ready: boolean; issues: string[]; warnings: string[]; criteria: { id: string; covered: boolean; test?: string; result?: string; commit?: string }[];
  confirmations: { gate: FlowGate; confirmed: boolean; quote: string; commit: string; issue?: string }[];
  acceptance: { confirmed: boolean; quote?: string; commit?: string };
  changedOutsideScope: string[]; cases: { count: number; matched: number }; selfCheck: string;
}

async function evaluateFlow(root: string, id: string, work: FlowWork): Promise<FlowCheck> {
  const issues: string[] = []; const warnings: string[] = [];
  const requirement = [...work.confirmations].reverse().find(item => item.gate === 'requirements');
  const currentTree = await treeDigest(root, work.meta.scope, id);
  const confirmationStates: FlowCheck['confirmations'] = [];
  for (const gate of ['requirements', 'design', 'acceptance'] as FlowGate[]) {
    const item = [...work.confirmations].reverse().find(entry => entry.gate === gate);
    if (!item) { confirmationStates.push({ gate, confirmed: false, quote: '', commit: '' }); continue; }
    const expected = expectedSubject(work, gate, item.commit);
    const confirmed = item.subject === expected;
    confirmationStates.push({ gate, confirmed, quote: item.quote, commit: item.commit, ...(confirmed ? {} : { issue: '确认对象已变化' }) });
  }
  if (!requirement) issues.push('缺少需求确认。');
  else if (requirement.subject !== requirementsSubject(work)) issues.push('需求确认后目标、范围或验收条件已变化，需要重新确认。');
  if (requiresDesign(work)) {
    if (!work.design.trim()) issues.push('standard 开发任务需要填写“## 设计”并确认。');
    const design = [...work.confirmations].reverse().find(item => item.gate === 'design');
    if (!design) issues.push('缺少设计确认。');
    else if (design.subject !== designSubject(work)) issues.push('设计确认后需求或设计已变化，需要重新确认。');
  }
  const criteria = await Promise.all(work.criteria.map(async item => {
    const run = latestVerification(work, item.id);
    if (!run) { issues.push(`${item.id} 尚无验证。`); return { id: item.id, covered: false }; }
    const covered = run.result === 'passed' && run.tree === currentTree && await testExists(root, run.test);
    if (run.result !== 'passed') issues.push(`${item.id} 最新验证结果为 ${run.result}。`);
    else if (run.tree !== currentTree) issues.push(`${item.id} 的验证已过期：范围内代码已变化。`);
    else if (!(await testExists(root, run.test))) issues.push(`${item.id} 的测试引用不存在：${run.test}`);
    if (run.source === 'reported') warnings.push(`${item.id} 使用外部报告结果，未由本次命令重新执行。`);
    return { id: item.id, covered, test: run.test, result: run.result, commit: run.commit };
  }));
  const cases = await evaluateGlobalCases(root, work);
  issues.push(...cases.issues);
  warnings.push(...cases.warnings);
  const changed = await changedFiles(root, work.meta.base);
  const changedOutsideScope: string[] = [];
  if (changed === null) warnings.push('未检测到可用 Git 基线，范围检查已跳过。');
  else for (const relative of changed) {
    if (excludedPath(relative, id) || relative.startsWith('.tiller/work/')) continue;
    if (work.meta.preExisting[relative] !== undefined) {
      try {
        if (sha(await readFile(path.join(root, relative), 'utf8')) === work.meta.preExisting[relative]) continue;
      } catch { /* Missing pre-existing files are reported as changes. */ }
    }
    if (!inScope(relative, work.meta.scope)) changedOutsideScope.push(relative);
  }
  if (changedOutsideScope.length) issues.push(`改动超出范围：${changedOutsideScope.join('、')}`);
  const weakened = await weakensTests(root, work.meta.base);
  issues.push(...weakened.issues);
  warnings.push(...weakened.warnings);
  const uncommitted = await scopedWorkingChanges(root, work.meta.scope, id);
  if (uncommitted === null) warnings.push('未检测到可用 Git 提交，未提交改动检查已跳过。');
  else if (uncommitted.length) issues.push(`交付范围存在未提交改动：${uncommitted.join('、')}`);
  issues.push(...recordSafety(work.content));
  const acceptance = [...work.confirmations].reverse().find(item => item.gate === 'acceptance');
  const acceptanceConfirmed = acceptance !== undefined && acceptance.subject === expectedSubject(work, 'acceptance', acceptance.commit);
  if (acceptance && !acceptanceConfirmed) warnings.push('交付验收后工作对象已变化，需要重新验收。');
  const uniqueIssues = [...new Set(issues)];
  const selfCheck = [
    `- ${uniqueIssues.includes('缺少需求确认。') || uniqueIssues.some(item => item.startsWith('需求确认后')) ? '[ ]' : '[x]'} 需求确认有效`,
    `- ${requiresDesign(work) && uniqueIssues.some(item => item.includes('设计')) ? '[ ]' : '[x]'} ${requiresDesign(work) ? '设计确认有效' : '该任务无需设计确认'}`,
    `- ${criteria.every(item => item.covered) ? '[x]' : '[ ]'} 验收条件均有当前通过的测试引用`,
    `- ${cases.issues.length ? '[ ]' : '[x]'} 全局用例引用有效`,
    `- ${changedOutsideScope.length ? '[ ]' : '[x]'} 改动未超出范围`,
    `- ${weakened.issues.length ? '[ ]' : '[x]'} 未弱化仍存在的测试`,
    `- ${recordSafety(work.content).length ? '[ ]' : '[x]'} 记录不含密钥或本机绝对路径`,
    ...(uniqueIssues.length ? ['', '阻塞项：', ...uniqueIssues.map(item => `- ${item}`)] : []),
    ...(warnings.length ? ['', '提示：', ...warnings.map(item => `- ${item}`)] : []),
  ].join('\n');
  return { id, ready: uniqueIssues.length === 0, issues: uniqueIssues, warnings, criteria, confirmations: confirmationStates,
    acceptance: { confirmed: acceptanceConfirmed, ...(acceptance ? { quote: acceptance.quote, commit: acceptance.commit } : {}) },
    changedOutsideScope, cases: { count: cases.cases.length, matched: cases.matched }, selfCheck };
}

export async function inspectFlow(rootInput: string, id: string): Promise<FlowCheck> {
  const root = path.resolve(rootInput); const work = await readWork(root, id);
  return evaluateFlow(root, id, work);
}

export async function checkFlow(rootInput: string, id: string): Promise<FlowCheck> {
  const root = path.resolve(rootInput);
  return withProjectLock(root, async () => {
    const work = await readWork(root, id);
    const checked = await evaluateFlow(root, id, work);
    const next = renderWork(work, checked.selfCheck);
    if (next !== work.content) await writeWork(root, id, work.content, next);
    return checked;
  });
}

export async function verifyFlow(rootInput: string, id: string, input: FlowVerifyInput) {
  const root = path.resolve(rootInput);
  return withProjectLock(root, async () => {
    const work = await readWork(root, id);
    if (!input.criteria?.length) fail('INVALID_FLOW_INPUT', '至少提供一个 --criterion。');
    const criteria = [...new Set(input.criteria.map(value => value.trim()))];
    for (const criterion of criteria) if (!work.criteria.some(item => item.id === criterion)) fail('UNKNOWN_CRITERION', `验收条件不存在：${criterion}`);
    const test = testReference(input.test);
    if (!(await testExists(root, test))) fail('TEST_NOT_FOUND', `测试引用不存在：${test}`);
    const command = safeInput(text(input.command, '验证命令', 4000), '验证命令');
    if (input.run !== undefined) safeInput(text(input.run, '执行命令', 4000), '执行命令');
    let result: FlowResult;
    let exitCode: number | null = null;
    let source: FlowVerification['source'] = 'reported';
    if (input.run !== undefined) {
      source = 'executed';
      const exit = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(input.run!, { cwd: root, shell: true, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } });
        const timer = setTimeout(() => { child.kill('SIGTERM'); }, 30 * 60 * 1000);
        child.stdout?.on('data', chunk => process.stderr.write(chunk));
        child.stderr?.on('data', chunk => process.stderr.write(chunk));
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('exit', code => { clearTimeout(timer); resolve(code); });
      });
      exitCode = exit;
      result = exit === 0 ? 'passed' : 'failed';
      if (input.result !== undefined && flowResult(input.result) !== result) fail('RESULT_MISMATCH', `命令结果 ${result} 与 --result 不一致。`);
    } else {
      result = flowResult(input.result ?? 'passed');
    }
    const commit = await currentCommit(root, undefined);
    const tree = await treeDigest(root, work.meta.scope, id);
    const at = new Date().toISOString();
    const entries: FlowVerification[] = criteria.map((criterion, index) => ({
      id: `run-${work.verifications.length + index + 1}`,
      criterion, test, command, result, exitCode, commit, at, tree, source,
    }));
    const next: FlowWork = { ...work, verifications: [...work.verifications, ...entries] };
    const { content: _content, path: _path, ...body } = next;
    await writeWork(root, id, work.content, renderWork(body, sectionBody(work.content, '自检')));
    return { id, result, commit, tree, entries, next: result === 'passed' ? `tiller check ${id}` : `修复后重新运行验证` };
  });
}
function flowResult(value: string): FlowResult {
  if (!RESULTS.includes(value as FlowResult)) fail('INVALID_RESULT', `验证结果必须是：${RESULTS.join(', ')}。`);
  return value as FlowResult;
}

export async function acceptFlow(rootInput: string, id: string, quoteInput: string, commitInput?: string) {
  const checked = await checkFlow(rootInput, id);
  if (!checked.ready) fail('NOT_READY', `技术自检未通过：${checked.issues.join('；')}`);
  return confirmFlow(rootInput, id, 'acceptance', quoteInput, commitInput);
}
