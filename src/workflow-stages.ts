import { createHash } from 'node:crypto';
import { lstat, readFile, unlink } from 'node:fs/promises';
import { readProjectMetadata } from './core.js';
import { applyChanges, assertSafePath, hasPendingTransaction, readTextIfExists, withProjectLock, assertSafePaths, proveTextInputs, TextReadInput } from './files.js';
import type { TextProof } from './files.js';
import {assertSharedWriteProofs} from './shared-paths.js';
import type {SharedWriteProof} from './shared-paths.js';
import {confirmationSharingInput} from './confirmations.js';
import { resolveWorkRoot, withDeliveryLocation, withoutDeliveryBinding } from './delivery-location.js';
import { contentIssues, validateWorkId } from './work.js';
import { readWorkRecordText, parseWorkflowWorkRecord, assertSharedRegistrationReferences } from './workflow-work.js';
import type { WorkflowWorkRecord } from './workflow-work.js';
import { loadWorkflowPolicyContext, loadWorkflowPolicyInput, evaluateWorkflowPolicyInput, assertWorkflowPolicyInputCurrent, assertWorkflowPolicyContextCurrent, assertWorkflowActivationSharing } from './workflow-policy.js';
import type { WorkflowPolicyInput } from './workflow-policy.js';
import { evaluateWorkflowCondition, WORKFLOW_LIMITS } from './workflow-catalog.js';
import type { WorkflowStage, WorkflowApplicability } from './workflow-catalog.js';
import { parseOperationBinding, assertConfirmationSharing } from './confirmations.js';
import type { ConfirmationReference, OperationBinding } from './confirmations.js';
import { parseCheckpointRefs, parseEvidenceRefs } from './task-records.js';
import { loadActivePlanningInput, assertActivePlanningCurrent, parsePlanningState } from './planning.js';
import { inspectTaskVerificationInPlanning, loadTaskEvaluationInput, loadTaskSpecifications, loadTaskNodeMaterial, evaluateTaskNode, inspectTasksInPlanning, assertTaskEvaluationInputCurrent, assertTaskEvaluationSharing } from './tasks.js';
import type { TaskEvaluationOptions, TaskEvaluationInput, TaskStatus } from './tasks.js';
import { readVerificationInputs } from './verification-cases.js';
import {loadRepositoryInput, proveRepositoryInput} from './repository-input.js';
import { evaluateVerificationInput, loadVerificationEvaluationInput, assertVerificationEvaluationInputsCurrent, loadVerificationHistory, compareVerificationAuthorization, assertVerificationSelectionSharing } from './verification-runs.js';
import type { VerificationAuthorization, VerificationWorkflowInput, VerificationContexts, VerificationHistory } from './verification-runs.js';
import { parseVerificationSelection } from './verification-selection.js';
import type { VerificationSelection, VerificationArtifactSnapshots, VerificationEvidenceReference } from './verification-selection.js';
import { inspectWorkflowDependenciesInContext, loadWorkflowDependencyInputs, assertWorkflowDependencyInputsCurrent, withWorkflowDependencyTraversal } from './workflow-dependencies.js';
import type { WorkflowDependencyInputs } from './workflow-dependencies.js';
import { evaluateWorkflowStageFacts } from './workflow-stage-rules.js';

export type WorkflowStageOperation = 'start' | 'resume' | 'verify';
export interface WorkflowControlSnapshot {
  work: { revision: number; sha256: string };
  stages: { revision: number; sha256: string | null };
  tasks: { revision: number; sha256: string } | null;
}
export interface WorkflowStageCheckMapping { index: number; text: string; checkIds: string[] }
export interface WorkflowStageDelegation { kind: 'development-tasks'; planningRevision: string; taskIds: string[] }
export interface WorkflowStageTaskBinding {
  taskId: string; attemptId: string; eventSequence: number;
  artifactSnapshots: VerificationArtifactSnapshots; verificationBasisDigest: string;
}
export interface WorkflowStageStartInput {
  operationId: string; expectedStageRevision: number; verification: VerificationSelection;
  checkMappings: WorkflowStageCheckMapping[]; confirmationRefs: ConfirmationReference[];
  operationBinding?: OperationBinding; delegation?: WorkflowStageDelegation;
}
export interface WorkflowStageVerifyInput {
  operationId: string; expectedStageRevision: number; attemptId: string; evidenceRefs: VerificationEvidenceReference[];
  confirmationRefs?: ConfirmationReference[];
}
type Input = WorkflowStageStartInput | WorkflowStageVerifyInput;
export interface StageEvent {
  sequence: number; workflowRevision: number; operationId: string; operation: WorkflowStageOperation; stageId: string; attemptId: string; at: string;
  input: Input; inputDigest: string; planId: string; startEventSequence: number; startBasisDigest: string;
  completionBasisDigest: string | null; artifactSnapshots: VerificationArtifactSnapshots;
  verificationBasisDigest: string | null; taskBindings: WorkflowStageTaskBinding[];
}
interface StageState { schemaVersion: 1; workId: string; revision: number; events: StageEvent[] }
export interface WorkflowStageStatus {
  stageId: string; workflowRevision: number; applicability: WorkflowApplicability; effectiveStatus: 'pending' | 'active' | 'verified' | 'blocked' | 'stale' | 'not-applicable';
  attemptId: string | null; eventSequence: number | null; startBasisDigest: string | null; completionBasisDigest: string | null;
  artifactSnapshots: VerificationArtifactSnapshots; verificationBasisDigest: string | null; taskBindings: WorkflowStageTaskBinding[];
  verification: VerificationSelection | null; checkMappings: WorkflowStageCheckMapping[]; evidenceRefs: VerificationEvidenceReference[];
  confirmationRefs: ConfirmationReference[]; operationBinding?: OperationBinding; delegation: WorkflowStageDelegation | null;
  technicalReady: boolean; issues: string[];
}
const maximum = 2 * 1024 * 1024;
function fail(message: string, code = 'INVALID_WORKFLOW_STAGE'): never { throw Object.assign(new Error(message), { code }); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key)!))) fail('阶段记录包含未知字段或非普通对象。');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 10000 || value.includes('\0')) fail('阶段文本无效。'); return value; }
function id(value: unknown): string { const result = text(value); validateWorkId(result); return result; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 10000) fail('阶段修订或序号无效。'); return Number(value); }
function sha(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/u.test(result)) fail('阶段摘要无效。'); return result; }
function list<T>(value: unknown, parse: (entry: unknown) => T, limit = 1000): T[] { if (!Array.isArray(value) || value.length > limit) fail('阶段列表超出限制。'); return value.map(parse); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`; return JSON.stringify(value); }
function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function bytesHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stagePath(workId: string): string { validateWorkId(workId); return `.tiller/work/${workId}/stages/state.json`; }
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function operation(value: unknown): WorkflowStageOperation { if (!['start', 'resume', 'verify'].includes(String(value))) fail('阶段操作必须为 start/resume/verify。'); return value as WorkflowStageOperation; }
function delegation(value: unknown): WorkflowStageDelegation {
  const item = object(value, ['kind', 'planningRevision', 'taskIds']);
  const taskIds = list(item.taskIds, id);
  if (item.kind !== 'development-tasks' || !taskIds.length || new Set(taskIds).size !== taskIds.length) fail('开发委托须明确非空且不重复的任务集合。');
  return { kind: 'development-tasks', planningRevision: id(item.planningRevision), taskIds };
}
function mappings(value: unknown): WorkflowStageCheckMapping[] {
  return list(value, raw => { const item = object(raw, ['index', 'text', 'checkIds']); const checkIds = list(item.checkIds, text);
    if (!checkIds.length || new Set(checkIds).size !== checkIds.length) fail('阶段检查须映射非空不重复的实际检查。');
    return { index: integer(item.index), text: text(item.text), checkIds }; }, 128);
}
function parseInput(value: unknown, kind: WorkflowStageOperation): Input {
  const common = ['operationId', 'expectedStageRevision'];
  if (kind === 'verify') {
    const item = object(value, [...common, 'attemptId', 'evidenceRefs', 'confirmationRefs']);
    return { operationId: id(item.operationId), expectedStageRevision: integer(item.expectedStageRevision), attemptId: id(item.attemptId), evidenceRefs: parseEvidenceRefs(item.evidenceRefs),
      ...(item.confirmationRefs === undefined ? {} : { confirmationRefs: parseCheckpointRefs(item.confirmationRefs) }) };
  }
  const item = object(value, [...common, 'verification', 'checkMappings', 'confirmationRefs', 'operationBinding', 'delegation']);
  return { operationId: id(item.operationId), expectedStageRevision: integer(item.expectedStageRevision), verification: parseVerificationSelection(item.verification),
    checkMappings: mappings(item.checkMappings), confirmationRefs: parseCheckpointRefs(item.confirmationRefs),
    ...(item.operationBinding === undefined ? {} : { operationBinding: parseOperationBinding(item.operationBinding) }),
    ...(item.delegation === undefined ? {} : { delegation: delegation(item.delegation) }) };
}
function snapshots(value: unknown): VerificationArtifactSnapshots {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256) fail('阶段产物快照格式无效。');
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => {
    id(key); if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 1000) fail('阶段文件快照格式无效。');
    return [key, Object.fromEntries(Object.entries(raw).map(([path, digest]) => [text(path), sha(digest)]))];
  }));
}
function taskBindings(value: unknown): WorkflowStageTaskBinding[] {
  return list(value, raw => { const item = object(raw, ['taskId', 'attemptId', 'eventSequence', 'artifactSnapshots', 'verificationBasisDigest']);
    return { taskId: id(item.taskId), attemptId: id(item.attemptId), eventSequence: integer(item.eventSequence), artifactSnapshots: snapshots(item.artifactSnapshots), verificationBasisDigest: sha(item.verificationBasisDigest) }; });
}
function empty(workId: string): StageState { return { schemaVersion: 1, workId, revision: 0, events: [] }; }
export function parseWorkflowStageState(value: unknown, workId: string): StageState {
  const raw = object(value, ['schemaVersion', 'workId', 'revision', 'events']);
  if (raw.schemaVersion !== 1) fail('阶段记录仅支持当前版本 1；原件保留。', 'UNSUPPORTED_RECORD_VERSION');
  if (raw.workId !== workId) fail('阶段记录工作身份不匹配。');
  const events = list(raw.events, entry => {
    const item = object(entry, ['sequence', 'workflowRevision', 'operationId', 'operation', 'stageId', 'attemptId', 'at', 'input', 'inputDigest', 'planId', 'startEventSequence', 'startBasisDigest', 'completionBasisDigest', 'artifactSnapshots', 'verificationBasisDigest', 'taskBindings']);
    const kind = operation(item.operation); const input = parseInput(item.input, kind); const stageId = id(item.stageId); const at = text(item.at);
    if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail('阶段时间无效。');
    const event: StageEvent = { sequence: integer(item.sequence), workflowRevision: integer(item.workflowRevision), operationId: id(item.operationId), operation: kind, stageId, attemptId: id(item.attemptId), at,
      input, inputDigest: sha(item.inputDigest), planId: sha(item.planId), startEventSequence: integer(item.startEventSequence), startBasisDigest: sha(item.startBasisDigest),
      completionBasisDigest: item.completionBasisDigest === null ? null : sha(item.completionBasisDigest), artifactSnapshots: snapshots(item.artifactSnapshots),
      verificationBasisDigest: item.verificationBasisDigest === null ? null : sha(item.verificationBasisDigest), taskBindings: taskBindings(item.taskBindings) };
    if (input.operationId !== event.operationId || event.inputDigest !== hash({ workId, stageId, operation: kind, input })) fail('阶段输入与事件摘要不一致。');
    return event;
  });
  const revision = integer(raw.revision); const current = new Map<string, StageEvent>(); const operationIds = new Set<string>();
  if (revision !== events.length) fail('阶段修订与事件数不一致。');
  for (const [index, event] of events.entries()) {
    const stageKey = `${event.workflowRevision}:${event.stageId}`;
    const previous = current.get(stageKey);
    if (!event.workflowRevision || (index > 0 && event.workflowRevision < events[index - 1]!.workflowRevision)) fail('阶段流程代际必须为正数并按时间递增。');
    if (event.sequence !== index + 1 || event.input.expectedStageRevision !== index || operationIds.has(event.operationId)) fail('阶段事件顺序或操作标识冲突。');
    operationIds.add(event.operationId);
    if (event.operation === 'verify') {
      const start = events[event.startEventSequence - 1];
      if (!previous || previous.operation === 'verify' || !start || start.operation === 'verify' || start.stageId !== event.stageId || start.workflowRevision !== event.workflowRevision
        || event.startEventSequence !== previous.startEventSequence || event.attemptId !== start.attemptId || !('attemptId' in event.input)
        || event.input.attemptId !== event.attemptId || event.startBasisDigest !== start.startBasisDigest || !event.completionBasisDigest || !event.verificationBasisDigest) fail('阶段验证缺少对应当前开始事实。');
    } else {
      if (event.operation === 'start' ? !!previous : !previous) fail('阶段开始或接续顺序无效。');
      if (event.startEventSequence !== event.sequence || event.attemptId !== `attempt-${hash({ workId, stageId: event.stageId, operation: event.operation, input: event.input }).slice(0, 24)}`
        || event.completionBasisDigest !== null || event.verificationBasisDigest !== null || Object.keys(event.artifactSnapshots).length || event.taskBindings.length) fail('阶段开始事件含伪造完成事实。');
    }
    current.set(stageKey, event);
  }
  return { schemaVersion: 1, workId, revision, events };
}
async function controlText(root: string, path: string): Promise<string | null> {
  await assertSafePaths(root, [path]); const absolute = await assertSafePath(root, path);
  try {
    const stats = await lstat(absolute);
    if (!stats.isFile() || stats.nlink !== 1 || stats.size > maximum) fail('控制文件必须是有界普通单链接文件。');
    const bytes = await readFile(absolute); if (bytes.length > maximum) fail('控制文件超出大小限制。');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function parseWorkflowControlSnapshot(value: unknown): WorkflowControlSnapshot {
  const item = object(value, ['work', 'stages', 'tasks']);
  const part = (raw: unknown, nullable: boolean) => { const part = object(raw, ['revision', 'sha256']); return { revision: integer(part.revision), sha256: nullable && part.sha256 === null ? null : sha(part.sha256) }; };
  const work = part(item.work, false); const stages = part(item.stages, true); const tasks = item.tasks === null ? null : part(item.tasks, false);
  if (stages.sha256 === null && stages.revision !== 0) fail('缺失阶段记录不能声明非零修订。');
  return { work: { revision: work.revision, sha256: work.sha256! }, stages, tasks: tasks && { revision: tasks.revision, sha256: tasks.sha256! } };
}
function assertStageGenerations(state: StageState, record: WorkflowWorkRecord): void {
  const generations = new Set([1, ...record.operations.filter(operation => operation.kind === 'workflow-change').map(operation => operation.revision)]);
  if (state.events.some(event => event.workflowRevision > record.workflowRevision || !generations.has(event.workflowRevision)))
    fail('阶段记录引用尚不存在的流程代际。');
}
export async function readWorkflowControlSnapshot(rootInput: string, workId: string, includeTasks = false): Promise<WorkflowControlSnapshot> {
  const root = await resolveWorkRoot(rootInput, workId);
  await readProjectMetadata(root);
  const workText = await readWorkRecordText(root, workId); if (workText === null) fail('工作记录缺失。');
  const record = parseWorkflowWorkRecord(JSON.parse(workText), workId);
  const stages = await controlText(root, stagePath(workId)); const state = stages === null ? empty(workId) : parseWorkflowStageState(JSON.parse(stages), workId);
  assertStageGenerations(state, record);
  const tasks = includeTasks ? await controlText(root, `.tiller/work/${workId}/tasks.json`) : null;
  if (includeTasks && tasks === null) fail('开发委托缺少实际任务记录。');
  return { work: { revision: record.revision, sha256: bytesHash(workText) }, stages: { revision: state.revision, sha256: stages === null ? null : bytesHash(stages) },
    tasks: tasks === null ? null : { revision: parsePlanningState(tasks, workId).revision, sha256: bytesHash(tasks) } };
}
async function round(root: string, workId: string, context: Awaited<ReturnType<typeof loadWorkflowPolicyContext>>,
  override?: StageState, extra?: WorkflowStageDelegation) {
  const workText = context.recordText ?? await readWorkRecordText(root, workId);
  const original = await controlText(root, stagePath(workId));
  const actual = original === null ? empty(workId) : parseWorkflowStageState(JSON.parse(original), workId);
  assertStageGenerations(actual, context.record);
  const state = override ?? actual;
  const currentEvents = state.events.filter(event => event.workflowRevision === context.record.workflowRevision);
  const tasksPath = `.tiller/work/${workId}/tasks.json`;
  let tasksText: string | null | undefined;
  let development: { planning: Awaited<ReturnType<typeof loadActivePlanningInput>> } | null = null;
  const developmentIssues: string[] = [];
  const controlSnapshot: WorkflowControlSnapshot = { work: { revision: context.record.revision, sha256: bytesHash(workText!) }, stages: { revision: actual.revision, sha256: original === null ? null : bytesHash(original) }, tasks: null };
  async function loadDevelopment() {
    if (tasksText !== undefined) return;
    try {
      tasksText = await controlText(root, tasksPath);
      if (tasksText === null) fail('开发委托缺少当前任务记录。');
      const planningState = parsePlanningState(tasksText, workId);
      controlSnapshot.tasks = {revision: planningState.revision, sha256: bytesHash(tasksText)};
      const directory = `.tiller/work/${workId}`;
      const notesPath = `${directory}/work.md`;
      const planning = await loadActivePlanningInput(root, workId, { root, path: tasksPath, original: tasksText,
        state: planningState, work: { record: context.record, original: workText!,
          paths: { directory, record: `${directory}/record.json`, notes: notesPath }, notes: await readTextIfExists(root, notesPath) } }, context.recordText === undefined ? undefined : context);
      development = { planning };
    } catch (error) { tasksText ??= null; developmentIssues.push((error as Error).message); }
  }
  if (extra) await loadDevelopment();
  return { root, workId, context, state, currentEvents, original, controlSnapshot,
    get development() { return development; }, get tasksInput() { return tasksText === undefined ? undefined : {path: tasksPath, text: tasksText}; },
    loadDevelopment, developmentIssues };
}
type Round = Awaited<ReturnType<typeof round>>;
/** Materialize one operation's inputs, then execute its declared stage DAG. */
async function loadStageEvaluation(current: Round) {
  const stages = new Map(current.context.snapshot.definition.stages.map(stage => [stage.id, stage]));
  const latest = new Map<string, StageEvent>();
  for (const event of current.currentEvents) {
    if (!stages.has(event.stageId)) fail('阶段记录引用当前固定图之外的阶段。');
    latest.set(event.stageId, event);
  }
  let history: VerificationHistory | undefined;
  const verificationInputs: Awaited<ReturnType<typeof loadVerificationEvaluationInput>>[] = [];
  const contexts: VerificationContexts = new Map();
  const source = current.context.repositoryInput ?? await loadRepositoryInput(current.root, current.context.record.scope.repositories, current.workId, current.context.metadata, current.context.materials);
  const policyInputs: Awaited<ReturnType<typeof loadWorkflowPolicyInput>>[] = [];
  async function declarePolicyReferences(references: readonly ConfirmationReference[]) {
    for (const batch of current.development?.planning.confirmationBatches ?? []) {
      if (policyInputs.some(input => input.confirmations.inputs === batch.inputs)
        || !references.some(ref => batch.available.some(read => canonical(read.reference) === canonical(ref)))) continue;
      const confirmations = {...batch, references: [...new Map([...batch.references, ...batch.available.map(read => read.reference)].map(ref => [canonical(ref), ref])).values()],
        reads: [...new Map([...batch.reads, ...batch.available].map(read => [canonical(read.reference), read])).values()]};
      policyInputs.push(await loadWorkflowPolicyInput(current.context, [], confirmations));
    }
    const known = new Set(policyInputs.flatMap(batch => batch.confirmations.references.map(canonical)));
    const missing = [...new Map(references.filter(ref => ref.workId === current.workId && !known.has(canonical(ref))).map(ref => [canonical(ref), ref])).values()];
    if (missing.length || !policyInputs.length) policyInputs.push(await loadWorkflowPolicyInput(current.context, missing));
  }
  async function policy(input: WorkflowPolicyInput) {
    await declarePolicyReferences(input.confirmationRefs);
    const first = policyInputs[0]!;
    const observed = {...first, confirmations: {...first.confirmations,
      references: policyInputs.flatMap(batch => batch.confirmations.references),
      reads: policyInputs.flatMap(batch => batch.confirmations.reads), errors: policyInputs.flatMap(batch => batch.confirmations.errors)}};
    return evaluateWorkflowPolicyInput(current.context, input, observed);
  }
  const facts: WorkflowStageStatus[] = [];
  type StartBasis = Awaited<ReturnType<typeof calculateStartBasis>>;
  const starts: {stageId: string; input: WorkflowStageStartInput; event: StageEvent; result: StartBasis}[] = [];
  const outputInputs: {reference: {repository: string; path: string}; text: string | null; error: string | null}[] = [];
  const outputSelections = new Set<string>();
  async function observeOutput(reference: {repository: string; path: string}, fresh = false) {
    try {
      const input = fresh && source.materials ? {...source, materials: new TextReadInput()} : source;
      const [contents] = await readVerificationInputs(current.root, [reference], input);
      return {reference, text: typeof contents === 'string' ? contents : contents!.toString('utf8'), error: null};
    } catch (error) { return {reference, text: null, error: (error as Error).message}; }
  }
  async function loadOutputs(ids: readonly string[]) {
    for (const id of ids) {
      const artifact = current.context.record.artifacts[id];
      if (!artifact) continue;
      const key = canonical(artifact.source);
      outputSelections.add(key);
      if (!outputInputs.some(input => canonical(input.reference) === key)) outputInputs.push(await observeOutput(artifact.source));
    }
  }
  let dependencyInputs: Awaited<ReturnType<typeof loadWorkflowDependencyInputs>> | undefined;
  const applicability = (stage: WorkflowStage) => evaluateWorkflowCondition(stage.when, current.context.record.impact);
  function stage(id: string) { const found = stages.get(id); if (!found) fail(`阶段不存在：${id}`); return found; }
  function started(event?: StageEvent): StageEvent | undefined { return event && current.state.events[event.startEventSequence - 1]; }
  async function outputs(ids: string[]) {
    await loadOutputs(ids.filter(id => {
      const declared = current.context.snapshot.definition.outputs.find(output => output.id === id);
      return declared && applicability(stage(declared.producer)) !== 'not-applicable';
    }));
    const snapshots: VerificationArtifactSnapshots = {}; const issues: string[] = [];
    for (const outputId of ids) {
      const declared = current.context.snapshot.definition.outputs.find(output => output.id === outputId);
      if (!declared) { issues.push(`产物未在固定图声明：${outputId}`); continue; }
      if (applicability(stage(declared.producer)) === 'not-applicable') continue;
      const artifact = current.context.record.artifacts[outputId];
      if (!artifact) { issues.push(`实际产物未登记：${outputId}`); continue; }
      outputSelections.add(canonical(artifact.source));
      const observed = outputInputs.find(input => canonical(input.reference) === canonical(artifact.source))!;
      if (observed.error || observed.text === null) { issues.push(observed.error ?? '阶段产物缺失。'); continue; }
      issues.push(...contentIssues(observed.text, artifact.source.path));
      snapshots[outputId] = {[`${artifact.source.repository}::${artifact.source.path}`]: bytesHash(observed.text)};
    }
    return {snapshots, issues};
  }
  const owner = current.context.recordText === undefined ? {} : {owner: current.context};
  const taskOptions: TaskEvaluationOptions = {...owner, source, contexts, authorization: authorizationCurrent};
  async function loadHistory() {
    if (!history) history = await loadVerificationHistory(current.root, current.workId, owner.owner);
    taskOptions.historyInput = history;
    return history;
  }
  // One declared task graph supplies later delegations; nodes are evaluated only when their stage needs them.
  let taskInput: TaskEvaluationInput | null = null;
  async function loadDevelopment() {
    await current.loadDevelopment();
    if (current.development && !taskInput) {
      await loadHistory();
      taskInput = await loadTaskEvaluationInput(current.development.planning, undefined,
        {...taskOptions, deferNodes: true, deferSpecifications: true});
    }
  }
  const taskFacts = new Map<string, TaskStatus>();
  const taskEvaluating = new Set<string>();
  const taskSelections = new Set<string>();
  function selectedTaskInput(ids: Iterable<string>): TaskEvaluationInput | null {
    if (!taskInput) return null;
    const selectedIds = [...ids]; const needed = new Set(selectedIds);
    for (const task of [...taskInput.order].reverse()) if (needed.has(task.id)) for (const dependency of task.dependencies) needed.add(dependency.taskId);
    const order = taskInput.order.filter(task => needed.has(task.id));
    const specifications = new Set(order.flatMap(task => Object.values(task.specifications).flat())
      .map(reference => JSON.stringify([reference.repository, reference.path])));
    return { ...taskInput, selectedIds, order, specifications: new Map([...taskInput.specifications].filter(([key]) => specifications.has(key))) };
  }
  async function development(taskIds?: readonly string[]) {
    if (taskIds?.length === 0 || taskIds === undefined && !current.development
      && !current.currentEvents.some(event => (event.input as WorkflowStageStartInput).delegation)) return null;
    await loadDevelopment();
    if (!current.development) return null;
    try {
      const planning = current.development.planning;
      if (!taskInput) fail('开发任务未包含在本次显式输入中。', 'TASK_INPUT_INCOMPLETE');
      await loadTaskSpecifications(planning, taskInput, taskIds ?? taskInput.selectedIds);
      const needed = new Set(taskIds ?? taskInput.selectedIds);
      for (const task of [...taskInput.order].reverse()) if (needed.has(task.id)) for (const dependency of task.dependencies) needed.add(dependency.taskId);
      for (const task of taskInput.order) if (needed.has(task.id)) {
        taskSelections.add(task.id);
        if (taskFacts.has(task.id)) continue;
        if (taskEvaluating.has(task.id)) fail('开发任务与阶段求值存在循环。', 'WORKFLOW_STAGE_DEPENDENCY_CYCLE');
        taskEvaluating.add(task.id);
        try { await loadTaskNodeMaterial(planning, taskInput, task.id, taskFacts); taskFacts.set(task.id, await evaluateTaskNode(planning, taskInput, task.id, taskFacts)); }
        finally { taskEvaluating.delete(task.id); }
      }
      return {planning, status: await inspectTasksInPlanning(planning, taskIds, { input: taskInput, tasks: [...taskFacts.values()] })};
    }
    catch (error) { current.developmentIssues.push((error as Error).message); return null; }
  }
  function status(id: string): WorkflowStageStatus {
    const result = facts.find(row => row.stageId === id);
    if (!result) fail('阶段依赖尚未按拓扑执行。', 'WORKFLOW_STAGE_DEPENDENCY_CYCLE');
    return result;
  }
  function startFact(id: string) {
    const observed = starts.find(row => row.stageId === id);
    if (!observed) fail('阶段开始依据未包含在本次拓扑输入中。', 'WORKFLOW_STAGE_INPUT_INCOMPLETE');
    return observed.result;
  }
  async function authorizationCurrent(root: string, workId: string, saved: VerificationAuthorization): Promise<boolean> {
    if (root !== current.root || workId !== current.workId) {
      try { return compareVerificationAuthorization(saved, await inspectWorkflowVerificationAuthorization(root, workId, saved.input,
        {reuseObservation: saved.input.taskId !== undefined})); } catch { return false; }
    }
    try { return compareVerificationAuthorization(saved, await verificationAuthorization(saved.input, saved.input.taskId !== undefined)); }
    catch { return false; }
  }
  async function verificationAuthorization(input: VerificationWorkflowInput, reuseObservation: boolean): Promise<VerificationAuthorization> {
    const observed = starts.find(row => row.stageId === input.stageId);
    if (!observed || observed.result.issues.length || observed.result.basisDigest !== observed.event.startBasisDigest)
      fail('观察所属阶段开始依据当前无效。', 'WORKFLOW_STAGE_STALE');
    let taskDigest: string | undefined;
    if (input.taskId !== undefined) {
      await loadDevelopment();
      const planning = current.development?.planning;
      if (!planning || observed.input.delegation?.planningRevision !== planning.registration.plan.revision
        || !observed.input.delegation.taskIds.includes(input.taskId)) fail('任务验证阶段与当前开发委托不一致。');
      const owners = [...latest.values()].map(started).filter(event => {
        const delegation = (event?.input as WorkflowStageStartInput | undefined)?.delegation;
        return delegation?.planningRevision === planning.registration.plan.revision && delegation.taskIds.includes(input.taskId!);
      });
      if (owners.length !== 1) fail('任务必须明确归属于唯一当前开发阶段委托。');
      taskDigest = await inspectTaskVerificationInPlanning(planning, input.taskId, !reuseObservation, taskOptions);
    }
    const currentInput = reuseObservation && input.taskId !== undefined
      ? {...input, confirmationRefs: [...observed.input.confirmationRefs]} : input;
    const {taskId: _taskId, ...policyInput} = currentInput;
    const authorizationPolicy = await policy({...policyInput, phase: 'start'});
    if (!authorizationPolicy.allowed) fail(`验证动作尚未获准：${authorizationPolicy.issues.join('；')}`);
    return {input: currentInput, attemptId: observed.event.attemptId, startBasisDigest: observed.result.basisDigest,
      workflowDigest: authorizationPolicy.workflowDigest, intentDigest: authorizationPolicy.intentDigest,
      policyDigest: hash({actions: authorizationPolicy.actions, requiredConfirmations: authorizationPolicy.requiredConfirmations,
        requiredBindings: authorizationPolicy.requiredBindings, confirmationBindings: authorizationPolicy.confirmationBindings}),
      ...(taskDigest === undefined ? {} : {taskDigest})};
  }
  function checkInput(definition: WorkflowStage, input: WorkflowStageStartInput): string[] {
    const issues: string[] = [];
    if (input.checkMappings.length !== definition.checks.length || input.checkMappings.some((mapping, index) => mapping.index !== index || mapping.text !== definition.checks[index]
      || mapping.checkIds.some(checkId => !input.verification.checks.some(check => check.id === checkId)))) issues.push('检查映射必须完整匹配固定阶段原文与实际选择的检查标识。');
    const declared = new Set(current.context.snapshot.definition.outputs.map(output => output.id));
    if (input.verification.checks.some(check => check.artifactIds.some(outputId => !declared.has(outputId)))) issues.push('阶段检查引用未声明的 outputId。');
    for (const output of definition.produces) if (!input.verification.checks.some(check => check.artifactIds.includes(output))) issues.push(`阶段验证未覆盖产出：${output}`);
    if (definition.actions.includes('edit-code') && !input.delegation) issues.push('edit-code 阶段必须明确委托当前开发任务。');
    if (input.delegation && !definition.actions.includes('edit-code')) issues.push('非代码开发阶段不能以开发委托代替自身验证。');
    if (input.delegation) {
      for (const taskId of input.delegation.taskIds) taskSelections.add(taskId);
      issues.push(...current.developmentIssues);
      const active = current.development?.planning;
      if (!active || active.registration.plan.revision !== input.delegation.planningRevision) issues.push('开发委托不是当前激活规划。');
      else {
        issues.push(...active.issues);
        if (input.delegation.taskIds.some(taskId => !active.registration.plan.tasks.some(task => task.id === taskId))) issues.push('开发委托引用当前规划之外的任务。');
      }
    }
    return issues;
  }
  async function startBasis(definition: WorkflowStage, input: WorkflowStageStartInput) {
    const result = await calculateStartBasis(definition, input);
    const actual = started(latest.get(definition.id));
    if (actual && canonical(actual.input) === canonical(input)) {
      const index = starts.findIndex(row => row.stageId === definition.id);
      const row = { stageId: definition.id, input, event: actual, result };
      if (index < 0) starts.push(row); else starts[index] = row;
    }
    return result;
  }
  async function calculateStartBasis(definition: WorkflowStage, input: WorkflowStageStartInput) {
    if (input.delegation) await loadDevelopment();
    if (input.delegation && current.development && taskInput) {
      const declared = taskInput;
      const ids = input.delegation.taskIds.filter(id => declared.order.some(task => task.id === id));
      await loadTaskSpecifications(current.development.planning, taskInput, ids);
    }
    const issues = [...current.context.sourceIssues, ...checkInput(definition, input)];
    const state = applicability(definition); if (state !== 'applicable') issues.push(`阶段条件${state === 'unresolved' ? '未知' : '不适用'}，不能登记执行。`);
    const dependencies = [];
    for (const dependency of definition.dependsOn) {
      const fact = await status(dependency);
      if (!fact.technicalReady) issues.push(`前置阶段尚未有效完成：${dependency}/${fact.effectiveStatus}`);
      dependencies.push({ stageId: dependency, applicability: fact.applicability, eventSequence: fact.eventSequence, completionBasisDigest: fact.completionBasisDigest });
    }
    const consumed = await outputs(definition.consumes); issues.push(...consumed.issues);
    const linked = await inspectWorkflowDependenciesInContext(current.root, current.context.record, current.context.snapshot, definition.id, dependencyInputs);
    issues.push(...linked.issues);
    const policyResult = await policy({ stageId: definition.id, phase: 'start', actions: definition.actions,
      confirmationRefs: input.confirmationRefs, ...(input.operationBinding ? { operationBinding: input.operationBinding } : {}) });
    issues.push(...policyResult.issues);
    const delegatedDefinition = input.delegation && current.development ? {
      planningRevision: input.delegation.planningRevision, taskIds: input.delegation.taskIds,
      definitionDigest: current.development.planning.registration.definitionDigest,
      taskDigests: input.delegation.taskIds.map(taskId => current.development!.planning.registration.taskDigests[taskId]),
    } : null;
    const basis = { workflowDigest: current.context.snapshot.digest, intentDigest: current.context.intentDigest, stageId: definition.id, applicability: state,
      dependencies, linkedDependencies: linked.facts, consumed: consumed.snapshots, verification: input.verification, checkMappings: input.checkMappings,
      confirmationBindings: policyResult.confirmationBindings, operationBinding: input.operationBinding ?? null, delegatedDefinition };
    return { issues, basisDigest: hash(basis), basis, consumed: consumed.snapshots };
  }
  async function completion(definition: WorkflowStage, input: WorkflowStageStartInput, attemptId: string, evidenceRefs: VerificationEvidenceReference[],
    confirmationRefs: ConfirmationReference[] = input.confirmationRefs) {
    const outputIds = [...new Set([...definition.produces, ...input.verification.checks.flatMap(check => check.artifactIds)])];
    const artifacts = await outputs(outputIds); const issues = [...artifacts.issues];
    const policyResult = await policy({ stageId: definition.id, phase: 'verify', actions: definition.actions,
      confirmationRefs, ...(input.operationBinding ? { operationBinding: input.operationBinding } : {}) });
    issues.push(...policyResult.issues);
    let verificationBasisDigest: string | null = null; let resolvedEvidence: VerificationEvidenceReference[] = [];
    try {
      const options = { ...owner, source, contexts, history: 'selected' as const, historyInput: await loadHistory(), authorization: authorizationCurrent, workflow: { stageId: definition.id, attemptId } };
      const observed = await loadVerificationEvaluationInput(current.root, current.workId, input.verification, evidenceRefs, artifacts.snapshots, options);
      verificationInputs.push(observed);
      const verified = evaluateVerificationInput(observed);
      issues.push(...verified.issues); verificationBasisDigest = verified.basisDigest; resolvedEvidence = verified.evidenceRefs;
    } catch (error) { issues.push((error as Error).message); }
    const taskBindings: WorkflowStageTaskBinding[] = [];
    const tasks = input.delegation ? await development(input.delegation.taskIds) : null;
    if (input.delegation) issues.push(...current.developmentIssues);
    if (input.delegation) for (const taskId of input.delegation.taskIds) {
      const task = tasks?.status.tasks.find(task => task.taskId === taskId);
      if (!task?.technicalReady || task.effectiveStatus !== 'verified' || !task.attemptId || task.eventSequence === null || !task.verificationBasisDigest) issues.push(`委托任务当前未有效验证：${taskId}`);
      else taskBindings.push({ taskId, attemptId: task.attemptId, eventSequence: task.eventSequence, artifactSnapshots: task.artifactSnapshots, verificationBasisDigest: task.verificationBasisDigest });
    }
    const basis = { artifactSnapshots: artifacts.snapshots, verificationBasisDigest, evidenceRefs: resolvedEvidence, taskBindings, confirmationBindings: policyResult.confirmationBindings };
    return { ...basis, issues, completionBasisDigest: hash(basis) };
  }

  async function calculateStatus(id: string): Promise<WorkflowStageStatus> {
    const definition = stage(id); const event = latest.get(id); const start = started(event);
    const state = applicability(definition); const input = start?.input as WorkflowStageStartInput | undefined;
    const facts = {stageId: id, workflowRevision: current.context.record.workflowRevision, applicability: state,
      sourceIssues: current.context.sourceIssues, event, start};
    if (state !== 'applicable' || !start || !input) return evaluateWorkflowStageFacts(facts);
    const basis = await startBasis(definition, input);
    const verification = event?.operation === 'verify' ? event.input as WorkflowStageVerifyInput : undefined;
    const completed = verification ? await completion(definition, input, start.attemptId, verification.evidenceRefs,
      verification.confirmationRefs ?? input.confirmationRefs) : undefined;
    return evaluateWorkflowStageFacts({...facts, basis, completion: completed});
  }
  async function evaluateNode(id: string, inputs: WorkflowDependencyInputs): Promise<WorkflowStageStatus> {
    if (facts.some(row => row.stageId === id)) fail('阶段节点已在本次拓扑输入中求值。', 'WORKFLOW_STAGE_INPUT_DUPLICATE');
    dependencyInputs = inputs;
    const result = await calculateStatus(id); facts.push(result); return result;
  }
  async function evaluate(ids: readonly string[], edgeStageIds: readonly string[] = [], extraReferences: readonly ConfirmationReference[] = []): Promise<void> {
    const visiting = new Set<string>(); const included = new Set<string>(); const order: string[] = [];
    function visit(id: string) {
      if (visiting.has(id)) fail('阶段依赖存在循环。', 'WORKFLOW_STAGE_DEPENDENCY_CYCLE');
      if (included.has(id)) return;
      if (included.size >= WORKFLOW_LIMITS.stages) fail('阶段检查超出节点上限。', 'WORKFLOW_STAGE_DEPENDENCY_LIMIT');
      visiting.add(id);
      for (const dependency of stage(id).dependsOn) visit(dependency);
      visiting.delete(id); included.add(id); order.push(id);
    }
    for (const id of ids) visit(id);
    const selectedStages = new Set([...order, ...edgeStageIds]);
    if ([...selectedStages].some(id => (started(latest.get(id))?.input as WorkflowStageStartInput | undefined)?.delegation))
      await loadDevelopment();
    const references = [...extraReferences];
    for (const stageId of selectedStages) {
      const event = latest.get(stageId); const start = started(event);
      if (start) references.push(...(start.input as WorkflowStageStartInput).confirmationRefs);
      if (event?.operation === 'verify') references.push(...((event.input as WorkflowStageVerifyInput).confirmationRefs ?? []));
    }
    await declarePolicyReferences(references);
    dependencyInputs = await loadWorkflowDependencyInputs(current.root, current.context.record, current.context.snapshot,
      [...new Set([...order, ...edgeStageIds])], {context: current.context, ownerInput: { current, evaluated: api }});
    for (const id of order) if (!facts.some(row => row.stageId === id)) await evaluateNode(id, dependencyInputs);
  }
  async function verifyInputs(includeDependencies = true, expectedHistory?: VerificationHistory, proofs?: TextProof[]) {
    await proveRepositoryInput(source, proofs);
    for (const observed of policyInputs) await assertWorkflowPolicyInputCurrent(current.context, observed, proofs);
    const consumedTasks = selectedTaskInput(taskSelections);
    if (consumedTasks?.order.length) await assertTaskEvaluationInputCurrent(consumedTasks, verificationInputs, expectedHistory, proofs);
    else await assertVerificationEvaluationInputsCurrent(verificationInputs, history ? [history] : [], expectedHistory, proofs);
    if (includeDependencies && dependencyInputs) await assertWorkflowDependencyInputsCurrent(dependencyInputs, {root: current.root, workId: current.workId});
    for (const input of outputInputs) if (outputSelections.has(canonical(input.reference))) {
      const root = source.repositories.get(input.reference.repository);
      const declared = root ? source.materials?.declared(root, input.reference.path) : undefined;
      if (proofs && declared) {
        proofs.push({root: root!, inputs: [await declared], maxBytes: 4 * 1024 * 1024,
          onChanged: () => fail('阶段产物在读取期间发生变化。', 'CONTENT_CHANGED')});
        continue;
      }
      const actual = await observeOutput(input.reference, true);
      if (actual.text !== input.text || actual.error !== input.error) fail('阶段产物在读取期间发生变化。', 'CONTENT_CHANGED');
    }
  }
  async function assertSharing(extra?: { definition: WorkflowStage; input: WorkflowStageStartInput;
    completion: Awaited<ReturnType<typeof completion>> | null }, visited = new Set<string>()): Promise<void> {
    const proofs: SharedWriteProof[] = [];
    const record = current.context.record;
    const references = [
      { repository: '.', path: '.tiller/project.json' }, { repository: '.', path: `.tiller/work/${current.workId}/record.json` },
      { repository: '.', path: record.workflow.path }, ...record.basis.map(item => item.reference), ...record.actionSources.map(item => item.reference),
    ];
    const confirmations: ConfirmationReference[] = [];
    const rows = facts.filter(fact => fact.applicability !== 'not-applicable').flatMap(fact => {
      const start = starts.find(row => row.stageId === fact.stageId);
      return start ? [{ definition: stage(fact.stageId), input: start.input, snapshots: fact.artifactSnapshots,
        confirmationRefs: [...start.input.confirmationRefs, ...fact.confirmationRefs], evidenceRefs: fact.evidenceRefs,
        complete: fact.effectiveStatus === 'verified' }] : [];
    });
    if (extra) rows.push({ definition: extra.definition, input: extra.input, snapshots: extra.completion?.artifactSnapshots ?? {},
      confirmationRefs: [...extra.input.confirmationRefs, ...(extra.completion?.confirmationBindings.map(item => item.reference) ?? [])],
      evidenceRefs: extra.completion?.evidenceRefs ?? [], complete: extra.completion !== null });
    for (const row of rows) {
      confirmations.push(...row.confirmationRefs);
      if (row.input.operationBinding) references.push(row.input.operationBinding.recovery.reference);
      for (const outputId of row.definition.consumes) {
        const artifact = record.artifacts[outputId];
        if (artifact) references.push(artifact.source);
      }
      for (const files of Object.values(row.snapshots)) for (const name of Object.keys(files)) {
        const separator = name.indexOf('::');
        references.push({ repository: name.slice(0, separator), path: name.slice(separator + 2) });
      }
      if (row.complete) await assertVerificationSelectionSharing(current.root, current.workId, row.input.verification, row.evidenceRefs, await loadHistory(),
        {...taskOptions, proofs});
    }
    if (current.controlSnapshot.stages.sha256 !== null) references.push({ repository: '.', path: stagePath(current.workId) });
    if (current.development && rows.some(row => row.input.delegation)) {
      const planning = current.development.planning;
      for (const path of [`.tiller/work/${current.workId}/tasks.json`, `.tiller/work/${current.workId}/plan.md`, planning.definitionPath, planning.reviewPath])
        references.push({ repository: '.', path });
      references.push(...planning.registration.specificationFiles);
      confirmations.push(...planning.registration.confirmationBindings.map(item => item.reference));
      if (planning.state.activePlanning) confirmations.push(planning.state.activePlanning.confirmation);
      if (taskInput) {
        const required = new Set([...taskSelections, ...rows.flatMap(row => row.input.delegation?.taskIds ?? [])]);
        await assertTaskEvaluationSharing(planning, selectedTaskInput(required)!, [...taskFacts.values()], undefined, proofs);
      }
    }
    await assertSharedRegistrationReferences(current.root, current.workId, references, proofs);
    const selectedConfirmations = [...new Map(confirmations.map(ref => [canonical(ref), ref])).values()];
    const batch = policyInputs.map(input => input.confirmations).find(batch => selectedConfirmations.every(ref => [...batch.references, ...batch.available.map(read => read.reference)]
      .some(known => canonical(known) === canonical(ref))));
    if (batch) proofs.push(...confirmationSharingInput(batch, selectedConfirmations));
    else await assertConfirmationSharing(current.root, selectedConfirmations, proofs);
    await assertWorkflowActivationSharing(current.root, record, proofs);
    for (const producer of dependencyInputs?.producers ?? []) {
      const ids = producer.stages.map(stage => stage.stageId).filter(stageId => {
        const key = canonical([producer.root, producer.context.record.id, stageId]);
        if (visited.has(key)) return false;
        if (visited.size >= 1024) fail('共享阶段依赖超过节点上限。');
        visited.add(key); return true;
      });
      if (!ids.length) continue;
      await withoutDeliveryBinding(async () => {
        const producerRoot = await resolveWorkRoot(producer.root, producer.context.record.id);
        if (producerRoot !== producer.root) fail('关联生产工作的活动目录已变化。', 'CONTENT_CHANGED');
        // The callback covers every stage loaded for this producer, including any newly visited stage.
        await withDeliveryLocation(producerRoot, producer.context.record.id, () => producer.assertSharing(visited));
      });
    }
    await assertSharedWriteProofs(proofs);
  }
  function artifact(outputId: string) {
    const item = current.context.record.artifacts[outputId];
    if (!item) return undefined;
    outputSelections.add(canonical(item.source));
    const observed = outputInputs.find(input => canonical(input.reference) === canonical(item.source));
    return { outputId, source: item.source, content: observed?.text ?? null };
  }
  const api = {policy, loadOutputs, loadDevelopment, loadHistory, stage, latest, started, status, startFact, startBasis, completion, development, evaluate, evaluateNode, verifyInputs,
    verificationAuthorization, taskOptions, assertSharing, artifact};
  return api;
}
interface EvaluationRound {root: string; workId: string; current: Round; evaluated: Awaited<ReturnType<typeof loadStageEvaluation>>;
  metadata: Awaited<ReturnType<typeof readProjectMetadata>>}
async function loadEvaluation(root: string, workId: string, override?: StageState, extra?: WorkflowStageDelegation,
  contextInput?: Awaited<ReturnType<typeof loadWorkflowPolicyContext>>): Promise<EvaluationRound> {
  if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
  const policy = contextInput ?? await loadWorkflowPolicyContext(root, workId, new TextReadInput());
  const metadata = policy.metadata ?? await readProjectMetadata(root);
  if (policy.root !== root || policy.record.id !== workId) fail('阶段输入不属于当前工作或目录。', 'CONTENT_CHANGED');
  const current = await round(root, workId, policy, override, extra);
  return { root, workId, current, evaluated: await loadStageEvaluation(current), metadata };
}
export async function assertWorkflowStageInputsCurrent(input: EvaluationRound): Promise<void> {
  await proveStageInputs(input, input.current.controlSnapshot);
}
async function proveStageInputs(input: EvaluationRound, expected: WorkflowControlSnapshot, expectedHistory?: VerificationHistory,
  planning = input.current.development?.planning): Promise<void> {
  const { root, workId, current, evaluated, metadata } = input;
  const proofs: TextProof[] = [];
  await evaluated.verifyInputs(true, expectedHistory, proofs);
  if (planning) await assertActivePlanningCurrent(planning, proofs);
  if (current.tasksInput) proofs.push({root, inputs: [{path: current.tasksInput.path, text: planning?.stateText ?? current.tasksInput.text}], control: true});
  await assertWorkflowPolicyContextCurrent(current.context, proofs);
  if (current.context.materials) proofs.push(...await current.context.materials.proofs());
  await proveTextInputs(proofs);
  const actual = await readWorkflowControlSnapshot(root, workId, current.controlSnapshot.tasks !== null);
  if (canonical(actual) !== canonical(expected) || canonical(await readProjectMetadata(root)) !== canonical(metadata))
    fail('阶段读取期间控制资料或工程映射已变化。', 'WORKFLOW_STAGE_INSPECTION_CHANGED');
}
/** Explicit graph owners load each work once, then separately prove all material at return. */
export async function loadWorkflowStageInputs(root: string, workId: string,
  context: Awaited<ReturnType<typeof loadWorkflowPolicyContext>>): Promise<EvaluationRound> {
  return withDeliveryLocation(root, workId, () => loadEvaluation(root, workId, undefined, undefined, context));
}
async function withEvaluation<T>(root: string, workId: string, fn: (input: EvaluationRound) => Promise<T>,
  override?: StageState, extra?: WorkflowStageDelegation,
  contextInput?: Awaited<ReturnType<typeof loadWorkflowPolicyContext>>): Promise<T> {
  return withWorkflowDependencyTraversal(async () => {
    const loaded = await loadEvaluation(root, workId, override, extra, contextInput);
    const value = await fn(loaded);
    await assertWorkflowStageInputsCurrent(loaded);
    return value;
  });
}
export type WorkflowStageInputs = EvaluationRound;
export type WorkflowPlanningProof = (expectedStateText?: string) => Promise<void>;
/** One explicit owner passes its inputs through all related calculations and verifies them at return. */
export async function withWorkflowStageInputs<T>(rootInput: string, workId: string,
  fn: (input: WorkflowStageInputs) => Promise<T>): Promise<T> {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withEvaluation(root, workId, fn));
}
/** Explicitly load the current planning input and pass it to a single operation. */
export async function withWorkflowPlanningInspection<T>(rootInput: string, workId: string,
  fn: (planning: Awaited<ReturnType<typeof loadActivePlanningInput>>, options: TaskEvaluationOptions, taskExecution: WorkflowTaskExecutionReader,
    prove: WorkflowPlanningProof) => Promise<T>): Promise<T> {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withEvaluation(root, workId, async loaded => {
    const {current, evaluated} = loaded;
    await evaluated.loadDevelopment();
    const required = current.context.snapshot.definition.stages.filter(stage => stage.actions.includes('edit-code')).flatMap(stage => stage.dependsOn);
    await evaluated.evaluate(required, current.context.snapshot.definition.stages.filter(stage => stage.actions.includes('edit-code')).map(stage => stage.id));
    for (const event of evaluated.latest.values()) {
      const started = evaluated.started(event);
      if (started && (started.input as WorkflowStageStartInput).delegation)
        await evaluated.startBasis(evaluated.stage(started.stageId), started.input as WorkflowStageStartInput);
    }
    const planning = current.development?.planning ?? await loadActivePlanningInput(root, workId, undefined, current.context.recordText === undefined ? undefined : current.context);
    const prove: WorkflowPlanningProof = async expectedStateText => {
      const expectedPlanning = expectedStateText === undefined ? planning : {...planning, stateText: expectedStateText,
        state: parsePlanningState(expectedStateText, workId)};
      const expected = expectedStateText === undefined ? current.controlSnapshot : {...current.controlSnapshot,
        tasks: {revision: expectedPlanning.state.revision, sha256: bytesHash(expectedStateText)}};
      await proveStageInputs(loaded, expected, undefined, expectedPlanning);
    };
    return fn(planning, evaluated.taskOptions, taskId => taskExecutionInInput(loaded, taskId, {}, true), prove);
  }));
}
export async function inspectWorkflowStages(rootInput: string, workId: string, stageId?: string | readonly string[],
  options: {context?: Awaited<ReturnType<typeof loadWorkflowPolicyContext>>} = {}) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withEvaluation(root, workId,
    input => inspectWorkflowStagesInInput(input, stageId), undefined, undefined, options.context));
}
export async function inspectWorkflowStagesInInput({root,workId,current,evaluated}: WorkflowStageInputs,
  stageId?: string | readonly string[]) {
    const ids = stageId === undefined ? current.context.snapshot.definition.stages.map(stage => stage.id)
      : typeof stageId === 'string' ? [id(stageId)] : stageId.map(id);
    await evaluated.evaluate(ids);
    const stages: WorkflowStageStatus[] = [];
    for (const stage of ids) stages.push(await evaluated.status(stage));
    const selectedStages = new Set(ids); const selectedTasks = new Set<string>();
    for (const id of selectedStages) {
      for (const dependency of evaluated.stage(id).dependsOn) selectedStages.add(dependency);
      const start = evaluated.started(evaluated.latest.get(id));
      for (const taskId of (start?.input as WorkflowStageStartInput | undefined)?.delegation?.taskIds ?? []) selectedTasks.add(taskId);
    }
    const taskIds = stageId === undefined ? undefined : [...selectedTasks];
    return { root, workId, revision: current.state.revision, context: current.context, controlSnapshot: current.controlSnapshot, development: await evaluated.development(taskIds),
      stages, issues: [...new Set(stages.flatMap(stage => stage.issues))] };
}
async function executionInInput({current, evaluated}: EvaluationRound, stageId: string, prepared = false) {
    const definition = evaluated.stage(id(stageId));
    if (!prepared) await evaluated.evaluate(definition.dependsOn, [stageId]);
    const started = evaluated.started(evaluated.latest.get(stageId));
    if (!started) fail('执行前必须具有当前受控阶段开始事实。', 'WORKFLOW_STAGE_START_REQUIRED');
    const input = started.input as WorkflowStageStartInput;
    const basis = prepared ? evaluated.startFact(stageId) : await evaluated.startBasis(definition, input);
    if (basis.issues.length || basis.basisDigest !== started.startBasisDigest) fail(`阶段开始依据当前无效：${basis.issues.join('；')}`, 'WORKFLOW_STAGE_STALE');
    return {root: current.root, workId: current.workId, stageId, workflowRevision: current.context.record.workflowRevision,
      attemptId: started.attemptId, startBasisDigest: started.startBasisDigest, verification: input.verification,
      checkMappings: input.checkMappings, delegation: input.delegation ?? null, confirmationRefs: input.confirmationRefs,
      workflowDigest: current.context.snapshot.digest, intentDigest: current.context.intentDigest, controlSnapshot: current.controlSnapshot};
}
export async function inspectWorkflowStageExecution(rootInput: string, workId: string, stageId: string) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withEvaluation(root, workId, input => executionInInput(input, stageId)));
}
export async function inspectWorkflowStageAuthorization(rootInput: string, workId: string, input: WorkflowPolicyInput) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withEvaluation(root, workId, async loaded => {
    const execution = await executionInInput(loaded, input.stageId);
    const policy = await loaded.evaluated.policy(input);
    return { execution, policy };
  }));
}
export async function inspectWorkflowVerificationAuthorization(rootInput: string, workId: string, input: VerificationWorkflowInput,
  options: {reuseObservation?: boolean} = {}): Promise<VerificationAuthorization> {
  const loaded = await loadWorkflowVerificationAuthorization(rootInput, workId, input, options);
  await loaded.prove();
  return loaded.authorization;
}
/** Materialized authorization with independent pre/post-write proofs, never a reusable permit. */
export async function loadWorkflowVerificationAuthorization(rootInput: string, workId: string, input: VerificationWorkflowInput,
  options: {reuseObservation?: boolean} = {}) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withWorkflowDependencyTraversal(async () => {
    const loaded = await loadEvaluation(root, workId);
    await executionInInput(loaded, input.stageId);
    const authorization = await loaded.evaluated.verificationAuthorization(input, options.reuseObservation === true);
    const prove = async (expectedHistory?: VerificationHistory) => withDeliveryLocation(root, workId, async () => {
      if (expectedHistory && (expectedHistory.root !== root || expectedHistory.workId !== workId)) fail('授权核验的预期历史不属于当前工作。');
      await proveStageInputs(loaded, loaded.current.controlSnapshot, expectedHistory);
    });
    return {authorization, prove};
  }));
}
function historical(event: StageEvent) {
  return { operationId: event.operationId, kind: `stage-${event.operation}`, stageId: event.stageId, workflowRevision: event.workflowRevision, revision: event.sequence, eventSequence: event.sequence,
    attemptId: event.attemptId, planId: event.planId, operationAllowed: true, technicalReady: event.operation === 'verify', changed: false, historical: true, currentValidity: 'not-evaluated' as const };
}
async function prepare(root: string, workId: string, stageId: string, kind: WorkflowStageOperation, input: Input, override?: StageState, sharing = false) {
  return withEvaluation(root, workId, async loaded => {
    const {current, evaluated} = loaded;
    const inputDigest = hash({ workId, stageId, operation: kind, input });
    const receipt = current.state.events.find(event => event.operationId === input.operationId);
    if (receipt) {
      if (receipt.inputDigest !== inputDigest || receipt.stageId !== stageId || receipt.operation !== kind) fail('阶段 operationId 已用于不同输入。', 'OPERATION_CONFLICT');
      return { loaded, current, inputDigest, receipt, planId: receipt.planId, fact: null, sharing: async () => {} };
    }
    if (input.expectedStageRevision !== current.state.revision) fail('阶段 expectedStageRevision 已过期。', 'REVISION_CONFLICT');
    const definition = evaluated.stage(stageId); const latest = evaluated.latest.get(stageId); const start = evaluated.started(latest);
    await evaluated.evaluate(definition.dependsOn, [stageId], input.confirmationRefs ?? []);
    const issues: string[] = [];
    if (kind === 'start' && latest) issues.push('阶段已有开始事实，请 resume。');
    if (kind !== 'start' && !start) issues.push('阶段没有开始事实，不能补造接续或验证。');
    const startInput = kind === 'verify' ? start?.input as WorkflowStageStartInput | undefined : input as WorkflowStageStartInput;
    const attemptId = kind === 'verify' ? (input as WorkflowStageVerifyInput).attemptId : `attempt-${inputDigest.slice(0, 24)}`;
    if (kind === 'verify' && (start?.attemptId !== attemptId || latest?.operation === 'verify')) issues.push('验证尝试不匹配或已经验证，请 resume。');
    const basis = startInput ? await evaluated.startBasis(definition, startInput) : null;
    if (basis) issues.push(...basis.issues);
    if (kind === 'verify' && basis && basis.basisDigest !== start?.startBasisDigest) issues.push('开始依据已变化，必须先 resume。');
    const complete = kind === 'verify' && startInput ? await evaluated.completion(definition, startInput, attemptId,
      (input as WorkflowStageVerifyInput).evidenceRefs, (input as WorkflowStageVerifyInput).confirmationRefs) : null;
    if (complete) issues.push(...complete.issues);
    const assertSharing = async () => { if (startInput && !issues.length) await evaluated.assertSharing({ definition, input: startInput, completion: complete }); };
    if (sharing) await assertSharing();
    const fact = { stageId, workflowRevision: current.context.record.workflowRevision, operation: kind, attemptId, startBasisDigest: basis?.basisDigest ?? null, startEventSequence: kind === 'verify' ? start?.sequence ?? null : current.state.revision + 1,
      completionBasisDigest: complete?.completionBasisDigest ?? null, artifactSnapshots: complete?.artifactSnapshots ?? {}, verificationBasisDigest: complete?.verificationBasisDigest ?? null,
      taskBindings: complete?.taskBindings ?? [], issues: [...new Set(issues)] };
    return { loaded, current, inputDigest, receipt: undefined, fact, sharing: assertSharing, planId: hash({ inputDigest, controlSnapshot: current.controlSnapshot, fact }) };
  }, override, 'delegation' in input ? input.delegation : undefined);
}
export async function planWorkflowStageOperation(rootInput: string, workId: string, stageId: string, kindInput: WorkflowStageOperation, value: unknown) {
  const kind = operation(kindInput); const input = parseInput(value, kind); id(stageId); const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const prepared = await prepare(root, workId, stageId, kind, input); if (prepared.receipt) return historical(prepared.receipt);
    return { operationId: input.operationId, kind: `stage-${kind}`, stageId, workflowRevision: prepared.current.context.record.workflowRevision, planId: prepared.planId, revision: prepared.current.state.revision,
      attemptId: prepared.fact!.attemptId, operationAllowed: !prepared.fact!.issues.length, technicalReady: kind === 'verify' && !prepared.fact!.issues.length,
      blockingReasons: prepared.fact!.issues, controlSnapshot: prepared.current.controlSnapshot, changed: false, historical: false };
  });
}
export async function applyWorkflowStageOperation(rootInput: string, workId: string, stageId: string, kindInput: WorkflowStageOperation, value: unknown, planId: string) {
  const kind = operation(kindInput); const input = parseInput(value, kind); id(stageId); sha(planId); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, () => withDeliveryLocation(root, workId, async () => {
    await readProjectMetadata(root);
    const prepared = await prepare(root, workId, stageId, kind, input);
    if (prepared.receipt) { if (prepared.planId !== planId) fail('历史阶段摘要不一致。', 'CONTENT_CHANGED'); return historical(prepared.receipt); }
    if (prepared.planId !== planId) fail('阶段控制字节或当前依据在预览后变化。', 'CONTENT_CHANGED');
    const fact = prepared.fact!; if (fact.issues.length || !fact.startBasisDigest || !fact.startEventSequence) fail(`阶段条件未满足：${fact.issues.join('；')}`, 'WORKFLOW_STAGE_BLOCKED');
    const state = structuredClone(prepared.current.state);
    const event: StageEvent = { sequence: state.revision + 1, workflowRevision: fact.workflowRevision, operationId: input.operationId, operation: kind, stageId, attemptId: fact.attemptId, at: new Date().toISOString(),
      input, inputDigest: prepared.inputDigest, planId, startEventSequence: fact.startEventSequence, startBasisDigest: fact.startBasisDigest,
      completionBasisDigest: fact.completionBasisDigest, artifactSnapshots: fact.artifactSnapshots, verificationBasisDigest: fact.verificationBasisDigest, taskBindings: fact.taskBindings };
    state.events.push(event); state.revision++; parseWorkflowStageState(state, workId);
    const after = json(state); if (Buffer.byteLength(after) > maximum) fail('阶段记录超过大小上限。');
    const path = stagePath(workId); const before = prepared.current.original;
    await prepared.sharing();
    const proveCommit = async (expected: WorkflowControlSnapshot) => {
      await proveStageInputs(prepared.loaded, expected);
    };
    await proveCommit(prepared.current.controlSnapshot);
    await applyChanges(root, [{ path, before, after }], async () => { if (await readTextIfExists(root, path) !== after) fail('阶段事务写入已被修改。', 'CONTENT_CHANGED'); });
    try {
      await proveCommit({...prepared.current.controlSnapshot, stages: {revision: state.revision, sha256: bytesHash(after)}});
      if (await readTextIfExists(root, path) !== after) fail('阶段写后依据已变化。', 'CONTENT_CHANGED');
    } catch (error) {
      if (await readTextIfExists(root, path) !== after) fail('阶段写后检查失败且控制文件被外部修改，保留外部内容。', 'CONTENT_CHANGED');
      if (before === null) await unlink(await assertSafePath(root, path));
      else await applyChanges(root, [{ path, before: after, after: before }]);
      throw error;
    }
    return { ...historical(event), changed: true, historical: false, currentValidity: 'verified-at-write' as const };
  }));
}
/** Task writes use the declared development stage; status reads remain cycle-free. */
async function taskExecutionInInput(loaded: EvaluationRound, taskId: string, options: { requireStarted?: boolean } = {}, prepared = false) {
    const {current, evaluated} = loaded;
    await evaluated.loadDevelopment();
    if (current.original === null) fail('任务执行须先登记开发阶段。', 'WORKFLOW_STAGE_START_REQUIRED');
    const candidates = [...evaluated.latest.values()].map(event => evaluated.started(event)!)
      .filter(event => {
        const delegation = (event.input as WorkflowStageStartInput).delegation;
        return delegation?.planningRevision === current.development?.planning.registration.plan.revision && delegation?.taskIds.includes(taskId);
      });
    if (candidates.length !== 1) fail('任务必须明确归属于唯一当前开发阶段委托。');
    const execution = await executionInInput(loaded, candidates[0]!.stageId, prepared);
    if (!current.development) fail('任务验证须具有当前有效规划。');
    const taskDigest = await inspectTaskVerificationInPlanning(current.development.planning, taskId, options.requireStarted === true, evaluated.taskOptions);
    return { ...execution, taskDigest };
}
export type WorkflowTaskExecutionReader = (taskId: string) => Promise<Awaited<ReturnType<typeof taskExecutionInInput>>>;
export async function inspectWorkflowTaskExecution(rootInput: string, workId: string, taskId: string, options: { requireStarted?: boolean } = {}) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withEvaluation(root, workId, loaded => taskExecutionInInput(loaded, taskId, options)));
}
