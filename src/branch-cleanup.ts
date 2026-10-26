import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { deleteRemoteBranch, platformToken, resolvePlatformRepository } from './platform-api.js';
import type { ProjectMetadata } from './types.js';

const execFileAsync = promisify(execFile);

interface GitResult { ok: boolean; stdout: string; stderr: string }
interface RepositorySource { root: string; label: string }

export interface BranchCleanupResult {
  branch: string;
  kept: boolean;
  localDeleted: string[];
  remoteDeleted: string[];
  warnings: string[];
}

async function git(root: string, args: string[]): Promise<GitResult> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string };
    return { ok: false, stdout: item.stdout ?? '', stderr: item.stderr ?? (error as Error).message };
  }
}

function sourcesFor(root: string, metadata: ProjectMetadata): RepositorySource[] {
  if (metadata.mode === 'project') return [{ root, label: '工程根' }];
  return [
    { root, label: '管理仓' },
    ...metadata.repositories.map(repository => ({
      root: path.resolve(root, ...repository.path.split('/')),
      label: `业务仓 ${repository.id}`,
    })),
  ];
}

async function branchExists(root: string, branch: string): Promise<boolean> {
  return (await git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])).ok;
}

async function switchAway(root: string, branch: string): Promise<boolean> {
  const candidates: string[] = [];
  const remoteHead = await git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (remoteHead.ok && remoteHead.stdout.trim().startsWith('origin/')) {
    candidates.push(remoteHead.stdout.trim().slice('origin/'.length));
  }
  candidates.push('main', 'master');
  for (const candidate of [...new Set(candidates)].filter(value => value && value !== branch)) {
    if (!(await branchExists(root, candidate))) continue;
    if ((await git(root, ['checkout', '--quiet', candidate])).ok) return true;
  }
  return false;
}

async function deleteLocal(root: string, branch: string, label: string, result: BranchCleanupResult): Promise<void> {
  if (!(await branchExists(root, branch))) return;
  const current = await git(root, ['branch', '--show-current']);
  if (current.ok && current.stdout.trim() === branch && !(await switchAway(root, branch))) {
    result.warnings.push(`${label}当前检出 ${branch}，且无法安全切换分支；已跳过本地分支删除。`);
    return;
  }
  const deleted = await git(root, ['branch', '-D', branch]);
  if (deleted.ok) result.localDeleted.push(`${label}:${branch}`);
  else result.warnings.push(`${label}删除本地分支 ${branch} 失败：${deleted.stderr.trim() || 'git branch -D 未成功'}。`);
}

async function deleteRemote(root: string, metadata: ProjectMetadata, branch: string, label: string,
  result: BranchCleanupResult): Promise<void> {
  const origin = await git(root, ['remote', 'get-url', 'origin']);
  if (!origin.ok || !origin.stdout.trim()) return;
  let repository;
  try {
    repository = await resolvePlatformRepository(root, metadata.platform ?? 'github');
  } catch (error) {
    result.warnings.push(`${label}无法解析 origin 平台，未删除远端分支 ${branch}：${(error as Error).message}`);
    return;
  }
  const token = platformToken(repository.platform);
  if (!token) {
    const names = repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN';
    result.warnings.push(`${label}缺少 ${names}，未删除远端分支 ${branch}。`);
    return;
  }
  try {
    const deleted = await deleteRemoteBranch(root, repository, token, branch);
    if (deleted.deleted) result.remoteDeleted.push(`${label}:${branch}`);
    else result.warnings.push(`${label}远端分支 ${branch} 已不存在，无需删除。`);
  } catch (error) {
    result.warnings.push(`${label}删除远端分支 ${branch} 失败：${(error as Error).message}`);
  }
}

export async function cleanupTaskBranches(rootInput: string, metadata: ProjectMetadata, branch: string,
  options: { keepBranch?: boolean } = {}): Promise<BranchCleanupResult> {
  const root = path.resolve(rootInput);
  const result: BranchCleanupResult = {
    branch, kept: options.keepBranch === true, localDeleted: [], remoteDeleted: [], warnings: [],
  };
  if (result.kept) return result;
  for (const source of sourcesFor(root, metadata)) {
    await deleteLocal(source.root, branch, source.label, result);
    await deleteRemote(source.root, metadata, branch, source.label, result);
  }
  result.warnings = [...new Set(result.warnings)];
  return result;
}
