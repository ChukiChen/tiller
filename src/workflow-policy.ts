import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { readProjectMetadata } from './core.js';
import { applyChanges, assertSafePath, readTextIfExists, withProjectLock, assertSafePaths, readTextInputs, verifyTextInputs } from './files.js';
import type { TextInput, TextProof, TextReadInput } from './files.js';
import { repositoryPath } from './repository-paths.js';
import { resolveWorkRoot, resolveRepositoryRootsFromMetadata } from './delivery-location.js';
import {loadRepositoryInput, proveRepositoryInput} from './repository-input.js';
import type {RepositoryInput} from './repository-input.js';
import { parseOperationBinding, readConfirmations, loadConfirmationReadBatch, assertConfirmationReadBatchCurrent, assertConfirmationSharing } from './confirmations.js';
import type { ConfirmationReference, OperationBinding, ConfirmationReadBatch } from './confirmations.js';
import { withConfirmationVisit } from './confirmation-context.js';
import type { SharedWriteProof } from './shared-paths.js';
import {
  WORKFLOW_ACTIONS, evaluateWorkflowCondition, loadBuiltinWorkflows, loadProjectWorkflows,
  parseWorkflowSnapshot,
} from './workflow-catalog.js';
import type { WorkflowAction, WorkflowCondition, WorkflowConfirmation, WorkflowFacts, WorkflowSnapshot } from './workflow-catalog.js';
import {
  parseWorkflowWorkRecord, readWorkRecordText, readWorkflowControlText, WORKFLOW_WORK_LIMITS, assertSharedRegistrationReferences,
} from './workflow-work.js';
import type { WorkflowWorkRecord } from './workflow-work.js';
import type { FileChange, ProjectMetadata } from './types.js';
import { validateWorkId } from './work.js';

const directory = '.tiller/workflow-policy';
const indexPath = `${directory}/index.json`;
const limit = 128;
function fail(message: string): never { throw Object.assign(new Error(message), { code: 'INVALID_WORKFLOW_POLICY' }); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function textHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('政策对象格式无效。');
  for (const key of Reflect.ownKeys(value)) if (typeof key !== 'string' || !required.includes(key) && !optional.includes(key)
    || !('value' in Object.getOwnPropertyDescriptor(value, key)!)) fail('政策对象包含未知字段或访问器。');
  if (required.some(key => !Object.hasOwn(value, key))) fail('政策对象缺少必要字段。');
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 1024): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f]/u.test(value)) fail('政策文本无效。');
  return value;
}
function digest(value: unknown): string { const result = text(value, 64); if (!/^[a-f0-9]{64}$/u.test(result)) fail('政策摘要无效。'); return result; }
function identity(value: unknown): string { const result = text(value, 64); validateWorkId(result); return result; }
function revision(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1024) fail('政策修订无效。'); return Number(value); }
function refs(value: unknown): ConfirmationReference[] {
  if (!Array.isArray(value) || value.length > limit) fail('确认引用超过限制。');
  const result = value.map(raw => {
    const item = object(raw, ['workId', 'requestId', 'decisionId']);
    return { workId: identity(item.workId), requestId: identity(item.requestId), decisionId: identity(item.decisionId) };
  });
  if (new Set(result.map(canonical)).size !== result.length) fail('确认引用重复。');
  return result;
}
function actions(value: unknown): WorkflowAction[] {
  if (!Array.isArray(value) || value.length > WORKFLOW_ACTIONS.length || value.some(entry => !WORKFLOW_ACTIONS.includes(entry))) fail('政策动作无效。');
  if (new Set(value).size !== value.length) fail('政策动作重复。');
  return value as WorkflowAction[];
}
function selected(value: unknown): { id: string; version: string } {
  const item = object(value, ['id', 'version']);
  const id = text(item.id, 80); const version = text(item.version, 32);
  if (!/^(?:project\.)?[a-z][a-z0-9-]{0,63}$/u.test(id) || !/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u.test(version)) fail('流程标识或版本无效。');
  return { id, version };
}

/** Artifacts and operation counters do not change the intent that a user approved. */
export function workflowIntentDigest(record: WorkflowWorkRecord): string {
  const value = parseWorkflowWorkRecord(record, record.id);
  return hash({
    workflowRevision: value.workflowRevision, goal: value.goal, selectionReason: value.selectionReason, level: value.level, scope: value.scope,
    impact: value.impact, basis: value.basis, actionSources: value.actionSources,
    expectedOutputs: value.expectedOutputs, completionCriteria: value.completionCriteria,
  });
}
export interface WorkflowPolicyContext {
  repositoryInput?: RepositoryInput;
  materials?: TextReadInput;
  root: string; record: WorkflowWorkRecord; snapshot: WorkflowSnapshot; intentDigest: string; sourceIssues: string[];
  sourceInputs?: { root: string; inputs: TextInput[]; maxBytes?: number }[];
  recordText?: string;
  metadata?: ProjectMetadata;
  repositoryRoots?: { repository: string; root: string }[];
}
export async function loadWorkflowPolicyContext(rootInput: string, workId: string, materials?: TextReadInput): Promise<WorkflowPolicyContext> {
  const root = await resolveWorkRoot(rootInput, workId);
  const raw = await readWorkRecordText(root, workId);
  if (raw === null) fail('政策检查要求真实当前工作记录。');
  const context = await loadWorkflowPolicyContextForRecord(root, parseWorkflowWorkRecord(JSON.parse(raw) as unknown, workId), materials);
  context.recordText = raw;
  context.sourceInputs!.unshift({ root, inputs: [{ path: `.tiller/work/${workId}/record.json`, text: raw }], maxBytes: WORKFLOW_WORK_LIMITS.recordBytes });
  return context;
}
/** Interpret an explicit immutable record while freshly loading its actual source files. */
export async function loadWorkflowPolicyContextForRecord(root: string, value: WorkflowWorkRecord, materials?: TextReadInput): Promise<WorkflowPolicyContext> {
  const metadata = await readProjectMetadata(root, materials);
  const record = parseWorkflowWorkRecord(value, value.id);
  if (record.scope.repositories.some(repository => repository !== '.' && !metadata.repositories.includes(repository))) fail('工作仓库未登记。');
  const snapshotInputs = await readTextInputs(root, [record.workflow.path], { maxBytes: WORKFLOW_WORK_LIMITS.recordBytes }, materials);
  const source = snapshotInputs[0]!.text;
  if (source === null) fail('工作固定流程快照缺失，不能使用当前目录版本代替。');
  const snapshot = parseWorkflowSnapshot(JSON.parse(source));
  if (snapshot.id !== record.workflow.id || snapshot.version !== record.workflow.version || snapshot.digest !== record.workflow.digest)
    fail('工作固定流程身份、版本或摘要已变化。');
  if (record.expectedOutputs.some(outputId => !snapshot.definition.outputs.some(output => output.id === outputId))
    || Object.values(record.artifacts).some(output => snapshot.definition.outputs.find(item => item.id === output.outputId)?.role !== output.role)
    || record.links.some(link => !snapshot.definition.stages.some(stage => stage.id === link.consumerStageId))) fail('工作产物或依赖不属于固定流程。');
  const context: WorkflowPolicyContext = { root, record, snapshot, intentDigest: workflowIntentDigest(record), sourceIssues: [], metadata,
    sourceInputs: [{ root, inputs: snapshotInputs, maxBytes: WORKFLOW_WORK_LIMITS.recordBytes }], repositoryRoots: [] };
  if (materials) Object.defineProperty(context, 'materials', {value: materials});
  const repositoryInput = await loadRepositoryInput(root, record.scope.repositories, record.id, metadata, materials);
  Object.defineProperty(context, 'repositoryInput', {value: repositoryInput});
  const entries = [...record.basis, ...record.actionSources];
  const references = [...new Map(entries.map(entry => [canonical(entry.reference), entry.reference])).values()];
  const loadedSources = new Map<string, { contents: string | null } | { error: unknown }>();
  const groups = new Map<string, typeof references>();
  {
    const repositoryRoots = new Map(references.map(reference => [reference.repository, repositoryInput.repositories.get(reference.repository)]));
    for (const [repository, repositoryRoot] of repositoryRoots) {
      if (!repositoryRoot) fail('引用超出工作仓库范围。');
      context.repositoryRoots!.push({ repository, root: repositoryRoot });
      const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
      if (metadata.mode === 'workspace') boundaries.push('repositories');
      const group = groups.get(repositoryRoot) ?? [];
      for (const reference of references.filter(reference => reference.repository === repository)) {
        if (!record.scope.repositories.includes(reference.repository)) fail('引用超出工作仓库范围。');
        if (repository === '.' && boundaries.some(boundary => reference.path.toLowerCase() === boundary || reference.path.toLowerCase().startsWith(`${boundary}/`)))
          fail('业务仓库文件必须通过稳定仓库标识引用。');
        group.push(reference);
      }
      groups.set(repositoryRoot, group);
    }
  }
  for (const [repositoryRoot, group] of groups) {
    try {
      const inputs = await readTextInputs(repositoryRoot, [...new Set(group.map(reference => reference.path))], { maxBytes: WORKFLOW_WORK_LIMITS.referenceBytes }, materials);
      context.sourceInputs!.push({ root: repositoryRoot, inputs, maxBytes: WORKFLOW_WORK_LIMITS.referenceBytes });
      const contents = new Map(inputs.map(input => [input.path, input.text]));
      for (const reference of group) loadedSources.set(canonical(reference), { contents: contents.get(reference.path)! });
    } catch (error) { for (const reference of group) loadedSources.set(canonical(reference), { error }); }
  }
  for (const entry of entries) {
    const input = loadedSources.get(canonical(entry.reference))!;
    if ('error' in input) { context.sourceIssues.push((input.error as Error).message); continue; }
    const current = input.contents;
    if (current === null || textHash(current) !== entry.sha256 || ('quote' in entry && !current.includes(entry.quote)))
      context.sourceIssues.push(`来源缺失或变化：${entry.reference.repository}/${entry.reference.path}`);
  }
  return context;
}
/** Prove the exact material inputs used by policy computation at its caller's boundary. */
export async function assertWorkflowPolicyContextCurrent(context: WorkflowPolicyContext, proofs?: TextProof[]): Promise<void> {
  for (const observed of [...(context.sourceInputs ?? [])].reverse())
    await verifyTextInputs(observed.root, observed.inputs, observed.maxBytes === undefined ? {} : { maxBytes: observed.maxBytes }, proofs,
      observed.inputs.some(input => input.path === context.record.workflow.path || input.path === `.tiller/work/${context.record.id}/record.json`));
  if (context.repositoryInput) {
    await proveRepositoryInput(context.repositoryInput, proofs);
    return;
  }
  if (context.metadata) {
    {
      const roots = await resolveRepositoryRootsFromMetadata(context.root, (context.repositoryRoots ?? []).map(binding => binding.repository), context.metadata, context.record.id);
      for (const binding of context.repositoryRoots ?? []) if (roots.get(binding.repository) !== binding.root)
        fail('政策来源仓库位置已变化。');
    }
    if (canonical(await readProjectMetadata(context.root)) !== canonical(context.metadata)) fail('政策工程仓库登记已变化。');
  }
}

export interface WorkflowPolicyInput {
  stageId: string; phase: 'start' | 'verify'; actions: WorkflowAction[];
  confirmationRefs: ConfirmationReference[]; operationBinding?: OperationBinding;
}
export function resolveWorkflowPolicy(snapshotValue: WorkflowSnapshot, impact: WorkflowFacts, input: Pick<WorkflowPolicyInput, 'stageId' | 'phase' | 'actions'>) {
  const snapshot = parseWorkflowSnapshot(snapshotValue);
  if (!['start', 'verify'].includes(input.phase)) fail('阶段政策时点无效。');
  const requested = actions(input.actions);
  const stage = snapshot.definition.stages.find(item => item.id === input.stageId);
  if (!stage) fail('政策阶段不属于固定流程。');
  const issues: string[] = [];
  const required = new Set<WorkflowConfirmation>();
  const requiredStages = new Set<string>();
  const requiredBindings: { stageId: string; gate: WorkflowConfirmation }[] = [];
  const states = new Map(snapshot.definition.stages.map(item => [item.id, evaluateWorkflowCondition(item.when, impact)]));
  if (states.get(stage.id) !== 'applicable') issues.push(`阶段不适用或条件未知：${stage.id}`);
  for (const action of requested) if (!stage.actions.includes(action)) issues.push(`阶段未声明动作：${action}`);
  const visited = new Set<string>();
  const visit = (id: string, own: boolean) => {
    if (visited.has(id)) return; visited.add(id);
    const current = snapshot.definition.stages.find(item => item.id === id)!;
    const state = states.get(id);
    if (state === 'unresolved') issues.push(`前置条件未知：${id}`);
    if (state === 'applicable' && (!own || input.phase === 'verify' || current.confirmationAt === 'start')) {
      for (const gate of current.confirmations) { required.add(gate); requiredBindings.push({ stageId: id, gate }); }
      if (current.confirmations.length) requiredStages.add(id);
    }
    for (const dependency of current.dependsOn) visit(dependency, false);
  };
  visit(stage.id, true);
  if (requested.some(action => action === 'write-report' || action === 'edit-documents')) {
    const roles = snapshot.definition.outputs.filter(output => output.producer === stage.id).map(output => output.role);
    if (roles.includes('design') || roles.includes('planning')) required.add('requirements');
    if (roles.includes('planning')) required.add('design');
  }
  if (requested.includes('edit-code')) for (const gate of ['requirements', 'design', 'planning'] as const) required.add(gate);
  if (requested.includes('merge')) required.add('merge');
  if (requested.includes('release')) required.add('release');
  const sideEffect = requested.some(action => ['configure-environment', 'write-data', 'external-service', 'operate'].includes(action));
  const sensitive = ['production', 'writesData', 'credentials', 'irreversible', 'externalService'] as const;
  if (sideEffect || requested.includes('local-experiment') && impact.experimentSideEffects !== false
    || requested.some(action => !['read', 'write-report'].includes(action)) && sensitive.some(fact => impact[fact] !== false)) {
    required.add('operation');
    if (!requiredBindings.some(binding => binding.stageId === stage.id && binding.gate === 'operation')) requiredBindings.push({ stageId: stage.id, gate: 'operation' });
  }
  return { stageId: stage.id, phase: input.phase, actions: requested, requiredConfirmations: [...required], requiredStages: [...requiredStages], requiredBindings, issues };
}

function sourceCovers(record: WorkflowWorkRecord, action: WorkflowAction): boolean {
  return record.scope.repositories.every(repository => record.scope.targets.every(target => record.actionSources.some(source =>
    source.actions.includes(action) && source.scope.repositories.includes(repository) && source.scope.targets.includes(target))));
}
export async function inspectWorkflowPolicy(rootInput: string, workId: string, input: WorkflowPolicyInput) {
  const context = await loadWorkflowPolicyContext(rootInput, workId);
  const result = await inspectWorkflowPolicyInContext(context, input);
  await assertWorkflowPolicyContextCurrent(context);
  return result;
}
export interface WorkflowPolicyEvaluationInput {
  root: string; recordDigest: string; confirmations: ConfirmationReadBatch; activationIssue: string | null;
}
export async function loadWorkflowPolicyInput(context: WorkflowPolicyContext, references: readonly ConfirmationReference[], supplied?: ConfirmationReadBatch): Promise<WorkflowPolicyEvaluationInput> {
  const selected = references.filter(ref => ref.workId === context.record.id);
  let activationIssue: string | null = null;
  try { await assertWorkflowActivationCurrent(context.root, context.record); }
  catch (error) { activationIssue = (error as Error).message; }
  if (supplied && (supplied.root !== context.root || selected.some(ref => !supplied.references.some(known => canonical(known) === canonical(ref)))))
    fail('批准资料未覆盖本次策略输入。');
  return {root: context.root, recordDigest: hash(context.record), confirmations: supplied ?? await loadConfirmationReadBatch(context.root, selected, context.recordText === undefined ? undefined : context), activationIssue};
}
export async function assertWorkflowPolicyInputCurrent(context: WorkflowPolicyContext, observed: WorkflowPolicyEvaluationInput, proofs?: TextProof[]): Promise<void> {
  await assertConfirmationReadBatchCurrent(observed.confirmations, proofs);
  let activationIssue: string | null = null;
  try { await assertWorkflowActivationCurrent(context.root, context.record); }
  catch (error) { activationIssue = (error as Error).message; }
  if (activationIssue !== observed.activationIssue) fail('流程启用依据在读取后变化。');
}
export async function inspectWorkflowPolicyInContext(context: WorkflowPolicyContext, input: WorkflowPolicyInput) {
  const observed = await loadWorkflowPolicyInput(context, refs(input.confirmationRefs));
  const result = evaluateWorkflowPolicyInput(context, input, observed);
  await assertWorkflowPolicyInputCurrent(context, observed);
  return result;
}
/** Pure policy decision over explicitly observed approval and activation facts. */
export function evaluateWorkflowPolicyInput(context: WorkflowPolicyContext, input: WorkflowPolicyInput, observed: WorkflowPolicyEvaluationInput) {
    if (observed.root !== context.root || observed.recordDigest !== hash(context.record)) fail('策略输入不属于当前工作。');
    const workId = context.record.id;
    const policy = resolveWorkflowPolicy(context.snapshot, context.record.impact, input);
    const issues = [...context.sourceIssues, ...policy.issues];
    const references = refs(input.confirmationRefs);
    for (const reference of references.filter(ref => ref.workId === workId)) {
      if (!observed.confirmations.references.some(ref => canonical(ref) === canonical(reference))) fail('确认未在策略输入中声明。');
      const error = observed.confirmations.errors.find(item => canonical(item.reference) === canonical(reference));
      if (error) issues.push(error.message);
    }
    const approvals = observed.confirmations.reads;
    const approvalsByReference = new Map(approvals.map(approval => [canonical(approval.reference), approval]));
    const currentOperation = input.operationBinding ? parseOperationBinding(input.operationBinding) : undefined;
    if (observed.activationIssue) issues.push(observed.activationIssue);
    for (const action of policy.actions) if (!sourceCovers(context.record, action)) issues.push(`缺少覆盖当前范围的动作来源：${action}`);
    const found = new Set<string>();
    const foundBindings = new Set<string>();
    const confirmationBindings: { reference: ConfirmationReference; requestFingerprint: string; decisionFingerprint: string }[] = [];
    for (const reference of references) {
      try {
        if (reference.workId !== workId) fail('策略确认须登记在当前工作；跨工作内容通过 externalUpstream 显式引用。');
        const approval = approvalsByReference.get(canonical(reference));
        if (!approval) continue;
        const request = approval.request;
        if (!approval.check.confirmed) { issues.push(...approval.check.issues); continue; }
        if (!context.record.scope.repositories.every(repository => request.scope.repositories.includes(repository))
          || !context.record.scope.targets.every(target => request.scope.targets.includes(target))) fail('确认范围未覆盖当前动作。');
        if (request.workflowBinding?.workflowDigest !== context.snapshot.digest || request.workflowBinding.intentDigest !== context.intentDigest) fail('确认未绑定当前流程与意图。');
        if (request.gate === 'operation') {
          if (request.workflowBinding.stageId === input.stageId) {
            if (!currentOperation || canonical(request.operationBinding) !== canonical(currentOperation)
              || currentOperation.stageId !== input.stageId || currentOperation.ownerWorkId !== workId
              || policy.actions.some(action => !currentOperation.actions.includes(action))) fail('操作对象、动作、环境或恢复条件与批准不一致。');
          } else if (!policy.requiredBindings.some(binding => binding.stageId === request.workflowBinding.stageId && binding.gate === 'operation'))
            fail('操作批准既不属于当前动作，也不属于所需前置阶段。');
        }
        found.add(request.gate);
        if (request.workflowBinding.stageId) foundBindings.add(`${request.workflowBinding.stageId}:${request.gate}`);
        confirmationBindings.push({ reference, requestFingerprint: approval.requestFingerprint, decisionFingerprint: approval.decisionFingerprint });
      } catch (error) { issues.push((error as Error).message); }
    }
    for (const gate of policy.requiredConfirmations) if (!found.has(gate)) issues.push(`缺少当前有效确认：${gate}`);
    for (const binding of policy.requiredBindings) if (!foundBindings.has(`${binding.stageId}:${binding.gate}`)) issues.push(`缺少具体阶段确认：${binding.stageId}/${binding.gate}`);
    return { ...policy, root: context.root, workId, workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest,
      allowed: issues.length === 0, issues, confirmationBindings, sourceVerification: 'not-independently-verified' as const, automaticTransition: false };
}

/** Conservative comparison. Unknown conditions are part of the proof, not treated as false. */
export function compareWorkflowPolicies(baselineValue: WorkflowSnapshot, candidateValue: WorkflowSnapshot) {
  const baseline = parseWorkflowSnapshot(baselineValue).definition;
  const candidate = parseWorkflowSnapshot(candidateValue).definition;
  const differences = new Set<string>();
  const used = new Set<string>();
  const collect = (condition: WorkflowCondition | undefined, facts = used): void => {
    if (!condition) return;
    if ('fact' in condition) facts.add(condition.fact);
    else if ('not' in condition) collect(condition.not, facts);
    else for (const child of 'all' in condition ? condition.all : condition.any) collect(child, facts);
  };
  for (const stage of [...baseline.stages, ...candidate.stages]) collect(stage.when);
  const subset = (before: readonly string[], after: readonly string[]) => before.every(value => after.includes(value));
  if (!subset(baseline.completion.requiredStages, candidate.completion.requiredStages)
    || !subset(baseline.completion.requiredOutputs, candidate.completion.requiredOutputs)
    || !subset(baseline.completion.checks, candidate.completion.checks)
    || baseline.completion.result !== candidate.completion.result) differences.add('completion-changed');
  for (const output of baseline.outputs) {
    const next = candidate.outputs.find(item => item.id === output.id);
    if (!next || next.role !== output.role || next.producer !== output.producer) differences.add(`output-changed:${output.id}`);
  }
  for (const before of baseline.stages) {
    const after = candidate.stages.find(stage => stage.id === before.id);
    if (!after) { differences.add(`stage-removed:${before.id}`); continue; }
    if (!subset(after.actions, before.actions)) differences.add(`actions-expanded:${before.id}`);
    if (!subset(before.confirmations, after.confirmations)) differences.add(`confirmations-removed:${before.id}`);
    if (before.confirmations.length && before.confirmationAt === 'start' && after.confirmationAt !== 'start') differences.add(`confirmation-delayed:${before.id}`);
    if (!subset(before.dependsOn, after.dependsOn) || !subset(before.consumes, after.consumes) || !subset(before.produces, after.produces)
      || !subset(before.checks, after.checks)) differences.add(`stage-contract-changed:${before.id}`);
  }
  for (const after of candidate.stages) if (!baseline.stages.some(before => before.id === after.id)) differences.add(`stage-added-unproven:${after.id}`);
  // Keep the public whole-policy proof-space diagnostic, but conditions only
  // depend on the facts occurring in the particular pair being compared.
  const combinations = 3 ** used.size;
  const changedConditions = baseline.stages.flatMap(before => {
    const after = candidate.stages.find(stage => stage.id === before.id);
    return after && canonical(before.when ?? null) !== canonical(after.when ?? null) ? [{ before, after }] : [];
  });
  const values = [false, true, 'unknown'] as const;
  for (const { before, after } of changedConditions) {
    const relevant = new Set<string>();
    collect(before.when, relevant); collect(after.when, relevant);
    const facts = [...relevant].sort() as (keyof WorkflowFacts)[];
    for (let index = 0; index < 3 ** facts.length; index++) {
      const input: WorkflowFacts = {}; let cursor = index;
      for (const fact of facts) { input[fact] = values[cursor % 3]!; cursor = Math.floor(cursor / 3); }
      const previous = evaluateWorkflowCondition(before.when, input);
      const next = evaluateWorkflowCondition(after.when, input);
      if (previous !== next) { differences.add(`condition-changed-unproven:${before.id}`); break; }
    }
  }
  return { requiresApproval: differences.size > 0, differences: [...differences].sort(), combinations };
}

export interface WorkflowRegistrationInput {
  operationId: string; expectedRevision: number; ownerWorkId: string;
  candidate: { id: string; version: string }; baseline: { id: string; version: string };
  confirmationRefs: ConfirmationReference[];
}
export interface WorkflowActivationBinding { receiptId: string; receiptDigest: string }
interface IndexEntry { id: string; version: string; digest: string; receiptId: string; receiptDigest: string }
interface PolicyIndex {
  schemaVersion: 1; revision: number; entries: IndexEntry[];
  operations: { operationId: string; inputDigest: string; receiptId: string }[];
}
interface Receipt {
  schemaVersion: 1; receiptId: string; input: WorkflowRegistrationInput; inputDigest: string;
  candidate: WorkflowSnapshot; baseline: WorkflowSnapshot; ownerIntentDigest: string; changeDigest: string;
  approvals: { reference: ConfirmationReference; requestFingerprint: string; decisionFingerprint: string }[];
  createdAt: string;
}
function parseRegistration(value: unknown): WorkflowRegistrationInput {
  const item = object(value, ['operationId', 'expectedRevision', 'ownerWorkId', 'candidate', 'baseline', 'confirmationRefs']);
  const candidate = selected(item.candidate);
  if (!candidate.id.startsWith('project.')) fail('项目扩展不能覆盖内置流程。');
  return { operationId: identity(item.operationId), expectedRevision: revision(item.expectedRevision), ownerWorkId: identity(item.ownerWorkId),
    candidate, baseline: selected(item.baseline), confirmationRefs: refs(item.confirmationRefs) };
}
async function index(root: string): Promise<{ original: string | null; value: PolicyIndex }> {
  await assertSafePaths(root, [indexPath]);
  const original = await readWorkflowControlText(root, indexPath, 1024 * 1024);
  if (original === null) return { original, value: { schemaVersion: 1, revision: 0, entries: [], operations: [] } };
  const raw = object(JSON.parse(original) as unknown, ['schemaVersion', 'revision', 'entries', 'operations']);
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.entries) || raw.entries.length > limit || !Array.isArray(raw.operations) || raw.operations.length > 1024) fail('扩展索引版本或大小无效。');
  const entries = raw.entries.map(value => {
    const entry = object(value, ['id', 'version', 'digest', 'receiptId', 'receiptDigest']);
    return { ...selected({ id: entry.id, version: entry.version }), digest: digest(entry.digest), receiptId: digest(entry.receiptId), receiptDigest: digest(entry.receiptDigest) };
  });
  const operations = raw.operations.map(value => {
    const operation = object(value, ['operationId', 'inputDigest', 'receiptId']);
    return { operationId: identity(operation.operationId), inputDigest: digest(operation.inputDigest), receiptId: digest(operation.receiptId) };
  });
  if (new Set(entries.map(entry => `${entry.id}@${entry.version}`)).size !== entries.length || entries.some(entry => !entry.id.startsWith('project.'))
    || new Set(operations.map(entry => entry.operationId)).size !== operations.length || revision(raw.revision) !== operations.length
    || entries.some(entry => !operations.some(operation => operation.receiptId === entry.receiptId))) fail('扩展索引身份或修订链无效。');
  return { original, value: { schemaVersion: 1, revision: revision(raw.revision), entries, operations } };
}
function receiptPath(receiptId: string): string { return `${directory}/receipts/${digest(receiptId)}.json`; }
async function readReceipt(root: string, entry: IndexEntry): Promise<Receipt> {
  const path = receiptPath(entry.receiptId);
  await assertSafePaths(root, [path]);
  const contents = await readWorkflowControlText(root, path, 2 * 1024 * 1024);
  if (contents === null || textHash(contents) !== entry.receiptDigest) fail('精确启用回执缺失或变化。');
  const item = object(JSON.parse(contents) as unknown, ['schemaVersion', 'receiptId', 'input', 'inputDigest', 'candidate', 'baseline', 'ownerIntentDigest', 'changeDigest', 'approvals', 'createdAt']);
  if (item.schemaVersion !== 1 || item.receiptId !== entry.receiptId || !Array.isArray(item.approvals) || item.approvals.length > limit) fail('启用回执版本或身份无效。');
  const input = parseRegistration(item.input);
  const candidate = parseWorkflowSnapshot(item.candidate); const baseline = parseWorkflowSnapshot(item.baseline);
  const approvals = item.approvals.map(raw => {
    const approval = object(raw, ['reference', 'requestFingerprint', 'decisionFingerprint']);
    return { reference: refs([approval.reference])[0]!, requestFingerprint: digest(approval.requestFingerprint), decisionFingerprint: digest(approval.decisionFingerprint) };
  });
  const createdAt = text(item.createdAt, 32);
  if (!Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt
    || candidate.id !== entry.id || candidate.version !== entry.version || candidate.digest !== entry.digest
    || canonical(input.candidate) !== canonical({ id: candidate.id, version: candidate.version })
    || canonical(input.baseline) !== canonical({ id: baseline.id, version: baseline.version })
    || digest(item.inputDigest) !== hash(input)) fail('启用回执内容绑定无效。');
  return { schemaVersion: 1, receiptId: entry.receiptId, input, inputDigest: digest(item.inputDigest), candidate, baseline,
    ownerIntentDigest: digest(item.ownerIntentDigest), changeDigest: digest(item.changeDigest), approvals, createdAt };
}
function changeDigest(candidate: WorkflowSnapshot, baseline: WorkflowSnapshot, ownerWorkId: string, intentDigest: string): string {
  return hash({ candidate, baseline, ownerWorkId, intentDigest });
}
async function approvalBindings(root: string, input: WorkflowRegistrationInput, change: string, required: boolean, owner: WorkflowWorkRecord) {
  const result: Receipt['approvals'] = [];
  const approvals = await readConfirmations(root, input.confirmationRefs);
  for (const [index, reference] of input.confirmationRefs.entries()) {
    const approval = approvals[index]!;
    if (!approval.check.confirmed || reference.workId !== input.ownerWorkId || approval.request.gate !== 'scope'
      || approval.request.scopeBinding?.kind !== 'workflow-extension' || approval.request.scopeBinding.ownerWorkId !== input.ownerWorkId
      || approval.request.scopeBinding.changeDigest !== change) fail('扩展须引用当前有效且精确绑定变更的 scope 批准。');
    if (!owner.scope.repositories.every(repository => approval.request.scope.repositories.includes(repository))
      || !owner.scope.targets.every(target => approval.request.scope.targets.includes(target))) fail('扩展 scope 批准未覆盖承载工作的实际配置变更范围。');
    result.push({ reference, requestFingerprint: approval.requestFingerprint, decisionFingerprint: approval.decisionFingerprint });
  }
  if (required && !result.length) fail('扩展政策存在放宽或不能证明收紧的差异，须取得精确 scope 批准。');
  return result;
}
async function inspectReceipt(root: string, entry: IndexEntry) {
  return withConfirmationVisit(root, 'workflow-policy', entry.receiptId, () => inspectReceiptWithinVisit(root, entry));
}
async function inspectReceiptWithinVisit(root: string, entry: IndexEntry) {
  const receipt = await readReceipt(root, entry);
  const owner = await loadWorkflowPolicyContext(root, receipt.input.ownerWorkId);
  if (owner.sourceIssues.length || owner.intentDigest !== receipt.ownerIntentDigest || !sourceCovers(owner.record, 'edit-documents')) fail('扩展配置来源或承载工作意图已变化。');
  await assertWorkflowActivationCurrent(root, owner.record);
  const candidate = (await loadProjectWorkflows(root)).find(item => item.snapshot.id === entry.id && item.snapshot.version === entry.version);
  if (!candidate || candidate.snapshot.digest !== receipt.candidate.digest) fail('扩展候选来源已变化或缺失。');
  await assertSafePaths(root, [candidate.path]);
  const change = changeDigest(receipt.candidate, receipt.baseline, receipt.input.ownerWorkId, owner.intentDigest);
  if (change !== receipt.changeDigest) fail('扩展变更摘要无效。');
  const difference = compareWorkflowPolicies(receipt.baseline, receipt.candidate);
  const approvals = await approvalBindings(root, receipt.input, change, difference.requiresApproval, owner.record);
  if (canonical(approvals) !== canonical(receipt.approvals)) fail('扩展批准已被替代或变化。');
  return { snapshot: receipt.candidate, activation: { receiptId: entry.receiptId, receiptDigest: entry.receiptDigest }, receipt };
}
export async function loadActiveProjectWorkflow(root: string, id: string, version?: string) {
  const data = await index(root);
  const matches = data.value.entries.filter(entry => entry.id === id && (version === undefined || entry.version === version));
  if (matches.length !== 1) fail(matches.length ? '项目存在多个启用版本，必须明确版本。' : '项目流程尚未有效启用。');
  return inspectReceipt(root, matches[0]!);
}
export async function assertWorkflowActivationCurrent(root: string, record: WorkflowWorkRecord): Promise<void> {
  if (!record.workflow.id.startsWith('project.')) return;
  if (!record.workflow.activation) fail('工作未绑定精确有效的流程启用回执。');
  await withConfirmationVisit(root, 'workflow-policy', record.workflow.activation.receiptId,
    () => inspectWorkflowActivation(root, record));
}
/** Write boundaries include only the activation receipts and owner sources actually consumed. */
export async function assertWorkflowActivationSharing(root: string, record: Pick<WorkflowWorkRecord, 'workflow'>, proofs?: SharedWriteProof[]): Promise<void> {
  const seen = new Set<string>();
  async function visit(workflow: WorkflowWorkRecord['workflow']): Promise<void> {
    if (!workflow.id.startsWith('project.')) return;
    const data = await index(root);
    const entry = data.value.entries.find(item => item.id === workflow.id && item.version === workflow.version);
    if (!entry || !workflow.activation || entry.digest !== workflow.digest || entry.receiptId !== workflow.activation.receiptId
      || entry.receiptDigest !== workflow.activation.receiptDigest) fail('工作未绑定精确有效的流程启用回执。');
    if (seen.has(entry.receiptId)) return;
    seen.add(entry.receiptId);
    if (seen.size > limit) fail('流程启用依赖超过限制。');
    const receipt = await readReceipt(root, entry);
    const owner = await loadWorkflowPolicyContext(root, receipt.input.ownerWorkId);
    const candidate = (await loadProjectWorkflows(root)).find(item => item.snapshot.id === entry.id && item.snapshot.version === entry.version);
    if (!candidate || candidate.snapshot.digest !== receipt.candidate.digest) fail('扩展候选来源已变化或缺失。');
    await assertSharedRegistrationReferences(root, owner.record.id, [
      { repository: '.', path: indexPath }, { repository: '.', path: receiptPath(entry.receiptId) },
      { repository: '.', path: candidate.path },
    ], proofs);
    await assertSharedRegistrationReferences(owner.root, owner.record.id, [
      { repository: '.', path: `.tiller/work/${owner.record.id}/record.json` }, { repository: '.', path: owner.record.workflow.path },
      ...owner.record.basis.map(item => item.reference), ...owner.record.actionSources.map(item => item.reference),
    ], proofs);
    await assertConfirmationSharing(root, receipt.input.confirmationRefs, proofs);
    await visit(owner.record.workflow);
    await assertWorkflowPolicyContextCurrent(owner);
  }
  await visit(record.workflow);
}
/** Inspect the current activation receipt at the action's explicit policy boundary. */
async function inspectWorkflowActivation(root: string, record: WorkflowWorkRecord): Promise<void> {
  const data = await index(root);
  const entry = data.value.entries.find(item => item.id === record.workflow.id && item.version === record.workflow.version);
  if (!entry || !record.workflow.activation || entry.digest !== record.workflow.digest
    || entry.receiptId !== record.workflow.activation.receiptId || entry.receiptDigest !== record.workflow.activation.receiptDigest) fail('工作未绑定精确有效的流程启用回执。');
  await inspectReceiptWithinVisit(root, entry);
}
async function prepareRegistration(rootInput: string, value: unknown) {
  const input = parseRegistration(value);
  const root = await resolveWorkRoot(rootInput, input.ownerWorkId);
    await readProjectMetadata(root);
    const data = await index(root);
    const inputDigest = hash(input);
    const replay = data.value.operations.find(operation => operation.operationId === input.operationId);
    if (replay) {
      if (replay.inputDigest !== inputDigest) fail('operationId 已用于其他扩展输入。');
      const entry = data.value.entries.find(item => item.receiptId === replay.receiptId);
      if (!entry) fail('历史扩展回执未被索引。');
      await inspectReceipt(root, entry);
      return { root, input, data, inputDigest, historical: true as const, planId: replay.receiptId, allowed: true, issues: [] as string[] };
    }
    if (input.expectedRevision !== data.value.revision) fail('扩展索引修订已变化。');
    if (data.value.operations.length >= 1024 || data.value.entries.length >= limit) fail('扩展索引达到数量上限。');
    const candidate = (await loadProjectWorkflows(root)).find(item => item.snapshot.id === input.candidate.id && item.snapshot.version === input.candidate.version);
    if (!candidate) fail('精确候选流程不存在。');
    await assertSafePaths(root, [candidate.path]);
    const existing = data.value.entries.find(entry => entry.id === candidate.snapshot.id && entry.version === candidate.snapshot.version);
    if (existing) fail(existing.digest !== candidate.snapshot.digest ? '同一流程版本不能覆盖为不同摘要。' : '该流程版本已经启用；应使用原 operationId 重试。');
    const baseline = input.baseline.id.startsWith('project.')
      ? (await loadActiveProjectWorkflow(root, input.baseline.id, input.baseline.version)).snapshot
      : (await loadBuiltinWorkflows()).find(item => item.id === input.baseline.id && item.version === input.baseline.version);
    if (!baseline) fail('基线固定流程不存在。');
    const owner = await loadWorkflowPolicyContext(root, input.ownerWorkId);
    const issues = [...owner.sourceIssues];
    try { await assertWorkflowActivationCurrent(root, owner.record); } catch (error) { issues.push((error as Error).message); }
    if (!owner.record.scope.repositories.includes('.') || !sourceCovers(owner.record, 'edit-documents')) issues.push('扩展缺少覆盖承载工作范围的配置编辑来源。');
    const difference = compareWorkflowPolicies(baseline, candidate.snapshot);
    const change = changeDigest(candidate.snapshot, baseline, input.ownerWorkId, owner.intentDigest);
    let approvals: Receipt['approvals'] = [];
    try { approvals = await approvalBindings(root, input, change, difference.requiresApproval, owner.record); } catch (error) { issues.push((error as Error).message); }
    const basis = { input, inputDigest, candidate: candidate.snapshot, baseline, ownerIntentDigest: owner.intentDigest, changeDigest: change, approvals };
    return { root, input, data, inputDigest, historical: false as const, planId: hash({ basis, index: data.value }), allowed: issues.length === 0,
      issues, difference, basis, owner, candidatePath: candidate.path };
}
export async function planWorkflowRegistration(root: string, input: unknown) {
  const plan = await prepareRegistration(root, input);
  return { root: plan.root, planId: plan.planId, operationAllowed: plan.allowed, historical: plan.historical,
    revision: plan.data.value.revision, blockingReasons: plan.issues,
    ...(!plan.historical ? { changeDigest: plan.basis.changeDigest, difference: plan.difference, candidate: plan.basis.candidate, baseline: plan.basis.baseline } : {}),
    automaticTransition: false };
}
export async function applyWorkflowRegistration(rootInput: string, input: unknown, planId: string) {
  digest(planId);
  const parsed = parseRegistration(input); const root = await resolveWorkRoot(rootInput, parsed.ownerWorkId);
  await readProjectMetadata(root);
  return withProjectLock(root, async () => {
    const plan = await prepareRegistration(root, parsed);
    if (plan.planId !== planId || !plan.allowed) fail(`扩展预览已变化或有未满足条件：${plan.issues.join('；')}`);
    if (plan.historical) return { changed: false, historical: true, receiptId: plan.planId, revision: plan.data.value.revision, automaticTransition: false };
    const receipt: Receipt = { schemaVersion: 1, receiptId: planId, ...plan.basis, createdAt: new Date().toISOString() };
    const contents = json(receipt); if (Buffer.byteLength(contents) > 2 * 1024 * 1024) fail('扩展回执过大。');
    const entry = { id: receipt.candidate.id, version: receipt.candidate.version, digest: receipt.candidate.digest, receiptId: planId, receiptDigest: textHash(contents) };
    const next: PolicyIndex = { schemaVersion: 1, revision: plan.data.value.revision + 1,
      entries: [...plan.data.value.entries, entry], operations: [...plan.data.value.operations, { operationId: parsed.operationId, inputDigest: plan.inputDigest, receiptId: planId }] };
    const changes: FileChange[] = [{ path: receiptPath(planId), before: null, after: contents }, { path: indexPath, before: plan.data.original, after: json(next) }];
    await assertSafePaths(root, changes.map(change => change.path));
    const final = await prepareRegistration(root, parsed);
    if (final.historical || final.planId !== planId || !final.allowed) fail('扩展写入前依据已变化。');
    await assertSharedRegistrationReferences(root, parsed.ownerWorkId, [
      { repository: '.', path: final.candidatePath }, { repository: '.', path: final.owner.record.workflow.path },
      { repository: '.', path: `.tiller/work/${parsed.ownerWorkId}/record.json` },
      ...final.owner.record.basis.map(item => item.reference), ...final.owner.record.actionSources.map(item => item.reference),
    ]);
    await assertWorkflowActivationSharing(root, final.owner.record);
    if (parsed.baseline.id.startsWith('project.')) {
      const baseline = await loadActiveProjectWorkflow(root, parsed.baseline.id, parsed.baseline.version);
      await assertWorkflowActivationSharing(root, { workflow: { id: baseline.snapshot.id, version: baseline.snapshot.version,
        digest: baseline.snapshot.digest, path: final.owner.record.workflow.path, activation: baseline.activation } });
    }
    await assertConfirmationSharing(root, parsed.confirmationRefs);
    await assertWorkflowPolicyContextCurrent(final.owner);
    await applyChanges(root, changes);
    try {
      for (const change of changes) if (await readTextIfExists(root, change.path) !== change.after) fail('扩展写后控制资料已被其他写入改变。');
      await inspectReceipt(root, entry);
      for (const change of changes) if (await readTextIfExists(root, change.path) !== change.after) fail('扩展核验期间控制资料已变化。');
    }
    catch (error) {
      const own: FileChange[] = [];
      for (const change of changes) if (change.before !== null && await readTextIfExists(root, change.path) === change.after)
        own.push({ path: change.path, before: change.after, after: change.before });
      if (own.length) await applyChanges(root, own);
      for (const change of changes) if (change.before === null) {
        const target = await assertSafePath(root, change.path);
        if (await readTextIfExists(root, change.path) === change.after) await unlink(target);
      }
      throw error;
    }
    return { changed: true, historical: false, receiptId: planId, activation: { receiptId: planId, receiptDigest: entry.receiptDigest }, revision: next.revision, automaticTransition: false };
  });
}
