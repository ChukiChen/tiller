import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { assertSharedPaths, requireReadyProject } from './core.js';
import { applyChanges, hasPendingTransaction, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import type { FileChange, ProjectMetadata } from './types.js';
import { resolveRepositoryRoot, resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { repositoryPath } from './repository-paths.js';

export type Gate = 'requirements' | 'design' | 'planning' | 'checkpoint' | 'exception' | 'acceptance' | 'merge' | 'release';
export type Outcome = 'approved' | 'rejected' | 'conditional' | 'revoked';
export interface FileRef { repository: string; path: string }
export interface Scope { repositories: string[]; targets: string[] }
export type ConfirmationOperation = 'start' | 'verify' | 'resume' | 'delivery-ready' | 'merge' | 'release';
export interface CheckpointBinding {
  ownerWorkId: string; taskId?: string; checkpointId: string; operation: ConfirmationOperation; definitionDigest: string;
}
export interface ExceptionBinding {
  ownerWorkId: string; taskId?: string; operation: ConfirmationOperation;
  conditionIds: string[]; basisDigest: string; reason: string; allowedAction: string; endCondition: string;
}
export interface ConfirmationReference { workId: string; requestId: string; decisionId: string }
export interface DeliveryBinding { deliveryCheckId: string; deliveryBasisDigest: string }
export interface MergeBinding {
  documentsVersion: string;
  deliveryBinding?: DeliveryBinding;
  deliveryExceptionRefs?: ConfirmationReference[];
  repositories: {
    repository: string;
    review: { provider: string; id: string; url: string };
    sourceOid: string; targetBranch: string; targetOid: string;
    dependencies: { repository: string; oid: string }[];
    checks: { version: string; evidence: FileRef[] };
  }[];
}
interface Source { kind: 'conversation' | 'document'; reference: FileRef; quote: string; presentation: FileRef }
interface SourceReview { reviewer: string; rationale: string; reviewedAt: string }
interface Exception { reason: string; allowedAction: string; endCondition: string; source: Source; sourceReview: SourceReview }
export interface RequestInput {
  requestId: string; gate: Gate; scope: Scope; subjects: FileRef[]; upstream: string[];
  reviewSummary: string; openIssues: string[]; nextAction: string; exception?: Exception;
  mergeBinding?: MergeBinding;
  checkpointBinding?: CheckpointBinding;
  exceptionBinding?: ExceptionBinding;
  deliveryBinding?: DeliveryBinding;
  deliveryExceptionRefs?: ConfirmationReference[];
}
export interface DecisionInput {
  decisionId: string; requestId: string; outcome: Outcome; conditions: string[];
  source: Source; sourceReview?: SourceReview; decidedAt?: string | null;
  reuseOf?: { requestId: string; decisionId: string; reason: string };
}
export interface BoundFile extends FileRef { sha256: string; snapshot: string }
export interface Request extends RequestInput {
  createdAt: string; files: BoundFile[];
  dependencies: { requestId: string; fingerprint: string; decisionId: string }[];
  exceptionFiles: BoundFile[];
}
export interface Decision extends DecisionInput { recordedAt: string; files: BoundFile[] }
interface Registry { schemaVersion: 3; workId: string; requests: Request[]; decisions: Decision[] }
export interface GateResult {
  requestId: string; gate: Gate; status: 'pending' | 'confirmed' | 'rejected' | 'conditional' | 'needs-review' | 'invalidated';
  confirmed: boolean; issues: string[]; decisionId?: string; confirmationBasis?: 'reported-review';
  deliveryStatus?: 'accepted' | 'accepted-with-exceptions';
  sourceVerification: 'not-independently-verified'; automaticTransition: false;
}
export type GateCheck = GateResult & { gateStatus: GateResult['status']; recordValid: true; blockingReasons: string[]; enforcementScope: 'tiller-cli-only'; limitation: string };
const limitation = '仅核对共享记录、内容与执行者所报复核；不能认证用户身份、自动放行或阻止绕过 CLI 的写入。';
// Only cache project inspection during one operation; current file bytes and Git ignores are always reread.
const operation = new AsyncLocalStorage<{ root: string; metadata: ProjectMetadata; repositoryRoots: Map<string, string> }>();
async function inProject<T>(root: string, id: string, write: boolean, fn: () => Promise<T>): Promise<T> {
  return withDeliveryLocation(root, id, async () => {
    const metadata = await requireReadyProject(root, { write });
    return operation.run({ root, metadata, repositoryRoots: new Map() }, fn);
  });
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_CONFIRMATION' });
}
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}必须为对象。`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) fail(`${label}包含不支持的字段；不能声明来源已认证或自行设置通过状态。`);
  return result;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000 || value.includes('\0')) fail(`${label}须为非空文本。`);
  return value;
}
function identifier(value: unknown): string {
  const result = text(value, '标识');
  if (!/^(?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(result) || result.length > 64 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:-|$)/iu.test(result)) fail('标识须以字母或 YYYYMMDD-日期前缀开头，使用小写字母、数字和单连字符，最长 64 位。');
  return result;
}
function strings(value: unknown, label: string, nonempty = false): string[] {
  if (!Array.isArray(value) || (nonempty && !value.length)) fail(`${label}须为${nonempty ? '非空' : ''}数组。`);
  const result = value.map(item => text(item, label));
  if (new Set(result).size !== result.length) fail(`${label}不能重复。`);
  return result;
}
function date(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(result) || !Number.isFinite(Date.parse(result))) fail(`${label}须为 UTC ISO 日期。`);
  return result;
}
function ref(value: unknown): FileRef {
  const item = object(value, ['repository', 'path'], '文件引用');
  const repository = text(item.repository, '仓库');
  if (repository !== '.') validateRelativePath(repository);
  const location = text(item.path, '文件路径');
  validateRelativePath(location);
  const parts = location.toLowerCase().split('/');
  if (parts.includes('.git') || parts.some((part, index) => part === '.tiller' && parts[index + 1] === 'local')) fail('确认依据不能引用 Git 内部文件或本机资料。');
  return { repository, path: location };
}
function scope(value: unknown): Scope {
  const item = object(value, ['repositories', 'targets'], '范围');
  return { repositories: strings(item.repositories, '范围仓库', true).map(repositoryIdentity), targets: strings(item.targets, '范围目标', true) };
}
function source(value: unknown): Source {
  const item = object(value, ['kind', 'reference', 'quote', 'presentation'], '来源');
  if (item.kind !== 'conversation' && item.kind !== 'document') fail('来源类型不受支持。');
  return { kind: item.kind, reference: ref(item.reference), quote: text(item.quote, '用户原话'), presentation: ref(item.presentation) };
}
function review(value: unknown): SourceReview {
  const item = object(value, ['reviewer', 'rationale', 'reviewedAt'], '来源复核');
  return { reviewer: text(item.reviewer, '复核者'), rationale: text(item.rationale, '范围及展示内容核对依据'), reviewedAt: date(item.reviewedAt, '复核时间') };
}
function repositoryIdentity(value: unknown): string {
  const result = text(value, '仓库标识');
  if (result !== '.') validateRelativePath(result);
  return result;
}
function oid(value: unknown): string {
  const result = text(value, '版本摘要');
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(result)) fail('版本须为完整提交 OID 或 SHA-256 摘要。');
  return result;
}
export function parseDeliveryBinding(value: unknown): DeliveryBinding {
  const item = object(value, ['deliveryCheckId', 'deliveryBasisDigest'], '整体交付绑定');
  const deliveryBasisDigest = text(item.deliveryBasisDigest, '整体交付摘要');
  if (!/^[a-f0-9]{64}$/u.test(deliveryBasisDigest)) fail('整体交付摘要须为 SHA-256。');
  return { deliveryCheckId: identifier(item.deliveryCheckId), deliveryBasisDigest };
}
function deliveryExceptionRefs(value: unknown): ConfirmationReference[] {
  if (!Array.isArray(value) || value.length > 1000) fail('交付例外引用须为有限数组。');
  const refs = value.map(raw => {
    const item = object(raw, ['workId', 'requestId', 'decisionId'], '交付例外引用');
    return { workId: identifier(item.workId), requestId: identifier(item.requestId), decisionId: identifier(item.decisionId) };
  });
  if (new Set(refs.map(ref => `${ref.workId}::${ref.requestId}`.toLowerCase())).size !== refs.length) fail('交付例外引用重复。');
  return refs;
}
function mergeBinding(value: unknown): MergeBinding {
  const item = object(value, ['documentsVersion', 'repositories', 'deliveryBinding', 'deliveryExceptionRefs'], '合入版本绑定');
  if (!Array.isArray(item.repositories) || !item.repositories.length) fail('合入仓库不能为空。');
  const repositories = item.repositories.map(raw => {
    const repo = object(raw, ['repository', 'review', 'sourceOid', 'targetBranch', 'targetOid', 'dependencies', 'checks'], '合入仓库');
    const review = object(repo.review, ['provider', 'id', 'url'], '评审对象');
    const url = text(review.url, '评审链接');
    let parsed: URL;
    try { parsed = new URL(url); } catch { fail('评审链接必须为 HTTP(S) URL。'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) fail('评审链接不能含凭据且必须使用 HTTP(S)。');
    if (!Array.isArray(repo.dependencies)) fail('版本依赖须为数组。');
    const dependencies = repo.dependencies.map(rawDependency => {
      const dependency = object(rawDependency, ['repository', 'oid'], '版本依赖');
      return { repository: repositoryIdentity(dependency.repository), oid: oid(dependency.oid) };
    }).sort((a, b) => a.repository.localeCompare(b.repository));
    if (new Set(dependencies.map(dependency => dependency.repository)).size !== dependencies.length) fail('版本依赖仓库不能重复。');
    const checks = object(repo.checks, ['version', 'evidence'], '检查证据');
    if (!Array.isArray(checks.evidence) || !checks.evidence.length) fail('检查证据不能为空。');
    const evidence = checks.evidence.map(ref).sort((a, b) => `${a.repository}/${a.path}`.localeCompare(`${b.repository}/${b.path}`));
    if (new Set(evidence.map(file => `${file.repository}/${file.path}`)).size !== evidence.length) fail('检查证据不能重复。');
    const targetBranch = text(repo.targetBranch, '目标分支');
    if (targetBranch === '@' || targetBranch.startsWith('-') || /[\s\x00-\x1f\x7f~^:?*\[\\]/u.test(targetBranch) || targetBranch.includes('..') || targetBranch.includes('@{') || targetBranch.endsWith('.') || targetBranch.startsWith('/') || targetBranch.endsWith('/') || targetBranch.includes('//') || targetBranch.split('/').some(part => part.startsWith('.') || part.endsWith('.lock'))) fail('目标分支格式无效。');
    return {
      repository: repositoryIdentity(repo.repository),
      review: { provider: text(review.provider, '评审平台'), id: text(review.id, '评审标识'), url },
      sourceOid: oid(repo.sourceOid), targetBranch, targetOid: oid(repo.targetOid), dependencies,
      checks: { version: text(checks.version, '检查证据版本'), evidence },
    };
  }).sort((a, b) => a.repository.localeCompare(b.repository));
  if (new Set(repositories.map(repo => repo.repository)).size !== repositories.length) fail('合入仓库不能重复。');
  const documentsVersion = text(item.documentsVersion, '资料版本');
  if (!/^sha256:[a-f0-9]{64}$/u.test(documentsVersion)) oid(documentsVersion);
  const bound = item.deliveryBinding === undefined ? undefined : parseDeliveryBinding(item.deliveryBinding);
  if (item.deliveryExceptionRefs !== undefined && !bound) fail('合入例外必须绑定整体交付对象。');
  return { documentsVersion, repositories, ...(bound ? { deliveryBinding: bound } : {}),
    ...(item.deliveryExceptionRefs === undefined ? {} : { deliveryExceptionRefs: deliveryExceptionRefs(item.deliveryExceptionRefs) }) };
}
function operationBinding(item: Record<string, unknown>): Pick<CheckpointBinding, 'ownerWorkId' | 'taskId' | 'operation'> {
  if (typeof item.operation !== 'string' || !['start', 'verify', 'resume', 'delivery-ready', 'merge', 'release'].includes(item.operation)) fail('确认操作无效。');
  const result: Pick<CheckpointBinding, 'ownerWorkId' | 'taskId' | 'operation'> = { ownerWorkId: identifier(item.ownerWorkId), operation: item.operation as ConfirmationOperation };
  if (['start', 'verify', 'resume'].includes(result.operation)) result.taskId = identifier(item.taskId);
  else if (item.taskId !== undefined) fail('交付、合入和发布操作不能声明任务身份。');
  return result;
}
function checkpointBinding(value: unknown): CheckpointBinding {
  const item = object(value, ['ownerWorkId', 'taskId', 'checkpointId', 'operation', 'definitionDigest'], '人工检查绑定');
  const definitionDigest = text(item.definitionDigest, '检查点定义摘要');
  if (!/^[a-f0-9]{64}$/u.test(definitionDigest)) fail('检查点定义摘要须为 SHA-256。');
  return { ...operationBinding(item), checkpointId: identifier(item.checkpointId), definitionDigest };
}
function exceptionBinding(value: unknown): ExceptionBinding {
  const item = object(value, ['ownerWorkId', 'taskId', 'operation', 'conditionIds', 'basisDigest', 'reason', 'allowedAction', 'endCondition'], '例外绑定');
  const basisDigest = text(item.basisDigest, '例外对象摘要');
  if (!/^[a-f0-9]{64}$/u.test(basisDigest)) fail('例外对象摘要须为 SHA-256。');
  return {
    ...operationBinding(item), conditionIds: strings(item.conditionIds, '例外条件标识', true).map(identifier), basisDigest,
    reason: text(item.reason, '例外理由'), allowedAction: text(item.allowedAction, '例外允许动作'), endCondition: text(item.endCondition, '例外失效条件'),
  };
}
function requestInput(value: unknown): RequestInput {
  const item = object(value, ['requestId', 'gate', 'scope', 'subjects', 'upstream', 'reviewSummary', 'openIssues', 'nextAction', 'exception', 'mergeBinding', 'checkpointBinding', 'exceptionBinding', 'deliveryBinding', 'deliveryExceptionRefs'], '确认请求');
  if (typeof item.gate !== 'string' || !['requirements', 'design', 'planning', 'checkpoint', 'exception', 'acceptance', 'merge', 'release'].includes(item.gate)) fail('确认节点无效。');
  if (!Array.isArray(item.subjects) || !item.subjects.length) fail('审阅对象不能为空。');
  const result: RequestInput = {
    requestId: identifier(item.requestId), gate: item.gate as Gate, scope: scope(item.scope), subjects: item.subjects.map(ref),
    upstream: strings(item.upstream, '上游请求').map(identifier), reviewSummary: text(item.reviewSummary, '审阅摘要'),
    openIssues: strings(item.openIssues, '未决事项'), nextAction: text(item.nextAction, '下一步'),
  };
  if (result.gate === 'merge') {
    if (item.exception !== undefined) fail('合入确认不能通过例外省略设计上游。');
    result.mergeBinding = mergeBinding(item.mergeBinding);
    if (result.mergeBinding.repositories.some(repo => !result.scope.repositories.includes(repo.repository))) fail('合入版本绑定超出请求仓库范围。');
    for (const repo of result.mergeBinding.repositories) {
      if (repo.checks.evidence.some(evidence => !result.subjects.some(subject => evidence.repository === subject.repository && evidence.path === subject.path))) fail('检查证据必须列入本次审阅对象以绑定内容快照。');
    }
  } else if (item.mergeBinding !== undefined) fail('只有合入节点可以声明合入版本绑定。');
  if (item.deliveryBinding !== undefined) {
    if (result.gate !== 'acceptance' && result.gate !== 'release') fail('整体交付绑定仅用于整体验收或发布。');
    result.deliveryBinding = parseDeliveryBinding(item.deliveryBinding);
  }
  if (result.gate === 'release' && !result.deliveryBinding) fail('release 必须绑定整体交付对象及同对象的 acceptance。');
  if (item.deliveryExceptionRefs !== undefined) {
    if (result.gate !== 'release') fail('发布专属例外只能用于 release。');
    result.deliveryExceptionRefs = deliveryExceptionRefs(item.deliveryExceptionRefs);
  }
  if ((result.deliveryBinding || result.gate === 'release') && item.exception !== undefined) fail('整体验收和发布不能使用内嵌例外跳过门禁；须引用具体操作的独立例外。');
  if (['planning', 'checkpoint', 'exception'].includes(result.gate) && item.exception !== undefined) fail('新确认节点不能通过内嵌例外省略上游确认；例外须使用独立 exception 请求。');
  if (result.gate === 'checkpoint') result.checkpointBinding = checkpointBinding(item.checkpointBinding);
  else if (item.checkpointBinding !== undefined) fail('只有 checkpoint 节点可以声明人工检查绑定。');
  if (result.gate === 'exception') {
    result.exceptionBinding = exceptionBinding(item.exceptionBinding);
    if (result.exceptionBinding.allowedAction !== result.nextAction) fail('例外允许动作必须与本请求下一步完全对应。');
  } else if (item.exceptionBinding !== undefined) fail('只有 exception 节点可以声明例外绑定。');
  if (item.exception !== undefined) {
    const ex = object(item.exception, ['reason', 'allowedAction', 'endCondition', 'source', 'sourceReview'], '例外');
    result.exception = { reason: text(ex.reason, '例外理由'), allowedAction: text(ex.allowedAction, '例外允许动作'), endCondition: text(ex.endCondition, '例外终止条件'), source: source(ex.source), sourceReview: review(ex.sourceReview) };
    if (result.exception.allowedAction !== result.nextAction) fail('例外允许动作必须与本请求下一步完全对应。');
  }
  if (result.upstream.includes(result.requestId)) fail('请求不能依赖自身。');
  if (new Set(result.subjects.map(item => `${item.repository}/${item.path}`.toLowerCase())).size !== result.subjects.length) fail('审阅对象不能重复。');
  return result;
}
function decisionInput(value: unknown): DecisionInput {
  const item = object(value, ['decisionId', 'requestId', 'outcome', 'conditions', 'source', 'sourceReview', 'decidedAt', 'reuseOf'], '用户决定');
  if (typeof item.outcome !== 'string' || !['approved', 'rejected', 'conditional', 'revoked'].includes(item.outcome)) fail('用户决定类型无效。');
  const result: DecisionInput = { decisionId: identifier(item.decisionId), requestId: identifier(item.requestId), outcome: item.outcome as Outcome, conditions: strings(item.conditions, '条件'), source: source(item.source) };
  if (result.outcome === 'conditional' && !result.conditions.length) fail('有条件决定须保留实际条件。');
  if (result.outcome === 'approved' && result.conditions.length) fail('带有条件的批准须使用 conditional，条件核对后由新决定明确接受。');
  if (item.sourceReview !== undefined) result.sourceReview = review(item.sourceReview);
  if (item.decidedAt !== undefined) result.decidedAt = item.decidedAt === null ? null : date(item.decidedAt, '决定时间');
  if (item.reuseOf !== undefined) {
    const reuse = object(item.reuseOf, ['requestId', 'decisionId', 'reason'], '非语义复核');
    result.reuseOf = { requestId: identifier(reuse.requestId), decisionId: identifier(reuse.decisionId), reason: text(reuse.reason, '前后差异及非语义理由') };
    if (result.outcome !== 'approved' || !result.sourceReview) fail('非语义复用必须记录实际复核，并引用原批准。');
  }
  return result;
}
function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function fingerprint(value: Request): string { return digest(json(value)); }
function registryPath(id: string): string { return `.tiller/work/${identifier(id)}/confirmations.json`; }
function presentationPath(id: string, requestId: string): string { return `.tiller/work/${id}/reviews/request-${requestId}/presentation.md`; }
function presentation(request: Request): string {
  return `# 确认请求 ${request.requestId}\n\n请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。\n\n\`\`\`json\n${json({ requestId: request.requestId, gate: request.gate, scope: request.scope, reviewSummary: request.reviewSummary, openIssues: request.openIssues, nextAction: request.nextAction, subjects: request.files, upstream: request.dependencies, exception: request.exception ?? null, ...(request.mergeBinding ? { mergeBinding: request.mergeBinding } : {}), ...(request.checkpointBinding ? { checkpointBinding: request.checkpointBinding } : {}), ...(request.exceptionBinding ? { exceptionBinding: request.exceptionBinding } : {}), ...(request.deliveryBinding ? { deliveryBinding: request.deliveryBinding } : {}), ...(request.deliveryExceptionRefs ? { deliveryExceptionRefs: request.deliveryExceptionRefs } : {}) })}\`\`\`\n`;
}

async function fileText(root: string, reference: FileRef): Promise<string> {
  const active = operation.getStore();
  const metadata = active?.root === root ? active.metadata : await requireReadyProject(root, { write: false });
  if (reference.repository !== '.' && !metadata.repositories.includes(reference.repository)) fail(`仓库未登记：${reference.repository}`);
  const cached = active?.root === root ? active.repositoryRoots.get(reference.repository) : undefined;
  const repositoryRoot = cached ?? await resolveRepositoryRoot(root, reference.repository);
  if (active?.root === root) active.repositoryRoots.set(reference.repository, repositoryRoot);
  const location = reference.path.toLowerCase();
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  if (reference.repository === '.' && boundaries.some(boundary => location === boundary || location.startsWith(`${boundary}/`))) fail('业务仓库对象必须使用其登记的仓库身份，不能借管理工程身份引用。');
  await assertSharedPaths(repositoryRoot, [reference.path]);
  const contents = await readTextIfExists(repositoryRoot, reference.path);
  if (contents === null || !contents.trim()) fail(`确认依据缺失或为空：${reference.repository}/${reference.path}`);
  return contents;
}
async function load(root: string, id: string) {
  if (operation.getStore()?.root !== root) await requireReadyProject(root, { write: false });
  if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
  const location = registryPath(id);
  const notes = `.tiller/work/${id}/work.md`;
  await assertSharedPaths(root, [location, notes]);
  if (await readTextIfExists(root, notes) === null) fail(`工作说明不存在：${notes}`);
  const original = await readTextIfExists(root, location);
  const registry: Registry = original === null ? { schemaVersion: 3, workId: id, requests: [], decisions: [] } : parseRegistry(original, id);
  return { location, original, registry };
}
function boundFiles(value: unknown, id: string): BoundFile[] {
  if (!Array.isArray(value)) fail('内容快照引用须为数组。');
  return value.map(raw => {
    const item = object(raw, ['repository', 'path', 'sha256', 'snapshot'], '内容绑定');
    const reference = ref({ repository: item.repository, path: item.path });
    const sha256 = text(item.sha256, '内容摘要');
    const snapshot = text(item.snapshot, '快照路径');
    ref({ repository: '.', path: snapshot });
    if (!/^[a-f0-9]{64}$/u.test(sha256) || !snapshot.startsWith(`.tiller/work/${id}/reviews/`)) fail('内容摘要或快照范围无效。');
    return { ...reference, sha256, snapshot };
  });
}
function parseRegistry(contents: string, id: string): Registry {
  let raw: unknown;
  try { raw = JSON.parse(contents); } catch { fail('确认记录不是有效 JSON。'); }
  const item = object(raw, ['schemaVersion', 'workId', 'requests', 'decisions'], '确认记录');
  if (item.schemaVersion !== 3) throw Object.assign(new Error(`不支持确认记录版本 ${String(item.schemaVersion)}；仅支持版本 3。请使用 tiller work create 创建新工作并重新核对确认；旧文件保持原位。`), { code: 'UNSUPPORTED_RECORD_VERSION' });
  if (item.workId !== id || !Array.isArray(item.requests) || !Array.isArray(item.decisions)) fail('确认记录工作身份或请求/决定列表无效。');
  const requests: Request[] = item.requests.map(rawRequest => {
    const parsed = object(rawRequest, ['requestId', 'gate', 'scope', 'subjects', 'upstream', 'reviewSummary', 'openIssues', 'nextAction', 'exception', 'mergeBinding', 'checkpointBinding', 'exceptionBinding', 'deliveryBinding', 'deliveryExceptionRefs', 'createdAt', 'files', 'dependencies', 'exceptionFiles'], '已保存请求');
    const { createdAt, files, dependencies, exceptionFiles, ...input } = parsed;
    if (!Array.isArray(dependencies)) fail('依赖记录格式无效。');
    return { ...requestInput(input), createdAt: date(createdAt, '创建时间'), files: boundFiles(files, id), exceptionFiles: boundFiles(exceptionFiles, id), dependencies: dependencies.map(rawDependency => {
      const dep = object(rawDependency, ['requestId', 'fingerprint', 'decisionId'], '依赖');
      const identity = text(dep.fingerprint, '依赖摘要');
      if (!/^[a-f0-9]{64}$/u.test(identity)) fail('依赖摘要无效。');
      return { requestId: identifier(dep.requestId), fingerprint: identity, decisionId: identifier(dep.decisionId) };
    }) };
  });
  const decisions: Decision[] = item.decisions.map(rawDecision => {
    const parsed = object(rawDecision, ['decisionId', 'requestId', 'outcome', 'conditions', 'source', 'sourceReview', 'decidedAt', 'reuseOf', 'recordedAt', 'files'], '已保存决定');
    const { recordedAt, files, ...input } = parsed;
    return { ...decisionInput(input), recordedAt: date(recordedAt, '记录时间'), files: boundFiles(files, id) };
  });
  if (new Set(requests.map(req => req.requestId)).size !== requests.length || new Set(decisions.map(dec => dec.decisionId)).size !== decisions.length) fail('请求或决定标识重复。');
  for (const request of requests) assertBindingOwner(request, id);
  if (decisions.some(decision => !requests.some(req => req.requestId === decision.requestId))) fail('决定引用不存在的请求。');
  return { schemaVersion: 3, workId: id, requests, decisions };
}
async function capture(root: string, id: string, category: string, references: FileRef[]) {
  const files: BoundFile[] = [];
  const changes: FileChange[] = [];
  for (const [index, reference] of references.entries()) {
    const contents = await fileText(root, reference);
    const snapshot = `.tiller/work/${id}/reviews/${category}/${index}.json`;
    await assertSharedPaths(root, [snapshot]);
    if (await readTextIfExists(root, snapshot) !== null) fail(`快照位置已经存在：${snapshot}`);
    files.push({ ...reference, sha256: digest(contents), snapshot });
    changes.push({ path: snapshot, before: null, after: json({ encoding: 'utf8', content: contents }) });
  }
  return { files, changes };
}
async function checkFiles(root: string, files: BoundFile[], checkSnapshots = true): Promise<string[]> {
  const issues: string[] = [];
  for (const file of files) {
    try {
      if (digest(await fileText(root, file)) !== file.sha256) issues.push(`内容已变化，需要复核：${file.repository}/${file.path}`);
      if (checkSnapshots) {
        await assertSharedPaths(root, [file.snapshot]);
        const snapshot = await readTextIfExists(root, file.snapshot);
        if (snapshot === null) fail(`快照缺失：${file.snapshot}`);
        const content = object(JSON.parse(snapshot) as unknown, ['encoding', 'content'], '快照');
        if (content.encoding !== 'utf8' || typeof content.content !== 'string' || digest(content.content) !== file.sha256) fail(`快照与摘要不符：${file.snapshot}`);
      }
    } catch (error) { issues.push((error as Error).message); }
  }
  return issues;
}
function sameRefs(files: FileRef[], references: FileRef[]): boolean {
  return files.length === references.length && files.every((file, i) => file.repository === references[i]?.repository && file.path === references[i]?.path);
}
async function checkSource(root: string, value: Source, files: BoundFile[], sourceReview: SourceReview | undefined, snapshots = true): Promise<string[]> {
  const issues = await checkFiles(root, files, snapshots);
  if (!sameRefs(files, [value.reference, value.presentation])) issues.push('来源或展示依据与快照不匹配。');
  if (!sourceReview) issues.push('source-unverified：缺少实际来源及范围复核。');
  try {
    if (!(await fileText(root, value.reference)).includes(value.quote)) issues.push('来源中未找到所记录的用户原话。');
  } catch (error) { issues.push((error as Error).message); }
  return issues;
}
function prerequisite(gate: Gate): Gate | null {
  if (gate === 'design') return 'requirements';
  if (gate === 'planning' || gate === 'exception' || gate === 'merge') return 'design';
  if (gate === 'checkpoint') return 'planning';
  return gate === 'release' ? 'acceptance' : null;
}
function assertBindingOwner(request: RequestInput, workId: string): void {
  const owner = request.checkpointBinding?.ownerWorkId ?? request.exceptionBinding?.ownerWorkId;
  if (owner !== undefined && owner !== workId) fail('检查点或例外必须登记在其 ownerWorkId 对应工作；关联工作不扩大授权范围。');
}
function coverage(request: RequestInput, upstream: Request[]): boolean {
  const needed = prerequisite(request.gate);
  if (request.gate === 'merge') return request.scope.repositories.every(repository => request.scope.targets.every(target => upstream.some(parent => parent.gate === needed && parent.scope.repositories.includes(repository) && parent.scope.targets.includes(target))));
  return needed === null || upstream.some(parent => parent.gate === needed && request.scope.repositories.every(repository => parent.scope.repositories.includes(repository)) && request.scope.targets.every(target => parent.scope.targets.includes(target)));
}
async function checkReuse(root: string, registry: Registry, request: Request, decision: DecisionInput, visited = new Set<string>(), requestVisited = new Set<string>()): Promise<string[]> {
  const reuse = decision.reuseOf;
  if (!reuse) return [];
  if (visited.has(reuse.decisionId) || reuse.requestId === request.requestId) return ['非语义复用不能形成循环或引用同一请求。'];
  const previous = registry.requests.find(item => item.requestId === reuse.requestId);
  const original = registry.decisions.filter(item => item.requestId === reuse.requestId).at(-1);
  if (!previous || !original || original.decisionId !== reuse.decisionId || original.outcome !== 'approved' || !original.sourceReview) return ['非语义复用只能引用尚未被替代、拒绝或撤销且已复核来源的原批准。'];
  if (previous.gate !== request.gate || json(previous.scope) !== json(request.scope) || !sameRefs(previous.subjects, request.subjects)) return ['非语义复用必须保持节点、范围和对象身份一致。'];
  if (request.gate === 'merge' && json(previous.mergeBinding) !== json(request.mergeBinding)) return ['合入版本绑定变化必须重新取得用户确认，不能按非语义变化复用。'];
  if (json(previous.checkpointBinding) !== json(request.checkpointBinding) || json(previous.exceptionBinding) !== json(request.exceptionBinding)) return ['人工检查或例外绑定变化必须重新取得用户确认，不能按非语义变化复用。'];
  if (json(previous.deliveryBinding) !== json(request.deliveryBinding) || json(previous.deliveryExceptionRefs) !== json(request.deliveryExceptionRefs)) return ['整体交付对象或发布例外变化必须重新确认，不能按非语义变化复用。'];
  if (decision.source.kind !== original.source.kind || json(decision.source.reference) !== json(original.source.reference) || decision.source.quote !== original.source.quote || decision.decidedAt !== original.decidedAt) return ['复核须保留原用户来源、原话及决定时间，不能冒称新用户决定。'];
  const issues = await checkSource(root, original.source, original.files, original.sourceReview);
  try {
    if (await fileText(root, { repository: '.', path: presentationPath(registry.workId, previous.requestId) }) !== presentation(previous)) issues.push('原展示内容已变化，不能继承决定。');
    // Old subjects may have changed; their preserved snapshots must still match the original decision.
    for (const bound of previous.files) {
      await assertSharedPaths(root, [bound.snapshot]);
      const snapshot = await readTextIfExists(root, bound.snapshot);
      if (snapshot === null) fail('原审阅快照缺失。');
      const stored = object(JSON.parse(snapshot) as unknown, ['encoding', 'content'], '原快照');
      if (stored.encoding !== 'utf8' || typeof stored.content !== 'string' || digest(stored.content) !== bound.sha256) fail('原审阅快照已变化。');
    }
  } catch (error) { issues.push((error as Error).message); }
  for (const dependency of previous.dependencies) {
    const parent = registry.requests.find(item => item.requestId === dependency.requestId);
    if (!parent) { issues.push('原批准上游缺失。'); continue; }
    const current = await evaluate(root, registry, parent, new Set([...requestVisited, request.requestId, previous.requestId]));
    if (!current.confirmed || current.decisionId !== dependency.decisionId || fingerprint(parent) !== dependency.fingerprint) issues.push('原批准上游已变化，不能作为非语义复用依据。');
  }
  if (previous.exception) issues.push(...await checkSource(root, previous.exception.source, previous.exceptionFiles, previous.exception.sourceReview));
  issues.push(...await checkReuse(root, registry, previous, original, new Set(visited).add(reuse.decisionId), new Set(requestVisited).add(request.requestId)));
  return issues;
}
/** Recompute the bound technical object; a saved receipt alone never grants permission. */
export async function inspectBoundDelivery(root: string, workId: string, value: DeliveryBinding, requestScope?: Scope, operation: 'delivery-ready' | 'merge' | 'release' = 'delivery-ready') {
  const binding = parseDeliveryBinding(value);
  const { inspectDeliveryReceipt } = await import('./overall-delivery.js');
  const inspected = await inspectDeliveryReceipt(root, workId, binding.deliveryCheckId);
  if (!(operation === 'delivery-ready' ? inspected.matches : inspected.objectMatches) || inspected.current.basisDigest !== binding.deliveryBasisDigest
    || inspected.receipt.basisDigest !== binding.deliveryBasisDigest) fail('整体交付回执与当前对象不一致，须重新核对并展示。');
  if (requestScope && (!inspected.current.scope.repositories.every(repository => requestScope.repositories.includes(repository))
    || !inspected.current.scope.targets.every(target => requestScope.targets.includes(target)))) fail('确认范围没有覆盖绑定的完整交付对象。');
  return inspected;
}
async function inspectRequestDelivery(root: string, registry: Registry, request: Request, checkAcceptance: boolean) {
  const inspected = await inspectBoundDelivery(root, registry.workId, request.deliveryBinding!, request.scope, request.gate === 'release' ? 'release' : 'delivery-ready');
  if (request.gate === 'release') {
    const { inspectExceptions } = await import('./gate-exceptions.js');
    const exceptionCheck = await inspectExceptions(root, registry.workId, inspected.current.scope, 'release', undefined,
      inspected.current.issues, inspected.current.basisDigest, request.deliveryExceptionRefs ?? []);
    if (!exceptionCheck.operationAllowed) fail('发布交付门禁未满足，delivery-ready 例外不能替代发布专属例外。');
    const matching = registry.requests.filter(parent => request.upstream.includes(parent.requestId) && parent.gate === 'acceptance'
      && json(parent.deliveryBinding) === json(request.deliveryBinding));
    if (!matching.length) fail('发布必须引用同一交付对象的整体验收，普通文档验收不能替代。');
    if (checkAcceptance) {
      let accepted = false;
      for (const parent of matching) if ((await evaluate(root, registry, parent)).confirmed) accepted = true;
      if (!accepted) fail('发布引用的同对象整体验收当前无效。');
    }
  } else if (!inspected.current.operationAllowed) fail('整体验收对象当前未满足交付门禁，且没有覆盖缺口的有效例外。');
  return inspected.current;
}
async function evaluate(root: string, registry: Registry, request: Request, visiting = new Set<string>(), currentBinding?: MergeBinding): Promise<GateResult> {
  const result: GateResult = { requestId: request.requestId, gate: request.gate, status: 'pending', confirmed: false, issues: [], sourceVerification: 'not-independently-verified', automaticTransition: false };
  if (visiting.has(request.requestId)) return { ...result, status: 'needs-review', issues: ['确认依赖形成循环。'] };
  const next = new Set(visiting).add(request.requestId);
  if (request.gate === 'merge') {
    if (!currentBinding) result.issues.push('合入执行前须提供当前平台及依赖版本，使用 checkMergeGate 核对。');
    else if (json(request.mergeBinding) !== json(currentBinding)) result.issues.push('合入版本绑定已变化（资料、评审、源、目标、依赖或检查），必须重新展示并确认。');
    if (request.openIssues.length) result.issues.push('合入请求仍有未解决事项。');
  }
  result.issues.push(...await checkFiles(root, request.files));
  try {
    const presented = await fileText(root, { repository: '.', path: presentationPath(registry.workId, request.requestId) });
    if (presented !== presentation(request)) result.issues.push('请求展示文件已变化或与审阅对象不匹配。');
  } catch (error) { result.issues.push((error as Error).message); }
  if (!sameRefs(request.files, request.subjects)) result.issues.push('审阅对象与快照不匹配。');
  if (request.subjects.some(subject => !request.scope.repositories.includes(subject.repository))) result.issues.push('审阅对象超出请求仓库范围。');
  if (request.upstream.length !== request.dependencies.length || request.upstream.some((value, i) => request.dependencies[i]?.requestId !== value)) result.issues.push('上游请求与绑定的依赖不匹配。');
  const upstream: Request[] = [];
  for (const dependency of request.dependencies) {
    const parent = registry.requests.find(item => item.requestId === dependency.requestId);
    if (!parent) { result.issues.push(`上游请求缺失：${dependency.requestId}`); continue; }
    upstream.push(parent);
    const checked = await evaluate(root, registry, parent, next);
    if (fingerprint(parent) !== dependency.fingerprint || !checked.confirmed || checked.decisionId !== dependency.decisionId) result.issues.push(`上游确认已失效或需复核：${dependency.requestId}`);
  }
  if (!coverage(request, upstream) && !request.exception) result.issues.push(`缺少覆盖当前范围的 ${prerequisite(request.gate)} 确认。`);
  if (request.exception) result.issues.push(...await checkSource(root, request.exception.source, request.exceptionFiles, request.exception.sourceReview));
  else if (request.exceptionFiles.length) result.issues.push('存在无对应例外的来源绑定。');
  const decision = registry.decisions.filter(item => item.requestId === request.requestId).at(-1);
  if (!decision) {
    if (result.issues.length) result.status = 'needs-review';
    else result.issues.push('等待用户确认。');
    return result;
  }
  result.decisionId = decision.decisionId;
  if (decision.source.presentation.repository !== '.' || decision.source.presentation.path !== presentationPath(registry.workId, request.requestId)) result.issues.push('决定未绑定本请求的具体展示文件。');
  result.issues.push(...await checkSource(root, decision.source, decision.files, decision.sourceReview));
  result.issues.push(...await checkReuse(root, registry, request, decision, new Set(), next));
  let deliveryReady: boolean | undefined;
  if (decision.outcome === 'approved' && request.deliveryBinding) {
    try { deliveryReady = (await inspectRequestDelivery(root, registry, request, false)).technicalReady; }
    catch (error) { result.issues.push((error as Error).message); }
  }
  if (decision.outcome === 'revoked') result.status = 'invalidated';
  else if (decision.outcome === 'rejected') result.status = 'rejected';
  else if (decision.outcome === 'conditional') { result.status = 'conditional'; result.issues.push(...decision.conditions.map(condition => `待核对条件：${condition}`)); }
  else if (result.issues.length) result.status = 'needs-review';
  else {
    result.status = 'confirmed'; result.confirmed = true; result.confirmationBasis = 'reported-review';
    if (request.gate === 'acceptance' && request.deliveryBinding) result.deliveryStatus = deliveryReady ? 'accepted' : 'accepted-with-exceptions';
  }
  if (result.status === 'rejected' || result.status === 'invalidated') result.issues.push('用户已拒绝或撤销此确认。');
  return result;
}

export async function requestConfirmation(rootInput: string, id: string, input: unknown) {
  const root = await resolveWorkRoot(rootInput, id);
  const request = requestInput(input);
  assertBindingOwner(request, id);
  return withProjectLock(root, () => inProject(root, id, true, async () => {
    const data = await load(root, id);
    const existing = data.registry.requests.find(item => item.requestId === request.requestId);
    if (existing) {
      const { createdAt: _createdAt, files: _files, dependencies: _dependencies, exceptionFiles: _exceptionFiles, ...original } = existing;
      if (json(original) !== json(request)) fail('相同请求标识已用于不同内容。');
      return { changed: false, ...await evaluate(root, data.registry, existing), presentation: presentationPath(id, request.requestId), limitation };
    }
    const metadata = await requireReadyProject(root);
    if (request.scope.repositories.some(repository => repository !== '.' && !metadata.repositories.includes(repository))) fail('范围含未登记仓库。');
    if (request.mergeBinding?.repositories.some(repository => repository.dependencies.some(dependency => dependency.repository !== '.' && !metadata.repositories.includes(dependency.repository)))) fail('合入版本依赖含未登记仓库。');
    if (request.subjects.some(subject => !request.scope.repositories.includes(subject.repository))) fail('审阅对象必须位于请求声明的仓库范围内。');
    const parents: Request[] = [];
    const dependencies: Request['dependencies'] = [];
    for (const upstream of request.upstream) {
      const parent = data.registry.requests.find(item => item.requestId === upstream);
      if (!parent) fail(`上游请求不存在：${upstream}`);
      const checked = await evaluate(root, data.registry, parent);
      if (!checked.confirmed || !checked.decisionId) fail(`上游确认未满足：${upstream}；${checked.issues.join('；')}`);
      parents.push(parent);
      dependencies.push({ requestId: upstream, fingerprint: fingerprint(parent), decisionId: checked.decisionId });
    }
    if (!coverage(request, parents) && !request.exception) fail(`缺少覆盖当前范围的 ${prerequisite(request.gate)} 确认；不得自行省略。`);
    const captured = await capture(root, id, `request-${request.requestId}`, request.subjects);
    const exceptionCapture = request.exception ? await capture(root, id, `exception-${request.requestId}`, [request.exception.source.reference, request.exception.source.presentation]) : { files: [], changes: [] };
    if (request.exception) {
      const issues = await checkSource(root, request.exception.source, exceptionCapture.files, request.exception.sourceReview, false);
      if (issues.length) fail(issues.join('；'));
    }
    const saved: Request = { ...request, createdAt: new Date().toISOString(), files: captured.files, dependencies, exceptionFiles: exceptionCapture.files };
    const changed = await checkFiles(root, [...saved.files, ...saved.exceptionFiles], false);
    if (changed.length) fail(changed.join('；'));
    for (const dependency of dependencies) {
      const parent = parents.find(item => item.requestId === dependency.requestId);
      if (!parent || !(await evaluate(root, data.registry, parent)).confirmed) fail('写入前上游确认已变化。');
    }
    const displayPath = presentationPath(id, request.requestId);
    await assertSharedPaths(root, [displayPath]);
    if (await readTextIfExists(root, displayPath) !== null) fail('请求展示文件已经存在。');
    data.registry.requests.push(saved);
    await applyChanges(root, [...captured.changes, ...exceptionCapture.changes, { path: displayPath, before: null, after: presentation(saved) }, { path: data.location, before: data.original, after: json(data.registry) }]);
    return { changed: true, ...await evaluate(root, data.registry, saved), presentation: displayPath, limitation };
  }));
}

export async function recordDecision(rootInput: string, id: string, input: unknown) {
  const root = await resolveWorkRoot(rootInput, id);
  const decision = decisionInput(input);
  return withProjectLock(root, () => inProject(root, id, true, async () => {
    const data = await load(root, id);
    const request = data.registry.requests.find(item => item.requestId === decision.requestId);
    if (!request) fail(`确认请求不存在：${decision.requestId}`);
    if (decision.source.presentation.repository !== '.' || decision.source.presentation.path !== presentationPath(id, request.requestId)) fail('决定须引用本请求生成的展示文件。');
    const reuseIssues = await checkReuse(root, data.registry, request, decision);
    if (reuseIssues.length) fail(reuseIssues.join('；'));
    const existing = data.registry.decisions.find(item => item.decisionId === decision.decisionId);
    if (existing) {
      const { recordedAt: _recordedAt, files: _files, ...original } = existing;
      if (json(original) !== json(decision)) fail('相同决定标识已用于不同内容。');
      return { changed: false, ...await evaluate(root, data.registry, request), limitation };
    }
    // A rejection/revocation remains recordable after a subject changes; approval cannot bless an old snapshot.
    if (decision.outcome === 'approved' || decision.outcome === 'conditional') {
      const issues = await checkFiles(root, request.files);
      if (issues.length) fail(issues.join('；'));
    }
    const captured = await capture(root, id, `decision-${decision.decisionId}`, [decision.source.reference, decision.source.presentation]);
    const issues = await checkSource(root, decision.source, captured.files, decision.sourceReview, false);
    if (issues.some(issue => !issue.startsWith('source-unverified'))) fail(issues.join('；'));
    const saved: Decision = { ...decision, recordedAt: new Date().toISOString(), files: captured.files };
    const changed = await checkFiles(root, [...request.files, ...saved.files], false);
    if ((decision.outcome === 'approved' || decision.outcome === 'conditional') && changed.length) fail(changed.join('；'));
    if (decision.outcome === 'approved' && request.deliveryBinding) await inspectRequestDelivery(root, data.registry, request, true);
    data.registry.decisions.push(saved);
    await applyChanges(root, [...captured.changes, { path: data.location, before: data.original, after: json(data.registry) }]);
    return { changed: true, ...await evaluate(root, data.registry, request), limitation };
  }));
}

export async function checkGate(rootInput: string, id: string, requestId: string): Promise<GateCheck> {
  const root = await resolveWorkRoot(rootInput, id);
  return inProject(root, id, false, async () => {
    const { registry } = await load(root, id);
    const request = registry.requests.find(item => item.requestId === identifier(requestId));
    if (!request) fail(`确认请求不存在：${requestId}`);
    const checked = await evaluate(root, registry, request);
    return { ...checked, gateStatus: checked.status, recordValid: true, blockingReasons: checked.issues, enforcementScope: 'tiller-cli-only', limitation };
  });
}

export type ReadonlyConfirmation<T> = T extends object ? { readonly [K in keyof T]: ReadonlyConfirmation<T[K]> } : T;
export interface ConfirmationRead {
  reference: ConfirmationReference;
  request: Request;
  decision: Decision;
  check: GateCheck;
  requestFingerprint: string;
  decisionFingerprint: string;
}
function freezeConfirmation<T>(value: T): ReadonlyConfirmation<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeConfirmation(child);
    Object.freeze(value);
  }
  return value as ReadonlyConfirmation<T>;
}

/** Revalidates an explicit cross-work reference without writing or granting caller scope.
 * Consumers must match gate, subjects, scope and any operation binding, and recheck before writes.
 * A structurally valid request can still be pending, rejected or stale; only check.confirmed is approval.
 */
export async function readConfirmation(rootInput: string, input: ConfirmationReference): Promise<ReadonlyConfirmation<ConfirmationRead>> {
  const item = object(input, ['workId', 'requestId', 'decisionId'], '确认引用');
  const reference = { workId: identifier(item.workId), requestId: identifier(item.requestId), decisionId: identifier(item.decisionId) };
  const root = await resolveWorkRoot(rootInput, reference.workId);
  return inProject(root, reference.workId, false, async () => {
    const { registry } = await load(root, reference.workId);
    const request = registry.requests.find(candidate => candidate.requestId === reference.requestId);
    if (!request) fail(`确认请求不存在：${reference.workId}/${reference.requestId}`);
    const decision = registry.decisions.filter(candidate => candidate.requestId === request.requestId).at(-1);
    if (!decision || decision.decisionId !== reference.decisionId) fail('确认引用未指向该请求的当前决定；不能继承未知或已被替代的批准。');
    const checked = await evaluate(root, registry, request);
    const check: GateCheck = { ...checked, gateStatus: checked.status, recordValid: true, blockingReasons: checked.issues, enforcementScope: 'tiller-cli-only', limitation };
    return freezeConfirmation({ reference, request, decision, check, requestFingerprint: fingerprint(request), decisionFingerprint: digest(json(decision)) });
  });
}

/** Caller obtains current platform/dependency state; this function does not authenticate it. */
export async function checkMergeGate(rootInput: string, id: string, requestId: string, currentBinding: unknown): Promise<GateCheck> {
  const root = await resolveWorkRoot(rootInput, id);
  const binding = mergeBinding(currentBinding);
  return inProject(root, id, false, async () => {
    const { registry } = await load(root, id);
    const request = registry.requests.find(item => item.requestId === identifier(requestId));
    if (!request || request.gate !== 'merge') fail('合入须引用独立的 merge 确认，不能使用设计或验收替代。');
    const checked = await evaluate(root, registry, request, new Set(), binding);
    return { ...checked, gateStatus: checked.status, recordValid: true, blockingReasons: checked.issues, enforcementScope: 'tiller-cli-only', limitation };
  });
}

export async function inspectConfirmations(rootInput: string, id: string) {
  const root = await resolveWorkRoot(rootInput, id);
  return inProject(root, id, false, async () => {
    const { registry } = await load(root, id);
    const requests: GateResult[] = [];
    for (const request of registry.requests) requests.push(await evaluate(root, registry, request));
    return { requests, automaticTransition: false as const, limitation };
  });
}

/** The public delivery report calls this after the technical kernel, never from inside it. */
export async function inspectDeliveryAcceptance(rootInput: string, workId: string, basisDigest: string) {
  if (!/^[a-f0-9]{64}$/u.test(basisDigest)) fail('整体交付摘要须为 SHA-256。');
  const root = await resolveWorkRoot(rootInput, workId);
  return inProject(root, workId, false, async () => {
    const { registry } = await load(root, workId);
    const request = registry.requests.filter(candidate => candidate.gate === 'acceptance'
      && candidate.deliveryBinding?.deliveryBasisDigest === basisDigest).at(-1);
    if (!request) return { status: 'not-requested' as const, basisDigest, confirmed: false, issues: [] as string[] };
    const checked = await evaluate(root, registry, request);
    const status = checked.confirmed ? checked.deliveryStatus!
      : checked.status === 'rejected' || checked.status === 'invalidated' ? 'rejected' as const
      : checked.status === 'needs-review' ? 'stale' as const : 'pending' as const;
    return { status, basisDigest, confirmed: checked.confirmed, requestId: request.requestId,
      ...(checked.decisionId ? { decisionId: checked.decisionId } : {}), deliveryBinding: request.deliveryBinding!, issues: checked.issues };
  });
}

/** Read-only: the caller must hold the project lock while saving the resulting completion. */
export async function assertAcceptance(rootInput: string, id: string, requestId: string, documentPath: string | FileRef, evidencePath: string) {
  const root = await resolveWorkRoot(rootInput, id);
  return inProject(root, id, false, async () => {
    const { registry } = await load(root, id);
    const request = registry.requests.find(item => item.requestId === identifier(requestId));
    if (!request || request.gate !== 'acceptance') fail('完成必须绑定对应的交付验收请求。');
    const document = typeof documentPath === 'string' ? { repository: '.', path: documentPath } : ref(documentPath);
    if (![document, { repository: '.', path: evidencePath }].every(location => request.files.some(file => file.repository === location.repository && file.path === location.path))) fail('验收请求必须同时绑定本次文档和验证证据。');
    const checked = await evaluate(root, registry, request);
    if (!checked.confirmed || !checked.decisionId || checked.confirmationBasis !== 'reported-review') fail(`验收尚未满足：${checked.issues.join('；')}`);
    const decision = registry.decisions.find(item => item.decisionId === checked.decisionId);
    if (!decision) fail('验收决定不存在。');
    return { requestId, decisionId: checked.decisionId, confirmationBasis: 'reported-review' as const, requestFingerprint: fingerprint(request), decisionFingerprint: digest(json(decision)) };
  });
}
