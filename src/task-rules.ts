import { planningDigest } from './planning-data.js';
import { gateIssue } from './gate-issue.js';
import type { GateIssue } from './gate-issue.js';
import type { PlanningState, PlanningTask, TaskEvent, TaskDependencyBasis } from './planning-types.js';
import type { VerificationArtifactSnapshots } from './verification-selection.js';
import type { TaskContext as Context, TaskStatus, TaskEvaluationInput, TaskCheckpointFacts, TaskCompletionFacts } from './tasks.js';
type RecordedStatus = 'pending' | 'active' | 'verified' | 'cancelled';
function fail(message: string, code: string): never { throw Object.assign(new Error(message), {code}); }
const specificationKey = (reference: {repository: string; path: string}): string => JSON.stringify([reference.repository, reference.path]);
const evaluationIdentity = (context: Context): string => planningDigest({root: context.root, workId: context.registration.plan.ownerWorkId, registration: context.registration, state: context.state});
function requiredCompletion(value: TaskCompletionFacts | null): TaskCompletionFacts {
  if (!value) fail('任务完成材料未在本次输入中声明。', 'TASK_INPUT_INCOMPLETE');
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
export function evaluateTaskStart(context: Context, task: PlanningTask, checkpoints: TaskCheckpointFacts, input: TaskEvaluationInput, completed: ReadonlyMap<string, TaskStatus>) {
  const issues = planningIssues(context, task); const dependencies: TaskDependencyBasis[] = [];
  const referenceSnapshots: VerificationArtifactSnapshots = {};
  if (!task.basis.requirements || !task.basis.design || !task.specifications.requirements.length || !task.specifications.design.length || !task.specifications.standards.length || task.pendingDetails.length) {
    issues.push(issue(task.id, 'TASK_SPECIFICATIONS_REQUIRED', `任务详细需求、设计、规范及确认尚未齐备：${task.pendingDetails.join('；')}`));
  }
  for (const reference of Object.values(task.specifications).flat()) {
    try {
      const observed = input.specifications.get(specificationKey(reference));
      if (!observed) fail('任务规格未在本次输入中声明。', 'TASK_INPUT_INCOMPLETE');
      if (observed.error !== null) throw new Error(observed.error);
      for (const message of observed.issues) issues.push(issue(task.id, 'TASK_SPECIFICATIONS_INVALID', message));
    } catch (error) { issues.push(issue(task.id, 'TASK_SPECIFICATIONS_INVALID', (error as Error).message)); }
  }
  for (const dependency of task.dependencies) {
    const parent = completed.get(dependency.taskId);
    if (!parent) fail(`前置任务尚未按拓扑顺序求值：${dependency.taskId}`, 'TASK_INPUT_INCOMPLETE');
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
  issues.push(...checkpoints.issues);
  const taskDigest = context.registration.taskDigests[task.id]!;
  const checkpointDigest = planningDigest(checkpoints.bindings);
  const startBasisDigest = planningDigest({ taskDigest, dependencies, checkpointDigest });
  return { issues, dependencies, referenceSnapshots, taskDigest, checkpointDigest, startBasisDigest };
}
function evaluateStatus(context: Context, task: PlanningTask, input: TaskEvaluationInput, completed: ReadonlyMap<string, TaskStatus>): TaskStatus {
    const latest = input.latest.get(task.id); const started = startEvent(context.state, latest);
    const material = input.nodes.get(task.id);
    if (!material) fail('任务材料未在本次输入中声明。', 'TASK_INPUT_INCOMPLETE');
    const basis = evaluateTaskStart(context, task, material.start, input, completed);
    const issues = [...basis.issues]; const warnings: string[] = [];
    const recordedStatus: RecordedStatus = !latest ? 'pending' : latest.kind === 'task-verified' ? 'verified' : 'active';
    if (started && (started.taskDigest !== basis.taskDigest || started.startBasisDigest !== basis.startBasisDigest)) issues.push(issue(task.id, 'START_BASIS_CHANGED', '开始时的规格、前置结果或人工检查依据已变化，须 resume 重新核对。'));
    let artifactSnapshots: VerificationArtifactSnapshots = {}; let verificationBasisDigest: string | null = null;
    if (latest?.kind === 'task-verified') {
      const completion = requiredCompletion(material.completion);
      issues.push(...completion.issues); warnings.push(...completion.warnings);
      artifactSnapshots = completion.artifactSnapshots; verificationBasisDigest = completion.verificationBasisDigest;
      if (planningDigest(latest.artifactSnapshots) !== planningDigest(artifactSnapshots) || latest.verificationBasisDigest !== verificationBasisDigest || latest.checkpointDigest !== completion.checkpointDigest) issues.push(issue(task.id, 'COMPLETION_BASIS_CHANGED', '已验证产物、结果或完成检查点已变化，历史通过不能代替当前验证。'));
    }
    if (latest?.kind === 'task-verification-excepted') {
      const completion = requiredCompletion(material.completion);
      issues.push(...completion.issues); warnings.push(...completion.warnings);
      artifactSnapshots = completion.artifactSnapshots;
    }
    const effectiveStatus = issues.length ? latest?.kind === 'task-verification-excepted' || recordedStatus === 'pending' ? 'blocked' : 'stale' : recordedStatus;
    return { taskId: task.id, recordedStatus, effectiveStatus, blockingReasons: issues, warnings, nextAction: issues.length ? '补足当前条件；开始依据变化时须 resume；仅完成条件缺口可在当前 attempt 重新 verify。' : recordedStatus === 'pending' ? '预览 start 并开始任务。' : recordedStatus === 'active' ? '完成约定产物及验证后预览 verify。' : '当前任务技术验证有效。', attemptId: latest?.attemptId ?? null, eventSequence: latest?.sequence ?? null, artifactSnapshots, verificationBasisDigest, technicalReady: effectiveStatus === 'verified', exceptions: latest?.exceptions ?? [], failureReasons: latest?.failureReasons ?? [] };
}
/** Pure task rules: only consume explicit observations and completed direct dependencies. */
export async function evaluateTaskNode(context: Context, input: TaskEvaluationInput, taskId: string,
  completed: ReadonlyMap<string, TaskStatus>): Promise<TaskStatus> {
  if (input.identity !== evaluationIdentity(context)) fail('任务输入不属于当前规划或控制记录。', 'TASK_INPUT_CHANGED');
  const task = input.order.find(candidate => candidate.id === taskId);
  if (!task) fail(`任务未包含在本次求值输入中：${taskId}`, 'TASK_INPUT_INCOMPLETE');
  for (const dependency of task.dependencies) {
    if (completed.get(dependency.taskId)?.taskId !== dependency.taskId)
      fail(`前置任务尚未按拓扑顺序求值：${dependency.taskId}`, 'TASK_INPUT_INCOMPLETE');
  }
  return evaluateStatus(context, task, input, completed);
}
