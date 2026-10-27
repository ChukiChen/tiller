import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rmdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { suggestedBranchNameFor } from './branch-conventions.js';
import { commitTypeForTaskType } from './commit-conventions.js';
import { assertSafePath, readTextIfExists, validateRelativePath } from './files.js';
import type { ProjectMetadata } from './types.js';

const execFileAsync = promisify(execFile);
const LOCAL_DIRECTORY = '.tiller/local';
const LEGACY_WORKTREE_DIRECTORY = '.tiller/local/worktrees';
const LEGACY_SIDECAR_DIRECTORY = '.tiller/local/tasks';
const LEGACY_LOG_DIRECTORY = '.tiller/local/logs';

export interface TaskWorktreeEntry {
  repository: string;
  source: string;
  path: string;
  branch: string;
}

export interface TaskWorktreeState {
  schemaVersion: 1;
  id: string;
  branch: string;
  root: string;
  worktrees: TaskWorktreeEntry[];
}

export interface TaskWorktreeCleanup {
  removedWorktrees: string[];
  missingWorktrees: string[];
  logsRemoved: boolean;
  warnings: string[];
}

interface GitResult { ok: boolean; stdout: string; stderr: string; unavailable: boolean }
interface RepositorySource { source: string; sourceRelative: string; label: string }
interface CreatedWorktree extends RepositorySource { target: string; targetRelative: string }

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function relativePath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/gu, '/');
}

export function taskLocalRoot(id: string): string {
  return relativePath(LOCAL_DIRECTORY, id);
}

function worktreeRoot(id: string): string {
  return relativePath(taskLocalRoot(id), 'worktrees');
}

function legacyWorktreeRoot(id: string): string {
  return relativePath(LEGACY_WORKTREE_DIRECTORY, id);
}

function logDirectory(id: string): string {
  return relativePath(taskLocalRoot(id), 'logs');
}

function legacyLogDirectory(id: string): string {
  return relativePath(LEGACY_LOG_DIRECTORY, id);
}

function sidecarPath(id: string): string {
  return relativePath(taskLocalRoot(id), 'worktrees.json');
}

function legacySidecarPath(id: string): string {
  return relativePath(LEGACY_SIDECAR_DIRECTORY, id, 'worktrees.json');
}

function isWithin(relative: string, parent: string): boolean {
  return relative === parent || relative.startsWith(`${parent}/`);
}

async function runGit(root: string, args: string[]): Promise<GitResult> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, unavailable: false };
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string; code?: string | number | null };
    return {
      ok: false,
      stdout: item.stdout ?? '',
      stderr: item.stderr ?? (error as Error).message,
      unavailable: item.code === 'ENOENT',
    };
  }
}

async function assertRepository(root: string, sourceRelative: string, label: string): Promise<{ source: string; head: string }> {
  const source = sourceRelative === '.' ? root : path.resolve(root, ...sourceRelative.split('/'));
  let stat: Awaited<ReturnType<typeof lstat>>;
  try { stat = await lstat(source); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail('WORKTREE_REPOSITORY_MISSING', `${label}不存在：${sourceRelative}`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('WORKTREE_NOT_GIT_REPOSITORY', `${label}不是普通目录：${sourceRelative}`);
  const inside = await runGit(source, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) {
    if (inside.unavailable) fail('GIT_UNAVAILABLE', '无法执行 Git，start 不能创建任务 worktree。');
    fail('WORKTREE_NOT_GIT_REPOSITORY', `${label}不是 Git 工作副本：${sourceRelative}`);
  }
  if (inside.stdout.trim() !== 'true') fail('WORKTREE_NOT_GIT_REPOSITORY', `${label}不是 Git 工作副本：${sourceRelative}`);
  const top = await runGit(source, ['rev-parse', '--show-toplevel']);
  if (!top.ok) fail('WORKTREE_NOT_GIT_REPOSITORY', `${label}无法解析 Git 根目录：${sourceRelative}`);
  let expected: string;
  let actual: string;
  try {
    expected = await realpath(source);
    actual = await realpath(top.stdout.trim());
  } catch {
    fail('WORKTREE_NOT_GIT_REPOSITORY', `${label} Git 根目录不可读：${sourceRelative}`);
  }
  if (expected !== actual) fail('WORKTREE_NOT_GIT_REPOSITORY', `${label}必须是独立 Git 工作副本根：${sourceRelative}`);
  const head = await runGit(source, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!head.ok || !/^[a-f0-9]{40,64}$/u.test(head.stdout.trim())) {
    fail('WORKTREE_HEAD_MISSING', `${label}至少需要一条 Git 提交才能创建任务 worktree：${sourceRelative}`);
  }
  return { source, head: head.stdout.trim() };
}

function sourcesFor(root: string, metadata: ProjectMetadata): RepositorySource[] {
  if (metadata.mode === 'project') return [{ source: root, sourceRelative: '.', label: '工程根' }];
  return [
    { source: root, sourceRelative: '.', label: '管理仓' },
    ...metadata.repositories.map(repository => {
      validateRelativePath(repository.path);
      return { source: path.resolve(root, ...repository.path.split('/')), sourceRelative: repository.path, label: `业务仓 ${repository.id}` };
    }),
  ];
}

function targetFor(repository: RepositorySource, root: string, id: string): { target: string; targetRelative: string } {
  const targetRelative = repository.sourceRelative === '.'
    ? (repository.label === '工程根' ? worktreeRoot(id) : relativePath(worktreeRoot(id), 'management'))
    : relativePath(worktreeRoot(id), repository.sourceRelative);
  return { target: path.resolve(root, ...targetRelative.split('/')), targetRelative };
}

async function removeGitWorktree(worktree: CreatedWorktree): Promise<boolean> {
  const removed = await runGit(worktree.source, ['worktree', 'remove', '--force', worktree.target]);
  await runGit(worktree.source, ['worktree', 'prune']);
  return removed.ok;
}

async function removeRelative(root: string, relative: string, recursive: boolean, label: string,
  warnings?: string[]): Promise<boolean> {
  try {
    const target = await assertSafePath(root, relative);
    const stat = await lstat(target).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (stat === null) return false;
    await rm(target, { recursive, force: true });
    return true;
  } catch (error) {
    warnings?.push(`${label}清理失败：\`${relative}\`（${(error as Error).message}）。`);
    return false;
  }
}

async function discardTaskLocalArtifacts(root: string, id: string): Promise<void> {
  await removeRelative(root, worktreeRoot(id), true, '任务 worktree 容器');
  await removeRelative(root, sidecarPath(id), false, '任务 worktree 清单');
  await removeRelative(root, relativePath(taskLocalRoot(id), 'pre-existing.json'), false, '开工前改动旁路');
  try { await rmdir(await assertSafePath(root, taskLocalRoot(id))); }
  catch { /* Unknown task-local content is left intact rather than deleted recursively. */ }
}

async function discardCreatedWorktrees(root: string, id: string, created: CreatedWorktree[]): Promise<void> {
  for (const worktree of [...created].reverse()) await removeGitWorktree(worktree);
  await discardTaskLocalArtifacts(root, id);
}

export function taskBranchName(meta: { id: string; type: string; slug?: string }): string {
  const type = commitTypeForTaskType(meta.type);
  if (!type) fail('INVALID_FLOW_TYPE', `任务类型无法映射到分支类型：${meta.type}`);
  return suggestedBranchNameFor(type, meta.id, meta.slug);
}

export async function createTaskWorktrees(rootInput: string, metadata: ProjectMetadata,
  task: { id: string; type: string; slug?: string }): Promise<TaskWorktreeState> {
  const root = path.resolve(rootInput);
  const branch = taskBranchName(task);
  const rootRelative = worktreeRoot(task.id);
  const rootTarget = await assertSafePath(root, rootRelative);
  const existing = await lstat(rootTarget).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (existing !== null) fail('WORKTREE_PATH_EXISTS', `任务 worktree 路径已存在：${rootRelative}`);

  const sources = sourcesFor(root, metadata);
  const targets = sources.map(source => ({ source, ...targetFor(source, root, task.id) }));
  if (new Set(targets.map(item => item.targetRelative.toLowerCase())).size !== targets.length) {
    fail('WORKTREE_PATH_CONFLICT', `任务 worktree 目标路径冲突：${rootRelative}`);
  }
  const validated: Array<RepositorySource & { source: string; head: string; target: string; targetRelative: string }> = [];
  for (const item of targets) {
    const repository = await assertRepository(root, item.source.sourceRelative, item.source.label);
    validated.push({ ...item.source, source: repository.source, head: repository.head, target: item.target, targetRelative: item.targetRelative });
  }

  const created: CreatedWorktree[] = [];
  try {
    await mkdir(path.dirname(rootTarget), { recursive: true });
    if (metadata.mode === 'workspace') await mkdir(rootTarget, { recursive: true });
    for (const repository of validated) {
      const branchExists = await runGit(repository.source, ['rev-parse', '--verify', `refs/heads/${branch}`]);
      const args = branchExists.ok
        ? ['worktree', 'add', repository.target, branch]
        : ['worktree', 'add', '-b', branch, repository.target, repository.head];
      const added = await runGit(repository.source, args);
      if (!added.ok) {
        const message = added.stderr.trim() || `无法创建 ${repository.label} 的任务 worktree`;
        fail('WORKTREE_ADD_FAILED', `${repository.label}建树失败：${message}`);
      }
      created.push({ ...repository, targetRelative: repository.targetRelative });
    }
  } catch (error) {
    await discardCreatedWorktrees(root, task.id, created);
    throw error;
  }

  return {
    schemaVersion: 1,
    id: task.id,
    branch,
    root: rootRelative,
    worktrees: created.map(item => ({
      repository: item.sourceRelative === '.' ? 'management' : item.sourceRelative,
      source: item.sourceRelative,
      path: item.targetRelative,
      branch,
    })),
  };
}

async function copyTaskDirectory(sourceRoot: string, targetRoot: string, relative: string): Promise<void> {
  const source = await assertSafePath(sourceRoot, relative);
  const entries = await readdir(source, { withFileTypes: true });
  await mkdir(await assertSafePath(targetRoot, relative), { recursive: true });
  for (const entry of entries) {
    const child = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) fail('WORKTREE_TASK_SYNC_FAILED', `任务记录不能同步符号链接：\`${child}\`。`);
    if (entry.isDirectory()) {
      await copyTaskDirectory(sourceRoot, targetRoot, child);
      continue;
    }
    if (!entry.isFile()) fail('WORKTREE_TASK_SYNC_FAILED', `任务记录包含不支持的路径：\`${child}\`。`);
    const target = await assertSafePath(targetRoot, child);
    await writeFile(target, await readFile(await assertSafePath(sourceRoot, child)));
  }
}

/** Absolute path of the management (or sole) task worktree that owns task records. */
export function managementWorktreePath(primaryRoot: string, state: TaskWorktreeState): string {
  const entry = state.worktrees.find(item => item.repository === 'management') ?? state.worktrees[0];
  if (!entry) fail('WORKTREE_TASK_SYNC_FAILED', `任务 ${state.id} 没有可用的 worktree 可写入任务记录。`);
  return path.resolve(primaryRoot, ...entry.path.split('/'));
}

/** Relative management worktree path within the primary checkout. */
export function managementWorktreeRelative(state: TaskWorktreeState): string {
  const entry = state.worktrees.find(item => item.repository === 'management') ?? state.worktrees[0];
  if (!entry) fail('WORKTREE_TASK_SYNC_FAILED', `任务 ${state.id} 没有可用的 worktree 可写入任务记录。`);
  return entry.path;
}

/**
 * Propagate task records from the management worktree into sibling task worktrees.
 * Source of truth is the management worktree (not primary); project mode is a no-op after the initial write.
 */
export async function syncTaskRecordsToWorktrees(rootInput: string, state: TaskWorktreeState): Promise<void> {
  const root = path.resolve(rootInput);
  const relative = relativePath('.tiller/task', state.id);
  const sourceRoot = managementWorktreePath(root, state);
  const source = await assertSafePath(sourceRoot, relative);
  const stat = await lstat(source);
  if (!stat.isDirectory()) fail('WORKTREE_TASK_SYNC_FAILED', `任务记录不是目录：\`${relative}\`。`);
  const sourceRelative = managementWorktreeRelative(state);
  try {
    for (const entry of state.worktrees) {
      if (entry.path === sourceRelative) continue;
      const target = await assertSafePath(root, entry.path);
      await copyTaskDirectory(sourceRoot, target, relative);
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'WORKTREE_TASK_SYNC_FAILED') throw error;
    fail('WORKTREE_TASK_SYNC_FAILED', `任务记录同步到 worktree 失败：${(error as Error).message}`);
  }
}

export async function taskWorktreePaths(rootInput: string, id: string): Promise<string[]> {
  const root = path.resolve(rootInput);
  const loaded = await readState(root, id);
  if (!loaded.state) return [];
  return loaded.state.worktrees.map(entry => path.resolve(root, ...entry.path.split('/')));
}

export async function writeTaskWorktreeState(rootInput: string, state: TaskWorktreeState): Promise<void> {
  const root = path.resolve(rootInput);
  const relative = sidecarPath(state.id);
  const target = await assertSafePath(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function rollbackTaskWorktrees(rootInput: string, state: TaskWorktreeState): Promise<void> {
  const root = path.resolve(rootInput);
  const created: CreatedWorktree[] = [];
  for (const entry of state.worktrees) {
    const sourceRelative = entry.source === '.' ? root : path.resolve(root, ...entry.source.split('/'));
    const target = path.resolve(root, ...entry.path.split('/'));
    created.push({ source: sourceRelative, sourceRelative: entry.source, label: entry.repository, target, targetRelative: entry.path });
  }
  await discardCreatedWorktrees(root, state.id, created);
}

function parseState(text: string, id: string): TaskWorktreeState | null {
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const state = raw as Partial<TaskWorktreeState>;
  if (state.schemaVersion !== 1 || state.id !== id || typeof state.branch !== 'string' || typeof state.root !== 'string' ||
      !Array.isArray(state.worktrees)) return null;
  if (state.root !== worktreeRoot(id) && state.root !== legacyWorktreeRoot(id)) return null;
  const entries: TaskWorktreeEntry[] = [];
  for (const value of state.worktrees) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entry = value as Partial<TaskWorktreeEntry>;
    if (typeof entry.repository !== 'string' || typeof entry.source !== 'string' || typeof entry.path !== 'string' ||
        typeof entry.branch !== 'string') return null;
    if (entry.source !== '.') validateRelativePath(entry.source);
    validateRelativePath(entry.path);
    if (!isWithin(entry.path, state.root)) return null;
    entries.push({ repository: entry.repository, source: entry.source, path: entry.path, branch: entry.branch });
  }
  return { schemaVersion: 1, id, branch: state.branch, root: state.root, worktrees: entries };
}

async function readState(root: string, id: string): Promise<{ state: TaskWorktreeState | null; warning?: string }> {
  const warnings: string[] = [];
  for (const relative of [sidecarPath(id), legacySidecarPath(id)]) {
    try {
      const text = await readTextIfExists(root, relative);
      if (text === null) continue;
      const state = parseState(text, id);
      if (state) return { state };
      warnings.push(`任务 worktree 清单无效，已按约定布局清理：\`${relative}\`。`);
    } catch (error) {
      warnings.push(`任务 worktree 清单不可读，已按约定布局清理：\`${relative}\`（${(error as Error).message}）。`);
    }
  }
  return warnings.length ? { state: null, warning: warnings.join(' ') } : { state: null };
}

function fallbackStateAt(metadata: ProjectMetadata, id: string, root: string): TaskWorktreeState {
  if (metadata.mode === 'project') {
    return { schemaVersion: 1, id, branch: '', root, worktrees: [
      { repository: 'management', source: '.', path: root, branch: '' },
    ] };
  }
  return { schemaVersion: 1, id, branch: '', root, worktrees: [
    { repository: 'management', source: '.', path: relativePath(root, 'management'), branch: '' },
    ...metadata.repositories.map(repository => ({
      repository: repository.id, source: repository.path,
      path: relativePath(root, repository.path), branch: '',
    })),
  ] };
}

function fallbackStates(metadata: ProjectMetadata, id: string): TaskWorktreeState[] {
  return [
    fallbackStateAt(metadata, id, worktreeRoot(id)),
    fallbackStateAt(metadata, id, legacyWorktreeRoot(id)),
  ];
}

export async function cleanupTaskWorktrees(rootInput: string, id: string, metadata: ProjectMetadata): Promise<TaskWorktreeCleanup> {
  const root = path.resolve(rootInput);
  const warnings: string[] = [];
  const loaded = await readState(root, id);
  if (loaded.warning) warnings.push(loaded.warning);
  const states = loaded.state ? [loaded.state] : fallbackStates(metadata, id);
  const removedWorktrees: string[] = [];
  const missingWorktrees: string[] = [];
  const sources = new Set<string>();
  const seen = new Set<string>();

  for (const state of states) {
    for (const entry of state.worktrees) {
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      if (!isWithin(entry.path, worktreeRoot(id)) && !isWithin(entry.path, legacyWorktreeRoot(id))) {
        warnings.push(`已跳过不在任务 worktree 目录内的路径：\`${entry.path}\`。`);
        continue;
      }
      let target: string;
      try { target = await assertSafePath(root, entry.path); }
      catch (error) {
        warnings.push(`任务 worktree 路径不安全，已跳过：\`${entry.path}\`（${(error as Error).message}）。`);
        continue;
      }
      let stat: Awaited<ReturnType<typeof lstat>> | null;
      try {
        stat = await lstat(target).catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        });
      } catch (error) {
        warnings.push(`任务 worktree 状态不可读，已跳过：\`${entry.path}\`（${(error as Error).message}）。`);
        continue;
      }
      if (stat === null) {
        missingWorktrees.push(entry.path);
        continue;
      }
      const source = entry.source === '.' ? root : path.resolve(root, ...entry.source.split('/'));
      sources.add(source);
      const repository = { source, sourceRelative: entry.source, label: entry.repository, target, targetRelative: entry.path };
      const removed = await removeGitWorktree(repository);
      if (removed) removedWorktrees.push(entry.path);
      else {
        try {
          await rm(target, { recursive: true, force: true });
          removedWorktrees.push(entry.path);
          warnings.push(`Git 未能移除任务 worktree，已强制删除目录：\`${entry.path}\`。`);
        } catch (error) {
          warnings.push(`任务 worktree 拆除失败：\`${entry.path}\`（${(error as Error).message}）。`);
        }
      }
    }
  }

  for (const source of sources) await runGit(source, ['worktree', 'prune']);
  const logsRemoved = await removeRelative(root, logDirectory(id), true, '任务日志', warnings);
  const legacyLogsRemoved = await removeRelative(root, legacyLogDirectory(id), true, '旧任务日志', warnings);
  await removeRelative(root, worktreeRoot(id), true, '任务 worktree 容器', warnings);
  await removeRelative(root, legacyWorktreeRoot(id), true, '旧任务 worktree 容器', warnings);
  await removeRelative(root, taskLocalRoot(id), true, '任务本机目录', warnings);
  await removeRelative(root, relativePath(LEGACY_SIDECAR_DIRECTORY, id), true, '旧任务旁路目录', warnings);
  return { removedWorktrees, missingWorktrees, logsRemoved: logsRemoved || legacyLogsRemoved, warnings };
}

