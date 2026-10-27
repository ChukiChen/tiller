import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const COMMIT_TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore'] as const;
export type CommitType = typeof COMMIT_TYPES[number];

const TASK_TYPE_MAP: Record<string, CommitType> = {
  feature: 'feat',
  bugfix: 'fix',
  documentation: 'docs',
  requirements: 'docs',
  analysis: 'docs',
  research: 'docs',
  improvement: 'refactor',
  review: 'test',
  validation: 'test',
  migration: 'chore',
  operations: 'chore',
};

const CONVENTIONAL_COMMIT_SCOPES = new Set([
  'specs', 'workflow', 'standards', 'initialization', 'verification',
]);

export interface TaskCommit { oid: string; subject: string }

export function commitTypeForTaskType(value: string): CommitType | undefined {
  return TASK_TYPE_MAP[value];
}

export function commitSubjectIssue(subject: string, modules: string[] = []): string | null {
  const match = /^(feat|fix|docs|refactor|test|chore)(?:\(([a-z][a-z0-9_-]*)\))?: (.+)$/u.exec(subject);
  if (!match) return '主题应为“类型(模块): 中文摘要”，类型限 feat/fix/docs/refactor/test/chore';
  const module = match[2];
  const summary = match[3]!.trim();
  if (!/[\u3400-\u9fff]/u.test(summary)) return '摘要必须包含中文';
  if (module && modules.length && !modules.includes(module) && !CONVENTIONAL_COMMIT_SCOPES.has(module)) {
    return `模块 ${module} 不在 specs/modules 中`;
  }
  if (/https?:\/\/|\[[^\]]+\]\([^)]+\)|(?:^|\s)#\d+\b/u.test(summary)) return '摘要不应包含任务链接';
  return null;
}

async function git(root: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string };
    return { ok: false, stdout: item.stdout ?? '', stderr: item.stderr ?? (error as Error).message };
  }
}

export async function taskCommits(root: string, base: string, head = 'HEAD'): Promise<{ commits: TaskCommit[]; warning?: string }> {
  if (base === 'no-git') return { commits: [] };
  const range = `${base}..${head}`;
  const result = await git(root, ['log', '--reverse', '--no-merges', '--format=%H%x09%s', range]);
  if (!result.ok) return { commits: [], warning: `无法读取任务基线后的提交：${result.stderr.trim()}` };
  const commits = result.stdout.split(/\r?\n/u).filter(Boolean).flatMap(line => {
    const separator = line.indexOf('\t');
    if (separator < 0) return [];
    return [{ oid: line.slice(0, separator), subject: line.slice(separator + 1) }];
  });
  return { commits };
}

export async function commitMessageWarnings(root: string, base: string, modules: string[] = []): Promise<string[]> {
  const result = await taskCommits(root, base);
  const warnings = result.warning ? [result.warning] : [];
  for (const commit of result.commits) {
    const issue = commitSubjectIssue(commit.subject, modules);
    if (issue) warnings.push(`提交 ${commit.oid.slice(0, 7)} 不符合提交信息规范：${commit.subject}（${issue}）。`);
  }
  return warnings;
}
