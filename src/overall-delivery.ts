import { unlink } from 'node:fs/promises';
import { assertSharedPaths } from './core.js';
import { applyChanges, assertSafePath, readTextIfExists, withProjectLock } from './files.js';
import { resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { loadWorkRecord, validateWorkScope } from './work.js';
import { loadActivePlanning, loadPlanningState, planningDigest } from './planning.js';
import { inspectTaskStatus } from './tasks.js';
import { inspectTaskArtifacts } from './task-artifacts.js';
import { evaluateVerificationSelection } from './verification-runs.js';
import { gateIssue, inspectCheckpoints } from './gate-conditions.js';
import { inspectExceptions } from './gate-exceptions.js';
import { parseCheckpointRefs, parseEvidenceRefs, taskId as identifier } from './task-records.js';
import type { ConfirmationReference, Scope } from './confirmations.js';
import type { VerificationArtifactSnapshots, VerificationEvidenceReference } from './verification-selection.js';
import type { GateIssue } from './gate-conditions.js';

export interface DeliveryCheckInput {
  checkpointRefs: ConfirmationReference[]; evidenceRefs: VerificationEvidenceReference[]; exceptionRefs: ConfirmationReference[];
}
interface DeliveryReadyInput extends DeliveryCheckInput { operationId: string; expectedRevision: number }
export interface DeliveryReadyReceipt {
  schemaVersion: 1; workId: string; id: string; operationId: string; inputDigest: string;
  revision: number; planningRevision: string; scope: Scope; checkedAt: string;
  basisDigest: string; exceptionDigest: string; planId: string; operationAllowed: true; technicalReady: boolean;
  disposition: 'ready' | 'allowed-with-exceptions'; inputs: DeliveryCheckInput;
}
function fail(message: string, code = 'INVALID_DELIVERY_CHECK'): never { throw Object.assign(new Error(message), { code }); }
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) fail('整体交付输入包含未知结构或字段。');
  return value as Record<string, unknown>;
}
function sha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail('整体交付摘要须为 SHA-256。');
  return value;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail('expectedRevision 须为非负整数。');
  return Number(value);
}
function checkInput(value: unknown = {}): DeliveryCheckInput {
  const input = object(value, ['checkpointRefs', 'evidenceRefs', 'exceptionRefs']);
  return { checkpointRefs: parseCheckpointRefs(input.checkpointRefs ?? []), evidenceRefs: parseEvidenceRefs(input.evidenceRefs ?? []), exceptionRefs: parseCheckpointRefs(input.exceptionRefs ?? []) };
}
function readyInput(value: unknown): DeliveryReadyInput {
  const input = object(value, ['operationId', 'expectedRevision', 'checkpointRefs', 'evidenceRefs', 'exceptionRefs']);
  const { operationId, expectedRevision, ...refs } = input;
  return { operationId: identifier(operationId), expectedRevision: revision(expectedRevision), ...checkInput(refs) };
}
const receiptPath = (workId: string, id: string): string => `.tiller/work/${identifier(workId)}/delivery-checks/${identifier(id)}.json`;

/** Technical evaluation deliberately never evaluates its own acceptance or release confirmation. */
export async function inspectWorkDelivery(rootInput: string, workId: string, value: unknown = {}) {
  const input = checkInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const work = await loadWorkRecord(root, workId);
    const loaded = await loadPlanningState(root, workId);
    const acceptance = { status: 'not-evaluated' as const, automaticTransition: false };
    if (!loaded.state.activePlanning) {
      const issues = [gateIssue('PLANNING_REQUIRED', '整体交付尚无已激活规划，无法核对必要任务及交付范围。')];
      return { workId, scope: work.record.scope, revision: loaded.state.revision, planningRevision: null,
        ready: false, technicalReady: false, operationAllowed: false, issues, blockingReasons: issues, warnings: [] as string[],
        processEvidence: { status: 'unknown' as 'complete' | 'gap' | 'unknown', limitation: '仅判断受控记录，不认证未登记的宿主行为。' }, acceptance,
        exceptions: [] as Awaited<ReturnType<typeof inspectExceptions>>['exceptions'], inputs: input,
        basisDigest: planningDigest({ workId, scope: work.record.scope, issues }), requiredTasks: [] as string[] };
    }
    const context = await loadActivePlanning(root, workId); const definition = context.registration.plan;
    const issues: GateIssue[] = context.issues.map(message => gateIssue('PLANNING_INVALID', message));
    const warnings: string[] = [];
    const status = await inspectTaskStatus(root, workId);
    const necessary = definition.delivery.requiredTasks.map(id => status.tasks.find(task => task.taskId === id));
    const references: VerificationArtifactSnapshots = {};
    for (const [index, task] of necessary.entries()) {
      const taskId = definition.delivery.requiredTasks[index]!;
      if (!task) { issues.push(gateIssue('TASK_IDENTITY_INVALID', `必要任务无法定位：${taskId}。`, { taskId })); continue; }
      if (!task.technicalReady) issues.push(gateIssue('TASK_NOT_VERIFIED', `必要任务 ${taskId} 当前未有效验证：${task.effectiveStatus}。`, { taskId, exceptionAllowed: true }));
      issues.push(...task.blockingReasons); warnings.push(...task.warnings);
      if (task.technicalReady) for (const [artifactId, files] of Object.entries(task.artifactSnapshots)) references[`${taskId}::${artifactId}`] = files;
    }
    const artifacts = await inspectTaskArtifacts(root, workId, definition.delivery.artifacts, definition.scope, references);
    issues.push(...artifacts.issues); warnings.push(...artifacts.warnings.map(issue => issue.message));
    const checkpoints = await inspectCheckpoints(root, workId, definition.scope, 'delivery-ready', undefined, definition.delivery.humanCheckpoints, input.checkpointRefs);
    issues.push(...checkpoints.issues);
    let verificationBasisDigest: string | null = null; let evidenceRefs: VerificationEvidenceReference[] = [];
    try {
      const verification = await evaluateVerificationSelection(root, workId, definition.delivery.verification, input.evidenceRefs, artifacts.snapshots);
      verificationBasisDigest = verification.basisDigest; evidenceRefs = verification.evidenceRefs;
      issues.push(...verification.issues.map(message => gateIssue('DELIVERY_VERIFICATION_REQUIRED', message, { exceptionAllowed: true })));
      warnings.push(...verification.warnings);
    } catch (error) { issues.push(gateIssue('DELIVERY_VERIFICATION_INVALID', (error as Error).message)); }
    for (const message of definition.delivery.openIssues) issues.push(gateIssue('DELIVERY_OPEN_ISSUE', message, { exceptionAllowed: true }));
    const startsWithExceptions = necessary.flatMap(task => {
      const latest = task?.eventSequence ? context.state.events[task.eventSequence - 1] : undefined;
      const start = latest && latest.kind !== 'planning-activated' ? context.state.events[latest.startEventSequence - 1] : undefined;
      return start && start.kind !== 'planning-activated' && start.exceptions?.length ? [start.taskId] : [];
    });
    if (startsWithExceptions.length) issues.push(gateIssue('PROCESS_GAP', `必要任务的当前开始事实包含例外：${startsWithExceptions.join('、')}。`, { exceptionAllowed: true }));
    const processEvidence = {
      status: necessary.length > 0 && necessary.every(task => task?.recordedStatus === 'verified') && !startsWithExceptions.length ? 'complete' as const : 'gap' as const,
      limitation: '仅判断当前必要任务的受控开始及验证记录，不认证未登记的宿主行为。',
    };
    const uniqueIssues = [...new Map(issues.map(issue => [issue.conditionId, issue])).values()];
    const basisDigest = planningDigest({ workId, scope: definition.scope, planningRevision: definition.revision,
      definitionDigest: context.registration.definitionDigest,
      tasks: necessary.map(task => task ? { taskId: task.taskId, recordedStatus: task.recordedStatus, effectiveStatus: task.effectiveStatus,
        eventSequence: task.eventSequence, artifactSnapshots: task.artifactSnapshots, verificationBasisDigest: task.verificationBasisDigest } : null),
      artifacts: artifacts.basisDigest, verificationBasisDigest, checkpoints: checkpoints.bindings, issues: uniqueIssues, processEvidence });
    const exceptionCheck = await inspectExceptions(root, workId, definition.scope, 'delivery-ready', undefined, uniqueIssues, basisDigest, input.exceptionRefs);
    return { workId, scope: definition.scope, revision: context.state.revision, planningRevision: definition.revision,
      ready: exceptionCheck.operationAllowed, technicalReady: uniqueIssues.length === 0, operationAllowed: exceptionCheck.operationAllowed,
      issues: uniqueIssues, blockingReasons: exceptionCheck.blockingReasons, warnings, processEvidence, acceptance,
      exceptions: exceptionCheck.exceptions, basisDigest, requiredTasks: definition.delivery.requiredTasks,
      inputs: { ...input, evidenceRefs: evidenceRefs.length ? evidenceRefs : input.evidenceRefs } };
  });
}

function parseReceipt(value: unknown, workId: string, id: string): DeliveryReadyReceipt {
  const item = object(value, ['schemaVersion', 'workId', 'id', 'operationId', 'inputDigest', 'revision', 'planningRevision', 'scope', 'checkedAt', 'basisDigest', 'exceptionDigest', 'planId', 'operationAllowed', 'technicalReady', 'disposition', 'inputs']);
  if (item.schemaVersion !== 1) fail('不支持的整体交付回执版本；保留原文件，不能自动转换。', 'UNSUPPORTED_RECORD_VERSION');
  if (item.workId !== workId || item.id !== id || item.operationId !== id || item.operationAllowed !== true || typeof item.technicalReady !== 'boolean') fail('整体回执的身份或结果不一致。');
  if (item.disposition !== (item.technicalReady ? 'ready' : 'allowed-with-exceptions')) fail('整体回执不能以例外伪装技术通过。');
  const scope = validateWorkScope(item.scope);
  if (typeof item.checkedAt !== 'string' || !Number.isFinite(Date.parse(item.checkedAt)) || new Date(item.checkedAt).toISOString() !== item.checkedAt) fail('整体回执时间无效。');
  const inputs = checkInput(item.inputs);
  if (!item.technicalReady && !inputs.exceptionRefs.length) fail('未技术就绪的回执须保存实际例外确认引用。');
  return { schemaVersion: 1, workId, id, operationId: id, inputDigest: sha(item.inputDigest), revision: revision(item.revision),
    planningRevision: identifier(item.planningRevision), scope, checkedAt: item.checkedAt,
    basisDigest: sha(item.basisDigest), exceptionDigest: sha(item.exceptionDigest), planId: sha(item.planId), operationAllowed: true, technicalReady: item.technicalReady,
    disposition: item.disposition as DeliveryReadyReceipt['disposition'], inputs };
}
export async function readDeliveryReceipt(rootInput: string, workId: string, id: string): Promise<DeliveryReadyReceipt> {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    await loadWorkRecord(root, workId);
    const location = receiptPath(workId, id); const contents = await readTextIfExists(root, location);
    if (contents === null) fail('未找到该整体交付回执。', 'DELIVERY_RECEIPT_NOT_FOUND');
    await assertSharedPaths(root, [location]);
    return parseReceipt(JSON.parse(contents), workId, id);
  });
}
export async function inspectDeliveryReceipt(root: string, workId: string, id: string) {
  const receipt = await readDeliveryReceipt(root, workId, id);
  const current = await inspectWorkDelivery(root, workId, receipt.inputs);
  const objectMatches = receipt.basisDigest === current.basisDigest && receipt.technicalReady === current.technicalReady
    && planningDigest(receipt.scope) === planningDigest(current.scope);
  const matches = objectMatches && current.operationAllowed && receipt.exceptionDigest === planningDigest(current.exceptions);
  return { receipt, current, objectMatches, matches };
}
function historical(receipt: DeliveryReadyReceipt) {
  return { ...receipt, changed: false, historical: true, currentValidity: 'not-evaluated' as const,
    acceptance: { status: 'not-evaluated' as const, automaticTransition: false },
    limitation: '这是当时回执，当前有效性须重新 delivery-check 或核对该回执。' };
}
async function prepare(root: string, workId: string, input: DeliveryReadyInput) {
  const { operationId, expectedRevision, ...refs } = input;
  const inputDigest = planningDigest({ workId, input });
  const saved = await readTextIfExists(root, receiptPath(workId, operationId));
  if (saved !== null) {
    const receipt = await readDeliveryReceipt(root, workId, operationId);
    if (receipt.inputDigest !== inputDigest) fail('相同 operationId 已用于不同整体交付输入。', 'OPERATION_CONFLICT');
    return { receipt, evaluation: null, inputDigest, planId: receipt.planId, stateText: null };
  }
  const state = await loadPlanningState(root, workId);
  if (state.state.operations.some(operation => operation.operationId === operationId)) fail('operationId 已用于规划或任务操作。', 'OPERATION_CONFLICT');
  if (state.state.revision !== expectedRevision) fail('expectedRevision 已过期，请重新检查当前任务状态。', 'REVISION_CONFLICT');
  const evaluation = await inspectWorkDelivery(root, workId, refs);
  if (evaluation.revision !== state.state.revision || await readTextIfExists(root, `.tiller/work/${workId}/tasks.json`) !== state.original) fail('任务状态在整体检查期间变化，请重新预览。', 'CONTENT_CHANGED');
  const planId = planningDigest({ inputDigest, state: state.original, basisDigest: evaluation.basisDigest, exceptions: evaluation.exceptions,
    blockingReasons: evaluation.blockingReasons });
  return { receipt: null, evaluation, inputDigest, planId, stateText: state.original };
}
export async function planWorkDeliveryReady(rootInput: string, workId: string, value: unknown) {
  const input = readyInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const prepared = await prepare(root, workId, input);
    if (prepared.receipt) return historical(prepared.receipt);
    return { ...prepared.evaluation!, operationId: input.operationId, planId: prepared.planId, changed: false };
  });
}
export async function applyWorkDeliveryReady(rootInput: string, workId: string, value: unknown, planId: string) {
  sha(planId); const input = readyInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, () => withDeliveryLocation(root, workId, async () => {
    const prepared = await prepare(root, workId, input);
    if (prepared.planId !== planId) fail('整体交付依据在预览后变化，请重新预览。', 'CONTENT_CHANGED');
    if (prepared.receipt) return historical(prepared.receipt);
    const checked = prepared.evaluation!;
    if (!checked.operationAllowed || checked.planningRevision === null) throw Object.assign(new Error('整体交付条件未满足，未登记就绪。'), { code: 'DELIVERY_BLOCKED', blockingReasons: checked.blockingReasons });
    const receipt: DeliveryReadyReceipt = { schemaVersion: 1, workId, id: input.operationId, operationId: input.operationId,
      inputDigest: prepared.inputDigest, revision: checked.revision, planningRevision: checked.planningRevision, scope: checked.scope,
      checkedAt: new Date().toISOString(), basisDigest: checked.basisDigest, exceptionDigest: planningDigest(checked.exceptions), planId, operationAllowed: true,
      technicalReady: checked.technicalReady, disposition: checked.technicalReady ? 'ready' : 'allowed-with-exceptions', inputs: checked.inputs };
    const location = receiptPath(workId, input.operationId); const contents = JSON.stringify(receipt, null, 2) + '\n';
    await assertSharedPaths(root, [location]);
    const fresh = await prepare(root, workId, input);
    if (fresh.receipt || fresh.planId !== planId || !fresh.evaluation?.operationAllowed) fail('整体交付条件在写入前变化。', 'CONTENT_CHANGED');
    await applyChanges(root, [{ path: location, before: null, after: contents }]);
    try {
      const after = await inspectDeliveryReceipt(root, workId, input.operationId);
      if (!after.matches || planningDigest(after.current.exceptions) !== planningDigest(checked.exceptions)) fail('整体交付依据在写入期间变化。', 'CONTENT_CHANGED');
      if (await readTextIfExists(root, location) !== contents
        || await readTextIfExists(root, `.tiller/work/${workId}/tasks.json`) !== prepared.stateText) fail('整体回执或任务状态在写后核对期间变化。', 'CONTENT_CHANGED');
    } catch (error) {
      // Remove only this immutable receipt if it still contains our exact bytes.
      if (await readTextIfExists(root, location) !== contents) fail('写后核对失败，回执又被外部修改；保留现场供恢复，不覆盖外部内容。', 'CONTENT_CHANGED');
      await unlink(await assertSafePath(root, location));
      throw error;
    }
    return { ...receipt, changed: true, historical: false, acceptance: { status: 'not-evaluated' as const, automaticTransition: false } };
  }));
}
