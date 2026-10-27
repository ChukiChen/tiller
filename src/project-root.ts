import { execFile } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { validateTaskId } from './task-id.js';

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
  const main = verified.find(root => !root.split(path.sep).join('/').includes('/.tiller/local/')) ?? verified[0] ?? candidate;
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
  if (await exists(path.join(primary, '.tiller/task', id, 'task.md'))) {
    return { primary, taskRoot: primary };
  }
  const candidate = await projectCandidate(input);
  if (candidate && await exists(path.join(candidate, '.tiller/task', id, 'task.md'))) {
    return { primary, taskRoot: await resolvedPath(candidate) };
  }
  return { primary, taskRoot: primary };
}
