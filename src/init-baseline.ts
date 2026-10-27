import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertSafePath } from './files.js';
import {
  createMergeRequest, createPullRequest, findMergedIntegration, platformToken, pushBranch,
  resolvePlatformRepository, tokenGuidance, type FetchLike, type PlatformRepository, type PlatformToken,
} from './platform-api.js';
import { META, parseMetadata } from './project-metadata.js';
import type { FileChange, InitBaseline, ProjectMetadata, ProjectPlatform } from './types.js';

const execFileAsync = promisify(execFile);
const INIT_SUFFIX = 'tiller-init';
const INIT_BRANCH = 'chore/tiller-init';
const INIT_COMMIT_MESSAGE = 'chore(tiller): 完成工程初始化';
const INIT_PR_TITLE = INIT_COMMIT_MESSAGE;
const INIT_PR_BODY = '初始化 tiller 工程结构。';
const INIT_ID = /^[0-9]{8}-tiller-init$/u;

interface CommandResult { ok: boolean; stdout: string; stderr: string; unavailable: boolean }

export interface InitBaselineResult {
  id: string;
  branch: string;
  commit: string;
  head: string;
  worktree: string;
  status: 'pending';
  prUrl?: string;
  warnings: string[];
  next: string[];
}

export interface InitBaselineOutcome {
  baseline: InitBaselineResult | null;
  metadata: ProjectMetadata;
  warnings: string[];
}

export interface InitBaselineProof {
  merged: boolean;
  detail: string;
  marked: boolean;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function commandError(result: CommandResult, fallback: string): string {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

async function run(root: string, command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
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

async function git(root: string, args: string[]): Promise<CommandResult> {
  return run(root, 'git', args);
}

async function gitHead(root: string): Promise<string | null> {
  const result = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  return result.ok && /^[a-f0-9]{40,64}$/u.test(result.stdout.trim()) ? result.stdout.trim() : null;
}

async function gitTop(root: string): Promise<string | null> {
  const result = await git(root, ['rev-parse', '--show-toplevel']);
  if (!result.ok) return null;
  try { return await realpath(result.stdout.trim()); }
  catch { return null; }
}

async function createCommit(root: string, message: string): Promise<string> {
  const [name, email] = await Promise.all([
    git(root, ['config', 'user.name']),
    git(root, ['config', 'user.email']),
  ]);
  const author = name.ok && name.stdout.trim() ? name.stdout.trim() : 'tiller';
  const address = email.ok && email.stdout.trim() ? email.stdout.trim() : 'tiller@localhost';
  const added = await git(root, ['add', '--all']);
  if (!added.ok) fail('INIT_BASELINE_COMMIT_FAILED', `初始化 worktree 暂存失败：${commandError(added, 'git add 失败')}`);
  const committed = await git(root, ['-c', `user.name=${author}`, '-c', `user.email=${address}`, 'commit', '--quiet', '-m', message]);
  if (!committed.ok) fail('INIT_BASELINE_COMMIT_FAILED', `初始化 worktree 提交失败：${commandError(committed, 'git commit 失败')}`);
  const head = await gitHead(root);
  if (!head) fail('INIT_BASELINE_COMMIT_FAILED', '初始化 worktree 提交后无法读取 HEAD。');
  return head;
}

interface RemoteAttempt {
  prUrl?: string;
  next: string[];
}

function tokenExport(token: PlatformToken | PlatformRepository): string {
  return token.platform === 'github' ? 'export GITHUB_TOKEN=<token>' : 'export GITLAB_TOKEN=<token>';
}

function pendingNext(id: string, repository?: PlatformRepository): string[] {
  const close = `创建/合入 PR/MR 后运行：tiller close ${id} --reason "初始化基线已合入"`;
  if (!repository) {
    return [
      '检查 origin 是否为可解析的 GitHub/GitLab HTTPS 或 SSH 仓库地址，并设置对应 token 后重试。',
      close,
    ];
  }
  return [
    tokenExport(repository),
    `设置 token 后重新运行 tiller init；它会用 tokenized HTTPS git push 推送 ${INIT_BRANCH}，并经 ${repository.platform === 'github' ? 'GitHub' : 'GitLab'} REST API 创建 PR/MR，无需手写 API 请求。`,
    close,
  ];
}

async function attemptRemote(id: string, worktree: string, platform: ProjectPlatform,
  warnings: string[]): Promise<RemoteAttempt> {
  let repository: PlatformRepository;
  try {
    repository = await resolvePlatformRepository(worktree, platform);
  } catch (error) {
    warnings.push(`无法解析远端仓库：${(error as Error).message}`);
    return { next: pendingNext(id) };
  }

  const token = platformToken(repository.platform);
  if (!token) {
    const guidance = tokenGuidance(repository.platform, repository.apiBase);
    warnings.push(guidance);
    return { next: [guidance, ...pendingNext(id, repository)] };
  }

  try {
    const pushed = await pushBranch(worktree, repository, token, INIT_BRANCH);
    warnings.push(...pushed.warnings);
    const created = repository.platform === 'github'
      ? await createPullRequest(repository, token, { branch: INIT_BRANCH, title: INIT_PR_TITLE, body: INIT_PR_BODY })
      : await createMergeRequest(repository, token, { branch: INIT_BRANCH, title: INIT_PR_TITLE, body: INIT_PR_BODY });
    return {
      prUrl: created.url,
      next: [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`],
    };
  } catch (error) {
    warnings.push(`初始化分支推送或 PR/MR 创建失败：${(error as Error).message}`);
    return { next: pendingNext(id, repository) };
  }
}

async function cleanupCreated(root: string, worktreeRelative: string): Promise<void> {
  const worktree = path.resolve(root, ...worktreeRelative.split('/'));
  await git(root, ['worktree', 'remove', '--force', worktree]);
  await git(root, ['worktree', 'prune']);
  await git(root, ['branch', '-D', INIT_BRANCH]);
  try { await rm(await assertSafePath(root, `.tiller/local/${path.basename(path.dirname(worktree))}`), { recursive: true, force: true }); }
  catch { /* Local cleanup is best-effort after a failed initialization. */ }
}

async function copyChanges(root: string, worktree: string, changes: FileChange[]): Promise<void> {
  for (const change of changes) {
    if (change.after === null) continue;
    const source = await assertSafePath(root, change.path);
    const target = await assertSafePath(worktree, change.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(source));
  }
}

async function cleanupPrimaryInitChanges(root: string, changes: FileChange[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const change of changes) {
    if (change.path === META || change.before !== null || change.after === null || change.before === change.after) continue;
    let target: string;
    let current: string;
    try {
      target = await assertSafePath(root, change.path);
      current = await readFile(target, 'utf8');
    } catch (error) {
      warnings.push(`初始化残留清理跳过 ${change.path}：${(error as Error).message}`);
      continue;
    }
    if (current !== change.after) {
      warnings.push(`初始化残留清理跳过 ${change.path}：内容已在初始化后变化。`);
      continue;
    }
    const tracked = await git(root, ['ls-files', '--error-unmatch', '--', change.path]);
    if (tracked.ok) {
      warnings.push(`初始化残留清理跳过 ${change.path}：文件已被 Git 跟踪。`);
      continue;
    }
    const untracked = await git(root, ['ls-files', '--others', '-z', '--', change.path]);
    if (!untracked.ok || !untracked.stdout.split('\0').includes(change.path)) {
      warnings.push(`初始化残留清理跳过 ${change.path}：文件不再是未跟踪状态。`);
      continue;
    }
    try { await rm(target); }
    catch (error) { warnings.push(`初始化残留清理失败 ${change.path}：${(error as Error).message}`); }
  }
  return warnings;
}

export function initBaselineId(at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}${value('month')}${value('day')}-${INIT_SUFFIX}`;
}

export function isInitBaselineId(id: string): boolean {
  return INIT_ID.test(id);
}

export function initBaselinePending(baseline: InitBaseline | undefined): boolean {
  return baseline !== undefined && baseline.status !== 'merged';
}

export async function markInitBaselineMerged(rootInput: string, id: string): Promise<InitBaseline> {
  const root = path.resolve(rootInput);
  const target = await assertSafePath(root, META);
  const metadata = parseMetadata(await readFile(target, 'utf8'));
  const baseline = metadata.initBaseline;
  if (!baseline || baseline.id !== id) fail('INIT_BASELINE_NOT_FOUND', `工程元信息中没有初始化基线 ${id}。`);
  if (baseline.status === 'merged') return baseline;
  const merged: InitBaseline = { ...baseline, status: 'merged' };
  await writeFile(target, `${JSON.stringify({ ...metadata, initBaseline: merged }, null, 2)}\n`, 'utf8');
  return merged;
}

export async function proveInitBaselineMerged(rootInput: string, metadata: ProjectMetadata,
  fetchImpl: FetchLike = globalThis.fetch): Promise<InitBaselineProof> {
  const baseline = metadata.initBaseline;
  if (!baseline) return { merged: true, detail: '无初始化基线记录。', marked: false };
  if (baseline.status === 'merged') {
    return { merged: true, detail: `初始化基线 ${baseline.id} 已合入。`, marked: false };
  }
  const root = path.resolve(rootInput);
  const head = await gitHead(root);
  if (head && /^[a-f0-9]{7,64}$/u.test(baseline.commit)) {
    const ancestor = await git(root, ['merge-base', '--is-ancestor', baseline.commit, head]);
    if (ancestor.ok) {
      await markInitBaselineMerged(root, baseline.id);
      return { merged: true, detail: `初始化基线 ${baseline.id} 的提交已在当前历史中。`, marked: true };
    }
  }
  let detail = '平台未找到该分支已合入的 PR/MR';
  try {
    const configured = metadata.platform ?? 'github';
    const repository = await resolvePlatformRepository(root, configured);
    const token = platformToken(repository.platform);
    if (!token) {
      detail = `缺少 ${repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN'}，无法确认平台合入状态`;
    } else {
      const merged = await findMergedIntegration(repository, token, baseline.branch, fetchImpl);
      if (merged) {
        await markInitBaselineMerged(root, baseline.id);
        return { merged: true, detail: `初始化基线 ${baseline.id} 已由平台确认合入。`, marked: true };
      }
    }
  } catch (error) {
    detail = `平台合入状态查询失败：${(error as Error).message}`;
  }
  return { merged: false, detail, marked: false };
}

export async function assertInitBaselineReady(rootInput: string, metadata: ProjectMetadata,
  fetchImpl: FetchLike = globalThis.fetch): Promise<void> {
  const baseline = metadata.initBaseline;
  if (!initBaselinePending(baseline)) return;
  const root = path.resolve(rootInput);
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (repository.unavailable) fail('GIT_UNAVAILABLE', '无法执行 Git，start 不能创建任务 worktree。');
  const proof = await proveInitBaselineMerged(root, metadata, fetchImpl);
  if (proof.merged) return;
  fail('INIT_BASELINE_PENDING', `初始化基线 ${baseline!.id} 不是当前 HEAD 祖先，且${proof.detail}。先合入 ${baseline!.branch} 的 PR/MR 并更新主干；确需跳过时使用 --skip-init-gate。`);
}

export async function createInitBaseline(rootInput: string, metadata: ProjectMetadata,
  changes: FileChange[], platform: ProjectPlatform): Promise<InitBaselineOutcome> {
  const root = path.resolve(rootInput);
  if (metadata.initBaseline) {
    return {
      baseline: null, metadata,
      warnings: [`初始化基线 ${metadata.initBaseline.id} 已存在；本次补齐未自动创建新 worktree，请在原基线分支核对后提交。`],
    };
  }
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  const head = await gitHead(root);
  const top = await gitTop(root);
  const expectedTop = await realpath(root).catch(() => root);
  if (!inside.ok || inside.stdout.trim() !== 'true' || !head || top !== expectedTop) {
    return { baseline: null, metadata, warnings: ['未检测到可提交的 Git HEAD；已跳过初始化 worktree。提交基线后重新运行 init 可完成初始化集成。'] };
  }

  const id = initBaselineId();
  const worktree = `.tiller/local/${id}/worktrees`;
  const target = await assertSafePath(root, worktree);
  const branch = await git(root, ['rev-parse', '--verify', `refs/heads/${INIT_BRANCH}`]);
  if (branch.ok) fail('INIT_BASELINE_BRANCH_EXISTS', `初始化分支 ${INIT_BRANCH} 已存在但 project.json 没有 initBaseline；请人工核对或清理后重试。`);
  await mkdir(path.dirname(target), { recursive: true });
  let rootMetadata: string | null = null;
  let originalMetadataText: string | null = null;

  try {
    const added = await git(root, ['worktree', 'add', '-b', INIT_BRANCH, target, head]);
    if (!added.ok) fail('INIT_BASELINE_WORKTREE_FAILED', `初始化 worktree 创建失败：${commandError(added, 'git worktree add 失败')}`);
    await copyChanges(root, target, changes);
    const commit = await createCommit(target, INIT_COMMIT_MESSAGE);
    const baseline: InitBaseline = { id, branch: INIT_BRANCH, commit, status: 'pending' };
    const nextMetadata: ProjectMetadata = { ...metadata, initBaseline: baseline };
    const metadataText = `${JSON.stringify(nextMetadata, null, 2)}\n`;
    rootMetadata = await assertSafePath(root, META);
    const worktreeMetadata = await assertSafePath(target, META);
    originalMetadataText = await readFile(rootMetadata, 'utf8');
    await writeFile(rootMetadata, metadataText, 'utf8');
    await writeFile(worktreeMetadata, metadataText, 'utf8');
    const worktreeHead = await createCommit(target, INIT_COMMIT_MESSAGE);
    const warnings = await cleanupPrimaryInitChanges(root, changes);
    const remote = await attemptRemote(id, target, platform, warnings);
    const next = remote.prUrl
      ? [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`]
      : remote.next;
    return {
      baseline: {
        id, branch: INIT_BRANCH, commit, head: worktreeHead, worktree, status: 'pending',
        ...(remote.prUrl ? { prUrl: remote.prUrl } : {}), warnings, next,
      },
      metadata: nextMetadata,
      warnings: [],
    };
  } catch (error) {
    if (rootMetadata && originalMetadataText !== null) {
      try { await writeFile(rootMetadata, originalMetadataText, 'utf8'); }
      catch { /* Preserve the original failure; the caller can run recover. */ }
    }
    await cleanupCreated(root, worktree);
    throw error;
  }
}
