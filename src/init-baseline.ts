import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertSafePath } from './files.js';
import {
  createMergeRequest, createPullRequest, findMergedIntegration, findOpenIntegration, platformToken, pushBranch, pushTag,
  resolvePlatformRepository, tokenGuidance, type FetchLike, type PlatformRepository, type PlatformToken,
} from './platform-api.js';
import { META, parseMetadata } from './project-metadata.js';
import type { FileChange, InitBaseline, ProjectMetadata, ProjectPlatform } from './types.js';

const execFileAsync = promisify(execFile);
const INIT_SUFFIX = 'tiller-init';
const INIT_BRANCH = 'chore/tiller-init';
const INIT_COMMIT_MESSAGE = 'chore(tiller): 完成工程初始化';
const INIT_METADATA_COMMIT_MESSAGE = 'chore(tiller): 记录初始化基线';
const INIT_PR_BODY = '初始化 tiller 工程结构。';
const INIT_ID = /^[0-9]{8}-tiller-init$/u;
const LOCAL_MERGED_RELATIVE = '.tiller/local/init-baseline-merged.json';
const LOCAL_BASELINE_FILE = 'baseline.json';

interface LocalMergedMarker {
  id: string;
  status: 'merged';
  at: string;
  commit?: string;
  branch?: string;
}

interface CommandResult { ok: boolean; stdout: string; stderr: string; unavailable: boolean }

export interface InitBaselineResult {
  id: string;
  branch: string;
  commit: string;
  head: string;
  headRef?: string;
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

function initHeadRef(id: string): string {
  return `refs/tags/tiller-init/${id}`;
}

function initPrTitle(id: string): string {
  return `${INIT_COMMIT_MESSAGE} [${id}]`;
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
    const head = await gitHead(worktree);
    if (!head) fail('INIT_BASELINE_COMMIT_FAILED', '初始化 worktree 缺少可推送的 HEAD。');
    try {
      await pushTag(worktree, repository, token, initHeadRef(id));
    } catch (error) {
      warnings.push(`初始化 head 锚点推送失败，平台证明仍可按分支与标题重试：${(error as Error).message}`);
    }
    const existing = await findOpenIntegration(repository, token, INIT_BRANCH, head);
    if (existing) {
      return {
        prUrl: existing.url,
        next: [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`],
      };
    }
    const created = repository.platform === 'github'
      ? await createPullRequest(repository, token, { branch: INIT_BRANCH, title: initPrTitle(id), body: INIT_PR_BODY })
      : await createMergeRequest(repository, token, { branch: INIT_BRANCH, title: initPrTitle(id), body: INIT_PR_BODY });
    return {
      prUrl: created.url,
      next: [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`],
    };
  } catch (error) {
    try {
      const head = await gitHead(worktree);
      const existing = head ? await findOpenIntegration(repository, token, INIT_BRANCH, head) : null;
      if (existing) {
        return {
          prUrl: existing.url,
          next: [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`],
        };
      }
    } catch { /* Preserve the original push/create failure when duplicate lookup also fails. */ }
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

async function writeChanges(worktree: string, changes: FileChange[]): Promise<void> {
  for (const change of changes) {
    if (change.after === null) continue;
    const target = await assertSafePath(worktree, change.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, change.after, 'utf8');
  }
}

async function writeLocalBaseline(root: string, baseline: InitBaseline): Promise<void> {
  const dir = await assertSafePath(root, `.tiller/local/${baseline.id}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, LOCAL_BASELINE_FILE), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

async function readLocalMergedMarker(root: string): Promise<LocalMergedMarker | null> {
  try {
    const text = await readFile(await assertSafePath(root, LOCAL_MERGED_RELATIVE), 'utf8');
    const value = JSON.parse(text) as LocalMergedMarker;
    if (!value || typeof value !== 'object' || value.status !== 'merged' || typeof value.id !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

export async function readLocalInitBaseline(rootInput: string): Promise<InitBaseline | null> {
  const root = path.resolve(rootInput);
  const localRoot = path.join(root, '.tiller/local');
  let entries: string[] = [];
  try { entries = await readdir(localRoot); }
  catch { return null; }
  for (const name of entries) {
    if (!INIT_ID.test(name)) continue;
    try {
      const text = await readFile(path.join(localRoot, name, LOCAL_BASELINE_FILE), 'utf8');
      const value = JSON.parse(text) as InitBaseline;
      if (value && typeof value.id === 'string' && value.id === name) return value;
    } catch { /* keep scanning */ }
  }
  return null;
}

async function cleanupPrimaryInitChanges(root: string, changes: FileChange[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const change of changes) {
    // Clean newly introduced managed files on primary, including META — init must not leave untracked seeds.
    if (change.before !== null || change.after === null || change.before === change.after) continue;
    let target: string;
    let current: string;
    try {
      target = await assertSafePath(root, change.path);
      current = await readFile(target, 'utf8');
    } catch (error) {
      // Missing on primary is the desired post-init state when artifacts lived only in the worktree.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
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
  let baseline: InitBaseline | undefined;
  try {
    const metadata = parseMetadata(await readFile(await assertSafePath(root, META), 'utf8'));
    baseline = metadata.initBaseline;
  } catch {
    baseline = await readLocalInitBaseline(root) ?? undefined;
  }
  if (!baseline || baseline.id !== id) fail('INIT_BASELINE_NOT_FOUND', `工程元信息中没有初始化基线 ${id}。`);
  const merged: InitBaseline = { ...baseline, status: 'merged' };
  const marker: LocalMergedMarker = {
    id: merged.id, status: 'merged', at: new Date().toISOString(),
    ...(merged.commit ? { commit: merged.commit } : {}),
    ...(merged.branch ? { branch: merged.branch } : {}),
  };
  const target = await assertSafePath(root, LOCAL_MERGED_RELATIVE);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  await writeLocalBaseline(root, merged);
  return merged;
}

export async function proveInitBaselineMerged(rootInput: string, metadata: ProjectMetadata,
  fetchImpl: FetchLike = globalThis.fetch): Promise<InitBaselineProof> {
  const baseline = metadata.initBaseline;
  if (!baseline) return { merged: true, detail: '无初始化基线记录。', marked: false };
  const root = path.resolve(rootInput);
  const local = await readLocalMergedMarker(root);
  if (baseline.status === 'merged' || local?.id === baseline.id) {
    return { merged: true, detail: `初始化基线 ${baseline.id} 已合入。`, marked: false };
  }
  const head = await gitHead(root);
  if (head && /^[a-f0-9]{7,64}$/u.test(baseline.commit)) {
    const ancestor = await git(root, ['merge-base', '--is-ancestor', baseline.commit, head]);
    if (ancestor.ok) {
      await markInitBaselineMerged(root, baseline.id);
      return { merged: true, detail: `初始化基线 ${baseline.id} 的提交已在当前历史中。`, marked: true };
    }
  }
  let detail = '平台未找到该分支已合入的 PR/MR';
  const candidates = new Set<string>();
  if (baseline.head && /^[a-f0-9]{40,64}$/u.test(baseline.head)) candidates.add(baseline.head);
  if (baseline.headRef) {
    const resolved = await git(root, ['rev-parse', '--verify', `${baseline.headRef}^{commit}`]);
    if (resolved.ok && /^[a-f0-9]{40,64}$/u.test(resolved.stdout.trim())) candidates.add(resolved.stdout.trim());
  }
  const tip = await git(root, ['rev-parse', '--verify', `refs/heads/${baseline.branch}^{commit}`]);
  if (tip.ok && /^[a-f0-9]{40,64}$/u.test(tip.stdout.trim())) candidates.add(tip.stdout.trim());
  if (!candidates.size) {
    detail = `初始化基线分支 ${baseline.branch} 已删除，且跟踪元信息没有可解析的 head 或 headRef`;
    return { merged: false, detail, marked: false };
  }
  try {
    const configured = metadata.platform ?? 'github';
    const repository = await resolvePlatformRepository(root, configured);
    const token = platformToken(repository.platform);
    if (!token) {
      detail = `缺少 ${repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN'}，无法确认平台合入状态`;
    } else {
      for (const candidate of candidates) {
        const merged = await findMergedIntegration(repository, token, baseline.branch, candidate, fetchImpl);
        if (!merged) continue;
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

  try {
    const added = await git(root, ['worktree', 'add', '-b', INIT_BRANCH, target, head]);
    if (!added.ok) fail('INIT_BASELINE_WORKTREE_FAILED', `初始化 worktree 创建失败：${commandError(added, 'git worktree add 失败')}`);
    // Write all init artifacts only into the init worktree — never seed primary.
    const skeleton = changes.filter(change => change.path !== META);
    await writeChanges(target, skeleton);
    const seedMetadata: ProjectMetadata = { ...metadata };
    delete (seedMetadata as { initBaseline?: InitBaseline }).initBaseline;
    await writeChanges(target, [{ path: META, before: null, after: `${JSON.stringify(seedMetadata, null, 2)}\n` }]);
    const commit = await createCommit(target, INIT_COMMIT_MESSAGE);
    const headRef = initHeadRef(id);
    const baseline: InitBaseline = { id, branch: INIT_BRANCH, commit, headRef, status: 'pending' };
    const nextMetadata: ProjectMetadata = { ...metadata, initBaseline: baseline };
    await writeChanges(target, [{ path: META, before: null, after: `${JSON.stringify(nextMetadata, null, 2)}\n` }]);
    const worktreeHead = await createCommit(target, INIT_METADATA_COMMIT_MESSAGE);
    const tagged = await git(target, ['tag', '-f', headRef, worktreeHead]);
    if (!tagged.ok) fail('INIT_BASELINE_TAG_FAILED', `初始化 head 锚点创建失败：${commandError(tagged, 'git tag 失败')}`);
    const finalBaseline: InitBaseline = { ...baseline, head: worktreeHead };
    await writeLocalBaseline(root, finalBaseline);
    // Safety net: remove any accidental primary untracked managed copies (including META).
    const warnings = await cleanupPrimaryInitChanges(root, [
      ...changes,
      { path: META, before: null, after: `${JSON.stringify(nextMetadata, null, 2)}\n` },
    ]);
    const remote = await attemptRemote(id, target, platform, warnings);
    const next = remote.prUrl
      ? [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`]
      : remote.next;
    return {
      baseline: {
        id, branch: INIT_BRANCH, commit, head: worktreeHead, headRef, worktree, status: 'pending',
        ...(remote.prUrl ? { prUrl: remote.prUrl } : {}), warnings, next,
      },
      metadata: nextMetadata,
      warnings: [],
    };
  } catch (error) {
    await cleanupCreated(root, worktree);
    throw error;
  }
}
