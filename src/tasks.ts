import { resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { withProjectLock } from './files.js';
import { contentIssues } from './work.js';
import { readVerificationReference } from './verification-cases.js';
import { evaluateVerificationSelection } from './verification-runs.js';
import type { VerificationArtifactSnapshots, VerificationEvidenceReference } from './verification-selection.js';
import type { ConfirmationReference } from './confirmations.js';
import { loadActivePlanning, loadPlanningState, planningDigest, savePlanningState, assertNoDeliveryOperation } from './planning.js';
import type { PlanningState, PlanningTask, TaskEvent, TaskOperation, TaskOperationInput, TaskReceipt, TaskDependencyBasis } from './planning-types.js';
import { parseTaskInput, taskId as identifier } from './task-records.js';
import { inspectTaskArtifacts } from './task-artifacts.js';
import { gateIssue, inspectCheckpoints } from './gate-conditions.js';
import type { GateIssue } from './gate-conditions.js';
import { inspectExceptions } from './gate-exceptions.js';
import type { GateExceptionBinding } from './gate-exceptions.js';

type Context = Awaited<ReturnType<typeof loadActivePlanning>>;
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
function taskEvents(state: PlanningState, taskId: string): TaskEvent[] {
  return state.events.filter((event): event is TaskEvent => event.kind !== 'planning-activated' && event.taskId === taskId);
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
function cacheFor() { return new Map<string, Promise<TaskStatus>>(); }
async function evaluateStartBasis(context: Context, task: PlanningTask, checkpointRefs: ConfirmationReference[], cache: Map<string, Promise<TaskStatus>>) {
  const issues = planningIssues(context, task); const dependencies: TaskDependencyBasis[] = [];
  const referenceSnapshots: VerificationArtifactSnapshots = {};
  if (!task.basis.requirements || !task.basis.design || !task.specifications.requirements.length || !task.specifications.design.length || !task.specifications.standards.length || task.pendingDetails.length) {
    issues.push(issue(task.id, 'TASK_SPECIFICATIONS_REQUIRED', `任务详细需求、设计、规范及确认尚未齐备：${task.pendingDetails.join('；')}`));
  }
  for (const reference of Object.values(task.specifications).flat()) {
    try {
      const contents = await readVerificationReference(context.root, reference);
      for (const message of contentIssues(contents, reference.path)) issues.push(issue(task.id, 'TASK_SPECIFICATIONS_INVALID', message));
    } catch (error) { issues.push(issue(task.id, 'TASK_SPECIFICATIONS_INVALID', (error as Error).message)); }
  }
  for (const dependency of task.dependencies) {
    const parent = await evaluateStatus(context, findTask(context, dependency.taskId), cache);
    if (!parent.technicalReady || parent.eventSequence === null) {
      issues.push(issue(task.id, 'DEPENDENCY_NOT_VERIFIED', `前置任务 ${dependency.taskId} 当前未有效验证：${parent.effectiveStatus}。`));
      continue;
    }
    const selected: VerificationArtifactSnapshots = {};
    for (const artifactId of dependency.artifacts) {
      const files = parent.artifactSnapshots[artifactId];
      if (!files || !Object.keys(files).length) issues.push(issue(task.id, 'DEPENDENCY_ARTIFACT_REQUIRED', `前置任务 ${dependency.taskId} 缺少当前产物：${artifactId}。`));
      else { selected[artifactId] = files; referenceSnapshots[`${dependency.taskId}::${artifactId}`] = files; }
    }
    dependencies.push({ taskId: dependency.taskId, eventSequence: parent.eventSequence, artifactDigest: planningDigest(selected) });
  }
  const checkpoints = await inspectCheckpoints(context.root, context.registration.plan.ownerWorkId, task.scope, 'start', task.id, task.humanCheckpoints, checkpointRefs);
  issues.push(...checkpoints.issues);
  const taskDigest = context.registration.taskDigests[task.id]!;
  const checkpointDigest = planningDigest(checkpoints.bindings);
  const startBasisDigest = planningDigest({ taskDigest, dependencies, checkpointDigest });
  return { issues, dependencies, referenceSnapshots, taskDigest, checkpointDigest, startBasisDigest };
}
async function evaluateCompletion(context: Context, task: PlanningTask, references: VerificationArtifactSnapshots, checkpointRefs: ConfirmationReference[], evidenceRefs: VerificationEvidenceReference[]) {
  const artifacts = await inspectTaskArtifacts(context.root, context.registration.plan.ownerWorkId, task.artifacts, task.scope, references);
  const checkpoints = await inspectCheckpoints(context.root, context.registration.plan.ownerWorkId, task.scope, 'verify', task.id, task.humanCheckpoints, checkpointRefs);
  const issues = [...artifacts.issues.map(problem => ({ ...problem, taskId: task.id })), ...checkpoints.issues];
  const warnings = artifacts.warnings.map(warning => warning.message);
  let verificationBasisDigest: string | null = null; let resolvedEvidence: VerificationEvidenceReference[] = [];
  try {
    const verification = await evaluateVerificationSelection(context.root, context.registration.plan.ownerWorkId, task.verification, evidenceRefs, artifacts.snapshots);
    issues.push(...verification.issues.map(message => issue(task.id, 'VERIFICATION_REQUIRED', message)));
    warnings.push(...verification.warnings); verificationBasisDigest = verification.basisDigest; resolvedEvidence = verification.evidenceRefs;
  } catch (error) { issues.push(issue(task.id, 'VERIFICATION_INVALID', (error as Error).message)); }
  return { issues, warnings, artifactSnapshots: artifacts.snapshots, artifactBasisDigest: artifacts.basisDigest, checkpointDigest: planningDigest(checkpoints.bindings), verificationBasisDigest, evidenceRefs: resolvedEvidence };
}
function evaluateStatus(context: Context, task: PlanningTask, cache: Map<string, Promise<TaskStatus>>): Promise<TaskStatus> {
  const existing = cache.get(task.id); if (existing) return existing;
  const promise = (async (): Promise<TaskStatus> => {
    const latest = taskEvents(context.state, task.id).at(-1); const started = startEvent(context.state, latest);
    const basis = await evaluateStartBasis(context, task, started?.checkpointRefs ?? [], cache);
    const issues = [...basis.issues]; const warnings: string[] = [];
    const recordedStatus: RecordedStatus = !latest ? 'pending' : latest.kind === 'task-verified' ? 'verified' : 'active';
    if (started && (started.taskDigest !== basis.taskDigest || started.startBasisDigest !== basis.startBasisDigest)) issues.push(issue(task.id, 'START_BASIS_CHANGED', '开始时的规格、前置结果或人工检查依据已变化，须 resume 重新核对。'));
    let artifactSnapshots: VerificationArtifactSnapshots = {}; let verificationBasisDigest: string | null = null;
    if (latest?.kind === 'task-verified') {
      const completion = await evaluateCompletion(context, task, basis.referenceSnapshots, latest.checkpointRefs, latest.evidenceRefs);
      issues.push(...completion.issues); warnings.push(...completion.warnings);
      artifactSnapshots = completion.artifactSnapshots; verificationBasisDigest = completion.verificationBasisDigest;
      if (planningDigest(latest.artifactSnapshots) !== planningDigest(artifactSnapshots) || latest.verificationBasisDigest !== verificationBasisDigest || latest.checkpointDigest !== completion.checkpointDigest) issues.push(issue(task.id, 'COMPLETION_BASIS_CHANGED', '已验证产物、结果或完成检查点已变化，历史通过不能代替当前验证。'));
    }
    if (latest?.kind === 'task-verification-excepted') {
      const completion = await evaluateCompletion(context, task, basis.referenceSnapshots, latest.checkpointRefs, latest.evidenceRefs);
      issues.push(...completion.issues); warnings.push(...completion.warnings);
    }
    const effectiveStatus = issues.length ? latest?.kind === 'task-verification-excepted' || recordedStatus === 'pending' ? 'blocked' : 'stale' : recordedStatus;
    return { taskId: task.id, recordedStatus, effectiveStatus, blockingReasons: issues, warnings, nextAction: issues.length ? '补足当前条件；开始依据变化时须 resume；仅完成条件缺口可在当前 attempt 重新 verify。' : recordedStatus === 'pending' ? '预览 start 并开始任务。' : recordedStatus === 'active' ? '完成约定产物及验证后预览 verify。' : '当前任务技术验证有效。', attemptId: latest?.attemptId ?? null, eventSequence: latest?.sequence ?? null, artifactSnapshots, verificationBasisDigest, technicalReady: effectiveStatus === 'verified', exceptions: latest?.exceptions ?? [], failureReasons: latest?.failureReasons ?? [] };
  })();
  cache.set(task.id, promise); return promise;
}
export async function inspectTaskStatus(rootInput: string, workId: string, taskId?: string) {
  if (taskId !== undefined) identifier(taskId);
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const state = await loadPlanningState(root, workId);
    if (!state.state.activePlanning) return { workId, revision: state.state.revision, planningRevision: null, ready: false, technicalReady: false, tasks: [] as TaskStatus[], blockingReasons: [gateIssue('PLANNING_REQUIRED', '尚未激活有效规划。', taskId === undefined ? {} : { taskId })] };
    const context = await loadActivePlanning(root, workId); const cache = cacheFor();
    const selected = taskId === undefined ? context.registration.plan.tasks : context.registration.plan.tasks.filter(task => task.id === taskId);
    const tasks = await Promise.all(selected.map(task => evaluateStatus(context, task, cache)));
    const historical = [...new Set(context.state.events.flatMap(event => event.kind === 'planning-activated' ? [] : [event.taskId]))].filter(id => !context.registration.plan.tasks.some(task => task.id === id) && (taskId === undefined || taskId === id));
    for (const id of historical) {
      const latest = taskEvents(context.state, id).at(-1)!;
      tasks.push({ taskId: id, recordedStatus: latest.kind === 'task-verified' ? 'verified' : 'active', effectiveStatus: 'cancelled', blockingReasons: [], warnings: ['任务已在当前已确认规划中移除；历史事实保留。'], nextAction: '需要继续时在新规划中明确登记。', attemptId: latest.attemptId, eventSequence: latest.sequence, artifactSnapshots: {}, verificationBasisDigest: null, technicalReady: false });
    }
    if (taskId !== undefined && !tasks.length) fail(`任务不存在：${taskId}`, 'TASK_NOT_FOUND');
    const blockingReasons = tasks.flatMap(task => task.blockingReasons);
    const currentTasks = tasks.filter(task => task.effectiveStatus !== 'cancelled');
    const technicalReady = currentTasks.length > 0 && currentTasks.every(task => task.technicalReady);
    return { workId, revision: context.state.revision, planningRevision: context.registration.plan.revision, ready: technicalReady, technicalReady, tasks, blockingReasons };
  });
}
async function operationBasis(context: Context, task: PlanningTask, operation: TaskOperation, input: TaskOperationInput) {
  const cache = cacheFor(); const latest = taskEvents(context.state, task.id).at(-1); const started = startEvent(context.state, latest);
  const basis = await evaluateStartBasis(context, task, operation === 'verify' ? started?.checkpointRefs ?? [] : input.checkpointRefs, cache);
  const issues = [...basis.issues];
  if (operation === 'start' && latest) issues.push(issue(task.id, 'TASK_ALREADY_STARTED', '已有任务开始事实；请使用 resume 记录新的继续点。'));
  if (operation !== 'start' && !started) issues.push(issue(task.id, 'TASK_START_REQUIRED', '没有受控开始事实，不能补造此前的开始或完成。'));
  if (operation === 'verify') {
    if (latest?.kind === 'task-verified') issues.push(issue(task.id, 'TASK_ALREADY_VERIFIED', '当前 attempt 已验证；重验须先 resume 创建新的 attempt。'));
    if (started && input.attemptId !== started.attemptId) issues.push(issue(task.id, 'ATTEMPT_MISMATCH', 'verify 引用的 attemptId 不是当前开始事实。'));
    if (started && (started.taskDigest !== basis.taskDigest || started.startBasisDigest !== basis.startBasisDigest)) issues.push(issue(task.id, 'START_BASIS_CHANGED', '开始后规格、前置结果或人工检查依据变化；请先 resume。'));
  }
  const completion = operation === 'verify' ? await evaluateCompletion(context, task, basis.referenceSnapshots, input.checkpointRefs, input.evidenceRefs) : null;
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
  return { fact: { ...fact, technicalBasisDigest, authorization }, issues, warnings: completion?.warnings ?? [], attemptId, basis, completion, technicalBasisDigest, authorization };
}
function replay(context: Context, taskId: string, operation: TaskOperation, input: TaskOperationInput) {
  const inputDigest = planningDigest({ workId: context.registration.plan.ownerWorkId, taskId, operation, input });
  const existing = context.state.operations.find(receipt => receipt.operationId === input.operationId);
  if (existing && (!('taskId' in existing) || existing.kind !== `task-${operation}` || existing.taskId !== taskId || existing.inputDigest !== inputDigest)) fail('相同 operationId 已用于不同任务、操作或输入。', 'OPERATION_CONFLICT');
  return { inputDigest, receipt: existing as TaskReceipt | undefined };
}
async function prepare(root: string, workId: string, taskId: string, operation: TaskOperation, input: TaskOperationInput) {
  const context = await loadActivePlanning(root, workId); const previous = replay(context, taskId, operation, input);
  if (previous.receipt) return { context, ...previous, evaluation: null, planId: previous.receipt.basisDigest };
  await assertNoDeliveryOperation(root, workId, input.operationId);
  if (input.expectedRevision !== context.state.revision) fail('expectedRevision 已过期，请重新检查任务。', 'REVISION_CONFLICT');
  const task = findTask(context, taskId); const evaluation = await operationBasis(context, task, operation, input);
  return { context, ...previous, evaluation, planId: planningDigest({ inputDigest: previous.inputDigest, state: context.stateText, fact: evaluation.fact }) };
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
      const fresh = await prepare(root, workId, taskId, operation, input);
      if (fresh.receipt || fresh.planId !== planId || !fresh.evaluation?.authorization.operationAllowed) fail('任务条件在提交前发生变化。', 'CONTENT_CHANGED');
    }, async () => {
      await assertNoDeliveryOperation(root, workId, input.operationId);
      const current = await loadActivePlanning(root, workId);
      const beforeOperation = { ...current, state: priorState, stateText: prepared.context.stateText };
      const fresh = await operationBasis(beforeOperation, findTask(current, taskId), operation, input);
      if (planningDigest(fresh.fact) !== planningDigest(evaluated.fact) || !fresh.authorization.operationAllowed) fail('任务条件在写入期间发生变化，已撤销本次控制状态。', 'CONTENT_CHANGED');
    });
    return { ...receipt, status: evaluated.authorization.exceptions.length ? 'allowed-with-exceptions' : 'allowed', changed: true, historical: false };
  }));
}
