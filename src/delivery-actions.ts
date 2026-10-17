import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafePath, validateRelativePath } from './files.js';
import { checkGate, checkMergeGate, type MergeBinding } from './confirmations.js';
import { loadDeliveryContext, saveDeliveryRecord, withDeliveryLock, rebindDeliveryAfterCleanup } from './delivery-environment.js';
import { git } from './delivery-git.js';
import type { DeliveryContext, DeliveryRepository } from './delivery-types.js';
import { assertProviderRemote, ReviewAdapter, validateProvider, type ReviewObject, type ReviewProvider } from './review-adapters.js';

export type DeliveryAction = 'commit' | 'push' | 'review' | 'merge' | 'reconcile' | 'cleanup';
export interface DeliveryAuthorization {
  actions: string[]; repository: string; branch: string; target: string; remote?: string;
  source: { path: string; quote: string };
  sourceReview: { reviewer: string; rationale: string; reviewedAt: string };
}
export interface DeliveryActionInput {
  schemaVersion: 1; repository: string; authorization?: DeliveryAuthorization;
  files?: string[]; message?: string; remote?: string; oid?: string;
  provider?: ReviewProvider; operation?: 'create' | 'update' | 'attach'; reviewId?: string;
  title?: string; body?: string; documentsVersion?: string;
  requestId?: string; binding?: MergeBinding; operationId?: string;
  removeWorktree?: boolean; deleteLocalBranch?: boolean; deleteRemoteBranch?: boolean;
}
interface ActionPlan { schemaVersion: 1; planId: string; action: DeliveryAction; workId: string; input: DeliveryActionInput; snapshot: unknown; fingerprint: string }
interface Journal { operationId: string; action: DeliveryAction; repository: string; inputHash: string; input: DeliveryActionInput; head: string; checkout?: string; state: 'running' | 'succeeded' | 'failed' | 'unknown'; result?: Record<string, unknown> }
function hash(value: unknown): string { return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function text(v: unknown, name: string): string { if (typeof v !== 'string' || !v.trim() || v.includes('\0')) throw new Error(`${name}须为非空文本。`); return v; }
function oid(v: unknown): string { const value = text(v, 'OID'); if (!/^[0-9a-f]{40,64}$/u.test(value)) throw new Error('须使用完整提交 OID。'); return value; }
function cleanPath(p: string): void {
  validateRelativePath(p);
  const parts = p.toLowerCase().split('/');
  if (parts.includes('.git') || parts.some((part, i) => part === '.tiller' && parts[i + 1] === 'local')) throw new Error('不能引用 Git 内部文件或本机数据。');
}
function inputValue(value: unknown): DeliveryActionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('交付输入须为对象。');
  const input = value as DeliveryActionInput;
  if (input.schemaVersion !== 1) throw new Error('不支持的交付输入格式。');
  text(input.repository, '仓库标识');
  const keys = ['schemaVersion', 'repository', 'authorization', 'files', 'message', 'remote', 'oid', 'provider', 'operation', 'reviewId', 'title', 'body', 'documentsVersion', 'requestId', 'binding', 'operationId', 'removeWorktree', 'deleteLocalBranch', 'deleteRemoteBranch'];
  if (Object.keys(input).some(key => !keys.includes(key))) throw new Error('交付输入含不支持字段。');
  if (input.provider) validateProvider(input.provider);
  if (input.authorization) {
    const a = input.authorization;
    if (Object.keys(a).some(key => !['actions', 'repository', 'branch', 'target', 'remote', 'source', 'sourceReview'].includes(key)) ||
        !a.source || Object.keys(a.source).some(key => !['path', 'quote'].includes(key)) ||
        !a.sourceReview || Object.keys(a.sourceReview).some(key => !['reviewer', 'rationale', 'reviewedAt'].includes(key))) throw new Error('授权包含未知字段。');
  }
  return input;
}
function repository(context: DeliveryContext, input: DeliveryActionInput): { repo: DeliveryRepository; root: string } {
  const repo = context.record.repositories.find(r => r.id === input.repository);
  const binding = context.bindings[input.repository];
  if (!repo || !binding) throw new Error('仓库不属于本项隔离交付。');
  return { repo, root: binding.root };
}
async function localWrite(root: string, relative: string, value: unknown): Promise<void> {
  const file = await assertSafePath(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temporary, file);
}
const local = (id: string, suffix: string): string => `.tiller/local/delivery/${id}/${suffix}`;
async function readJson<T>(root: string, relative: string): Promise<T> { return JSON.parse(await readFile(await assertSafePath(root, relative), 'utf8')) as T; }
/** Content-addressed approved material, also usable when the management root has no Git. */
export async function deliveryDocumentsVersion(root: string, id: string): Promise<{ version: string; files: { repository: string; path: string; sha256: string }[] }> {
  return documentsVersion(await loadDeliveryContext(root, id));
}
export async function verifyDeliveryDocuments(root: string, id: string) {
  const context = await loadDeliveryContext(root, id);
  const material = await documentsVersion(context);
  return { ...material, commits: await verifyCommittedDocuments(context, material.files) };
}
async function documentsVersion(context: DeliveryContext): Promise<{ version: string; files: { repository: string; path: string; sha256: string }[] }> {
  type MaterialFile = { repository: string; path: string; sha256: string; snapshot: string };
  const registry = await readJson<{ requests: { requestId: string; upstream: string[]; files: MaterialFile[] }[]; decisions: { decisionId: string; requestId: string; files: MaterialFile[] }[] }>(context.recordRoot, `.tiller/work/${context.workId}/confirmations.json`);
  const found = new Map<string, { repository: string; path: string; sha256: string }>();
  const seen = new Set<string>();
  const capture = async (file: { repository: string; path: string; sha256?: string }): Promise<void> => {
    cleanPath(file.path);
    const sourceRoot = file.repository === '.' ? context.recordRoot : context.bindings[file.repository]?.root;
    if (!sourceRoot) throw new Error(`资料版本缺少仓库定位：${file.repository}`);
    const sha256 = createHash('sha256').update(await readFile(await assertSafePath(sourceRoot, file.path))).digest('hex');
    if (file.sha256 && sha256 !== file.sha256) throw new Error('已确认资料发生变化，必须重新核对。');
    found.set(`${file.repository}:${file.path}`, { repository: file.repository, path: file.path, sha256 });
  };
  const captureSnapshot = async (file: MaterialFile): Promise<void> => {
    const snapshot = await readJson<{ encoding?: unknown; content?: unknown }>(context.recordRoot, file.snapshot);
    if (!snapshot || snapshot.encoding !== 'utf8' || typeof snapshot.content !== 'string' ||
        Object.keys(snapshot).some(key => !['encoding', 'content'].includes(key)) || hash(snapshot.content) !== file.sha256) {
      throw new Error('确认快照内容与登记摘要不符，必须重新核对。');
    }
    // The registered digest describes decoded content; the manifest binds the actual JSON wrapper bytes too.
    await capture({ repository: '.', path: file.snapshot });
  };
  const visit = async (id: string): Promise<void> => {
    if (seen.has(id)) return; seen.add(id);
    const request = registry.requests.find(r => r.requestId === id);
    if (!request) throw new Error('资料版本缺少关联的确认请求。');
    for (const file of request.files) {
      await capture(file);
      await captureSnapshot(file);
    }
    await capture({ repository: '.', path: `.tiller/work/${context.workId}/reviews/request-${id}/presentation.md` });
    const gate = await checkGate(context.recordRoot, context.workId, id);
    const decision = registry.decisions.find(item => item.requestId === id && item.decisionId === gate.decisionId);
    if (!gate.confirmed || !decision) throw new Error('资料版本缺少当前有效的人工确认。');
    for (const file of decision.files) {
      await capture(file);
      await captureSnapshot(file);
    }
    for (const parent of request.upstream) await visit(parent);
  };
  await visit(context.record.designRequest);
  const files = [...found.values()].sort((a, b) => `${a.repository}:${a.path}`.localeCompare(`${b.repository}:${b.path}`));
  return { version: `sha256:${hash(files)}`, files };
}
async function verifyCommittedDocuments(context: DeliveryContext, files: { repository: string; path: string; sha256: string }[]): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const file of files) {
    const binding = context.bindings[file.repository];
    // A non-Git management root deliberately uses the immutable material manifest.
    if (!binding && file.repository === '.' && context.record.mode === 'workspace') continue;
    if (!binding) throw new Error('批准资料缺少 Git 交付定位。');
    const head = versions[file.repository] ?? (await git(binding.root, ['rev-parse', 'HEAD'])).trim();
    versions[file.repository] = head;
    let committed: string;
    try { committed = await git(binding.root, ['show', `${head}:${file.path}`]); }
    catch { throw new Error(`已批准资料尚未包含在该仓库提交中：${file.repository}:${file.path}`); }
    if (hash(committed) !== file.sha256) throw new Error(`已批准资料与实际交付提交不一致：${file.repository}:${file.path}`);
  }
  return versions;
}
async function authorization(context: DeliveryContext, action: DeliveryAction, input: DeliveryActionInput, repo: DeliveryRepository): Promise<unknown> {
  if (action === 'reconcile') return null;
  const a = input.authorization;
  if (!a || !Array.isArray(a.actions) || a.repository !== repo.id || a.branch !== repo.branch || a.target !== repo.target ||
      !a.actions.includes(action) || ((['push', 'review', 'merge'].includes(action) || input.deleteRemoteBranch) && a.remote !== input.remote)) throw new Error('缺少匹配仓库、分支、目标、远端及动作的明确授权。');
  if (action === 'cleanup') {
    for (const [enabled, permission] of [[input.removeWorktree, 'remove-worktree'], [input.deleteLocalBranch, 'delete-local-branch'], [input.deleteRemoteBranch, 'delete-remote-branch']] as const) {
      if (enabled && !a.actions.includes(permission)) throw new Error(`清理缺少单独授权：${permission}`);
    }
  }
  if (!a.source || !a.sourceReview) throw new Error('授权缺少来源及执行者复核。');
  cleanPath(text(a.source.path, '授权来源路径'));
  const source = await readFile(await assertSafePath(context.recordRoot, a.source.path), 'utf8');
  if (!source.includes(text(a.source.quote, '用户原话'))) throw new Error('授权原话不在来源文件中。');
  text(a.sourceReview.reviewer, '复核者'); text(a.sourceReview.rationale, '复核理由');
  if (!Number.isFinite(Date.parse(a.sourceReview.reviewedAt))) throw new Error('授权复核时间无效。');
  return { sourceHash: hash(source), scope: a, basis: 'reported-review', sourceVerification: 'not-independently-verified' };
}
async function remoteIdentity(root: string, repo: DeliveryRepository, input: DeliveryActionInput): Promise<{ name: string; urlHash: string }> {
  const name = text(input.remote, '远端');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) || name !== repo.remote) throw new Error('只能使用隔离准备中明确登记的远端名。');
  const urls = (await git(root, ['remote', 'get-url', '--all', name])).trim().split('\n');
  const pushUrls = (await git(root, ['remote', 'get-url', '--push', '--all', name])).trim().split('\n');
  if (urls.length !== 1 || pushUrls.length !== 1) throw new Error('远端配置存在多个读写地址，超出已批准范围。');
  const url = urls[0]!; const pushUrl = pushUrls[0]!;
  if (url !== pushUrl) throw new Error('读写远端不同，须先明确协调远端配置。');
  if (input.provider) assertProviderRemote(validateProvider(input.provider), url);
  return { name, urlHash: hash(url) };
}
async function remoteHead(root: string, name: string, branch: string): Promise<string | null> {
  const result = (await git(root, ['ls-remote', '--heads', name, `refs/heads/${branch}`])).trim();
  if (!result) return null;
  const rows = result.split('\n');
  if (rows.length !== 1 || rows[0]!.split(/\s+/u)[1] !== `refs/heads/${branch}`) throw new Error('远端分支查询不唯一。');
  return oid(rows[0]!.split(/\s+/u)[0]);
}
async function localState(root: string): Promise<unknown> {
  const paths = [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean))].sort();
  const files: [string, string | null][] = [];
  for (const p of paths) {
    cleanPath(p); const full = await assertSafePath(root, p);
    try {
      const stat = await lstat(full);
      if (!stat.isFile()) throw new Error(`不支持的交付文件类型：${p}`);
      files.push([p, createHash('sha256').update(await readFile(full)).digest('hex')]);
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') files.push([p, null]); else throw error; }
  }
  return { head: (await git(root, ['rev-parse', 'HEAD'])).trim(), branch: (await git(root, ['symbolic-ref', '--short', 'HEAD'])).trim(),
    status: await git(root, ['status', '--porcelain=v1', '-z']), index: await git(root, ['ls-files', '--stage', '-z']), files };
}
async function unresolved(context: DeliveryContext): Promise<Journal[]> {
  const directory = await assertSafePath(context.anchorRoot, local(context.workId, 'operations'));
  let names: string[];
  try { names = await readdir(directory); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  const result: Journal[] = [];
  for (const name of names.filter(n => /^[0-9a-f-]+\.json$/u.test(n))) {
    const journal = await readJson<Journal>(context.anchorRoot, local(context.workId, `operations/${name}`));
    const receipt = context.record.events.some(event => event.id === journal.operationId || event.details.reconciledOperation === journal.operationId);
    if (journal.state !== 'failed' && (journal.state !== 'succeeded' || !receipt)) result.push(journal);
  }
  return result;
}
function adapter(input: DeliveryActionInput): ReviewAdapter { if (!input.provider) throw new Error('须明确指定评审平台。'); return new ReviewAdapter(input.provider); }
function checkReview(review: ReviewObject, repo: DeliveryRepository, head: string): void {
  if (review.source !== repo.branch || review.target !== repo.target || review.sourceOid !== head) throw new Error('评审源、目标或提交与交付范围不一致。');
}
function stableReview(review: ReviewObject): Omit<ReviewObject, 'observedAt'> { const { observedAt: _time, ...stable } = review; return stable; }
async function snapshot(context: DeliveryContext, action: DeliveryAction, input: DeliveryActionInput): Promise<unknown> {
  const { repo, root } = repository(context, input);
  const state = await localState(root) as { head: string; branch: string };
  if (state.branch !== repo.branch && action !== 'reconcile') throw new Error('活动分支已漂移。');
  const auth = await authorization(context, action, input, repo);
  const gate = await checkGate(context.recordRoot, context.workId, context.record.designRequest);
  if (!gate.confirmed && action !== 'reconcile' && action !== 'cleanup') throw new Error(`设计确认无效：${gate.blockingReasons.join('；')}`);
  const pending = await unresolved(context);
  if (pending.length && action !== 'reconcile') throw new Error('存在未结束操作，先 reconcile 核对，不能重放。');
  const extra: Record<string, unknown> = {};
  if (['push', 'review', 'merge'].includes(action) || input.remote) {
    const remote = await remoteIdentity(root, repo, input);
    extra.remote = remote; extra.remoteHead = await remoteHead(root, remote.name, repo.branch);
    extra.targetHead = await remoteHead(root, remote.name, repo.target);
  }
  if (action === 'commit') {
    if (!Array.isArray(input.files) || !input.files.length || new Set(input.files).size !== input.files.length) throw new Error('提交须列出不重复的精确文件。');
    text(input.message, '提交信息');
    for (const file of input.files) { cleanPath(file); await assertSafePath(root, file); }
    const confirmations = await readJson<{ requests: { gate: string }[] }>(context.recordRoot, `.tiller/work/${context.workId}/confirmations.json`);
    if (confirmations.requests.some(r => r.gate === 'merge') && input.files.some(file => file.startsWith(`.tiller/work/${context.workId}/`))) {
      throw new Error('固定合入源版本后的控制记录须另行归档，不得混入待合入分支。');
    }
    if ((await git(root, ['diff', '--cached', '--name-only', '-z'])).length) throw new Error('暂存区已有变更；先协调，不能夹带或覆盖。');
    const all = new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0'));
    if (input.files.some(file => !all.has(file))) throw new Error('文件清单包含目录、忽略文件或不存在的路径。');
  }
  if (action === 'push' && oid(input.oid) !== state.head) throw new Error('推送 OID 必须等于当前活动 HEAD。');
  if (action === 'review') {
    const service = adapter(input); text(input.documentsVersion, '资料版本');
    if (input.operation !== 'attach' && (!input.provider?.tokenEnv || !process.env[input.provider.tokenEnv])) throw new Error('评审写操作缺少配置的认证凭据。');
    const material = await documentsVersion(context);
    if (input.documentsVersion !== material.version) throw new Error('资料版本与当前批准的不可变清单不符。');
    extra.material = material;
    extra.documentCommits = await verifyCommittedDocuments(context, material.files);
    if (extra.remoteHead !== state.head) throw new Error('先推送已确认的源提交，才能提交评审。');
    if (input.operation === 'create') {
      text(input.title, '评审标题'); text(input.body, '评审正文');
      if ((await service.find(repo.branch, repo.target)).some(r => r.state === 'open')) throw new Error('已经存在活动评审，应核对后 attach/update。');
      extra.reviews = [];
    } else if (input.operation === 'attach' || input.operation === 'update') {
      const review = await service.get(text(input.reviewId, '评审标识')); checkReview(review, repo, state.head);
      if (input.operation === 'update') { text(input.title, '评审标题'); text(input.body, '评审正文'); }
      extra.review = stableReview(review);
    } else throw new Error('评审操作须为 create/update/attach。');
  }
  if (action === 'merge') {
    const review = await adapter(input).get(text(input.reviewId, '评审标识')); checkReview(review, repo, state.head);
    if (!input.binding) throw new Error('合入缺少版本组合。');
    if (input.binding.documentsVersion !== (await documentsVersion(context)).version) throw new Error('合入资料版本发生变化。');
    const bound = input.binding.repositories.find(r => r.repository === repo.id);
    if (!bound || bound.sourceOid !== review.sourceOid || bound.targetOid !== review.targetOid || bound.targetBranch !== review.target ||
        bound.review.id !== review.id || bound.review.provider !== review.provider || bound.review.url !== review.url) throw new Error('合入对象已漂移。');
    const checked = await checkMergeGate(context.recordRoot, context.workId, text(input.requestId, '合入确认'), input.binding);
    if (!checked.confirmed) throw new Error(`合入确认无效：${checked.blockingReasons.join('；')}`);
    extra.review = stableReview(review);
    // These REST APIs guard the source only, not the reviewed target OID.
    throw new Error('当前适配不能原子校验源和目标 OID；保留合入确认，在受保护人工流程完成后 reconcile。');
  }
  if (action === 'reconcile') {
    if (input.operationId) {
      const operationId = text(input.operationId, '操作标识');
      if (!/^[0-9a-f-]{36}$/u.test(operationId)) throw new Error('操作标识无效。');
      const journal = await readJson<Journal>(context.anchorRoot, local(context.workId, `operations/${operationId}.json`));
      if (journal.repository !== input.repository) throw new Error('恢复操作仓库不匹配。');
      extra.journal = journal;
      extra.observed = await reconcileObservation(context, journal, input);
    } else extra.observed = await externalReviewObservation(context, input);
  }
  if (action === 'cleanup') await validateCleanup(context, input, repo, root);
  return { state, authorization: auth, record: hash(context.record), extra };
}
async function externalReviewObservation(context: DeliveryContext, input: DeliveryActionInput): Promise<Record<string, unknown>> {
  const { repo, root } = repository(context, input);
  await remoteIdentity(root, repo, input);
  const review = await adapter(input).get(text(input.reviewId, '外部评审标识'));
  const head = (await git(root, ['rev-parse', 'HEAD'])).trim();
  checkReview(review, repo, head);
  return { review: stableReview(review), origin: 'external-observation', scopeVerification: 'needs-review',
    limitation: '平台状态是观测事实，不证明人工合入遵守了批准目标版本、检查和授权；仍须核对合入证据。' };
}
async function validateCleanup(context: DeliveryContext, input: DeliveryActionInput, repo: DeliveryRepository, root: string): Promise<void> {
  if (!input.removeWorktree && !input.deleteLocalBranch && !input.deleteRemoteBranch) throw new Error('未指定清理对象。');
  const binding = context.bindings[repo.id]!;
  if (path.resolve(root) === path.resolve(binding.sourceRoot) || path.resolve(root) === path.resolve(context.anchorRoot)) throw new Error('禁止清理主目录。');
  await archivedControlChanges(context, repo, root, input);
  if (!input.remote) throw new Error('清理需要登记远端的保存依据。');
  await remoteIdentity(root, repo, input);
  const head = (await git(root, ['rev-parse', 'HEAD'])).trim();
  if (await remoteHead(root, input.remote, repo.branch) !== head) throw new Error('当前提交未保存到登记的远端分支。');
  if (input.deleteRemoteBranch) {
    if (repo.branch === repo.target || /^(?:main|master|develop|release(?:\/.*)?)$/u.test(repo.branch)) throw new Error('禁止删除受保护远端分支。');
    const target = await remoteHead(root, input.remote, repo.target);
    if (!target) throw new Error('远端目标分支不存在，不能证明提交已保存。');
    await git(root, ['merge-base', '--is-ancestor', head, target]);
  }
  if (input.deleteLocalBranch) {
    if (!input.removeWorktree || repo.branch === repo.target || /^(?:main|master|develop|release(?:\/.*)?)$/u.test(repo.branch)) throw new Error('不能删除活动分支或受保护分支。');
    const target = (await git(binding.sourceRoot, ['rev-parse', '--verify', `refs/heads/${repo.target}`])).trim();
    await git(root, ['merge-base', '--is-ancestor', head, target]);
  }
  // The record-owner requires every shared record already present at its durable source.
  if (path.resolve(root) === path.resolve(context.recordRoot)) {
    const sub = `.tiller/work/${context.workId}`;
    if (hash(await tree(context.recordRoot, sub)) !== hash(await tree(binding.sourceRoot, sub))) throw new Error('共同记录尚未完整归档到主目录，禁止清理唯一副本。');
  }
}
async function archivedControlChanges(context: DeliveryContext, repo: DeliveryRepository, root: string, input: DeliveryActionInput): Promise<string[]> {
  const status = (await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0').filter(Boolean);
  const allowed = `.tiller/work/${context.workId}/`;
  const sourceRoot = context.bindings[repo.id]!.sourceRoot;
  const registered = new Set(['work.md', 'record.json', 'delivery.json', 'confirmations.json'].map(name => allowed + name));
  if (input.authorization) registered.add(input.authorization.source.path);
  for (const event of context.record.events) {
    const authority = event.details.authorization as DeliveryAuthorization | undefined;
    if (authority?.source && typeof authority.source.path === 'string') registered.add(authority.source.path);
  }
  const registry = await readJson<{ requests: { requestId: string; files: { snapshot: string }[]; exceptionFiles?: { snapshot: string }[] }[]; decisions: { source: { reference: { repository: string; path: string } }; files: { snapshot: string }[] }[] }>(context.recordRoot, allowed + 'confirmations.json');
  for (const request of registry.requests) {
    registered.add(`${allowed}reviews/request-${request.requestId}/presentation.md`);
    for (const file of [...request.files, ...(request.exceptionFiles ?? [])]) registered.add(file.snapshot);
  }
  for (const decision of registry.decisions) {
    if (decision.source.reference.repository === '.') registered.add(decision.source.reference.path);
    for (const file of decision.files) registered.add(file.snapshot);
  }
  const files: string[] = [];
  for (const line of status) {
    if (/[RC]/u.test(line.slice(0, 2))) throw new Error('存在未协调重命名或复制，禁止清理。');
    const file = line.slice(3); cleanPath(file);
    if (root !== context.recordRoot || !file.startsWith(allowed) || !registered.has(file)) throw new Error('存在未提交或未跟踪业务内容或未登记资料，禁止清理。');
    let active: Buffer | null = null; let archived: Buffer | null = null;
    try { active = await readFile(await assertSafePath(root, file)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    try { archived = await readFile(await assertSafePath(sourceRoot, file)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if ((active === null) !== (archived === null) || (active && archived && !active.equals(archived))) throw new Error('未提交控制记录尚未逐文件归档，禁止清理唯一副本。');
    files.push(file);
  }
  return files;
}
async function tree(root: string, relative: string): Promise<[string, string][]> {
  const full = await assertSafePath(root, relative); const result: [string, string][] = [];
  for (const item of (await readdir(full, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${relative}/${item.name}`;
    if (item.isDirectory()) result.push(...await tree(root, name));
    else { if (!item.isFile()) throw new Error('归档含不支持的文件类型。'); result.push([name, createHash('sha256').update(await readFile(await assertSafePath(root, name))).digest('hex')]); }
  }
  return result;
}
async function reconcileObservation(context: DeliveryContext, journal: Journal, input: DeliveryActionInput): Promise<Record<string, unknown>> {
  const { repo, root } = repository(context, input);
  if (journal.action === 'cleanup') {
    if (!journal.checkout) throw new Error('清理日志缺少原副本定位，须人工核对。');
    const source = context.bindings[repo.id]!.sourceRoot;
    const listings = await git(source, ['worktree', 'list', '--porcelain', '-z']);
    const roots = await Promise.all(listings.split('\0').filter(line => line.startsWith('worktree ')).map(line => canonicalLocation(line.slice(9))));
    const checkout = await canonicalLocation(journal.checkout);
    let checkoutExists = true;
    try { await lstat(journal.checkout); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') checkoutExists = false; else throw error; }
    const removedWorktree = !roots.includes(checkout) && !checkoutExists;
    const localBranch = (await git(source, ['for-each-ref', '--format=%(refname)', `refs/heads/${repo.branch}`])).trim();
    let deletedRemoteBranch = false;
    if (journal.input.deleteRemoteBranch) {
      await remoteIdentity(source, repo, journal.input);
      deletedRemoteBranch = await remoteHead(source, journal.input.remote!, repo.branch) === null;
    }
    if ((journal.input.removeWorktree && !removedWorktree) || (journal.input.deleteLocalBranch && localBranch) ||
        (journal.input.deleteRemoteBranch && !deletedRemoteBranch)) throw new Error('清理仅部分完成，保留现场和 unknown；须协调剩余对象。');
    return { removedWorktree, deletedLocalBranch: !localBranch, deletedRemoteBranch };
  }
  if (journal.action === 'push') {
    await remoteIdentity(root, repo, journal.input);
    const actual = await remoteHead(root, journal.input.remote!, repo.branch);
    if (actual !== journal.input.oid) throw new Error('远端状态不能证明原推送完成，保留 unknown。');
    return { oid: actual, remote: journal.input.remote };
  }
  if (journal.action === 'commit') {
    const head = (await git(root, ['rev-parse', 'HEAD'])).trim();
    if (head === journal.head && journal.state === 'failed') return { outcome: 'not-performed', head, limitation: 'Git 提交失败且源提交未变化；暂存内容保留，须协调后重新计划。' };
    const parent = (await git(root, ['rev-parse', 'HEAD^'])).trim();
    const message = (await git(root, ['show', '-s', '--format=%B', 'HEAD'])).trim();
    const files = (await git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', 'HEAD'])).split('\0').filter(Boolean).sort();
    if (head === journal.head || parent !== journal.head || message !== journal.input.message?.trim() || files.some(f => !journal.input.files?.includes(f))) throw new Error('无法确认原提交结果，保留 unknown。');
    return { oid: head, files };
  }
  if (journal.action === 'review' || journal.action === 'merge') {
    const original = journal.input;
    await remoteIdentity(root, repo, original);
    const service = adapter(original);
    let result: ReviewObject;
    if (original.reviewId) result = await service.get(original.reviewId);
    else {
      const found = (await service.find(repo.branch, repo.target)).filter(r => r.body.includes(`tiller-operation:${journal.operationId}`));
      if (found.length !== 1) throw new Error('无法唯一核对评审创建结果，保留 unknown。');
      result = found[0]!;
    }
    checkReview(result, repo, journal.head);
    if (original.operation === 'create' || original.operation === 'update') {
      if (result.body !== reviewBody(original, journal.operationId) || result.title !== original.title) throw new Error('平台内容不能证明原评审写入完成，保留 unknown。');
    }
    if (journal.action === 'merge' && result.state !== 'merged') throw new Error('平台尚未证明已合入。');
    return { review: stableReview(result), documentsVersion: original.documentsVersion ?? null };
  }
  throw new Error('此操作须人工核对现场；不能推断或重放。');
}
/** Canonicalize Windows short/long aliases, including a removed leaf whose parent still exists. */
async function canonicalLocation(location: string): Promise<string> {
  let current = path.resolve(location);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolved = path.join(await realpath(current), ...missing);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(current) === current) throw error;
      missing.unshift(path.basename(current)); current = path.dirname(current);
    }
  }
}
function reviewBody(input: DeliveryActionInput, operationId: string): string {
  return `${input.body ?? ''}\n\n<!-- tiller-operation:${operationId} -->\n<!-- tiller-documents:${input.documentsVersion} -->`;
}

export async function planDeliveryAction(root: string, id: string, action: DeliveryAction, value: unknown): Promise<ActionPlan> {
  if (!['commit', 'push', 'review', 'merge', 'reconcile', 'cleanup'].includes(action)) throw new Error('交付动作无效。');
  const input = inputValue(value); const context = await loadDeliveryContext(root, id);
  const state = await snapshot(context, action, input); const planId = randomUUID();
  const plan: ActionPlan = { schemaVersion: 1, planId, action, workId: id, input, snapshot: state, fingerprint: hash({ action, input, state }) };
  await localWrite(context.anchorRoot, local(id, `action-plans/${planId}.json`), plan);
  return plan;
}

export async function applyDeliveryAction(root: string, id: string, action: DeliveryAction, value: unknown, planId: string): Promise<Record<string, unknown>> {
  const input = inputValue(value);
  if (!/^[0-9a-f-]{36}$/u.test(planId)) throw new Error('计划标识无效。');
  return withDeliveryLock(root, id, async context => {
    const plan = await readJson<ActionPlan>(context.anchorRoot, local(id, `action-plans/${planId}.json`));
    const state = await snapshot(context, action, input);
    if (plan.action !== action || plan.workId !== id || plan.fingerprint !== hash({ action, input, state }) || hash(plan.input) !== hash(input)) throw new Error('计划已过期或输入、授权、对象发生变化；重新生成计划。');
    const { repo, root: checkout } = repository(context, input);
    const operationId = randomUUID();
    const journal: Journal = { operationId, action, repository: repo.id, inputHash: hash(input), input, head: (await git(checkout, ['rev-parse', 'HEAD'])).trim(), checkout, state: 'running' };
    const journalPath = local(id, `operations/${operationId}.json`);
    await localWrite(context.anchorRoot, journalPath, journal);
    try {
      let result: Record<string, unknown>;
      if (action === 'commit') {
        await git(checkout, ['--literal-pathspecs', 'add', '--', ...input.files!]);
        const staged = (await git(checkout, ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean);
        if (!staged.length || staged.some(file => !input.files!.includes(file))) throw new Error('实际暂存清单不符或没有变更；未提交。');
        // Hooks are project behavior. A failing hook leaves the exact selected index intact for review.
        await git(checkout, ['commit', '-m', input.message!]);
        result = { oid: (await git(checkout, ['rev-parse', 'HEAD'])).trim(), files: staged };
      } else if (action === 'push') {
        await git(checkout, ['push', '--porcelain', input.remote!, `${input.oid}:refs/heads/${repo.branch}`]);
        if (await remoteHead(checkout, input.remote!, repo.branch) !== input.oid) throw new Error('推送后远端 OID 不符，结果待核对。');
        result = { oid: input.oid!, remote: input.remote! };
      } else if (action === 'review') {
        const service = adapter(input);
        const write = { source: repo.branch, target: repo.target, title: input.title ?? '', body: reviewBody(input, operationId) };
        const review = input.operation === 'create' ? await service.create(write) : input.operation === 'update' ? await service.update(input.reviewId!, write) : await service.get(input.reviewId!);
        checkReview(review, repo, journal.head);
        if (input.operation !== 'attach' && (review.body !== write.body || review.title !== write.title)) throw new Error('平台返回内容与评审写入不一致。');
        result = { review: stableReview(review), documentsVersion: input.documentsVersion! };
      } else if (action === 'merge') {
        return adapter(input).merge();
      } else if (action === 'reconcile') {
        if (input.operationId) {
          const originalPath = local(id, `operations/${input.operationId}.json`);
          const original = await readJson<Journal>(context.anchorRoot, originalPath);
          result = await reconcileObservation(context, original, input);
          original.state = 'succeeded'; original.result = result;
          await localWrite(context.anchorRoot, originalPath, original);
          result = { ...result, reconciledOperation: original.operationId };
        } else result = await externalReviewObservation(context, input);
      } else {
        const binding = context.bindings[repo.id]!;
        const archivedControls = await archivedControlChanges(context, repo, checkout, input);
        if (input.deleteRemoteBranch) {
          // Explicit, expected-head guarded deletion; never a history-rewriting push.
          await git(checkout, ['push', '--porcelain', `--force-with-lease=refs/heads/${repo.branch}:${journal.head}`, input.remote!, `:refs/heads/${repo.branch}`]);
          if (await remoteHead(checkout, input.remote!, repo.branch) !== null) throw new Error('远端删除结果待核对。');
        }
        if (input.removeWorktree) await rebindDeliveryAfterCleanup(context, repo.id);
        // Only byte-verified archived controls may be removed from the disposable copy.
        // The durable source now owns their exact contents; business files never enter this path.
        for (const file of input.removeWorktree ? archivedControls : []) {
          const tracked = await git(checkout, ['ls-tree', '-z', 'HEAD', '--', file]);
          if (tracked) await git(checkout, ['--literal-pathspecs', 'restore', '--source=HEAD', '--staged', '--worktree', '--', file]);
          else {
            await git(checkout, ['--literal-pathspecs', 'rm', '--cached', '--ignore-unmatch', '--', file]);
            try { await unlink(await assertSafePath(checkout, file)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
          }
        }
        if (input.removeWorktree) await git(binding.sourceRoot, ['worktree', 'remove', binding.root]);
        if (input.deleteLocalBranch) await git(binding.sourceRoot, ['branch', '-d', '--', repo.branch]);
        result = { removedWorktree: input.removeWorktree === true, deletedLocalBranch: input.deleteLocalBranch === true, deletedRemoteBranch: input.deleteRemoteBranch === true };
      }
      journal.state = 'succeeded'; journal.result = result;
      context.record.events.push({ id: operationId, action, state: 'succeeded', at: new Date().toISOString(), details: { repository: repo.id, inputHash: journal.inputHash, ...result, ...(input.authorization ? { authorization: input.authorization, confirmationBasis: 'reported-review' } : {}) } });
      await saveDeliveryRecord(context, context.record);
      await localWrite(context.anchorRoot, journalPath, journal);
      return { operationId, state: 'succeeded', ...result };
    } catch (error) {
      journal.state = action === 'reconcile' || (action === 'commit' && (await git(checkout, ['rev-parse', 'HEAD'])).trim() === journal.head) ? 'failed' : 'unknown';
      await localWrite(context.anchorRoot, journalPath, journal);
      context.record.events.push({ id: operationId, action, state: journal.state, at: new Date().toISOString(), details: { repository: repo.id, inputHash: journal.inputHash, recovery: journal.state === 'failed' ? 'no external effect observed; coordinate index then replan' : 'reconcile before retry' } });
      await saveDeliveryRecord(context, context.record);
      // Do not serialize child-process stderr or remote response bodies (may contain credentials).
      const safe = error instanceof Error && !('stderr' in error) ? error.message : 'Git 操作未确认完成。';
      throw new Error(`${safe} 操作 ${operationId} 已保留，先核对结果再继续。`);
    }
  });
}
