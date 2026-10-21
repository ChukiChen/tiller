import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { readProjectMetadata } from './core.js';
import { applyChanges, assertSafePath, hasPendingTransaction, readTextIfExists, withProjectLock, assertSafePaths } from './files.js';
import { resolveWorkRoot } from './delivery-location.js';
import { validateWorkId } from './work.js';
import {
  parseWorkflowWorkInput, parseWorkflowWorkRecord, prepareWorkflowWorkIntent, serializeWorkflowWorkRecord,
  readWorkRecordText, readWorkflowControlText, readWorkflowReference, loadWorkflowSnapshot, assertSharedRegistrationReferences,
} from './workflow-work.js';
import type { WorkflowWorkInput, WorkflowWorkRecord, WorkflowWorkArtifact } from './workflow-work.js';
import {
  assertWorkflowActivationCurrent, assertWorkflowActivationSharing, compareWorkflowPolicies, loadWorkflowPolicyContext, workflowIntentDigest,
} from './workflow-policy.js';
import { readWorkflowTransitionApprovals, assertConfirmationSharing } from './confirmations.js';
import type { ConfirmationReference } from './confirmations.js';
import { parseCheckpointRefs, parseEvidenceRefs } from './task-records.js';
import { parseWorkflowControlSnapshot, readWorkflowControlSnapshot } from './workflow-stages.js';
import type { WorkflowControlSnapshot } from './workflow-stages.js';
import { readVerificationRecords } from './verification-runs.js';
import type { VerificationEvidenceReference } from './verification-selection.js';
import type { FileChange } from './types.js';
import type { FileRef } from './work.js';

export interface WorkflowTransitionInput {
  operationId: string; expected: WorkflowControlSnapshot;
  next: Omit<WorkflowWorkInput, 'operationId' | 'expectedRevision'>;
  outputMappings: { from: string; to: string }[];
  evidenceMappings: { reference: VerificationEvidenceReference; sourceStageId: string; targetStageId: string; checkIndex: number }[];
  confirmationRefs: ConfirmationReference[];
}
const maximum = 2 * 1024 * 1024;
function fail(message: string, code = 'INVALID_WORKFLOW_TRANSITION'): never { throw Object.assign(new Error(message), { code }); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function bytes(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function hash(value: unknown): string { return bytes(canonical(value)); }
function json(value: unknown): string {
  const result = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(result) > maximum) fail('转换记录超过 2 MiB。');
  return result;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('转换输入必须是普通对象。');
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key)
    || !('value' in Object.getOwnPropertyDescriptor(value, key)!)) || keys.some(key => !Object.hasOwn(value, key))) fail('转换字段缺失、未知或包含访问器。');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string') fail('操作标识无效。');
  validateWorkId(value); return value;
}
function flowId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/u.test(value) || ['constructor', 'prototype'].includes(value)) fail('阶段或产物标识无效。');
  return value;
}
function list<T>(value: unknown, parse: (raw: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 128) fail('转换映射必须是有界列表。');
  return value.map(parse);
}
export function parseWorkflowTransitionInput(value: unknown): WorkflowTransitionInput {
  const item = object(value, ['operationId', 'expected', 'next', 'outputMappings', 'evidenceMappings', 'confirmationRefs']);
  const operationId = id(item.operationId);
  if (!item.next || typeof item.next !== 'object' || Array.isArray(item.next)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(item.next))
    || Reflect.ownKeys(item.next).some(key => key === 'operationId' || key === 'expectedRevision'
      || !('value' in Object.getOwnPropertyDescriptor(item.next, key)!))) fail('新意图不包含创建操作字段或访问器。');
  const { operationId: _operation, expectedRevision: _revision, ...next } = parseWorkflowWorkInput({ ...item.next, operationId, expectedRevision: 0 });
  const outputMappings = list(item.outputMappings, raw => {
    const entry = object(raw, ['from', 'to']); return { from: flowId(entry.from), to: flowId(entry.to) };
  });
  if (new Set(outputMappings.map(item => item.from)).size !== outputMappings.length || new Set(outputMappings.map(item => item.to)).size !== outputMappings.length) fail('产物映射必须一一对应。');
  const evidenceMappings = list(item.evidenceMappings, raw => {
    const entry = object(raw, ['reference', 'sourceStageId', 'targetStageId', 'checkIndex']);
    if (!Number.isSafeInteger(entry.checkIndex) || Number(entry.checkIndex) < 0 || Number(entry.checkIndex) > 127) fail('目标检查索引无效。');
    return { reference: parseEvidenceRefs([entry.reference])[0]!, sourceStageId: flowId(entry.sourceStageId),
      targetStageId: flowId(entry.targetStageId), checkIndex: Number(entry.checkIndex) };
  });
  if (new Set(evidenceMappings.map(canonical)).size !== evidenceMappings.length) fail('证据映射重复。');
  list(item.confirmationRefs, raw => raw);
  return { operationId, expected: parseWorkflowControlSnapshot(item.expected), next, outputMappings, evidenceMappings,
    confirmationRefs: parseCheckpointRefs(item.confirmationRefs) };
}
function locations(workId: string, operationId: string) {
  const base = `.tiller/work/${workId}`;
  return { record: `${base}/record.json`, archive: `${base}/transitions/${operationId}/from-record.json`,
    receipt: `${base}/transitions/${operationId}/receipt.json` };
}
async function control(root: string, workId: string) {
  const tasks = await readWorkflowControlText(root, `.tiller/work/${workId}/tasks.json`, maximum);
  return readWorkflowControlSnapshot(root, workId, tasks !== null);
}
export async function inspectWorkflowTransition(rootInput: string, workId: string) {
  const root = await resolveWorkRoot(rootInput, workId);
    const context = await loadWorkflowPolicyContext(root, workId);
    return { root, workId, record: context.record, snapshot: context.snapshot, sourceIssues: context.sourceIssues,
      controlSnapshot: await control(root, workId), automaticTransition: false };
}
function semanticIntent(record: WorkflowWorkRecord) {
  return { goal: record.goal, scope: record.scope, level: record.level, impact: record.impact, basis: record.basis,
    actionSources: record.actionSources, expectedOutputs: record.expectedOutputs, completionCriteria: record.completionCriteria };
}
/** Historical source records and definitions remain parseable; no current approval is inferred from them. */
export async function workflowTransitionArchivePaths(root: string, workId: string, operationId: string): Promise<string[]> {
  id(workId); id(operationId);
  const raw = await readWorkRecordText(root, workId); if (raw === null) fail('工作尚未登记。');
  const record = parseWorkflowWorkRecord(JSON.parse(raw), workId);
  if (!record.operations.some(entry => entry.operationId === operationId && entry.kind === 'workflow-change')) fail('转换归档缺少对应工作操作。');
  const path = locations(workId, operationId);
  const contents = await readWorkflowControlText(root, path.receipt, maximum); if (contents === null) fail('历史转换回执缺失。');
  const input = parseWorkflowTransitionInput(JSON.parse(contents)?.basis?.input);
  if (input.operationId !== operationId) fail('转换归档操作不一致。');
  const checked = await prepare(root, workId, input);
  if (!checked.historical) fail('转换归档不是已发生操作。');
  const archived = await readWorkflowControlText(root, path.archive, maximum); if (archived === null) fail('旧修订缺失。');
  const previous = parseWorkflowWorkRecord(JSON.parse(archived), workId);
  await loadWorkflowSnapshot(root, previous);
  return [path.receipt, path.archive, previous.workflow.path];
}
async function prepare(root: string, workId: string, input: WorkflowTransitionInput) {
    if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
    const raw = await readWorkRecordText(root, workId); if (raw === null) fail('工作尚未登记。');
    const record = parseWorkflowWorkRecord(JSON.parse(raw), workId);
    const inputDigest = hash(input); const path = locations(workId, input.operationId);
    const previous = record.operations.find(entry => entry.operationId === input.operationId);
    if (previous) {
      if (previous.kind !== 'workflow-change' || previous.inputDigest !== inputDigest) fail('operationId 已用于其他内容或操作。', 'OPERATION_CONFLICT');
      const receiptText = await readWorkflowControlText(root, path.receipt, maximum);
      const archived = await readWorkflowControlText(root, path.archive, maximum);
      if (receiptText === null || archived === null) fail('历史转换回执或旧修订缺失。');
      const receipt = object(JSON.parse(receiptText), ['schemaVersion', 'workId', 'operationId', 'revision', 'workflowRevision', 'planId',
        'inputDigest', 'fromRecordHash', 'toRecordHash', 'changeDigest', 'basis', 'at']);
      const basis = object(receipt.basis, ['input', 'inputDigest', 'fromRecordHash', 'control', 'changeDigest', 'mapped', 'evidence', 'approvals', 'nextWorkflow', 'nextSources']);
      if (receipt.schemaVersion !== 1 || receipt.workId !== workId || receipt.operationId !== input.operationId || receipt.revision !== previous.revision
        || receipt.workflowRevision !== previous.revision || typeof receipt.planId !== 'string'
        || receipt.inputDigest !== inputDigest || receipt.fromRecordHash !== bytes(archived) || receipt.changeDigest !== previous.changeDigest
        || basis.inputDigest !== inputDigest || hash(parseWorkflowTransitionInput(basis.input)) !== inputDigest
        || basis.changeDigest !== receipt.changeDigest || basis.fromRecordHash !== receipt.fromRecordHash
        || canonical(basis.control) !== canonical(input.expected) || receipt.planId !== hash(basis)
        || typeof receipt.toRecordHash !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.toRecordHash)
        || typeof receipt.at !== 'string' || !Number.isFinite(Date.parse(receipt.at))) fail('历史转换回执绑定不一致。');
      parseWorkflowWorkRecord(JSON.parse(archived), workId);
      return { historical: true as const, planId: receipt.planId, revision: previous.revision, inputDigest, record, raw, path };
    }
    const current = await control(root, workId);
    if (canonical(current) !== canonical(input.expected)) fail('工作、阶段或任务控制字节已变化。', 'REVISION_CONFLICT');
    const context = await loadWorkflowPolicyContext(root, workId);
    if (canonical(context.record) !== canonical(record)) fail('工作在读取期间变化。', 'CONTENT_CHANGED');
    const issues = [...context.sourceIssues];
    try { await assertWorkflowActivationCurrent(root, record); } catch (error) { issues.push((error as Error).message); }
    const candidate = await prepareWorkflowWorkIntent(root, workId, { ...input.next, operationId: input.operationId, expectedRevision: 0 });
    const mapped = [];
    for (const mapping of input.outputMappings) {
      const source = record.artifacts[mapping.from]; const target = candidate.snapshot.definition.outputs.find(output => output.id === mapping.to);
      if (!source || !target) fail('映射须从实际已登记产物指向新流程的明确产物。');
      const contents = await readWorkflowReference(root, source.source, candidate.input.scope);
      if (contents === null || !contents.trim()) fail('映射产物缺失或为空。');
      mapped.push({ ...mapping, role: target.role, source: source.source, sha256: bytes(contents) });
    }
    // Candidate evidence remains a historical reference. New-generation authorization is never manufactured.
    const runs = input.evidenceMappings.length ? await readVerificationRecords(root, workId) : [];
    const evidence = input.evidenceMappings.map(mapping => {
      const run = runs.find(run => run.id === mapping.reference.runId);
      const stage = candidate.snapshot.definition.stages.find(stage => stage.id === mapping.targetStageId);
      const identity = mapping.reference.caseId === undefined ? `check:${mapping.reference.checkId}` : `case:${mapping.reference.caseId}`;
      if (mapping.reference.workId !== workId || !run || !stage?.checks[mapping.checkIndex]
        || !context.snapshot.definition.stages.some(stage => stage.id === mapping.sourceStageId)
        || run.authorization.input.stageId !== mapping.sourceStageId || run.authorization.workflowDigest !== context.snapshot.digest
        || run.authorization.intentDigest !== context.intentDigest || !run.bindings[identity]
        || mapping.reference.environment !== undefined && mapping.reference.environment !== run.environment) fail('证据候选不属于当前旧流程的实际检查，或目标检查不存在。');
      return { ...mapping, runDigest: run.digest, targetCheck: stage.checks[mapping.checkIndex], reusableAsCurrentEvidence: false,
        reason: '新代际必须重新取得阶段授权并验证；历史观察保留为参考。' };
    });
    const difference = compareWorkflowPolicies(context.snapshot, candidate.snapshot);
    const nextIntent: WorkflowWorkRecord = { ...record, goal: candidate.input.goal, scope: candidate.input.scope,
      level: candidate.input.level ?? 'change', impact: candidate.input.impact as WorkflowWorkRecord['impact'],
      basis: candidate.basis, actionSources: candidate.actionSources,
      expectedOutputs: candidate.input.expectedOutputs, completionCriteria: candidate.input.completionCriteria };
    const intentChanged = canonical(semanticIntent(record)) !== canonical(semanticIntent(nextIntent));
    const required = difference.requiresApproval || intentChanged;
    const changeDigest = hash({ fromRecordHash: bytes(raw), expected: current, next: candidate.input, workflow: candidate.snapshot,
      mappings: mapped, evidence, invalidatedLinks: record.links });
    const scope = { repositories: [...new Set([...record.scope.repositories, ...candidate.input.scope.repositories])].sort(),
      targets: [...new Set([...record.scope.targets, ...candidate.input.scope.targets])].sort() };
    let approvals: Awaited<ReturnType<typeof readWorkflowTransitionApprovals>> = [];
    try {
      approvals = await readWorkflowTransitionApprovals(root, workId, { changeDigest, scope, references: input.confirmationRefs });
      if (required && !approvals.length) issues.push('目标、范围或政策变化需要精确绑定此转换的 scope 批准。');
    } catch (error) { issues.push((error as Error).message); }
    const basis = { input, inputDigest, fromRecordHash: bytes(raw), control: current, changeDigest, mapped, evidence, approvals,
      nextWorkflow: candidate.workflow, nextSources: { basis: candidate.basis, actionSources: candidate.actionSources } };
    return { historical: false as const, planId: hash(basis), inputDigest, record, raw, path, current, context, candidate,
      mapped, evidence, runs, difference, required, scope, approvals, issues, changeDigest, basis };
}
function historical(plan: { planId: string; revision: number }) {
  return { planId: plan.planId, revision: plan.revision, changed: false, historical: true,
    currentValidity: 'not-evaluated' as const, automaticTransition: false };
}
export async function planWorkflowTransition(rootInput: string, workId: string, value: unknown) {
  const input = parseWorkflowTransitionInput(value); const root = await resolveWorkRoot(rootInput, workId);
  const plan = await prepare(root, workId, input);
  if (plan.historical) return historical(plan);
  const beforeActions = new Set(plan.context.snapshot.definition.stages.flatMap(stage => stage.actions));
  return { planId: plan.planId, revision: plan.record.revision, operationAllowed: !plan.issues.length, blockingReasons: plan.issues,
    changeDigest: plan.changeDigest, requiresApproval: plan.required, approvalScope: plan.scope, difference: plan.difference,
    from: plan.context.snapshot, to: plan.candidate.snapshot, outputMappings: plan.mapped, evidenceMappings: plan.evidence,
    invalidatedConfirmations: { workflowRevision: plan.record.workflowRevision, intentDigest: plan.context.intentDigest },
    invalidatedLinks: plan.record.links, newPermissions: [...new Set(plan.candidate.snapshot.definition.stages.flatMap(stage => stage.actions))].filter(action => !beforeActions.has(action)),
    warnings: ['旧阶段、验证和交付回执保留为历史；它们不会授权新流程。', '承载项目流程启用批准的工作转换后，依赖其旧意图的启用回执会失效。'],
    historical: false, changed: false, automaticTransition: false };
}
export async function applyWorkflowTransition(rootInput: string, workId: string, value: unknown, planId: string) {
  if (!/^[a-f0-9]{64}$/u.test(planId)) fail('转换预览摘要无效。');
  const input = parseWorkflowTransitionInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, async () => {
    await readProjectMetadata(root);
    const plan = await prepare(root, workId, input);
    if (plan.planId !== planId) fail('转换预览后依据已变化。', 'CONTENT_CHANGED');
    if (plan.historical) return historical(plan);
    if (plan.issues.length) fail(plan.issues.join('；'), 'WORKFLOW_TRANSITION_BLOCKED');
    const at = new Date().toISOString(); const revision = plan.record.revision + 1;
    const artifacts: Record<string, WorkflowWorkArtifact> = Object.fromEntries(plan.mapped.map(mapping => [mapping.to, {
      outputId: mapping.to, role: mapping.role, source: mapping.source, origin: 'reference', status: 'draft', registeredAt: at, registeredHash: mapping.sha256,
    }]));
    const next: WorkflowWorkRecord = { ...plan.record, revision, workflowRevision: revision, level: plan.candidate.input.level ?? 'change',
      goal: plan.candidate.input.goal, selectionReason: plan.candidate.input.reason, scope: plan.candidate.input.scope,
      impact: plan.candidate.input.impact as WorkflowWorkRecord['impact'], basis: plan.candidate.basis, actionSources: plan.candidate.actionSources,
      expectedOutputs: plan.candidate.input.expectedOutputs, completionCriteria: plan.candidate.input.completionCriteria,
      workflow: plan.candidate.workflow, artifacts, links: [], operations: [...plan.record.operations, {
        operationId: input.operationId, kind: 'workflow-change', inputDigest: plan.inputDigest, revision, at,
        mappedOutputs: plan.mapped.map(mapping => mapping.to), workflowDigest: plan.candidate.snapshot.digest, changeDigest: plan.changeDigest,
      }] };
    parseWorkflowWorkRecord(next, workId);
    const after = serializeWorkflowWorkRecord(next);
    const definitionBefore = await readWorkflowControlText(root, next.workflow.path, maximum);
    const definitionAfter = json(plan.candidate.snapshot);
    if (definitionBefore !== null && canonical(JSON.parse(definitionBefore)) !== canonical(plan.candidate.snapshot)) fail('固定定义位置已有不同内容。');
    const receipt = { schemaVersion: 1, workId, operationId: input.operationId, revision, workflowRevision: revision, planId,
      inputDigest: plan.inputDigest, fromRecordHash: bytes(plan.raw), toRecordHash: bytes(after), changeDigest: plan.changeDigest, basis: plan.basis, at };
    const changes: FileChange[] = [
      { path: plan.path.archive, before: null, after: plan.raw },
      { path: plan.path.receipt, before: null, after: json(receipt) },
      ...(definitionBefore === null ? [{ path: next.workflow.path, before: null, after: definitionAfter }] : []),
      { path: plan.path.record, before: plan.raw, after },
    ];
    await assertSafePaths(root, changes.map(change => change.path));
    const fresh = await prepare(root, workId, input);
    if (fresh.historical || fresh.planId !== planId || fresh.issues.length) fail('转换提交前依据已变化。', 'CONTENT_CHANGED');
    const shared: FileRef[] = [
      { repository: '.', path: fresh.record.workflow.path }, { repository: '.', path: fresh.candidate.workflow.path },
      ...fresh.record.basis.map(item => item.reference), ...fresh.record.actionSources.map(item => item.reference),
      ...fresh.candidate.observed.map(item => item.reference), ...fresh.mapped.map(item => item.source),
    ];
    if (fresh.current.stages.sha256 !== null) shared.push({ repository: '.', path: `.tiller/work/${workId}/stages/state.json` });
    if (fresh.current.tasks !== null) shared.push({ repository: '.', path: `.tiller/work/${workId}/tasks.json` });
    for (const runId of new Set(input.evidenceMappings.map(mapping => mapping.reference.runId))) {
      const run = fresh.runs.find(item => item.id === runId)!;
      shared.push({ repository: '.', path: `.tiller/work/${workId}/verification-runs/${run.id}.json` });
      if (run.captureId) shared.push({ repository: '.', path: `.tiller/work/${workId}/verification-runs/${run.captureId}.json` });
      for (const name of Object.keys(run.evidence)) {
        const separator = name.indexOf('::');
        shared.push({ repository: name.slice(0, separator), path: name.slice(separator + 2) });
      }
    }
    await assertSharedRegistrationReferences(root, workId, shared);
    await assertWorkflowActivationSharing(root, fresh.record);
    await assertWorkflowActivationSharing(root, { workflow: fresh.candidate.workflow });
    await assertConfirmationSharing(root, input.confirmationRefs);
    await applyChanges(root, changes);
    try {
        for (const change of changes) if (await readTextIfExists(root, change.path) !== change.after) fail('转换写后内容已变化。');
        const checked = await control(root, workId);
        if (canonical(checked) !== canonical({ ...plan.current, work: { revision, sha256: bytes(after) } })) fail('转换写后控制对象变化。');
        const current = await loadWorkflowPolicyContext(root, workId);
        if (current.sourceIssues.length || current.intentDigest !== workflowIntentDigest(next)) fail('转换写后新意图来源变化。');
        await assertWorkflowActivationCurrent(root, next);
        const approvals = await readWorkflowTransitionApprovals(root, workId, { changeDigest: plan.changeDigest, scope: plan.scope,
          references: input.confirmationRefs, previous: { raw: plan.raw, sha256: bytes(plan.raw), expectedCurrentHash: bytes(after), operationId: input.operationId } });
        if (canonical(approvals) !== canonical(plan.approvals)) fail('转换批准在写入期间变化。');
        for (const mapping of plan.mapped) {
          const contents = await readWorkflowReference(root, mapping.source, next.scope);
          if (contents === null || bytes(contents) !== mapping.sha256) fail('转换映射产物在写入期间变化。');
        }
        for (const change of changes) if (await readTextIfExists(root, change.path) !== change.after) fail('转换核验期间内容已变化。');
    } catch (error) {
      if (await readTextIfExists(root, plan.path.record) !== after)
        fail('转换写后检查失败且工作记录已被外部修改，保留旧修订、回执和定义供恢复。', 'CONTENT_CHANGED');
      const owned: FileChange[] = [];
      for (const change of changes) if (change.before !== null && await readTextIfExists(root, change.path) === change.after)
        owned.push({ path: change.path, before: change.after, after: change.before });
      if (owned.length) await applyChanges(root, owned);
      for (const change of changes) if (change.before === null && await readTextIfExists(root, change.path) === change.after)
        await unlink(await assertSafePath(root, change.path));
      throw error;
    }
    return { planId, revision, workflowRevision: revision, changed: true, historical: false, currentValidity: 'verified-at-write' as const,
      archive: plan.path.archive, receipt: plan.path.receipt, automaticTransition: false };
  });
}
