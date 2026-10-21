import { resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { withProjectLock } from './files.js';
import type { TextProof } from './files.js';
import {assertSharedWriteProofs} from './shared-paths.js';
import type {SharedWriteProof} from './shared-paths.js';
import { sha256 } from './core.js';
import { contentIssues, loadWorkRecord } from './work.js';
import { readVerificationReference } from './verification-cases.js';
import type { VerificationReference } from './verification-cases.js';
import { assertVerificationEvaluationInputsCurrent, assertVerificationSelectionSharing, evaluateVerificationInput, loadVerificationEvaluationInput, loadVerificationHistory } from './verification-runs.js';
import type { VerificationAuthorizationReader, VerificationEvaluationInput, VerificationHistory, VerificationContexts } from './verification-runs.js';
import type { VerificationArtifactSnapshots, VerificationEvidenceReference } from './verification-selection.js';
import { assertConfirmationSharing, confirmationSharingInput } from './confirmations.js';
import type { ConfirmationReference, FileRef, Scope } from './confirmations.js';
import { assertSharedRegistrationReferences } from './workflow-work.js';
import { loadActivePlanning, loadPlanningState, planningDigest, savePlanningState, assertNoDeliveryOperation } from './planning.js';
import type { PlanningState, PlanningTask, PlanningArtifact, HumanCheckpoint, TaskEvent, TaskOperation, TaskOperationInput, TaskReceipt } from './planning-types.js';
import { parseTaskInput, taskId as identifier } from './task-records.js';
import { inspectTaskArtifacts } from './task-artifacts.js';
import { gateIssue, inspectCheckpoints } from './gate-conditions.js';
import type { GateIssue } from './gate-conditions.js';
import { inspectExceptions } from './gate-exceptions.js';
import type { GateExceptionBinding } from './gate-exceptions.js';
import type { WorkflowTaskExecutionReader } from './workflow-stages.js';

export type TaskContext = Awaited<ReturnType<typeof loadActivePlanning>>;
type Context = TaskContext;
import { evaluateTaskNode, evaluateTaskStart } from './task-rules.js';
export { evaluateTaskNode } from './task-rules.js';
type RecordedStatus = 'pending' | 'active' | 'verified' | 'cancelled';
export interface TaskStatus {
  taskId: string; recordedStatus: RecordedStatus; effectiveStatus: RecordedStatus | 'blocked' | 'stale';
  blockingReasons: GateIssue[]; warnings: string[]; nextAction: string;
  attemptId: string | null; eventSequence: number | null; artifactSnapshots: VerificationArtifactSnapshots;
  verificationBasisDigest: string | null; technicalReady: boolean;
  exceptions?: GateExceptionBinding[]; failureReasons?: GateIssue[];
}
function fail(message: string, code = 'INVALID_TASK_OPERATION'): never { throw Object.assign(new Error(message), { code }); }
function operationName(value: string): TaskOperation {
  if (value !== 'start' && value !== 'verify' && value !== 'resume') fail('任务操作仅支持 start、verify、resume。');
  return value;
}
function startEvent(state: PlanningState, event: TaskEvent | undefined): TaskEvent | undefined {
  if (!event) return undefined;
  const start = state.events[event.startEventSequence - 1];
  return start?.kind === 'task-started' || start?.kind === 'task-resumed' ? start : undefined;
}
function issue(taskId: string, code: string, message: string): GateIssue {
  return gateIssue(code, message, { taskId, exceptionAllowed: ['DEPENDENCY_NOT_VERIFIED', 'DEPENDENCY_ARTIFACT_REQUIRED', 'VERIFICATION_REQUIRED'].includes(code) });
}
function planningIssues(context: Context, task: PlanningTask): GateIssue[] {
  return context.issues.map(message => issue(task.id, 'PLANNING_INVALID', message));
}
function findTask(context: Context, id: string): PlanningTask {
  const task = context.registration.plan.tasks.find(task => task.id === id);
  if (!task) fail(`当前规划未包含任务：${id}`, 'TASK_NOT_FOUND');
  return task;
}
type SpecificationObservation = { reference: VerificationReference; digest: string | null; issues: string[]; error: string | null };
type TaskIndexes = { tasks: Map<string, PlanningTask>; latest: Map<string, TaskEvent> };
export interface TaskEvaluationOptions {
  owner?: import('./workflow-policy.js').WorkflowPolicyContext;
  source?: import('./repository-input.js').RepositoryInput;
  contexts?: VerificationContexts;
  authorization?: VerificationAuthorizationReader;
  historyInput?: VerificationHistory;
  deferNodes?: boolean;
  deferSpecifications?: boolean;
}
type TaskMaterialObservation = { taskId: string } & (
  { kind: 'verification'; input: VerificationEvaluationInput } |
  { kind: 'artifacts'; artifacts: PlanningArtifact[]; scope: Scope; references: VerificationArtifactSnapshots; digest: string } |
  { kind: 'checkpoints'; operation: 'start' | 'verify'; checkpoints: HumanCheckpoint[]; scope: Scope; references: ConfirmationReference[]; digest: string }
);
export interface TaskEvaluationInput {
  readonly owner?: import('./workflow-policy.js').WorkflowPolicyContext;
  readonly source?: import('./repository-input.js').RepositoryInput;
  readonly contexts: VerificationContexts;
  readonly root: string;
  readonly workId: string;
  readonly identity: string;
  readonly order: readonly PlanningTask[];
  readonly selectedIds: readonly string[];
  readonly latest: ReadonlyMap<string, TaskEvent>;
  readonly specifications: Map<string, SpecificationObservation>;
  readonly history: VerificationHistory | null;
  readonly historyError: string | null;
  readonly nodes: Map<string, TaskNodeMaterial>;
  readonly materialObservations: TaskMaterialObservation[];
  readonly authorization?: VerificationAuthorizationReader;
}
export interface TaskPlanningEvaluation { input: TaskEvaluationInput; tasks: readonly TaskStatus[] }
function taskIndexes(context: Context): TaskIndexes {
  const latest = new Map<string, TaskEvent>();
  for (const event of context.state.events) if (event.kind !== 'planning-activated') latest.set(event.taskId, event);
  return { tasks: new Map(context.registration.plan.tasks.map(task => [task.id, task])), latest };
}
const specificationKey = (reference: VerificationReference): string => JSON.stringify([reference.repository, reference.path]);
const evaluationIdentity = (context: Context): string => planningDigest({ root: context.root, workId: context.registration.plan.ownerWorkId, registration: context.registration, state: context.state });
function selectedIds(context: Context, selection?: string | readonly string[]): string[] {
  return selection === undefined ? context.registration.plan.tasks.map(task => task.id) : typeof selection === 'string' ? [selection] : [...selection];
}
/** Declare the entire selected dependency graph before observing any node. */
export function loadTaskEvaluationInput(context: Context, selection?: string | readonly string[], options: TaskEvaluationOptions = {}): Promise<TaskEvaluationInput> {
  return loadEvaluationInput(context, selection, options);
}
async function loadEvaluationInput(context: Context, selection: string | readonly string[] | undefined, options: TaskEvaluationOptions,
  excludeCompletionTaskId?: string, requireHistory = false): Promise<TaskEvaluationInput> {
  const identity = evaluationIdentity(context);
  const indexes = taskIndexes(context);
  const ids = selectedIds(context, selection);
  const closure = new Set<string>();
  const remaining = [...ids];
  while (remaining.length) {
    const id = remaining.pop()!;
    if (closure.has(id)) continue;
    const task = indexes.tasks.get(id);
    if (!task) {
      if (ids.includes(id) && indexes.latest.has(id)) continue;
      fail(`当前规划未包含任务：${id}`, 'TASK_NOT_FOUND');
    }
    closure.add(id);
    remaining.push(...task.dependencies.map(dependency => dependency.taskId));
  }
  const selected = context.registration.plan.tasks.filter(task => closure.has(task.id));
  const degrees = new Map(selected.map(task => [task.id, task.dependencies.length]));
  const dependents = new Map<string, PlanningTask[]>();
  for (const task of selected) for (const dependency of task.dependencies) {
    const children = dependents.get(dependency.taskId) ?? [];
    children.push(task); dependents.set(dependency.taskId, children);
  }
  const order = selected.filter(task => !task.dependencies.length);
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const child of dependents.get(order[cursor]!.id) ?? []) {
      const degree = degrees.get(child.id)! - 1;
      degrees.set(child.id, degree);
      if (degree === 0) order.push(child);
    }
  }
  if (order.length !== selected.length) fail('任务依赖存在循环，不能求值。', 'TASK_DEPENDENCY_CYCLE');
  const references = new Map<string, VerificationReference>();
  for (const task of order) for (const reference of Object.values(task.specifications).flat()) references.set(specificationKey(reference), reference);
  const specifications = new Map<string, SpecificationObservation>();
  for (const [key, reference] of options.deferSpecifications ? [] : references) {
    try {
      const text = await readVerificationReference(context.root, reference, options.source);
      specifications.set(key, { reference: { ...reference }, digest: sha256(text), issues: JSON.parse(JSON.stringify(contentIssues(text, reference.path))) as string[], error: null });
    } catch (error) {
      specifications.set(key, { reference: { ...reference }, digest: null, issues: [], error: (error as Error).message });
    }
  }
  const needsHistory = requireHistory || order.some(task => task.id !== excludeCompletionTaskId
    && ['task-verified', 'task-verification-excepted'].includes(indexes.latest.get(task.id)?.kind ?? ''));
  let history = options.historyInput ?? null;
  let historyError: string | null = null;
  if (!history && needsHistory) {
    try { history = await loadVerificationHistory(context.root, context.registration.plan.ownerWorkId); }
    catch (error) { historyError = (error as Error).message; }
  }
  if (history && (history.root !== context.root || history.workId !== context.registration.plan.ownerWorkId)) fail('验证历史输入不属于当前任务工作。', 'TASK_INPUT_CHANGED');
  const input: TaskEvaluationInput = { ...(options.owner ? {owner: options.owner} : {}), ...(options.source ? {source: options.source} : {}), contexts: options.contexts ?? new Map(), root: context.root, workId: context.registration.plan.ownerWorkId, identity,
    selectedIds: ids, order, latest: indexes.latest, specifications, history, historyError, materialObservations: [], nodes: new Map(),
    ...(options.authorization ? { authorization: options.authorization } : {}) };
  if (!options.deferNodes) await loadOrderedTasks(context, input, excludeCompletionTaskId);
  return input;
}
/** Load the declared specification closure without evaluating any task or repeating earlier reads. */
export async function loadTaskSpecifications(context: Context, input: TaskEvaluationInput, taskIds: readonly string[]): Promise<void> {
  if (input.identity !== evaluationIdentity(context)) fail('任务输入不属于当前规划或控制记录。', 'TASK_INPUT_CHANGED');
  const needed = new Set(taskIds);
  for (const task of [...input.order].reverse()) if (needed.has(task.id)) for (const dependency of task.dependencies) needed.add(dependency.taskId);
  for (const id of needed) if (!input.order.some(task => task.id === id)) fail('任务未包含在本次显式输入中。', 'TASK_INPUT_INCOMPLETE');
  const specifications = input.specifications;
  for (const task of input.order) if (needed.has(task.id)) for (const reference of Object.values(task.specifications).flat()) {
    const key = specificationKey(reference);
    if (specifications.has(key)) continue;
    try {
      const text = await readVerificationReference(context.root, reference, input.source);
      specifications.set(key, {reference: {...reference}, digest: sha256(text), issues: contentIssues(text, reference.path), error: null});
    } catch (error) { specifications.set(key, {reference: {...reference}, digest: null, issues: [], error: (error as Error).message}); }
  }
}
/** Prove only materials actually consumed by the declared task nodes; never rerun their graph. */
export async function assertTaskEvaluationInputCurrent(input: TaskEvaluationInput, verificationInputs: readonly VerificationEvaluationInput[] = [], expectedHistory?: VerificationHistory, proofs?: TextProof[]): Promise<void> {
  for (const observed of input.specifications.values()) {
    const root = input.source?.repositories.get(observed.reference.repository);
    if (proofs && root && observed.digest !== null && observed.error === null) {
      proofs.push({root, inputs: [{path: observed.reference.path, sha256: observed.digest}], maxBytes: 4 * 1024 * 1024,
        onChanged: () => fail('任务规格在核对期间已变化或不可读取，请重新检查。', 'TASK_SPECIFICATIONS_CHANGED')});
      continue;
    }
    let digest: string | null = null; let error: string | null = null;
    try { digest = sha256(await readVerificationReference(input.root, observed.reference)); }
    catch (problem) { error = (problem as Error).message; }
    if (digest !== observed.digest || error !== observed.error) fail('任务规格在核对期间已变化或不可读取，请重新检查。', 'TASK_SPECIFICATIONS_CHANGED');
  }
  const selected = new Set(input.order.map(task => task.id));
  const inputs = [...verificationInputs];
  for (const observed of input.materialObservations) {
    if (!selected.has(observed.taskId)) continue;
    if (observed.kind === 'verification') inputs.push(observed.input);
    else if (observed.kind === 'artifacts') {
      const current = await inspectTaskArtifacts(input.root, input.workId, observed.artifacts, observed.scope, observed.references);
      if (current.basisDigest !== observed.digest) fail('任务产物在求值后发生变化，请重新检查。', 'TASK_ARTIFACTS_CHANGED');
    } else {
      const current = await inspectCheckpoints(input.root, input.workId, observed.scope, observed.operation,
        observed.taskId, observed.checkpoints, observed.references);
      if (planningDigest(current) !== observed.digest) fail('任务检查点在求值后发生变化，请重新检查。', 'TASK_CHECKPOINTS_CHANGED');
    }
  }
  await assertVerificationEvaluationInputsCurrent(inputs, input.history ? [input.history] : [], expectedHistory, proofs);
}
async function observeCheckpoints(input: TaskEvaluationInput, task: PlanningTask, operation: 'start' | 'verify', references: ConfirmationReference[]) {
  const result = await inspectCheckpoints(input.root, input.workId, task.scope, operation, task.id, task.humanCheckpoints, references);
  if (references.length || task.humanCheckpoints.some(checkpoint => checkpoint.operation === operation)) {
    input.materialObservations.push({ taskId: task.id, kind: 'checkpoints', operation,
      ...structuredClone({ checkpoints: task.humanCheckpoints, scope: task.scope, references }), digest: planningDigest(result) });
  }
  return result;
}
async function evaluateStartBasis(context: Context, task: PlanningTask, checkpointRefs: ConfirmationReference[], input: TaskEvaluationInput, completed: ReadonlyMap<string, TaskStatus>) {
  return evaluateTaskStart(context, task, await observeCheckpoints(input, task, 'start', checkpointRefs), input, completed);
}
async function evaluateCompletion(context: Context, task: PlanningTask, references: VerificationArtifactSnapshots, checkpointRefs: ConfirmationReference[], evidenceRefs: VerificationEvidenceReference[], input: TaskEvaluationInput) {
  const artifacts = await inspectTaskArtifacts(context.root, context.registration.plan.ownerWorkId, task.artifacts, task.scope, references);
  input.materialObservations.push({ taskId: task.id, kind: 'artifacts',
    ...structuredClone({ artifacts: task.artifacts, scope: task.scope, references }), digest: artifacts.basisDigest });
  const checkpoints = await observeCheckpoints(input, task, 'verify', checkpointRefs);
  const issues = [...artifacts.issues.map(problem => ({ ...problem, taskId: task.id })), ...checkpoints.issues];
  const warnings = artifacts.warnings.map(warning => warning.message);
  let verificationBasisDigest: string | null = null; let resolvedEvidence: VerificationEvidenceReference[] = [];
  try {
    if (input.historyError) throw new Error(input.historyError);
    const options = { ...(input.owner ? {owner: input.owner} : {}), ...(input.source ? {source: input.source} : {}), contexts: input.contexts, history: 'selected' as const, taskId: task.id,
      ...(input.history ? { historyInput: input.history } : {}), ...(input.authorization ? { authorization: input.authorization } : {}) };
    const observed = await loadVerificationEvaluationInput(context.root, context.registration.plan.ownerWorkId,
      task.verification, evidenceRefs, artifacts.snapshots, options);
    input.materialObservations.push({ taskId: task.id, kind: 'verification', input: observed });
    const verification = evaluateVerificationInput(observed);
    issues.push(...verification.issues.map(message => issue(task.id, 'VERIFICATION_REQUIRED', message)));
    warnings.push(...verification.warnings); verificationBasisDigest = verification.basisDigest; resolvedEvidence = verification.evidenceRefs;
  } catch (error) { issues.push(issue(task.id, 'VERIFICATION_INVALID', (error as Error).message)); }
  return { issues, warnings, artifactSnapshots: artifacts.snapshots, artifactBasisDigest: artifacts.basisDigest, checkpointDigest: planningDigest(checkpoints.bindings), verificationBasisDigest, evidenceRefs: resolvedEvidence };
}
export type TaskCheckpointFacts = Awaited<ReturnType<typeof inspectCheckpoints>>;
export type TaskCompletionFacts = Awaited<ReturnType<typeof evaluateCompletion>>;
export interface TaskNodeMaterial { start: TaskCheckpointFacts; completion: TaskCompletionFacts | null }
/** Loading is owned by the graph orchestrator; rule evaluation never opens a file. */
export async function loadTaskNodeMaterial(context: Context, input: TaskEvaluationInput, taskId: string, completed: ReadonlyMap<string, TaskStatus>): Promise<void> {
  if (input.identity !== evaluationIdentity(context)) fail('任务输入不属于当前规划或控制记录。', 'TASK_INPUT_CHANGED');
  const task = input.order.find(item => item.id === taskId);
  if (!task || input.nodes.has(taskId)) fail('任务材料未声明或重复装载。', 'TASK_INPUT_INCOMPLETE');
  await loadTaskSpecifications(context, input, [taskId]);
  const latest = input.latest.get(taskId); const started = startEvent(context.state, latest);
  const start = await observeCheckpoints(input, task, 'start', started?.checkpointRefs ?? []);
  const basis = evaluateTaskStart(context, task, start, input, completed);
  const completion = latest?.kind === 'task-verified' || latest?.kind === 'task-verification-excepted'
    ? await evaluateCompletion(context, task, basis.referenceSnapshots, latest.checkpointRefs, latest.evidenceRefs, input) : null;
  input.nodes.set(taskId, {start, completion});
}
/** Walk an explicit topological sequence; completed values are ordinary calculation data. */
export async function evaluateTaskInputs(context: Context, input: TaskEvaluationInput): Promise<TaskStatus[]> {
  const completed = new Map<string, TaskStatus>();
  for (const task of input.order) completed.set(task.id, await evaluateTaskNode(context, input, task.id, completed));
  return [...completed.values()];
}
async function loadOrderedTasks(context: Context, input: TaskEvaluationInput, excludeTaskId?: string): Promise<Map<string, TaskStatus>> {
  if (input.identity !== evaluationIdentity(context)) fail('任务输入不属于当前规划或控制记录。', 'TASK_INPUT_CHANGED');
  const completed = new Map<string, TaskStatus>();
  for (const task of input.order) if (task.id !== excludeTaskId) {
    if (!input.nodes.has(task.id)) await loadTaskNodeMaterial(context, input, task.id, completed);
    completed.set(task.id, await evaluateTaskNode(context, input, task.id, completed));
  }
  return completed;
}

export async function inspectTaskStatus(rootInput: string, workId: string, taskId?: string) {
  if (taskId !== undefined) identifier(taskId);
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const state = await loadPlanningState(root, workId);
    if (!state.state.activePlanning) return { workId, revision: state.state.revision, planningRevision: null, ready: false, technicalReady: false, tasks: [] as TaskStatus[], blockingReasons: [gateIssue('PLANNING_REQUIRED', '尚未激活有效规划。', taskId === undefined ? {} : { taskId })] };
    const { withWorkflowPlanningInspection } = await import('./workflow-stages.js');
    return withWorkflowPlanningInspection(root, workId, async (context, options) => {
      const input = await loadTaskEvaluationInput(context, taskId, options);
      const tasks = await evaluateTaskInputs(context, input);
      const result = projectTaskStatuses(context, tasks, taskId);
      await assertTaskEvaluationInputCurrent(input);
      return result;
    });
  });
}
/** Pure projection of already evaluated task data for an individual delegation. */
export function projectTaskStatuses(context: Context, statuses: readonly TaskStatus[], selection?: string | readonly string[]) {
  const workId = context.registration.plan.ownerWorkId;
  const ids = selection === undefined ? undefined : typeof selection === 'string' ? [selection] : selection;
  const selected = new Set(ids ?? context.registration.plan.tasks.map(task => task.id));
  const byId = new Map(statuses.map(status => [status.taskId, status]));
  const tasks = context.registration.plan.tasks.filter(task => selected.has(task.id)).map(task => {
    const status = byId.get(task.id);
    if (!status) fail(`任务未包含在本次求值输入中：${task.id}`, 'TASK_INPUT_INCOMPLETE');
    return status;
  });
  const indexes = taskIndexes(context);
  for (const [id, latest] of indexes.latest) if (!indexes.tasks.has(id) && (ids === undefined || selected.has(id))) {
    tasks.push({ taskId: id, recordedStatus: latest.kind === 'task-verified' ? 'verified' : 'active', effectiveStatus: 'cancelled', blockingReasons: [], warnings: ['任务已在当前已确认规划中移除；历史事实保留。'], nextAction: '需要继续时在新规划中明确登记。', attemptId: latest.attemptId, eventSequence: latest.sequence, artifactSnapshots: {}, verificationBasisDigest: null, technicalReady: false });
  }
  if (ids?.some(id => !tasks.some(task => task.taskId === id))) fail(`任务不存在：${ids.join('、')}`, 'TASK_NOT_FOUND');
  const blockingReasons = tasks.flatMap(task => task.blockingReasons);
  const currentTasks = tasks.filter(task => task.effectiveStatus !== 'cancelled');
  const technicalReady = currentTasks.length > 0 && currentTasks.every(task => task.technicalReady);
  return { workId, revision: context.state.revision, planningRevision: context.registration.plan.revision, ready: technicalReady, technicalReady, tasks, blockingReasons };
}
export async function inspectTasksInPlanning(context: Context, selection?: string | readonly string[], evaluation?: TaskPlanningEvaluation) {
  if (evaluation) {
    if (evaluation.input.identity !== evaluationIdentity(context)) fail('任务输入不属于当前规划或控制记录。', 'TASK_INPUT_CHANGED');
    return projectTaskStatuses(context, evaluation.tasks, selection);
  }
  const input = await loadTaskEvaluationInput(context, selection);
  const tasks = await evaluateTaskInputs(context, input);
  const result = projectTaskStatuses(context, tasks, selection);
  await assertTaskEvaluationInputCurrent(input);
  return result;
}
/** Verification authorization uses dependencies and the task's start basis, never its completion. */
export async function inspectTaskVerificationInPlanning(context: Context, taskId: string, requireStarted: boolean, options: TaskEvaluationOptions = {}) {
  const task = findTask(context, taskId);
  const issues = planningIssues(context, task);
  if (requireStarted) {
    const input = await loadEvaluationInput(context, taskId, options, taskId);
    const completed = await loadOrderedTasks(context, input, taskId);
    const started = startEvent(context.state, input.latest.get(taskId));
    const basis = await evaluateStartBasis(context, task, started?.checkpointRefs ?? [], input, completed);
    issues.push(...basis.issues);
    if (!started) issues.push(issue(taskId, 'TASK_START_REQUIRED', '采集或执行任务验证前须实际开始任务。'));
    else if (started.taskDigest !== basis.taskDigest || started.startBasisDigest !== basis.startBasisDigest) issues.push(issue(taskId, 'START_BASIS_CHANGED', '任务开始依据已变化，须先 resume。'));
    await assertTaskEvaluationInputCurrent(input);
  }
  if (issues.length) fail(issues.map(item => item.message).join('；'), 'TASK_VERIFICATION_BLOCKED');
  return context.registration.taskDigests[taskId]!;
}
async function operationBasis(context: Context, task: PlanningTask, operation: TaskOperation, input: TaskOperationInput, options: TaskEvaluationOptions = {}) {
  const observed = await loadEvaluationInput(context, task.id, options, task.id, operation === 'verify');
  const completed = await loadOrderedTasks(context, observed, task.id);
  const latest = observed.latest.get(task.id); const started = startEvent(context.state, latest);
  const basis = await evaluateStartBasis(context, task, operation === 'verify' ? started?.checkpointRefs ?? [] : input.checkpointRefs, observed, completed);
  const issues = [...basis.issues];
  if (operation === 'start' && latest) issues.push(issue(task.id, 'TASK_ALREADY_STARTED', '已有任务开始事实；请使用 resume 记录新的继续点。'));
  if (operation !== 'start' && !started) issues.push(issue(task.id, 'TASK_START_REQUIRED', '没有受控开始事实，不能补造此前的开始或完成。'));
  if (operation === 'verify') {
    if (latest?.kind === 'task-verified') issues.push(issue(task.id, 'TASK_ALREADY_VERIFIED', '当前 attempt 已验证；重验须先 resume 创建新的 attempt。'));
    if (started && input.attemptId !== started.attemptId) issues.push(issue(task.id, 'ATTEMPT_MISMATCH', 'verify 引用的 attemptId 不是当前开始事实。'));
    if (started && (started.taskDigest !== basis.taskDigest || started.startBasisDigest !== basis.startBasisDigest)) issues.push(issue(task.id, 'START_BASIS_CHANGED', '开始后规格、前置结果或人工检查依据变化；请先 resume。'));
  }
  const completion = operation === 'verify' ? await evaluateCompletion(context, task, basis.referenceSnapshots, input.checkpointRefs, input.evidenceRefs, observed) : null;
  if (completion) issues.push(...completion.issues);
  const attemptId = operation === 'verify' ? input.attemptId! : `attempt-${planningDigest({ taskId: task.id, operation, input }).slice(0, 24)}`;
  const fact = { taskId: task.id, operation, attemptId, planningRevision: context.registration.plan.revision, taskDigest: basis.taskDigest, startBasisDigest: basis.startBasisDigest, dependencies: basis.dependencies, startEventSequence: operation === 'verify' ? started?.sequence ?? null : context.state.events.length + 1, checkpointDigest: completion?.checkpointDigest ?? basis.checkpointDigest, artifactSnapshots: completion?.artifactSnapshots ?? {}, verificationBasisDigest: completion?.verificationBasisDigest ?? null, evidenceRefs: completion?.evidenceRefs ?? [], issues };
  // Exclude operation IDs, state revision, generated attempts and exception decisions: requesting
  // an exception must not change the technical object to which that exception is bound.
  const technicalBasisDigest = planningDigest({ taskId: task.id, operation, planningRevision: fact.planningRevision,
    taskDigest: basis.taskDigest, startBasisDigest: basis.startBasisDigest, dependencies: basis.dependencies,
    ...(operation === 'verify' ? { attemptId: input.attemptId, startEventSequence: started?.sequence ?? null } : {}),
    checkpointDigest: fact.checkpointDigest, artifactSnapshots: fact.artifactSnapshots,
    artifactBasisDigest: completion?.artifactBasisDigest ?? null, verificationBasisDigest: fact.verificationBasisDigest,
    evidenceRefs: fact.evidenceRefs, issues });
  const authorization = await inspectExceptions(context.root, context.registration.plan.ownerWorkId, task.scope, operation, task.id, issues, technicalBasisDigest, input.exceptionRefs ?? []);
  await assertTaskEvaluationInputCurrent(observed);
  return { fact: { ...fact, technicalBasisDigest, authorization }, issues, warnings: completion?.warnings ?? [], attemptId, basis, completion, technicalBasisDigest, authorization, observed, completed };
}
/** Only a committing operation checks Git sharing of its evaluated dependency closure. */
export async function assertTaskEvaluationSharing(context: Context, observed: TaskEvaluationInput, statuses: readonly TaskStatus[],
  pending?: { taskId: string; operation: TaskOperation; input: TaskOperationInput;
    artifactSnapshots: VerificationArtifactSnapshots; evidenceRefs: VerificationEvidenceReference[] }, sharing?: SharedWriteProof[]): Promise<void> {
  const proofs = sharing ?? [];
  if (observed.identity !== evaluationIdentity(context)) fail('任务输入不属于当前规划或控制记录。', 'TASK_INPUT_CHANGED');
  const workId = context.registration.plan.ownerWorkId;
  const work = await loadWorkRecord(context.root, workId);
  const references: FileRef[] = [
    ...[...observed.specifications.values()].map(item => item.reference),
    ...[context.definitionPath, context.reviewPath, work.paths.record, work.paths.notes, work.record.workflow.path,
      '.tiller/project.json', `.tiller/work/${workId}/tasks.json`, `.tiller/work/${workId}/plan.md`,
      `.tiller/work/${workId}/stages/state.json`].map(path => ({ repository: '.', path })),
    ...[...work.record.basis, ...work.record.actionSources].map(source => source.reference),
  ];
  const confirmations: ConfirmationReference[] = pending ? [...pending.input.checkpointRefs, ...(pending.input.exceptionRefs ?? [])] : [];
  if (context.state.activePlanning) confirmations.push(context.state.activePlanning.confirmation);
  confirmations.push(context.registration.plan.basis.requirements, context.registration.plan.basis.design);
  const tasks = new Map(observed.order.map(task => [task.id, task]));
  const completed = new Map(statuses.map(status => [status.taskId, status]));
  function generatedOutput(artifact: PlanningArtifact, visited = new Set<string>()): FileRef | undefined {
    if (artifact.type === 'generated') return artifact.output;
    if (artifact.type !== 'reference') return undefined;
    const identity = `${artifact.taskId}::${artifact.artifactId}`;
    if (visited.has(identity)) fail('引用产物包含循环。', 'TASK_INPUT_INCOMPLETE');
    visited.add(identity);
    const source = tasks.get(artifact.taskId)?.artifacts.find(item => item.id === artifact.artifactId);
    if (!source) fail('引用产物不属于已求值的任务依赖。', 'TASK_INPUT_INCOMPLETE');
    return generatedOutput(source, visited);
  }
  for (const task of observed.order) {
    for (const reference of Object.values(task.basis)) if (reference) confirmations.push(reference);
    const latest = observed.latest.get(task.id);
    const started = startEvent(context.state, latest);
    const current = pending?.taskId === task.id ? pending : undefined;
    if (!current || current.operation === 'verify') {
      confirmations.push(...(started?.checkpointRefs ?? []), ...(started?.exceptions ?? []).map(item => item.reference));
    }
    if (!current && latest) confirmations.push(...latest.checkpointRefs, ...(latest.exceptions ?? []).map(item => item.reference));
    const snapshots = current ? current.artifactSnapshots : completed.get(task.id)?.artifactSnapshots;
    for (const artifact of task.artifacts) {
      const files = snapshots?.[artifact.id];
      if (!files) continue;
      const output = generatedOutput(artifact);
      for (const name of Object.keys(files)) {
        const separator = name.indexOf('::');
        const reference = { repository: name.slice(0, separator), path: name.slice(separator + 2) };
        if (!output || reference.repository !== output.repository || reference.path !== output.path) references.push(reference);
      }
    }
    if (current ? current.operation === 'verify' : latest?.kind === 'task-verified' || latest?.kind === 'task-verification-excepted') {
      await assertVerificationSelectionSharing(context.root, context.registration.plan.ownerWorkId, task.verification,
        current ? current.evidenceRefs : latest!.evidenceRefs, observed.history ?? undefined,
        {proofs, contexts: observed.contexts, ...(observed.source ? {source: observed.source} : {}), ...(observed.owner ? {owner: observed.owner} : {})});
    }
  }
  await assertSharedRegistrationReferences(context.root, context.registration.plan.ownerWorkId, references, proofs);
  const selectedConfirmations = [...new Map(confirmations.map(ref => [JSON.stringify(ref), ref])).values()];
  const batch = context.confirmationBatches?.find(batch => selectedConfirmations.every(ref => [...batch.references, ...batch.available.map(read => read.reference)]
    .some(known => JSON.stringify(known) === JSON.stringify(ref))));
  if (batch) proofs.push(...confirmationSharingInput(batch, selectedConfirmations));
  else await assertConfirmationSharing(context.root, selectedConfirmations, proofs);
  const { assertWorkflowActivationSharing } = await import('./workflow-policy.js');
  await assertWorkflowActivationSharing(context.root, work.record, proofs);
  if (!sharing) await assertSharedWriteProofs(proofs);
}
function replay(context: Context, taskId: string, operation: TaskOperation, input: TaskOperationInput) {
  const inputDigest = planningDigest({ workId: context.registration.plan.ownerWorkId, taskId, operation, input });
  const existing = context.state.operations.find(receipt => receipt.operationId === input.operationId);
  if (existing && (!('taskId' in existing) || existing.kind !== `task-${operation}` || existing.taskId !== taskId || existing.inputDigest !== inputDigest)) fail('相同 operationId 已用于不同任务、操作或输入。', 'OPERATION_CONFLICT');
  return { inputDigest, receipt: existing as TaskReceipt | undefined };
}
function workflowTaskBinding(stage: Awaited<ReturnType<WorkflowTaskExecutionReader>>) {
  return { stageId: stage.stageId, attemptId: stage.attemptId, startBasisDigest: stage.startBasisDigest,
    workflowDigest: stage.workflowDigest, intentDigest: stage.intentDigest,
    work: stage.controlSnapshot.work, stages: stage.controlSnapshot.stages };
}
async function prepare(root: string, workId: string, taskId: string, operation: TaskOperation, input: TaskOperationInput) {
  const loaded = await loadPlanningState(root, workId);
  // Historical receipts must not require a currently executable workflow stage.
  if (loaded.state.operations.some(receipt => receipt.operationId === input.operationId)) {
    const context = await loadActivePlanning(root, workId); const previous = replay(context, taskId, operation, input);
    if (previous.receipt) return { context, ...previous, evaluation: null, workflow: null, prove: null, planId: previous.receipt.basisDigest };
  }
  const { withWorkflowPlanningInspection } = await import('./workflow-stages.js');
  return withWorkflowPlanningInspection(root, workId, async (context, options, taskExecution, proveWorkflow) => {
    const previous = replay(context, taskId, operation, input);
    if (previous.receipt) return { context, ...previous, evaluation: null, workflow: null, prove: null, planId: previous.receipt.basisDigest };
    await assertNoDeliveryOperation(root, workId, input.operationId);
    if (input.expectedRevision !== context.state.revision) fail('expectedRevision 已过期，请重新检查任务。', 'REVISION_CONFLICT');
    const workflow = workflowTaskBinding(await taskExecution(taskId));
    const task = findTask(context, taskId); const evaluation = await operationBasis(context, task, operation, input, options);
    const prove = async (expectedStateText?: string) => {
      await assertNoDeliveryOperation(root, workId, input.operationId);
      const authorization = await inspectExceptions(root, workId, task.scope, operation, taskId, evaluation.issues,
        evaluation.technicalBasisDigest, input.exceptionRefs ?? []);
      if (planningDigest(authorization) !== planningDigest(evaluation.authorization)) fail('任务例外确认在读取后变化。', 'CONTENT_CHANGED');
      await assertTaskEvaluationInputCurrent(evaluation.observed);
      await proveWorkflow(expectedStateText);
    };
    return { context, ...previous, evaluation, workflow, prove, planId: planningDigest({ inputDigest: previous.inputDigest, state: context.stateText, fact: evaluation.fact, workflow }) };
  });
}
function historical(receipt: TaskReceipt) {
  return { ...receipt, status: receipt.exceptions?.length ? 'allowed-with-exceptions' : 'allowed', planId: receipt.basisDigest, changed: false, historical: true, historicalReceipt: true, currentValidity: 'not-evaluated' as const, limitation: '仅返回当时回执，不能代替当前 task status；当前依据可能已失效。' };
}
export async function planTaskOperation(rootInput: string, workId: string, taskId: string, operationInput: TaskOperation, value: unknown) {
  identifier(taskId); const operation = operationName(operationInput); const input = parseTaskInput(value, operation); const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const prepared = await prepare(root, workId, taskId, operation, input);
    if (prepared.receipt) return historical(prepared.receipt);
    const evaluated = prepared.evaluation!;
    return { operationId: input.operationId, planId: prepared.planId, basisDigest: prepared.planId, technicalBasisDigest: evaluated.technicalBasisDigest, changed: false, operationAllowed: evaluated.authorization.operationAllowed, technicalReady: operation === 'verify' && !evaluated.issues.length, blockingReasons: evaluated.authorization.blockingReasons, technicalIssues: evaluated.issues, exceptions: evaluated.authorization.exceptions, status: evaluated.authorization.operationAllowed && evaluated.authorization.exceptions.length ? 'allowed-with-exceptions' : evaluated.authorization.operationAllowed ? 'allowed' : 'blocked', warnings: evaluated.warnings, revision: prepared.context.state.revision, planningRevision: prepared.context.registration.plan.revision, taskId, attemptId: evaluated.attemptId };
  });
}
export async function applyTaskOperation(rootInput: string, workId: string, taskId: string, operationInput: TaskOperation, value: unknown, planId: string) {
  identifier(taskId); if (!/^[a-f0-9]{64}$/u.test(planId)) fail('任务计划摘要无效。');
  const operation = operationName(operationInput); const input = parseTaskInput(value, operation); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, () => withDeliveryLocation(root, workId, async () => {
    const prepared = await prepare(root, workId, taskId, operation, input);
    if (prepared.receipt) { if (prepared.planId !== planId) fail('历史操作摘要不一致。', 'CONTENT_CHANGED'); return historical(prepared.receipt); }
    const evaluated = prepared.evaluation!;
    if (!evaluated.authorization.operationAllowed) throw Object.assign(new Error('任务当前条件不满足，未写入成功状态。'), { code: 'TASK_BLOCKED', blockingReasons: evaluated.authorization.blockingReasons });
    if (prepared.planId !== planId) fail('任务依据在预览后发生变化，请重新预览。', 'CONTENT_CHANGED');
    const priorState = prepared.context.state; const state = structuredClone(priorState); const sequence = state.events.length + 1;
    const exceptionFacts = { technicalBasisDigest: evaluated.technicalBasisDigest, exceptions: evaluated.authorization.exceptions, failureReasons: evaluated.issues };
    const event: TaskEvent = { sequence, operationId: input.operationId, kind: operation === 'start' ? 'task-started' : operation === 'resume' ? 'task-resumed' : evaluated.issues.length ? 'task-verification-excepted' : 'task-verified', at: new Date().toISOString(), taskId, attemptId: evaluated.attemptId, planningRevision: prepared.context.registration.plan.revision, taskDigest: evaluated.basis.taskDigest, startBasisDigest: evaluated.basis.startBasisDigest, dependencies: evaluated.basis.dependencies, checkpointRefs: input.checkpointRefs, checkpointDigest: evaluated.fact.checkpointDigest, startEventSequence: evaluated.fact.startEventSequence!, artifactSnapshots: evaluated.fact.artifactSnapshots, verificationBasisDigest: evaluated.fact.verificationBasisDigest, evidenceRefs: evaluated.fact.evidenceRefs, ...exceptionFacts };
    const receipt: TaskReceipt = { operationId: input.operationId, inputDigest: prepared.inputDigest, kind: `task-${operation}`, revision: ++state.revision, planningRevision: event.planningRevision, basisDigest: planId, operationAllowed: true, technicalReady: operation === 'verify' && !evaluated.issues.length, blockingReasons: [], taskId, attemptId: event.attemptId, eventSequence: sequence, ...exceptionFacts };
    state.events.push(event); state.operations.push(receipt);
    await savePlanningState(root, workId, prepared.context.stateText, state, [], async () => {
      await assertTaskEvaluationSharing(prepared.context, evaluated.observed, [...evaluated.completed.values()],
        { taskId, operation, input, artifactSnapshots: evaluated.fact.artifactSnapshots, evidenceRefs: evaluated.fact.evidenceRefs });
      await prepared.prove!();
    }, async () => {
      await prepared.prove!(JSON.stringify(state, null, 2) + '\n');
    });
    return { ...receipt, status: evaluated.authorization.exceptions.length ? 'allowed-with-exceptions' : 'allowed', changed: true, historical: false };
  }));
}
