import { createHash } from 'node:crypto';
import { readProjectMetadata } from './core.js';
import { applyChanges, hasPendingTransaction, readTextIfExists, validateRelativePath, withProjectLock, assertSafePaths, readTextInputs, verifyTextInputs } from './files.js';
import { resolveRepositoryRootsFromMetadata, resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { repositoryPath } from './repository-paths.js';
import { readConfirmations, assertConfirmationSharing, loadConfirmationReadBatch, assertConfirmationReadBatchCurrent } from './confirmations.js';
import { assertSharedRegistrationReferences } from './workflow-work.js';
import type { ConfirmationReference, ConfirmationRead, ReadonlyConfirmation, ConfirmationReadBatch, FileRef, Scope } from './confirmations.js';
import { loadWorkRecord, parseWorkRecord, validateWorkId, validateWorkScope } from './work.js';
import { parseVerificationSelection } from './verification-selection.js';
import type { VerificationSelection } from './verification-selection.js';
import type { FileChange, ProjectMetadata } from './types.js';
import type { TextProof, TextReadInput } from './files.js';
import type { WorkflowPolicyContext } from './workflow-policy.js';
import {proveRepositoryInput} from './repository-input.js';
import type {RepositoryInput} from './repository-input.js';
import type { HumanCheckpoint, PlanningActivationInput, PlanningArtifact, PlanningBoundFile, PlanningChanges, PlanningDefinition, PlanningReceipt, PlanningRegistrationInput, PlanningState, PlanningTask, RegisteredPlanning } from './planning-types.js';
import { parseTaskEvent, parseTaskReceipt, validateTaskHistory } from './task-records.js';
export type * from './planning-types.js';

function fail(message: string, code = 'INVALID_PLANNING'): never { throw Object.assign(new Error(message), { code }); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('规划输入必须是对象。');
  if (Object.keys(value).some(key => !keys.includes(key))) fail('规划包含未知字段。');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000 || /[\x00-\x08]/u.test(value)) fail('规划文本必须非空且在长度限制内。');
  return value;
}
function id(value: unknown): string { const result = text(value); validateWorkId(result); if (['constructor', '__proto__', 'prototype'].includes(result)) fail('不支持的保留标识。'); return result; }
function symbol(value: unknown): string {
  const result = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(result) || ['constructor', '__proto__', 'prototype'].includes(result.toLowerCase())) fail('需求、产物或条件标识无效。');
  return result;
}
function list<T>(value: unknown, parse: (item: unknown) => T, nonempty = false): T[] {
  if (!Array.isArray(value) || value.length > 1000 || (nonempty && !value.length)) fail('规划数组不能为空（必要项）或超过 1000 项。');
  return value.map(item => parse(item));
}
function unique<T>(values: T[], key: (value: T) => string, label: string): T[] {
  if (new Set(values.map(value => key(value).toLowerCase())).size !== values.length) fail(`${label}不能重复（含大小写别名）。`);
  return values;
}
function strings(value: unknown, nonempty = false): string[] { return unique(list(value, text, nonempty), item => item, '列表'); }
function ids(value: unknown, nonempty = false): string[] { return strings(value, nonempty).map(symbol); }
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('expectedRevision/序号必须是非负整数。');
  return Number(value);
}
import { planningDigest } from './planning-data.js';
export { planningDigest, canonicalPlanning } from './planning-data.js';
const digest = planningDigest;
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function hashText(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function key(reference: FileRef): string { return `${reference.repository}::${reference.path}`; }
function covered(scope: Scope, parent: Scope): boolean { return scope.repositories.every(repo => parent.repositories.includes(repo)) && scope.targets.every(target => parent.targets.includes(target)); }
function reference(value: unknown): FileRef {
  const item = object(value, ['repository', 'path']); const repository = text(item.repository); const path = text(item.path);
  if (repository !== '.') validateRelativePath(repository);
  validateRelativePath(path);
  const parts = path.toLowerCase().split('/');
  if (parts.includes('.git') || parts.includes('node_modules') || parts.some((part, index) => part === '.tiller' && parts[index + 1] === 'local')) fail('规划引用不能使用 Git、依赖内部或本机资料。');
  return { repository, path };
}
function references(value: unknown, nonempty = false): FileRef[] { return unique(list(value, reference, nonempty), ref => key(ref).toLowerCase(), '文件引用'); }
function confirmation(value: unknown): ConfirmationReference {
  const item = object(value, ['workId', 'requestId', 'decisionId']);
  return { workId: id(item.workId), requestId: id(item.requestId), decisionId: id(item.decisionId) };
}
function artifact(value: unknown): PlanningArtifact {
  const raw = object(value, ['id', 'purpose', 'required', 'optionalReason', 'checks', 'type', 'source', 'files', 'directories', 'output', 'inputs', 'evidence', 'taskId', 'artifactId']);
  const fields: Record<string, string[]> = { document: ['source'], source: ['files', 'directories'], generated: ['output', 'inputs', 'evidence'], reference: ['taskId', 'artifactId'] };
  if (typeof raw.type !== 'string' || !Object.hasOwn(fields, raw.type)) fail('产物类型无效。');
  object(raw, ['id', 'purpose', 'required', 'optionalReason', 'checks', 'type', ...fields[raw.type]!]);
  if (raw.required !== undefined && typeof raw.required !== 'boolean') fail('产物 required 必须为布尔值。');
  const common = { id: symbol(raw.id), purpose: text(raw.purpose), required: raw.required !== false, checks: ids(raw.checks, raw.required !== false), ...(raw.optionalReason !== undefined ? { optionalReason: text(raw.optionalReason) } : {}) };
  if (!common.required && !common.optionalReason) fail('非必要产物必须说明理由。');
  if (raw.type === 'document') return { ...common, type: 'document', source: reference(raw.source) };
  if (raw.type === 'generated') return { ...common, type: 'generated', output: reference(raw.output), inputs: references(raw.inputs, true), evidence: reference(raw.evidence) };
  if (raw.type === 'reference') return { ...common, type: 'reference', taskId: id(raw.taskId), artifactId: symbol(raw.artifactId) };
  const files = references(raw.files); const directories = references(raw.directories);
  if (!files.length && !directories.length) fail('源码产物必须声明文件或有限目录集合。');
  return { ...common, type: 'source', files, directories };
}
function checkpoints(value: unknown, delivery = false): HumanCheckpoint[] {
  return unique(list(value, raw => {
    const item = object(raw, ['id', 'operation', 'purpose', 'subjects']);
    if (delivery ? item.operation !== 'delivery-ready' : item.operation !== 'start' && item.operation !== 'verify') fail('人工检查点操作与任务/交付范围不符。');
    return { id: id(item.id), operation: item.operation as HumanCheckpoint['operation'], purpose: text(item.purpose), subjects: references(item.subjects, true) };
  }), item => item.id, '人工检查点');
}
function task(value: unknown): PlanningTask {
  const item = object(value, ['id', 'title', 'outcome', 'scope', 'modules', 'relatedWorks', 'requirementIds', 'basis', 'specifications', 'pendingDetails', 'dependencies', 'artifacts', 'verification', 'humanCheckpoints']);
  const basis = object(item.basis, ['requirements', 'design']); const specs = object(item.specifications, ['requirements', 'design', 'standards']);
  const result: PlanningTask = {
    id: id(item.id), title: text(item.title), outcome: text(item.outcome), scope: validateWorkScope(item.scope), modules: ids(item.modules), relatedWorks: strings(item.relatedWorks).map(id), requirementIds: ids(item.requirementIds, true),
    basis: { requirements: basis.requirements === null ? null : confirmation(basis.requirements), design: basis.design === null ? null : confirmation(basis.design) },
    specifications: { requirements: references(specs.requirements), design: references(specs.design), standards: references(specs.standards) }, pendingDetails: strings(item.pendingDetails),
    dependencies: unique(list(item.dependencies, raw => { const dep = object(raw, ['taskId', 'artifacts']); return { taskId: id(dep.taskId), artifacts: ids(dep.artifacts, true) }; }), dep => dep.taskId, '任务依赖'),
    artifacts: unique(list(item.artifacts, artifact, true), artifact => artifact.id, '产物'), verification: parseVerificationSelection(item.verification), humanCheckpoints: checkpoints(item.humanCheckpoints),
  };
  if ((!result.basis.requirements || !result.basis.design || !result.specifications.requirements.length || !result.specifications.design.length || !result.specifications.standards.length) && !result.pendingDetails.length) fail(`任务 ${result.id} 缺详细规格、规范或确认时必须列出待细化事项。`);
  return result;
}
function validateSelection(selection: VerificationSelection, artifacts: PlanningArtifact[], requirementIds: string[]): void {
  if (requirementIds.some(requirement => !selection.requirements.includes(requirement))) fail('必要需求没有纳入验证选择。');
  if (selection.checks.some(check => check.artifactIds.some(artifactId => !artifacts.some(artifact => artifact.id === artifactId)))) fail('验证检查引用未知产物。');
  if (artifacts.some(artifact => artifact.required && !selection.checks.some(check => check.artifactIds.includes(artifact.id)))) fail('每项必要产物必须明确关联验证检查。');
  for (const artifact of artifacts) {
    if (artifact.checks.some(checkId => !selection.checks.some(check => check.id === checkId && check.artifactIds.includes(artifact.id)))) fail('产物检查必须引用对应验证选择中的检查标识。');
    if (artifact.required && artifact.type === 'document' && !selection.checks.some(check => artifact.checks.includes(check.id) && check.kind === 'manual')) fail('必要文档产物必须关联人工评审检查。');
    if (artifact.required && artifact.type === 'generated' && !selection.checks.some(check => artifact.checks.includes(check.id) && (check.kind === 'execution' || check.kind === 'manual'))) fail('生成产物必须关联执行或有来源的人工观察检查。');
  }
}
function artifactReferences(artifact: PlanningArtifact): FileRef[] {
  if (artifact.type === 'document') return [artifact.source];
  if (artifact.type === 'source') return [...artifact.files, ...artifact.directories];
  if (artifact.type === 'generated') return [artifact.output, ...artifact.inputs, artifact.evidence];
  return [];
}
function verificationReferences(selection: VerificationSelection): FileRef[] {
  return selection.checks.flatMap(check => check.inputs.flatMap(input => input.provenance ? [input, input.provenance] : [input]));
}
function assertContentPath(ref: FileRef, directory = false): void {
  const lower = ref.path.toLowerCase();
  if (/(?:^|\/)\.tiller\/work\/[^/]+\/(?:tasks\.json|record\.json|work\.md|plan\.md|confirmations\.json|delivery\.json|reviews(?:\/|$)|verification-runs(?:\/|$)|delivery-checks(?:\/|$)|planning(?:\/|$))/u.test(lower)) fail(`产物不能包含自身控制资料：${ref.path}`);
  if (directory && (lower === '.tiller' || lower === '.tiller/work' || /^\.tiller\/work\/[^/]+$/u.test(lower))) fail('产物目录不能包含工作控制资料，请缩小集合。');
}
function validateGraph(plan: PlanningDefinition): void {
  const tasks = new Map(plan.tasks.map(task => [task.id, task]));
  for (const task of plan.tasks) {
    if (!covered(task.scope, plan.scope)) fail(`任务 ${task.id} 范围超出规划。`);
    if (task.requirementIds.some(requirement => !plan.requirements.some(item => item.id === requirement && !item.exclusion))) fail(`任务 ${task.id} 引用未知或已排除需求。`);
    for (const dependency of task.dependencies) {
      const parent = tasks.get(dependency.taskId);
      if (!parent || parent.id === task.id) fail(`任务 ${task.id} 引用未知或自身依赖。`);
      if (dependency.artifacts.some(artifactId => !parent.artifacts.some(artifact => artifact.id === artifactId))) fail('依赖引用未知产物。');
    }
    for (const artifact of task.artifacts) if (artifact.type === 'reference') {
      if (!task.dependencies.some(dep => dep.taskId === artifact.taskId && dep.artifacts.includes(artifact.artifactId))) fail('引用产物必须列入同一规划的明确依赖。');
    }
    validateSelection(task.verification, task.artifacts, task.requirementIds);
    const refs = [...Object.values(task.specifications).flat(), ...task.artifacts.flatMap(artifactReferences), ...task.humanCheckpoints.flatMap(item => item.subjects), ...verificationReferences(task.verification)];
    if (refs.some(ref => !task.scope.repositories.includes(ref.repository))) fail(`任务 ${task.id} 引用超出仓库范围。`);
    for (const ref of [...Object.values(task.specifications).flat(), ...task.humanCheckpoints.flatMap(item => item.subjects)]) assertContentPath(ref);
    for (const artifact of task.artifacts) {
      for (const ref of artifactReferences(artifact)) assertContentPath(ref, artifact.type === 'source' && artifact.directories.some(dir => key(dir) === key(ref)));
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(taskId: string): void {
    if (visiting.has(taskId)) fail('任务依赖存在循环。');
    if (visited.has(taskId)) return;
    visiting.add(taskId); for (const dependency of tasks.get(taskId)!.dependencies) visit(dependency.taskId); visiting.delete(taskId); visited.add(taskId);
  }
  for (const task of plan.tasks) visit(task.id);
  for (const requirement of plan.requirements) if (!requirement.exclusion && !plan.tasks.some(task => task.requirementIds.includes(requirement.id))) fail(`需求 ${requirement.id} 未分配任务，须明确排除理由。`);
  if (plan.delivery.requiredTasks.some(taskId => !tasks.has(taskId)) || plan.tasks.some(task => !plan.delivery.requiredTasks.includes(task.id))) fail('交付必要任务必须完整包含本规划任务；取消或延期须形成新规划并说明原因。');
  for (const artifact of plan.delivery.artifacts) {
    if (artifact.type === 'reference') {
      if (!tasks.get(artifact.taskId)?.artifacts.some(item => item.id === artifact.artifactId)) fail('交付引用未知任务产物。');
    } else for (const ref of artifactReferences(artifact)) assertContentPath(ref, artifact.type === 'source' && artifact.directories.some(dir => key(dir) === key(ref)));
  }
  validateSelection(plan.delivery.verification, plan.delivery.artifacts, plan.requirements.filter(item => !item.exclusion).map(item => item.id));
  const refs = [...plan.requirements.map(item => item.source), ...plan.delivery.artifacts.flatMap(artifactReferences), ...plan.delivery.humanCheckpoints.flatMap(item => item.subjects), ...verificationReferences(plan.delivery.verification)];
  if (refs.some(ref => !plan.scope.repositories.includes(ref.repository))) fail('交付引用超出规划仓库范围。');
  for (const ref of [...plan.requirements.map(item => item.source), ...plan.delivery.humanCheckpoints.flatMap(item => item.subjects)]) assertContentPath(ref);
}
export function parsePlanningDefinition(value: unknown): PlanningDefinition {
  const item = object(value, ['schemaVersion', 'ownerWorkId', 'revision', 'scope', 'requirements', 'basis', 'tasks', 'delivery', 'changeReason']);
  if (item.schemaVersion !== 1) fail('规划仅支持版本 1；请新建当前格式规划。', 'UNSUPPORTED_RECORD_VERSION');
  const basis = object(item.basis, ['requirements', 'design']);
  const delivery = object(item.delivery, ['requiredTasks', 'artifacts', 'verification', 'humanCheckpoints', 'openIssues']);
  const plan: PlanningDefinition = {
    schemaVersion: 1, ownerWorkId: id(item.ownerWorkId), revision: id(item.revision), scope: validateWorkScope(item.scope),
    requirements: unique(list(item.requirements, raw => { const req = object(raw, ['id', 'source', 'exclusion']); return { id: symbol(req.id), source: reference(req.source), ...(req.exclusion !== undefined ? { exclusion: text(req.exclusion) } : {}) }; }, true), req => req.id, '需求'),
    basis: { requirements: confirmation(basis.requirements), design: confirmation(basis.design) }, tasks: unique(list(item.tasks, task, true), task => task.id, '任务'),
    delivery: { requiredTasks: strings(delivery.requiredTasks, true).map(id), artifacts: unique(list(delivery.artifacts, artifact, true), item => item.id, '交付产物'), verification: parseVerificationSelection(delivery.verification), humanCheckpoints: checkpoints(delivery.humanCheckpoints, true), openIssues: strings(delivery.openIssues) }, changeReason: text(item.changeReason),
  };
  validateGraph(plan); return plan;
}

function paths(workId: string, revision: string) {
  id(workId); id(revision);
  const directory = `.tiller/work/${workId}`;
  return { definition: `${directory}/planning/${revision}/definition.json`, review: `${directory}/planning/${revision}/review.md`, view: `${directory}/plan.md`, state: `${directory}/tasks.json` };
}
function emptyState(workId: string): PlanningState { return { schemaVersion: 1, ownerWorkId: workId, revision: 0, activePlanning: null, events: [], operations: [] }; }
function changes(value: unknown): PlanningChanges {
  const item = object(value, ['added', 'changed', 'retainedCandidates', 'removed', 'removedRequirements']);
  return { added: strings(item.added).map(id), changed: strings(item.changed).map(id), retainedCandidates: strings(item.retainedCandidates).map(id), removed: strings(item.removed).map(id), removedRequirements: ids(item.removedRequirements) };
}
function sha(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/u.test(result)) fail('规划内容摘要无效。'); return result; }
function timestamp(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) fail('规划登记时间无效。'); return result; }
export function parsePlanningState(contents: string, workId: string): PlanningState {
  const item = object(JSON.parse(contents), ['schemaVersion', 'ownerWorkId', 'revision', 'activePlanning', 'events', 'operations']);
  if (item.schemaVersion !== 1) fail('任务记录仅支持版本 1，请新建当前格式工作。', 'UNSUPPORTED_RECORD_VERSION');
  if (item.ownerWorkId !== workId) fail('任务记录归属工作不匹配。');
  const state: PlanningState = { ...emptyState(workId), revision: integer(item.revision),
    events: list(item.events, raw => {
      if (raw && typeof raw === 'object' && 'kind' in raw && raw.kind !== 'planning-activated') return parseTaskEvent(raw);
      const event = object(raw, ['sequence', 'operationId', 'kind', 'at', 'revision', 'definitionDigest', 'confirmation', 'changes']);
      if (event.kind !== 'planning-activated') fail('任务事件类型尚不支持。');
      return { sequence: integer(event.sequence), operationId: id(event.operationId), kind: 'planning-activated', at: timestamp(event.at), revision: id(event.revision), definitionDigest: sha(event.definitionDigest), confirmation: confirmation(event.confirmation), changes: changes(event.changes) };
    }),
    operations: unique(list(item.operations, raw => {
      if (raw && typeof raw === 'object' && 'kind' in raw && String(raw.kind).startsWith('task-')) return parseTaskReceipt(raw);
      const receipt = object(raw, ['operationId', 'inputDigest', 'kind', 'revision', 'planningRevision', 'basisDigest', 'operationAllowed', 'technicalReady', 'blockingReasons']);
      if ((receipt.kind !== 'register' && receipt.kind !== 'activate') || receipt.operationAllowed !== true || receipt.technicalReady !== false || !Array.isArray(receipt.blockingReasons) || receipt.blockingReasons.length) fail('规划操作回执无效。');
      return { operationId: id(receipt.operationId), inputDigest: sha(receipt.inputDigest), kind: receipt.kind, revision: integer(receipt.revision), planningRevision: id(receipt.planningRevision), basisDigest: sha(receipt.basisDigest), operationAllowed: true, technicalReady: false, blockingReasons: [] };
    }), receipt => receipt.operationId, '操作标识'),
  };
  if (item.activePlanning !== null) {
    const active = object(item.activePlanning, ['revision', 'confirmation', 'definitionDigest', 'eventSequence']);
    state.activePlanning = { revision: id(active.revision), confirmation: confirmation(active.confirmation), definitionDigest: sha(active.definitionDigest), eventSequence: integer(active.eventSequence) };
  }
  if (state.operations.length !== state.revision || state.operations.some((receipt, index) => receipt.revision !== index + 1)) fail('规划状态版本与操作顺序不一致。');
  const eventReceipts = state.operations.filter(receipt => receipt.kind !== 'register');
  if (state.events.length !== eventReceipts.length || state.events.some((event, index) => event.sequence !== index + 1 || eventReceipts[index]?.operationId !== event.operationId)) fail('激活事件或任务事件与操作回执顺序不一致。');
  const activations = state.operations.filter(receipt => receipt.kind === 'activate');
  const planningEvents = state.events.filter(event => event.kind === 'planning-activated');
  if (activations.length !== planningEvents.length || planningEvents.some((event, index) => {
    const receipt = activations[index]!;
    return receipt.operationId !== event.operationId || receipt.planningRevision !== event.revision
      || !state.operations.some(registration => registration.kind === 'register' && registration.planningRevision === event.revision && registration.revision < receipt.revision);
  })) fail('激活事件与操作回执不一致，或缺少此前的规划登记。');
  validateTaskHistory(state);
  const latest = planningEvents.at(-1);
  if (latest ? !state.activePlanning || latest.sequence !== state.activePlanning.eventSequence || latest.revision !== state.activePlanning.revision || latest.definitionDigest !== state.activePlanning.definitionDigest || digest(latest.confirmation) !== digest(state.activePlanning.confirmation) : state.activePlanning !== null) fail('活动规划与最后激活事件不一致。');
  return state;
}
export async function loadPlanningState(rootInput: string, workId: string) {
  const root = await resolveWorkRoot(rootInput, workId);
  const work = await loadWorkRecord(root, workId);
  if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
  const path = `.tiller/work/${id(workId)}/tasks.json`; await assertSafePaths(root, [path]);
  const original = await readTextIfExists(root, path);
  return { root, path, original, work, state: original === null ? emptyState(workId) : parsePlanningState(original, workId) };
}
function render(record: RegisteredPlanning): string {
  return `# 实施规划 ${record.plan.revision}\n\n本规划登记不表示已确认；任务规格缺口仍须补足，候选保留不代表当前证据有效。\n\n## 修订与保留核对\n\n\`\`\`json\n${json({ reason: record.plan.changeReason, changes: record.changes })}\`\`\`\n\n## 任务、交付与待细化事项\n\n\`\`\`json\n${json(record.plan)}\`\`\`\n\n## 内容依据\n\n\`\`\`json\n${json({ definitionDigest: record.definitionDigest, taskDigests: record.taskDigests, specificationFiles: record.specificationFiles, confirmationBindings: record.confirmationBindings })}\`\`\`\n`;
}
function taskDigests(plan: PlanningDefinition, files: PlanningBoundFile[], bindings: RegisteredPlanning['confirmationBindings']): Record<string, string> {
  const result: Record<string, string> = {};
  const tasks = new Map(plan.tasks.map(task => [task.id, task]));
  const boundFiles = files.map(file => ({ file, identity: key(file) }));
  const boundApprovals = bindings.map(binding => ({ binding, identity: digest(binding.reference) }));
  function calculate(task: PlanningTask): string {
    if (result[task.id]) return result[task.id]!;
    const requirementIds = new Set(task.requirementIds);
    const refs = new Set([...Object.values(task.specifications).flat(), ...plan.requirements.filter(req => requirementIds.has(req.id)).map(req => req.source)].map(key));
    const approvals = new Set(Object.values(task.basis).filter((ref): ref is ConfirmationReference => ref !== null).map(ref => digest(ref)));
    const dependencies = task.dependencies.map(dep => ({ taskId: dep.taskId, digest: calculate(tasks.get(dep.taskId)!) }));
    result[task.id] = digest({ task, files: boundFiles.filter(file => refs.has(file.identity)).map(file => file.file), approvals: boundApprovals.filter(binding => approvals.has(binding.identity)).map(binding => binding.binding), dependencies });
    return result[task.id]!;
  }
  for (const task of plan.tasks) calculate(task);
  return result;
}
function parseRegistered(contents: string, workId: string, revision: string): RegisteredPlanning {
  const item = object(JSON.parse(contents), ['schemaVersion', 'plan', 'registeredAt', 'operationId', 'inputDigest', 'definitionDigest', 'taskDigests', 'specificationFiles', 'confirmationBindings', 'changes']);
  if (item.schemaVersion !== 1) fail('已登记规划仅支持版本 1。', 'UNSUPPORTED_RECORD_VERSION');
  const plan = parsePlanningDefinition(item.plan);
  if (plan.ownerWorkId !== workId || plan.revision !== revision) fail('规划工作身份或版本路径不匹配。');
  const files = unique(list(item.specificationFiles, raw => { const file = object(raw, ['repository', 'path', 'sha256']); return { ...reference({ repository: file.repository, path: file.path }), sha256: sha(file.sha256) }; }), key, '规格快照');
  const bindings = unique(list(item.confirmationBindings, raw => { const binding = object(raw, ['reference', 'requestFingerprint', 'decisionFingerprint']); return { reference: confirmation(binding.reference), requestFingerprint: sha(binding.requestFingerprint), decisionFingerprint: sha(binding.decisionFingerprint) }; }), binding => digest(binding.reference), '确认绑定');
  const record: RegisteredPlanning = { schemaVersion: 1, plan, registeredAt: timestamp(item.registeredAt), operationId: id(item.operationId), inputDigest: sha(item.inputDigest), definitionDigest: sha(item.definitionDigest), taskDigests: taskDigests(plan, files, bindings), specificationFiles: files, confirmationBindings: bindings, changes: changes(item.changes) };
  if (record.definitionDigest !== digest(plan) || digest(item.taskDigests) !== digest(record.taskDigests)) fail('规划定义或任务内容摘要不匹配。');
  return record;
}
export async function readRegisteredPlanning(rootInput: string, workId: string, revision: string, work?: Awaited<ReturnType<typeof loadWorkRecord>>, materials?: TextReadInput) {
  const root = await resolveWorkRoot(rootInput, workId); if (!work) await loadWorkRecord(root, workId);
  const locations = paths(workId, revision); await assertSafePaths(root, [locations.definition, locations.review]);
  const original = await readTextIfExists(root, locations.definition, materials);
  if (original === null) fail('规划版本尚未登记。', 'PLANNING_NOT_FOUND');
  const record = parseRegistered(original, workId, revision);
  const review = await readTextIfExists(root, locations.review, materials);
  if (review !== render(record)) fail('不可变规划审阅视图已变化或缺失。', 'CONTENT_CHANGED');
  return { root, definitionPath: locations.definition, reviewPath: locations.review, original, record };
}
function assertPlanningReference(metadata: ProjectMetadata, ref: FileRef, scope: Scope): void {
  if (!scope.repositories.includes(ref.repository)) fail('规划依据引用超出仓库范围。');
  if (ref.repository !== '.' && !metadata.repositories.includes(ref.repository)) fail('规划引用未登记仓库。');
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  if (ref.repository === '.' && boundaries.some(boundary => ref.path.toLowerCase() === boundary || ref.path.toLowerCase().startsWith(`${boundary}/`))) fail('业务仓库对象必须使用其登记身份。');
}
function planningBasisReferences(plan: PlanningDefinition): ConfirmationReference[] {
  const references = [plan.basis.requirements, plan.basis.design,
    ...plan.tasks.flatMap(task => Object.values(task.basis).filter((reference): reference is ConfirmationReference => reference !== null))];
  return [...new Map(references.map(reference => [digest(reference), reference])).values()];
}
interface PlanningDefinitionInputs {
  repositoryInput?: RepositoryInput;
  materials?: TextReadInput;
  work?: Awaited<ReturnType<typeof loadWorkRecord>>;
  metadata?: ProjectMetadata;
  approvals?: ReadonlyConfirmation<ConfirmationRead>[];
  proofs?: ((observations?: TextProof[]) => Promise<void>)[];
}
async function assertPlanningSharing(root: string, workId: string, work: Awaited<ReturnType<typeof loadWorkRecord>>,
  plan: PlanningDefinition, specifications: PlanningBoundFile[], approvals: ConfirmationReference[]): Promise<void> {
  await assertSharedRegistrationReferences(root, workId, [
    ...specifications,
    ...[work.paths.record, work.paths.notes, work.record.workflow.path, '.tiller/project.json'].map(path => ({ repository: '.', path })),
    ...[...work.record.basis, ...work.record.actionSources].map(source => source.reference),
  ]);
  for (const related of new Set(plan.tasks.flatMap(task => task.relatedWorks))) if (related !== workId) {
    const relatedRoot = await resolveWorkRoot(root, related);
    await assertSharedRegistrationReferences(relatedRoot, related, [{ repository: '.', path: `.tiller/work/${related}/record.json` }]);
  }
  await assertConfirmationSharing(root, approvals);
}
async function inspectDefinition(root: string, workId: string, plan: PlanningDefinition, supplied: PlanningDefinitionInputs = {}) {
  const work = supplied.work ?? await loadWorkRecord(root, workId);
  const metadata = supplied.metadata ?? await readProjectMetadata(root);
  if (plan.ownerWorkId !== workId || !covered(plan.scope, work.record.scope)) fail('规划归属或范围与登记工作不符。');
  const basisReferences = planningBasisReferences(plan);
  const approvals = supplied.approvals ?? await readConfirmations(root, basisReferences);
  const approvalInputs = new Map(approvals.map(approval => [digest(approval.reference), approval]));
  const refs = new Map<string, FileRef>();
  const referenceNames = new Map<string, string>();
  function addReference(ref: FileRef) {
    const name = key(ref); const folded = name.toLowerCase(); const previous = referenceNames.get(folded);
    if (previous !== undefined && previous !== name) fail(`规格路径存在大小写别名：${previous} / ${name}`);
    referenceNames.set(folded, name); refs.set(name, { ...ref });
  }
  const approvedHashes = new Map<string, string>();
  for (const requirement of plan.requirements) addReference(requirement.source);
  function approval(ref: ConfirmationReference, gate: 'requirements' | 'design', scope: Scope, subjects: FileRef[]) {
    const checked = approvalInputs.get(digest(ref));
    if (!checked) fail('规划确认没有包含在声明的本次输入中。', 'CONFIRMATION_REQUIRED');
    if (!checked.check.confirmed || checked.request.gate !== gate || !covered(scope, { repositories: [...checked.request.scope.repositories], targets: [...checked.request.scope.targets] })) fail(`规划 ${gate} 确认无效或未覆盖范围。`, 'CONFIRMATION_REQUIRED');
    if (subjects.some(subject => !checked.request.subjects.some(file => key(file) === key(subject)))) fail('确认未绑定所采用的规格正文。');
    for (const subject of checked.request.subjects) {
      if (!plan.scope.repositories.includes(subject.repository)) continue;
      const bound = checked.request.files.find(file => key(file) === key(subject));
      if (!bound) fail('已确认规格缺少对应内容快照。');
      const priorHash = approvedHashes.get(key(subject));
      if (priorHash !== undefined && priorHash !== bound.sha256) fail('同一路径的规格确认绑定不同内容；不能按名称合并。');
      approvedHashes.set(key(subject), bound.sha256);
      addReference(subject);
    }
  }
  approval(plan.basis.requirements, 'requirements', plan.scope, plan.requirements.map(req => req.source));
  approval(plan.basis.design, 'design', plan.scope, []);
  const relatedInputs = new Map<string, Awaited<ReturnType<typeof loadWorkRecord>>>([[workId, work]]);
  for (const related of new Set(plan.tasks.flatMap(task => task.relatedWorks))) if (related !== workId) {
    const relatedRoot = await resolveWorkRoot(root, related);
    relatedInputs.set(related, await loadWorkRecord(relatedRoot, related));
  }
  for (const task of plan.tasks) {
    for (const related of task.relatedWorks) if (!covered(task.scope, relatedInputs.get(related)!.record.scope)) fail(`关联工作 ${related} 未覆盖任务范围。`);
    for (const gate of ['requirements', 'design'] as const) if (task.basis[gate]) approval(task.basis[gate]!, gate, task.scope,
      gate === 'design' ? [...task.specifications.design, ...task.specifications.standards] : task.specifications.requirements);
    for (const ref of Object.values(task.specifications).flat()) addReference(ref);
  }
  for (const ref of refs.values()) assertContentPath(ref);
  // Future outputs need not exist yet, but their repository identity and existing path components must be safe.
  const futureReferences = new Map<string, { ref: FileRef; scope: Scope }>();
  function futureReference(ref: FileRef, scope: Scope): void {
    // Validate each occurrence before deduplicating: the same path can be legal
    // for one task and outside another task's scope.
    if (!scope.repositories.includes(ref.repository)) fail('规划依据引用超出仓库范围。');
    const identity = JSON.stringify([ref.repository, ref.path]);
    if (!futureReferences.has(identity)) futureReferences.set(identity, { ref, scope });
  }
  for (const task of plan.tasks) for (const ref of [...task.artifacts.flatMap(artifactReferences), ...task.humanCheckpoints.flatMap(checkpoint => checkpoint.subjects), ...verificationReferences(task.verification)]) futureReference(ref, task.scope);
  for (const ref of [...plan.delivery.artifacts.flatMap(artifactReferences), ...plan.delivery.humanCheckpoints.flatMap(checkpoint => checkpoint.subjects), ...verificationReferences(plan.delivery.verification)]) futureReference(ref, plan.scope);
  const specificationReferences = [...refs.values()].sort((a, b) => key(a).localeCompare(key(b)));
  for (const ref of specificationReferences) assertPlanningReference(metadata, ref, plan.scope);
  for (const { ref, scope } of futureReferences.values()) assertPlanningReference(metadata, ref, scope);
  const repositories = [...new Set([...specificationReferences.map(ref => ref.repository), ...[...futureReferences.values()].map(entry => entry.ref.repository)])];
  const repositoryRoots = supplied.repositoryInput ? new Map(repositories.map(repository => {
    const actual = supplied.repositoryInput!.repositories.get(repository);
    if (!actual || supplied.repositoryInput!.root !== root || supplied.repositoryInput!.workId !== workId) fail('规划仓库未包含在当前显式工作输入中。');
    return [repository, actual] as const;
  })) : await resolveRepositoryRootsFromMetadata(root, repositories, metadata, workId);
  const textInputs: { root: string; inputs: Awaited<ReturnType<typeof readTextInputs>> }[] = [];
  const specificationTexts = new Map<string, string>();
  for (const [repository, repositoryRoot] of repositoryRoots) {
    const specifications = specificationReferences.filter(ref => ref.repository === repository);
    const inputs = await readTextInputs(repositoryRoot, specifications.map(ref => ref.path), { maxBytes: 4 * 1024 * 1024 }, supplied.materials);
    textInputs.push({ root: repositoryRoot, inputs });
    for (const input of inputs) {
      if (input.text === null || !input.text.trim()) fail(`规格依据缺失或为空：${key({ repository, path: input.path })}`);
      specificationTexts.set(key({ repository, path: input.path }), input.text);
    }
    await assertSafePaths(repositoryRoot, [...futureReferences.values()].filter(entry => entry.ref.repository === repository).map(entry => entry.ref.path));
  }
  const specificationFiles: PlanningBoundFile[] = [];
  let totalBytes = 0;
  for (const ref of specificationReferences) {
    const contents = specificationTexts.get(key(ref))!;
    const sha256 = hashText(contents);
    if (approvedHashes.has(key(ref)) && approvedHashes.get(key(ref)) !== sha256) fail(`当前工作采用的规格与来源确认快照不一致：${key(ref)}`, 'CONTENT_CHANGED');
    totalBytes += Buffer.byteLength(contents);
    if (totalBytes > 64 * 1024 * 1024) fail('规划规格依据总计超过 64 MiB。');
    specificationFiles.push({ ...ref, sha256 });
  }
  const prove = async (observations?: TextProof[]) => {
    for (const observed of textInputs) await verifyTextInputs(observed.root, observed.inputs, { maxBytes: 4 * 1024 * 1024 }, observations);
    const remaining = async () => {
      if (!supplied.repositoryInput) {
        const currentRoots = await resolveRepositoryRootsFromMetadata(root, [...repositoryRoots.keys()], metadata, workId);
        if ([...repositoryRoots].some(([repository, expected]) => currentRoots.get(repository) !== expected)) fail('规划仓库位置已变化。', 'CONTENT_CHANGED');
        if (digest(await readProjectMetadata(root)) !== digest(metadata)) fail('规划仓库登记已变化。', 'CONTENT_CHANGED');
      }
      for (const [repository, repositoryRoot] of repositoryRoots)
        await assertSafePaths(repositoryRoot, [...futureReferences.values()].filter(entry => entry.ref.repository === repository).map(entry => entry.ref.path));
      for (const [related, input] of relatedInputs) {
        const actualRoot = await resolveWorkRoot(root, related);
        const current = await loadWorkRecord(actualRoot, related);
        if (current.original !== input.original) fail('规划关联工作已变化。', 'CONTENT_CHANGED');
      }
    };
    if (supplied.repositoryInput) await proveRepositoryInput(supplied.repositoryInput, observations);
    if (observations) observations.push({root, inputs: [], verifyAfter: {key: futureReferences, run: remaining}});
    else await remaining();
  };
  if (supplied.proofs) supplied.proofs.push(prove);
  else for (const observed of textInputs) await verifyTextInputs(observed.root, observed.inputs, { maxBytes: 4 * 1024 * 1024 });
  const confirmationBindings = basisReferences.map(reference => approvalInputs.get(digest(reference))!)
    .map(checked => ({ reference: { ...checked.reference }, requestFingerprint: checked.requestFingerprint, decisionFingerprint: checked.decisionFingerprint }))
    .sort((a, b) => digest(a.reference).localeCompare(digest(b.reference)));
  return { specificationFiles, confirmationBindings, taskDigests: taskDigests(plan, specificationFiles, confirmationBindings), workIdentity: { id: work.record.id, scope: work.record.scope } };
}

function difference(record: RegisteredPlanning | null, plan: PlanningDefinition, hashes: Record<string, string>): PlanningChanges {
  const oldTasks = record?.plan.tasks ?? [];
  return {
    added: plan.tasks.filter(task => !oldTasks.some(previous => previous.id === task.id)).map(task => task.id),
    changed: plan.tasks.filter(task => oldTasks.some(previous => previous.id === task.id) && hashes[task.id] !== record?.taskDigests[task.id]).map(task => task.id),
    retainedCandidates: plan.tasks.filter(task => hashes[task.id] === record?.taskDigests[task.id]).map(task => task.id),
    removed: oldTasks.filter(task => !plan.tasks.some(current => current.id === task.id)).map(task => task.id),
    removedRequirements: (record?.plan.requirements ?? []).filter(req => !plan.requirements.some(current => current.id === req.id)).map(req => req.id),
  };
}
function registrationInput(value: unknown): PlanningRegistrationInput {
  const item = object(value, ['operationId', 'expectedRevision', 'plan']);
  return { operationId: id(item.operationId), expectedRevision: integer(item.expectedRevision), plan: parsePlanningDefinition(item.plan) };
}
function activationInput(value: unknown): PlanningActivationInput {
  const item = object(value, ['operationId', 'expectedRevision', 'revision', 'confirmation']);
  return { operationId: id(item.operationId), expectedRevision: integer(item.expectedRevision), revision: id(item.revision), confirmation: confirmation(item.confirmation) };
}
function replay(state: PlanningState, kind: PlanningReceipt['kind'], input: { operationId: string }): PlanningReceipt | undefined {
  const receipt = state.operations.find(receipt => receipt.operationId === input.operationId);
  if (receipt && (receipt.kind !== kind || receipt.inputDigest !== digest(input))) fail('相同 operationId 已用于不同操作或内容。', 'OPERATION_CONFLICT');
  return receipt as PlanningReceipt | undefined;
}
export async function assertNoDeliveryOperation(root: string, workId: string, operationId: string): Promise<void> {
  if (await readTextIfExists(root, `.tiller/work/${id(workId)}/delivery-checks/${id(operationId)}.json`) !== null) fail('相同 operationId 已存在整体交付回执路径，不能重复用于规划或任务操作。', 'OPERATION_CONFLICT');
}
async function checkView(root: string, workId: string, state: PlanningState, work?: Awaited<ReturnType<typeof loadWorkRecord>>): Promise<string | null> {
  const view = `.tiller/work/${workId}/plan.md`; await assertSafePaths(root, [view]);
  const text = await readTextIfExists(root, view);
  if (state.activePlanning) {
    const registered = await readRegisteredPlanning(root, workId, state.activePlanning.revision, work);
    if (text !== render(registered.record)) fail('当前 plan.md 与已激活规划不一致；请核对手工改动。', 'CONTENT_CHANGED');
  } else if (text !== null) fail('plan.md 已有未登记内容；不能覆盖为生成视图。', 'CONTENT_CHANGED');
  return text;
}
async function prepareRegistration(root: string, workId: string, input: PlanningRegistrationInput) {
  const loaded = await loadPlanningState(root, workId); const prior = replay(loaded.state, 'register', input);
  if (prior) return { loaded, prior, candidate: null };
  await assertNoDeliveryOperation(root, workId, input.operationId);
  if (input.expectedRevision !== loaded.state.revision) fail('expectedRevision 已过期，请重新检查规划。', 'REVISION_CONFLICT');
  const locations = paths(workId, input.plan.revision);
  await assertSafePaths(root, [locations.definition, locations.review]);
  if (await readTextIfExists(root, locations.definition) !== null || await readTextIfExists(root, locations.review) !== null) fail('规划 revision 已存在；必须使用新版本，不能覆盖旧规划。', 'REVISION_EXISTS');
  const view = await checkView(root, workId, loaded.state, loaded.work);
  const inspected = await inspectDefinition(root, workId, input.plan, { work: loaded.work });
  const previous = loaded.state.activePlanning ? (await readRegisteredPlanning(root, workId, loaded.state.activePlanning.revision, loaded.work)).record : null;
  const changes = difference(previous, input.plan, inspected.taskDigests);
  const basisDigest = digest({ action: 'register', input, state: loaded.original, inspected, changes, view });
  return { loaded, prior: undefined, candidate: { inspected, changes, basisDigest, locations } };
}
function preview(receipt: PlanningReceipt) { return { ...receipt, planId: receipt.basisDigest, changed: false, historicalReceipt: true, limitation: '重复操作只返回原回执，不能代替当前规划和任务有效性检查。' }; }
export async function planPlanningRegistration(rootInput: string, workId: string, value: unknown) {
  const root = await resolveWorkRoot(rootInput, workId); const input = registrationInput(value);
  return withDeliveryLocation(root, workId, async () => {
    const prepared = await prepareRegistration(root, workId, input);
    if (prepared.prior) return preview(prepared.prior);
    const candidate = prepared.candidate!;
    return { operationId: input.operationId, planId: candidate.basisDigest, basisDigest: candidate.basisDigest, operationAllowed: true, technicalReady: false, blockingReasons: [] as string[], changed: false, revision: prepared.loaded.state.revision, planningRevision: input.plan.revision, changes: candidate.changes, definitionPath: candidate.locations.definition, reviewPath: candidate.locations.review };
  });
}
/** Caller holds the work's project lock. Preserve the loaded bytes for compare-and-swap. */
export async function savePlanningState(root: string, workId: string, expectedOriginal: string | null, state: PlanningState, changes: FileChange[] = [], validate?: () => Promise<void>, postValidate?: () => Promise<void>): Promise<void> {
  if (postValidate && (expectedOriginal === null || changes.some(change => change.before === null))) fail('写后重核目前仅支持已存在的控制文件；不能创建无法反向恢复的新文件。');
  const path = `.tiller/work/${id(workId)}/tasks.json`; const current = await readTextIfExists(root, path);
  if (current !== null) parsePlanningState(current, workId);
  if (current !== expectedOriginal) fail('任务记录在写入前发生变化。', 'CONTENT_CHANGED');
  const after = json(state); parsePlanningState(after, workId);
  await assertSafePaths(root, [path, ...changes.map(change => change.path)]);
  await validate?.();
  if (await readTextIfExists(root, path) !== expectedOriginal) fail('任务记录在提交前发生变化。', 'CONTENT_CHANGED');
  await applyChanges(root, [...changes, { path, before: expectedOriginal, after }], async () => {
    for (const change of [...changes, { path, before: expectedOriginal, after }]) if (await readTextIfExists(root, change.path) !== change.after) fail('规划事务写入内容发生变化。', 'CONTENT_CHANGED');
  });
  if (postValidate) {
    try {
      await postValidate();
      for (const change of [...changes, { path, before: expectedOriginal, after }]) if (await readTextIfExists(root, change.path) !== change.after) fail('写后核对期间控制记录发生变化。', 'CONTENT_CHANGED');
    }
    catch (error) {
      const rollback = [...changes, { path, before: expectedOriginal, after }].map(change => ({ path: change.path, before: change.after, after: change.before! }));
      // The lock protects cooperating writers; compare-and-swap also preserves direct external edits.
      for (const change of rollback) if (await readTextIfExists(root, change.path) !== change.before) fail('写后核对失败且控制记录又发生变化；未覆盖外部修改，请人工核对恢复。', 'CONTENT_CHANGED');
      await applyChanges(root, rollback);
      throw error;
    }
  }
}
export async function applyPlanningRegistration(rootInput: string, workId: string, value: unknown, planId: string) {
  sha(planId); const input = registrationInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, () => withDeliveryLocation(root, workId, async () => {
    const prepared = await prepareRegistration(root, workId, input);
    if (prepared.prior) { if (planId !== prepared.prior.basisDigest) fail('重复操作摘要不一致。'); return preview(prepared.prior); }
    const candidate = prepared.candidate!;
    if (planId !== candidate.basisDigest) fail('规划登记计划已变化，请重新预览。', 'CONTENT_CHANGED');
    const record: RegisteredPlanning = { schemaVersion: 1, plan: input.plan, registeredAt: new Date().toISOString(), operationId: input.operationId, inputDigest: digest(input), definitionDigest: digest(input.plan), taskDigests: candidate.inspected.taskDigests, specificationFiles: candidate.inspected.specificationFiles, confirmationBindings: candidate.inspected.confirmationBindings, changes: candidate.changes };
    const state = prepared.loaded.state;
    const receipt: PlanningReceipt = { operationId: input.operationId, inputDigest: digest(input), kind: 'register', revision: ++state.revision, planningRevision: input.plan.revision, basisDigest: planId, operationAllowed: true, technicalReady: false, blockingReasons: [] };
    state.operations.push(receipt);
    await savePlanningState(root, workId, prepared.loaded.original, state, [
      { path: candidate.locations.definition, before: null, after: json(record) }, { path: candidate.locations.review, before: null, after: render(record) },
    ], async () => {
      await assertPlanningSharing(root, workId, prepared.loaded.work, input.plan,
        candidate.inspected.specificationFiles, planningBasisReferences(input.plan));
      const fresh = await prepareRegistration(root, workId, input);
      if (fresh.candidate?.basisDigest !== planId) fail('规划依据在提交前发生变化。', 'CONTENT_CHANGED');
    });
    return { ...receipt, changed: true, definitionPath: candidate.locations.definition, reviewPath: candidate.locations.review, changes: candidate.changes };
  }));
}
export function planningConfirmationSubjects(workId: string, record: RegisteredPlanning): FileRef[] {
  const location = paths(workId, record.plan.revision);
  return [{ repository: '.', path: location.definition }, { repository: '.', path: location.review }, ...record.specificationFiles.map(({ repository, path }) => ({ repository, path }))];
}
async function checkPlanningApproval(root: string, workId: string, record: RegisteredPlanning, approval: ConfirmationReference, work?: Awaited<ReturnType<typeof loadWorkRecord>>, proofs?: ((observations?: TextProof[]) => Promise<void>)[], batches?: ConfirmationReadBatch[], owner?: WorkflowPolicyContext) {
  if (approval.workId !== workId) fail('规划激活须使用归属工作的 planning 确认。', 'CONFIRMATION_REQUIRED');
  const references = [...new Map([...planningBasisReferences(record.plan), approval].map(reference => [digest(reference), reference])).values()];
  const batch = proofs ? await loadConfirmationReadBatch(root, references, owner) : null;
  if (batch) batches?.push(batch);
  if (batch?.errors.length) fail(batch.errors.map(error => error.message).join('；'), 'CONFIRMATION_REQUIRED');
  const approvals = batch ? [...batch.reads] : await readConfirmations(root, references);
  const checked = approvals.find(value => digest(value.reference) === digest(approval))!;
  if (!checked.check.confirmed || checked.request.gate !== 'planning' || !covered(record.plan.scope, { repositories: [...checked.request.scope.repositories], targets: [...checked.request.scope.targets] })) fail(`规划尚未有效确认：${checked.check.issues.join('；')}`, 'CONFIRMATION_REQUIRED');
  if (planningConfirmationSubjects(workId, record).some(subject => !checked.request.files.some(file => key(file) === key(subject)))) fail('planning 确认必须绑定不可变规划、审阅视图及全部规格正文。', 'CONFIRMATION_REQUIRED');
  const inspected = await inspectDefinition(root, workId, record.plan, { ...(work ? { work } : {}), ...(owner?.repositoryInput ? {repositoryInput: owner.repositoryInput} : {}), ...(owner?.materials ? {materials: owner.materials} : {}), ...(owner?.metadata ? {metadata: owner.metadata} : {}), approvals, ...(proofs ? {proofs} : {}) });
  if (proofs && batch) proofs.push(observations => assertConfirmationReadBatchCurrent(batch, observations));
  if (digest(inspected.specificationFiles) !== digest(record.specificationFiles) || digest(inspected.confirmationBindings) !== digest(record.confirmationBindings)) fail('已登记规划的规格或确认依据已变化；请登记新修订。', 'CONTENT_CHANGED');
  return { confirmation: { ...approval }, requestFingerprint: checked.requestFingerprint, decisionFingerprint: checked.decisionFingerprint, inspected };
}
async function prepareActivation(root: string, workId: string, input: PlanningActivationInput) {
  const loaded = await loadPlanningState(root, workId); const prior = replay(loaded.state, 'activate', input);
  if (prior) return { loaded, prior, candidate: null };
  await assertNoDeliveryOperation(root, workId, input.operationId);
  if (loaded.state.revision !== input.expectedRevision) fail('expectedRevision 已过期，请重新检查规划。', 'REVISION_CONFLICT');
  const registered = await readRegisteredPlanning(root, workId, input.revision, loaded.work);
  const view = await checkView(root, workId, loaded.state, loaded.work);
  const approval = await checkPlanningApproval(root, workId, registered.record, input.confirmation, loaded.work);
  const previous = loaded.state.activePlanning ? (await readRegisteredPlanning(root, workId, loaded.state.activePlanning.revision, loaded.work)).record : null;
  const changes = difference(previous, registered.record.plan, registered.record.taskDigests);
  if (digest(changes) !== digest(registered.record.changes)) fail('活动基线与登记时不同，修订差异需重新展示；请登记新规划。', 'CONTENT_CHANGED');
  const basisDigest = digest({ action: 'activate', input, state: loaded.original, registration: registered.original, view, approval });
  return { loaded, prior: undefined, candidate: { registered, view, approval, changes, basisDigest } };
}
export async function planPlanningActivation(rootInput: string, workId: string, value: unknown) {
  const root = await resolveWorkRoot(rootInput, workId); const input = activationInput(value);
  return withDeliveryLocation(root, workId, async () => {
    const prepared = await prepareActivation(root, workId, input);
    if (prepared.prior) return preview(prepared.prior);
    const candidate = prepared.candidate!;
    return { operationId: input.operationId, planId: candidate.basisDigest, basisDigest: candidate.basisDigest, operationAllowed: true, technicalReady: false, blockingReasons: [] as string[], changed: false, revision: prepared.loaded.state.revision, planningRevision: input.revision, changes: candidate.changes };
  });
}
export async function applyPlanningActivation(rootInput: string, workId: string, value: unknown, planId: string) {
  sha(planId); const input = activationInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, () => withDeliveryLocation(root, workId, async () => {
    const prepared = await prepareActivation(root, workId, input);
    if (prepared.prior) { if (planId !== prepared.prior.basisDigest) fail('重复操作摘要不一致。'); return preview(prepared.prior); }
    const candidate = prepared.candidate!;
    if (planId !== candidate.basisDigest) fail('规划激活计划已变化，请重新预览。', 'CONTENT_CHANGED');
    const state = prepared.loaded.state;
    const receipt: PlanningReceipt = { operationId: input.operationId, inputDigest: digest(input), kind: 'activate', revision: ++state.revision, planningRevision: input.revision, basisDigest: planId, operationAllowed: true, technicalReady: false, blockingReasons: [] };
    state.operations.push(receipt);
    const event = { sequence: state.events.length + 1, operationId: input.operationId, kind: 'planning-activated' as const, at: new Date().toISOString(), revision: input.revision, definitionDigest: candidate.registered.record.definitionDigest, confirmation: input.confirmation, changes: candidate.changes };
    state.events.push(event);
    state.activePlanning = { revision: input.revision, confirmation: input.confirmation, definitionDigest: event.definitionDigest, eventSequence: event.sequence };
    await savePlanningState(root, workId, prepared.loaded.original, state, [{ path: paths(workId, input.revision).view, before: candidate.view, after: render(candidate.registered.record) }], async () => {
      await assertPlanningSharing(root, workId, prepared.loaded.work, candidate.registered.record.plan,
        candidate.registered.record.specificationFiles, [...planningBasisReferences(candidate.registered.record.plan), input.confirmation]);
      const fresh = await prepareActivation(root, workId, input);
      if (fresh.candidate?.basisDigest !== planId) fail('规划确认或依据在提交前发生变化。', 'CONTENT_CHANGED');
    });
    return { ...receipt, changed: true, changes: candidate.changes, eventSequence: event.sequence };
  }));
}
export type PlanningStateInput = Awaited<ReturnType<typeof loadPlanningState>>;
function checkedPlanningStateInput(root: string, workId: string, input: PlanningStateInput): PlanningStateInput {
  const directory = `.tiller/work/${id(workId)}`;
  try {
    const state = input.original === null ? emptyState(workId) : parsePlanningState(input.original, workId);
    const record = parseWorkRecord(input.work.original, workId);
    if (input.root !== root || input.path !== `${directory}/tasks.json`
      || input.work.paths.directory !== directory || input.work.paths.record !== `${directory}/record.json`
      || input.work.paths.notes !== `${directory}/work.md`
      || digest(state) !== digest(input.state) || digest(record) !== digest(input.work.record)) {
      fail('规划状态输入不属于当前工程、工作或原文。', 'PLANNING_INPUT_CHANGED');
    }
    return { ...input, state, work: { ...input.work, record } };
  } catch {
    fail('规划状态输入不属于当前工程、工作或原文。', 'PLANNING_INPUT_CHANGED');
  }
}
/** Current effective planning. Supplied observations are revalidated by their owner at its commit/return boundary. */
export async function loadActivePlanningInput(rootInput: string, workId: string, stateInput?: PlanningStateInput, owner?: WorkflowPolicyContext) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const loaded = stateInput ? checkedPlanningStateInput(root, workId, stateInput) : await loadPlanningState(root, workId);
    if (owner && (owner.root !== root || owner.record.id !== workId || owner.recordText !== loaded.work.original)) fail('规划所有者输入不属于当前工作原文。', 'PLANNING_INPUT_CHANGED');
    if (stateInput) {
      if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
      await assertSafePaths(root, [loaded.path, loaded.work.paths.record, loaded.work.paths.notes]);
    }
    if (!loaded.state.activePlanning) fail('尚未激活有效规划。', 'PLANNING_REQUIRED');
    const active = loaded.state.activePlanning;
    const registered = await readRegisteredPlanning(root, workId, active.revision, loaded.work, owner?.materials);
    if (active.definitionDigest !== registered.record.definitionDigest) fail('活动规划摘要与不可变定义不符。', 'CONTENT_CHANGED');
    const issues: string[] = [];
    const proofs: ((observations?: TextProof[]) => Promise<void>)[] = [];
    const confirmationBatches: ConfirmationReadBatch[] = [];
    const viewPath = `.tiller/work/${workId}/plan.md`;
    const view = await readTextIfExists(root, viewPath, owner?.materials);
    try {
      if (view !== render(registered.record)) fail('当前 plan.md 与已激活规划不一致；请核对手工改动。', 'CONTENT_CHANGED');
      await checkPlanningApproval(root, workId, registered.record, active.confirmation, loaded.work, proofs, confirmationBatches, owner);
    }
    catch (error) { issues.push((error as Error).message); }
    const proveMaterials = async (observations?: TextProof[]) => {
      for (const prove of proofs) await prove(observations);
      await verifyTextInputs(root, [{path: registered.definitionPath, text: registered.original},
        {path: registered.reviewPath, text: render(registered.record)}, {path: viewPath, text: view}], {}, observations, true);
    };
    const result = { root, state: loaded.state, stateText: loaded.original, registration: registered.record, definitionPath: registered.definitionPath, reviewPath: registered.reviewPath, ready: issues.length === 0, issues, technicalReady: false, automaticTransition: false, proveMaterials };
    // Internal observations are not part of CLI output, planning identity or receipts.
    return Object.defineProperty(result, 'confirmationBatches', {value: confirmationBatches}) as typeof result & {confirmationBatches: ConfirmationReadBatch[]};
  });
}
/** Standalone callers own their return boundary; graph owners prove the declared input once. */
export async function loadActivePlanning(rootInput: string, workId: string, stateInput?: PlanningStateInput) {
  const input = await loadActivePlanningInput(rootInput, workId, stateInput);
  if (input.ready) {
    try { await input.proveMaterials(); }
    catch (error) { input.ready = false; input.issues.push((error as Error).message); }
  }
  return input;
}
/** Independent planning proof for a commit; stage/task graphs are not evaluated here. */
export async function assertActivePlanningCurrent(input: Awaited<ReturnType<typeof loadActivePlanning>>, observations?: TextProof[]): Promise<void> {
  if (input.ready) {
    await input.proveMaterials(observations);
    const workId = input.registration.plan.ownerWorkId;
    if (await resolveWorkRoot(input.root, workId) !== input.root
      || await readTextIfExists(input.root, `.tiller/work/${workId}/tasks.json`) !== input.stateText)
      fail('活动规划控制记录在读取后变化。', 'CONTENT_CHANGED');
    return;
  }
  const actual = await loadActivePlanning(input.root, input.registration.plan.ownerWorkId);
  if (actual.root !== input.root || actual.stateText !== input.stateText || digest(actual.registration) !== digest(input.registration)
    || actual.definitionPath !== input.definitionPath || actual.reviewPath !== input.reviewPath || digest(actual.issues) !== digest(input.issues))
    fail('活动规划或其确认依据在读取后变化。', 'CONTENT_CHANGED');
}
