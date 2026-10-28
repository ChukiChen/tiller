import path from 'node:path';
import { readProjectMetadata } from './core.js';
import { closeFlow } from './flow.js';
import { markInitBaselineMerged, type InitBaselineResult } from './init-baseline.js';
import {
  fastForwardDefaultBranch, mergeMergeRequest, mergePullRequest, platformToken, resolvePlatformRepository,
  type FastForwardResult, type PlatformRepository,
} from './platform-api.js';

export interface InitApplyResult {
  id: string;
  platform: 'github' | 'gitlab';
  branch: string;
  base: string;
  merged: true;
  merge: { number: number; command: string };
  close: Awaited<ReturnType<typeof closeFlow>>;
  fastForward: FastForwardResult;
  next: string;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

/** Complete an explicitly requested init delivery, stopping at the first failed step. */
export async function applyInitBaseline(rootInput: string, baseline: InitBaselineResult): Promise<InitApplyResult> {
  const root = path.resolve(rootInput);
  if (!baseline.prUrl || !baseline.head) {
    fail('INIT_APPLY_PR_REQUIRED', `初始化基线 ${baseline.id} 尚未创建可合入的 PR/MR。修复推送或创建失败后，先打开 PR/MR，再运行 tiller merge ${baseline.id}；本机 worktree 已保留。`);
  }
  if (!baseline.base) {
    fail('INIT_APPLY_BASE_REQUIRED', `初始化 PR/MR 缺少目标默认分支。请在平台确认 PR/MR 目标分支后运行 tiller merge ${baseline.id}，再执行 git pull --ff-only。`);
  }

  const metadata = await readProjectMetadata(root);
  let repository: PlatformRepository;
  try { repository = await resolvePlatformRepository(root, metadata.platform ?? 'github'); }
  catch (error) { fail('INIT_APPLY_PLATFORM_FAILED', `无法解析初始化平台：${(error as Error).message}`); }
  const token = platformToken(repository.platform);
  if (!token) fail('INIT_APPLY_TOKEN_MISSING', `初始化 PR/MR 已创建但缺少平台 token，无法自动合入。设置 ${repository.platform === 'github' ? 'GITHUB_TOKEN/GH_TOKEN' : 'GITLAB_TOKEN/GL_TOKEN'} 后运行 tiller merge ${baseline.id}。`);

  let merge: { number: number; command: string };
  try {
    merge = repository.platform === 'github'
      ? await mergePullRequest(repository, token, baseline.branch, globalThis.fetch, baseline.head)
      : await mergeMergeRequest(repository, token, baseline.branch, globalThis.fetch, baseline.head);
  } catch (error) {
    fail('INIT_APPLY_MERGE_FAILED', `初始化 PR/MR 已创建，但平台 squash 合入失败：${(error as Error).message}。修复合入条件后运行 tiller merge ${baseline.id}，再执行 git pull --ff-only；本机 worktree 与 open PR/MR 已保留。`);
  }

  try { await markInitBaselineMerged(root, baseline.id, baseline.head); }
  catch (error) {
    fail('INIT_APPLY_MARK_FAILED', `远端已合入，但本机合入证明写入失败：${(error as Error).message}。运行 tiller close ${baseline.id} --reason "已合入" 完成清理。`);
  }

  let close: Awaited<ReturnType<typeof closeFlow>>;
  try { close = await closeFlow(root, baseline.id, '初始化后自动合入', false, { merged: true }); }
  catch (error) {
    fail('INIT_APPLY_CLOSE_FAILED', `远端已合入，但本机 close 清理失败：${(error as Error).message}。确认合并证明后运行 tiller close ${baseline.id} --reason "已合入"。`);
  }

  let fastForward: FastForwardResult;
  try { fastForward = await fastForwardDefaultBranch(root, repository, token, baseline.base); }
  catch (error) {
    fail('INIT_APPLY_FAST_FORWARD_FAILED', `${(error as Error).message}。远端已合入且本机已清理；请在 primary 执行 git checkout ${baseline.base} && git pull --ff-only。`);
  }

  return {
    id: baseline.id,
    platform: repository.platform,
    branch: baseline.branch,
    base: baseline.base,
    merged: true,
    merge,
    close,
    fastForward,
    next: '初始化 PR/MR 已 squash 合入，本机已清理，primary 默认分支已快进。',
  };
}
