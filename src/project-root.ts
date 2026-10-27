import { execFile } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { validateTaskId } from './task-id.js';
import { taskWorktreePaths } from './task-worktrees.js';

const execFileAsync = promisify(execFile);

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const result = await execFileAsync('git', args, {
      cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
    });
    return result.stdout;
  } catch {
    return null;
  }
}

async function projectCandidate(start: string): Promise<string | null> {
  let current = path.resolve(start);
  while (true) {
    if (await exists(path.join(current, '.tiller/project.json'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function resolvedPath(target: string): Promise<string> {
  try { return await realpath(target); }
  catch { return path.resolve(target); }
}

function isWithin(target: string, parent: string): boolean {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function hasTaskRecord(root: string, id: string): Promise<boolean> {
  return await exists(path.join(root, '.tiller/task', id, 'task.md'));
}

function taskWorktreeContainers(primary: string, id: string): string[] {
  return [
    path.join(primary, '.tiller/local', id, 'worktrees'),
    path.join(primary, '.tiller/local/worktrees', id),
  ];
}

async function relatedTaskWorktree(input: string, primary: string, id: string): Promise<string | null> {
  const starts = [...new Set([path.resolve(input), await projectCandidate(input)].filter((value): value is string => Boolean(value)))];
  const worktrees = await taskWorktreePaths(primary, id);
  const resolvedWorktrees = await Promise.all(worktrees.map(resolvedPath));
  for (const start of starts) {
    const candidate = await resolvedPath(start);
    const matching = resolvedWorktrees.filter(worktree => isWithin(candidate, worktree));
    if (matching.length) {
      for (const worktree of matching) if (await hasTaskRecord(worktree, id)) return worktree;
      for (const worktree of matching) if (await exists(path.join(worktree, '.tiller/project.json'))) return worktree;
      for (const worktree of resolvedWorktrees) {
        if (await exists(path.join(worktree, '.tiller/project.json'))) return worktree;
      }
      return matching[0]!;
    }
    for (const container of taskWorktreeContainers(primary, id)) {
      const resolvedContainer = await resolvedPath(container);
      if (!isWithin(candidate, resolvedContainer)) continue;
      if (await exists(path.join(candidate, '.tiller/project.json'))) return candidate;
      for (const worktree of resolvedWorktrees) {
        if (isWithin(worktree, resolvedContainer) && await exists(path.join(worktree, '.tiller/project.json'))) return worktree;
      }
      const management = path.join(candidate, 'management');
      if (await exists(path.join(management, '.tiller/project.json'))) return resolvedPath(management);
      return candidate;
    }
  }
  return null;
}

function worktreeRoots(output: string | null): string[] {
  if (!output) return [];
  return output.split(/\r?\n/u)
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length).trim())
    .filter(Boolean);
}

/** Resolve a command started from a task worktree back to the main project checkout. */
export async function resolveProjectRoot(input: string): Promise<string> {
  const candidate = await projectCandidate(input) ?? path.resolve(input);
  const top = (await git(candidate, ['rev-parse', '--show-toplevel']))?.trim() || candidate;
  const roots = worktreeRoots(await git(top, ['worktree', 'list', '--porcelain']));
  const verified: string[] = [];
  for (const root of roots) {
    if (await exists(path.join(root, '.tiller/project.json'))) verified.push(root);
  }
  const outsideLocal = (target: string): boolean => !target.split(path.sep).join('/').includes('/.tiller/local/');
  // After worktree-only init, primary has no META; prefer the git toplevel over an init worktree.
  const main = verified.find(outsideLocal)
    ?? (outsideLocal(top) ? top : null)
    ?? (outsideLocal(path.resolve(candidate)) ? path.resolve(candidate) : null)
    ?? verified[0]
    ?? candidate;
  return resolvedPath(main);
}

export interface TaskCheckout {
  /** Main checkout used for push, platform API, branch and worktree cleanup. */
  primary: string;
  /** Checkout containing this task's record, preferring the current related checkout. */
  taskRoot: string;
}

/** Resolve delivery commands to the main checkout while reading the task from its actual checkout. */
export async function resolveTaskCheckout(input: string, id: string): Promise<TaskCheckout> {
  validateTaskId(id);
  const primary = await resolveProjectRoot(input);
  const related = await relatedTaskWorktree(input, primary, id);
  if (related) return { primary, taskRoot: related };
  const candidate = await projectCandidate(input);
  if (candidate && await hasTaskRecord(candidate, id)) {
    return { primary, taskRoot: await resolvedPath(candidate) };
  }
  if (await hasTaskRecord(primary, id)) return { primary, taskRoot: primary };
  // start writes records only into the task worktree; resolve from primary via sidecar paths.
  for (const worktree of await taskWorktreePaths(primary, id)) {
    if (await hasTaskRecord(worktree, id)) return { primary, taskRoot: await resolvedPath(worktree) };
  }
  return { primary, taskRoot: primary };
}
