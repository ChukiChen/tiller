import { unlink } from 'node:fs/promises';

import { applyChanges, assertSafePath, readTextIfExists, withProjectLock, assertSafePaths, verifyTextInputs } from './files.js';
import { locateDelivery, resolveRepositoryRoot, resolveWorkRoot, withDeliveryLocation, withoutDeliveryBinding } from './delivery-location.js';
import { assertSharedWritePaths } from './shared-paths.js';
import { loadWorkRecord, validateWorkScope } from './work.js';
import { loadWorkflowSnapshot } from './workflow-work.js';
import { loadPlanningState, planningDigest } from './planning.js';
import { inspectTaskArtifacts } from './task-artifacts.js';
import { evaluateVerificationSelection, loadVerificationHistory } from './verification-runs.js';
import { inspectVerification } from './verification-cases.js';
import { gateIssue, inspectCheckpoints } from './gate-conditions.js';
import { inspectExceptions } from './gate-exceptions.js';
import { parseCheckpointRefs, parseEvidenceRefs, taskId as identifier } from './task-records.js';
import type { ConfirmationReference, Scope } from './confirmations.js';
import { readConfirmationDependencyGraph } from './confirmations.js';
import type { FileRef } from './confirmations.js';
import type { VerificationArtifactSnapshots, VerificationEvidenceReference, VerificationInput } from './verification-selection.js';
import type { GateIssue } from './gate-conditions.js';
import { parseVerificationSelection } from './verification-selection.js';
import { inspectWorkflowDelivery, inspectWorkflowDeliveryInInput, parseWorkflowCompletionMappings } from './workflow-delivery.js';
import type { WorkflowDeliveryInput } from './workflow-delivery.js';
import { parseWorkflowControlSnapshot, parseWorkflowStageState, readWorkflowControlSnapshot, withWorkflowStageInputs } from './workflow-stages.js';
import type { WorkflowStageInputs } from './workflow-stages.js';
import type { WorkflowControlSnapshot } from './workflow-stages.js';

/** Sharing is an explicit delivery obligation, not a side effect of ordinary reads. */
async function inspectDeliverySharing(root: string, workId: string, input: DeliveryCheckInput,
  workflow: Awaited<ReturnType<typeof inspectWorkflowDelivery>>, loaded: WorkflowStageInputs): Promise<GateIssue[]> {
  const references = new Map<string, Map<string, FileRef>>();
  const add = (owner: string, ref: FileRef) => {
    const files = references.get(owner) ?? new Map<string, FileRef>();
    files.set(`${ref.repository}::${ref.path}`, ref); references.set(owner, files);
  };
  const local = (owner: string, path: string) => add(owner, { repository: '.', path });
  const named = (owner: string, key: string) => {
    const separator = key.indexOf('::');
    if (separator < 1) throw new Error('交付文件快照引用无效。');
    add(owner, { repository: key.slice(0, separator), path: key.slice(separator + 2) });
  };
  const approvals: ConfirmationReference[] = [...input.checkpointRefs, ...input.exceptionRefs];
  const evidence = [...input.evidenceRefs, ...input.planningEvidenceRefs];
  const anchor = (await locateDelivery(root, workId))?.anchorRoot ?? root;
  const ownerRootFor = (owner: string) => withoutDeliveryBinding(() => resolveWorkRoot(anchor, owner));
  const record = workflow.context.record;
  for (const path of ['.tiller/project.json', `.tiller/work/${workId}/record.json`, `.tiller/work/${workId}/work.md`, record.workflow.path]) local(workId, path);
  if (workflow.controlSnapshot.stages.sha256 !== null) local(workId, `.tiller/work/${workId}/stages/state.json`);
  for (const source of [...record.basis, ...record.actionSources]) add(workId, source.reference);
  for (const files of Object.values(workflow.artifacts)) for (const key of Object.keys(files)) named(workId, key);
  for (const stage of workflow.stages.filter(stage => stage.applicability !== 'not-applicable')) {
    approvals.push(...stage.confirmationRefs); evidence.push(...stage.evidenceRefs);
    for (const files of Object.values(stage.artifactSnapshots)) for (const key of Object.keys(files)) named(workId, key);
    if (stage.operationBinding) add(workId, stage.operationBinding.recovery.reference);
  }
  // Follow only the producer stages actually consumed by this delivery, including
  // their declared predecessors. Do not scan other work directories or stages.
  const producerInputs = new Map<string, { root: string; work: Awaited<ReturnType<typeof loadWorkRecord>>;
    snapshot: Awaited<ReturnType<typeof loadWorkflowSnapshot>>; state: ReturnType<typeof parseWorkflowStageState>; stagesText: string }>();
  const producerStages = new Set<string>();
  const links = record.links.filter(link => workflow.requiredStages.includes(link.consumerStageId));
  const pending = links.map(link => ({ workId: link.producer.workId, stageId: link.producer.stageId }));
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const selected = pending[cursor]!;
    const key = `${selected.workId}::${selected.stageId}`;
    if (producerStages.has(key)) continue;
    if (producerStages.size >= 1024) throw new Error('交付生产阶段依赖超过有界核验限制。');
    producerStages.add(key);
    let producer = producerInputs.get(selected.workId);
    if (!producer) {
      const ownerRoot = await ownerRootFor(selected.workId);
      producer = await withoutDeliveryBinding(() => withDeliveryLocation(ownerRoot, selected.workId, async () => {
        const work = await loadWorkRecord(ownerRoot, selected.workId);
        const snapshot = await loadWorkflowSnapshot(ownerRoot, work.record);
        const stagesText = await readTextIfExists(ownerRoot, `.tiller/work/${selected.workId}/stages/state.json`);
        if (stagesText === null) throw new Error('关联生产阶段记录缺失。');
        return { root: ownerRoot, work, snapshot, stagesText, state: parseWorkflowStageState(JSON.parse(stagesText), selected.workId) };
      }));
      producerInputs.set(selected.workId, producer);
      for (const path of ['.tiller/project.json', producer.work.paths.record, producer.work.paths.notes,
        producer.work.record.workflow.path, `.tiller/work/${selected.workId}/stages/state.json`]) local(selected.workId, path);
      for (const source of [...producer.work.record.basis, ...producer.work.record.actionSources]) add(selected.workId, source.reference);
    }
    const definition = producer.snapshot.definition.stages.find(stage => stage.id === selected.stageId);
    if (!definition) throw new Error('关联生产阶段不属于固定流程。');
    pending.push(...definition.dependsOn.map(stageId => ({ workId: selected.workId, stageId })),
      ...producer.work.record.links.filter(link => link.consumerStageId === selected.stageId)
        .map(link => ({ workId: link.producer.workId, stageId: link.producer.stageId })));
    const event = producer.state.events.filter(event => event.workflowRevision === producer!.work.record.workflowRevision
      && event.stageId === selected.stageId).at(-1);
    if (!event) throw new Error('关联生产阶段缺少受控记录。');
    for (const files of Object.values(event.artifactSnapshots)) for (const key of Object.keys(files)) named(selected.workId, key);
    const start = producer.state.events[event.startEventSequence - 1];
    for (const fact of [start, event]) if (fact) {
      if ('evidenceRefs' in fact.input) evidence.push(...fact.input.evidenceRefs);
      if (fact.input.confirmationRefs) approvals.push(...fact.input.confirmationRefs);
      if ('operationBinding' in fact.input && fact.input.operationBinding) add(selected.workId, fact.input.operationBinding.recovery.reference);
    }
  }
  const planning = workflow.development?.planning;
  const generated = new Set<string>();
  if (planning) {
    const plan = planning.registration.plan;
    for (const artifact of [...plan.tasks.flatMap(task => task.artifacts), ...plan.delivery.artifacts])
      if (artifact.type === 'generated') generated.add(`${artifact.output.repository}::${artifact.output.path}`);
    for (const path of [`.tiller/work/${workId}/tasks.json`, `.tiller/work/${workId}/plan.md`, planning.definitionPath, planning.reviewPath]) local(workId, path);
    for (const ref of planning.registration.specificationFiles) add(workId, ref);
    approvals.push(...planning.registration.confirmationBindings.map(binding => binding.reference));
    if (planning.state.activePlanning) approvals.push(planning.state.activePlanning.confirmation);
    for (const task of workflow.development!.status.tasks) {
      for (const files of Object.values(task.artifactSnapshots)) for (const key of Object.keys(files))
        if (!generated.has(key)) named(workId, key);
      if (task.eventSequence) {
        const event = planning.state.events[task.eventSequence - 1];
        if (event && event.kind !== 'planning-activated') {
          evidence.push(...event.evidenceRefs); approvals.push(...event.checkpointRefs, ...(event.exceptions ?? []).map(exception => exception.reference));
          const start = planning.state.events[event.startEventSequence - 1];
          if (start && start.kind !== 'planning-activated') approvals.push(...start.checkpointRefs);
        }
      }
    }
  }
  // Use the already-loaded history for this work; cross-work evidence has its own checkout.
  for (const owner of new Set([workId, ...evidence.map(ref => ref.workId)])) {
    const ownerRoot = await ownerRootFor(owner);
    const { history, definitions } = await withoutDeliveryBinding(() => withDeliveryLocation(ownerRoot, owner, async () => ({
      history: owner === workId ? await loaded.evaluated.loadHistory() : await loadVerificationHistory(ownerRoot, owner),
      definitions: await inspectVerification(ownerRoot, { definitionsOnly: true }),
    })));
    if (!definitions.ready || !definitions.config) throw new Error(definitions.issues.join('；'));
    for (const key of Object.keys(definitions.files)) named(owner, key);
    const selected = new Set(evidence.filter(ref => ref.workId === owner).map(ref => ref.runId));
    for (const runId of selected) {
      const run = history.get(runId);
      if (!run) throw new Error(`交付证据记录不存在：${owner}/${runId}`);
      if (run.captureId) selected.add(run.captureId);
      local(owner, `.tiller/work/${owner}/verification-runs/${run.id}.json`);
      approvals.push(...run.authorization.input.confirmationRefs);
      if (run.authorization.input.operationBinding) add(owner, run.authorization.input.operationBinding.recovery.reference);
      for (const key of Object.keys(run.evidence)) named(owner, key);
      for (const binding of Object.values(run.bindings)) {
        const checks = [...binding.caseChecks, ...(binding.check ? [binding.check] : [])];
        const test = definitions.cases.find(test => test.id === binding.caseId);
        const suiteIds = new Set([...(test?.automation ? [test.automation.suite] : []),
          ...checks.flatMap(check => check.kind === 'execution' ? [check.suite] : [])]);
        const declared: VerificationInput[] = [...checks.flatMap(check => check.inputs),
          ...definitions.config.suites.filter(suite => suiteIds.has(suite.id)).flatMap(suite => suite.inputs)];
        const binary = new Set(declared.filter(ref => ref.binary).map(ref => `${ref.repository}::${ref.path}`));
        for (const key of Object.keys(binding.inputs)) if (!binary.has(key)) named(owner, key);
      }
    }
  }
  const uniqueApprovals = [...new Map(approvals.map(reference => [JSON.stringify(reference), reference])).values()];
  const approvalGraph = await withoutDeliveryBinding(() => readConfirmationDependencyGraph(root, uniqueApprovals));
  for (const approval of approvalGraph) {
    const reference = approval.reference;
    const { request, decision } = approval;
    local(reference.workId, `.tiller/work/${reference.workId}/confirmations.json`);
    local(reference.workId, `.tiller/work/${reference.workId}/reviews/request-${request.requestId}/presentation.md`);
    for (const file of [...request.files, ...request.exceptionFiles, ...decision.files]) {
      add(reference.workId, file); local(reference.workId, file.snapshot);
    }
  }
  const groups = new Map<string, Set<string>>();
  for (const [owner, files] of references) {
    const ownerRoot = await ownerRootFor(owner);
    await withoutDeliveryBinding(() => withDeliveryLocation(ownerRoot, owner, async () => {
      for (const repository of new Set([...files.values()].map(ref => ref.repository))) {
        const repositoryRoot = await resolveRepositoryRoot(ownerRoot, repository, owner);
        const paths = groups.get(repositoryRoot) ?? new Set<string>();
        for (const ref of files.values()) if (ref.repository === repository) paths.add(ref.path);
        groups.set(repositoryRoot, paths);
      }
    }));
  }
  const issues: GateIssue[] = [];
  for (const [repositoryRoot, paths] of groups) {
    try { await assertSharedWritePaths(repositoryRoot, [...paths]); }
    catch (error) { issues.push(gateIssue('DELIVERY_SHARING_INVALID', (error as Error).message)); }
  }
  for (const producer of producerInputs.values()) await verifyTextInputs(producer.root, [
    { path: producer.work.paths.record, text: producer.work.original },
    { path: `.tiller/work/${producer.work.record.id}/stages/state.json`, text: producer.stagesText },
  ]);
  return issues;
}

export interface DeliveryCheckInput extends WorkflowDeliveryInput {
  checkpointRefs: ConfirmationReference[]; planningEvidenceRefs: VerificationEvidenceReference[]; exceptionRefs: ConfirmationReference[];
}
interface DeliveryReadyInput extends DeliveryCheckInput { operationId: string; expected: WorkflowControlSnapshot }
export interface DeliveryReadyReceipt {
  schemaVersion: 2; operation: 'delivery-ready'; workId: string; id: string; operationId: string; inputDigest: string;
  controlSnapshot: WorkflowControlSnapshot; planningRevision: string | null; scope: Scope; checkedAt: string;
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
function checkInput(value: unknown = {}): DeliveryCheckInput {
  const input = object(value, ['checkpointRefs', 'evidenceRefs', 'exceptionRefs', 'planningEvidenceRefs', 'verification', 'checkMappings']);
  return { checkpointRefs: parseCheckpointRefs(input.checkpointRefs ?? []), evidenceRefs: parseEvidenceRefs(input.evidenceRefs ?? []),
    planningEvidenceRefs: parseEvidenceRefs(input.planningEvidenceRefs ?? []), exceptionRefs: parseCheckpointRefs(input.exceptionRefs ?? []),
    checkMappings: parseWorkflowCompletionMappings(input.checkMappings ?? []),
    ...(input.verification === undefined ? {} : { verification: parseVerificationSelection(input.verification) }) };
}
function readyInput(value: unknown): DeliveryReadyInput {
  const input = object(value, ['operationId', 'expected', 'checkpointRefs', 'evidenceRefs', 'exceptionRefs', 'planningEvidenceRefs', 'verification', 'checkMappings']);
  const { operationId, expected, ...refs } = input;
  return { operationId: identifier(operationId), expected: parseWorkflowControlSnapshot(expected), ...checkInput(refs) };
}
const receiptPath = (workId: string, id: string): string => `.tiller/work/${identifier(workId)}/delivery-checks/${identifier(id)}.json`;

/** Technical evaluation deliberately never evaluates its own acceptance or release confirmation. */
async function inspectDevelopmentDelivery(root: string, workId: string, input: DeliveryCheckInput,
  development: NonNullable<Awaited<ReturnType<typeof inspectWorkflowDelivery>>['development']>, loaded: WorkflowStageInputs) {
    const context = development.planning; const definition = context.registration.plan;
    const issues: GateIssue[] = context.issues.map(message => gateIssue('PLANNING_INVALID', message));
    const warnings: string[] = [];
    const status = development.status;
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
      const verification = await evaluateVerificationSelection(root, workId, definition.delivery.verification, input.planningEvidenceRefs, artifacts.snapshots,
        { history: 'selected', ...loaded.evaluated.taskOptions });
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
    return { planningRevision: definition.revision, issues: uniqueIssues, warnings, processEvidence, basisDigest,
      requiredTasks: definition.delivery.requiredTasks, evidenceRefs };
}

export async function inspectWorkDelivery(rootInput: string, workId: string, value: unknown = {}) {
  const input = checkInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withWorkflowStageInputs(root, workId, async loaded => {
    const workflow = await inspectWorkflowDeliveryInInput(root, workId, input, loaded);
    const development = workflow.development ? await inspectDevelopmentDelivery(root, workId, input, workflow.development, loaded) : null;
    const issues = [...workflow.issues, ...(development?.issues ?? [])];
    try { issues.push(...await inspectDeliverySharing(root, workId,
      { ...input, evidenceRefs: workflow.evidenceRefs, planningEvidenceRefs: development?.evidenceRefs ?? [] }, workflow, loaded)); }
    catch (error) { issues.push(gateIssue('DELIVERY_SHARING_INVALID', (error as Error).message)); }
    const needsDevelopment = workflow.controlSnapshot.tasks !== null || workflow.stages.some(stage =>
      stage.applicability !== 'not-applicable' && (stage.delegation !== null || (workflow.requiredStages.includes(stage.stageId)
        && workflow.context.snapshot.definition.stages.find(definition => definition.id === stage.stageId)?.actions.includes('edit-code'))));
    if (needsDevelopment && !development)
      issues.push(gateIssue('DEVELOPMENT_STATUS_UNAVAILABLE', '开发委托缺少当前有效的规划与任务状态，不能登记整体交付。'));
    if (!development && (input.checkpointRefs.length || input.planningEvidenceRefs.length))
      issues.push(gateIssue('UNEXPECTED_DEVELOPMENT_EVIDENCE', '无开发委托的工作不能借规划证据或检查点绕过阶段交付。'));
    const uniqueIssues = [...new Map(issues.map(issue => [issue.conditionId, issue])).values()];
    const processEvidence = {
      status: workflow.processEvidence.status === 'complete' && (!development || development.processEvidence.status === 'complete') ? 'complete' as const : 'gap' as const,
      limitation: workflow.processEvidence.limitation,
    };
    const basisDigest = planningDigest({ workflow: workflow.basisDigest, development: development?.basisDigest ?? null,
      scope: workflow.context.record.scope, issues: uniqueIssues, processEvidence });
    const exceptions = await inspectExceptions(root, workId, workflow.context.record.scope, 'delivery-ready', undefined, uniqueIssues, basisDigest, input.exceptionRefs);
    const final = await readWorkflowControlSnapshot(root, workId, workflow.controlSnapshot.tasks !== null);
    if (planningDigest(final) !== planningDigest(workflow.controlSnapshot)) fail('工作控制资料在交付检查期间变化。', 'CONTENT_CHANGED');
    return { workId, scope: workflow.context.record.scope, revision: workflow.controlSnapshot.stages.revision,
      controlSnapshot: workflow.controlSnapshot, planningRevision: development?.planningRevision ?? null,
      ready: exceptions.operationAllowed, technicalReady: uniqueIssues.length === 0, operationAllowed: exceptions.operationAllowed,
      issues: uniqueIssues, blockingReasons: exceptions.blockingReasons, warnings: [...workflow.warnings, ...(development?.warnings ?? [])],
      processEvidence, acceptance: { status: 'not-evaluated' as const, automaticTransition: false },
      exceptions: exceptions.exceptions, basisDigest, requiredTasks: development?.requiredTasks ?? [],
      requiredStages: workflow.requiredStages, requiredOutputs: workflow.requiredOutputs,
      inputs: { ...input, evidenceRefs: workflow.evidenceRefs, planningEvidenceRefs: development?.evidenceRefs ?? [] } };
  }));
}

function parseReceipt(value: unknown, workId: string, id: string): DeliveryReadyReceipt {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 2)
    fail('不支持的整体交付回执版本；仅支持当前版本 2，保留原文件。', 'UNSUPPORTED_RECORD_VERSION');
  const item = object(value, ['schemaVersion', 'operation', 'workId', 'id', 'operationId', 'inputDigest', 'controlSnapshot', 'planningRevision', 'scope', 'checkedAt', 'basisDigest', 'exceptionDigest', 'planId', 'operationAllowed', 'technicalReady', 'disposition', 'inputs']);
  if (item.operation !== 'delivery-ready') fail('整体回执操作类型无效。');
  if (item.workId !== workId || item.id !== id || item.operationId !== id || item.operationAllowed !== true || typeof item.technicalReady !== 'boolean') fail('整体回执的身份或结果不一致。');
  if (item.disposition !== (item.technicalReady ? 'ready' : 'allowed-with-exceptions')) fail('整体回执不能以例外伪装技术通过。');
  const scope = validateWorkScope(item.scope);
  if (typeof item.checkedAt !== 'string' || !Number.isFinite(Date.parse(item.checkedAt)) || new Date(item.checkedAt).toISOString() !== item.checkedAt) fail('整体回执时间无效。');
  const inputs = checkInput(item.inputs);
  if (!item.technicalReady && !inputs.exceptionRefs.length) fail('未技术就绪的回执须保存实际例外确认引用。');
  const controlSnapshot = parseWorkflowControlSnapshot(item.controlSnapshot);
  if ((item.planningRevision === null) !== (controlSnapshot.tasks === null)) fail('规划身份与任务控制快照不一致。');
  return { schemaVersion: 2, operation: 'delivery-ready', workId, id, operationId: id, inputDigest: sha(item.inputDigest),
    controlSnapshot,
    planningRevision: item.planningRevision === null ? null : identifier(item.planningRevision), scope, checkedAt: item.checkedAt,
    basisDigest: sha(item.basisDigest), exceptionDigest: sha(item.exceptionDigest), planId: sha(item.planId), operationAllowed: true, technicalReady: item.technicalReady,
    disposition: item.disposition as DeliveryReadyReceipt['disposition'], inputs };
}
export async function readDeliveryReceipt(rootInput: string, workId: string, id: string): Promise<DeliveryReadyReceipt> {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    await loadWorkRecord(root, workId);
    const location = receiptPath(workId, id); const contents = await readTextIfExists(root, location);
    if (contents === null) fail('未找到该整体交付回执。', 'DELIVERY_RECEIPT_NOT_FOUND');
    await assertSafePaths(root, [location]);
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
  const { operationId, expected, ...refs } = input;
  const inputDigest = planningDigest({ workId, input });
  const saved = await readTextIfExists(root, receiptPath(workId, operationId));
  if (saved !== null) {
    const receipt = await readDeliveryReceipt(root, workId, operationId);
    if (receipt.inputDigest !== inputDigest) fail('相同 operationId 已用于不同整体交付输入。', 'OPERATION_CONFLICT');
    return { receipt, evaluation: null, inputDigest, planId: receipt.planId };
  }
  const state = await loadPlanningState(root, workId);
  if (state.state.operations.some(operation => operation.operationId === operationId)) fail('operationId 已用于规划或任务操作。', 'OPERATION_CONFLICT');
  const evaluation = await inspectWorkDelivery(root, workId, refs);
  if (planningDigest(expected) !== planningDigest(evaluation.controlSnapshot)) fail('expected 控制快照已过期，请重新检查工作、阶段及适用任务状态。', 'REVISION_CONFLICT');
  if (await readTextIfExists(root, `.tiller/work/${workId}/tasks.json`) !== state.original) fail('操作标识域在交付检查期间变化。', 'CONTENT_CHANGED');
  const planId = planningDigest({ inputDigest, expected, basisDigest: evaluation.basisDigest, exceptions: evaluation.exceptions,
    blockingReasons: evaluation.blockingReasons });
  return { receipt: null, evaluation, inputDigest, planId };
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
    const location = receiptPath(workId, input.operationId);
    await assertSafePaths(root, [location]);
    const prepared = await prepare(root, workId, input);
    if (prepared.planId !== planId) fail('整体交付依据在预览后变化，请重新预览。', 'CONTENT_CHANGED');
    if (prepared.receipt) return historical(prepared.receipt);
    const checked = prepared.evaluation!;
    if (!checked.operationAllowed) throw Object.assign(new Error('整体交付条件未满足，未登记就绪。'), { code: 'DELIVERY_BLOCKED', blockingReasons: checked.blockingReasons });
    const receipt: DeliveryReadyReceipt = { schemaVersion: 2, operation: 'delivery-ready', workId, id: input.operationId, operationId: input.operationId,
      inputDigest: prepared.inputDigest, controlSnapshot: checked.controlSnapshot, planningRevision: checked.planningRevision, scope: checked.scope,
      checkedAt: new Date().toISOString(), basisDigest: checked.basisDigest, exceptionDigest: planningDigest(checked.exceptions), planId, operationAllowed: true,
      technicalReady: checked.technicalReady, disposition: checked.technicalReady ? 'ready' : 'allowed-with-exceptions', inputs: checked.inputs };
    const contents = JSON.stringify(receipt, null, 2) + '\n';
    await applyChanges(root, [{ path: location, before: null, after: contents }]);
    try {
      const after = await inspectDeliveryReceipt(root, workId, input.operationId);
      if (!after.matches || planningDigest(after.current.exceptions) !== planningDigest(checked.exceptions)) fail('整体交付依据在写入期间变化。', 'CONTENT_CHANGED');
      if (await readTextIfExists(root, location) !== contents
        || planningDigest(await readWorkflowControlSnapshot(root, workId, checked.controlSnapshot.tasks !== null)) !== planningDigest(checked.controlSnapshot))
        fail('整体回执或控制状态在写后核对期间变化。', 'CONTENT_CHANGED');
      const state = await loadPlanningState(root, workId);
      if (state.state.operations.some(operation => operation.operationId === input.operationId)) fail('整体交付标识与规划或任务操作冲突。', 'OPERATION_CONFLICT');
    } catch (error) {
      // Remove only this immutable receipt if it still contains our exact bytes.
      if (await readTextIfExists(root, location) !== contents) fail('写后核对失败，回执又被外部修改；保留现场供恢复，不覆盖外部内容。', 'CONTENT_CHANGED');
      await unlink(await assertSafePath(root, location));
      throw error;
    }
    return { ...receipt, changed: true, historical: false, acceptance: { status: 'not-evaluated' as const, automaticTransition: false } };
  }));
}
