import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readProjectMetadata } from './core.js';
import { resolveConfirmer } from './confirmer.js';
import { applyChanges, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { validateTaskId } from './task-id.js';
import type { FlowStage } from './flow.js';

const execFileAsync = promisify(execFile);
const PLAN_DIRECTORY = '.tiller/plans';
const TASK_DIRECTORY = '.tiller/task';
const PLAN_VERSION = 1;
const PLAN_MARKER = '<!-- tiller-plan:v1 ';
const PLAN_MARKER_END = ' -->';
const ITEM_ID = /^[A-Za-z][A-Za-z0-9._-]{0,39}$/u;

export const PLAN_ITEM_STATUSES = ['未开始', '进行中', '已验收', '已放弃'] as const;
export type PlanItemStatus = typeof PLAN_ITEM_STATUSES[number];
export type PlanSize = 'small' | 'standard';

export interface PlanItem {
  id: string;
  title: string;
  size: PlanSize;
  dependencies: string[];
  requirements: string[];
  childPlan?: string;
}

export interface PlanConfirmation {
  object: string;
  quote?: string;
  by?: string;
  commit: string;
  subject: string;
  at: string;
  style?: 'legacy';
}

export interface PlanMeta {
  version: 1;
  id: string;
  created: string;
  title: string;
  goal: string;
  requirements: string[];
  items: PlanItem[];
  confirmations: PlanConfirmation[];
}

export interface ProjectPlan {
  meta: PlanMeta;
  content: string;
  path: string;
  bodyMatches: boolean;
}

export interface PlanStartInput {
  title: string;
  goal: string;
  requirements: string[];
  items: string[];
}

export interface PlanConfirmInput { quote?: string; commit?: string; by?: string }

export interface PlanItemState {
  id: string;
  title: string;
  size: PlanSize;
  dependencies: string[];
  requirements: string[];
  childPlan?: string;
  status: PlanItemStatus;
  tasks: { id: string; stage: FlowStage; accepted: boolean }[];
  blockedBy: string[];
}

export interface PlanStatus {
  id: string;
  title: string;
  path: string;
  confirmed: boolean;
  confirmationIssue?: string;
  items: PlanItemState[];
  uncoveredRequirements: string[];
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function line(value: unknown, label: string, maximum = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) {
    fail('INVALID_PLAN_INPUT', `${label}必须是非空单行文本，且不超过 ${maximum} 字符。`);
  }
  const normalized = value.replace(/\s+/gu, ' ').trim();
  const unsafe = safetyIssues(normalized);
  if (unsafe.length) fail('UNSAFE_RECORD', `${label}${unsafe.join('；')}`);
  return normalized;
}

function safetyIssues(value: string): string[] {
  const patterns: [RegExp, string][] = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, '包含私钥'],
    [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/u, '包含疑似访问令牌'],
    [/(?:^|[\s"'`=:(])(?:\/(?:home|Users|workspace|tmp|var|private|mnt|opt|srv)\/|[A-Za-z]:\\)/u, '包含本机绝对路径'],
    [/\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'`]?[^\s"'`]{8,}/iu, '包含疑似密钥赋值'],
  ];
  return patterns.filter(([pattern]) => pattern.test(value)).map(([, message]) => message);
}

function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function planPath(id: string): string { return `${PLAN_DIRECTORY}/${id}.md`; }
function planSubject(meta: Pick<PlanMeta, 'title' | 'goal' | 'requirements' | 'items'>): string {
  return sha(JSON.stringify({ title: meta.title, goal: meta.goal, requirements: meta.requirements, items: meta.items }));
}

function references(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) fail('INVALID_PLAN_INPUT', `${label}至少需要一个 specs 引用。`);
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim()) fail('INVALID_PLAN_INPUT', `${label}必须是 specs 引用。`);
    const relative = entry.trim().split('#')[0]!;
    try { validateRelativePath(relative); } catch { fail('INVALID_PLAN_INPUT', `${label}必须是工程相对路径：${entry}`); }
    if (path.posix.isAbsolute(relative) || relative.includes('\\')) fail('INVALID_PLAN_INPUT', `${label}必须是工程相对路径：${entry}`);
    if (!relative.startsWith('.tiller/specs/')) fail('INVALID_PLAN_INPUT', `${label}必须引用 .tiller/specs/：${entry}`);
    result.push(entry.trim());
  }
  return [...new Set(result)];
}

function itemSize(value: string | undefined): PlanSize {
  const actual = value ?? 'standard';
  if (actual === 'large') return 'standard';
  if (actual !== 'small' && actual !== 'standard') fail('INVALID_PLAN_INPUT', '任务粒度必须是 small 或 standard。');
  return actual;
}

function parseItem(value: string, planRequirements: string[]): PlanItem {
  const fields = value.split(';').map(field => field.trim()).filter(Boolean);
  const heading = fields.shift() ?? '';
  const match = /^([A-Za-z][A-Za-z0-9._-]{0,39})\s*=\s*(.+)$/u.exec(heading);
  if (!match) fail('INVALID_PLAN_INPUT', '--item 格式为 "P-1=标题;size=small;deps=P-0;specs=路径#章节"。');
  const id = match[1]!;
  const title = line(match[2], `条目 ${id} 标题`, 200);
  let size: PlanSize = 'standard';
  let dependencies: string[] = [];
  let requirements = planRequirements;
  let childPlan: string | undefined;
  for (const field of fields) {
    const separator = field.indexOf('=');
    if (separator <= 0) fail('INVALID_PLAN_INPUT', `无法解析条目字段：${field}`);
    const key = field.slice(0, separator).trim();
    const raw = field.slice(separator + 1).trim();
    if (key === 'size') size = itemSize(raw);
    else if (key === 'deps') {
      dependencies = raw === '-' || raw === '无' ? [] : raw.split(',').map(value => value.trim()).filter(Boolean);
      for (const dependency of dependencies) {
        if (!ITEM_ID.test(dependency)) fail('INVALID_PLAN_INPUT', `依赖编号无效：${dependency}`);
      }
      dependencies = [...new Set(dependencies)];
    } else if (key === 'specs') requirements = references(raw.split(',').map(value => value.trim()).filter(Boolean), `条目 ${id} 覆盖需求`);
    else if (key === 'plan') {
      validateTaskId(raw);
      childPlan = raw;
    }
    else fail('INVALID_PLAN_INPUT', `未知条目字段：${key}`);
  }
  return { id, title, size, dependencies, requirements, ...(childPlan ? { childPlan } : {}) };
}

function parseMeta(raw: string, id: string): PlanMeta {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { fail('INVALID_PLAN', '规划元信息不是有效 JSON。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PLAN', '规划元信息格式无效。');
  const data = value as Record<string, unknown>;
  if (data.version !== PLAN_VERSION || data.id !== id) fail('INVALID_PLAN', '规划元信息版本或标识不匹配。');
  if (typeof data.created !== 'string' || !Number.isFinite(Date.parse(data.created))) fail('INVALID_PLAN', '规划创建时间无效。');
  const title = line(data.title, '规划标题', 200);
  const goal = line(data.goal, '规划目标');
  const requirements = references(data.requirements, '规划关联需求');
  if (!Array.isArray(data.items) || !data.items.length) fail('INVALID_PLAN', '规划至少需要一个任务条目。');
  const items: PlanItem[] = [];
  for (const rawItem of data.items) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) fail('INVALID_PLAN', '规划任务条目格式无效。');
    const item = rawItem as Record<string, unknown>;
    const itemId = typeof item.id === 'string' && ITEM_ID.test(item.id) ? item.id : null;
    if (!itemId) fail('INVALID_PLAN', '规划任务条目编号无效。');
    if (items.some(entry => entry.id === itemId)) fail('INVALID_PLAN', `规划任务条目编号重复：${itemId}`);
    if (!Array.isArray(item.dependencies) || item.dependencies.some(entry => typeof entry !== 'string' || !ITEM_ID.test(entry))) {
      fail('INVALID_PLAN', `条目 ${itemId} 的依赖格式无效。`);
    }
    const childPlan = item.childPlan === undefined ? undefined : typeof item.childPlan === 'string' ? item.childPlan : null;
    if (childPlan === null) fail('INVALID_PLAN', `条目 ${itemId} 的子规划格式无效。`);
    if (childPlan) validateTaskId(childPlan);
    items.push({
      id: itemId,
      title: line(item.title, `条目 ${itemId} 标题`, 200),
      size: itemSize(typeof item.size === 'string' ? item.size : undefined),
      dependencies: [...new Set(item.dependencies as string[])],
      requirements: references(item.requirements, `条目 ${itemId} 覆盖需求`),
      ...(childPlan ? { childPlan } : {}),
    });
  }
  const ids = new Set(items.map(item => item.id));
  for (const item of items) for (const dependency of item.dependencies) {
    if (dependency === item.id) fail('INVALID_PLAN', `条目 ${item.id} 不能依赖自身。`);
    if (!ids.has(dependency)) fail('INVALID_PLAN', `条目 ${item.id} 的依赖不存在：${dependency}`);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (itemId: string): void => {
    if (visiting.has(itemId)) fail('INVALID_PLAN', `规划条目依赖存在环：${itemId}`);
    if (visited.has(itemId)) return;
    visiting.add(itemId);
    for (const dependency of items.find(item => item.id === itemId)!.dependencies) visit(dependency);
    visiting.delete(itemId); visited.add(itemId);
  };
  for (const item of items) visit(item.id);
  const confirmations: PlanConfirmation[] = [];
  if (data.confirmations !== undefined) {
    if (!Array.isArray(data.confirmations)) fail('INVALID_PLAN', '规划确认记录格式无效。');
    for (const rawConfirmation of data.confirmations) {
      if (!rawConfirmation || typeof rawConfirmation !== 'object' || Array.isArray(rawConfirmation)) fail('INVALID_PLAN', '规划确认记录格式无效。');
      const entry = rawConfirmation as Record<string, unknown>;
      if (entry.object !== '规划正文（目标、关联需求与任务条目）'
        || typeof entry.commit !== 'string' || !/^(?:[a-f0-9]{7,64}|no-git)$/u.test(entry.commit)
        || typeof entry.subject !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.subject)
        || typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at))) fail('INVALID_PLAN', '规划确认记录不完整。');
      const quote = typeof entry.quote === 'string' ? entry.quote.trim() : '';
      const by = typeof entry.by === 'string' && entry.by.trim() ? line(entry.by, '确认人', 200) : '';
      if (!quote && !by) fail('INVALID_PLAN', '规划确认记录缺少确认人或用户原话。');
      confirmations.push({ object: entry.object, ...(quote ? { quote } : {}), ...(by ? { by } : {}),
        commit: entry.commit, subject: entry.subject, at: entry.at, ...(!by ? { style: 'legacy' as const } : {}) });
    }
  }
  return { version: 1, id, created: data.created, title, goal, requirements, items, confirmations };
}

function withoutPlanMarker(content: string): string {
  return content.replace(/^<!-- tiller-plan:v1 \{.*\} -->\n?/mu, '').replace(/\r\n/gu, '\n').trimEnd();
}

function visiblePlan(meta: PlanMeta): string {
  return withoutPlanMarker(renderPlan({ ...meta, confirmations: [] })).split('\n## 确认\n')[0]!.trimEnd();
}

function visiblePlanContent(content: string): string {
  return withoutPlanMarker(content).split('\n## 确认\n')[0]!.trimEnd();
}

function renderPlan(meta: PlanMeta): string {
  const parts = [
    `# ${meta.title}`,
    `${PLAN_MARKER}${JSON.stringify(meta)}${PLAN_MARKER_END}`,
    '## 目标',
    meta.goal,
    '## 关联需求',
    meta.requirements.map(reference => `- ${reference}`).join('\n'),
    '## 任务条目',
    meta.items.map(item => [
      `### ${item.id} ${item.title}`,
      `- 粒度：${item.size}`,
      `- 依赖：${item.dependencies.length ? item.dependencies.join(', ') : '无'}`,
      `- 覆盖需求：${item.requirements.join(', ')}`,
      ...(item.childPlan ? [`- 子规划：${item.childPlan}`] : []),
    ].join('\n')).join('\n\n'),
    '## 确认',
    meta.confirmations.length ? meta.confirmations.map(confirmation => confirmation.style === 'legacy'
      ? [
          '### requirements',
          `- 对象：${confirmation.object}`,
          `- 用户原话：${confirmation.quote ?? ''}`,
          '- 原话用途：确认凭证，不替代已写明的正文',
          `- 提交：${confirmation.commit}`,
          `- 对象摘要：${confirmation.subject}`,
          `- 时间：${confirmation.at}`,
        ].join('\n')
      : [
          '### requirements',
          '- 确认部分：规划',
          `- 对象：${confirmation.object}`,
          `- 确认人：${confirmation.by ?? '未记录'}`,
          ...(confirmation.quote ? [`- 用户原话：${confirmation.quote}`, '- 原话用途：可选附注，不替代已写明的正文'] : []),
          `- 提交：${confirmation.commit}`,
          `- 对象摘要：${confirmation.subject}`,
          `- 时间：${confirmation.at}`,
        ].join('\n')).join('\n\n') : '尚无确认。',
  ];
  return `${parts.join('\n\n').trimEnd()}\n`;
}

async function readPlan(root: string, id: string): Promise<ProjectPlan> {
  validateTaskId(id);
  await readProjectMetadata(root);
  const relative = planPath(id);
  const content = await readTextIfExists(root, relative);
  if (content === null) fail('PLAN_NOT_FOUND', `规划 ${id} 不存在；请先执行 plan start。`);
  const marker = new RegExp(`${PLAN_MARKER.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(\\{.*\\})${PLAN_MARKER_END.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'u').exec(content);
  if (!marker) fail('INVALID_PLAN', `规划 ${id} 不是当前格式。`);
  const meta = parseMeta(marker[1]!, id);
  return { meta, content, path: relative, bodyMatches: visiblePlan(meta) === visiblePlanContent(content) };
}

export async function startPlan(rootInput: string, id: string, input: PlanStartInput) {
  const root = path.resolve(rootInput); validateTaskId(id);
  const title = line(input.title, '规划标题', 200);
  const goal = line(input.goal, '规划目标', 5000);
  const requirements = references(input.requirements, '规划关联需求');
  if (!input.items?.length) fail('INVALID_PLAN_INPUT', '至少提供一个 --item。');
  const items = input.items.map(value => parseItem(value, requirements));
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) fail('INVALID_PLAN_INPUT', `规划条目重复：${item.id}`);
    ids.add(item.id);
  }
  for (const item of items) for (const dependency of item.dependencies) {
    if (!ids.has(dependency)) fail('INVALID_PLAN_INPUT', `条目 ${item.id} 的依赖不存在：${dependency}`);
  }
  return withProjectLock(root, async () => {
    await readProjectMetadata(root);
    for (const reference of [...requirements, ...items.flatMap(item => item.requirements)]) {
      const relativeReference = reference.split('#')[0]!;
      try { if (!(await lstat(path.join(root, relativeReference))).isFile()) throw new Error(); }
      catch { fail('PLAN_REFERENCE_NOT_FOUND', `规划关联需求文件不存在：${relativeReference}`); }
    }
    const relative = planPath(id);
    if (await readTextIfExists(root, relative) !== null) fail('PLAN_EXISTS', `规划 ${id} 已存在，不能覆盖。`);
    const meta: PlanMeta = { version: 1, id, created: new Date().toISOString(), title, goal, requirements, items, confirmations: [] };
    await applyChanges(root, [{ path: relative, before: null, after: renderPlan(meta) }]);
    return { id, path: relative, items: items.map(item => item.id), confirmed: false,
      next: `核对规划正文后确认：tiller plan confirm ${id} [--by "<确认人>"]` };
  });
}

export async function confirmPlan(rootInput: string, id: string, input: PlanConfirmInput = {}) {
  const root = path.resolve(rootInput);
  return withProjectLock(root, async () => {
    const plan = await readPlan(root, id);
    if (!plan.bodyMatches) fail('PLAN_BODY_CHANGED', '规划可见正文与条目元信息不一致；请恢复正文或重新建立规划，再确认。');
    const quote = input.quote === undefined ? '' : line(input.quote, '用户原话', 4000);
    const by = line(await resolveConfirmer(root, input.by), '确认人', 200);
    const commit = await currentCommit(root, input.commit);
    const confirmation: PlanConfirmation = {
      object: '规划正文（目标、关联需求与任务条目）', ...(quote ? { quote } : {}), by, commit,
      subject: planSubject(plan.meta), at: new Date().toISOString(),
    };
    const meta = { ...plan.meta, confirmations: [confirmation] };
    await applyChanges(root, [{ path: plan.path, before: plan.content, after: renderPlan(meta) }]);
    return { id, confirmed: true, object: confirmation.object, by, ...(quote ? { quote } : {}),
      commit, subject: confirmation.subject, path: plan.path };
  });
}

async function head(root: string): Promise<string | null> {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    return /^[a-f0-9]{40,64}$/u.test(result.stdout.trim()) ? result.stdout.trim() : null;
  } catch { return null; }
}

async function currentCommit(root: string, requested?: string): Promise<string> {
  if (requested !== undefined) {
    if (!/^(?:[a-f0-9]{7,64}|no-git)$/u.test(requested)) fail('INVALID_COMMIT', '提交必须为 7-64 位 Git OID，非 Git 工程使用 no-git。');
    if (requested !== 'no-git') {
      try { await execFileAsync('git', ['cat-file', '-e', `${requested}^{commit}`], { cwd: root, encoding: 'utf8' }); }
      catch { fail('INVALID_COMMIT', `提交不存在：${requested}`); }
    }
    return requested;
  }
  return (await head(root)) ?? 'no-git';
}

async function taskLinks(root: string, planId: string): Promise<Map<string, { id: string; stage: FlowStage; accepted: boolean }[]>> {
  const result = new Map<string, { id: string; stage: FlowStage; accepted: boolean }[]>();
  const { taskStage } = await import('./flow.js');
  let entries;
  try { entries = await readdir(path.join(root, TASK_DIRECTORY), { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    let content: string | null;
    try { content = await readTextIfExists(root, `${TASK_DIRECTORY}/${entry.name}/task.md`); }
    catch { continue; }
    if (!content) continue;
    const marker = /<!-- tiller-task:v1 (\{.*\}) -->/u.exec(content);
    if (!marker) continue;
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(marker[1]!) as Record<string, unknown>; } catch { continue; }
    if (meta.plan !== planId || typeof meta.item !== 'string') continue;
    const links = result.get(meta.item) ?? [];
    const stage = await taskStage(root, entry.name);
    links.push({ id: entry.name, stage: stage.stage, accepted: stage.stage === '已验收' || stage.stage === '已关闭' });
    result.set(meta.item, links);
  }
  return result;
}

function uncovered(meta: PlanMeta): string[] {
  return meta.requirements.filter(requirement => !meta.items.some(item => item.requirements.some(reference =>
    reference === requirement || reference.startsWith(`${requirement}#`))));
}

export async function statusPlan(rootInput: string, id: string): Promise<PlanStatus> {
  const root = path.resolve(rootInput);
  const plan = await readPlan(root, id);
  const links = await taskLinks(root, id);
  const confirmation = plan.meta.confirmations.at(-1);
  const confirmed = plan.bodyMatches && confirmation?.subject === planSubject(plan.meta);
  const preliminary = plan.meta.items.map(item => {
    const tasks = links.get(item.id) ?? [];
    const accepted = tasks.some(task => task.accepted);
    const active = tasks.some(task => !task.accepted && task.stage !== '已放弃');
    const abandoned = tasks.length > 0 && tasks.every(task => !task.accepted && task.stage === '已放弃');
    return { item, tasks, status: (accepted ? '已验收' : active ? '进行中' : abandoned ? '已放弃' : '未开始') as PlanItemStatus };
  });
  const statusById = new Map(preliminary.map(entry => [entry.item.id, entry.status]));
  const items: PlanItemState[] = preliminary.map(entry => ({
    id: entry.item.id, title: entry.item.title, size: entry.item.size, dependencies: entry.item.dependencies,
    requirements: entry.item.requirements, ...(entry.item.childPlan ? { childPlan: entry.item.childPlan } : {}),
    status: entry.status, tasks: entry.tasks,
    blockedBy: entry.item.dependencies.filter(dependency => statusById.get(dependency) !== '已验收'),
  }));
  return {
    id, title: plan.meta.title, path: plan.path, confirmed,
    ...(confirmed ? {} : { confirmationIssue: !plan.bodyMatches || confirmation ? '规划正文已变化，需要重新确认。' : '规划尚未确认。' }),
    items, uncoveredRequirements: uncovered(plan.meta),
  };
}

export async function readPlanItem(rootInput: string, planId: string, itemId: string) {
  const root = path.resolve(rootInput);
  if (!ITEM_ID.test(itemId)) fail('INVALID_PLAN_ITEM', `规划条目编号无效：${itemId}`);
  const plan = await readPlan(root, planId);
  const status = await statusPlan(root, planId);
  const item = status.items.find(entry => entry.id === itemId);
  if (!item) fail('PLAN_ITEM_NOT_FOUND', `规划 ${planId} 没有条目 ${itemId}。`);
  const confirmation = plan.meta.confirmations.at(-1);
  if (!status.confirmed) fail('PLAN_NOT_CONFIRMED', `规划 ${planId} 尚未确认或正文已变化；先执行 plan confirm ${planId}。`);
  if (item.blockedBy.length) {
    fail('PLAN_DEPENDENCY_BLOCKED', `条目 ${itemId} 依赖尚未验收：${item.blockedBy.join(', ')}。依赖选择为阻塞，完成并验收依赖后再开工。`);
  }
  return { plan, item, confirmation: confirmation! };
}

export async function planItemStatus(rootInput: string, planId: string, itemId: string): Promise<PlanItemStatus> {
  const status = await statusPlan(rootInput, planId);
  const item = status.items.find(entry => entry.id === itemId);
  if (!item) fail('PLAN_ITEM_NOT_FOUND', `规划 ${planId} 没有条目 ${itemId}。`);
  return item.status;
}
