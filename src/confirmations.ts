import { createHash } from 'node:crypto';
import { readProjectMetadata } from './core.js';
import { assertSharedWritePaths } from './shared-paths.js';
import type { SharedWriteProof } from './shared-paths.js';
import { applyChanges, hasPendingTransaction, readTextInputs, verifyTextInputs, validateRelativePath, withProjectLock } from './files.js';
import type { TextInput } from './files.js';
import type { FileChange, ProjectMetadata } from './types.js';
import { resolveRepositoryRootsFromMetadata, resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { repositoryPath } from './repository-paths.js';
import { workflowIntentDigest, assertWorkflowActivationCurrent } from './workflow-policy.js';
import type { WorkflowPolicyContext } from './workflow-policy.js';
import { parseWorkflowWorkRecord, WORKFLOW_WORK_LIMITS } from './workflow-work.js';
import type { WorkflowWorkRecord } from './workflow-work.js';
import type { WorkflowSnapshot } from './workflow-catalog.js';
import { WORKFLOW_ACTIONS, evaluateWorkflowCondition, parseWorkflowSnapshot } from './workflow-catalog.js';
import type { WorkflowAction, WorkflowConfirmation } from './workflow-catalog.js';
import { CONFIRMATION_LIMITS, withConfirmationVisit } from './confirmation-context.js';

export type Gate = 'requirements' | 'design' | 'planning' | 'checkpoint' | 'exception' | 'acceptance' | 'merge' | 'release' | 'scope' | 'operation';
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
export interface WorkflowConfirmationBinding { workflowDigest: string; intentDigest: string; stageId?: string }
export interface ScopeBinding { kind: 'workflow-extension' | 'workflow-transition' | 'scope-change'; ownerWorkId: string; changeDigest: string }
export interface OperationBinding {
  ownerWorkId: string; stageId: string; actions: WorkflowAction[];
  objects: { repository: string; target: string; environment: string; version: string }[];
  recovery: { reference: FileRef; condition: string }; endCondition: string;
}
export interface DocumentBinding { document: FileRef; evidence: FileRef }
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
  workflowBinding: WorkflowConfirmationBinding;
  scopeBinding?: ScopeBinding;
  operationBinding?: OperationBinding;
  documentBinding?: DocumentBinding;
  externalUpstream?: ConfirmationReference[];
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
  externalDependencies: (ConfirmationReference & { requestFingerprint: string; decisionFingerprint: string })[];
}
export interface Decision extends DecisionInput { recordedAt: string; files: BoundFile[] }
interface Registry { schemaVersion: 4; workId: string; requests: Request[]; decisions: Decision[] }
interface RegistryIndex { requests: Map<string, Request>; decisions: Map<string, Decision> }
export interface GateResult {
  requestId: string; gate: Gate; status: 'pending' | 'confirmed' | 'rejected' | 'conditional' | 'needs-review' | 'invalidated';
  confirmed: boolean; issues: string[]; decisionId?: string; confirmationBasis?: 'reported-review';
  deliveryStatus?: 'accepted' | 'accepted-with-exceptions';
  sourceVerification: 'not-independently-verified'; automaticTransition: false;
}
export type GateCheck = GateResult & { gateStatus: GateResult['status']; recordValid: true; blockingReasons: string[]; enforcementScope: 'tiller-cli-only'; limitation: string };
const limitation = '仅核对共享记录、内容与执行者所报复核；不能认证用户身份、自动放行或阻止绕过 CLI 的写入。';
interface PolicyContext { root: string; record: WorkflowWorkRecord; snapshot: WorkflowSnapshot; intentDigest: string; sourceIssues: string[] }
interface TransitionInput { record: WorkflowWorkRecord; currentHash: string }
interface ConfirmationWorkInput {
  root: string; location: string; original: string | null; registry: Registry; policy: PolicyContext;
  index: RegistryIndex;
}
interface ConfirmationInputs {
  root: string; metadata: ProjectMetadata; works: Map<string, ConfirmationWorkInput>;
  materials: Map<string, ConfirmationMaterials>; observations: { root: string; inputs: TextInput[]; maxBytes?: number }[];
  order: { workId: string; request: Request }[]; cycles: Set<string>; repositories: { workId: string; repository: string; recordRoot: string; root: string }[];
}
interface ConfirmationEvaluation { inputs: ConfirmationInputs; workId: string; results: Map<string, GateResult> }
const nodeKey = (workId: string, requestId: string) => JSON.stringify([workId, requestId]);

function policyContext(inputs: ConfirmationInputs, id: string): PolicyContext {
  const work = inputs.works.get(id);
  if (!work) fail(`工作未包含在本次确认输入中：${id}`);
  return work.policy;
}

/** The loader owns all input I/O. Computations receive this completed data explicitly. */
async function loadConfirmationInputs(root: string, id: string, select: (registry: Registry) => Request[],
  extraReferences: FileRef[] = [], policyOverride?: TransitionInput, subjects = true, additionalReferences: ConfirmationReference[] = [], owner?: WorkflowPolicyContext): Promise<ConfirmationInputs> {
  if (owner && (owner.root !== root || owner.recordText === undefined
    || json(parseWorkflowWorkRecord(JSON.parse(owner.recordText), owner.record.id)) !== json(owner.record))) fail('确认所有者输入与当前工作原文不一致。');
  const inputs: ConfirmationInputs = { root, metadata: owner?.metadata ?? await readProjectMetadata(root), works: new Map(),
    materials: new Map(), observations: [], order: [], cycles: new Set(), repositories: [] };
  if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
  const references = new Map<string, FileRef[]>([[id, [...extraReferences]]]);
  const addReferences = (workId: string, additions: FileRef[]) => {
    const declared = references.get(workId) ?? []; declared.push(...additions); references.set(workId, declared);
  };
  async function loadWork(workId: string): Promise<ConfirmationWorkInput> {
    const existing = inputs.works.get(workId);
    if (existing) return existing;
    const recordRoot = await resolveWorkRoot(root, workId);
    const location = registryPath(workId);
    const recordPath = `.tiller/work/${workId}/record.json`;
    const loaded = await readTextInputs(recordRoot, [location, `.tiller/work/${workId}/work.md`], {}, owner?.materials);
    const declared = owner?.record.id === workId && owner.root === recordRoot ? owner : undefined;
    const recordInputs = declared ? [{path: recordPath, text: declared.recordText!}]
      : await readTextInputs(recordRoot, [recordPath], { maxBytes: WORKFLOW_WORK_LIMITS.recordBytes }, owner?.materials);
    inputs.observations.push({ root: recordRoot, inputs: loaded }, { root: recordRoot, inputs: recordInputs, maxBytes: WORKFLOW_WORK_LIMITS.recordBytes });
    const original = loaded[0]!.text;
    if (loaded[1]!.text === null) fail(`工作说明不存在：.tiller/work/${workId}/work.md`);
    const rawRecord = recordInputs[0]!.text;
    if (rawRecord === null) fail('政策检查要求真实当前工作记录。');
    if (Buffer.byteLength(rawRecord, 'utf8') > WORKFLOW_WORK_LIMITS.recordBytes) fail('工作记录超过 1 MiB。');
    const currentRecord = parseWorkflowWorkRecord(JSON.parse(rawRecord), workId);
    if (workId === id && policyOverride && digest(rawRecord) !== policyOverride.currentHash) fail('转换写后记录已变化。');
    const record = workId === id && policyOverride ? policyOverride.record : currentRecord;
    if (record.scope.repositories.some(repository => repository !== '.' && !inputs.metadata.repositories.includes(repository))) fail('工作仓库未登记。');
    const observedSnapshot = declared?.sourceInputs?.filter(group => group.root === recordRoot)
      .flatMap(group => group.inputs).find(input => input.path === record.workflow.path);
    const snapshotInputs = observedSnapshot ? [observedSnapshot]
      : await readTextInputs(recordRoot, [record.workflow.path], { maxBytes: WORKFLOW_WORK_LIMITS.recordBytes }, owner?.materials);
    inputs.observations.push({ root: recordRoot, inputs: snapshotInputs, maxBytes: WORKFLOW_WORK_LIMITS.recordBytes });
    const source = snapshotInputs[0]!.text;
    if (source === null) fail('工作固定流程快照缺失，不能使用当前目录版本代替。');
    if (Buffer.byteLength(source, 'utf8') > WORKFLOW_WORK_LIMITS.recordBytes) fail('工作固定流程快照超过大小限制。');
    const snapshot = parseWorkflowSnapshot(JSON.parse(source));
    if (snapshot.id !== record.workflow.id || snapshot.version !== record.workflow.version || snapshot.digest !== record.workflow.digest)
      fail('工作固定流程身份、版本或摘要已变化。');
    if (record.expectedOutputs.some(outputId => !snapshot.definition.outputs.some(output => output.id === outputId))
      || Object.values(record.artifacts).some(output => snapshot.definition.outputs.find(item => item.id === output.outputId)?.role !== output.role)
      || record.links.some(link => !snapshot.definition.stages.some(stage => stage.id === link.consumerStageId))) fail('工作产物或依赖不属于固定流程。');
    const registry: Registry = original === null ? { schemaVersion: 4, workId, requests: [], decisions: [] } : parseRegistry(original, workId);
    const index: RegistryIndex = { requests: new Map(registry.requests.map(request => [request.requestId, request])), decisions: new Map() };
    for (const decision of registry.decisions) index.decisions.set(decision.requestId, decision);
    const work: ConfirmationWorkInput = { root: recordRoot, location, original, registry, index,
      policy: { root, record, snapshot, intentDigest: workflowIntentDigest(record), sourceIssues: [] } };
    inputs.works.set(workId, work);
    addReferences(workId, [...record.basis.map(entry => entry.reference), ...record.actionSources.map(entry => entry.reference)]);
    return work;
  }
  const states = new Map<string, 'visiting' | 'complete'>();
  const stack: string[] = [];
  async function visit(workId: string, request: Request): Promise<void> {
    const key = nodeKey(workId, request.requestId);
    if (states.get(key) === 'complete') return;
    if (states.get(key) === 'visiting') {
      for (const entry of stack.slice(stack.indexOf(key))) inputs.cycles.add(entry);
      return;
    }
    if (stack.length >= CONFIRMATION_LIMITS.depth || states.size >= CONFIRMATION_LIMITS.nodes)
      fail('确认依赖形成循环或超过有界核验限制。');
    states.set(key, 'visiting'); stack.push(key);
    const work = await loadWork(workId);
    const decision = work.index.decisions.get(request.requestId);
    addReferences(workId, requestReferences(workId, request, decision));
    for (const requestId of new Set([...request.upstream, ...request.dependencies.map(dependency => dependency.requestId)])) {
      const parent = work.index.requests.get(requestId);
      if (parent) await visit(workId, parent);
    }
    if (decision?.reuseOf) {
      const previous = work.index.requests.get(decision.reuseOf.requestId);
      if (previous) await visit(workId, previous);
    }
    for (const reference of request.externalUpstream ?? []) {
      const external = await loadWork(reference.workId);
      const parent = external.index.requests.get(reference.requestId);
      if (parent) {
        for (const output of work.policy.snapshot.definition.outputs.filter(output => output.role === parent.gate)) {
          const artifact = work.policy.record.artifacts[output.id];
          if (artifact) addReferences(workId, [artifact.source]);
        }
        await visit(reference.workId, parent);
      }
    }
    stack.pop(); states.set(key, 'complete'); inputs.order.push({ workId, request });
  }
  const work = await loadWork(id);
  if (subjects) for (const request of select(work.registry)) await visit(id, request);
  else select(work.registry);
  for (const reference of additionalReferences) {
    const external = await loadWork(reference.workId);
    const request = selectedRequest(external.registry, reference.requestId);
    await visit(reference.workId, request);
  }
  // Each owner resolves its registered checkout. The final I/O batches deduplicate actual paths.
  const groups = new Map<string, { workId: string; reference: FileRef }[]>();
  for (const [workId, workReferences] of references) {
    inputs.materials.set(workId, new Map());
    const unique = [...new Map(workReferences.map(reference => [materialKey(reference), reference])).values()];
    const work = inputs.works.get(workId)!;
    {
      const roots = await resolveRepositoryRootsFromMetadata(work.root, unique.map(reference => reference.repository), inputs.metadata, workId);
      for (const [repository, repositoryRoot] of roots) {
        if (repository !== '.' && !inputs.metadata.repositories.includes(repository)) fail(`仓库未登记：${repository}`);
        inputs.repositories.push({ workId, repository, recordRoot: work.root, root: repositoryRoot });
        const group = groups.get(repositoryRoot) ?? [];
        for (const reference of unique.filter(reference => reference.repository === repository)) {
          try { assertReferenceBoundary(inputs.metadata, reference); group.push({ workId, reference }); }
          catch (error) { inputs.materials.get(workId)!.set(materialKey(reference), { ok: false, error }); }
        }
        groups.set(repositoryRoot, group);
      }
    }
  }
  const sourceKeys = new Map([...inputs.works].map(([workId, work]) => [workId,
    new Set([...work.policy.record.basis, ...work.policy.record.actionSources].map(entry => materialKey(entry.reference)))]));
  for (const [repositoryRoot, group] of groups) {
    const paths = [...new Set(group.map(item => item.reference.path))];
    const bounded = new Set(group.filter(({ workId, reference }) => sourceKeys.get(workId)!.has(materialKey(reference)))
      .map(item => item.reference.path));
    const batches = [
      { paths: paths.filter(path => bounded.has(path)), maxBytes: WORKFLOW_WORK_LIMITS.referenceBytes },
      { paths: paths.filter(path => !bounded.has(path)), maxBytes: undefined },
    ];
    for (const batch of batches) {
      if (!batch.paths.length) continue;
      const batchPaths = new Set(batch.paths);
      const selected = group.filter(item => batchPaths.has(item.reference.path));
      try {
        const loaded = await readTextInputs(repositoryRoot, batch.paths, batch.maxBytes === undefined ? {} : { maxBytes: batch.maxBytes }, owner?.materials);
        inputs.observations.push({ root: repositoryRoot, inputs: loaded, ...(batch.maxBytes === undefined ? {} : { maxBytes: batch.maxBytes }) });
        const contents = new Map(loaded.map(input => [input.path, input.text]));
        for (const { workId, reference } of selected) inputs.materials.get(workId)!.set(materialKey(reference), { ok: true, contents: contents.get(reference.path)! });
      } catch (error) {
        for (const { workId, reference } of selected) inputs.materials.get(workId)!.set(materialKey(reference), { ok: false, error });
      }
    }
  }
  for (const [workId, work] of inputs.works) {
    for (const entry of [...work.policy.record.basis, ...work.policy.record.actionSources]) {
      try {
        const contents = materialContents(inputs.materials.get(workId)!, entry.reference);
        if (contents === null || digest(contents) !== entry.sha256 || ('quote' in entry && !contents.includes(entry.quote)))
          work.policy.sourceIssues.push(`来源缺失或变化：${entry.reference.repository}/${entry.reference.path}`);
      } catch (error) { work.policy.sourceIssues.push((error as Error).message); }
    }
    if (work.policy.record.workflow.id.startsWith('project.')) {
      try { await withConfirmationVisit(work.root, workId, 'workflow-activation',
        () => withDeliveryLocation(work.root, workId, () => assertWorkflowActivationCurrent(work.root, work.policy.record))); }
      catch (error) { work.policy.sourceIssues.push((error as Error).message); }
    }
  }
  return inputs;
}
function requestReferences(workId: string, request: Request, decision?: Decision): FileRef[] {
  return [...materialReferences(request.files, true), { repository: '.', path: presentationPath(workId, request.requestId) },
    ...(decision ? [...materialReferences(decision.files, true), decision.source.reference] : []),
    ...(request.exception ? [...materialReferences(request.exceptionFiles, true), request.exception.source.reference] : []),
    ...(request.operationBinding ? [request.operationBinding.recovery.reference] : [])];
}
function assertReferenceBoundary(metadata: ProjectMetadata, reference: FileRef): void {
  const location = reference.path.toLowerCase();
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  if (reference.repository === '.' && boundaries.some(boundary => location === boundary || location.startsWith(`${boundary}/`)))
    fail('业务仓库对象必须使用其登记的仓库身份，不能借管理工程身份引用。');
}
async function verifyConfirmationInputs(inputs: ConfirmationInputs, shared = false, proofs?: import('./files.js').TextProof[], sharing?: SharedWriteProof[]): Promise<void> {
  if (shared) {
    for (const proof of confirmationSharingPaths(inputs)) {
      if (sharing) sharing.push(proof);
      else await assertSharedWritePaths(proof.root, proof.paths);
    }
  }
  // Material proofs precede control-record proofs, so a revocation arriving during
  // material I/O cannot escape as a still-current approval.
  for (const observation of [...inputs.observations].reverse()) {
    const control = [...inputs.works.values()].some(work => observation.inputs.some(input =>
      input.path === work.location || input.path === `.tiller/work/${work.policy.record.id}/record.json` || input.path === work.policy.record.workflow.path));
    try { await verifyTextInputs(observation.root, observation.inputs, observation.maxBytes === undefined ? {} : { maxBytes: observation.maxBytes }, proofs, control); }
    catch (error) { fail(`确认登记或材料在本次读取后已变化，请重新复核：${(error as Error).message}`); }
  }
  for (const [workId, work] of inputs.works) {
    const bindings = inputs.repositories.filter(binding => binding.workId === workId);
    const roots = await resolveRepositoryRootsFromMetadata(work.root, bindings.map(binding => binding.repository), inputs.metadata, workId);
    if (bindings.some(binding => roots.get(binding.repository) !== binding.root)) fail('确认材料复核期间仓库位置已变化。');
  }
  if (json(await readProjectMetadata(inputs.root)) !== json(inputs.metadata)) fail('确认复核期间工程仓库登记已变化。');
}

function confirmationSharingPaths(inputs: ConfirmationInputs): SharedWriteProof[] {
  const paths = new Map<string, Set<string>>();
  for (const observation of inputs.observations) {
    const group = paths.get(observation.root) ?? new Set<string>();
    for (const input of observation.inputs) group.add(input.path);
    paths.set(observation.root, group);
  }
  return [...paths].map(([root, paths]) => ({root, paths: [...paths]}));
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
  if (parts.includes('.git') || parts.includes('node_modules') || parts.some((part, index) => part === '.tiller' && ['local', 'workflow-policy'].includes(parts[index + 1] ?? ''))) fail('确认依据不能引用 Git 内部文件或本机资料。');
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
function sha(value: unknown): string {
  const result = text(value, '摘要');
  if (!/^[a-f0-9]{64}$/u.test(result)) fail('绑定摘要须为 SHA-256。');
  return result;
}
function workflowBinding(value: unknown): WorkflowConfirmationBinding {
  const item = object(value, ['workflowDigest', 'intentDigest', 'stageId'], '流程绑定');
  return { workflowDigest: sha(item.workflowDigest), intentDigest: sha(item.intentDigest), ...(item.stageId === undefined ? {} : { stageId: identifier(item.stageId) }) };
}
function scopeBinding(value: unknown): ScopeBinding {
  const item = object(value, ['kind', 'ownerWorkId', 'changeDigest'], '范围变更绑定');
  if (!['workflow-extension', 'workflow-transition', 'scope-change'].includes(String(item.kind))) fail('范围变更类型无效。');
  return { kind: item.kind as ScopeBinding['kind'], ownerWorkId: identifier(item.ownerWorkId), changeDigest: sha(item.changeDigest) };
}
export function parseOperationBinding(value: unknown): OperationBinding {
  const item = object(value, ['ownerWorkId', 'stageId', 'actions', 'objects', 'recovery', 'endCondition'], '操作对象绑定');
  const actions = strings(item.actions, '操作动作', true);
  if (actions.some(action => !WORKFLOW_ACTIONS.includes(action as WorkflowAction) || ['merge', 'release'].includes(action))) fail('operation 不能声明未知动作或代替 merge/release。');
  if (!Array.isArray(item.objects) || !item.objects.length || item.objects.length > 128) fail('操作对象须为非空有限数组。');
  const objects = item.objects.map(raw => {
    const entry = object(raw, ['repository', 'target', 'environment', 'version'], '操作对象');
    return { repository: repositoryIdentity(entry.repository), target: text(entry.target, '对象目标'), environment: text(entry.environment, '对象环境'), version: text(entry.version, '对象版本') };
  });
  if (new Set(objects.map(entry => json(entry))).size !== objects.length) fail('操作对象不能重复。');
  const recovery = object(item.recovery, ['reference', 'condition'], '恢复条件');
  return { ownerWorkId: identifier(item.ownerWorkId), stageId: identifier(item.stageId), actions: actions as WorkflowAction[], objects,
    recovery: { reference: ref(recovery.reference), condition: text(recovery.condition, '恢复条件') }, endCondition: text(item.endCondition, '结束条件') };
}
function requestInput(value: unknown): RequestInput {
  const item = object(value, ['requestId', 'gate', 'scope', 'subjects', 'upstream', 'reviewSummary', 'openIssues', 'nextAction', 'exception', 'mergeBinding', 'checkpointBinding', 'exceptionBinding', 'deliveryBinding', 'deliveryExceptionRefs', 'workflowBinding', 'scopeBinding', 'operationBinding', 'documentBinding', 'externalUpstream'], '确认请求');
  if (typeof item.gate !== 'string' || !['requirements', 'design', 'planning', 'checkpoint', 'exception', 'acceptance', 'merge', 'release', 'scope', 'operation'].includes(item.gate)) fail('确认节点无效。');
  if (!Array.isArray(item.subjects) || !item.subjects.length) fail('审阅对象不能为空。');
  const result: RequestInput = {
    workflowBinding: workflowBinding(item.workflowBinding),
    requestId: identifier(item.requestId), gate: item.gate as Gate, scope: scope(item.scope), subjects: item.subjects.map(ref),
    upstream: strings(item.upstream, '上游请求').map(identifier), reviewSummary: text(item.reviewSummary, '审阅摘要'),
    openIssues: strings(item.openIssues, '未决事项'), nextAction: text(item.nextAction, '下一步'),
  };
  if (result.gate === 'scope') result.scopeBinding = scopeBinding(item.scopeBinding);
  else if (item.scopeBinding !== undefined) fail('只有 scope 节点可以声明范围变更绑定。');
  if (result.gate === 'operation') {
    result.operationBinding = parseOperationBinding(item.operationBinding);
    if (result.operationBinding.stageId !== result.workflowBinding.stageId) fail('操作阶段与流程绑定不一致。');
    if (result.operationBinding.objects.some(entry => !result.scope.repositories.includes(entry.repository) || !result.scope.targets.includes(entry.target))) fail('操作对象超出请求范围。');
    if (!result.subjects.some(entry => json(entry) === json(result.operationBinding!.recovery.reference))) fail('恢复依据必须列入操作审阅对象。');
  } else if (item.operationBinding !== undefined) fail('只有 operation 节点可以声明操作对象绑定。');
  if (item.documentBinding !== undefined) {
    if (result.gate !== 'acceptance' || item.deliveryBinding !== undefined) fail('文档验收绑定不能与整体交付绑定混用。');
    const document = object(item.documentBinding, ['document', 'evidence'], '文档验收绑定');
    result.documentBinding = { document: ref(document.document), evidence: ref(document.evidence) };
    if (json(result.documentBinding.document) === json(result.documentBinding.evidence)
      || !Object.values(result.documentBinding).every(reference => result.subjects.some(subject => json(subject) === json(reference)))) fail('文档验收必须同时绑定不同的文档和验证证据。');
  }
  if (result.gate === 'acceptance' && !result.documentBinding && !item.deliveryBinding) fail('acceptance 必须绑定具体整体交付或文档及证据。');
  if (item.externalUpstream !== undefined) result.externalUpstream = deliveryExceptionRefs(item.externalUpstream);
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
  if (['planning', 'checkpoint', 'exception', 'scope', 'operation'].includes(result.gate) && item.exception !== undefined) fail('新确认节点不能通过内嵌例外省略上游确认；例外须使用独立 exception 请求。');
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
  return `# 确认请求 ${request.requestId}\n\n请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。\n\n\`\`\`json\n${json({ requestId: request.requestId, gate: request.gate, workflowBinding: request.workflowBinding, scopeBinding: request.scopeBinding, operationBinding: request.operationBinding, documentBinding: request.documentBinding, externalDependencies: request.externalDependencies, scope: request.scope, reviewSummary: request.reviewSummary, openIssues: request.openIssues, nextAction: request.nextAction, subjects: request.files, upstream: request.dependencies, exception: request.exception ?? null, ...(request.mergeBinding ? { mergeBinding: request.mergeBinding } : {}), ...(request.checkpointBinding ? { checkpointBinding: request.checkpointBinding } : {}), ...(request.exceptionBinding ? { exceptionBinding: request.exceptionBinding } : {}), ...(request.deliveryBinding ? { deliveryBinding: request.deliveryBinding } : {}), ...(request.deliveryExceptionRefs ? { deliveryExceptionRefs: request.deliveryExceptionRefs } : {}) })}\`\`\`\n`;
}

type MaterialRead = { ok: true; contents: string | null } | { ok: false; error: unknown };
type ConfirmationMaterials = Map<string, MaterialRead>;
const materialKey = (reference: FileRef) => JSON.stringify([reference.repository, reference.path]);
function materialContents(materials: ConfirmationMaterials, reference: FileRef): string | null {
  const read = materials.get(materialKey(reference));
  if (!read) fail('确认材料未包含在本次读取中。');
  if (!read.ok) throw read.error;
  return read.contents;
}
function materialReferences(files: BoundFile[], snapshots: boolean): FileRef[] {
  return files.flatMap(file => snapshots ? [file, { repository: '.', path: file.snapshot }] : [file]);
}
async function fileText(context: ConfirmationEvaluation, reference: FileRef, materials = context.inputs.materials.get(context.workId)!): Promise<string> {
  const contents = materialContents(materials, reference);
  if (contents === null || !contents.trim()) fail(`确认依据缺失或为空：${reference.repository}/${reference.path}`);
  return contents;
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
  if (item.schemaVersion !== 4) throw Object.assign(new Error(`不支持确认记录版本 ${String(item.schemaVersion)}；仅支持版本 4。请使用 tiller work create 创建新工作并重新核对确认；旧文件保持原位。`), { code: 'UNSUPPORTED_RECORD_VERSION' });
  if (item.workId !== id || !Array.isArray(item.requests) || !Array.isArray(item.decisions)) fail('确认记录工作身份或请求/决定列表无效。');
  const requests: Request[] = item.requests.map(rawRequest => {
    const parsed = object(rawRequest, ['requestId', 'gate', 'scope', 'subjects', 'upstream', 'reviewSummary', 'openIssues', 'nextAction', 'exception', 'mergeBinding', 'checkpointBinding', 'exceptionBinding', 'deliveryBinding', 'deliveryExceptionRefs', 'createdAt', 'files', 'dependencies', 'exceptionFiles', 'workflowBinding', 'scopeBinding', 'operationBinding', 'documentBinding', 'externalUpstream', 'externalDependencies'], '已保存请求');
    const { createdAt, files, dependencies, exceptionFiles, externalDependencies, ...input } = parsed;
    if (!Array.isArray(externalDependencies) || externalDependencies.length > 128) fail('外部依赖记录须为有限数组。');
    if (!Array.isArray(dependencies)) fail('依赖记录格式无效。');
    return { ...requestInput(input), externalDependencies: externalDependencies.map(raw => {
      const dep = object(raw, ['workId', 'requestId', 'decisionId', 'requestFingerprint', 'decisionFingerprint'], '外部确认依赖');
      return { workId: identifier(dep.workId), requestId: identifier(dep.requestId), decisionId: identifier(dep.decisionId), requestFingerprint: sha(dep.requestFingerprint), decisionFingerprint: sha(dep.decisionFingerprint) };
    }), createdAt: date(createdAt, '创建时间'), files: boundFiles(files, id), exceptionFiles: boundFiles(exceptionFiles, id), dependencies: dependencies.map(rawDependency => {
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
  const requestIds = new Set(requests.map(req => req.requestId));
  if (requestIds.size !== requests.length || new Set(decisions.map(dec => dec.decisionId)).size !== decisions.length) fail('请求或决定标识重复。');
  for (const request of requests) assertBindingOwner(request, id);
  if (decisions.some(decision => !requestIds.has(decision.requestId))) fail('决定引用不存在的请求。');
  return { schemaVersion: 4, workId: id, requests, decisions };
}
async function capture(context: ConfirmationEvaluation, id: string, category: string, references: FileRef[]) {
  const files: BoundFile[] = [];
  const changes: FileChange[] = [];
  for (const [index, reference] of references.entries()) {
    const contents = await fileText(context, reference);
    const snapshot = `.tiller/work/${id}/reviews/${category}/${index}.json`;
    if (materialContents(context.inputs.materials.get(context.workId)!, { repository: '.', path: snapshot }) !== null) fail(`快照位置已经存在：${snapshot}`);
    files.push({ ...reference, sha256: digest(contents), snapshot });
    changes.push({ path: snapshot, before: null, after: json({ encoding: 'utf8', content: contents }) });
  }
  return { files, changes };
}
async function checkFiles(context: ConfirmationEvaluation, files: BoundFile[], checkSnapshots = true, materials?: ConfirmationMaterials): Promise<string[]> {
  materials ??= context.inputs.materials.get(context.workId)!;
  const issues: string[] = [];
  for (const file of files) {
    try {
      if (digest(await fileText(context, file, materials)) !== file.sha256) issues.push(`内容已变化，需要复核：${file.repository}/${file.path}`);
      if (checkSnapshots) {
        const snapshot = materialContents(materials, { repository: '.', path: file.snapshot });
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
async function checkSource(context: ConfirmationEvaluation, value: Source, files: BoundFile[], sourceReview: SourceReview | undefined, snapshots = true, materials?: ConfirmationMaterials): Promise<string[]> {
  materials ??= context.inputs.materials.get(context.workId)!;
  const issues = await checkFiles(context, files, snapshots, materials);
  if (!sameRefs(files, [value.reference, value.presentation])) issues.push('来源或展示依据与快照不匹配。');
  if (!sourceReview) issues.push('source-unverified：缺少实际来源及范围复核。');
  try {
    if (!(await fileText(context, value.reference, materials)).includes(value.quote)) issues.push('来源中未找到所记录的用户原话。');
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
  const owner = request.checkpointBinding?.ownerWorkId ?? request.exceptionBinding?.ownerWorkId ?? request.scopeBinding?.ownerWorkId ?? request.operationBinding?.ownerWorkId;
  if (owner !== undefined && owner !== workId) fail('检查点或例外必须登记在其 ownerWorkId 对应工作；关联工作不扩大授权范围。');
}
function coverage(request: RequestInput, upstream: Request[]): boolean {
  const needed = prerequisite(request.gate);
  if (request.gate === 'merge') return request.scope.repositories.every(repository => request.scope.targets.every(target => upstream.some(parent => parent.gate === needed && parent.scope.repositories.includes(repository) && parent.scope.targets.includes(target))));
  return needed === null || upstream.some(parent => parent.gate === needed && request.scope.repositories.every(repository => parent.scope.repositories.includes(repository)) && request.scope.targets.every(target => parent.scope.targets.includes(target)));
}
async function inspectWorkflowRequest(context: ConfirmationEvaluation, workId: string, request: RequestInput): Promise<void> {
  const policy = policyContext(context.inputs, workId);
  const { record, snapshot } = policy;
  if (request.workflowBinding.workflowDigest !== snapshot.digest || request.workflowBinding.intentDigest !== policy.intentDigest) fail('流程或工作意图绑定已变化。');
  if (policy.sourceIssues.length) fail(policy.sourceIssues.join('；'));
  const transition = request.gate === 'scope' && request.scopeBinding?.kind === 'workflow-transition';
  if (transition) {
    const metadata = context.inputs.metadata;
    if (request.scope.repositories.some(value => value !== '.' && !metadata.repositories.includes(value))) fail('转换确认包含未登记仓库。');
  } else if (!request.scope.repositories.every(value => record.scope.repositories.includes(value)) || !request.scope.targets.every(value => record.scope.targets.includes(value))) fail('确认未覆盖当前范围：请求超出工作意图范围。');
  const independent = ['scope', 'operation', 'checkpoint', 'exception', 'merge', 'release'].includes(request.gate)
    || (request.gate === 'acceptance' && !!(request.deliveryBinding || request.documentBinding));
  const stageId = request.workflowBinding.stageId;
  if (!stageId && !independent) fail('普通确认必须绑定实际流程阶段。');
  if (stageId) {
    const stage = snapshot.definition.stages.find(entry => entry.id === stageId);
    if (!stage || evaluateWorkflowCondition(stage.when, record.impact) !== 'applicable') fail('确认阶段不存在、不适用或条件未知。');
    if (!independent && !stage.confirmations.includes(request.gate as WorkflowConfirmation)) fail('确认节点不属于绑定阶段。');
    if (request.operationBinding && request.operationBinding.actions.some(action => !stage.actions.includes(action))) fail('操作动作超出绑定阶段。');
  }
  if (['requirements', 'design', 'planning'].includes(request.gate)) {
    const declared = snapshot.definition.outputs.filter(output => output.role === request.gate && output.producer === stageId);
    const artifacts = declared.map(output => record.artifacts[output.id]).filter(artifact => artifact !== undefined);
    if (!artifacts.length || !artifacts.every(artifact => request.subjects.some(subject => json(subject) === json(artifact.source)))) fail(`确认须绑定当前阶段已登记的 ${request.gate} 产物。`);
  }
  if (request.documentBinding && !Object.values(record.artifacts).some(artifact => json(artifact.source) === json(request.documentBinding!.document))) fail('文档验收须绑定已登记的实际产物。');
  if (request.operationBinding) {
    const required = request.operationBinding;
    const permitted = record.actionSources.filter(source => request.scope.repositories.every(value => source.scope.repositories.includes(value)) && request.scope.targets.every(value => source.scope.targets.includes(value)));
    if (required.actions.some(action => !permitted.some(source => source.actions.includes(action)))) fail('实际操作没有覆盖本范围的动作来源。');
    await fileText(context, required.recovery.reference);
  }
}
async function checkStageCoverage(context: ConfirmationEvaluation, workId: string, request: RequestInput, parents: Request[], external: readonly Request[] = []): Promise<void> {
  if (!request.workflowBinding.stageId || request.exception) return;
  const { record, snapshot } = policyContext(context.inputs, workId);
  const stages = new Map(snapshot.definition.stages.map(stage => [stage.id, stage]));
  const pending = [...stages.get(request.workflowBinding.stageId)!.dependsOn]; const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue; seen.add(id);
    const stage = stages.get(id)!; const state = evaluateWorkflowCondition(stage.when, record.impact);
    if (state === 'unresolved') fail('上游确认阶段条件未知。');
    if (state === 'applicable') for (const gate of stage.confirmations) {
      if (!parents.some(parent => parent.gate === gate && (external.includes(parent) || parent.workflowBinding.stageId === id) && request.scope.repositories.every(value => parent.scope.repositories.includes(value)) && request.scope.targets.every(value => parent.scope.targets.includes(value)))) fail(`缺少覆盖当前范围的流程上游 ${gate} 确认。`);
    }
    if (state !== 'applicable' || !stage.confirmations.length) pending.push(...stage.dependsOn);
  }
}
async function externalParents(context: ConfirmationEvaluation, workId: string, request: RequestInput, saved?: Request['externalDependencies']) {
  const references = request.externalUpstream ?? [];
  if (references.length > 128) fail('外部确认依赖超过限制。');
  if (saved && (saved.length !== references.length || references.some((value, index) => ['workId', 'requestId', 'decisionId'].some(key => value[key as keyof ConfirmationReference] !== saved[index]?.[key as keyof ConfirmationReference])))) fail('外部引用与已保存依赖不一致。');
  const parents: Request[] = []; const dependencies: Request['externalDependencies'] = [];
  if (!references.length) return { parents, dependencies };
  const policy = policyContext(context.inputs, workId);
  for (const reference of references) {
    if (reference.workId === workId) fail('同工作上游须使用 upstream，不能伪装跨工作引用。');
    const read = readLoadedConfirmation(context, reference);
    const parent = structuredClone(read.request) as Request;
    if (!['requirements', 'design'].includes(parent.gate) || !['requirements', 'design', 'planning'].includes(request.gate)) fail('跨工作仅可复用需求和设计内容依据，不能继承操作批准。');
    if (!read.check.confirmed || !request.scope.repositories.every(value => parent.scope.repositories.includes(value)) || !request.scope.targets.every(value => parent.scope.targets.includes(value))) fail('跨工作确认当前无效或范围未覆盖。');
    const outputs = policy.snapshot.definition.outputs.filter(output => output.role === parent.gate);
    const artifacts = outputs.map(output => policy.record.artifacts[output.id]).filter(artifact => artifact !== undefined);
    if (!artifacts.length) fail('目标工作缺少外部确认所对应的角色产物。');
    for (const artifact of artifacts) {
      const subject = parent.files.find(file => json({ repository: file.repository, path: file.path }) === json(artifact.source));
      if (!subject || digest(await fileText(context, artifact.source)) !== subject.sha256) fail('跨工作正文、稳定仓库或路径与目标角色产物不一致。');
    }
    const dependency = { ...reference, requestFingerprint: read.requestFingerprint, decisionFingerprint: read.decisionFingerprint };
    if (saved && json(saved[dependencies.length]) !== json(dependency)) fail('跨工作请求或决定指纹已变化。');
    dependencies.push(dependency); parents.push(parent);
  }
  return { parents, dependencies };
}
async function checkReuse(context: ConfirmationEvaluation, registry: Registry, request: Request, decision: DecisionInput, visited = new Set<string>()): Promise<string[]> {
  const reuse = decision.reuseOf;
  if (!reuse) return [];
  if (visited.has(reuse.decisionId) || reuse.requestId === request.requestId) return ['非语义复用不能形成循环或引用同一请求。'];
  const index = context.inputs.works.get(registry.workId)!.index;
  const previous = index.requests.get(reuse.requestId);
  const original = index.decisions.get(reuse.requestId);
  if (!previous || !original || original.decisionId !== reuse.decisionId || original.outcome !== 'approved' || !original.sourceReview) return ['非语义复用只能引用尚未被替代、拒绝或撤销且已复核来源的原批准。'];
  if (previous.gate !== request.gate || json(previous.scope) !== json(request.scope) || !sameRefs(previous.subjects, request.subjects)) return ['非语义复用必须保持节点、范围和对象身份一致。'];
  if (request.gate === 'merge' && json(previous.mergeBinding) !== json(request.mergeBinding)) return ['合入版本绑定变化必须重新取得用户确认，不能按非语义变化复用。'];
  if (json(previous.checkpointBinding) !== json(request.checkpointBinding) || json(previous.exceptionBinding) !== json(request.exceptionBinding)) return ['人工检查或例外绑定变化必须重新取得用户确认，不能按非语义变化复用。'];
  if (json(previous.deliveryBinding) !== json(request.deliveryBinding) || json(previous.deliveryExceptionRefs) !== json(request.deliveryExceptionRefs)) return ['整体交付对象或发布例外变化必须重新确认，不能按非语义变化复用。'];
  if (['workflowBinding', 'scopeBinding', 'operationBinding', 'documentBinding', 'externalUpstream', 'externalDependencies'].some(key => json(previous[key as keyof Request]) !== json(request[key as keyof Request]))) return ['流程、范围、操作或跨工作绑定变化必须重新确认，不能非语义复用。'];
  if (decision.source.kind !== original.source.kind || json(decision.source.reference) !== json(original.source.reference) || decision.source.quote !== original.source.quote || decision.decidedAt !== original.decidedAt) return ['复核须保留原用户来源、原话及决定时间，不能冒称新用户决定。'];
  const issues = await checkSource(context, original.source, original.files, original.sourceReview);
  try {
    if (await fileText(context, { repository: '.', path: presentationPath(registry.workId, previous.requestId) }) !== presentation(previous)) issues.push('原展示内容已变化，不能继承决定。');
    // Old subjects may have changed; their preserved snapshots must still match the original decision.
    for (const bound of previous.files) {
      const snapshot = materialContents(context.inputs.materials.get(context.workId)!, { repository: '.', path: bound.snapshot });
      if (snapshot === null) fail('原审阅快照缺失。');
      const stored = object(JSON.parse(snapshot) as unknown, ['encoding', 'content'], '原快照');
      if (stored.encoding !== 'utf8' || typeof stored.content !== 'string' || digest(stored.content) !== bound.sha256) fail('原审阅快照已变化。');
    }
  } catch (error) { issues.push((error as Error).message); }
  for (const dependency of previous.dependencies) {
    const parent = index.requests.get(dependency.requestId);
    if (!parent) { issues.push('原批准上游缺失。'); continue; }
    const current = await evaluate(context, registry, parent);
    if (!current.confirmed || current.decisionId !== dependency.decisionId || fingerprint(parent) !== dependency.fingerprint) issues.push('原批准上游已变化，不能作为非语义复用依据。');
  }
  if (previous.exception) issues.push(...await checkSource(context, previous.exception.source, previous.exceptionFiles, previous.exception.sourceReview));
  issues.push(...await withConfirmationVisit(context.inputs.root, registry.workId, previous.requestId, () => checkReuse(context, registry, previous, original, new Set(visited).add(reuse.decisionId))));
  try { await inspectWorkflowRequest(context, registry.workId, previous); await externalParents(context, registry.workId, previous, previous.externalDependencies); } catch (error) { issues.push((error as Error).message); }
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
async function inspectRequestDelivery(context: ConfirmationEvaluation, registry: Registry, request: Request, checkAcceptance: boolean) {
  const root = context.inputs.root;
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
      for (const parent of matching) if ((await evaluate(context, registry, parent)).confirmed) accepted = true;
      if (!accepted) fail('发布引用的同对象整体验收当前无效。');
    }
  } else if (!inspected.current.operationAllowed) fail('整体验收对象当前未满足交付门禁，且没有覆盖缺口的有效例外。');
  return inspected.current;
}
function evaluate(context: ConfirmationEvaluation, registry: Registry, request: Request): Promise<GateResult> {
  const result = context.results.get(nodeKey(registry.workId, request.requestId));
  if (!result) fail('确认依赖尚未按图求值。');
  return Promise.resolve(result);
}
async function evaluateInputs(inputs: ConfirmationInputs, currentBinding?: MergeBinding): Promise<ConfirmationEvaluation> {
  const context: ConfirmationEvaluation = { inputs, workId: inputs.works.keys().next().value!, results: new Map() };
  const failed = (request: Request, issue: string): GateResult => ({ requestId: request.requestId, gate: request.gate,
    status: 'needs-review', confirmed: false, issues: [issue], sourceVerification: 'not-independently-verified', automaticTransition: false });
  for (const { workId, request } of inputs.order) if (inputs.cycles.has(nodeKey(workId, request.requestId)))
    context.results.set(nodeKey(workId, request.requestId), failed(request, '确认依赖形成循环。'));
  for (const { workId, request } of inputs.order) {
    const key = nodeKey(workId, request.requestId);
    if (inputs.cycles.has(key)) continue;
    const registry = inputs.works.get(workId)!.registry;
    if (!inputs.works.get(workId)!.index.requests.has(request.requestId)) continue;
    try {
      context.results.set(key, await withConfirmationVisit(inputs.root, workId, request.requestId,
        () => withDeliveryLocation(inputs.works.get(workId)!.root, workId, () => evaluateWithin({ ...context, workId }, registry, request, currentBinding))));
    } catch (error) { context.results.set(key, failed(request, (error as Error).message)); }
  }
  return context;
}
function readLoadedConfirmation(context: ConfirmationEvaluation, reference: ConfirmationReference): ReadonlyConfirmation<ConfirmationRead> {
  const work = context.inputs.works.get(reference.workId);
  const request = work?.index.requests.get(reference.requestId);
  if (!work || !request) fail(`确认请求不存在：${reference.workId}/${reference.requestId}`);
  const decision = work.index.decisions.get(reference.requestId);
  if (!decision || decision.decisionId !== reference.decisionId) fail('确认引用未指向该请求的当前决定；不能继承未知或已被替代的批准。');
  const checked = context.results.get(nodeKey(reference.workId, reference.requestId));
  if (!checked) fail('外部确认依赖尚未按图求值。');
  const check: GateCheck = { ...checked, gateStatus: checked.status, recordValid: true, blockingReasons: checked.issues, enforcementScope: 'tiller-cli-only', limitation };
  return freezeConfirmation(structuredClone({ reference, request, decision, check, requestFingerprint: fingerprint(request), decisionFingerprint: digest(json(decision)) }));
}
async function evaluateWithin(context: ConfirmationEvaluation, registry: Registry, request: Request, currentBinding?: MergeBinding): Promise<GateResult> {
  const result: GateResult = { requestId: request.requestId, gate: request.gate, status: 'pending', confirmed: false, issues: [], sourceVerification: 'not-independently-verified', automaticTransition: false };
  try { await inspectWorkflowRequest(context, registry.workId, request); } catch (error) { result.issues.push((error as Error).message); }
  if (request.gate === 'merge') {
    if (!currentBinding) result.issues.push('合入执行前须提供当前平台及依赖版本，使用 checkMergeGate 核对。');
    else if (json(request.mergeBinding) !== json(currentBinding)) result.issues.push('合入版本绑定已变化（资料、评审、源、目标、依赖或检查），必须重新展示并确认。');
    if (request.openIssues.length) result.issues.push('合入请求仍有未解决事项。');
  }
  const index = context.inputs.works.get(registry.workId)!.index;
  const decision = index.decisions.get(request.requestId);
  const display = { repository: '.', path: presentationPath(registry.workId, request.requestId) };
  const materials = context.inputs.materials.get(context.workId)!;
  result.issues.push(...await checkFiles(context, request.files, true, materials));
  try {
    const presented = await fileText(context, display, materials);
    if (presented !== presentation(request)) result.issues.push('请求展示文件已变化或与审阅对象不匹配。');
  } catch (error) { result.issues.push((error as Error).message); }
  if (!sameRefs(request.files, request.subjects)) result.issues.push('审阅对象与快照不匹配。');
  if (request.subjects.some(subject => !request.scope.repositories.includes(subject.repository))) result.issues.push('审阅对象超出请求仓库范围。');
  if (request.upstream.length !== request.dependencies.length || request.upstream.some((value, i) => request.dependencies[i]?.requestId !== value)) result.issues.push('上游请求与绑定的依赖不匹配。');
  const upstream: Request[] = [];
  for (const dependency of request.dependencies) {
    const parent = index.requests.get(dependency.requestId);
    if (!parent) { result.issues.push(`上游请求缺失：${dependency.requestId}`); continue; }
    upstream.push(parent);
    const checked = await evaluate(context, registry, parent);
    if (fingerprint(parent) !== dependency.fingerprint || !checked.confirmed || checked.decisionId !== dependency.decisionId) result.issues.push(`上游确认已失效或需复核：${dependency.requestId}`);
  }
  const external: Request[] = [];
  try { external.push(...(await externalParents(context, registry.workId, request, request.externalDependencies)).parents); upstream.push(...external); }
  catch (error) { result.issues.push((error as Error).message); }
  try { await checkStageCoverage(context, registry.workId, request, upstream, external); } catch (error) { result.issues.push((error as Error).message); }
  if (!coverage(request, upstream) && !request.exception) result.issues.push(`缺少覆盖当前范围的 ${prerequisite(request.gate)} 确认。`);
  if (request.exception) result.issues.push(...await checkSource(context, request.exception.source, request.exceptionFiles, request.exception.sourceReview, true, materials));
  else if (request.exceptionFiles.length) result.issues.push('存在无对应例外的来源绑定。');
  if (!decision) {
    if (result.issues.length) result.status = 'needs-review';
    else result.issues.push('等待用户确认。');
    return result;
  }
  result.decisionId = decision.decisionId;
  if (decision.source.presentation.repository !== '.' || decision.source.presentation.path !== presentationPath(registry.workId, request.requestId)) result.issues.push('决定未绑定本请求的具体展示文件。');
  result.issues.push(...await checkSource(context, decision.source, decision.files, decision.sourceReview, true, materials));
  result.issues.push(...await checkReuse(context, registry, request, decision));
  let deliveryReady: boolean | undefined;
  if (decision.outcome === 'approved' && request.deliveryBinding) {
    try { deliveryReady = (await inspectRequestDelivery(context, registry, request, false)).technicalReady; }
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

function selectedRequest(registry: Registry, requestId: string): Request {
  const request = registry.requests.find(item => item.requestId === identifier(requestId));
  if (!request) fail(`确认请求不存在：${requestId}`);
  return request;
}
function gateCheck(checked: GateResult): GateCheck {
  return { ...checked, gateStatus: checked.status, recordValid: true, blockingReasons: checked.issues, enforcementScope: 'tiller-cli-only', limitation };
}
async function queryConfirmations<T>(rootInput: string, id: string, select: (registry: Registry) => Request[],
  result: (context: ConfirmationEvaluation, work: ConfirmationWorkInput) => T | Promise<T>, binding?: MergeBinding, policyOverride?: TransitionInput, references: ConfirmationReference[] = []): Promise<T> {
  const root = await resolveWorkRoot(rootInput, id);
  return withDeliveryLocation(root, id, async () => {
    const inputs = await loadConfirmationInputs(root, id, select, [], policyOverride, true, references);
    const context = await evaluateInputs(inputs, binding);
    try { await verifyConfirmationInputs(inputs); }
    catch (error) {
      if (!context.results.size) throw error;
      for (const [key, checked] of context.results) context.results.set(key, { ...checked, status: 'needs-review', confirmed: false,
        issues: [...checked.issues, (error as Error).message] });
    }
    return result(context, inputs.works.get(id)!);
  });
}
function snapshotReferences(id: string, category: string, count: number): FileRef[] {
  return Array.from({ length: count }, (_, index) => ({ repository: '.', path: `.tiller/work/${id}/reviews/${category}/${index}.json` }));
}
function seedRequest(input: RequestInput): Request {
  return { ...input, createdAt: new Date().toISOString(), files: [], dependencies: [], exceptionFiles: [], externalDependencies: [] };
}
async function evaluateSaved(root: string, id: string, requestId: string): Promise<GateResult> {
  return queryConfirmations(root, id, registry => [selectedRequest(registry, requestId)],
    (context, work) => evaluate(context, work.registry, selectedRequest(work.registry, requestId)));
}

export async function requestConfirmation(rootInput: string, id: string, input: unknown) {
  const root = await resolveWorkRoot(rootInput, id);
  const request = requestInput(input);
  assertBindingOwner(request, id);
  return withProjectLock(root, () => withDeliveryLocation(root, id, async () => {
    const displayPath = presentationPath(id, request.requestId);
    const exceptionReferences = request.exception ? [request.exception.source.reference, request.exception.source.presentation] : [];
    const inputs = await loadConfirmationInputs(root, id,
      registry => [registry.requests.find(item => item.requestId === request.requestId) ?? seedRequest(request)],
      [...request.subjects, ...exceptionReferences, { repository: '.', path: displayPath },
        ...snapshotReferences(id, `request-${request.requestId}`, request.subjects.length),
        ...snapshotReferences(id, `exception-${request.requestId}`, exceptionReferences.length)]);
    const context = await evaluateInputs(inputs);
    const data = inputs.works.get(id)!;
    const existing = data.index.requests.get(request.requestId);
    if (existing) {
      const { createdAt: _createdAt, files: _files, dependencies: _dependencies, exceptionFiles: _exceptionFiles, externalDependencies: _externalDependencies, ...original } = existing;
      if (json(original) !== json(request)) fail('相同请求标识已用于不同内容。');
      await verifyConfirmationInputs(inputs);
      return { changed: false, ...await evaluate(context, data.registry, existing), presentation: displayPath, limitation };
    }
    if (request.scope.repositories.some(repository => repository !== '.' && !inputs.metadata.repositories.includes(repository))) fail('范围含未登记仓库。');
    if (request.mergeBinding?.repositories.some(repository => repository.dependencies.some(dependency => dependency.repository !== '.' && !inputs.metadata.repositories.includes(dependency.repository)))) fail('合入版本依赖含未登记仓库。');
    if (request.subjects.some(subject => !request.scope.repositories.includes(subject.repository))) fail('审阅对象必须位于请求声明的仓库范围内。');
    await inspectWorkflowRequest(context, id, request);
    const external = await externalParents(context, id, request);
    const parents: Request[] = [...external.parents];
    const dependencies: Request['dependencies'] = [];
    for (const upstream of request.upstream) {
      const parent = data.index.requests.get(upstream);
      if (!parent) fail(`上游请求不存在：${upstream}`);
      const checked = await evaluate(context, data.registry, parent);
      if (!checked.confirmed || !checked.decisionId) fail(`上游确认未满足：${upstream}；${checked.issues.join('；')}`);
      parents.push(parent);
      dependencies.push({ requestId: upstream, fingerprint: fingerprint(parent), decisionId: checked.decisionId });
    }
    await checkStageCoverage(context, id, request, parents, external.parents);
    if (!coverage(request, parents) && !request.exception) fail(`缺少覆盖当前范围的 ${prerequisite(request.gate)} 确认；不得自行省略。`);
    const captured = await capture(context, id, `request-${request.requestId}`, request.subjects);
    const exceptionCapture = request.exception ? await capture(context, id, `exception-${request.requestId}`, exceptionReferences) : { files: [], changes: [] };
    if (request.exception) {
      const issues = await checkSource(context, request.exception.source, exceptionCapture.files, request.exception.sourceReview, false);
      if (issues.length) fail(issues.join('；'));
    }
    const saved: Request = { ...request, createdAt: new Date().toISOString(), files: captured.files, dependencies,
      externalDependencies: external.dependencies, exceptionFiles: exceptionCapture.files };
    if (materialContents(inputs.materials.get(id)!, { repository: '.', path: displayPath }) !== null) fail('请求展示文件已经存在。');
    await verifyConfirmationInputs(inputs, true);
    data.registry.requests.push(saved);
    await applyChanges(root, [...captured.changes, ...exceptionCapture.changes,
      { path: displayPath, before: null, after: presentation(saved) }, { path: data.location, before: data.original, after: json(data.registry) }]);
    return { changed: true, ...await evaluateSaved(root, id, saved.requestId), presentation: displayPath, limitation };
  }));
}

export async function recordDecision(rootInput: string, id: string, input: unknown) {
  const root = await resolveWorkRoot(rootInput, id);
  const decision = decisionInput(input);
  return withProjectLock(root, () => withDeliveryLocation(root, id, async () => {
    const approving = decision.outcome === 'approved' || decision.outcome === 'conditional';
    const inputs = await loadConfirmationInputs(root, id, registry => [selectedRequest(registry, decision.requestId),
      ...(decision.reuseOf ? [selectedRequest(registry, decision.reuseOf.requestId)] : [])],
      [decision.source.reference, decision.source.presentation, ...snapshotReferences(id, `decision-${decision.decisionId}`, 2)], undefined, approving);
    const context = await evaluateInputs(inputs);
    const data = inputs.works.get(id)!;
    const request = selectedRequest(data.registry, decision.requestId);
    if (decision.source.presentation.repository !== '.' || decision.source.presentation.path !== presentationPath(id, request.requestId)) fail('决定须引用本请求生成的展示文件。');
    const existing = data.registry.decisions.find(item => item.decisionId === decision.decisionId);
    if (existing) {
      const { recordedAt: _recordedAt, files: _files, ...original } = existing;
      if (json(original) !== json(decision)) fail('相同决定标识已用于不同内容。');
      await verifyConfirmationInputs(inputs);
      return { changed: false, ...await evaluateSaved(root, id, request.requestId), limitation };
    }
    if (approving) {
      const reuseIssues = await checkReuse(context, data.registry, request, decision);
      if (reuseIssues.length) fail(reuseIssues.join('；'));
      const issues = await checkFiles(context, request.files);
      if (issues.length) fail(issues.join('；'));
    }
    const captured = await capture(context, id, `decision-${decision.decisionId}`, [decision.source.reference, decision.source.presentation]);
    const saved: Decision = { ...decision, recordedAt: new Date().toISOString(), files: captured.files };
    const issues = await checkSource(context, decision.source, captured.files, decision.sourceReview, false);
    if (issues.some(issue => !issue.startsWith('source-unverified'))) fail(issues.join('；'));
    if (approving) {
      await inspectWorkflowRequest(context, id, request);
      await externalParents(context, id, request, request.externalDependencies);
    }
    if (decision.outcome === 'approved' && request.deliveryBinding) await inspectRequestDelivery(context, data.registry, request, true);
    await verifyConfirmationInputs(inputs, true);
    data.registry.decisions.push(saved);
    await applyChanges(root, [...captured.changes, { path: data.location, before: data.original, after: json(data.registry) }]);
    return { changed: true, ...await evaluateSaved(root, id, request.requestId), limitation };
  }));
}

export async function checkGate(rootInput: string, id: string, requestId: string): Promise<GateCheck> {
  return queryConfirmations(rootInput, id, registry => [selectedRequest(registry, requestId)],
    async (context, work) => gateCheck(await evaluate(context, work.registry, selectedRequest(work.registry, requestId))));
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
/** Explicit batch facts. The caller owns the independent observation boundary. */
export interface ConfirmationReadBatch {
  root: string;
  references: readonly ConfirmationReference[];
  reads: readonly ReadonlyConfirmation<ConfirmationRead>[];
  available: readonly ReadonlyConfirmation<ConfirmationRead>[];
  errors: readonly {reference: ConfirmationReference; message: string}[];
  inputs: ConfirmationInputs | null;
}
/** Declare eligibility paths only. The graph owner must independently prove this batch before committing. */
export function confirmationSharingInput(batch: ConfirmationReadBatch, references: readonly ConfirmationReference[]): SharedWriteProof[] {
  if (references.length > CONFIRMATION_LIMITS.nodes) fail('确认引用超过有界核验限制。');
  const known = new Set([...batch.references, ...batch.available.map(read => read.reference)].map(json));
  for (const raw of references) {
    const value = object(raw, ['workId', 'requestId', 'decisionId'], '确认引用');
    const ref = {workId: identifier(value.workId), requestId: identifier(value.requestId), decisionId: identifier(value.decisionId)};
    if (!known.has(json(ref))) fail('确认共享路径未包含在已声明批次中。');
  }
  if (!batch.inputs && references.length) fail('确认共享输入缺少声明材料。');
  return batch.inputs ? confirmationSharingPaths(batch.inputs) : [];
}
export async function loadConfirmationReadBatch(rootInput: string, references: readonly ConfirmationReference[], owner?: WorkflowPolicyContext): Promise<ConfirmationReadBatch> {
  if (references.length > CONFIRMATION_LIMITS.nodes) fail('确认引用超过有界核验限制。');
  if (!references.length) return {root: rootInput, references: [], reads: [], available: [], errors: [], inputs: null};
  const selected = [...new Map(references.map(input => {
    const item = object(input, ['workId', 'requestId', 'decisionId'], '确认引用');
    const reference = {workId: identifier(item.workId), requestId: identifier(item.requestId), decisionId: identifier(item.decisionId)};
    return [json(reference), reference] as const;
  })).values()];
  const id = selected[0]!.workId;
  const root = await resolveWorkRoot(rootInput, id);
  return withDeliveryLocation(root, id, async () => {
    const inputs = await loadConfirmationInputs(root, id,
      registry => registry.requests.filter(request => selected.some(ref => ref.workId === id && ref.requestId === request.requestId)),
      [], undefined, true, selected.filter(ref => ref.workId !== id), owner?.root === root ? owner : undefined);
    const context = await evaluateInputs(inputs);
    const reads: ReadonlyConfirmation<ConfirmationRead>[] = [];
    const errors: {reference: ConfirmationReference; message: string}[] = [];
    for (const reference of selected) {
      try { reads.push(readLoadedConfirmation(context, reference)); }
      catch (error) { errors.push({reference, message: (error as Error).message}); }
    }
    const available: ReadonlyConfirmation<ConfirmationRead>[] = [];
    for (const {workId, request} of inputs.order) {
      const decision = inputs.works.get(workId)!.index.decisions.get(request.requestId);
      if (decision) available.push(readLoadedConfirmation(context, {workId, requestId: request.requestId, decisionId: decision.decisionId}));
    }
    return {root, references: selected, reads, available, errors, inputs};
  });
}
export async function assertConfirmationReadBatchCurrent(batch: ConfirmationReadBatch, proofs?: import('./files.js').TextProof[]): Promise<void> {
  if (!batch.inputs) return;
  // Delivery approvals also depend on a live technical object. Recheck it before
  // proving the request/source bytes so revocation during that I/O is detected.
  if (batch.inputs.order.some(node => node.request.deliveryBinding)) {
    const current = await evaluateInputs(batch.inputs);
    for (const previous of batch.reads) {
      const actual = readLoadedConfirmation(current, previous.reference);
      if (json(actual.check) !== json(previous.check)) fail('确认绑定的交付对象在读取后变化。');
    }
  }
  await verifyConfirmationInputs(batch.inputs, false, proofs);
}

/** Independent explicit read: returned data never grants scope or survives as an approval context. */
export async function readConfirmations(rootInput: string, inputs: ConfirmationReference[]): Promise<ReadonlyConfirmation<ConfirmationRead>[]> {
  if (!Array.isArray(inputs) || inputs.length > CONFIRMATION_LIMITS.nodes) fail('确认引用超过有界核验限制。');
  if (!inputs.length) return [];
  const references = inputs.map(input => {
    const item = object(input, ['workId', 'requestId', 'decisionId'], '确认引用');
    return { workId: identifier(item.workId), requestId: identifier(item.requestId), decisionId: identifier(item.decisionId) };
  });
  const id = references[0]!.workId;
  return queryConfirmations(rootInput, id,
    registry => references.filter(reference => reference.workId === id).map(reference => selectedRequest(registry, reference.requestId)),
    context => references.map(reference => readLoadedConfirmation(context, reference)), undefined, undefined,
    references.filter(reference => reference.workId !== id));
}
export async function readConfirmation(rootInput: string, input: ConfirmationReference): Promise<ReadonlyConfirmation<ConfirmationRead>> {
  return (await readConfirmations(rootInput, [input]))[0]!;
}

/** Read the declared approval closure once, including the exact decisions bound by its edges. */
export async function readConfirmationDependencyGraph(rootInput: string, references: readonly ConfirmationReference[]): Promise<ReadonlyConfirmation<ConfirmationRead>[]> {
  if (!Array.isArray(references) || references.length > CONFIRMATION_LIMITS.nodes) fail('确认引用超过有界核验限制。');
  if (!references.length) return [];
  const selected = references.map(input => {
    const item = object(input, ['workId', 'requestId', 'decisionId'], '确认引用');
    return {workId: identifier(item.workId), requestId: identifier(item.requestId), decisionId: identifier(item.decisionId)};
  });
  const id = selected[0]!.workId;
  return queryConfirmations(rootInput, id,
    registry => selected.filter(ref => ref.workId === id).map(ref => selectedRequest(registry, ref.requestId)), context => {
  const pending = [...selected];
  const found = new Map<string, ReadonlyConfirmation<ConfirmationRead>>();
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const reference = pending[cursor]!;
    const key = json(reference);
    if (found.has(key)) continue;
    if (found.size >= CONFIRMATION_LIMITS.nodes) fail('确认引用超过有界核验限制。');
    const value = readLoadedConfirmation(context, reference);
    found.set(key, value);
    pending.push(...value.request.dependencies.map(dependency => ({workId: reference.workId, requestId: dependency.requestId, decisionId: dependency.decisionId})),
      ...value.request.externalDependencies);
    if (value.decision.reuseOf) pending.push({workId: reference.workId,
      requestId: value.decision.reuseOf.requestId, decisionId: value.decision.reuseOf.decisionId});
  }
  return [...found.values()];
  }, undefined, undefined, selected.filter(ref => ref.workId !== id));
}

/** Explicit registration boundary: inspect sharing of the complete declared approval graph. */
export async function assertConfirmationSharing(rootInput: string, inputs: readonly ConfirmationReference[], sharing?: SharedWriteProof[], batch?: ConfirmationReadBatch): Promise<void> {
  if (!Array.isArray(inputs) || inputs.length > CONFIRMATION_LIMITS.nodes) fail('确认引用超过有界核验限制。');
  if (!inputs.length) return;
  const references = inputs.map(input => {
    const item = object(input, ['workId', 'requestId', 'decisionId'], '确认引用');
    return { workId: identifier(item.workId), requestId: identifier(item.requestId), decisionId: identifier(item.decisionId) };
  });
  const id = references[0]!.workId;
  const root = await resolveWorkRoot(rootInput, id);
  await withDeliveryLocation(root, id, async () => {
    if (batch?.inputs && batch.root === root && references.every(ref => [...batch.references, ...batch.available.map(read => read.reference)].some(known => json(known) === json(ref)))) {
      await verifyConfirmationInputs(batch.inputs, true, undefined, sharing);
      return;
    }
    const loaded = await loadConfirmationInputs(root, id,
      registry => references.filter(ref => ref.workId === id).map(ref => selectedRequest(registry, ref.requestId)),
      [], undefined, true, references.filter(ref => ref.workId !== id));
    await verifyConfirmationInputs(loaded, true, undefined, sharing);
  });
}

/** A committed transition may inspect its exact prior intent; this is explicit input, not ambient state. */
export async function readWorkflowTransitionApprovals(rootInput: string, workId: string, input: {
  changeDigest: string; scope: Scope; references: ConfirmationReference[];
  previous?: { raw: string; sha256: string; expectedCurrentHash: string; operationId: string };
}) {
  const root = await resolveWorkRoot(rootInput, workId);
  let policyOverride: TransitionInput | undefined;
  if (input.previous) {
    const prior = input.previous;
    if (digest(prior.raw) !== prior.sha256) fail('转换前记录摘要不一致。');
    const record = parseWorkflowWorkRecord(JSON.parse(prior.raw), workId);
    const [observed] = await readTextInputs(root, [`.tiller/work/${workId}/record.json`], { maxBytes: WORKFLOW_WORK_LIMITS.recordBytes });
    const currentRaw = observed!.text;
    if (currentRaw === null || digest(currentRaw) !== prior.expectedCurrentHash) fail('转换写后记录已变化。');
    const current = parseWorkflowWorkRecord(JSON.parse(currentRaw), workId);
    const change = current.operations.at(-1);
    if (current.revision !== record.revision + 1 || current.workflowRevision !== current.revision
      || change?.operationId !== prior.operationId || change.kind !== 'workflow-change' || change.changeDigest !== input.changeDigest
      || json(current.operations.slice(0, -1)) !== json(record.operations)) fail('转换写后修订不是所批准的变更。');
    // The loader validates this immutable record and reads its snapshot and sources normally.
    policyOverride = { record, currentHash: prior.expectedCurrentHash };
  }
  return queryConfirmations(root, workId, registry => input.references.map(reference => selectedRequest(registry, reference.requestId)), context => {
    const bindings = [];
    for (const reference of input.references) {
      const approval = readLoadedConfirmation(context, reference);
      const binding = approval.request.scopeBinding;
      if (reference.workId !== workId || !approval.check.confirmed || approval.request.gate !== 'scope'
        || binding?.kind !== 'workflow-transition' || binding.ownerWorkId !== workId || binding.changeDigest !== input.changeDigest)
        fail('转换须引用当前有效且精确绑定变更的 scope 批准。');
      if (!input.scope.repositories.every(value => approval.request.scope.repositories.includes(value))
        || !input.scope.targets.every(value => approval.request.scope.targets.includes(value))) fail('转换批准未覆盖变更前后的完整范围。');
      bindings.push({ reference, requestFingerprint: approval.requestFingerprint, decisionFingerprint: approval.decisionFingerprint });
    }
    return bindings;
  }, undefined, policyOverride);
}

export async function checkMergeGate(rootInput: string, id: string, requestId: string, currentBinding: unknown): Promise<GateCheck> {
  const binding = mergeBinding(currentBinding);
  return queryConfirmations(rootInput, id, registry => [selectedRequest(registry, requestId)], async (context, work) => {
    const request = selectedRequest(work.registry, requestId);
    if (request.gate !== 'merge') fail('合入须引用独立的 merge 确认，不能使用设计或验收替代。');
    return gateCheck(await evaluate(context, work.registry, request));
  }, binding);
}
export async function inspectConfirmations(rootInput: string, id: string) {
  return queryConfirmations(rootInput, id, registry => registry.requests, (context, work) => ({
    requests: work.registry.requests.map(request => context.results.get(nodeKey(id, request.requestId))!), automaticTransition: false as const, limitation,
  }));
}
export async function inspectDeliveryAcceptance(rootInput: string, workId: string, basisDigest: string) {
  if (!/^[a-f0-9]{64}$/u.test(basisDigest)) fail('整体交付摘要须为 SHA-256。');
  const selected = (registry: Registry) => registry.requests.filter(candidate => candidate.gate === 'acceptance'
    && candidate.deliveryBinding?.deliveryBasisDigest === basisDigest).slice(-1);
  return queryConfirmations(rootInput, workId, selected, async (context, work) => {
    const request = selected(work.registry)[0];
    if (!request) return { status: 'not-requested' as const, basisDigest, confirmed: false, issues: [] as string[] };
    const checked = await evaluate(context, work.registry, request);
    const status = checked.confirmed ? checked.deliveryStatus!
      : checked.status === 'rejected' || checked.status === 'invalidated' ? 'rejected' as const
      : checked.status === 'needs-review' ? 'stale' as const : 'pending' as const;
    return { status, basisDigest, confirmed: checked.confirmed, requestId: request.requestId,
      ...(checked.decisionId ? { decisionId: checked.decisionId } : {}), deliveryBinding: request.deliveryBinding!, issues: checked.issues };
  });
}
/** Caller holds the lock when using this result to save a completion. */
export async function assertAcceptance(rootInput: string, id: string, requestId: string, documentPath: string | FileRef, evidencePath: string) {
  return queryConfirmations(rootInput, id, registry => [selectedRequest(registry, requestId)], async (context, work) => {
    const request = selectedRequest(work.registry, requestId);
    if (request.gate !== 'acceptance') fail('完成必须绑定对应的交付验收请求。');
    const document = typeof documentPath === 'string' ? { repository: '.', path: documentPath } : ref(documentPath);
    if (!request.documentBinding || json(request.documentBinding) !== json({ document, evidence: { repository: '.', path: evidencePath } })) fail('文档验收对象与本次文档及证据不一致。');
    if (![document, { repository: '.', path: evidencePath }].every(location => request.files.some(file => file.repository === location.repository && file.path === location.path))) fail('验收请求必须同时绑定本次文档和验证证据。');
    const checked = await evaluate(context, work.registry, request);
    if (!checked.confirmed || !checked.decisionId || checked.confirmationBasis !== 'reported-review') fail(`验收尚未满足：${checked.issues.join('；')}`);
    const decision = work.registry.decisions.find(item => item.decisionId === checked.decisionId);
    if (!decision) fail('验收决定不存在。');
    return { requestId, decisionId: checked.decisionId, confirmationBasis: 'reported-review' as const,
      requestFingerprint: fingerprint(request), decisionFingerprint: digest(json(decision)) };
  });
}
