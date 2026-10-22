import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { COMMIT_TYPES, type CommitType } from './commit-conventions.js';

const execFileAsync = promisify(execFile);
const BRANCH = /^(feat|fix|docs|refactor|test|chore)\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/u;
const DESCRIPTION = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export function suggestedBranchName(type: CommitType, taskId: string): string {
  return `${type}/${taskId}`;
}

export function branchNameIssue(branch: string, taskId?: string): string | null {
  if (!branch || branch === 'main' || branch === 'master') return null;
  const match = BRANCH.exec(branch);
  if (!match) return `分支名应为“类型/任务编号[-简短描述]”，类型限 ${COMMIT_TYPES.join('/')}，仅用小写字母、数字和连字符`;
  if (taskId && match[2] !== taskId && !(match[2]!.startsWith(`${taskId}-`) && DESCRIPTION.test(match[2]!.slice(taskId.length + 1)))) {
    return `分支 ${branch} 中的任务编号与当前任务 ${taskId} 不符`;
  }
  return null;
}

export async function currentBranch(root: string): Promise<string | null> {
  try {
    const result = await execFileAsync('git', ['branch', '--show-current'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
    });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function branchNameWarning(root: string, taskId: string): Promise<string | null> {
  const branch = await currentBranch(root);
  if (!branch) return null;
  const issue = branchNameIssue(branch, taskId);
  return issue ? `${issue}。` : null;
}
