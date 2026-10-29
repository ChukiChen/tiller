import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  casesForTest, fallbackTestReference, parseCaseMarkdown, readCaseLibrary,
  regressionWarnings, sameTestReference, testBlocks,
  type CaseLibrary, type GlobalCase,
} from './cases.js';
import { cleanupTaskBranches } from './branch-cleanup.js';
import { resolveConfirmer } from './confirmer.js';
import { branchNameWarning, currentBranch, normalizeBranchSlug } from './branch-conventions.js';
import { commitMessageWarnings } from './commit-conventions.js';
import { readProjectMetadata } from './core.js';
import {
  applyChanges, assertSafePath, inspectSafePaths, readTextIfExists, validateRelativePath, withProjectLock,
  type ResolvedInputPath,
} from './files.js';
import { assertInitBaselineReady, isInitBaselineId, proveInitBaselineMerged } from './init-baseline.js';
import { planItemForAttachment, readPlanItem } from './plans.js';
import { findMergedIntegration, platformToken, resolvePlatformRepository } from './platform-api.js';
import { releaseChecklist, type ReleaseChecklist } from './release.js';
import { taskIdWarnings, validateTaskId } from './task-id.js';
import { resolveProjectRoot, resolveTaskCheckout } from './project-root.js';
import {
  cleanupTaskWorktrees, createTaskWorktrees, managementWorktreePath, rollbackTaskWorktrees,
  syncTaskRecordsToWorktrees, taskBranchName, taskLocalRoot, taskWorktreePaths, writeTaskWorktreeState,
} from './task-worktrees.js';
import {
  namePattern, platformProcessInvocation, resolveVerifyTarget, runnerFor, type TestEvidence, type TestReference,
} from './test-output.js';
import type { ProjectMetadata } from './types.js';

const execFileAsync = promisify(execFile);
const MARKER_PREFIX = '<!-- tiller-task:v1 ';
const MARKER_SUFFIX = ' -->';
const FLOW_VERSION = 1;
const DEFAULT_TYPE = 'feature';
const TYPES = ['requirements', 'analysis', 'research', 'feature', 'bugfix', 'improvement', 'review', 'validation', 'documentation', 'migration', 'operations'] as const;
const CODE_TYPES = new Set(['feature', 'bugfix', 'improvement', 'migration', 'operations']);
const CONFIRMATION_GATES = ['requirements', 'design', 'acceptance'] as const;
const CONFIRMATION_OBJECTS: Record<FlowGate, string> = {
  requirements: '需求正文（目标、范围与验收条件）',
  design: '设计正文',
  acceptance: '当前交付（需求、设计、验证与提交）',
};
const CONFIRMATION_LABELS: Record<FlowGate, string> = {
  requirements: '需求',
  design: '设计',
  acceptance: '交付验收',
};
const RESULTS = ['passed', 'failed', 'skipped'] as const;
const FLOW_STAGES = ['已开始', '需求已确认', '设计已确认', '已验证', '已验收', '已关闭', '已放弃'] as const;
const TASK_DIRECTORY = '.tiller/task';
const TASK_FILE = 'task.md';
// Historical task text stays readable; retired launcher/runtime, confirmation and verification sidecars are not parsed.
const HISTORICAL_TASK_DIRECTORY = '.tiller/work';
const STABLE_REQUIREMENT_PREFIX = '.tiller/specs/';

export type FlowType = typeof TYPES[number];
export type FlowSize = 'small' | 'standard';
export type FlowGate = typeof CONFIRMATION_GATES[number];
export type FlowResult = typeof RESULTS[number];
export type FlowStage = typeof FLOW_STAGES[number];
export type FlowCloseStatus = 'closed' | 'abandoned';

export interface FlowMeta {
  version: 1; id: string; type: FlowType; size: FlowSize; created: string; base: string; scope: string[]; preExisting: Record<string, string>;
  format?: 'structured';
  plan?: string; item?: string; slug?: string; summary?: string; requirementFile?: string;
}
export interface FlowCriterion { id: string; text: string }
export interface FlowConfirmation {
  gate: FlowGate; object: string; quote: string; by?: string; commit: string; subject: string; at: string;
}
export interface FlowVerification {
  id: string; criterion: string; test: string; command: string; result: FlowResult;
  cases: string[]; exitCode: number | null; commit: string; at: string; tree: string; source: 'executed' | 'reported';
  evidence: 'verified' | 'unverified' | 'not-run'; reason?: string; expectFail?: boolean; baseline?: string;
  log?: string;
}
export interface FlowClosure {
  action: 'close' | 'reopen'; status?: FlowCloseStatus; reason: string; at: string;
}
export interface FlowReviewFinding {
  id: string; text: string; blocking: boolean; resolved: boolean; by: string; at: string;
  resolvedBy?: string; resolvedAt?: string;
}
export interface FlowReview { by: string; at: string; findings: FlowReviewFinding[] }
export interface FlowTask {
  meta: FlowMeta; title: string; requirement: string; design: string; criteria: FlowCriterion[];
  confirmations: FlowConfirmation[]; verifications: FlowVerification[]; closures: FlowClosure[];
  review: FlowReview | null; content: string; path: string; preExistingIssue?: string;
}
export interface TaskStage { stage: FlowStage; reason: string }

export interface FlowStartInput {
  title: string; requirement?: string; requirementFile?: string; type?: string; size?: string; targets?: string[];
  criteria: string[]; plan?: string; item?: string; slug?: string; summary?: string; skipInitGate?: boolean;
}
export interface FlowVerifyInput {
  criteria?: string[]; test?: string; case?: string; command?: string; result?: string;
  reported?: boolean; reason?: string; expectFail?: boolean; verbose?: boolean;
  clearPremature?: boolean;
}
export interface FlowConfirmInput { quote?: string; commit?: string; by?: string; allowReported?: boolean }
export interface FlowCheckOptions { allowReported?: boolean; ignoreAcceptance?: boolean }
export interface FlowReviewInput { findings?: string[]; blocking?: string[]; resolve?: string[]; by?: string }

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
function taskPath(id: string): string { return `${TASK_DIRECTORY}/${id}/${TASK_FILE}`; }
function scopeValues(values: string[] | undefined, size?: FlowSize): string[] {
  if (size === 'standard' && !values?.length) {
    fail('MISSING_FLOW_SCOPE', 'standard 任务必须用至少一个 --target 声明交付范围；small 任务可省略并默认整个仓库。');
  }
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
function requiresDesign(task: Pick<FlowTask, 'meta'>): boolean { return codeType(task.meta) && task.meta.size === 'standard'; }

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
async function gitBytes(root: string, args: string[]): Promise<{ ok: boolean; stdout: Buffer; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    }) as unknown as { stdout: Buffer; stderr: Buffer };
    return { ok: true, stdout: result.stdout, stderr: result.stderr.toString('utf8') };
  } catch (error) {
    const item = error as { stdout?: Buffer; stderr?: Buffer };
    return {
      ok: false,
      stdout: item.stdout ?? Buffer.alloc(0),
      stderr: item.stderr?.toString('utf8') ?? (error as Error).message,
    };
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
  try { raw = JSON.parse(marker); } catch { fail('INVALID_FLOW_TASK', '任务元信息不是有效 JSON。'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('INVALID_FLOW_TASK', '任务元信息格式无效。');
  const value = raw as Record<string, unknown>;
  for (const key of ['version', 'id', 'type', 'size', 'created', 'base', 'scope']) if (!Object.hasOwn(value, key)) fail('INVALID_FLOW_TASK', `任务元信息缺少 ${key}。`);
  if (value.version !== FLOW_VERSION || value.id !== id) fail('INVALID_FLOW_TASK', '任务元信息版本或标识不匹配。');
  const type = flowType(String(value.type));
  const size = flowSize(String(value.size));
  const created = text(value.created, '创建时间', 64);
  if (!Number.isFinite(Date.parse(created))) fail('INVALID_FLOW_TASK', '任务创建时间无效。');
  const base = text(value.base, '基线提交', 64);
  if (!validCommit(base)) fail('INVALID_FLOW_TASK', '任务基线提交无效。');
  if (!Array.isArray(value.scope) || !value.scope.length || value.scope.some(item => typeof item !== 'string')) fail('INVALID_FLOW_TASK', '任务范围无效。');
  let plan: string | undefined;
  let item: string | undefined;
  if (value.plan !== undefined || value.item !== undefined) {
    if (typeof value.plan !== 'string' || typeof value.item !== 'string') fail('INVALID_FLOW_TASK', '规划归属必须同时包含 plan 和 item。');
    validateTaskId(value.plan);
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,39}$/u.test(value.item)) fail('INVALID_FLOW_TASK', '规划条目编号无效。');
    plan = value.plan; item = value.item;
  }
  let format: 'structured' | undefined;
  if (value.format !== undefined) {
    if (value.format !== 'structured') fail('INVALID_FLOW_TASK', '任务记录格式标记无效。');
    format = 'structured';
  }
  let slug: string | undefined;
  if (value.slug !== undefined) {
    if (typeof value.slug !== 'string' || !normalizeBranchSlug(value.slug)) fail('INVALID_FLOW_TASK', '任务英文标识无效。');
    slug = normalizeBranchSlug(value.slug)!;
  }
  let summary: string | undefined;
  if (value.summary !== undefined) summary = text(value.summary, '任务摘要', 200);
  let requirementFile: string | undefined;
  if (value.requirementFile !== undefined) {
    if (typeof value.requirementFile !== 'string') fail('INVALID_FLOW_TASK', '需求文件路径无效。');
    validateRelativePath(value.requirementFile);
    requirementFile = value.requirementFile;
  }
  return { version: 1, id, type, size, created, base, scope: scopeValues(value.scope as string[]), preExisting: {},
    ...(format ? { format } : {}),
    ...(plan && item ? { plan, item } : {}),
    ...(slug ? { slug } : {}),
    ...(summary ? { summary } : {}),
    ...(requirementFile ? { requirementFile } : {}) };
}

function preExistingPath(id: string): string {
  return `${taskLocalRoot(id)}/pre-existing.json`;
}

function preExistingValues(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  for (const [relative, digest] of Object.entries(value as Record<string, unknown>)) {
    try { validateRelativePath(relative); }
    catch { return null; }
    if (typeof digest !== 'string' || !/^[a-f0-9]{40,64}$/u.test(digest)) return null;
    result[relative] = digest;
  }
  return result;
}

async function readPreExisting(root: string, id: string): Promise<{ values: Record<string, string>; issue?: string }> {
  for (const relative of [preExistingPath(id)]) {
    let content: string;
    try {
      const resolved = (await inspectSafePaths(root, [relative]))[0]!;
      if (resolved.stat === null) continue;
      if (!resolved.stat.isFile()) return { values: {}, issue: `开工前改动旁路不是普通文件，已按空摘要继续：\`${relative}\`。` };
      content = await readFile(resolved.target, 'utf8');
    } catch { return { values: {}, issue: `开工前改动旁路不可读，已按空摘要继续：\`${relative}\`。` }; }
    let raw: unknown;
    try { raw = JSON.parse(content); }
    catch { return { values: {}, issue: `开工前改动旁路不是有效 JSON，已按空摘要继续：\`${relative}\`。` }; }
    const values = preExistingValues(raw);
    return values === null
      ? { values: {}, issue: `开工前改动旁路格式无效，已按空摘要继续：\`${relative}\`。` }
      : { values };
  }
  return { values: {} };
}

async function writePreExisting(root: string, id: string, values: Record<string, string>): Promise<void> {
  if (!Object.keys(values).length) return;
  const relative = preExistingPath(id);
  const after = `${JSON.stringify(values, null, 2)}\n`;
  const before = await readTextIfExists(root, relative);
  if (before === after) return;
  const resolved = (await inspectSafePaths(root, [relative]))[0]!;
  await mkdir(path.dirname(resolved.target), { recursive: true });
  const target = (await inspectSafePaths(root, [relative]))[0]!;
  if (target.stat !== null && !target.stat.isFile()) throw new Error(`开工前改动旁路不是普通文件：${relative}`);
  await writeFile(target.target, after, 'utf8');
}
function sectionBody(content: string, title: string): string {
  const match = new RegExp(`^## ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const next = /^##\s+/mu.exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}
function subSectionBody(content: string, title: string): string {
  const match = new RegExp(`^### ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = /^#{1,3}\s+/mu.exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}
const HISTORICAL_ACCEPTANCE_HEADING = ['验收条件', '（稳定）'].join('');
function criteriaFromBody(body: string): FlowCriterion[] {
  const result: FlowCriterion[] = [];
  for (const line of body.split(/\r?\n/u)) {
    const match = /^-\s+(AC-\d+)[:：]\s*(.+)$/u.exec(line.trim());
    if (match) result.push({ id: match[1]!, text: match[2]!.trim() });
  }
  return result;
}
function parseCriteria(content: string, requirement = sectionBody(content, '需求')): FlowCriterion[] {
  const nested = criteriaFromBody(subSectionBody(requirement, '验收条件'));
  if (nested.length) return nested;
  const nestedHistorical = criteriaFromBody(subSectionBody(requirement, HISTORICAL_ACCEPTANCE_HEADING));
  if (nestedHistorical.length) return nestedHistorical;
  const topLevel = criteriaFromBody(sectionBody(content, '验收条件'));
  return topLevel.length ? topLevel : criteriaFromBody(sectionBody(content, HISTORICAL_ACCEPTANCE_HEADING));
}

const SPEC_REFERENCE_PATTERN = /\.tiller\/specs\/[A-Za-z0-9._/-]*?\.md\b/gu;
const SPEC_REFERENCE_LINE = /(?:需求来源|需求引用|引用\s*specs|specs\s*引用)\s*[:：]?/u;

function referencedSpecPaths(task: Pick<FlowTask, 'meta' | 'requirement' | 'design'>): string[] {
  const paths = new Set<string>();
  const add = (value: string): void => {
    const normalized = value.replace(/\\/gu, '/').replace(/^\.\/+/u, '');
    if (normalized.startsWith(STABLE_REQUIREMENT_PREFIX) && normalized.endsWith('.md')) paths.add(normalized);
  };
  if (task.meta.requirementFile) add(task.meta.requirementFile);
  for (const line of `${task.requirement}\n${task.design}`.split(/\r?\n/u)) {
    if (!SPEC_REFERENCE_LINE.test(line)) continue;
    for (const match of line.matchAll(SPEC_REFERENCE_PATTERN)) add(match[0]);
  }
  return [...paths].sort();
}

function specCriteria(content: string): FlowCriterion[] {
  const result: FlowCriterion[] = [];
  for (const line of content.split(/\r?\n/u)) {
    const match = /^[-*]\s+(AC-\d+)\s*[:：]\s*(.+)$/u.exec(line.trim());
    if (match) result.push({ id: match[1]!, text: match[2]!.trim() });
  }
  return result;
}

function preview(value: string, maximum = 80): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
}

/**
 * A task that cites stable specs may only mount acceptance points that exist in
 * those specs. This is deliberately mechanical: path + AC-n text, no semantic
 * guessing. New semantics must be written back to the cited specs first.
 */
async function specMountIssues(root: string, task: FlowTask): Promise<string[]> {
  const references = referencedSpecPaths(task);
  if (!references.length) return [];
  const known = new Map<string, { path: string; text: string }[]>();
  const issues: string[] = [];
  for (const relative of references) {
    const content = await readTextIfExists(root, relative);
    if (content === null) {
      issues.push(`引用的 specs 不存在：\`${relative}\``);
      continue;
    }
    for (const criterion of specCriteria(content)) {
      const entries = known.get(criterion.id) ?? [];
      entries.push({ path: relative, text: criterion.text });
      known.set(criterion.id, entries);
    }
  }
  for (const criterion of task.criteria) {
    const mounted = known.get(criterion.id);
    if (!mounted?.length) {
      issues.push(`任务验收点 \`${criterion.id}\` 未挂载到引用 specs`);
      continue;
    }
    const text = normalizeLine(criterion.text);
    if (!mounted.some(item => normalizeLine(item.text) === text)) {
      const located = mounted.map(item => `${item.path}“${preview(normalizeLine(item.text))}”`).join('；');
      issues.push(`任务验收点 \`${criterion.id}\` 正文与 specs 不一致：任务“${preview(text)}”；specs ${located}`);
    }
  }
  for (const id of new Set([...task.design.matchAll(/\bAC-\d+\b/gu)].map(match => match[0]))) {
    if (!known.has(id)) issues.push(`设计引用不存在的 specs 验收点 \`${id}\``);
  }
  return [...new Set(issues)];
}

function specOverflowMessage(issues: string[], references: string[]): string {
  const targets = references.length
    ? references.map(relative => `\`${relative}\``).join('、')
    : '`.tiller/specs/`';
  return `规格溢出：${issues.join('；')}。请先把新增或变更的行为与 AC-n 回写 ${targets}（必要时同步 \`.tiller/cases/\` 与 \`.tiller/rules/\`），提交后由确认人重新确认 requirements/design，再继续 check/accept；不要在 task.md 保留无法挂载的验收点。`;
}
function parseConfirmationSidecar(line: string): FlowConfirmation | null {
  const match = /^<!--\s*tiller-confirm:v1\s+(\{.*\})\s*-->$/u.exec(line);
  if (!match) return null;
  let raw: unknown;
  try { raw = JSON.parse(match[1]!); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const gate = record.gate;
  const object = record.object;
  const quote = record.quote;
  const by = record.by;
  const commit = record.commit;
  const subject = record.subject;
  const at = record.at;
  if (typeof gate !== 'string' || !CONFIRMATION_GATES.includes(gate as FlowGate)
    || typeof object !== 'string' || typeof quote !== 'string' || typeof by !== 'string'
    || typeof commit !== 'string' || !validCommit(commit)
    || typeof subject !== 'string' || !/^[a-f0-9]{64}$/u.test(subject)
    || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  if (object !== CONFIRMATION_OBJECTS[gate as FlowGate] || !normalizeLine(by)) return null;
  return { gate: gate as FlowGate, object, quote: normalizeLine(quote), by: normalizeLine(by), commit, subject, at };
}
function parseConfirmations(content: string): FlowConfirmation[] {
  const body = sectionBody(content, '确认');
  const markers = body.split(/\r?\n/u).map(line => line.trim()).filter(line => line.startsWith('<!-- tiller-confirm:v1 '));
  if (markers.length) {
    const parsed = markers.map(parseConfirmationSidecar);
    if (parsed.every((item): item is FlowConfirmation => item !== null)) return parsed;
  }
  return [];
}
interface VerificationSidecar {
  command: string; exitCode: number | null; tree: string; commit: string;
}
function parseVerificationSidecar(lines: string[]): VerificationSidecar | null {
  const line = lines.map(value => value.trim()).find(value => value.startsWith('<!-- tiller-verify:v1 '));
  if (!line) return null;
  const match = /^<!--\s*tiller-verify:v1\s+(\{.*\})\s*-->$/u.exec(line);
  if (!match) return null;
  let raw: unknown;
  try { raw = JSON.parse(match[1]!); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const command = record.command;
  const exitCode = record.exitCode;
  const tree = record.tree;
  const commit = record.commit;
  if (typeof command !== 'string' || !command.trim() || command.length > 4000
    || !(exitCode === null || Number.isInteger(exitCode))
    || typeof tree !== 'string' || !/^[a-f0-9]{64}$/u.test(tree)
    || typeof commit !== 'string' || !validCommit(commit)) return null;
  return { command, exitCode: exitCode as number | null, tree, commit };
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
    const sidecar = parseVerificationSidecar(lines);
    const criterion = field('条件');
    const test = field('测试');
    const caseText = field('用例');
    const cases = caseText && caseText !== '无' ? caseText.split(/[,，\s]+/u).filter(Boolean) : [];
    const resultValue = field('结果') as FlowResult;
    const at = field('时间');
    const source = field('来源') as FlowVerification['source'];
    const evidenceText = field('核实');
    const evidence: FlowVerification['evidence'] = evidenceText === '已核实' ? 'verified'
      : evidenceText === '未执行' ? 'not-run' : 'unverified';
    const reason = field('理由');
    const expectFail = field('预期') === '失败先行';
    const baseline = field('基线提交');
    const log = field('日志');
    if (sidecar && criterion && test && RESULTS.includes(resultValue)
      && Number.isFinite(Date.parse(at)) && (source === 'executed' || source === 'reported')) {
      result.push({ id, criterion, test, command: sidecar.command, result: resultValue, cases,
        exitCode: sidecar.exitCode, commit: sidecar.commit, at, tree: sidecar.tree, source, evidence,
        ...(reason ? { reason } : {}), ...(expectFail ? { expectFail } : {}),
        ...(baseline && validCommit(baseline) ? { baseline } : {}), ...(log ? { log } : {}) });
    }
  }
  return result;
}
function parseClosures(content: string): FlowClosure[] {
  const body = sectionBody(content, '关闭');
  if (!body) return [];
  const result: FlowClosure[] = [];
  for (const chunk of body.split(/^###\s+/mu).slice(1)) {
    const lines = chunk.split(/\r?\n/u);
    const action = lines.shift()?.trim();
    if (action !== 'close' && action !== 'reopen') continue;
    const field = (name: string) => {
      const prefix = `- ${name}：`;
      return lines.find(line => line.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
    };
    const reason = field('原因');
    const at = field('时间');
    const statusText = field('状态');
    const status = statusText === '已关闭' ? 'closed' : statusText === '已放弃' ? 'abandoned' : undefined;
    if (!reason || !Number.isFinite(Date.parse(at)) || (action === 'close' && !status)) continue;
    result.push({ action, ...(action === 'close' && status ? { status } : {}), reason, at });
  }
  return result;
}
function parseReview(content: string): FlowReview | null {
  const body = sectionBody(content, '评审');
  if (!body) return null;
  let by = '';
  let at = '';
  const findings: FlowReviewFinding[] = [];
  for (const chunk of body.split(/^###\s+/mu).slice(1)) {
    const lines = chunk.split(/\r?\n/u);
    const heading = lines.shift()?.trim() ?? '';
    const field = (name: string): string => {
      const prefix = `- ${name}：`;
      return lines.find(line => line.startsWith(prefix))?.slice(prefix.length).trim() ?? '';
    };
    if (heading === 'checklist') {
      const reviewer = field('评审人');
      const recordedAt = field('时间');
      if (reviewer && Number.isFinite(Date.parse(recordedAt))) { by = reviewer; at = recordedAt; }
      continue;
    }
    if (!/^REV-\d+$/u.test(heading)) continue;
    const textValue = field('发现');
    const blocking = field('阻塞') === '是';
    const resolved = field('状态') === '已解决';
    const findingBy = field('记录人');
    const findingAt = field('时间');
    if (!textValue || !findingBy || !Number.isFinite(Date.parse(findingAt))) continue;
    const resolvedBy = field('解决人');
    const resolvedAt = field('解决时间');
    findings.push({ id: heading, text: textValue, blocking, resolved, by: findingBy, at: findingAt,
      ...(resolvedBy && Number.isFinite(Date.parse(resolvedAt)) ? { resolvedBy, resolvedAt } : {}) });
  }
  return by && at ? { by, at, findings } : findings.length ? { by: '未记录', at: findings[0]!.at, findings } : null;
}
function parseTask(content: string, id: string, relative: string): FlowTask {
  const marker = new RegExp(`${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(\\{.*\\})${MARKER_SUFFIX.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u').exec(content);
  if (!marker) fail('FLOW_TASK_NOT_FOUND', `任务 ${id} 不是当前轻量记录。`);
  const title = /^#\s+(.+)$/mu.exec(content)?.[1]?.trim();
  if (!title) fail('INVALID_FLOW_TASK', '任务记录缺少标题。');
  const requirement = sectionBody(content, '需求');
  if (!requirement) fail('INVALID_FLOW_TASK', '任务记录缺少“## 需求”正文。');
  const meta = parseMeta(marker[1]!, id);
  return {
    meta, title, requirement, design: sectionBody(content, '设计'),
    criteria: parseCriteria(content, requirement), confirmations: parseConfirmations(content),
    verifications: parseVerifications(content), closures: parseClosures(content), review: parseReview(content), content, path: relative,
  };
}
export async function readTask(root: string, id: string): Promise<FlowTask> {
  validateTaskId(id);
  const { primary, taskRoot } = await resolveTaskCheckout(root, id);
  await readProjectMetadata(taskRoot);
  const relative = taskPath(id);
  const content = await readTextIfExists(taskRoot, relative);
  if (content === null) fail('TASK_NOT_FOUND', `任务 ${id} 不存在；请先执行 start。`);
  const task = parseTask(content, id, relative);
  // Sidecars live under primary `.tiller/local/<id>/`, not inside the worktree checkout.
  const sidecar = await readPreExisting(primary, id);
  task.meta = { ...task.meta, preExisting: { ...task.meta.preExisting, ...sidecar.values } };
  if (sidecar.issue) task.preExistingIssue = sidecar.issue;
  return task;
}

function markdownCell(value: string): string {
  return normalizeLine(value).replaceAll('|', '\\|') || '—';
}
function renderConfirmations(values: FlowConfirmation[]): string {
  if (!values.length) return '';
  const rows = values.map(value => {
    const shortCommit = value.commit === 'no-git' ? value.commit : value.commit.slice(0, 12);
    return `| ${CONFIRMATION_LABELS[value.gate]} | ${markdownCell(value.by ?? '')} | ${markdownCell(value.at)} | ${markdownCell(shortCommit)} | ${markdownCell(value.quote)} |`;
  });
  const sidecars = values.map(value => {
    const sidecar = JSON.stringify({
      gate: value.gate, object: value.object, subject: value.subject, commit: value.commit,
      by: normalizeLine(value.by ?? ''), quote: normalizeLine(value.quote), at: value.at,
    }).replaceAll('--', '\\u002d\\u002d');
    return `<!-- tiller-confirm:v1 ${sidecar} -->`;
  });
  return ['| 部分 | 确认人 | 时间 | 短提交 | 原话 |', '| --- | --- | --- | --- | --- |', ...rows, '', ...sidecars].join('\n');
}
function renderVerifications(values: FlowVerification[]): string {
  if (!values.length) return '';
  return values.map(value => {
    const sidecar = JSON.stringify({
      command: value.command, exitCode: value.exitCode, tree: value.tree, commit: value.commit,
    }).replaceAll('--', '\\u002d\\u002d');
    return [
      `### ${value.id}`,
      `<!-- tiller-verify:v1 ${sidecar} -->`,
      `- 条件：${value.criterion}`,
      `- 测试：${value.test}`,
      `- 用例：${value.cases.length ? value.cases.join(', ') : '无'}`,
      `- 结果：${value.result}`,
      `- 来源：${value.source}`,
      `- 核实：${value.evidence === 'verified' ? '已核实' : value.evidence === 'not-run' ? '未执行' : '未核实'}`,
      ...(value.reason ? [`- 理由：${value.reason}`] : []),
      ...(value.expectFail ? [`- 预期：失败先行`, ...(value.baseline ? [`- 基线提交：${value.baseline}`] : [])] : []),
      ...(value.log ? [`- 日志：${value.log}`] : []),
      `- 提交：${value.commit === 'no-git' ? value.commit : value.commit.slice(0, 12)}`,
      `- 时间：${value.at}`,
    ].join('\n');
  }).join('\n\n');
}
function renderClosures(values: FlowClosure[]): string {
  return values.map(value => [
    `### ${value.action}`,
    ...(value.action === 'close' ? [`- 状态：${value.status === 'abandoned' ? '已放弃' : '已关闭'}`] : []),
    `- 原因：${normalizeLine(value.reason)}`,
    `- 时间：${value.at}`,
  ].join('\n')).join('\n\n');
}
function renderReview(review: FlowReview): string {
  const openBlockers = review.findings.filter(item => item.blocking && !item.resolved).length;
  const chunks = [
    ['### checklist', `- 评审人：${normalizeLine(review.by)}`, `- 时间：${review.at}`,
      '- 检查清单：目标与范围；需求与设计；AC、用例与验证；改动范围与测试完整性；specs 回写；发布准备',
      `- 结论：${openBlockers ? `${openBlockers} 项阻塞未解决` : '无未解决阻塞项'}`].join('\n'),
  ];
  for (const finding of review.findings) {
    chunks.push([
      `### ${finding.id}`,
      `- 状态：${finding.resolved ? '已解决' : '未解决'}`,
      `- 阻塞：${finding.blocking ? '是' : '否'}`,
      `- 发现：${normalizeLine(finding.text)}`,
      `- 记录人：${normalizeLine(finding.by)}`,
      `- 时间：${finding.at}`,
      ...(finding.resolvedBy && finding.resolvedAt
        ? [`- 解决人：${normalizeLine(finding.resolvedBy)}`, `- 解决时间：${finding.resolvedAt}`] : []),
    ].join('\n'));
  }
  return chunks.join('\n\n');
}
function renderTask(task: Omit<FlowTask, 'content' | 'path'>, selfCheck = ''): string {
  const { preExisting: _preExisting, ...serializedMeta } = task.meta;
  const parts = [`# ${task.title}`, `${MARKER_PREFIX}${JSON.stringify(serializedMeta)}${MARKER_SUFFIX}`, '## 需求', task.requirement];
  if (task.meta.format !== 'structured' || (task.criteria.length && !subSectionBody(task.requirement, '验收条件'))) {
    parts.push('## 验收条件', task.criteria.map(item => `- ${item.id}: ${normalizeLine(item.text)}`).join('\n'));
  }
  if (task.meta.plan && task.meta.item) parts.push('## 规划', `- 规划：${task.meta.plan}\n- 条目：${task.meta.item}`);
  if (task.design.trim()) parts.push('## 设计', task.design.trim());
  parts.push('## 确认', renderConfirmations(task.confirmations) || '尚无确认。');
  parts.push('## 验证', renderVerifications(task.verifications) || '尚无验证。');
  if (task.review) parts.push('## 评审', renderReview(task.review));
  if (task.closures.length) parts.push('## 关闭', renderClosures(task.closures));
  const closedSelfCheck = '任务已结束；如需复核，运行 check；继续修改前先运行 reopen。';
  parts.push('## 自检', terminalStage(task) ? closedSelfCheck : selfCheck.trim() || '交付前运行 check；验收后运行 accept。');
  return `${parts.join('\n\n').trimEnd()}\n`;
}
async function writeTask(root: string, id: string, before: string, after: string,
  preExisting?: Record<string, string>): Promise<void> {
  const primary = await resolveProjectRoot(root);
  // Sidecars stay on primary `.tiller/local/<id>/`; task.md stays on the active checkout.
  if (preExisting) await writePreExisting(primary, id, preExisting);
  const relative = taskPath(id);
  if (before !== after) await applyChanges(root, [{ path: relative, before, after }]);
  const targets = new Set(await taskWorktreePaths(primary, id));
  // Do not recreate a primary task seed when the active checkout is a worktree.
  if (path.resolve(root) === path.resolve(primary)) targets.add(primary);
  // Refresh an existing primary copy (e.g. after merge); never create a new untracked seed.
  else if (await readTextIfExists(primary, relative) !== null) targets.add(primary);
  for (const target of targets) {
    if (path.resolve(target) === path.resolve(root)) continue;
    let stat: Awaited<ReturnType<typeof lstat>>;
    try { stat = await lstat(target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const existing = await readTextIfExists(target, relative);
    if (!stat.isDirectory() || existing === null || existing === after) continue;
    const file = await assertSafePath(target, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, after, 'utf8');
  }
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
function importedCriteria(values: FlowCriterion[]): FlowCriterion[] {
  const ids = new Set<string>();
  for (const item of values) {
    const body = normalizeLine(item.text);
    if (!body) fail('INVALID_FLOW_INPUT', `需求文件中的 ${item.id} 验收条件不能为空。`);
    if (ids.has(item.id)) fail('INVALID_FLOW_INPUT', `需求文件中的验收条件编号重复：${item.id}`);
    ids.add(item.id);
  }
  return values
    .map(item => ({ ...item, text: normalizeLine(item.text) }))
    .sort((left, right) => Number(left.id.slice(3)) - Number(right.id.slice(3)));
}
const REQUIREMENT_SECTIONS = ['使用场景', '目标', '业务范围', '关键行为', '异常与边界'] as const;
type RequirementSection = typeof REQUIREMENT_SECTIONS[number];
const HISTORICAL_SCENARIO_HEADING = ['面向谁', '与问题'].join('');
interface ParsedRequirementFile {
  structured: boolean;
  preamble: string;
  sections: Map<RequirementSection, string>;
  extras: string[];
  criteria: FlowCriterion[];
}
interface RequirementHeading {
  index: number;
  end: number;
  depth: number;
  rawTitle: string;
  title: string;
}
function normalizedRequirementTitle(value: string): string {
  return value.trim().replace(/^(?:\d+(?:\.\d+)*[.)、]?)\s*/u, '').trim();
}
function shiftRequirementHeadings(body: string, sectionDepth: number): string {
  return body.replace(/^(#{1,6})(\s+)/gmu, (_match, hashes: string, space: string) => {
    const depth = hashes.length;
    const target = depth <= sectionDepth ? 3 : depth - sectionDepth + 3;
    return `${'#'.repeat(Math.max(3, Math.min(6, target)))}${space}`;
  });
}
function parseRequirementFile(content: string): ParsedRequirementFile {
  const normalized = content.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const headings: RequirementHeading[] = [...normalized.matchAll(/^(#{1,6})\s+(.+?)\s*$/gmu)].map(match => ({
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    depth: match[1]!.length,
    rawTitle: match[2]!.trim(),
    title: normalizedRequirementTitle(match[2]!),
  }));
  if (!headings.length) return { structured: false, preamble: normalized.trim(), sections: new Map(), extras: [], criteria: [] };
  const known = (heading: RequirementHeading): boolean => heading.title === '验收条件'
    || heading.title === HISTORICAL_ACCEPTANCE_HEADING
    || REQUIREMENT_SECTIONS.includes((heading.title === HISTORICAL_SCENARIO_HEADING ? '使用场景' : heading.title) as RequirementSection);
  const sectionDepth = headings.some(heading => heading.depth === 2 && known(heading))
    ? 2
    : headings.some(heading => heading.depth === 3 && known(heading)) ? 3 : 2;
  const firstSection = headings.findIndex(heading => heading.depth === sectionDepth);
  const rawPreamble = normalized.slice(0, firstSection < 0 ? 0 : headings[firstSection]!.index);
  const preamble = rawPreamble.replace(/^\s*#\s+.*(?:\n|$)/u, '').trim();
  const sections = new Map<RequirementSection, string>();
  const extras: string[] = [];
  const criteria: FlowCriterion[] = [];
  for (const [index, heading] of headings.entries()) {
    if (heading.depth !== sectionDepth) continue;
    const next = headings.slice(index + 1).find(item => item.depth <= sectionDepth);
    const body = normalized.slice(heading.end, next?.index ?? normalized.length).trim();
    const sectionTitle = heading.title === HISTORICAL_SCENARIO_HEADING ? '使用场景' : heading.title;
    if (heading.title === '验收条件' || heading.title === HISTORICAL_ACCEPTANCE_HEADING) {
      criteria.push(...criteriaFromBody(body));
      continue;
    }
    if (REQUIREMENT_SECTIONS.includes(sectionTitle as RequirementSection)) {
      const key = sectionTitle as RequirementSection;
      const shifted = shiftRequirementHeadings(body, sectionDepth);
      sections.set(key, [sections.get(key), shifted].filter(Boolean).join('\n\n'));
    } else if (body) {
      extras.push(`**${heading.rawTitle}**\n\n${shiftRequirementHeadings(body, sectionDepth)}`);
    }
  }
  return { structured: true, preamble, sections, extras, criteria };
}
function renderStructuredRequirement(goal: string, criteria: FlowCriterion[], requirementFile?: string,
  requirementContent?: string): string {
  const source = requirementFile ? [`需求来源：\`${requirementFile}\``, ''] : [];
  const parsed = requirementFile && requirementContent !== undefined ? parseRequirementFile(requirementContent) : undefined;
  const shortGoal = requirementFile === undefined ? {
    scenario: `- 场景：${goal}`,
    target: `短目标：${goal}\n\n交付结果须满足下列验收条件。\n\n<!-- 引用已有 specs，不复制规格全文。 -->`,
    scope: [
      '<!-- 业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->',
      `- 做：完成短目标“${goal}”，并满足验收条件。`,
      '- 不做：超出该短目标与验收条件的额外行为变更。',
      '- 假设与待确认：短目标已由用户提供；实现细节以设计确认或现有规格为准。',
    ].join('\n'),
    behaviors: ['<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->',
      ...criteria.map(item => `- ${item.id}：${normalizeLine(item.text)}`)].join('\n'),
    exceptions: [
      '- 输入无效、依赖或权限不可用时返回明确错误，不静默降级。',
      '- 未满足任一验收条件时不得声明完成。',
    ].join('\n'),
  } : undefined;
  const targetExtras = [...(parsed?.structured && parsed.preamble ? [parsed.preamble] : []), ...(parsed?.extras ?? [])];
  const target = parsed?.structured
    ? [parsed.sections.get('目标'), ...targetExtras].filter(Boolean).join('\n\n')
    : requirementFile && requirementContent !== undefined ? requirementContent.trim() : shortGoal?.target ?? goal;
  const section = (name: RequirementSection, fallback: string): string => parsed?.structured
    ? parsed.sections.get(name) || fallback : fallback;
  const short = (name: RequirementSection, fallback: string): string => {
    if (!shortGoal) return fallback;
    if (name === '使用场景') return shortGoal.scenario;
    if (name === '业务范围') return shortGoal.scope;
    if (name === '关键行为') return shortGoal.behaviors;
    if (name === '异常与边界') return shortGoal.exceptions;
    return fallback;
  };
  return [
    '### 使用场景', '', short('使用场景', section('使用场景', '<!-- 写主要使用场景与背景依据；不复制规格全文。 -->')), '',
    '### 目标', '', ...source, target || '<!-- 写可观察的业务结果、所实现的 `.tiller/specs/...` 稳定需求与约束；不枚举交付路径。 -->', '',
    '### 业务范围', '',
    short('业务范围', section('业务范围', [
      '<!-- 写业务做/不做/假设和防跑偏约束；交付路径只记录在任务范围，不在此枚举。 -->',
      '- 做：', '- 不做：', '- 假设与待确认：',
    ].join('\n'))), '',
    '### 关键行为', '', short('关键行为', section('关键行为', '<!-- 写用户可观察行为；不塞长命令或实现步骤。 -->')), '',
    '### 异常与边界', '', short('异常与边界', section('异常与边界', '<!-- 写失败、空值、权限、规模和兼容边界。 -->')), '',
    '### 验收条件', '', criteria.map(item => `- ${item.id}: ${normalizeLine(item.text)}`).join('\n'),
  ].join('\n').trim();
}
function emptyDesignTemplate(): string {
  return [
    '### 方案', '', '<!-- 写关键做法、接口与数据流；引用已有规格，不复制全文。 -->', '',
    '### 失败处理', '', '<!-- 写失败、回滚与恢复方式。 -->', '',
    '### 取舍', '', '<!-- 写备选方案与选择理由；没有备选时说明原因。 -->', '',
    '### 影响与风险', '', '<!-- 写受影响范围、兼容性和风险缓解。 -->', '',
    '### 验证入口', '', '<!-- 写可重跑的短测试入口；不塞长命令菜谱。 -->',
  ].join('\n');
}
const PLACEHOLDER_LINE = /^(?:todo|tbd|tba|n\/a|na|待补充|待完善|待填写|待定|占位|暂无|无|\.{3}|…)$/iu;
function markdownMeaningfulLines(value: string): string[] {
  return value.split(/\r?\n/u).flatMap(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^<!--.*-->$/u.test(line) || /^(?:---+|\*\*\*+|___+)$/u.test(line)) return [];
    const normalized = line
      .replace(/^(?:[-*+]|\d+[.)])\s+/u, '')
      .replace(/^\[[ xX]\]\s*/u, '')
      .replace(/^>\s*/u, '')
      .replace(/[*_`~]/gu, '')
      .replace(/\s+/gu, ' ')
      .replace(/[。.!！?？]+$/u, '')
      .trim();
    if (!normalized || PLACEHOLDER_LINE.test(normalized) || /^<[^<>]+>$/u.test(normalized)) return [];
    return [normalized];
  });
}
function taskDesignThinWarnings(task: FlowTask): string[] {
  const structured = task.meta.format === 'structured' || /^###\s+(?:方案|失败处理|取舍|影响与风险|验证入口)\s*$/mu.test(task.design);
  if (task.meta.size !== 'standard' || !structured) return [];
  const fields = /^###\s+(?:失败处理|验证入口)\s*$/mu.test(task.design)
    ? ['方案', '失败处理', '取舍', '影响与风险', '验证入口'] as const
    : ['方案', '取舍', '影响与风险'] as const;
  return fields
    .filter(field => markdownMeaningfulLines(subSectionBody(task.design, field)).length === 0)
    .map(field => `任务设计“${field}”仅空白或占位：\`${task.path}\`。`);
}

function businessScopeDeliveryPathWarnings(task: FlowTask): string[] {
  const body = subSectionBody(task.requirement, '业务范围');
  if (!body) return [];
  const paths = new Set<string>();
  let inDo = false;
  for (const raw of body.split(/\r?\n/u)) {
    const line = raw.trim();
    if (/^[-*+]\s*做\s*[:：]/u.test(line)) inDo = true;
    else if (/^[-*+]\s*(?:不做|假设与待确认)\s*[:：]/u.test(line)) { inDo = false; continue; }
    if (!inDo) continue;
    const content = line.replace(/^[-*+]\s*/u, '');
    const matcher = /(?:^|[\s`（(、，,：:])((?:\.tiller|src|test|resources|scripts)\/[^\s`，。；;、）)]+|(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.<>-]+\.(?:ts|mjs|cjs|js|md|json|ya?ml))/gu;
    for (const match of content.matchAll(matcher)) paths.add(match[1]!.replace(/[),.;:]+$/u, ''));
  }
  return [...paths].map(relative =>
    `需求“业务范围·做”包含交付路径 \`${relative}\`；业务范围应写约束，交付路径请只记录在任务范围（--target）：\`${task.path}\`。`);
}
async function decisionsThinWarning(root: string): Promise<string | null> {
  const relative = '.tiller/specs/decisions.md';
  const content = await readTextIfExists(root, relative);
  if (content === null) return null;
  const hasDecision = content.split(/^##\s+/mu).slice(1).some(chunk => {
    const lineBreak = chunk.indexOf('\n');
    return markdownMeaningfulLines(lineBreak < 0 ? '' : chunk.slice(lineBreak + 1)).length > 0;
  });
  return hasDecision ? null : `长期决定缺少有效决定条目：\`${relative}\` 仅包含标题或引导；请补充仍约束当前实现的取舍。`;
}
function changedModuleNames(changed: string[], library: CaseLibrary): string[] {
  const modules = new Set<string>();
  for (const relative of changed) {
    const match = /^\.tiller\/(?:specs|cases)\/modules\/([^/]+)\//u.exec(relative);
    if (match) modules.add(match[1]!);
  }
  for (const entry of library.cases) {
    const references = [...entry.requirements, ...entry.tests.map(reference => reference.path)];
    if (!references.some(reference => changed.some(relative => relative === reference || relative.startsWith(`${reference}/`)))) continue;
    for (const module of entry.modules) modules.add(module);
  }
  return [...modules].sort();
}

function writebackModuleNames(task: FlowTask, changed: string[], library: CaseLibrary): string[] {
  const modules = new Set(changedModuleNames(changed, library));
  for (const relative of task.meta.scope) {
    const match = /^\.tiller\/specs\/modules\/([^/]+)/u.exec(relative);
    if (match) modules.add(match[1]!);
  }
  return [...modules].sort();
}

function writebackWarning(task: FlowTask, changed: string[], library: CaseLibrary): string {
  const modules = writebackModuleNames(task, changed, library);
  const suggestions = modules.length
    ? modules.slice(0, 2).flatMap(module => [
        `\`.tiller/specs/modules/${module}/requirements.md\`（“## <能力>” + 稳定行为/边界）`,
        `\`.tiller/specs/modules/${module}/design.md\`（“## <方案>” + 取舍与影响）`,
      ])
    : [
        '`.tiller/specs/requirements.md`（“## <能力>” + 目标/边界）',
        '`.tiller/specs/decisions.md`（“## <问题>” + 决定/代价）',
        '`.tiller/context/project.md`（“## 当前状态” + 入口/限制）',
      ];
  return `未检测到任务基线后的 \`.tiller/specs/\` 或 \`.tiller/context/\` 回写；如本次形成长期结论，建议回写：${suggestions.join('；')}。纯过程性变更可忽略。`;
}
function requirementBackedBySpecs(task: FlowTask): boolean {
  return codeType(task.meta) && task.meta.requirementFile !== undefined
    && task.meta.requirementFile.startsWith(STABLE_REQUIREMENT_PREFIX);
}
async function moduleDesignThinWarnings(root: string, changed: string[], library: CaseLibrary): Promise<string[]> {
  const warnings: string[] = [];
  for (const module of changedModuleNames(changed, library)) {
    const relative = `.tiller/specs/modules/${module}/design.md`;
    const content = await readTextIfExists(root, relative);
    if (content !== null && markdownMeaningfulLines(content).length === 0) {
      warnings.push(`模块 design.md 仅有标题或占位，没有可执行设计：\`${relative}\`。`);
    }
  }
  return warnings;
}
function requirementsSubject(task: Pick<FlowTask, 'meta' | 'requirement' | 'criteria'>): string {
  return sha(JSON.stringify({
    type: task.meta.type, size: task.meta.size, scope: task.meta.scope,
    requirement: normalizeLine(task.requirement), criteria: task.criteria.map(item => [item.id, normalizeLine(item.text)]),
  }));
}
function confirmationBody(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim();
}
function designSubject(task: Pick<FlowTask, 'meta' | 'requirement' | 'criteria' | 'design'>): string {
  return sha(JSON.stringify({ requirements: requirementsSubject(task), design: confirmationBody(task.design) }));
}
function latestVerification(task: Pick<FlowTask, 'verifications'>, criterion: string): FlowVerification | undefined {
  return [...task.verifications].reverse().find(item => item.criterion === criterion && !item.expectFail);
}

interface RetryStop {
  key: string;
  target: string;
  failures: number;
  runs: string[];
  tests: string[];
}

function retryStops(task: Pick<FlowTask, 'verifications'>): RetryStop[] {
  const states = new Map<string, { target: string; failures: number; runs: string[]; tests: string[] }>();
  for (const run of task.verifications) {
    if (run.expectFail) continue;
    const keys = [
      { key: `AC:${run.criterion}`, target: run.criterion },
      ...run.cases.map(id => ({ key: `CASE:${id}`, target: id })),
    ];
    for (const item of keys) {
      const state = states.get(item.key) ?? { target: item.target, failures: 0, runs: [], tests: [] };
      if (run.result === 'passed' && run.evidence === 'verified') {
        state.failures = 0;
        state.runs = [];
        state.tests = [];
      } else if (run.result === 'failed') {
        state.failures += 1;
        state.runs.push(run.id);
        if (!state.tests.includes(run.test)) state.tests.push(run.test);
      }
      states.set(item.key, state);
    }
  }
  return [...states.entries()].filter(([, state]) => state.failures >= 2).map(([key, state]) => ({ key, ...state }));
}

function retryStopMessage(stop: RetryStop): string {
  return `FLOW-05：${stop.target} 已连续 ${stop.failures} 次验证失败（${stop.runs.join(', ')}），中间没有成功核实。停止自动重试；请报告现象、已尝试方法、证据和 2～3 个可选方案，等待用户决定。`;
}
function deliverySubject(task: FlowTask, commit: string): string {
  return sha(JSON.stringify({
    requirements: requirementsSubject(task), design: task.design.trim() ? designSubject(task) : null,
    commit, criteria: task.criteria.map(item => {
      const run = latestVerification(task, item.id);
      return [item.id, run ? { test: run.test, cases: run.cases, command: run.command, result: run.result, tree: run.tree } : null];
    }),
  }));
}
function expectedSubject(task: FlowTask, gate: FlowGate, commit: string): string {
  if (gate === 'requirements') return requirementsSubject(task);
  if (gate === 'design') return designSubject(task);
  return deliverySubject(task, commit);
}

export async function startFlow(rootInput: string, idInput: string, input: FlowStartInput) {
  const root = path.resolve(rootInput); validateTaskId(idInput);
  const warnings = taskIdWarnings(idInput);
  const requestedCriteria = input.criteria ?? [];
  const title = safeInput(text(input.title, '标题', 200), '标题');
  if ((input.requirement === undefined) === (input.requirementFile === undefined)) {
    fail('INVALID_FLOW_INPUT', 'start 需要 --requirement 或 --requirement-file，两者只能选一个。');
  }
  if (input.requirement !== undefined && /[\r\n]/u.test(input.requirement)) {
    fail('INVALID_FLOW_INPUT', '--requirement 仅接受短目标单行；完整需求正文与 AC-n 请使用 --requirement-file（必须位于 .tiller/specs/）。');
  }
  const type = flowType(input.type);
  const slug = input.slug === undefined ? undefined : normalizeBranchSlug(input.slug);
  if (input.slug !== undefined && !slug) fail('INVALID_FLOW_INPUT', '--slug 必须是 1-64 位英文、数字或连字符组成的简短描述。');
  const summary = input.summary === undefined ? undefined : safeInput(text(input.summary, '任务摘要', 200), '任务摘要');
  if ((input.plan === undefined) !== (input.item === undefined)) fail('INVALID_FLOW_INPUT', '--plan 和 --item 必须同时提供。');
  const relative = taskPath(idInput);
  return withProjectLock(root, async () => {
    const metadata = await readProjectMetadata(root);
    if (input.skipInitGate) warnings.push('已通过 --skip-init-gate 跳过初始化基线门禁。');
    else await assertInitBaselineReady(root, metadata);
    if (await readTextIfExists(root, relative) !== null) fail('TASK_EXISTS', `任务 ${idInput} 已存在，不能覆盖。`);
    let requirementFile: string | undefined;
    let requirement: string;
    let requirementContent: string | undefined;
    if (input.requirementFile !== undefined) {
      try { validateRelativePath(input.requirementFile); }
      catch { fail('INVALID_REQUIREMENT_FILE', `需求文件必须是工程内相对路径：${input.requirementFile}`); }
      requirementFile = input.requirementFile;
      if (!requirementFile.startsWith(STABLE_REQUIREMENT_PREFIX)) {
        fail('REQUIREMENT_FILE_NOT_STABLE', `需求文件必须位于 ${STABLE_REQUIREMENT_PREFIX} 下稳定路径：${requirementFile}。请先写入或拷贝到 .tiller/specs/ 再引用，不能使用 .tiller/local/ 或其它临时路径。`);
      }
      let resolved: ResolvedInputPath;
      try { resolved = (await inspectSafePaths(root, [requirementFile]))[0]!; }
      catch { fail('INVALID_REQUIREMENT_FILE', `需求文件路径无效或不安全：${requirementFile}`); }
      if (resolved.stat === null) fail('REQUIREMENT_FILE_NOT_FOUND', `需求文件不存在：${requirementFile}`);
      if (!resolved.stat.isFile()) fail('INVALID_REQUIREMENT_FILE', `需求文件不是普通文件：${requirementFile}`);
      const raw = await readFile(resolved.target, 'utf8');
      if (!raw.trim()) fail('EMPTY_REQUIREMENT_FILE', `需求文件为空：${requirementFile}`);
      if (raw.length > 50_000) fail('REQUIREMENT_FILE_TOO_LARGE', `需求文件不能超过 50000 字符：${requirementFile}`);
      requirementContent = safeInput(raw.replace(/\r\n?/gu, '\n').trim(), '需求文件内容');
      requirement = requirementContent;
    } else {
      requirement = safeInput(text(input.requirement, '需求正文'), '需求正文');
    }
    const imported = requirementContent === undefined ? [] : parseRequirementFile(requirementContent).criteria;
    const criteria = (imported.length ? importedCriteria(imported) : criteriaList(requestedCriteria))
      .map(item => ({ ...item, text: safeInput(item.text, `${item.id} 验收条件`) }));
    if (imported.length && requestedCriteria.length) {
      warnings.push('已按需求文件中的 AC-n 导入验收条件，忽略命令行 --criterion。');
    }
    let plan: string | undefined;
    let item: string | undefined;
    let size = flowSize(input.size);
    if (input.plan !== undefined && input.item !== undefined) {
      const planned = await readPlanItem(root, input.plan, input.item);
      if (input.size !== undefined && flowSize(input.size) !== planned.item.size) {
        fail('PLAN_SIZE_MISMATCH', `任务规模 ${input.size} 与规划条目 ${input.item} 的 ${planned.item.size} 不一致。`);
      }
      size = planned.item.size; plan = input.plan; item = input.item;
    }
    const scope = scopeValues(input.targets, size);
    const base = (await head(root)) ?? 'no-git';
    const preExisting: Record<string, string> = {};
    for (const changed of (await changedFiles(root, base)) ?? []) {
      if (excludedPath(changed, idInput) || changed.startsWith(`${TASK_DIRECTORY}/`) || changed.startsWith(`${HISTORICAL_TASK_DIRECTORY}/`)) continue;
      try { preExisting[changed] = await fileDigest(root, changed); }
      catch { /* Deleted pre-existing paths cannot be compared later. */ }
    }
    const created = new Date().toISOString();
    const structuredRequirement = renderStructuredRequirement(requirement, criteria, requirementFile, requirementContent);
    const task = { meta: { version: 1 as const, id: idInput, type, size, created, base, scope, preExisting,
      format: 'structured' as const,
      ...(plan && item ? { plan, item } : {}), ...(slug ? { slug } : {}), ...(summary ? { summary } : {}),
      ...(requirementFile ? { requirementFile } : {}) },
    title, requirement: structuredRequirement,
      design: size === 'standard' ? emptyDesignTemplate() : '', criteria,
      confirmations: [], verifications: [], closures: [], review: null };
    const content = renderTask(task);
    const worktrees = await createTaskWorktrees(root, metadata, { id: idInput, type, ...(slug ? { slug } : {}) });
    const recordRoot = managementWorktreePath(root, worktrees);
    try {
      await writePreExisting(root, idInput, preExisting);
      await mkdir(path.dirname(path.join(recordRoot, relative)), { recursive: true });
      await applyChanges(recordRoot, [{ path: relative, before: null, after: content }]);
      await mirrorPrimaryDirtyIntoWorktree(root, recordRoot, idInput);
      await syncTaskRecordsToWorktrees(root, worktrees);
    } catch (error) {
      await rollbackTaskWorktrees(root, worktrees);
      try { await rm(await assertSafePath(root, `${TASK_DIRECTORY}/${idInput}`), { recursive: true, force: true }); }
      catch { /* Preserve the original start failure; primary must not keep a seed. */ }
      try { await rm(await assertSafePath(recordRoot, `${TASK_DIRECTORY}/${idInput}`), { recursive: true, force: true }); }
      catch { /* Worktree may already be removed by rollback. */ }
      throw error;
    }
    try { await writeTaskWorktreeState(root, worktrees); }
    catch (error) { warnings.push(`任务 worktree 已创建，但本机清单写入失败；close 将按约定布局清理：${(error as Error).message}`); }
    return { id: idInput, path: relative, type, size, base, scope, criteria, worktreeRoot: worktrees.root,
      worktrees: worktrees.worktrees.map(item => ({ repository: item.repository, path: item.path, branch: item.branch })),
      warnings, ...(plan && item ? { plan, item } : {}),
      ...(slug ? { slug } : {}), ...(summary ? { summary } : {}),
      ...(requirementFile ? { requirementFile } : {}),
      next: `核对结构化需求正文后确认：tiller confirm ${idInput} requirements [--by "<确认人>"]` };
  });
}

export async function attachFlowTask(rootInput: string, id: string, plan: string, item: string) {
  validateTaskId(id);
  validateTaskId(plan);
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  return withProjectLock(root, async () => {
    const task = await readTask(root, id);
    const planned = await planItemForAttachment(root, plan, item);
    if (task.meta.plan || task.meta.item) {
      if (task.meta.plan === plan && task.meta.item === item) {
        return { id, path: task.path, plan, item, size: task.meta.size, changed: false,
          next: `tiller plan status ${plan}` };
      }
      fail('TASK_PLAN_CONFLICT', `任务 ${id} 已挂到 ${task.meta.plan}/${task.meta.item}；不会静默改挂，请先人工核对。`);
    }
    const next = { ...task, meta: { ...task.meta, plan, item } };
    const { content: _content, path: _path, ...body } = next;
    await writeTask(root, id, task.content, renderTask(body, sectionBody(task.content, '自检')), body.meta.preExisting);
    const warnings = task.meta.size === planned.item.size
      ? []
      : [`任务规模 ${task.meta.size} 与规划条目 ${item} 的 ${planned.item.size} 不同；已保留任务记录，仅报告差异。`];
    return { id, path: task.path, plan, item, size: task.meta.size, changed: true,
      ...(warnings.length ? { warnings } : {}), next: `tiller plan status ${plan}` };
  });
}


/** Task records live in the task worktree while open; after close they may sit on primary. */
export async function discoverTaskIds(primary: string): Promise<string[]> {
  const ids = new Set<string>();
  try {
    for (const entry of await readdir(path.join(primary, TASK_DIRECTORY), { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    for (const entry of await readdir(path.join(primary, '.tiller/local'), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const id = entry.name;
      for (const rel of [
        path.join('.tiller/local', id, 'worktrees', TASK_DIRECTORY, id, TASK_FILE),
        path.join('.tiller/local', id, 'worktrees', 'management', TASK_DIRECTORY, id, TASK_FILE),
      ]) {
        if (await readTextIfExists(primary, rel) !== null) { ids.add(id); break; }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export async function resumeFlow(rootInput: string, id?: string) {
  const root = id ? (await resolveTaskCheckout(rootInput, id)).taskRoot : await resolveProjectRoot(rootInput);
  await readProjectMetadata(root);
  if (id) {
    const task = await readTask(root, id);
    const stage = await taskStageForTask(root, id, task);
    return { id, title: task.title, type: task.meta.type, size: task.meta.size, scope: task.meta.scope,
      path: task.path, ...(task.meta.plan && task.meta.item ? { plan: task.meta.plan, item: task.meta.item } : {}),
      ...(task.meta.slug ? { slug: task.meta.slug } : {}), ...(task.meta.summary ? { summary: task.meta.summary } : {}),
      ...(task.meta.requirementFile ? { requirementFile: task.meta.requirementFile } : {}),
      stage: stage.stage, stageReason: stage.reason,
      requirement: task.requirement, criteria: task.criteria, confirmations: task.confirmations, verifications: task.verifications,
      closures: task.closures, review: task.review };
  }
  const tasks = [];
  for (const taskId of await discoverTaskIds(await resolveProjectRoot(rootInput))) {
    try {
      const checkout = (await resolveTaskCheckout(rootInput, taskId)).taskRoot;
      const content = await readTextIfExists(checkout, taskPath(taskId));
      if (content?.includes(MARKER_PREFIX)) {
        const task = parseTask(content, taskId, taskPath(taskId));
        const stage = await taskStageForTask(checkout, taskId, task);
        tasks.push({ id: taskId, title: task.title, type: task.meta.type, size: task.meta.size, path: task.path,
          ...(task.meta.plan && task.meta.item ? { plan: task.meta.plan, item: task.meta.item } : {}),
          ...(task.meta.slug ? { slug: task.meta.slug } : {}), ...(task.meta.summary ? { summary: task.meta.summary } : {}),
          stage: stage.stage, stageReason: stage.reason,
          confirmed: task.confirmations.length, verified: task.verifications.length });
      }
    } catch { /* Other task formats are outside the default flow index. */ }
  }
  return { tasks };
}

function requirementFieldIssues(task: FlowTask): string[] {
  if (task.meta.format !== 'structured') return [];
  const missing: string[] = [];
  const current = /^###\s+业务范围\s*$/mu.test(task.requirement);
  const fields = current
    ? ['使用场景', '目标', '业务范围', '关键行为', '异常与边界', '验收条件']
    : ['目标', '范围', '验收条件'];
  for (const field of fields) {
    const lines = markdownMeaningfulLines(subSectionBody(task.requirement, field));
    const meaningful = field === '业务范围'
      ? lines.some(line => {
          const value = line.replace(/^(?:做|不做|假设与待确认)[:：]?\s*/u, '').trim();
          return value.length > 0 && !PLACEHOLDER_LINE.test(value) && !/^<[^<>]+>$/u.test(value);
        })
      : lines.length > 0;
    if (!meaningful) missing.push(field);
  }
  if (!task.criteria.length && !missing.includes('验收条件')) missing.push('验收条件');
  return missing;
}
function designFieldIssues(task: FlowTask): { missing: string[]; tradeoffsMissing: boolean } {
  const structured = task.meta.format === 'structured' || /^###\s+(?:方案|失败处理|取舍|影响与风险|验证入口)\s*$/mu.test(task.design);
  if (!structured) return { missing: task.design.trim() ? [] : ['设计正文'], tradeoffsMissing: false };
  const current = /^###\s+(?:失败处理|验证入口)\s*$/mu.test(task.design);
  const missing: string[] = [];
  const required = current ? ['方案', '失败处理', '影响与风险', '验证入口'] : ['方案', '影响与风险'];
  for (const field of required) {
    if (!markdownMeaningfulLines(subSectionBody(task.design, field)).length) missing.push(field);
  }
  return { missing, tradeoffsMissing: !markdownMeaningfulLines(subSectionBody(task.design, '取舍')).length };
}

const CONFIRM_COMMIT_MESSAGES: Record<FlowGate, string> = {
  requirements: 'chore: 需求确认',
  design: 'chore: 设计确认',
  acceptance: 'chore: 验收确认',
};

/** Stage and commit only this task's record directory after a confirmation write. */
async function commitTaskRecords(root: string, id: string, message: string): Promise<{ commit?: string; warning?: string }> {
  const relative = `${TASK_DIRECTORY}/${id}`;
  if (!(await head(root))) {
    return { warning: '当前检出不是 Git 仓库，确认已写入但未能自动提交任务记录。' };
  }
  const status = await git(root, ['status', '--porcelain', '--', relative]);
  if (!status.ok) {
    return { warning: `无法检查任务记录状态，确认已写入但未自动提交：${status.stderr.trim() || 'git status 失败'}` };
  }
  if (!status.stdout.trim()) return {};
  const added = await git(root, ['add', '--', relative]);
  if (!added.ok) {
    return { warning: `任务记录暂存失败，确认已写入但未自动提交：${added.stderr.trim() || 'git add 失败'}` };
  }
  const [name, email] = await Promise.all([
    git(root, ['config', 'user.name']),
    git(root, ['config', 'user.email']),
  ]);
  const author = name.ok && name.stdout.trim() ? name.stdout.trim() : 'tiller';
  const address = email.ok && email.stdout.trim() ? email.stdout.trim() : 'tiller@localhost';
  const committed = await git(root, ['-c', `user.name=${author}`, '-c', `user.email=${address}`, 'commit', '--quiet', '-m', message]);
  if (!committed.ok) {
    return { warning: `任务记录提交失败，确认已写入但未自动提交：${committed.stderr.trim() || 'git commit 失败'}` };
  }
  const after = await head(root);
  return after ? { commit: after } : { warning: '任务记录提交后无法读取 HEAD。' };
}

export async function confirmFlow(rootInput: string, id: string, gateInput: string, input: FlowConfirmInput = {}) {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  return withProjectLock(root, async () => {
    const task = await readTask(root, id);
    assertTaskOpen(task);
    if (!CONFIRMATION_GATES.includes(gateInput as FlowGate)) fail('INVALID_CONFIRMATION_GATE', `确认节点必须是：${CONFIRMATION_GATES.join(', ')}。`);
    const gate = gateInput as FlowGate;
    const quote = input.quote === undefined ? '' : safeInput(text(input.quote, '用户原话', 4000), '用户原话');
    const by = safeInput(await resolveConfirmer(root, input.by), '确认人');
    const warnings: string[] = [];
    const specIssues = await specMountIssues(root, task);
    if (specIssues.length) fail('SPEC_OVERFLOW', specOverflowMessage(specIssues, referencedSpecPaths(task)));
    if (gate === 'requirements') {
      const missing = requirementFieldIssues(task);
      if (missing.length) fail('MISSING_REQUIREMENTS', `需求正文缺少可执行内容：${missing.join('、')}；请补齐后再确认。`);
      if (!task.criteria.length) fail('MISSING_REQUIREMENTS', '没有可确认的验收条件。');
      const safety = recordSafety(task.requirement);
      if (safety.length) fail('UNSAFE_RECORD', `需求正文${safety.join('；')}`);
    }
    if (gate === 'design') {
      const requirements = [...task.confirmations].reverse().find(item => item.gate === 'requirements');
      if (!requirements || requirements.subject !== requirementsSubject(task)) fail('MISSING_REQUIREMENTS', '确认设计前需要当前有效的需求确认。');
    }
    if (gate === 'design') {
      const fields = designFieldIssues(task);
      if (fields.missing.length) fail('MISSING_DESIGN', `设计正文缺少可执行内容：${fields.missing.join('、')}；请补齐后再确认。`);
      if (fields.tradeoffsMissing) warnings.push('设计“取舍”为空；如有备选方案，请补充选择理由。');
      const safety = recordSafety(task.design);
      if (safety.length) fail('UNSAFE_RECORD', `设计正文${safety.join('；')}`);
    }
    if (gate === 'acceptance') {
      const checked = await inspectFlow(root, id, {
        allowReported: input.allowReported === true,
        ignoreAcceptance: true,
      });
      if (!checked.ready) fail('NOT_READY', `技术自检未通过：${checked.issues.join('；')}`);
    }
    const commit = await currentCommit(root, input.commit);
    const subject = expectedSubject(task, gate, commit);
    const object = CONFIRMATION_OBJECTS[gate];
    const confirmation: FlowConfirmation = { gate, object, quote: normalizeLine(quote), by, commit, subject, at: new Date().toISOString() };
    const next = { ...task, confirmations: [...task.confirmations.filter(item => item.gate !== gate), confirmation] };
    const { content: _content, path: _path, ...body } = next;
    await writeTask(root, id, task.content, renderTask(body, sectionBody(task.content, '自检')), body.meta.preExisting);
    const committed = await commitTaskRecords(root, id, CONFIRM_COMMIT_MESSAGES[gate]);
    if (committed.warning) warnings.push(committed.warning);
    return { id, gate, confirmed: true, object, by, ...(confirmation.quote ? { quote: confirmation.quote } : {}),
      commit, subject, path: task.path,
      ...(committed.commit ? { recordsCommit: committed.commit } : {}),
      ...(warnings.length ? { warnings } : {}) };
  });
}

function testReference(value: string): string {
  const normalized = value.trim();
  const pathPart = normalized.split('::')[0]!.split('#')[0]!;
  if (!pathPart || path.isAbsolute(pathPart) || pathPart.includes('\\')) fail('INVALID_TEST_REFERENCE', '测试引用必须是工程相对文件路径，可用 :: 或 # 附加用例名。');
  validateRelativePath(pathPart);
  return normalized;
}
async function testExists(root: string, value: string, commit?: string): Promise<boolean> {
  const relative = value.split('::')[0]!.split('#')[0]!;
  if (commit && commit !== 'no-git') {
    const checked = await git(root, ['cat-file', '-e', `${commit}:${relative}`]);
    return checked.ok;
  }
  try { const stat = await lstat(path.join(root, relative)); return stat.isFile(); }
  catch { return false; }
}

function excludedPath(relative: string, id: string): boolean {
  return relative === `${TASK_DIRECTORY}/${id}` || relative.startsWith(`${TASK_DIRECTORY}/${id}/`)
    || relative.startsWith('.tiller/local/') || relative.startsWith('.git/') || relative.includes('/node_modules/');
}
function taskRecordPath(relative: string): boolean {
  return [TASK_DIRECTORY, HISTORICAL_TASK_DIRECTORY].some(directory => relative === directory || relative.startsWith(`${directory}/`));
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
type GitObjectFormat = 'sha1' | 'sha256';
const gitObjectFormats = new Map<string, GitObjectFormat | null>();

async function gitObjectFormat(root: string): Promise<GitObjectFormat | null> {
  const absolute = path.resolve(root);
  if (gitObjectFormats.has(absolute)) return gitObjectFormats.get(absolute) ?? null;
  const result = await git(root, ['rev-parse', '--show-object-format']);
  const format = result.ok && (result.stdout.trim() === 'sha1' || result.stdout.trim() === 'sha256')
    ? result.stdout.trim() as GitObjectFormat : null;
  gitObjectFormats.set(absolute, format);
  return format;
}

function isGitBinary(content: Buffer): boolean {
  return content.subarray(0, 8000).includes(0);
}

function normalizeGitText(content: Buffer): Buffer {
  if (isGitBinary(content) || !content.includes(Buffer.from('\r\n'))) return content;
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < content.length - 1; index += 1) {
    if (content[index] !== 13 || content[index + 1] !== 10) continue;
    parts.push(content.subarray(start, index), Buffer.from('\n'));
    start = index + 2;
    index += 1;
  }
  parts.push(content.subarray(start));
  return Buffer.concat(parts);
}

async function contentDigest(root: string, content: Buffer, normalize = true): Promise<string> {
  const normalized = normalize ? normalizeGitText(content) : content;
  const format = await gitObjectFormat(root);
  if (!format) return createHash('sha256').update(normalized).digest('hex');
  return createHash(format).update(Buffer.from(`blob ${normalized.length}\0`)).update(normalized).digest('hex');
}

async function legacyFileDigest(root: string, relative: string): Promise<string> {
  return sha(await readFile(path.join(root, relative), 'utf8'));
}

async function fileDigest(root: string, relative: string): Promise<string> {
  const absolute = path.join(root, relative);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) return contentDigest(root, Buffer.from(await readlink(absolute), 'utf8'), false);
  const hashed = await git(root, ['hash-object', `--path=${relative}`, '--', absolute]);
  if (hashed.ok && /^[a-f0-9]{40,64}$/u.test(hashed.stdout.trim())) return hashed.stdout.trim();
  return contentDigest(root, await readFile(absolute));
}

interface PreExistingDigests { digest: string; legacy: string }

async function worktreePreExistingDigests(root: string, relative: string): Promise<PreExistingDigests> {
  const [digest, legacy] = await Promise.all([fileDigest(root, relative), legacyFileDigest(root, relative)]);
  return { digest, legacy };
}

async function commitPreExistingDigests(root: string, commit: string, relative: string): Promise<PreExistingDigests | null> {
  const listed = await git(root, ['ls-tree', '-z', commit, '--', relative]);
  if (!listed.ok) return null;
  for (const record of listed.stdout.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const [mode, type, object] = record.slice(0, tab).split(' ');
    if (!mode || type !== 'blob' || !object || record.slice(tab + 1) !== relative) continue;
    const content = await gitBytes(root, ['cat-file', 'blob', object]);
    if (!content.ok) return null;
    return { digest: object, legacy: sha(content.stdout.toString('utf8')) };
  }
  return null;
}

async function matchesPreExisting(root: string, expected: string, relative: string, commit?: string): Promise<boolean> {
  const current = commit
    ? await commitPreExistingDigests(root, commit, relative)
    : await worktreePreExistingDigests(root, relative).catch(() => null);
  return current !== null && (current.digest === expected || current.legacy === expected);
}

export async function treeDigest(root: string, scope: string[], id: string): Promise<string> {
  const entries: [string, string][] = [];
  for (const relative of await scopeFiles(root, scope, id)) {
    try { entries.push([relative, await fileDigest(root, relative)]); }
    catch { /* A file removed during measurement is a stale observation. */ }
  }
  return sha(JSON.stringify(entries));
}
async function treeDigestAtCommit(root: string, scope: string[], id: string, commit: string): Promise<string | null> {
  const listed = await git(root, ['ls-tree', '-r', '-z', commit, '--', ...scope]);
  if (!listed.ok) return null;
  const entries: [string, string][] = [];
  for (const record of listed.stdout.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const [, type, object] = record.slice(0, tab).split(' ');
    const relative = record.slice(tab + 1);
    if (type !== 'blob' || !object) continue;
    if (excludedPath(relative, id) || !inScope(relative, scope)) continue;
    entries.push([relative, object]);
  }
  entries.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
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


async function mirrorPrimaryDirtyIntoWorktree(primaryRoot: string, worktreeRoot: string, id: string): Promise<void> {
  if (path.resolve(primaryRoot) === path.resolve(worktreeRoot)) return;
  const changed = await changedFiles(primaryRoot, 'HEAD');
  if (!changed?.length) return;
  for (const relative of changed) {
    if (excludedPath(relative, id) || relative.startsWith(`${TASK_DIRECTORY}/`) || relative.startsWith(`${HISTORICAL_TASK_DIRECTORY}/`)) continue;
    if (relative.startsWith('.tiller/local/')) continue;
    try {
      const source = await assertSafePath(primaryRoot, relative);
      const target = await assertSafePath(worktreeRoot, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    } catch {
      /* Skip deleted or unreadable dirty paths; worktree keeps HEAD version. */
    }
  }
}

async function changedFiles(root: string, base: string, endpoint?: string): Promise<string[] | null> {
  if (base === 'no-git') return null;
  if (endpoint) {
    const tracked = await git(root, ['diff', '--name-only', '-z', base, endpoint, '--']);
    return tracked.ok ? [...new Set(tracked.stdout.split('\0').filter(Boolean))] : null;
  }
  const tracked = await git(root, ['diff', '--name-only', '-z', base, '--']);
  const untracked = await git(root, ['ls-files', '-z', '--others', '--exclude-standard']);
  if (!tracked.ok || !untracked.ok) return null;
  return [...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean))];
}
async function scopedWorkingChanges(root: string, scope: string[], id: string): Promise<string[] | null> {
  return workingChangesSince(root, 'HEAD', scope, id);
}

async function workingChangesSince(root: string, commit: string, scope: string[], id: string): Promise<string[] | null> {
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok) return null;
  const tracked = await git(root, ['diff', '--name-only', '-z', commit, '--']);
  const untracked = await git(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...scope]);
  if (!tracked.ok || !untracked.ok) return null;
  return [...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean))]
    .filter(relative => !excludedPath(relative, id) && !taskRecordPath(relative) && inScope(relative, scope)).sort();
}

function businessChange(relative: string): boolean {
  return !relative.startsWith('.tiller/') && !relative.startsWith('.git/')
    && relative !== 'AGENTS.md' && relative !== 'README.md' && !relative.startsWith('docs/');
}

async function unchangedPreExisting(root: string, task: FlowTask, relative: string): Promise<boolean> {
  const expected = task.meta.preExisting[relative];
  if (expected === undefined) return false;
  return await matchesPreExisting(root, expected, relative);
}

async function processHygieneIssues(
  root: string,
  id: string,
  task: FlowTask,
  historicalAccepted: boolean,
): Promise<string[]> {
  const issues: string[] = [];
  if (requiresDesign(task)) {
    const design = [...task.confirmations].reverse().find(item => item.gate === 'design' && item.subject === designSubject(task));
    if (design) {
      const early = task.verifications.filter(run => Date.parse(run.at) < Date.parse(design.at));
      if (early.length) {
        const tests = [...new Set(early.map(run => run.test))].slice(0, 3).join('、');
        issues.push(`过程卫生：standard 任务在有效设计确认前已有 verify（${tests}${early.length > 3 ? ' 等' : ''}）；请先完成设计确认，再记录实现侧验证。`);
      }
    }
  }
  if (historicalAccepted) return issues;
  const latest = [...task.confirmations].reverse().find(item => item.commit !== 'no-git');
  if (!latest) return issues;
  const changed = await scopedWorkingChanges(root, task.meta.scope, id);
  if (changed === null) return issues;
  const business: string[] = [];
  for (const relative of changed) {
    if (businessChange(relative) && !await unchangedPreExisting(root, task, relative)) business.push(relative);
  }
  if (!business.length) return issues;
  const labels = [...new Set(task.confirmations.filter(item => item.commit === latest.commit).map(item => CONFIRMATION_LABELS[item.gate]))].join('、');
  const shown = business.slice(0, 8).join('、');
  issues.push(`过程卫生：${labels}确认提交 ${latest.commit.slice(0, 12)} 后，工作区仍有未提交业务改动：${shown}${business.length > 8 ? ` 等 ${business.length} 项` : ''}。请先提交或移出本任务。`);
  return issues;
}
interface TestFindings { issues: string[]; warnings: string[] }

async function weakensTests(root: string, base: string, endpoint?: string): Promise<TestFindings> {
  if (base === 'no-git') return { issues: [], warnings: [] };
  const issues: string[] = [];
  const warnings: string[] = [];
  let deletedFiles = 0;
  let removedCases = 0;
  const status = await git(root, ['diff', '--name-status', '-z', base, ...(endpoint ? [endpoint] : []), '--']);
  if (status.ok) {
    const fields = status.stdout.split('\0').filter(Boolean);
    for (let index = 0; index < fields.length; index += 2) {
      const kind = fields[index];
      const relative = fields[index + 1];
      if (kind === 'D' && relative && /(?:^|\/)test\/|\.test\.|\.spec\./u.test(relative)) deletedFiles++;
    }
  }
  if (deletedFiles) warnings.push(`删除 ${deletedFiles} 个测试文件（请确认对应功能已删除；详情见 Git diff）。`);
  const changed = await git(root, ['diff', '--name-only', '-z', base, ...(endpoint ? [endpoint] : []), '--']);
  if (!changed.ok) return { issues, warnings };
  const count = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length;
  const skipped = /\b(?:test|it|describe)\.(?:skip|todo|only)\s*\(/gu;
  for (const relative of changed.stdout.split('\0').filter(Boolean)) {
    if (!/(?:^|\/)test\/|\.test\.|\.spec\./u.test(relative)) continue;
    const before = await git(root, ['show', `${base}:${relative}`]);
    if (!before.ok) continue;
    let after: string;
    if (endpoint) {
      const current = await git(root, ['show', `${endpoint}:${relative}`]);
      if (!current.ok) continue;
      after = current.stdout;
    } else {
      try { after = await readFile(path.join(root, relative), 'utf8'); } catch { continue; }
    }
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

function caseSignature(item: Partial<GlobalCase>): string {
  return JSON.stringify({
    title: item.title, requirements: item.requirements, modules: item.modules,
    criteria: item.criteria ?? [], kind: item.kind, priority: item.priority,
    preconditions: item.preconditions, steps: item.steps, inputs: item.inputs, expected: item.expected,
  });
}

async function caseChangedSinceBase(root: string, base: string, item: GlobalCase): Promise<boolean> {
  if (base === 'no-git') return false;
  const previous = await git(root, ['show', `${base}:${item.file}`]);
  if (!previous.ok) return true;
  if (item.file.endsWith('.md')) {
    const parsed = parseCaseMarkdown(previous.stdout, item.file, item.kind);
    const old = parsed.cases.find(entry => entry.id === item.id);
    if (!old) return true;
    return caseSignature(old) !== caseSignature(item);
  }
  let value: { cases?: unknown[]; scenarios?: unknown[] };
  try { value = JSON.parse(previous.stdout) as { cases?: unknown[]; scenarios?: unknown[] }; }
  catch { return true; }
  const entries = [...(Array.isArray(value.cases) ? value.cases : []), ...(Array.isArray(value.scenarios) ? value.scenarios : [])];
  const old = entries.find(entry => entry && typeof entry === 'object' && !Array.isArray(entry)
    && (entry as Record<string, unknown>).id === item.id) as Partial<GlobalCase> | undefined;
  if (!old) return true;
  return caseSignature(old) !== caseSignature(item);
}

async function fileChangedSinceCommit(root: string, commit: string, relative: string): Promise<boolean> {
  if (commit === 'no-git') return false;
  const previous = await git(root, ['show', `${commit}:${relative}`]);
  if (!previous.ok) return true;
  try { return previous.stdout !== await readFile(path.join(root, relative), 'utf8'); }
  catch { return true; }
}

function latestAcceptance(task: Pick<FlowTask, 'confirmations' | 'closures'>): FlowConfirmation | undefined {
  const reopenedAt = [...task.closures].reverse().find(item => item.action === 'reopen');
  return [...task.confirmations].reverse().find(item => item.gate === 'acceptance'
    && (!reopenedAt || Date.parse(item.at) > Date.parse(reopenedAt.at)));
}

function confirmedAcceptance(task: FlowTask): FlowConfirmation | undefined {
  const acceptance = latestAcceptance(task);
  return acceptance && acceptance.subject === expectedSubject(task, 'acceptance', acceptance.commit)
    ? acceptance : undefined;
}

interface EvaluationContext { tree: string; commit?: string; warning?: string }

async function evaluationContext(root: string, id: string, task: FlowTask,
  ignoreAcceptance = false): Promise<EvaluationContext> {
  const acceptance = ignoreAcceptance ? undefined : confirmedAcceptance(task);
  if (acceptance && acceptance.commit !== 'no-git') {
    const available = await git(root, ['cat-file', '-e', `${acceptance.commit}^{commit}`]);
    if (available.ok) {
      const tree = await treeDigestAtCommit(root, task.meta.scope, id, acceptance.commit);
      if (tree) return { tree, commit: acceptance.commit };
    }
    return { tree: await treeDigest(root, task.meta.scope, id),
      warning: `无法读取验收提交 ${acceptance.commit}，已回退到当前工作区检查。` };
  }
  return { tree: await treeDigest(root, task.meta.scope, id) };
}

function terminalStage(task: Pick<FlowTask, 'closures'>): TaskStage | null {
  const closure = task.closures.at(-1);
  if (closure?.action !== 'close') return null;
  return closure.status === 'abandoned'
    ? { stage: '已放弃', reason: `任务已放弃：${closure.reason}` }
    : { stage: '已关闭', reason: `任务已关闭：${closure.reason}` };
}

function assertTaskOpen(task: Pick<FlowTask, 'closures' | 'title'>): void {
  const terminal = terminalStage(task);
  if (!terminal) return;
  const code = terminal.stage === '已放弃' ? 'TASK_ABANDONED' : 'TASK_CLOSED';
  fail(code, `任务 ${task.title} 当前阶段为${terminal.stage}；如需继续，先执行 reopen。`);
}

function testLabel(reference: { path: string; name?: string }): string {
  return reference.name ? `${reference.path}::${reference.name}` : reference.path;
}

function criterionCasePhase(task: FlowTask): boolean {
  const requirement = [...task.confirmations].reverse().find(item => item.gate === 'requirements');
  if (!requirement || requirement.subject !== requirementsSubject(task)) return false;
  if (!requiresDesign(task)) return true;
  const design = [...task.confirmations].reverse().find(item => item.gate === 'design');
  return design !== undefined && design.subject === designSubject(task);
}

async function verificationProblem(
  root: string,
  criterion: string,
  run: FlowVerification,
  currentTree: string,
  options: FlowCheckOptions,
  contentCommit?: string,
): Promise<string | null> {
  if (run.result !== 'passed') return `${criterion} 最新验证结果为 ${run.result}。`;
  if (run.tree !== currentTree) return `${criterion} 的验证已过期：记录时的代码树与当前工作树不同（范围内代码已变化）。`;
  if (!(await testExists(root, run.test, contentCommit))) return `${criterion} 的测试引用不存在：${run.test}`;
  const missingReportReason = run.source === 'reported' && !run.reason;
  if (missingReportReason) return `${criterion} 的外部报告缺少理由；请重新记录并写明 --reason。`;
  if (run.source === 'reported' && options.allowReported !== true) {
    const detail = run.reason ? `：${run.reason}` : '（未记录理由）';
    return `${criterion} 的验证未实际执行（外部报告）${detail}；确认事实后使用 --allow-reported 放行。`;
  }
  if (run.source === 'executed' && run.evidence !== 'verified') {
    return `${criterion} 的验证未核实：命令输出中没有可确认的通过测试记录。`;
  }
  return null;
}

interface CriterionEvaluation {
  id: string; covered: boolean; test?: string; cases?: string[]; result?: string; commit?: string;
  issues: string[];
}

async function evaluateCriterion(
  root: string,
  task: FlowTask,
  criterion: FlowCriterion,
  library: CaseLibrary,
  options: FlowCheckOptions,
  currentTree: string,
  historicalAccepted: boolean,
  requireTests: boolean,
  contentCommit?: string,
): Promise<CriterionEvaluation> {
  const issues: string[] = [];
  const runs = task.verifications.filter(item => item.criterion === criterion.id && !item.expectFail);
  const latest = runs.at(-1);
  const linked = new Map<string, GlobalCase>();
  for (const caseId of latest?.cases ?? []) {
    const entry = library.cases.find(item => item.id === caseId);
    if (entry) linked.set(entry.id, entry);
  }
  if (!latest) {
    for (const entry of library.cases) {
      if (await caseChangedSinceBase(root, task.meta.base, entry)) linked.set(entry.id, entry);
    }
  }
  const mapped = [...linked.values()];
  const designRequired = criterionCasePhase(task) && !historicalAccepted;
  if (designRequired && !latest && !mapped.length) {
    issues.push(`${criterion.id} 未绑定全局用例；先用 case add 把验收条件转为用例，并在测试名中引用用例编号。`);
  }
  let caseCoverage = true;
  if (designRequired && requireTests) {
    for (const entry of mapped) {
      if (!entry.tests.length) {
        caseCoverage = false;
        issues.push(`${criterion.id} 的用例 ${entry.id} 待实现：尚无测试名引用该用例。`);
        continue;
      }
      let valid = false;
      let problem = false;
      for (const reference of entry.tests) {
        const testRun = [...runs].reverse().find(run => sameTestReference(run.test, reference));
        if (!testRun) continue;
        const found = await verificationProblem(root, criterion.id, testRun, currentTree, options, contentCommit);
        if (found) {
          problem = true;
          issues.push(`${criterion.id} 的用例 ${entry.id}：${found}`);
        } else valid = true;
      }
      if (!valid && !problem) {
        caseCoverage = false;
        issues.push(`${criterion.id} 的用例 ${entry.id} 尚无当前通过且已核实的测试。`);
      } else if (problem) caseCoverage = false;
    }
  }
  let runValid = true;
  if (!latest) {
    runValid = false;
    issues.push(`${criterion.id} 尚无验证。`);
  } else {
    const found = await verificationProblem(root, criterion.id, latest, currentTree, options, contentCommit);
    if (found) {
      runValid = false;
      issues.push(found);
    }
    if (!latest.cases.length) {
      runValid = false;
      issues.push(`${criterion.id} 未绑定全局用例；验证测试名应引用 CASE-xxx。`);
    }
    for (const caseId of latest.cases) if (!library.cases.some(entry => entry.id === caseId)) {
      runValid = false;
      issues.push(`${criterion.id} 引用的全局用例不存在：${caseId}`);
    }
    for (const caseId of latest.cases) {
      const entry = linked.get(caseId) ?? library.cases.find(item => item.id === caseId);
      if (!entry) continue;
      const testPath = fallbackTestReference(latest.test)?.path;
      const testChangedAfterAcceptance = historicalAccepted && contentCommit !== undefined && testPath !== undefined
        && await fileChangedSinceCommit(root, contentCommit, testPath);
      if (latest.tree === currentTree && entry.tests.length && !testChangedAfterAcceptance
        && !entry.tests.some(reference => sameTestReference(latest.test, reference))) {
        runValid = false;
        issues.push(`${criterion.id} 的验证测试 ${latest.test} 与全局用例 ${entry.id} 的测试引用不一致。`);
      }
    }
  }
  const covered = runValid && caseCoverage;
  return {
    id: criterion.id, covered, ...(latest ? { test: latest.test, cases: latest.cases, result: latest.result, commit: latest.commit } : {}),
    issues: [...new Set(issues)],
  };
}

async function verificationStageIssues(root: string, id: string, task: FlowTask): Promise<string[]> {
  const library = await readCaseLibrary(root);
  const context = await evaluationContext(root, id, task);
  const historicalAccepted = confirmedAcceptance(task) !== undefined;
  const issues: string[] = [];
  for (const criterion of task.criteria) {
    const evaluated = await evaluateCriterion(root, task, criterion, library, {}, context.tree, historicalAccepted, true, context.commit);
    issues.push(...evaluated.issues);
  }
  return [...new Set(issues)];
}

async function taskStageForTask(root: string, id: string, task: FlowTask): Promise<TaskStage> {
  const terminal = terminalStage(task);
  if (terminal) return terminal;
  const requirement = [...task.confirmations].reverse().find(item => item.gate === 'requirements');
  if (!requirement) return { stage: '已开始', reason: '任务已建立，等待需求确认。' };
  if (requirement.subject !== requirementsSubject(task)) {
    return { stage: '已开始', reason: '需求确认已失效：需求正文、范围或验收条件已变化，需要重新确认。' };
  }
  if (requiresDesign(task)) {
    if (!task.design.trim()) return { stage: '需求已确认', reason: '需求确认有效，等待填写设计。' };
    const design = [...task.confirmations].reverse().find(item => item.gate === 'design');
    if (!design) return { stage: '需求已确认', reason: '需求确认有效，等待设计确认。' };
    if (design.subject !== designSubject(task)) {
      return { stage: '需求已确认', reason: '设计确认已失效：需求或设计正文已变化，需要重新确认。' };
    }
  }
  const fallback: FlowStage = requiresDesign(task) ? '设计已确认' : '需求已确认';
  const verificationIssues = await verificationStageIssues(root, id, task);
  if (verificationIssues.length) {
    const shown = verificationIssues.slice(0, 3).join('；');
    const rest = verificationIssues.length > 3 ? `；另有 ${verificationIssues.length - 3} 项` : '';
    return { stage: fallback, reason: `验证未通过或已失效：${shown}${rest}。` };
  }
  const acceptance = latestAcceptance(task);
  if (!acceptance) return { stage: '已验证', reason: '验证有效，等待交付验收。' };
  if (acceptance.subject !== expectedSubject(task, 'acceptance', acceptance.commit)) {
    return { stage: '已验证', reason: '交付验收已失效：交付内容已变化，需要重新验收。' };
  }
  return { stage: '已验收', reason: '交付验收有效。' };
}

export async function taskStage(rootInput: string, id: string): Promise<TaskStage> {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  const task = await readTask(root, id);
  return taskStageForTask(root, id, task);
}

export interface FlowCheck {
  id: string; ready: boolean; issues: string[]; warnings: string[]; criteria: { id: string; covered: boolean; test?: string; cases?: string[]; result?: string; commit?: string }[];
  confirmations: { gate: FlowGate; confirmed: boolean; quote?: string; by?: string; commit: string; issue?: string }[];
  acceptance: { confirmed: boolean; quote?: string; by?: string; commit?: string };
  changedOutsideScope: string[];
  cases: { count: number; matched: number; modules: CaseLibrary['modules']; scenarios: CaseLibrary['scenarios']; uncovered: string[] };
  review: { reviewed: boolean; openBlockers: string[] };
  release: ReleaseChecklist;
  selfCheck: string;
}

async function evaluateFlow(root: string, id: string, task: FlowTask, options: FlowCheckOptions = {}): Promise<FlowCheck> {
  const issues: string[] = []; const warnings: string[] = [];
  const acceptance = latestAcceptance(task);
  const acceptanceConfirmed = acceptance !== undefined && acceptance.subject === expectedSubject(task, 'acceptance', acceptance.commit);
  const historicalAccepted = acceptanceConfirmed && options.ignoreAcceptance !== true;
  const requirement = [...task.confirmations].reverse().find(item => item.gate === 'requirements');
  const context = await evaluationContext(root, id, task, options.ignoreAcceptance === true);
  const currentTree = context.tree;
  if (context.warning) warnings.push(context.warning);
  if (task.preExistingIssue) warnings.push(task.preExistingIssue);
  const confirmationStates: FlowCheck['confirmations'] = [];
  for (const gate of ['requirements', 'design', 'acceptance'] as FlowGate[]) {
    const item = gate === 'acceptance'
      ? latestAcceptance(task)
      : [...task.confirmations].reverse().find(entry => entry.gate === gate);
    if (!item) { confirmationStates.push({ gate, confirmed: false, commit: '' }); continue; }
    const expected = expectedSubject(task, gate, item.commit);
    const confirmed = item.subject === expected;
    confirmationStates.push({ gate, confirmed, ...(item.quote ? { quote: item.quote } : {}), ...(item.by ? { by: item.by } : {}),
      commit: item.commit, ...(confirmed ? {} : { issue: '确认对象已变化' }) });
  }
  if (!requirement) issues.push('缺少需求确认。');
  else if (requirement.subject !== requirementsSubject(task)) issues.push('需求确认后需求正文、范围或验收条件已变化，需要重新确认。');
  if (requiresDesign(task)) {
    if (!task.design.trim()) issues.push('standard 开发任务需要填写“## 设计”并确认。');
    const design = [...task.confirmations].reverse().find(item => item.gate === 'design');
    if (!design) issues.push('缺少设计确认。');
    else if (design.subject !== designSubject(task)) issues.push('设计确认后需求或设计已变化，需要重新确认。');
  }
  if (!historicalAccepted) {
    const specIssues = await specMountIssues(root, task);
    if (specIssues.length) issues.push(specOverflowMessage(specIssues, referencedSpecPaths(task)));
  }
  issues.push(...await processHygieneIssues(root, id, task, historicalAccepted));
  const library = await readCaseLibrary(root);
  issues.push(...library.issues);
  warnings.push(...library.warnings);
  let specModules: string[] = [];
  try {
    specModules = (await readdir(path.join(root, '.tiller/specs/modules'), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name);
  } catch { /* Commit format checks do not require module specs to exist. */ }
  warnings.push(...await commitMessageWarnings(root, task.meta.base, specModules));
  const branchWarning = await branchNameWarning(root, id);
  if (branchWarning) warnings.push(branchWarning);
  let matched = 0;
  const criteria: FlowCheck['criteria'] = [];
  for (const item of task.criteria) {
    const evaluated = await evaluateCriterion(root, task, item, library, options, currentTree,
      historicalAccepted, task.verifications.length > 0, context.commit);
    issues.push(...evaluated.issues);
    if (evaluated.covered) matched++;
    criteria.push({
      id: item.id, covered: evaluated.covered,
      ...(evaluated.test ? { test: evaluated.test } : {}),
      ...(evaluated.cases ? { cases: evaluated.cases } : {}),
      ...(evaluated.result ? { result: evaluated.result } : {}),
      ...(evaluated.commit ? { commit: evaluated.commit } : {}),
    });
  }
  let failureFirstValid = true;
  if (task.meta.type === 'bugfix' && !historicalAccepted) {
    const evidence = task.verifications.filter(run => run.expectFail);
    const verifiedBaseline = evidence.find(run => run.source === 'executed' && run.result === 'failed'
      && run.evidence === 'verified' && run.baseline === task.meta.base);
    if (!evidence.length) {
      failureFirstValid = false;
      issues.push('bugfix 任务缺少失败先行验证：先在任务基线运行 verify --expect-fail --test "<文件::测试名>"。');
    } else if (!verifiedBaseline) {
      failureFirstValid = false;
      issues.push('bugfix 任务的失败先行记录未核实，或不是在任务基线上运行。');
    } else {
      const currentPass = task.verifications.some(run => !run.expectFail && run.source === 'executed'
        && run.result === 'passed' && run.evidence === 'verified' && run.tree === currentTree
        && sameTestReference(run.test, verifiedBaseline.test));
      if (!currentPass) {
        failureFirstValid = false;
        issues.push(`bugfix 任务的失败先行测试 ${verifiedBaseline.test} 在当前代码缺少已核实的通过记录。`);
      }
    }
  }
  const changed = await changedFiles(root, task.meta.base, context.commit);
  if (!historicalAccepted && changed !== null) {
    const branch = await currentBranch(root);
    const specs = changed.filter(relative => relative === '.tiller/specs' || relative.startsWith('.tiller/specs/'));
    if ((branch === 'main' || branch === 'master') && specs.length) {
      const shown = specs.slice(0, 5).join('、');
      issues.push(`过程卫生：当前检出位于默认分支 ${branch}，相对任务基线的变更触及 .tiller/specs/（${shown}${specs.length > 5 ? ` 等 ${specs.length} 项` : ''}）。请先 start 任务，在任务 worktree 修改 specs，并随任务 PR/MR 合入；请勿在默认分支直改或直推。`);
    }
  }
  const changedOutsideScope: string[] = [];
  if (changed === null) warnings.push('未检测到可用 Git 基线，范围检查已跳过。');
  else for (const relative of changed) {
    if (excludedPath(relative, id) || taskRecordPath(relative)) continue;
    if (task.meta.preExisting[relative] !== undefined) {
      if (await matchesPreExisting(root, task.meta.preExisting[relative]!, relative, context.commit)) continue;
    }
    if (!inScope(relative, task.meta.scope)) changedOutsideScope.push(relative);
  }
  const regression = regressionWarnings(library, changed ?? []);
  for (const module of library.uncovered) {
    if (!regression.some(item => item.startsWith(`本次改动涉及模块 ${module}：`))) continue;
    const generic = `模块 ${module} 未被任何场景覆盖；请按需补充端到端场景。`;
    const index = warnings.indexOf(generic);
    if (index >= 0) warnings.splice(index, 1);
  }
  warnings.push(...regression);
  warnings.push(...taskDesignThinWarnings(task));
  warnings.push(...businessScopeDeliveryPathWarnings(task));
  const decisionsWarning = await decisionsThinWarning(root);
  if (decisionsWarning) warnings.push(decisionsWarning);
  warnings.push(...await moduleDesignThinWarnings(root, changed ?? task.meta.scope, library));
  if (changed !== null && !requirementBackedBySpecs(task)
      && !changed.some(relative => relative.startsWith('.tiller/specs/') || relative.startsWith('.tiller/context/'))) {
    warnings.push(writebackWarning(task, changed, library));
  }
  if (changedOutsideScope.length) issues.push(`改动超出范围：${changedOutsideScope.join('、')}`);
  const weakened = await weakensTests(root, task.meta.base, context.commit);
  issues.push(...weakened.issues);
  warnings.push(...weakened.warnings);
  if (!historicalAccepted) {
    const uncommitted = await scopedWorkingChanges(root, task.meta.scope, id);
    if (uncommitted === null) warnings.push('未检测到可用 Git 提交，未提交改动检查已跳过。');
    else if (uncommitted.length) issues.push(`交付范围存在未提交改动：${uncommitted.join('、')}`);
  }
  const openBlockers = task.review?.findings.filter(item => item.blocking && !item.resolved).map(item => item.id) ?? [];
  if (openBlockers.length) issues.push(`评审存在未清除阻塞项：${openBlockers.join(', ')}。`);
  issues.push(...recordSafety(task.content));
  for (const stop of retryStops(task)) {
    issues.push(`任务记录 \`${task.path}\`：${retryStopMessage(stop)}`);
  }
  if (acceptance && !acceptanceConfirmed) warnings.push('交付验收后任务对象已变化，需要重新验收。');
  const release = await releaseChecklist(root, { id, accepted: acceptanceConfirmed,
    ...(acceptance?.commit ? { acceptanceCommit: acceptance.commit } : {}), scope: task.meta.scope });
  const tracking = release.items.find(item => item.id === 'managed-entry-tracking');
  if (tracking?.status === 'fail') warnings.push(`${tracking.detail}（release 将阻断）`);
  const uniqueIssues = [...new Set(issues)];
  const uniqueWarnings = [...new Set(warnings)];
  const selfCheck = [
    `- ${uniqueIssues.includes('缺少需求确认。') || uniqueIssues.some(item => item.startsWith('需求确认后')) ? '[ ]' : '[x]'} 需求确认有效`,
    `- ${requiresDesign(task) && uniqueIssues.some(item => item.includes('设计')) ? '[ ]' : '[x]'} ${requiresDesign(task) ? '设计确认有效' : '该任务无需设计确认'}`,
    `- ${criteria.every(item => item.covered) ? '[x]' : '[ ]'} 验收条件均有当前通过且绑定全局用例的测试引用`,
    `- ${matched === task.criteria.length && task.criteria.length > 0 ? '[x]' : '[ ]'} 每条验收条件均映射到本次验证引用的全局用例`,
    `- ${criteria.every(item => item.covered) ? '[x]' : '[ ]'} 验收条件与用例通过 verify 的 AC→测试→CASE 记录关联`,
    `- ${criteria.every(item => item.covered) ? '[x]' : '[ ]'} 验证命令已执行且测试输出已核实`,
    ...(task.meta.type === 'bugfix' ? [`- ${failureFirstValid ? '[x]' : '[ ]'} 缺陷修复包含基线失败与当前通过证据`] : []),
    `- ${library.issues.length ? '[ ]' : '[x]'} 全局用例结构与引用有效`,
    `- ${changedOutsideScope.length ? '[ ]' : '[x]'} 改动未超出范围`,
    `- ${weakened.issues.length ? '[ ]' : '[x]'} 未弱化仍存在的测试`,
    `- ${openBlockers.length ? '[ ]' : '[x]'} 评审无未清除阻塞项`,
    `- ${recordSafety(task.content).length ? '[ ]' : '[x]'} 记录不含密钥或本机绝对路径`,
    ...(uniqueIssues.length ? ['', '阻塞项：', ...uniqueIssues.map(item => `- ${item}`)] : []),
    ...(uniqueWarnings.length ? ['', '提示：', ...uniqueWarnings.map(item => `- ${item}`)] : []),
  ].join('\n');
  return { id, ready: uniqueIssues.length === 0, issues: uniqueIssues, warnings: uniqueWarnings, criteria, confirmations: confirmationStates,
    acceptance: { confirmed: acceptanceConfirmed, ...(acceptance?.quote ? { quote: acceptance.quote } : {}),
      ...(acceptance?.by ? { by: acceptance.by } : {}), ...(acceptance ? { commit: acceptance.commit } : {}) },
    changedOutsideScope,
    cases: { count: library.cases.length, matched, modules: library.modules, scenarios: library.scenarios, uncovered: library.uncovered },
    review: { reviewed: task.review !== null, openBlockers }, release, selfCheck };
}

export async function inspectFlow(rootInput: string, id: string, options: FlowCheckOptions = {}): Promise<FlowCheck> {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot; const task = await readTask(root, id);
  return evaluateFlow(root, id, task, options);
}

export async function checkFlow(rootInput: string, id: string, options: FlowCheckOptions = {}): Promise<FlowCheck> {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  return withProjectLock(root, async () => {
    const task = await readTask(root, id);
    const checked = await evaluateFlow(root, id, task, options);
    const next = renderTask(task, checked.selfCheck);
    if (next !== task.content) await writeTask(root, id, task.content, next, task.meta.preExisting);
    return checked;
  });
}

interface ProcessRun { exitCode: number | null; timedOut: boolean }
interface TestObservation { command: string; result: FlowResult; exitCode: number | null; evidence: 'verified' | 'unverified'; log: string }

function displayCommand(executable: string, args: string[]): string {
  return [executable, ...args].join(' ');
}

async function runProcess(cwd: string, executable: string, args: string[], label: string, log: string[], verbose: boolean): Promise<ProcessRun> {
  const environment: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', FORCE_COLOR: '0' };
  delete environment.NODE_TEST_CONTEXT;
  const invocation = platformProcessInvocation(executable, args);
  log.push(`\n[tiller] command: ${label}\n[tiller] started: ${new Date().toISOString()}\n`);
  return await new Promise<ProcessRun>((resolve, reject) => {
    let timedOut = false;
    const child = spawn(invocation.executable, invocation.args, {
      cwd, stdio: ['inherit', 'pipe', 'pipe'], env: environment, windowsHide: true,
      ...(invocation.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
    });
    const forward = (chunk: Buffer): void => {
      const value = chunk.toString('utf8');
      log.push(value);
      if (verbose) process.stderr.write(value);
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 30 * 60 * 1000);
    child.once('error', error => {
      clearTimeout(timer);
      log.push(`\n[tiller] error: ${error.message}\n[tiller] finished: ${new Date().toISOString()}\n`);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      log.push(`\n[tiller] exit: ${code === null ? 'none' : code}${timedOut ? ' (timeout)' : ''}\n[tiller] finished: ${new Date().toISOString()}\n`);
      resolve({ exitCode: code, timedOut });
    });
  });
}

async function nextLogPath(root: string, id: string, previousRuns: number): Promise<string> {
  const relativeDirectory = `${taskLocalRoot(id)}/logs`;
  await mkdir(path.join(root, relativeDirectory), { recursive: true });
  let maximum = previousRuns;
  try {
    for (const name of await readdir(path.join(root, relativeDirectory))) {
      const match = /^run-(\d+)\.log$/u.exec(name);
      if (match) maximum = Math.max(maximum, Number(match[1]));
    }
  } catch { /* The directory was just created; a missing directory means start at one. */ }
  return `${relativeDirectory}/run-${maximum + 1}.log`;
}

function posixRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

async function runAdapterTest(
  workspace: string,
  projectRoot: string,
  metadata: ProjectMetadata,
  reference: TestReference,
  logPath: string,
  verbose: boolean,
): Promise<TestObservation> {
  const target = resolveVerifyTarget(metadata, reference);
  const runner = runnerFor(target.runner);
  const cwd = path.resolve(workspace, target.cwd);
  const log: string[] = [];
  await mkdir(path.join(workspace, '.tiller/local'), { recursive: true });
  const reportDirectory = await mkdtemp(path.join(workspace, '.tiller/local/verify-'));
  const reportAbsolute = path.join(reportDirectory, 'report.jsonl');
  const reporterAbsolute = path.join(reportDirectory, 'reporter.mjs');
  const reportRelative = posixRelative(cwd, reportAbsolute);
  const reporterRelative = `./${posixRelative(cwd, reporterAbsolute)}`;
  let command = '';
  let evidence: TestEvidence = { verified: false, reason: '私有报告不存在。' };
  try {
    await copyFile(fileURLToPath(new URL('./test-reporter.js', import.meta.url)), reporterAbsolute);
    if (target.prepare?.length) {
      const [executable, ...args] = target.prepare;
      const prepare = await runProcess(cwd, executable!, args, displayCommand(executable!, args), log, verbose);
      if (prepare.exitCode !== 0) fail('VERIFY_PREPARE_FAILED', `验证准备步骤失败（退出码 ${prepare.exitCode ?? '无'}）。`);
    }
    const run = async (pattern: string | undefined): Promise<TestObservation> => {
      await rm(reportAbsolute, { force: true });
      const built = runner.build(target.reference, { reporter: reporterRelative, report: reportRelative }, pattern);
      for (const file of built.files ?? []) {
        if (file.name !== 'junit-gradle.init.gradle') fail('VERIFY_RUNNER_FAILED', '运行器声明了非预期的报告文件。');
        await writeFile(path.join(reportDirectory, file.name), file.content, 'utf8');
      }
      command = target.cwd === '.' ? built.display : `${target.cwd}$ ${built.display}`;
      const processRun = await runProcess(cwd, built.executable, built.args, command, log, verbose);
      let reportText = '';
      try {
        reportText = runner.loadReport
          ? await runner.loadReport(reportAbsolute, reportDirectory)
          : await readFile(reportAbsolute, 'utf8');
      } catch { /* Missing reports are unverified, never passed. */ }
      evidence = runner.parse(reportText, target.reference, path.resolve(workspace, reference.path));
      const result: FlowResult = evidence.outcome === 'failed' ? 'failed' : processRun.exitCode === 0 ? 'passed' : 'failed';
      if (processRun.timedOut) log.push('\n[tiller] 验证命令超时。\n');
      return { command, result, exitCode: processRun.exitCode, evidence: evidence.verified ? 'verified' : 'unverified', log: logPath };
    };
    return await run(namePattern(target.reference));
  } finally {
    await mkdir(path.dirname(path.join(projectRoot, logPath)), { recursive: true });
    await writeFile(path.join(projectRoot, logPath), log.join(''), 'utf8');
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

async function executeBaseline(
  root: string,
  base: string,
  metadata: ProjectMetadata,
  reference: TestReference,
  logPath: string,
  verbose: boolean,
): Promise<TestObservation> {
  if (base === 'no-git') fail('BASELINE_UNAVAILABLE', '失败先行验证需要 Git 基线，当前任务没有可用提交。');
  const holder = await mkdtemp(path.join(tmpdir(), 'tiller-baseline-'));
  const worktree = path.join(holder, 'worktree');
  let added = false;
  try {
    const created = await git(root, ['worktree', 'add', '--detach', worktree, base]);
    if (!created.ok) fail('BASELINE_WORKTREE_FAILED', `无法创建基线工作树：${created.stderr.trim()}`);
    added = true;
    await mkdir(path.dirname(path.join(worktree, reference.path)), { recursive: true });
    await copyFile(path.join(root, reference.path), path.join(worktree, reference.path));
    try {
      const dependencies = await lstat(path.join(root, 'node_modules'));
      if (dependencies.isDirectory()) await symlink(path.join(root, 'node_modules'), path.join(worktree, 'node_modules'), 'junction');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return await runAdapterTest(worktree, root, metadata, reference, logPath, verbose);
  } finally {
    if (added) await git(root, ['worktree', 'remove', '--force', worktree]);
    await git(root, ['worktree', 'prune']);
    await rm(holder, { recursive: true, force: true });
  }
}

export async function verifyFlow(rootInput: string, id: string, input: FlowVerifyInput) {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  return withProjectLock(root, async () => {
    const task = await readTask(root, id);
    assertTaskOpen(task);
    if (input.clearPremature) {
      if (input.test || input.case || input.reported || input.expectFail || (input.criteria?.length ?? 0)) {
        fail('INVALID_FLOW_INPUT', '--clear-premature 不能与 --test/--case/--criterion/--reported/--expect-fail 同用。');
      }
      const design = requiresDesign(task)
        ? [...task.confirmations].reverse().find(item => item.gate === 'design' && item.subject === designSubject(task))
        : undefined;
      const kept = design
        ? task.verifications.filter(run => Date.parse(run.at) >= Date.parse(design.at))
        : [];
      const removed = task.verifications.length - kept.length;
      if (!removed) {
        return { ok: true, id, cleared: 0, path: task.path, next: '没有可清除的过早 verify 段。' };
      }
      const next: FlowTask = { ...task, verifications: kept };
      await writeTask(root, id, task.content, renderTask(next));
      const committed = await commitTaskRecords(root, id, 'chore: 清除过早验证');
      return {
        ok: true, id, cleared: removed, path: task.path,
        ...(committed.commit ? { recordsCommit: committed.commit } : {}),
        ...(committed.warning ? { warnings: [committed.warning] } : {}),
        next: `已清除 ${removed} 条设计确认前的 verify 段；可继续 confirm design 或按序重新 verify。`,
      };
    }
    if (requiresDesign(task)) {
      const design = [...task.confirmations].reverse().find(item => item.gate === 'design' && item.subject === designSubject(task));
      if (!design) {
        fail('VERIFY_BEFORE_DESIGN',
          `standard 任务须先确认设计再 verify；请运行 tiller confirm ${id} design。若历史已有错序 verify 段，可用 tiller verify ${id} --clear-premature 清除。`);
      }
    }
    const library = await readCaseLibrary(root);
    const requested = [...new Set((input.criteria ?? []).map(value => value.trim()).filter(Boolean))];
    if (Boolean(input.test) === Boolean(input.case)) fail('INVALID_FLOW_INPUT', 'verify 需要 --test "<文件::测试名>" 或 --case CASE-xxx，两者只能选一个。');
    let criteria: string[];
    let references: TestReference[] = [];
    let selectedCase: GlobalCase | undefined;
    if (input.case) {
      if (!/^CASE-\d+$/u.test(input.case.trim())) fail('INVALID_CASE_ID', '用例编号格式为 CASE-NNN。');
      selectedCase = library.cases.find(item => item.id === input.case!.trim());
      if (!selectedCase) fail('UNKNOWN_CASE', `全局用例不存在：${input.case}`);
      if (input.reported) fail('INVALID_FLOW_INPUT', '外部报告只接受 --test；--case 必须由 tiller 执行覆盖测试。');
      if (!selectedCase.tests.length) fail('CASE_PENDING', `用例 ${selectedCase.id} 待实现：尚无测试名引用该用例。先在测试名中加入 ${selectedCase.id}。`);
      const linkedCriteria = selectedCase.criteria.filter(value => value.startsWith(`${id}#`)).map(value => value.split('#')[1]!);
      criteria = requested.length ? requested : linkedCriteria;
      if (!criteria.length) fail('UNKNOWN_CRITERION', `用例 ${selectedCase.id} 不再内嵌任务 AC；请用 --criterion 指定本次验收条件。`);
      references = selectedCase.tests.map(reference => ({ ...reference }));
    } else {
      if (!input.test) fail('INVALID_FLOW_INPUT', 'verify 需要 --test "<文件::测试名>" 或 --case CASE-xxx。');
      const test = testReference(input.test);
      const reference = fallbackTestReference(test);
      if (!reference) fail('INVALID_TEST_REFERENCE', `测试引用无效：${test}`);
      for (const match of test.matchAll(/\bCASE-\d+\b/gu)) {
        if (!library.cases.some(item => item.id === match[0])) fail('UNKNOWN_CASE', `测试引用了不存在的用例 ${match[0]}：${test}`);
      }
      references = [reference];
      criteria = requested;
      if (!criteria.length) fail('INVALID_FLOW_INPUT', '至少提供一个 --criterion。');
    }
    for (const criterion of criteria) if (!task.criteria.some(item => item.id === criterion)) fail('UNKNOWN_CRITERION', `验收条件不存在：${criterion}`);
    if (input.test) {
      const test = references[0]!;
      if (!(await testExists(root, testLabel(test)))) fail('TEST_NOT_FOUND', `测试引用不存在：${testLabel(test)}`);
    }
    for (const reference of references) {
      if (!(await testExists(root, reference.path))) fail('TEST_NOT_FOUND', `测试文件不存在：${reference.path}`);
    }
    const expectFail = input.expectFail === true;
    if (expectFail && task.meta.type !== 'bugfix') fail('INVALID_EXPECT_FAIL', '--expect-fail 仅适用于 bugfix 任务。');
    if (expectFail && references.length !== 1) fail('INVALID_EXPECT_FAIL', '失败先行验证只能引用一个具名测试；请用 --test 指定。');
    if (expectFail && !references[0]!.name) fail('INVALID_EXPECT_FAIL', '失败先行验证必须引用具名测试（文件::测试名）。');
    const metadata = input.reported ? null : await readProjectMetadata(root);
    const entries: FlowVerification[] = [];
    const commit = await currentCommit(root, undefined);
    const tree = await treeDigest(root, task.meta.scope, id);
    const at = new Date().toISOString();
    for (const [index, reference] of references.entries()) {
      const test = testLabel(reference);
      let command: string;
      let result: FlowResult;
      let exitCode: number | null = null;
      let source: FlowVerification['source'];
      let evidence: FlowVerification['evidence'];
      let reason: string | undefined;
      let logPath: string | undefined;
      if (!input.reported) {
        logPath = await nextLogPath(root, id, task.verifications.length + index);
        const observation = expectFail
          ? await executeBaseline(root, task.meta.base, metadata!, reference, logPath, input.verbose === true)
          : await runAdapterTest(root, root, metadata!, reference, logPath, input.verbose === true);
        command = observation.command;
        result = observation.result;
        exitCode = observation.exitCode;
        evidence = observation.evidence;
        source = 'executed';
        if (expectFail && evidence === 'verified' && result !== 'failed') {
          fail('EXPECTED_FAILURE_NOT_OBSERVED', `基线运行未出现具名测试失败：${reference.name}。`);
        }
      } else {
        if (expectFail) fail('INVALID_EXPECT_FAIL', '--expect-fail 必须由 tiller 在基线工作树中自主执行。');
        if (input.result === undefined) fail('INVALID_FLOW_INPUT', '外部报告必须提供 --result。');
        command = safeInput(text(input.command ?? '', '验证命令', 4000), '验证命令');
        reason = safeInput(text(input.reason ?? '', '外部报告理由', 1000), '外部报告理由');
        result = flowResult(input.result);
        source = 'reported';
        evidence = 'not-run';
      }
      const caseIds = input.case ? [selectedCase!.id] : casesForTest(library, test).map(item => item.id);
      entries.push({
        id: `run-${task.verifications.length + index + 1}`,
        criterion: criteria[0]!, test, cases: caseIds, command, result, exitCode, commit, at, tree, source, evidence,
        ...(reason ? { reason } : {}), ...(expectFail ? { expectFail: true, baseline: task.meta.base } : {}),
        ...(logPath ? { log: logPath } : {}),
      });
    }
    const nextEntries: FlowVerification[] = [];
    for (const [criterionIndex, criterion] of criteria.entries()) {
      for (const [entryIndex, entry] of entries.entries()) {
        nextEntries.push({ ...entry, criterion,
          id: `run-${task.verifications.length + criterionIndex * entries.length + entryIndex + 1}` });
      }
    }
    const next: FlowTask = { ...task, verifications: [...task.verifications, ...nextEntries] };
    const { content: _content, path: _path, ...body } = next;
    await writeTask(root, id, task.content, renderTask(body, sectionBody(task.content, '自检')), body.meta.preExisting);
    const ready = expectFail
      ? nextEntries.every(entry => entry.evidence === 'verified' && entry.result === 'failed')
      : nextEntries.every(entry => entry.result === 'passed');
    const result: FlowResult = expectFail ? 'failed' : ready ? 'passed' : 'failed';
    const evidence = nextEntries.every(entry => entry.evidence === 'verified') ? 'verified'
      : nextEntries.every(entry => entry.evidence === 'not-run') ? 'not-run' : 'unverified';
    const tests = entries.map(entry => entry.test);
    const logs = nextEntries.flatMap(entry => entry.log ? [entry.log] : []);
    const touchedKeys = new Set(nextEntries.flatMap(entry => [
      `AC:${entry.criterion}`,
      ...entry.cases.map(caseId => `CASE:${caseId}`),
    ]));
    const stops = retryStops(next).filter(stop => touchedKeys.has(stop.key));
    const nextCommand = stops.length
      ? stops.map(retryStopMessage).join(' ')
      : expectFail
        ? `修复后在当前代码运行：tiller verify ${id} --criterion ${criteria[0]} --test "${entries[0]!.test}"`
        : evidence === 'unverified' ? `check 将阻断未核实记录：tiller check ${id}`
          : ready ? `tiller check ${id}` : '修复后重新运行验证';
    return { id, result, ready, cases: [...new Set(entries.flatMap(entry => entry.cases))], tests,
      commit, tree, evidence, ...(logs[0] ? { log: logs[0] } : {}), ...(logs.length > 1 ? { logs } : {}),
      ...(stops.length ? { stop: true, retryStops: stops } : {}), entries: nextEntries, next: nextCommand };
  });
}
function flowResult(value: string): FlowResult {
  if (!RESULTS.includes(value as FlowResult)) fail('INVALID_RESULT', `验证结果必须是：${RESULTS.join(', ')}。`);
  return value as FlowResult;
}

export async function acceptFlow(rootInput: string, id: string, input: FlowConfirmInput = {}) {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  const task = await readTask(root, id);
  assertTaskOpen(task);
  const specIssues = await specMountIssues(root, task);
  if (specIssues.length) fail('SPEC_OVERFLOW', specOverflowMessage(specIssues, referencedSpecPaths(task)));
  const checked = await checkFlow(root, id, {
    allowReported: input.allowReported === true,
    ignoreAcceptance: true,
  });
  if (!checked.ready) fail('NOT_READY', `技术自检未通过：${checked.issues.join('；')}`);
  return confirmFlow(root, id, 'acceptance', input);
}

export async function reviewFlow(rootInput: string, id: string, input: FlowReviewInput = {}) {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  return withProjectLock(root, async () => {
    const task = await readTask(root, id);
    assertTaskOpen(task);
    const by = safeInput(await resolveConfirmer(root, input.by), '评审人');
    const at = new Date().toISOString();
    const findings = (task.review?.findings ?? []).map(item => ({ ...item }));
    const warnings: string[] = [];
    for (const raw of input.resolve ?? []) {
      const findingId = raw.trim();
      if (!/^REV-\d+$/u.test(findingId)) fail('INVALID_REVIEW_FINDING', `评审发现编号格式为 REV-NNN：${raw}`);
      const finding = findings.find(item => item.id === findingId);
      if (!finding) fail('UNKNOWN_REVIEW_FINDING', `评审发现不存在：${findingId}`);
      if (finding.resolved) warnings.push(`评审发现 ${findingId} 已经解决。`);
      else Object.assign(finding, { resolved: true, resolvedBy: by, resolvedAt: at });
    }
    let next = findings.reduce((maximum, item) => Math.max(maximum, Number(item.id.slice(4))), 0) + 1;
    const append = (values: string[] | undefined, blocking: boolean): void => {
      for (const raw of values ?? []) {
        const findingText = safeInput(text(raw, '评审发现', 4000), '评审发现');
        const finding: FlowReviewFinding = { id: `REV-${String(next).padStart(3, '0')}`, text: findingText,
          blocking, resolved: false, by, at };
        findings.push(finding);
        next += 1;
      }
    };
    append(input.findings, false);
    append(input.blocking, true);
    const review: FlowReview = { by, at, findings };
    const nextTask = { ...task, review };
    const { content: _content, path: _path, ...body } = nextTask;
    await writeTask(root, id, task.content, renderTask(body, sectionBody(task.content, '自检')), body.meta.preExisting);
    const openBlockers = findings.filter(item => item.blocking && !item.resolved);
    return { id, path: task.path, by, at, reviewed: true, ready: openBlockers.length === 0,
      findings, openBlockers: openBlockers.map(item => item.id), warnings,
      next: openBlockers.length ? `修复后用 --resolve 清除阻塞项，再运行 tiller check ${id}` : `运行 tiller check ${id} 后验收` };
  });
}

export async function releaseFlow(rootInput: string, id: string) {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  const task = await readTask(root, id);
  const stage = await taskStageForTask(root, id, task);
  const acceptance = latestAcceptance(task);
  const checklist = await releaseChecklist(root, {
    id, accepted: stage.stage === '已验收' || stage.stage === '已关闭',
    ...(acceptance?.commit ? { acceptanceCommit: acceptance.commit } : {}), scope: task.meta.scope,
  });
  return { id, path: task.path, stage: stage.stage, stageReason: stage.reason,
    ...(acceptance?.commit ? { acceptanceCommit: acceptance.commit } : {}), ...checklist };
}

interface TaskMergeProof { merged: boolean; detail: string }

async function proveTaskMerged(root: string, taskRoot: string, id: string, metadata: ProjectMetadata,
  task: FlowTask): Promise<TaskMergeProof> {
  const relative = taskPath(id);
  const current = await readTextIfExists(taskRoot, relative);
  const tracked = await git(root, ['show', `HEAD:${relative}`]);
  if (current !== null && tracked.ok && tracked.stdout === current) {
    return { merged: true, detail: `主检出的跟踪任务记录与 ${id} 的当前验收记录一致。` };
  }

  const branch = taskBranchName(task.meta);
  const tip = await git(root, ['rev-parse', '--verify', `refs/heads/${branch}`]);
  if (tip.ok) {
    const candidates = [
      'HEAD', 'refs/heads/main', 'refs/heads/master',
      'refs/remotes/origin/main', 'refs/remotes/origin/master',
    ];
    for (const candidate of candidates) {
      if ((await git(root, ['merge-base', '--is-ancestor', tip.stdout.trim(), candidate])).ok) {
        return { merged: true, detail: `任务分支 ${branch} 已进入 ${candidate} 的历史。` };
      }
    }
  }

  let detail = '平台未确认该任务分支已合入';
  if (!tip.ok) {
    detail = `无法读取任务分支 ${branch} 的当前 tip，不能证明合入`;
    return { merged: false, detail };
  }
  try {
    const repository = await resolvePlatformRepository(root, metadata.platform ?? 'github');
    const token = platformToken(repository.platform);
    if (!token) {
      detail = `缺少 ${repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN'}，无法确认平台合入状态`;
    } else {
      const merged = await findMergedIntegration(repository, token, branch, tip.stdout.trim());
      if (merged) {
        return { merged: true, detail: `平台已确认任务分支 ${branch} 当前 tip 的 PR/MR #${merged.number} 合入。` };
      }
    }
  } catch (error) {
    detail = `平台合入状态查询失败：${(error as Error).message}`;
  }
  return { merged: false, detail };
}

async function persistAbandonedTask(root: string, task: FlowTask, content: string): Promise<string> {
  const id = task.meta.id;
  const relative = taskPath(id);
  const branch = await currentBranch(root);
  if (!branch || branch === taskBranchName(task.meta)) {
    fail('ABANDON_NOT_PERSISTABLE', `任务 ${id} 的放弃事件无法提交到会被保留的分支；请从 primary 的默认分支重试。本机任务事实未清理。`);
  }
  const previous = await readTextIfExists(root, relative);
  let target: string;
  try { target = await assertSafePath(root, relative); }
  catch (error) {
    fail('ABANDON_NOT_PERSISTABLE', `任务 ${id} 的放弃事件路径不可写：${(error as Error).message}。本机任务事实未清理。`);
  }
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    if (previous === null) {
      const intent = await git(root, ['add', '-N', '--', relative]);
      if (!intent.ok) throw new Error(intent.stderr.trim() || 'git add -N 失败');
    }
    const [name, email] = await Promise.all([
      git(root, ['config', 'user.name']),
      git(root, ['config', 'user.email']),
    ]);
    const author = name.ok && name.stdout.trim() ? name.stdout.trim() : 'tiller';
    const address = email.ok && email.stdout.trim() ? email.stdout.trim() : 'tiller@localhost';
    const committed = await git(root, [
      '-c', `user.name=${author}`, '-c', `user.email=${address}`,
      'commit', '--quiet', '--only', '-m', `chore(workflow): 放弃任务 ${id} [${id}]`, '--', relative,
    ]);
    if (!committed.ok) throw new Error(committed.stderr.trim() || 'git commit 失败');
    const commit = await head(root);
    if (!commit) throw new Error('提交后无法读取 HEAD');
    return commit;
  } catch (error) {
    await git(root, ['reset', '--quiet', 'HEAD', '--', relative]);
    try {
      if (previous === null) await rm(target, { force: true });
      else await writeFile(target, previous, 'utf8');
    } catch { /* Report the persistence failure below; do not proceed to cleanup. */ }
    fail('ABANDON_NOT_PERSISTABLE', `任务 ${id} 的放弃事件无法写入并提交到 primary：${(error as Error).message}。本机任务事实未清理。`);
  }
}


export async function closeFlow(rootInput: string, id: string, reasonInput: string, abandon = false,
  options: { keepBranch?: boolean; merged?: boolean } = {}) {
  const { primary: root, taskRoot } = await resolveTaskCheckout(rootInput, id);
  const reason = safeInput(text(reasonInput, '关闭原因', 4000), '关闭原因');
  return withProjectLock(root, async () => {
    const metadata = await readProjectMetadata(taskRoot);
    if (isInitBaselineId(id)) {
      if (abandon) fail('INIT_BASELINE_CLOSE', '初始化基线不是任务，不能使用 --abandon；直接 close 只清理本机目录。');
      if (!metadata.initBaseline || metadata.initBaseline.id !== id) {
        fail('INIT_BASELINE_NOT_FOUND', `工程元信息中没有初始化基线 ${id}。`);
      }
      const proof = await proveInitBaselineMerged(root, metadata);
      if (!proof.merged) {
        fail('INIT_BASELINE_PENDING', `初始化基线 ${id} 尚未确认合入：${proof.detail}。本机初始化事实未清理。`);
      }
      const cleanup = await cleanupTaskWorktrees(root, id, metadata);
      const branchCleanup = metadata.initBaseline
        ? await cleanupTaskBranches(root, metadata, metadata.initBaseline.branch, options)
        : null;
      const warnings = [...cleanup.warnings, ...(branchCleanup?.warnings ?? [])];
      return { id, stage: '已关闭', stageReason: '初始化基线本机清理完成；共享记录未改写。', reason,
        at: new Date().toISOString(), worktrees: cleanup.removedWorktrees, missingWorktrees: cleanup.missingWorktrees,
        logsRemoved: cleanup.logsRemoved, ...(branchCleanup ? { branch: branchCleanup } : {}),
        ...(warnings.length ? { warnings } : {}),
        proof,
        next: '初始化基线已证明合入，本机目录已清理；共享 task 记录不受影响。' };
    }
    const task = await readTask(taskRoot, id);
    const ended = terminalStage(task);
    if (ended) fail('TASK_ENDED', `任务当前阶段为${ended.stage}；如需继续，先执行 reopen。`);
    const current = await taskStageForTask(taskRoot, id, task);
    if (current.stage !== '已验收' && !abandon) {
      fail('NOT_ACCEPTED', `任务当前阶段为${current.stage}；只有已验收任务可以 close，未验收终止请使用 --abandon。`);
    }
    if (!abandon) {
      const proof = options.merged === true
        ? { merged: true, detail: '平台 API 已确认本次合入成功。' }
        : await proveTaskMerged(root, taskRoot, id, metadata, task);
      if (!proof.merged) {
        fail('CLOSE_MERGE_PROOF_MISSING', `任务 ${id} 尚无合入证明：${proof.detail}。先合入任务分支或更新默认分支后重试 close；本机任务事实未清理。`);
      }
      const at = new Date().toISOString();
      // Do not materialize `.tiller/task/<id>/` onto primary; merged history arrives via ff/pull.
      const cleanup = await cleanupTaskWorktrees(root, id, metadata);
      const branchCleanup = await cleanupTaskBranches(root, metadata, taskBranchName(task.meta), options);
      const warnings = [...cleanup.warnings, ...branchCleanup.warnings];
      const recordAvailable = await readTextIfExists(root, taskPath(id)) !== null;
      return { id, stage: current.stage, stageReason: '交付验收有效；本机清理完成。', reason, at, path: task.path,
        worktrees: cleanup.removedWorktrees, missingWorktrees: cleanup.missingWorktrees, logsRemoved: cleanup.logsRemoved,
        branch: branchCleanup, ...(warnings.length ? { warnings } : {}),
        next: recordAvailable
          ? `任务已交付；如需继续修改，执行 tiller reopen ${id} --reason "<原因>".`
          : '任务已交付并清理；当前检出没有可读取任务记录，不能直接 reopen。' };
    }
    const closure: FlowClosure = {
      action: 'close', status: 'abandoned', reason,
      at: new Date().toISOString(),
    };
    const next = { ...task, closures: [...task.closures, closure] };
    const { content: _content, path: _path, ...body } = next;
    const persistedCommit = await persistAbandonedTask(root, task, renderTask(body, sectionBody(task.content, '自检')));
    const stage = terminalStage(next)!;
    const cleanup = await cleanupTaskWorktrees(root, id, metadata);
    const branchCleanup = await cleanupTaskBranches(root, metadata, taskBranchName(task.meta), options);
    const warnings = [...cleanup.warnings, ...branchCleanup.warnings];
    return { id, stage: stage.stage, stageReason: stage.reason, reason, at: closure.at, path: task.path,
      worktrees: cleanup.removedWorktrees, missingWorktrees: cleanup.missingWorktrees, logsRemoved: cleanup.logsRemoved,
      branch: branchCleanup, persistedCommit, ...(warnings.length ? { warnings } : {}),
      next: `如需继续修改，执行 tiller reopen ${id} --reason "<原因>".` };
  });
}

export async function reopenFlow(rootInput: string, id: string, reasonInput: string) {
  const root = (await resolveTaskCheckout(rootInput, id)).taskRoot;
  const reason = safeInput(text(reasonInput, '重开原因', 4000), '重开原因');
  return withProjectLock(root, async () => {
    const task = await readTask(root, id);
    if (!terminalStage(task) && (await taskStageForTask(root, id, task)).stage !== '已验收') {
      fail('TASK_NOT_CLOSED', '任务尚未进入已验收或终止阶段，不能 reopen。');
    }
    const event: FlowClosure = { action: 'reopen', reason, at: new Date().toISOString() };
    const next = { ...task, closures: [...task.closures, event] };
    const { content: _content, path: _path, ...body } = next;
    await writeTask(root, id, task.content, renderTask(body, sectionBody(task.content, '自检')), body.meta.preExisting);
    const stage = await taskStage(root, id);
    return { id, stage: stage.stage, stageReason: stage.reason, reason, at: event.at, path: task.path,
      next: stage.stage === '已验收' ? `tiller close ${id} --reason "<原因>"` : `tiller resume ${id}` };
  });
}
