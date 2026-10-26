import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assertSafePath } from './files.js';
import { platformCliUnavailable, resolvePlatformCli } from './platform-cli.js';
import { META, parseMetadata } from './project-metadata.js';
import type { FileChange, InitBaseline, ProjectMetadata, ProjectPlatform } from './types.js';

const execFileAsync = promisify(execFile);
const INIT_SUFFIX = 'tiller-init';
const INIT_BRANCH = 'chore/tiller-init';
const INIT_COMMIT_MESSAGE = 'chore(tiller): 完成工程初始化';
const INIT_PR_TITLE = INIT_COMMIT_MESSAGE;
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function commandSteps(worktree: string, platform: ProjectPlatform): string[] {
  const commands = [`git -C ${shellQuote(worktree)} push -u origin ${INIT_BRANCH}`];
  const body = '初始化 tiller 工程结构。';
  if (platform === 'github' || platform === 'both') {
    commands.push(`cd ${shellQuote(worktree)} && github pr create --head ${INIT_BRANCH} --title ${shellQuote(INIT_PR_TITLE)} --body ${shellQuote(body)}`);
  }
  if (platform === 'gitlab' || platform === 'both') {
    commands.push(`cd ${shellQuote(worktree)} && gitlab mr create --source-branch ${INIT_BRANCH} --title ${shellQuote(INIT_PR_TITLE)} --description ${shellQuote(body)} --yes`);
  }
  return commands;
}

function findUrl(text: string): string | undefined {
  return /https?:\/\/[^\s]+/u.exec(text)?.[0];
}

async function attemptRemote(worktree: string, platform: ProjectPlatform,
  warnings: string[]): Promise<string | undefined> {
  const pushed = await git(worktree, ['push', '-u', 'origin', INIT_BRANCH]);
  if (!pushed.ok) warnings.push(`初始化分支尚未推送：${commandError(pushed, 'git push 失败')}`);
  const body = '初始化 tiller 工程结构。';
  const failures: string[] = [];
  if (platform === 'github' || platform === 'both') {
    const resolved = await resolvePlatformCli('github');
    if (!resolved) failures.push(platformCliUnavailable('github'));
    else try {
      const created = await run(worktree, resolved.executable,
        ['pr', 'create', '--head', INIT_BRANCH, '--title', INIT_PR_TITLE, '--body', body]);
      if (created.ok) return findUrl(`${created.stdout}\n${created.stderr}`) ?? 'PR 已创建';
      failures.push(commandError(created, 'github pr create 失败'));
    } finally { await resolved.cleanup(); }
  }
  if (platform === 'gitlab' || platform === 'both') {
    const resolved = await resolvePlatformCli('gitlab');
    if (!resolved) failures.push(platformCliUnavailable('gitlab'));
    else try {
      const created = await run(worktree, resolved.executable, ['mr', 'create', '--source-branch', INIT_BRANCH,
        '--title', INIT_PR_TITLE, '--description', body, '--yes']);
      if (created.ok) return findUrl(`${created.stdout}\n${created.stderr}`) ?? 'MR 已创建';
      failures.push(commandError(created, 'gitlab mr create 失败'));
    } finally { await resolved.cleanup(); }
  }
  if (failures.length) warnings.push(`自动创建初始化 PR/MR 失败：${failures.join('；')}`);
  return undefined;
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

export async function assertInitBaselineReady(rootInput: string, metadata: ProjectMetadata): Promise<void> {
  const baseline = metadata.initBaseline;
  if (!initBaselinePending(baseline)) return;
  const root = path.resolve(rootInput);
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (repository.unavailable) fail('GIT_UNAVAILABLE', '无法执行 Git，start 不能创建任务 worktree。');
  const head = await gitHead(root);
  if (head && /^[a-f0-9]{7,64}$/u.test(baseline!.commit)) {
    const ancestor = await git(root, ['merge-base', '--is-ancestor', baseline!.commit, head]);
    if (ancestor.ok) return;
  }
  fail('INIT_BASELINE_PENDING', `初始化基线 ${baseline!.id} 尚未合入当前 HEAD。先合入 ${baseline!.branch} 的 PR/MR 并更新主干；确需跳过时使用 --skip-init-gate。`);
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
    const warnings: string[] = [];
    const prUrl = await attemptRemote(target, platform, warnings);
    const next = prUrl
      ? [`人工合入 ${INIT_BRANCH} 后运行：tiller close ${id} --reason "初始化基线已合入"`]
      : [...commandSteps(worktree, platform), `创建/合入 PR/MR 后运行：tiller close ${id} --reason "初始化基线已合入"`];
    return {
      baseline: {
        id, branch: INIT_BRANCH, commit, head: worktreeHead, worktree, status: 'pending',
        ...(prUrl ? { prUrl } : {}), warnings, next,
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
