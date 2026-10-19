import { validateWorkId } from './work.js';
import { assertVerificationInput } from './verification-selection.js';
import type { ConfirmationReference } from './confirmations.js';
import type { VerificationEvidenceReference, VerificationArtifactSnapshots } from './verification-selection.js';
import type { PlanningState, TaskEvent, TaskOperation, TaskOperationInput, TaskReceipt } from './planning-types.js';
import type { GateExceptionBinding } from './gate-exceptions.js';
import type { GateIssue } from './gate-conditions.js';

function fail(message: string): never { throw Object.assign(new Error(message), { code: 'INVALID_TASK_RECORD' }); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('任务对象结构无效或包含未知字段。');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || value.includes('\0')) fail('任务标识或文本无效。');
  return value;
}
function explanation(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 20000 || value.includes('\0')) fail('任务例外说明无效。');
  return value;
}
export function taskId(value: unknown): string {
  const result = text(value); validateWorkId(result);
  if (['constructor', 'prototype', '__proto__'].includes(result.toLowerCase())) fail('任务使用保留标识。');
  return result;
}
function integer(value: unknown, positive = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (positive ? 1 : 0)) fail('任务版本或事件序号无效。');
  return Number(value);
}
function sha(value: unknown): string { const result = text(value); if (!/^[a-f0-9]{64}$/u.test(result)) fail('任务摘要无效。'); return result; }
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) fail('任务列表须为不超过1000项的数组。');
  return value.map(parse);
}
export function parseCheckpointRefs(value: unknown): ConfirmationReference[] {
  const result: ConfirmationReference[] = list(value, raw => {
    const ref = object(raw, ['workId', 'requestId', 'decisionId']);
    return { workId: taskId(ref.workId), requestId: taskId(ref.requestId), decisionId: taskId(ref.decisionId) };
  });
  if (new Set(result.map(ref => `${ref.workId}::${ref.requestId}`.toLowerCase())).size !== result.length) fail('人工检查引用重复。');
  return result;
}
export function parseEvidenceRefs(value: unknown): VerificationEvidenceReference[] {
  const result: VerificationEvidenceReference[] = list(value, raw => {
    const ref = object(raw, ['workId', 'runId', 'caseId', 'checkId', 'environment']);
    if ((ref.caseId === undefined) === (ref.checkId === undefined)) fail('证据须绑定一个用例或检查。');
    const runId = text(ref.runId); if (!/^[A-Za-z0-9_-]{1,100}$/u.test(runId)) fail('验证记录标识无效。');
    const identity = text(ref.caseId ?? ref.checkId); if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(identity)) fail('验证检查标识无效。');
    return { workId: taskId(ref.workId), runId, ...(ref.caseId === undefined ? { checkId: identity } : { caseId: identity }), ...(ref.environment === undefined ? {} : { environment: text(ref.environment) }) };
  });
  if (new Set(result.map(ref => ref.caseId === undefined ? `check:${ref.checkId}` : `case:${ref.caseId}`)).size !== result.length) fail('验证证据引用重复。');
  return result;
}
export function parseTaskInput(value: unknown, operation: TaskOperation): TaskOperationInput {
  const input = object(value, ['operationId', 'expectedRevision', 'attemptId', 'checkpointRefs', 'evidenceRefs', 'exceptionRefs']);
  if (operation === 'verify' && input.attemptId === undefined) fail('verify 必须明确当前 attemptId。');
  if (operation !== 'verify' && input.attemptId !== undefined) fail('start/resume 的新 attemptId 由操作生成。');
  const evidenceRefs = parseEvidenceRefs(input.evidenceRefs ?? []);
  if (operation !== 'verify' && evidenceRefs.length) fail('开始与接续不接入完成证据；请在 verify 明确结果引用。');
  const exceptionRefs = parseCheckpointRefs(input.exceptionRefs ?? []);
  return { operationId: taskId(input.operationId), expectedRevision: integer(input.expectedRevision), ...(input.attemptId === undefined ? {} : { attemptId: taskId(input.attemptId) }), checkpointRefs: parseCheckpointRefs(input.checkpointRefs ?? []), evidenceRefs, ...(exceptionRefs.length ? { exceptionRefs } : {}) };
}
function exceptionFields(item: Record<string, unknown>) {
  if (item.technicalBasisDigest === undefined && item.exceptions === undefined && item.failureReasons === undefined) return {};
  const exceptions: GateExceptionBinding[] = list(item.exceptions, raw => {
    const binding = object(raw, ['reference', 'requestFingerprint', 'decisionFingerprint', 'conditionIds', 'reason', 'allowedAction', 'endCondition', 'basisDigest']);
    const conditionIds = list(binding.conditionIds, taskId);
    if (!conditionIds.length || new Set(conditionIds).size !== conditionIds.length || !['start', 'verify', 'resume'].includes(String(binding.allowedAction)) || binding.endCondition !== 'basis-change-or-revocation') fail('任务例外绑定无效。');
    return { reference: parseCheckpointRefs([binding.reference])[0]!, requestFingerprint: sha(binding.requestFingerprint), decisionFingerprint: sha(binding.decisionFingerprint), conditionIds, reason: explanation(binding.reason), allowedAction: text(binding.allowedAction), endCondition: text(binding.endCondition), basisDigest: sha(binding.basisDigest) };
  });
  const failureReasons: GateIssue[] = list(item.failureReasons, raw => {
    const issue = object(raw, ['code', 'conditionId', 'message', 'nextAction', 'exceptionAllowed', 'taskId', 'artifactId', 'caseId']);
    if (issue.exceptionAllowed !== true) fail('已放行任务不得包含不可豁免问题。');
    return { code: text(issue.code), conditionId: taskId(issue.conditionId), message: explanation(issue.message), nextAction: explanation(issue.nextAction), exceptionAllowed: true,
      ...(issue.taskId === undefined ? {} : { taskId: taskId(issue.taskId) }), ...(issue.artifactId === undefined ? {} : { artifactId: text(issue.artifactId) }), ...(issue.caseId === undefined ? {} : { caseId: text(issue.caseId) }) };
  });
  const technicalBasisDigest = sha(item.technicalBasisDigest);
  const covered = exceptions.flatMap(binding => binding.conditionIds);
  if (new Set(covered).size !== covered.length || new Set(failureReasons.map(issue => issue.conditionId)).size !== failureReasons.length || exceptions.some(binding => binding.basisDigest !== technicalBasisDigest)
    || covered.length !== failureReasons.length || failureReasons.some(issue => !covered.includes(issue.conditionId))) fail('任务例外与真实缺口不匹配。');
  return { technicalBasisDigest, exceptions, failureReasons };
}
function snapshots(value: unknown): VerificationArtifactSnapshots {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 1000) fail('产物快照结构无效。');
  const result: VerificationArtifactSnapshots = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id) || ['constructor', 'prototype', '__proto__'].includes(id.toLowerCase())) fail('产物快照标识无效。');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length > 10000) fail('产物文件快照无效。');
    const files: Record<string, string> = {};
    for (const [name, hash] of Object.entries(raw)) {
      const delimiter = name.indexOf('::'); if (delimiter < 1 || name.indexOf('::', delimiter + 2) !== -1) fail('产物快照路径无效。');
      assertVerificationInput({ repository: name.slice(0, delimiter), path: name.slice(delimiter + 2) }); files[name] = sha(hash);
    }
    if (new Set(Object.keys(files).map(name => name.toLowerCase())).size !== Object.keys(files).length) fail('产物快照路径含大小写别名。');
    result[id] = files;
  }
  return result;
}
export function parseTaskEvent(value: unknown): TaskEvent {
  const item = object(value, ['sequence', 'operationId', 'kind', 'at', 'taskId', 'attemptId', 'planningRevision', 'taskDigest', 'startBasisDigest', 'dependencies', 'checkpointRefs', 'checkpointDigest', 'startEventSequence', 'artifactSnapshots', 'verificationBasisDigest', 'evidenceRefs', 'technicalBasisDigest', 'exceptions', 'failureReasons']);
  if (!['task-started', 'task-resumed', 'task-verified', 'task-verification-excepted'].includes(String(item.kind))) fail('任务事件类型无效。');
  const at = text(item.at); if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail('任务事件时间无效。');
  const dependencies = list(item.dependencies, raw => { const dep = object(raw, ['taskId', 'eventSequence', 'artifactDigest']); return { taskId: taskId(dep.taskId), eventSequence: integer(dep.eventSequence, true), artifactDigest: sha(dep.artifactDigest) }; });
  if (new Set(dependencies.map(dep => dep.taskId)).size !== dependencies.length) fail('任务依赖依据重复。');
  const event: TaskEvent = { sequence: integer(item.sequence, true), operationId: taskId(item.operationId), kind: item.kind as TaskEvent['kind'], at, taskId: taskId(item.taskId), attemptId: taskId(item.attemptId), planningRevision: taskId(item.planningRevision), taskDigest: sha(item.taskDigest), startBasisDigest: sha(item.startBasisDigest), dependencies, checkpointRefs: parseCheckpointRefs(item.checkpointRefs), checkpointDigest: sha(item.checkpointDigest), startEventSequence: integer(item.startEventSequence, true), artifactSnapshots: snapshots(item.artifactSnapshots), verificationBasisDigest: item.verificationBasisDigest === null ? null : sha(item.verificationBasisDigest), evidenceRefs: parseEvidenceRefs(item.evidenceRefs) };
  Object.assign(event, exceptionFields(item));
  const completion = event.kind === 'task-verified' || event.kind === 'task-verification-excepted';
  if (completion ? event.kind === 'task-verified' && event.verificationBasisDigest === null : event.verificationBasisDigest !== null || Object.keys(event.artifactSnapshots).length > 0 || event.evidenceRefs.length > 0 || event.startEventSequence !== event.sequence) fail('任务开始/验证事件内容不匹配。');
  if (event.kind === 'task-verified' && event.exceptions?.length || event.kind === 'task-verification-excepted' && !event.exceptions?.length) fail('技术验证事件与例外事实不匹配。');
  const operation = event.kind === 'task-started' ? 'start' : event.kind === 'task-resumed' ? 'resume' : 'verify';
  if (event.exceptions?.some(binding => binding.allowedAction !== operation)) fail('任务事件例外动作不匹配。');
  return event;
}
export function parseTaskReceipt(value: unknown): TaskReceipt {
  const item = object(value, ['operationId', 'inputDigest', 'kind', 'revision', 'planningRevision', 'basisDigest', 'operationAllowed', 'technicalReady', 'blockingReasons', 'taskId', 'attemptId', 'eventSequence', 'technicalBasisDigest', 'exceptions', 'failureReasons']);
  const extra = exceptionFields(item);
  if (!['task-start', 'task-verify', 'task-resume'].includes(String(item.kind)) || item.operationAllowed !== true || item.technicalReady !== (item.kind === 'task-verify' && !extra.exceptions?.length) || !Array.isArray(item.blockingReasons) || item.blockingReasons.length) fail('任务操作回执无效。');
  return { operationId: taskId(item.operationId), inputDigest: sha(item.inputDigest), kind: item.kind as TaskReceipt['kind'], revision: integer(item.revision, true), planningRevision: taskId(item.planningRevision), basisDigest: sha(item.basisDigest), operationAllowed: true, technicalReady: item.technicalReady, blockingReasons: [], taskId: taskId(item.taskId), attemptId: taskId(item.attemptId), eventSequence: integer(item.eventSequence, true), ...extra };
}
export function validateTaskHistory(state: PlanningState): void {
  const latest = new Map<string, TaskEvent>();
  const attempts = new Set<string>();
  for (const event of state.events) {
    if (event.kind === 'planning-activated') continue;
    const receipt = state.operations.find(receipt => receipt.operationId === event.operationId);
    const expectedKind = event.kind === 'task-started' ? 'task-start' : event.kind === 'task-resumed' ? 'task-resume' : 'task-verify';
    if (!receipt || !('taskId' in receipt) || receipt.kind !== expectedKind || receipt.taskId !== event.taskId || receipt.attemptId !== event.attemptId || receipt.eventSequence !== event.sequence || receipt.planningRevision !== event.planningRevision
      || receipt.technicalBasisDigest !== event.technicalBasisDigest || JSON.stringify(receipt.exceptions) !== JSON.stringify(event.exceptions) || JSON.stringify(receipt.failureReasons) !== JSON.stringify(event.failureReasons)) fail('任务事件与操作回执不一致。');
    const active = state.events.slice(0, event.sequence - 1).filter(candidate => candidate.kind === 'planning-activated').at(-1);
    if (!active || active.revision !== event.planningRevision) fail('任务事件没有此前对应的活动规划。');
    if (event.exceptions?.some(binding => binding.reference.workId !== state.ownerWorkId) || event.failureReasons?.some(issue => issue.taskId !== undefined && issue.taskId !== event.taskId)) fail('任务例外归属身份不一致。');
    const prior = latest.get(event.taskId);
    if (event.kind === 'task-verified' || event.kind === 'task-verification-excepted') {
      const start = state.events[event.startEventSequence - 1];
      if (!prior || prior.kind === 'task-verified' || prior.startEventSequence !== event.startEventSequence || !start || (start.kind !== 'task-started' && start.kind !== 'task-resumed') || start.taskId !== event.taskId || start.attemptId !== event.attemptId || start.startBasisDigest !== event.startBasisDigest || start.taskDigest !== event.taskDigest || JSON.stringify(start.dependencies) !== JSON.stringify(event.dependencies)) fail('验证事件缺少对应的当前开始事实。');
    } else {
      if (event.kind === 'task-started' ? prior !== undefined : prior === undefined) fail('任务开始或接续顺序无效。');
      if (attempts.has(event.attemptId)) fail('任务 attemptId 不得重复。');
      attempts.add(event.attemptId);
    }
    for (const dep of event.dependencies) {
      const source = state.events[dep.eventSequence - 1];
      if (!source || source.kind !== 'task-verified' || source.taskId !== dep.taskId || source.sequence >= event.sequence) fail('任务依赖须引用此前已验证事件。');
    }
    latest.set(event.taskId, event);
  }
}
