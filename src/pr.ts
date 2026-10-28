import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { branchDescriptionForTask, currentBranch, normalizeBranchSlug, suggestedBranchNameFor } from './branch-conventions.js';
import { commitSubjectIssue, commitTypeForTaskType, taskCommits, type CommitType, type TaskCommit } from './commit-conventions.js';
import { readProjectMetadata } from './core.js';
import { closeFlow, inspectFlow, readTask, taskStage } from './flow.js';
import type { FlowTask } from './flow.js';
import { isInitBaselineId, markInitBaselineMerged } from './init-baseline.js';
import {
  createMergeRequest, createPullRequest, mergeMergeRequest, mergePullRequest, platformToken, pushBranch,
  resolvePlatformRepository, tokenGuidance,
} from './platform-api.js';
import type { MergeRequestResult, PlatformRepository, PullRequestResult, PushResult } from './platform-api.js';
import { resolveTaskCheckout } from './project-root.js';
import { taskBranchName } from './task-worktrees.js';

const execFileAsync = promisify(execFile);
const TASK_HEADINGS = ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险'] as const;
const IMPACT_PLACEHOLDER = '待补充：任务设计未单列“影响与风险”，请人工补充。';

export interface PullRequestDraft {
  id: string;
  title: string;
  body: string;
  type: CommitType;
  module: string | null;
  branch: string;
  commits: TaskCommit[];
  warnings: string[];
}

export interface PullRequestCreated extends PullRequestDraft {
  platform: 'github' | 'gitlab';
  url: string;
  number: number;
  base: string;
  pushed: PushResult;
  draftOnly: false;
  markdown: string;
  next: string;
}

export interface PullRequestPreview extends PullRequestDraft {
  platform: 'github' | 'gitlab' | 'both';
  draftOnly: true;
  markdown: string;
  next: string;
}

export interface MergeResult {
  id: string;
  platform: 'github' | 'gitlab';
  branch: string;
  merged: true;
  command: string;
  close: Awaited<ReturnType<typeof closeFlow>>;
  warnings?: string[];
  next: string;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

async function mergeTarget(root: string, taskRoot: string, id: string): Promise<{ branch: string; init: boolean }> {
  const metadata = await readProjectMetadata(root);
  if (isInitBaselineId(id)) {
    const baseline = metadata.initBaseline;
    if (!baseline || baseline.id !== id) fail('INIT_BASELINE_NOT_FOUND', `工程元信息中没有初始化基线 ${id}。`);
    return { branch: baseline.branch, init: true };
  }
  const task = await readTask(taskRoot, id);
  const stage = await taskStage(taskRoot, id);
  if (stage.stage !== '已验收') {
    fail('MERGE_NOT_ACCEPTED', `任务当前阶段为${stage.stage}；先完成验收并提交任务记录，再运行 tiller merge ${id}。`);
  }
  return { branch: taskBranchName(task.meta), init: false };
}

function sectionBody(content: string, title: string, level: 2 | 3): string {
  const marker = level === 2 ? '##' : '###';
  const match = new RegExp(`^${marker} ${title}\\s*$`, 'mu').exec(content);
  if (!match) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = new RegExp(`^#{1,${level}}\\s+`, 'mu').exec(rest);
  return rest.slice(0, next?.index ?? rest.length).trim();
}

async function specModules(root: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(root, '.tiller/specs/modules'), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch {
    return [];
  }
}

function referencedModules(task: FlowTask, available: string[]): string[] {
  const found: string[] = [];
  const add = (value: string): void => {
    if (available.includes(value) && !found.includes(value)) found.push(value);
  };
  for (const scope of task.meta.scope) {
    for (const match of scope.matchAll(/\.tiller\/(?:specs|cases)\/modules\/([a-z][a-z0-9_-]*)/gu)) add(match[1]!);
  }
  for (const line of task.requirement.split(/\r?\n/u)) {
    if (!/涉及模块/u.test(line)) continue;
    for (const match of line.matchAll(/[a-z][a-z0-9_-]*/gu)) add(match[0]);
  }
  const text = `${task.requirement}\n${task.design}`;
  for (const match of text.matchAll(/\.tiller\/(?:specs|cases)\/modules\/([a-z][a-z0-9_-]*)/gu)) add(match[1]!);
  return found;
}

function scopeCovers(scope: string[], relative: string): boolean {
  return scope.some(value => value === '.' || relative === value || relative.startsWith(`${value}/`));
}

async function git(root: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string };
    return { ok: false, stdout: item.stdout ?? '', stderr: item.stderr ?? (error as Error).message };
  }
}

function taskRecordPath(relative: string, task: FlowTask): boolean {
  const directory = `.tiller/task/${task.meta.id}`;
  if (relative === directory || relative.startsWith(`${directory}/`)) return true;
  if (!scopeCovers(task.meta.scope, relative)) return false;
  return ['.tiller/cases', '.tiller/specs'].some(shared => relative === shared || relative.startsWith(`${shared}/`));
}

async function uncommittedTaskRecords(root: string, task: FlowTask): Promise<{ paths: string[]; warning?: string }> {
  if (task.meta.base === 'no-git') return { paths: [] };
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok || repository.stdout.trim() !== 'true') {
    return { paths: [], warning: '无法读取任务记录的未提交改动，已跳过 pr 任务记录门禁。' };
  }
  const recordPaths = [`.tiller/task/${task.meta.id}`, '.tiller/cases', '.tiller/specs'];
  const tracked = await git(root, ['diff', '--name-only', '-z', 'HEAD', '--', ...recordPaths]);
  const untracked = await git(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...recordPaths]);
  if (!tracked.ok || !untracked.ok) {
    return { paths: [], warning: '无法读取任务记录的未提交改动，已跳过 pr 任务记录门禁。' };
  }
  const paths = [...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean))]
    .filter(relative => taskRecordPath(relative, task))
    .sort();
  return { paths };
}

function dirtyTaskRecordsMessage(locations: Array<{ label: string; paths: string[] }>): string {
  const detail = locations.map(item => `${item.label}：${item.paths.join('、')}`).join('；');
  return `任务记录尚未提交（${detail}）。请先在 worktree 当前任务检出提交这些记录；若 primary 主检出仍有残留副本，请手动提交或清理，tiller 不会自动删除用户文件。`;
}

function impactText(task: FlowTask): string {
  if (!task.design.trim()) return '无';
  const impact = sectionBody(task.design, '影响与风险', 3) || sectionBody(task.design, '影响与风险', 2);
  return impact || IMPACT_PLACEHOLDER;
}

function oneLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function explicitSummary(value: string): string {
  const summary = value.trim();
  if (!summary || summary.length > 200 || /[\x00-\x1f]/u.test(summary)) {
    throw Object.assign(new Error('--summary 必须是非空单行文本，且不超过 200 字符。'), { code: 'INVALID_SUMMARY' });
  }
  return summary;
}

function commitSummary(commit: TaskCommit, available: string[]): string | null {
  const match = /^(?:feat|fix)(?:\(([a-z][a-z0-9_-]*)\))?: (.+)$/u.exec(commit.subject);
  if (!match || commitSubjectIssue(commit.subject, available)) return null;
  return match[2]!.trim();
}

function earliestCommitSummary(commits: TaskCommit[], available: string[]): string | null {
  for (const commit of commits) {
    const summary = commitSummary(commit, available);
    if (summary) return summary;
  }
  return null;
}

function bodyMarkdown(task: FlowTask, commits: TaskCommit[], covered: Map<string, boolean>): string {
  const sections = new Map<string, string[]>();
  sections.set('关联任务', [`任务 ${task.meta.id}，记录见 \`.tiller/task/${task.meta.id}/task.md\``]);
  sections.set('变更内容', commits.length ? commits.map(commit => `- ${commit.subject}`) : ['- （待补充：任务基线后尚无提交）']);
  sections.set('验收条件', task.criteria.map(criterion => `- [${covered.get(criterion.id) ? 'x' : ' '}] ${criterion.id}: ${criterion.text}`));
  sections.set('验证结果', task.criteria.map(criterion => {
    const state = covered.get(criterion.id) ? '当前有效' : '当前未覆盖或已过期';
    const runs = task.verifications.filter(item => item.criterion === criterion.id);
    const heading = `- ${criterion.id}：${oneLine(criterion.text)}（${runs.length ? state : '尚无验证记录'}）`;
    if (!runs.length) return heading;
    return [
      heading,
      ...runs.map(run => {
        const cases = run.cases.length ? `；用例：${run.cases.join(', ')}` : '';
        const evidence = run.source === 'reported'
          ? `；未执行（外部报告）${run.reason ? `：${run.reason}` : ''}`
          : run.evidence === 'verified' ? '' : '；未核实';
        const expectation = run.expectFail ? `；预期：失败先行（基线 \`${run.baseline ?? '未记录'}\`）` : '';
        return `  - 测试：\`${run.test}\`；命令：\`${run.command}\`；结果：${run.result}${expectation}${evidence}；提交：\`${run.commit}\`${cases}`;
      }),
    ].join('\n');
  }));
  sections.set('影响与风险', [impactText(task)]);
  return TASK_HEADINGS.flatMap(heading => [`## ${heading}`, '', ...sections.get(heading)!, '']).join('\n').trimEnd();
}

export async function draftPullRequest(
  rootInput: string,
  id: string,
  options: { slug?: string; summary?: string } = {},
): Promise<PullRequestDraft & { markdown: string }> {
  const { primary, taskRoot } = await resolveTaskCheckout(rootInput, id);
  const sourceRoot = taskRoot;
  const task = await readTask(taskRoot, id);
  const type = commitTypeForTaskType(task.meta.type);
  if (!type) throw Object.assign(new Error(`无法从任务类型 ${task.meta.type} 推导提交类型。`), { code: 'PR_TYPE_UNKNOWN' });
  const checked = await inspectFlow(taskRoot, id);
  if (!checked.acceptance.confirmed) {
    throw Object.assign(new Error(`任务尚未通过交付验收；先运行 tiller accept ${id}，提交任务记录后再运行 pr。`), {
      code: 'PR_NOT_ACCEPTED',
    });
  }
  const dirty: Array<{ label: string; paths: string[] }> = [];
  const records = await uncommittedTaskRecords(taskRoot, task);
  if (records.paths.length) {
    dirty.push({
      label: path.resolve(taskRoot) === path.resolve(primary) ? '当前任务检出（primary）' : '当前任务检出（worktree）',
      paths: records.paths,
    });
  }
  if (path.resolve(taskRoot) !== path.resolve(primary)) {
    // Only the task record seed is a primary residual; cases/specs dirty on primary
    // are unrelated to the start-seed problem and must not block pr.
    const primaryRecords = await uncommittedTaskRecords(primary, task);
    const residual = primaryRecords.paths.filter(relative =>
      relative === `.tiller/task/${id}/task.md` || relative.startsWith(`.tiller/task/${id}/`));
    if (residual.length) {
      dirty.push({ label: 'primary 主检出（残留副本）', paths: residual });
    }
  }
  if (dirty.length) {
    throw Object.assign(new Error(dirtyTaskRecordsMessage(dirty)), {
      code: 'PR_TASK_RECORDS_DIRTY',
    });
  }
  const available = await specModules(taskRoot);
  const modules = new Set(referencedModules(task, available));
  const resolvedModules = [...modules];
  const branchDescription = options.slug === undefined
    ? task.meta.slug ?? branchDescriptionForTask((await currentBranch(sourceRoot)) ?? '', task.meta.id)
    : normalizeBranchSlug(options.slug);
  if (options.slug !== undefined && !branchDescription) {
    throw Object.assign(new Error('--slug 必须是 1-64 位英文、数字或连字符组成的简短描述。'), { code: 'INVALID_SLUG' });
  }
  const module = resolvedModules[0] ?? null;
  const branch = suggestedBranchNameFor(type, task.meta.id, branchDescription);
  const commits = await taskCommits(sourceRoot, task.meta.base);
  const summary = options.summary !== undefined
    ? explicitSummary(options.summary)
    : task.meta.summary ?? earliestCommitSummary(commits.commits, available) ?? task.title;
  const warnings: string[] = records.warning ? [records.warning] : [];
  if (resolvedModules.length > 1) warnings.push(`任务涉及多个模块（${resolvedModules.join(', ')}），PR/MR 标题使用首个主模块 ${module}，请人工确认。`);
  const title = `${type}${module ? `(${module})` : ''}: ${summary} [${task.meta.id}]`;
  if (commits.warning) warnings.push(commits.warning);
  const covered = new Map(checked.criteria.map(item => [item.id, item.covered]));
  const body = bodyMarkdown(task, commits.commits, covered);
  return {
    id: task.meta.id, title, body, type, module, branch,
    commits: commits.commits, warnings, markdown: `${title}\n\n建议分支：\`${branch}\`\n\n${body}\n`,
  };
}

export async function pullRequestFlow(
  rootInput: string,
  id: string,
  options: { slug?: string; summary?: string; draftOnly?: boolean } = {},
): Promise<PullRequestCreated | PullRequestPreview> {
  const { primary: root } = await resolveTaskCheckout(rootInput, id);
  const draft = await draftPullRequest(rootInput, id, options);
  if (options.draftOnly) {
    const metadata = await readProjectMetadata(root);
    return {
      ...draft,
      platform: metadata.platform ?? 'github',
      draftOnly: true,
      next: `草稿已生成；确认后运行 tiller pr ${id} 推送分支并创建真实 PR/MR。`,
    };
  }

  const metadata = await readProjectMetadata(root);
  let repository: PlatformRepository;
  try {
    repository = await resolvePlatformRepository(root, metadata.platform ?? 'github');
  } catch (error) {
    fail('PR_PLATFORM_UNKNOWN', (error as Error).message);
  }
  const platform = repository.platform;
  const token = platformToken(platform);
  if (!token) fail('PR_TOKEN_MISSING', tokenGuidance(platform, repository.apiBase));

  let pushed: PushResult;
  try {
    pushed = await pushBranch(root, repository, token, draft.branch);
  } catch (error) {
    fail('PR_PUSH_FAILED', `推送任务分支 ${draft.branch} 失败：${(error as Error).message}`);
  }

  let created: PullRequestResult | MergeRequestResult;
  try {
    created = platform === 'github'
      ? await createPullRequest(repository, token, { branch: draft.branch, title: draft.title, body: draft.body })
      : await createMergeRequest(repository, token, { branch: draft.branch, title: draft.title, body: draft.body });
  } catch (error) {
    const item = error as { status?: number; message?: string };
    const label = platform === 'github' ? 'PR' : 'MR';
    if (item.status === 422 || /already exists|已存在/iu.test(item.message ?? '')) {
      fail('PR_ALREADY_EXISTS', `${label} 可能已存在：${item.message ?? '平台返回 422'}。请打开分支 ${draft.branch} 的 PR/MR 核对；合入使用 tiller merge ${id}。`);
    }
    fail('PR_CREATE_FAILED', `${label} 创建失败：${item.message ?? String(error)}`);
  }

  const label = platform === 'github' ? 'PR' : 'MR';
  const markdown = `${draft.title}\n\n${label} #${created.number}：${created.url}\n分支：\`${draft.branch}\`\n\n${draft.body}\n`;
  return {
    ...draft,
    platform,
    url: created.url,
    number: created.number,
    base: created.base,
    pushed,
    warnings: [...draft.warnings, ...pushed.warnings],
    draftOnly: false,
    markdown,
    next: `已创建 ${label} #${created.number}：${created.url}；审阅后用 tiller merge ${id} 合入。`,
  };
}

export async function mergeFlow(rootInput: string, id: string, options: { keepBranch?: boolean } = {}): Promise<MergeResult> {
  const { primary: root, taskRoot } = await resolveTaskCheckout(rootInput, id);
  const metadata = await readProjectMetadata(root);
  let repository;
  try {
    repository = await resolvePlatformRepository(root, metadata.platform ?? 'github');
  } catch (error) {
    fail('MERGE_PLATFORM_UNKNOWN', (error as Error).message);
  }
  const platform = repository.platform;
  const token = platformToken(platform);
  if (!token) fail('MERGE_TOKEN_MISSING', tokenGuidance(platform, repository.apiBase));
  const target = await mergeTarget(root, taskRoot, id);
  let merged;
  try {
    merged = platform === 'github'
      ? await mergePullRequest(repository, token, target.branch)
      : await mergeMergeRequest(repository, token, target.branch);
  } catch (error) {
    const label = platform === 'github' ? 'GitHub' : 'GitLab';
    fail('MERGE_FAILED', `${label} REST API squash 合入失败：${(error as Error).message}`);
  }

  let metadataError: Error | null = null;
  if (target.init) {
    try { await markInitBaselineMerged(root, id); }
    catch (error) { metadataError = error as Error; }
  }

  let closed: Awaited<ReturnType<typeof closeFlow>>;
  try {
    closed = await closeFlow(rootInput, id, '合入后自动清理', false, {
      keepBranch: options.keepBranch === true, merged: true,
    });
  } catch (error) {
    const metadataNote = metadataError ? `；初始化状态也未更新：${metadataError.message}` : '';
    fail('MERGE_CLOSE_FAILED', `远端已合入，但本机清理失败：${(error as Error).message}${metadataNote}；请手动运行 tiller close ${id} --reason "已合入"。`);
  }
  if (metadataError) {
    fail('MERGE_METADATA_FAILED', `远端已合入且本机已清理，但初始化 merged 本地标记写入失败：${metadataError.message}；请检查 .tiller/local/init-baseline-merged.json。`);
  }
  return {
    id, platform, branch: target.branch, merged: true,
    command: merged.command, close: closed,
    ...(closed.warnings?.length ? { warnings: closed.warnings } : {}),
    next: `已通过 ${platform === 'github' ? 'GitHub' : 'GitLab'} REST API squash 合入并清理本机；如从网页合入，仍需手动运行 tiller close。`,
  };
}
