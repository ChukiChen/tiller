import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readProjectMetadata } from './core.js';
import { inspectFlow, readTask, taskStage } from './flow.js';
import { proveInitBaselineMerged } from './init-baseline.js';
import { resolveProjectRoot } from './project-root.js';
import { taskBranchName } from './task-worktrees.js';

const execFileAsync = promisify(execFile);
const TASK_BRANCH = /^(?:feat|fix|docs|refactor|test|chore)\/[0-9]{8}-[a-z0-9][a-z0-9-]*$/u;

type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
  paths?: string[];
  branches?: string[];
}

export interface DoctorReport {
  ready: boolean;
  branch: string | null;
  checks: DoctorCheck[];
  issues: string[];
  warnings: string[];
  summary: { pass: number; warn: number; fail: number };
}

interface GitResult { ok: boolean; stdout: string; stderr: string }

interface WorktreeEntry { path: string; branch: string | null }
interface ActiveTaskRecord { id: string; root: string; branch: string; task: Awaited<ReturnType<typeof readTask>> }
interface ActiveTaskDiscovery {
  tasks: ActiveTaskRecord[];
  unmatchedBranches: string[];
  error?: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const result = await execFileAsync('git', args, {
      cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string };
    return { ok: false, stdout: item.stdout ?? '', stderr: item.stderr ?? (error as Error).message };
  }
}

function lines(value: string): string[] {
  return value.split(/\r?\n/u).map(item => item.trim()).filter(Boolean);
}

function worktreeEntries(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of lines(output)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null };
      entries.push(current);
    } else if (current && line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    }
  }
  return entries;
}

function worktreeBranches(output: string): Set<string> {
  return new Set(worktreeEntries(output).flatMap(entry => entry.branch ? [entry.branch] : []));
}

async function initCheck(root: string): Promise<DoctorCheck> {
  const metadata = await readProjectMetadata(root);
  const baseline = metadata.initBaseline;
  if (!baseline) return { id: 'init-baseline', status: 'pass', message: '无初始化基线记录，按存量工程放行。' };
  const proof = await proveInitBaselineMerged(root, metadata);
  if (proof.merged) return { id: 'init-baseline', status: 'pass', message: proof.detail };
  return {
    id: 'init-baseline', status: 'fail',
    message: `初始化基线 ${baseline.id} 尚未确认合入；${proof.detail}。先合入 ${baseline.branch} 的 PR/MR 并更新主干。`,
  };
}

async function defaultSpecsCheck(root: string, branch: string | null): Promise<DoctorCheck> {
  if (branch !== 'main' && branch !== 'master') {
    return { id: 'default-specs', status: 'pass', message: '当前不在默认分支，specs 变更按任务 worktree 流程检查。' };
  }
  const paths = new Set<string>();
  const status = await git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', '.tiller/specs']);
  if (status.ok) {
    for (const line of lines(status.stdout)) paths.add(line.slice(3));
  }
  const remote = await git(root, ['rev-parse', '--verify', `refs/remotes/origin/${branch}`]);
  if (remote.ok) {
    const ahead = await git(root, ['diff', '--name-only', `origin/${branch}...HEAD`, '--', '.tiller/specs']);
    if (ahead.ok) for (const item of lines(ahead.stdout)) paths.add(item);
  }
  const found = [...paths].sort();
  if (!found.length) return { id: 'default-specs', status: 'pass', message: `默认分支 ${branch} 的 specs 工作区干净。` };
  return {
    id: 'default-specs', status: 'fail',
    message: `默认分支 ${branch} 存在未提交或未合入的 specs 变更；请通过任务 worktree 随 PR/MR 合入。`,
    paths: found,
  };
}

async function branchCheck(root: string): Promise<DoctorCheck> {
  const listed = await git(root, ['branch', '--format=%(refname:short)']);
  if (!listed.ok) return { id: 'task-branches', status: 'warn', message: '无法读取本地分支，已跳过残留任务分支检查。' };
  const worktrees = await git(root, ['worktree', 'list', '--porcelain']);
  const active = worktrees.ok ? worktreeBranches(worktrees.stdout) : new Set<string>();
  const branches = lines(listed.stdout).filter(branch => TASK_BRANCH.test(branch) && !active.has(branch)).sort();
  if (!branches.length) return { id: 'task-branches', status: 'pass', message: '没有残留的任务分支。' };
  return {
    id: 'task-branches', status: 'fail',
    message: '发现未挂载 worktree 的残留任务分支；确认合入后运行 tiller close，或以 --keep-branch 显式保留。',
    branches,
  };
}

async function taskDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(root, '.tiller/task'), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch {
    return [];
  }
}

async function discoverActiveTasks(root: string): Promise<ActiveTaskDiscovery> {
  const worktrees = await git(root, ['worktree', 'list', '--porcelain']);
  if (!worktrees.ok) {
    return { tasks: [], unmatchedBranches: [], error: '无法读取 worktree，已跳过进行中任务 AC 覆盖检查。' };
  }
  const active = worktreeEntries(worktrees.stdout)
    .filter((entry): entry is WorktreeEntry & { branch: string } => Boolean(entry.branch && TASK_BRANCH.test(entry.branch)));
  const tasks = new Map<string, ActiveTaskRecord>();
  const matchedBranches = new Set<string>();
  for (const entry of active) {
    for (const candidate of [entry.path, path.join(entry.path, 'management')]) {
      for (const id of await taskDirectories(candidate)) {
        if (tasks.has(id)) continue;
        try {
          const task = await readTask(candidate, id);
          if (taskBranchName(task.meta) !== entry.branch) continue;
          tasks.set(id, { id, root: candidate, branch: entry.branch, task });
          matchedBranches.add(entry.branch);
        } catch { /* The unmatched branch check below reports the missing or unreadable record. */ }
      }
    }
  }
  return {
    tasks: [...tasks.values()].sort((left, right) => left.id.localeCompare(right.id)),
    unmatchedBranches: [...new Set(active.map(entry => entry.branch))]
      .filter(branch => !matchedBranches.has(branch)).sort(),
  };
}

async function activeCoverageCheck(discovery: ActiveTaskDiscovery): Promise<DoctorCheck[]> {
  if (discovery.error) return [{ id: 'ac-coverage', status: 'warn', message: discovery.error }];
  if (!discovery.tasks.length && !discovery.unmatchedBranches.length) {
    return [{ id: 'ac-coverage', status: 'pass', message: '没有进行中的任务 worktree。' }];
  }
  const checks: DoctorCheck[] = [];
  for (const branch of discovery.unmatchedBranches) {
    checks.push({
      id: `ac-coverage:${branch}`, status: 'fail',
      message: `active 任务 worktree ${branch} 找不到对应任务记录；不得按 primary 缺少任务目录跳过。`,
    });
  }
  for (const record of discovery.tasks) {
    const { id, root } = record;
    try {
      const stage = await taskStage(root, id);
      if (stage.stage === '已关闭' || stage.stage === '已放弃') continue;
      const checked = await inspectFlow(root, id);
      const missing = checked.criteria.filter(item => !item.covered).map(item => item.id);
      checks.push(missing.length
        ? { id: `ac-coverage:${id}`, status: 'warn', message: `进行中的任务 ${id} 尚有未覆盖 AC：${missing.join('、')}。` }
        : { id: `ac-coverage:${id}`, status: 'pass', message: `进行中的任务 ${id} 的 AC 均有当前验证。` });
    } catch (error) {
      checks.push({ id: `ac-coverage:${id}`, status: 'warn', message: `任务 ${id} 的 AC 覆盖无法检查：${(error as Error).message}` });
    }
  }
  return checks.length ? checks : [{ id: 'ac-coverage', status: 'pass', message: '没有进行中的任务 worktree。' }];
}

async function modelCheck(root: string, activeTasks: ActiveTaskRecord[]): Promise<DoctorCheck> {
  const paths = new Set<string>();
  const records = new Map<string, string>();
  for (const id of await taskDirectories(root)) {
    records.set(path.join(root, '.tiller/task', id, 'task.md'), `.tiller/task/${id}/task.md`);
  }
  for (const record of activeTasks) {
    const file = path.join(record.root, '.tiller/task', record.id, 'task.md');
    records.set(file, path.relative(root, file) || `.tiller/task/${record.id}/task.md`);
  }
  for (const [file, relative] of records) {
    try {
      const content = await readFile(file, 'utf8');
      if (/LIB-(?:AC|[A-Z]+)-\d+/u.test(content) || /^#{2,3}\s+验收条件（稳定）\s*$/mu.test(content)) paths.add(relative);
    } catch { /* A missing task file is reported by its own command. */ }
  }
  if (!paths.size) return { id: 'data-model', status: 'pass', message: '任务记录没有发现 LIB- 或“验收条件（稳定）”新主路径写法。' };
  return { id: 'data-model', status: 'warn', message: '任务记录含历史编号或稳定标题别名；新写入请使用文件路径作用域的 AC-n 与“验收条件”。', paths: [...paths].sort() };
}

export async function doctorFlow(rootInput: string): Promise<DoctorReport> {
  const root = await resolveProjectRoot(rootInput);
  const branchResult = await git(root, ['branch', '--show-current']);
  const branch = branchResult.ok ? branchResult.stdout.trim() || null : null;
  const checks: DoctorCheck[] = [];
  try {
    checks.push(await initCheck(root));
  } catch (error) {
    checks.push({ id: 'init-baseline', status: 'fail', message: `无法读取工程元信息：${(error as Error).message}` });
  }
  checks.push(await defaultSpecsCheck(root, branch), await branchCheck(root));
  const active = await discoverActiveTasks(root);
  checks.push(...await activeCoverageCheck(active), await modelCheck(root, active.tasks));
  const issues = checks.filter(check => check.status === 'fail').map(check => check.message);
  const warnings = checks.filter(check => check.status === 'warn').map(check => check.message);
  return {
    ready: issues.length === 0,
    branch,
    checks,
    issues,
    warnings,
    summary: {
      pass: checks.filter(check => check.status === 'pass').length,
      warn: warnings.length,
      fail: issues.length,
    },
  };
}
