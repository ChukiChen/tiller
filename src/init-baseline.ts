import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertSafePath } from './files.js';
import {
  createMergeRequest, createPullRequest, findMergedIntegration, findMergedIntegrationByCommit, findOpenIntegration,
  platformToken, pushBranch, resolvePlatformRepository, tokenGuidance, tokenizedGitEnvironment,
  type FetchLike, type PlatformRepository, type PlatformToken,
} from './platform-api.js';
import { META, parseInitBaseline, parseMetadata } from './project-metadata.js';
import type { FileChange, InitBaseline, InitBaselineStatus, ProjectMetadata, ProjectPlatform } from './types.js';

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
  head?: string;
}

interface LocalInitBaseline extends InitBaseline {
  prUrl?: string;
  prNumber?: number;
}

interface CommandResult { ok: boolean; stdout: string; stderr: string; unavailable: boolean }

export interface InitBaselineResult {
  id: string;
  branch: string;
  commit: string;
  head: string;
  worktree: string;
  prUrl?: string;
  base?: string;
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

export interface InitEnvironment {
  remoteRequired: boolean;
  repository?: PlatformRepository;
  token?: PlatformToken;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function commandError(result: CommandResult, fallback: string): string {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

function commitTip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(normalized) ? normalized : null;
}

async function run(root: string, command: string, args: string[], env: NodeJS.ProcessEnv = process.env,
  timeout?: number): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
      ...(timeout === undefined ? {} : { timeout, killSignal: 'SIGTERM' as const }),
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

function redactedFailure(value: string, token: PlatformToken): string {
  const basic = Buffer.from(`${token.platform === 'github' ? 'x-access-token' : 'oauth2'}:${token.value}`).toString('base64');
  return value.replaceAll(token.value, '[REDACTED]').replaceAll(basic, '[REDACTED]').replace(/Authorization:\s*\S+/giu, 'Authorization: [REDACTED]');
}

async function assertOriginReachable(root: string, repository: PlatformRepository, token: PlatformToken): Promise<void> {
  const environment = tokenizedGitEnvironment(repository, token);
  environment.GCM_INTERACTIVE = 'Never';
  if (/^(?:ssh:|\S+@\S+?:)/u.test(repository.remoteUrl)) {
    environment.GIT_SSH_COMMAND = `${environment.GIT_SSH_COMMAND ?? 'ssh'} -o BatchMode=yes -o ConnectTimeout=10`;
  }
  const checked = await run(root, 'git', ['ls-remote', '--heads', 'origin'], environment, 15_000);
  if (checked.ok) return;
  const detail = redactedFailure(commandError(checked, 'git ls-remote 未返回错误详情'), token).replace(/\s+/gu, ' ').slice(0, 600);
  fail('INIT_PREFLIGHT_REMOTE_UNREACHABLE',
    `初始化预检失败：origin ${repository.remoteUrl} 不可达或认证未通过。请检查网络和仓库地址，确认凭证有效后运行 git ls-remote --heads origin 自检；本次未创建目标目录、初始化 worktree、分支、提交或受管文件。${detail ? `\n${detail}` : ''}`);
}

async function git(root: string, args: string[]): Promise<CommandResult> {
  return run(root, 'git', args);
}

async function gitHead(root: string): Promise<string | null> {
  const result = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  return result.ok ? commitTip(result.stdout) : null;
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
  prNumber?: number;
  base?: string;
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

function initPrTitle(id: string): string {
  return `${INIT_COMMIT_MESSAGE} [${id}]`;
}

async function attemptRemote(id: string, worktree: string, platform: ProjectPlatform,
  warnings: string[], environment?: InitEnvironment): Promise<RemoteAttempt> {
  let repository: PlatformRepository;
  try {
    repository = environment?.repository ?? await resolvePlatformRepository(worktree, platform);
  } catch (error) {
    warnings.push(`无法解析远端仓库：${(error as Error).message}`);
    return { next: pendingNext(id) };
  }

  const token = environment?.token ?? platformToken(repository.platform);
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
    const existing = await findOpenIntegration(repository, token, INIT_BRANCH, head);
    if (existing) {
      return {
        prUrl: existing.url, prNumber: existing.number, base: existing.base,
        next: [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`],
      };
    }
    const created = repository.platform === 'github'
      ? await createPullRequest(repository, token, { branch: INIT_BRANCH, title: initPrTitle(id), body: INIT_PR_BODY })
      : await createMergeRequest(repository, token, { branch: INIT_BRANCH, title: initPrTitle(id), body: INIT_PR_BODY });
    return {
      prUrl: created.url, prNumber: created.number, base: created.base,
      next: [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`],
    };
  } catch (error) {
    try {
      const head = await gitHead(worktree);
      const existing = head ? await findOpenIntegration(repository, token, INIT_BRANCH, head) : null;
      if (existing) {
        return {
          prUrl: existing.url, prNumber: existing.number, base: existing.base,
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

async function writeLocalBaseline(root: string, baseline: LocalInitBaseline): Promise<void> {
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

async function readLocalInitProof(root: string, id: string): Promise<LocalInitBaseline | null> {
  try {
    const text = await readFile(await assertSafePath(root, `.tiller/local/${id}/${LOCAL_BASELINE_FILE}`), 'utf8');
    const raw = JSON.parse(text) as Record<string, unknown>;
    const baseline = parseInitBaseline(raw);
    if (baseline.id !== id) return null;
    return {
      ...baseline,
      ...(typeof raw.prUrl === 'string' && raw.prUrl.trim() ? { prUrl: raw.prUrl } : {}),
      ...(typeof raw.prNumber === 'number' && Number.isInteger(raw.prNumber) && raw.prNumber > 0
        ? { prNumber: raw.prNumber } : {}),
    };
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
      const value = parseInitBaseline(JSON.parse(text));
      if (value.id === name) return value;
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

async function localInitExpectation(root: string, baseline: InitBaseline): Promise<LocalInitBaseline | null> {
  const local = await readLocalInitProof(root, baseline.id);
  return local && local.commit === baseline.commit ? local : null;
}

export async function markInitBaselineMerged(rootInput: string, id: string, expectedHead?: string): Promise<InitBaseline> {
  const root = path.resolve(rootInput);
  let baseline: InitBaseline | undefined;
  try {
    const metadata = parseMetadata(await readFile(await assertSafePath(root, META), 'utf8'));
    baseline = metadata.initBaseline;
  } catch {
    baseline = await readLocalInitBaseline(root) ?? undefined;
  }
  if (!baseline || baseline.id !== id) fail('INIT_BASELINE_NOT_FOUND', `工程元信息中没有初始化基线 ${id}。`);
  const local = await localInitExpectation(root, baseline);
  const head = expectedHead === undefined
    ? commitTip(local?.head) ?? commitTip(baseline.head)
    : commitTip(expectedHead);
  const marker: LocalMergedMarker = {
    id: baseline.id, status: 'merged', at: new Date().toISOString(),
    ...(baseline.commit ? { commit: baseline.commit } : {}),
    ...(baseline.branch ? { branch: baseline.branch } : {}),
    ...(head ? { head } : {}),
  };
  const target = await assertSafePath(root, LOCAL_MERGED_RELATIVE);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  return baseline;
}

export async function proveInitBaselineMerged(rootInput: string, metadata: ProjectMetadata,
  fetchImpl: FetchLike = globalThis.fetch): Promise<InitBaselineProof> {
  const baseline = metadata.initBaseline;
  if (!baseline) return { merged: true, detail: '无初始化基线记录。', marked: false };
  const root = path.resolve(rootInput);
  const head = await gitHead(root);
  const localBaseline = await localInitExpectation(root, baseline);
  const expectedHead = commitTip(localBaseline?.head) ?? commitTip(baseline.head);
  if (head && /^[a-f0-9]{7,64}$/u.test(baseline.commit)) {
    const ancestor = await git(root, ['merge-base', '--is-ancestor', baseline.commit, head]);
    if (ancestor.ok) {
      await markInitBaselineMerged(root, baseline.id, expectedHead ?? undefined);
      return { merged: true, detail: `初始化基线 ${baseline.id} 的提交已在当前历史中。`, marked: true };
    }
  }
  const localMarker = await readLocalMergedMarker(root);
  const markerHead = commitTip(localMarker?.head);
  if (localMarker?.id === baseline.id && localMarker.commit === baseline.commit
    && (expectedHead === null || markerHead === expectedHead)) {
    return {
      merged: true,
      detail: `初始化基线 ${baseline.id} 已由 local marker 确认合入${expectedHead ? `（head ${expectedHead}）` : ''}。`,
      marked: false,
    };
  }
  if (!expectedHead) {
    const open = localBaseline?.prUrl ? `；本机记录的 open PR/MR 为 ${localBaseline.prUrl}` : '';
    let detail = `平台未找到唯一包含初始化提交 ${baseline.commit} 的已合入 PR/MR${open}`;
    try {
      const configured = metadata.platform ?? 'github';
      const repository = await resolvePlatformRepository(root, configured);
      const token = platformToken(repository.platform);
      if (!token) {
        detail = `缺少 ${repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN'}，无法确认平台合入状态`;
      } else {
        const merged = await findMergedIntegrationByCommit(repository, token, baseline.branch, baseline.commit, fetchImpl);
        if (merged) {
          await markInitBaselineMerged(root, baseline.id, merged.head);
          return {
            merged: true,
            detail: `初始化基线 ${baseline.id} 已由提交 ${baseline.commit} 唯一绑定的已合入 PR/MR #${merged.number} 确认（head ${merged.head}）。`,
            marked: true,
          };
        }
      }
    } catch (error) {
      detail = `平台合入状态查询失败：${(error as Error).message}`;
    }
    return { merged: false, detail, marked: false };
  }
  let detail = `平台未找到 head ${expectedHead} 的已合入 PR/MR`;
  try {
    const configured = metadata.platform ?? 'github';
    const repository = await resolvePlatformRepository(root, configured);
    const token = platformToken(repository.platform);
    if (!token) {
      detail = `缺少 ${repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN'}，无法确认平台合入状态`;
    } else {
      const merged = await findMergedIntegration(repository, token, baseline.branch, expectedHead, fetchImpl);
      if (merged) {
        await markInitBaselineMerged(root, baseline.id, expectedHead);
        return {
          merged: true,
          detail: `初始化基线 ${baseline.id} 已由平台确认合入（head ${expectedHead}，PR/MR #${merged.number}）。`,
          marked: true,
        };
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
  if (!baseline) return;
  const root = path.resolve(rootInput);
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (repository.unavailable) fail('GIT_UNAVAILABLE', '无法执行 Git，start 不能创建任务 worktree。');
  const proof = await proveInitBaselineMerged(root, metadata, fetchImpl);
  if (proof.merged) return;
  fail('INIT_BASELINE_PENDING', `初始化基线 ${baseline!.id} 不是当前 HEAD 祖先，且${proof.detail}。先合入 ${baseline!.branch} 的 PR/MR 并更新主干；确需跳过时使用 --skip-init-gate。`);
}

export async function resolveInitBaselineStatus(rootInput: string, metadata: ProjectMetadata,
  fetchImpl: FetchLike = globalThis.fetch): Promise<InitBaselineStatus | undefined> {
  const baseline = metadata.initBaseline;
  if (!baseline) return undefined;
  try {
    const proof = await proveInitBaselineMerged(rootInput, metadata, fetchImpl);
    return {
      id: baseline.id,
      branch: baseline.branch,
      status: proof.merged ? 'merged' : 'pending',
      detail: proof.detail,
    };
  } catch (error) {
    return {
      id: baseline.id,
      branch: baseline.branch,
      status: 'pending',
      detail: `无法确认初始化基线合入状态：${(error as Error).message}`,
    };
  }
}

/** Validate the local Git executable before init creates a target or writes any artifact. */
export async function assertInitGitAvailable(): Promise<void> {
  const result = await run(process.cwd(), 'git', ['--version']);
  if (!result.ok) {
    fail('INIT_PREFLIGHT_GIT',
      '初始化预检失败：PATH 中没有可执行的 git（git --version 未通过）。请安装 Git（见 https://git-scm.com/downloads），确认 git --version 可运行且 PATH 包含其安装目录后重试；本次未创建初始化目录、分支或提交。');
  }
}

/** Fail before the first task/init write when automatic commits have no usable Git identity. */
export async function assertGitIdentity(rootInput: string): Promise<void> {
  const root = path.resolve(rootInput);
  const cwd = await lstat(root).then(stat => stat.isDirectory() ? root : process.cwd())
    .catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return process.cwd();
      throw error;
    });
  const [name, email] = await Promise.all([
    run(cwd, 'git', ['config', '--get', 'user.name']),
    run(cwd, 'git', ['config', '--get', 'user.email']),
  ]);
  if (name.unavailable || email.unavailable) {
    fail('GIT_UNAVAILABLE',
      '无法执行 Git，不能检查或提交任务记录与初始化基线。请安装 Git，确认 git 可执行且 PATH 包含其安装目录后重试；本次尚未写入任务或初始化文件。');
  }
  const missing = [!name.ok || !name.stdout.trim() ? 'user.name' : null,
    !email.ok || !email.stdout.trim() ? 'user.email' : null].filter((value): value is string => value !== null);
  if (!missing.length) return;
  fail('GIT_IDENTITY_MISSING',
    `缺少 Git 身份 ${missing.join('、')}，无法自动提交任务记录或初始化基线。先运行 git config --global user.name "<姓名>" 与 git config --global user.email "<邮箱>"，再重试；本次尚未写入任务或初始化文件。`);
}

/** Validate the remote path before init acquires a lock or writes any artifact. */
export async function assertInitEnvironment(rootInput: string, platform: ProjectPlatform): Promise<InitEnvironment> {
  await assertInitGitAvailable();
  const root = path.resolve(rootInput);
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  const head = await gitHead(root);
  const top = await gitTop(root);
  const expectedTop = await realpath(root).catch(() => root);
  if (!inside.ok || inside.stdout.trim() !== 'true' || !head || top !== expectedTop) {
    return { remoteRequired: false };
  }

  let repository: PlatformRepository;
  try {
    repository = await resolvePlatformRepository(root, platform);
  } catch (error) {
    const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub';
    fail('INIT_PREFLIGHT_REMOTE',
      `初始化预检失败：${(error as Error).message}。请先运行 git remote add origin <${platformName} HTTPS 或 SSH 仓库地址>，确认 origin 可解析后重试；同时设置 ${platform === 'gitlab' ? 'GITLAB_TOKEN/GL_TOKEN' : 'GITHUB_TOKEN/GH_TOKEN'}。`);
  }
  const token = platformToken(repository.platform);
  if (!token) fail('INIT_PREFLIGHT_TOKEN', `初始化预检失败：${tokenGuidance(repository.platform, repository.apiBase)}`);
  await assertOriginReachable(root, repository, token);
  return { remoteRequired: true, repository, token };
}

export async function createInitBaseline(rootInput: string, metadata: ProjectMetadata,
  changes: FileChange[], platform: ProjectPlatform, environment?: InitEnvironment): Promise<InitBaselineOutcome> {
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
  await rm(await assertSafePath(root, LOCAL_MERGED_RELATIVE), { force: true });
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
    const baseline: InitBaseline = { id, branch: INIT_BRANCH, commit };
    const nextMetadata: ProjectMetadata = { ...metadata, initBaseline: baseline };
    await writeChanges(target, [{ path: META, before: null, after: `${JSON.stringify(nextMetadata, null, 2)}\n` }]);
    const worktreeHead = await createCommit(target, INIT_METADATA_COMMIT_MESSAGE);
    const finalBaseline: LocalInitBaseline = { ...baseline, head: worktreeHead };
    await writeLocalBaseline(root, finalBaseline);
    // Safety net: remove any accidental primary untracked managed copies (including META).
    const warnings = await cleanupPrimaryInitChanges(root, [
      ...changes,
      { path: META, before: null, after: `${JSON.stringify(nextMetadata, null, 2)}\n` },
    ]);
    const remote = await attemptRemote(id, target, platform, warnings, environment);
    await writeLocalBaseline(root, {
      ...finalBaseline,
      ...(remote.prUrl ? { prUrl: remote.prUrl } : {}),
      ...(remote.prNumber ? { prNumber: remote.prNumber } : {}),
    });
    const next = remote.prUrl
      ? [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`]
      : remote.next;
    return {
      baseline: {
        id, branch: INIT_BRANCH, commit, head: worktreeHead, worktree,
        ...(remote.prUrl ? { prUrl: remote.prUrl } : {}), ...(remote.base ? { base: remote.base } : {}), warnings, next,
      },
      metadata: nextMetadata,
      warnings: [],
    };
  } catch (error) {
    await cleanupCreated(root, worktree);
    throw error;
  }
}
