import { createHash } from 'node:crypto';
import { lstat, open, readFile } from 'node:fs/promises';
import { readProjectMetadata } from './core.js';
import { resolveRepositoryRoot, resolveWorkRoot } from './delivery-location.js';
import { applyChanges, assertSafePath, inspectSafePaths, readTextIfExists, validateRelativePath, withProjectLock, assertSafePaths } from './files.js';
import { repositoryPath } from './repository-paths.js';
import { assertSharedWritePaths } from './shared-paths.js';
import type { SharedWriteProof } from './shared-paths.js';
import { assertVerificationInput } from './verification-selection.js';
import { contentIssues, templateTypes, validateWorkId, validateWorkScope } from './work.js';
import type { FileRef, TemplateType, WorkScope } from './work.js';
import {
  BUILTIN_WORKFLOW_IDS, WORKFLOW_ACTIONS, WORKFLOW_FACTS, loadBuiltinWorkflows,
  parseWorkflowSnapshot, resolveWorkflowApplicability,
} from './workflow-catalog.js';
import type { WorkflowAction, WorkflowFact, WorkflowSnapshot } from './workflow-catalog.js';
import type { FileChange } from './types.js';
import type { ConfirmationReference } from './confirmations.js';
import type { WorkflowActivationBinding } from './workflow-policy.js';

export const WORKFLOW_WORK_LIMITS = Object.freeze({ recordBytes: 1048576, referenceBytes: 4194304, aggregateBytes: 16777216, sources: 128, outputs: 256, links: 256, text: 10000, operations: 1024 });
export interface WorkflowBasis { reference: FileRef; purpose: string }
export interface WorkflowActionSource { actions: WorkflowAction[]; reference: FileRef; quote: string; scope: WorkScope }
export interface WorkflowWorkInput {
  operationId: string; expectedRevision: 0; workflow: string; goal: string; reason: string; scope: WorkScope;
  impact: Partial<Record<WorkflowFact, boolean | 'unknown'>>;
  basis: WorkflowBasis[]; actionSources: WorkflowActionSource[];
  expectedOutputs: string[]; completionCriteria: string[]; level?: 'product' | 'module' | 'change'; workflowVersion?: string;
}
export interface WorkflowWorkArtifact {
  outputId: string; role: string; source: FileRef; origin: 'generated' | 'reference';
  status: 'draft'; registeredAt: string; registeredHash: string; template?: TemplateType;
}
export interface WorkflowWorkOperation {
  operationId: string; kind: 'create' | 'output-add' | 'workflow-change' | 'links-change'; inputDigest: string; revision: number; at: string;
  outputId?: string; mappedOutputs?: string[]; workflowDigest?: string; changeDigest?: string;
}
export interface WorkflowLink {
  id: string; consumerStageId: string;
  producer: { workId: string; workflowRevision: number; stageId: string; outputId: string };
  binding: { attemptId: string; eventSequence: number; source: FileRef; sha256: string };
}
export interface WorkflowWorkRecord {
  schemaVersion: 4; id: string; title: string; createdAt: string; level: 'product' | 'module' | 'change';
  revision: number; workflowRevision: number; scope: WorkScope; goal: string; selectionReason: string;
  impact: Record<WorkflowFact, boolean | 'unknown'>;
  basis: (WorkflowBasis & { sha256: string })[];
  actionSources: (WorkflowActionSource & { sha256: string })[];
  expectedOutputs: string[]; completionCriteria: string[];
  workflow: { id: string; version: string; digest: string; path: string; activation?: WorkflowActivationBinding };
  artifacts: Record<string, WorkflowWorkArtifact>; links: WorkflowLink[]; operations: WorkflowWorkOperation[];
}
export interface WorkflowOutputInput {
  operationId: string; expectedRevision: number; outputId: string;
  source?: FileRef; content?: string; template?: TemplateType; confirmationRefs?: ConfirmationReference[];
}
function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); }
function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_WORKFLOW_WORK', '工作字段必须是普通对象。');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (!required.includes(key) && !optional.includes(key))) fail('INVALID_WORKFLOW_WORK', `工作字段不受支持：${String(key)}`);
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!)) fail('INVALID_WORKFLOW_WORK', '工作记录不支持访问器。');
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail('INVALID_WORKFLOW_WORK', `缺少工作字段：${key}`);
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number = WORKFLOW_WORK_LIMITS.text): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) fail('INVALID_WORKFLOW_WORK', '工作文本缺失或超出大小限制。');
  return value;
}
function id(value: unknown): string { const parsed = text(value, 64); validateWorkId(parsed); return parsed; }
function flowId(value: unknown): string {
  const parsed = text(value, 64);
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(parsed) || ['constructor', 'prototype'].includes(parsed)) fail('INVALID_WORKFLOW_WORK', '流程产物标识或角色无效。');
  return parsed;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail('INVALID_WORKFLOW_WORK', '工作摘要无效。');
  return value;
}
function at(value: unknown): string {
  const parsed = text(value, 32);
  if (!Number.isFinite(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) fail('INVALID_WORKFLOW_WORK', '工作时间必须是完整 UTC 时间。');
  return parsed;
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > WORKFLOW_WORK_LIMITS.operations) fail('INVALID_WORKFLOW_WORK', '工作修订无效或超出限制。');
  return Number(value);
}
function list<T>(value: unknown, parse: (raw: unknown) => T, maximum: number = WORKFLOW_WORK_LIMITS.sources, minimum = 0): T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail('INVALID_WORKFLOW_WORK', '工作列表为空或超出大小限制。');
  return Array.from(value, parse);
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length) fail('INVALID_WORKFLOW_WORK', '工作列表含重复条目。');
  return items;
}
function texts(value: unknown, maximum: number = WORKFLOW_WORK_LIMITS.sources, minimum = 0): string[] { return unique(list(value, raw => text(raw), maximum, minimum), item => item); }
function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function refKey(ref: FileRef): string { return `${ref.repository}::${ref.path}`.toLowerCase(); }
function paths(id: string) { validateWorkId(id); const directory = `.tiller/work/${id}`; return { directory, record: `${directory}/record.json`, notes: `${directory}/work.md` }; }
export function validateWorkflowReference(value: unknown): FileRef {
  const item = object(value, ['repository', 'path']);
  const reference = { repository: text(item.repository, 64), path: text(item.path, 1024) };
  assertVerificationInput(reference);
  if (/(?:^|\/)\.tiller\/work\/[^/]+\/(?:workflow|stages|transitions)(?:\/|$)/u.test(reference.path.toLowerCase())) fail('INVALID_WORK_REFERENCE', '工作流程控制记录不能作为独立产物或授权来源。');
  return reference;
}
function scope(value: unknown): WorkScope {
  const raw = object(value, ['repositories', 'targets']);
  for (const entries of [raw.repositories, raw.targets]) if (!Array.isArray(entries) || entries.length > WORKFLOW_WORK_LIMITS.sources) fail('INVALID_WORKFLOW_WORK', '工作范围超过限制。');
  const result = validateWorkScope(value);
  if (result.repositories.length > WORKFLOW_WORK_LIMITS.sources || result.targets.length > WORKFLOW_WORK_LIMITS.sources || result.targets.some(target => target.length > 1024)) fail('INVALID_WORKFLOW_WORK', '工作范围超过限制。');
  for (const repository of result.repositories) if (repository !== '.' && repository.includes('/')) fail('INVALID_WORKFLOW_WORK', '仓库必须使用登记的稳定标识。');
  return result;
}
function within(reference: FileRef, owner: WorkScope): void { if (!owner.repositories.includes(reference.repository)) fail('INVALID_WORK_SCOPE', '引用超出工作仓库范围。'); }
function basis(value: unknown): WorkflowBasis {
  const item = object(value, ['reference', 'purpose']);
  return { reference: validateWorkflowReference(item.reference), purpose: text(item.purpose) };
}
function actionSource(value: unknown): WorkflowActionSource {
  const item = object(value, ['actions', 'reference', 'quote', 'scope']);
  const actions = unique(list(item.actions, raw => {
    if (!WORKFLOW_ACTIONS.includes(raw as WorkflowAction)) fail('INVALID_WORKFLOW_WORK', '授权来源包含未知动作类别。');
    return raw as WorkflowAction;
  }, WORKFLOW_ACTIONS.length, 1), action => action);
  return { actions, reference: validateWorkflowReference(item.reference), quote: text(item.quote), scope: scope(item.scope) };
}
function impacts(value: unknown, complete = false): Record<WorkflowFact, boolean | 'unknown'> {
  const item = object(value, complete ? [...WORKFLOW_FACTS] : [], complete ? [] : [...WORKFLOW_FACTS]);
  return Object.fromEntries(WORKFLOW_FACTS.map(fact => {
    const actual = Object.hasOwn(item, fact) ? item[fact] : 'unknown';
    if (actual !== true && actual !== false && actual !== 'unknown') fail('INVALID_WORKFLOW_WORK', '影响事实必须为布尔值或 unknown。');
    return [fact, actual];
  })) as Record<WorkflowFact, boolean | 'unknown'>;
}
function level(value: unknown): WorkflowWorkRecord['level'] {
  if (!['product', 'module', 'change'].includes(String(value))) fail('INVALID_WORKFLOW_WORK', '文档层级必须是 product、module 或 change。');
  return value as WorkflowWorkRecord['level'];
}
function size(value: unknown): void { if (Buffer.byteLength(JSON.stringify(value), 'utf8') > WORKFLOW_WORK_LIMITS.recordBytes) fail('WORKFLOW_WORK_TOO_LARGE', '工作记录超过 1 MiB。'); }
export function serializeWorkflowWorkRecord(record: WorkflowWorkRecord): string {
  parseWorkflowWorkRecord(record, record.id);
  const contents = JSON.stringify(record, null, 2) + '\n';
  if (Buffer.byteLength(contents, 'utf8') > WORKFLOW_WORK_LIMITS.recordBytes) fail('WORKFLOW_WORK_TOO_LARGE', '序列化工作记录超过 1 MiB 大小限制。');
  return contents;
}
export function parseWorkflowWorkInput(value: unknown): WorkflowWorkInput {
  const item = object(value, ['operationId', 'expectedRevision', 'workflow', 'goal', 'reason', 'scope', 'impact', 'basis', 'actionSources', 'expectedOutputs', 'completionCriteria'], ['level', 'workflowVersion']);
  if (item.expectedRevision !== 0) fail('REVISION_CONFLICT', '新工作 expectedRevision 必须为 0。');
  const workflow = text(item.workflow, 80);
  if (!BUILTIN_WORKFLOW_IDS.includes(workflow as typeof BUILTIN_WORKFLOW_IDS[number]) && !/^project\.[a-z][a-z0-9-]{0,63}$/u.test(workflow)) fail('WORKFLOW_REQUIRED', '必须显式选择支持的 workflow，文档模板不能代替流程类型。');
  const result: WorkflowWorkInput = {
    operationId: id(item.operationId), expectedRevision: 0, workflow, goal: text(item.goal), reason: text(item.reason), scope: scope(item.scope), impact: impacts(item.impact),
    basis: unique(list(item.basis, basis), entry => refKey(entry.reference)), actionSources: list(item.actionSources, actionSource),
    expectedOutputs: unique(list(item.expectedOutputs, flowId, WORKFLOW_WORK_LIMITS.outputs, 1), value => value), completionCriteria: texts(item.completionCriteria, WORKFLOW_WORK_LIMITS.sources, 1), level: level(item.level ?? 'change'),
  };
  if (item.workflowVersion !== undefined) {
    result.workflowVersion = text(item.workflowVersion, 32);
    if (!/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u.test(result.workflowVersion)) fail('INVALID_WORKFLOW_WORK', '流程版本无效。');
  }
  for (const entry of [...result.basis, ...result.actionSources]) within(entry.reference, result.scope);
  for (const entry of result.actionSources) if (!entry.scope.repositories.every(repo => result.scope.repositories.includes(repo)) || !entry.scope.targets.every(target => result.scope.targets.includes(target))) fail('INVALID_WORK_SCOPE', '声明的动作来源范围超出当前工作；请明确本次适用范围。');
  size(result);
  return result;
}
function operation(value: unknown): WorkflowWorkOperation {
  const item = object(value, ['operationId', 'kind', 'inputDigest', 'revision', 'at'], ['outputId', 'mappedOutputs', 'workflowDigest', 'changeDigest']);
  if (item.kind !== 'create' && item.kind !== 'output-add' && item.kind !== 'workflow-change' && item.kind !== 'links-change') fail('INVALID_WORKFLOW_WORK', '未知工作登记操作。');
  const result: WorkflowWorkOperation = { operationId: id(item.operationId), kind: item.kind, inputDigest: digest(item.inputDigest), revision: count(item.revision), at: at(item.at) };
  if (result.kind === 'output-add') result.outputId = flowId(item.outputId);
  else if (Object.hasOwn(item, 'outputId')) fail('INVALID_WORKFLOW_WORK', '非产物操作不能伪装为产物登记。');
  if (result.kind === 'workflow-change') {
    result.mappedOutputs = unique(list(item.mappedOutputs, flowId, WORKFLOW_WORK_LIMITS.outputs), entry => entry);
    result.workflowDigest = digest(item.workflowDigest); result.changeDigest = digest(item.changeDigest);
  } else if (['mappedOutputs', 'workflowDigest', 'changeDigest'].some(key => Object.hasOwn(item, key))) fail('INVALID_WORKFLOW_WORK', '非转换操作不能声明流程转换字段。');
  return result;
}
export function parseWorkflowLink(value: unknown): WorkflowLink {
  const item = object(value, ['id', 'consumerStageId', 'producer', 'binding']);
  const producer = object(item.producer, ['workId', 'workflowRevision', 'stageId', 'outputId']);
  const binding = object(item.binding, ['attemptId', 'eventSequence', 'source', 'sha256']);
  const workflowRevision = count(producer.workflowRevision);
  if (workflowRevision < 1 || !Number.isSafeInteger(binding.eventSequence) || Number(binding.eventSequence) < 1 || Number(binding.eventSequence) > 10000) fail('INVALID_WORKFLOW_WORK', '依赖必须绑定有效流程修订和阶段事件。');
  return {
    id: id(item.id), consumerStageId: flowId(item.consumerStageId),
    producer: { workId: id(producer.workId), workflowRevision, stageId: flowId(producer.stageId), outputId: flowId(producer.outputId) },
    binding: { attemptId: id(binding.attemptId), eventSequence: Number(binding.eventSequence), source: validateWorkflowReference(binding.source), sha256: digest(binding.sha256) },
  };
}
function artifact(value: unknown, outputId: string, workId: string): WorkflowWorkArtifact {
  const item = object(value, ['outputId', 'role', 'source', 'origin', 'status', 'registeredAt', 'registeredHash'], ['template']);
  if (item.outputId !== outputId || !['generated', 'reference'].includes(String(item.origin)) || item.status !== 'draft') fail('INVALID_WORKFLOW_WORK', '通用产物身份或状态无效；登记不是阶段验证或验收。');
  const result: WorkflowWorkArtifact = { outputId, role: flowId(item.role), source: validateWorkflowReference(item.source), origin: item.origin as 'generated' | 'reference', status: 'draft', registeredAt: at(item.registeredAt), registeredHash: digest(item.registeredHash) };
  if (result.origin === 'generated' && (result.source.repository !== '.' || result.source.path !== `${paths(workId).directory}/${result.role}.md`)) fail('INVALID_WORKFLOW_WORK', '生成产物位置与工作和角色不一致。');
  if (item.template !== undefined) {
    if (result.origin !== 'generated' || !templateTypes.includes(item.template as TemplateType) || !(item.template as string).endsWith(`-${result.role}`)) fail('INVALID_WORKFLOW_WORK', '文档模板与产物角色不一致。');
    result.template = item.template as TemplateType;
  }
  return result;
}
export function parseWorkflowWorkRecord(value: unknown, workId: string): WorkflowWorkRecord {
  validateWorkId(workId);
  if (value !== null && typeof value === 'object') {
    const version = Object.getOwnPropertyDescriptor(value, 'schemaVersion');
    if (version && 'value' in version && version.value !== 4) fail('UNSUPPORTED_RECORD_VERSION', '工作记录不支持此版本；仅支持当前版本 4。原文件保留，不迁移或继承批准。');
  }
  const item = object(value, ['schemaVersion', 'id', 'title', 'createdAt', 'level', 'revision', 'workflowRevision', 'scope', 'goal', 'selectionReason', 'impact', 'basis', 'actionSources', 'expectedOutputs', 'completionCriteria', 'workflow', 'artifacts', 'links', 'operations']);
  if (item.schemaVersion !== 4 || item.id !== workId) fail('INVALID_WORKFLOW_WORK', '工作版本或身份不一致。');
  const selected = object(item.workflow, ['id', 'version', 'digest', 'path'], ['activation']);
  const workflow: WorkflowWorkRecord['workflow'] = { id: text(selected.id, 80), version: text(selected.version, 32), digest: digest(selected.digest), path: text(selected.path, 1024) };
  if (!BUILTIN_WORKFLOW_IDS.includes(workflow.id as typeof BUILTIN_WORKFLOW_IDS[number]) && !/^project\.[a-z][a-z0-9-]{0,63}$/u.test(workflow.id)) fail('INVALID_WORKFLOW_WORK', '流程标识无效。');
  if (!/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u.test(workflow.version) || workflow.path !== `${paths(workId).directory}/workflow/definitions/${workflow.digest}.json`) fail('INVALID_WORKFLOW_WORK', '流程固定版本或快照位置不一致。');
  if (workflow.id.startsWith('project.')) {
    const activation = object(selected.activation, ['receiptId', 'receiptDigest']);
    workflow.activation = { receiptId: digest(activation.receiptId), receiptDigest: digest(activation.receiptDigest) };
  } else if (selected.activation !== undefined) fail('INVALID_WORKFLOW_WORK', '内置流程不能声明项目扩展启用回执。');
  validateRelativePath(workflow.path);
  const parsedBasis = list(item.basis, raw => {
    const entry = object(raw, ['reference', 'purpose', 'sha256']);
    return { ...basis({ reference: entry.reference, purpose: entry.purpose }), sha256: digest(entry.sha256) };
  });
  const parsedSources = list(item.actionSources, raw => {
    const entry = object(raw, ['actions', 'reference', 'quote', 'scope', 'sha256']);
    return { ...actionSource({ actions: entry.actions, reference: entry.reference, quote: entry.quote, scope: entry.scope }), sha256: digest(entry.sha256) };
  });
  const operations = unique(list(item.operations, operation, WORKFLOW_WORK_LIMITS.operations, 1), entry => entry.operationId);
  const revision = count(item.revision);
  if (revision !== operations.length || operations.some((entry, index) => entry.revision !== index + 1 || (entry.kind === 'create') !== (index === 0))) fail('INVALID_WORKFLOW_WORK', '工作登记修订链不连续。');
  const transition = operations.filter(entry => entry.kind === 'workflow-change').at(-1);
  const workflowRevision = count(item.workflowRevision);
  if (workflowRevision !== (transition?.revision ?? 1) || (transition && transition.workflowDigest !== workflow.digest)) fail('INVALID_WORKFLOW_WORK', '当前流程修订或定义与转换事实不一致。');
  let generationOutputs = new Set<string>();
  for (const entry of operations) {
    if (entry.kind === 'workflow-change') generationOutputs = new Set(entry.mappedOutputs);
    if (entry.kind === 'output-add') {
      if (generationOutputs.has(entry.outputId!)) fail('INVALID_WORKFLOW_WORK', '同一流程修订不能重复登记产物。');
      generationOutputs.add(entry.outputId!);
    }
  }
  const artifactData = object(item.artifacts, [], Object.keys(item.artifacts as object ?? {}));
  if (Object.keys(artifactData).length > WORKFLOW_WORK_LIMITS.outputs) fail('INVALID_WORKFLOW_WORK', '通用产物数量超出限制。');
  const artifacts = Object.fromEntries(Object.entries(artifactData).map(([key, raw]) => [flowId(key), artifact(raw, key, workId)]));
  unique(Object.values(artifacts), value => refKey(value.source));
  const outputOps = operations.filter(entry => entry.kind === 'output-add' && entry.revision > workflowRevision);
  const mappedOutputs = transition?.mappedOutputs ?? [];
  unique([...mappedOutputs, ...outputOps.map(entry => entry.outputId!)], entry => entry);
  if (mappedOutputs.length + outputOps.length !== Object.keys(artifacts).length
    || mappedOutputs.some(outputId => artifacts[outputId]?.registeredAt !== transition!.at || artifacts[outputId]?.origin !== 'reference' || artifacts[outputId]?.template !== undefined)
    || outputOps.some(entry => !entry.outputId || artifacts[entry.outputId]?.registeredAt !== entry.at)) fail('INVALID_WORKFLOW_WORK', '产物登记与当前流程修订事实不一致。');
  const links = unique(list(item.links, parseWorkflowLink, WORKFLOW_WORK_LIMITS.links), entry => entry.id);
  unique(links, entry => canonical({ consumerStageId: entry.consumerStageId, producer: entry.producer }));
  const result: WorkflowWorkRecord = {
    schemaVersion: 4, id: workId, title: text(item.title, 200), createdAt: at(item.createdAt), level: level(item.level), revision, workflowRevision, scope: scope(item.scope), goal: text(item.goal), selectionReason: text(item.selectionReason),
    impact: impacts(item.impact, true), basis: unique(parsedBasis, entry => refKey(entry.reference)), actionSources: parsedSources,
    expectedOutputs: unique(list(item.expectedOutputs, flowId, WORKFLOW_WORK_LIMITS.outputs, 1), value => value), completionCriteria: texts(item.completionCriteria, WORKFLOW_WORK_LIMITS.sources, 1), workflow, artifacts, links, operations,
  };
  if (/[\r\n\x00-\x1f]/u.test(result.title)) fail('INVALID_WORKFLOW_WORK', '工作标题须为单行文本。');
  if (result.createdAt !== operations[0]!.at) fail('INVALID_WORKFLOW_WORK', '创建时间与创建事实不一致。');
  for (const entry of [...result.basis, ...result.actionSources]) within(entry.reference, result.scope);
  for (const output of Object.values(artifacts)) within(output.source, result.scope);
  for (const link of links) within(link.binding.source, result.scope);
  for (const entry of result.actionSources) if (!entry.scope.repositories.every(repo => result.scope.repositories.includes(repo)) || !entry.scope.targets.every(target => result.scope.targets.includes(target))) fail('INVALID_WORK_SCOPE', '动作来源范围超出工作。');
  size(result);
  return result;
}
async function readBounded(root: string, relative: string, maximum: number): Promise<string | null> {
  const {target, stat: before} = (await inspectSafePaths(root, [relative]))[0]!;
  if (before === null) return null;
  if (!before.isFile() || before.nlink !== 1 || before.size > maximum) fail('INVALID_WORK_REFERENCE', '引用须是大小有界的普通独立文件。');
  const handle = await open(target, 'r');
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.nlink !== 1 || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) fail('INVALID_WORK_REFERENCE', '引用在读取前发生变化。');
    const buffer = Buffer.alloc(Math.min(maximum + 1, before.size + 1)); let offset = 0;
    while (offset < buffer.length) { const chunk = await handle.read(buffer, offset, buffer.length - offset, offset); if (!chunk.bytesRead) break; offset += chunk.bytesRead; }
    if (offset > maximum) fail('INVALID_WORK_REFERENCE', '引用读取时超过大小限制。');
    if (offset > before.size) fail('CONTENT_CHANGED', '引用在读取期间增长；请重新读取。');
    const bytes = buffer.subarray(0, offset); const result = bytes.toString('utf8');
    if (!Buffer.from(result, 'utf8').equals(bytes) || result.includes('\0')) fail('INVALID_WORK_REFERENCE', '通用产物或来源须为有效 UTF-8 文本，二进制交由现有任务产物机制。');
    const final = await handle.stat();
    const located = (await inspectSafePaths(root, [relative]))[0]!.stat;
    if (located === null) fail('CONTENT_CHANGED', '引用在读取期间消失。');
    for (const checked of [final, located]) if (!checked.isFile() || checked.nlink !== 1 || checked.dev !== before.dev || checked.ino !== before.ino || checked.size !== before.size || checked.mtimeMs !== before.mtimeMs || checked.ctimeMs !== before.ctimeMs) fail('CONTENT_CHANGED', '引用在读取期间发生变化。');
    return result;
  } finally { await handle.close(); }
}
async function readSharedBounded(root: string, relative: string, maximum: number): Promise<string | null> {
  return readBounded(root, relative, maximum);
}
/** Bound current record reads before allocation and parsing, including shared-path authority. */
export async function readWorkRecordText(root: string, workId: string): Promise<string | null> {
  return readSharedBounded(root, paths(workId).record, WORKFLOW_WORK_LIMITS.recordBytes);
}
/** Internal control reads preserve the same bounded, no-link checks as work records. */
export async function readWorkflowControlText(root: string, relative: string, maximum: number): Promise<string | null> {
  validateRelativePath(relative);
  const work = /^\.tiller\/work\/([^/]+)\/(.+)$/u.exec(relative);
  let allowed = relative.startsWith('.tiller/workflow-policy/');
  if (work) {
    validateWorkId(work[1]!);
    const suffix = work[2]!;
    allowed = suffix === 'tasks.json' || suffix === 'stages/state.json' || /^workflow\/definitions\/[a-f0-9]{64}\.json$/u.test(suffix);
    const operation = /^(?:workflow\/links\/([^/]+)\.json|transitions\/([^/]+)\/(?:from-record|receipt)\.json)$/u.exec(suffix);
    if (operation) { validateWorkId(operation[1] ?? operation[2]!); allowed = true; }
  }
  if (!allowed || !Number.isSafeInteger(maximum) || maximum > 2 * 1024 * 1024 || maximum < 1) fail('INVALID_WORK_REFERENCE', '流程控制资料读取范围无效。');
  return readSharedBounded(root, relative, maximum);
}
export async function readWorkflowReference(root: string, reference: FileRef, owner?: WorkScope): Promise<string | null> {
  validateWorkflowReference(reference); if (owner) within(reference, owner);
  const metadata = await readProjectMetadata(root);
  if (reference.repository !== '.' && !metadata.repositories.includes(reference.repository)) fail('INVALID_WORK_REFERENCE', '引用仓库未登记。');
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  if (reference.repository === '.' && boundaries.some(boundary => reference.path.toLowerCase() === boundary || reference.path.toLowerCase().startsWith(`${boundary}/`))) fail('INVALID_WORK_REFERENCE', '业务仓库文件必须通过稳定仓库标识引用。');
  const repositoryRoot = await resolveRepositoryRoot(root, reference.repository);
  return readBounded(repositoryRoot, reference.path, WORKFLOW_WORK_LIMITS.referenceBytes);
}
export async function loadWorkflowSnapshot(root: string, record: WorkflowWorkRecord): Promise<WorkflowSnapshot> {
  record = parseWorkflowWorkRecord(record, record.id);
  const source = await readBounded(root, record.workflow.path, WORKFLOW_WORK_LIMITS.recordBytes);
  if (source === null) fail('WORKFLOW_SNAPSHOT_MISSING', '工作固定流程快照缺失，不能使用当前目录版本代替。');
  let value: unknown; try { value = JSON.parse(source); } catch { fail('INVALID_WORKFLOW_WORK', '工作流程快照不是有效 JSON。'); }
  const snapshot = parseWorkflowSnapshot(value);
  if (snapshot.id !== record.workflow.id || snapshot.version !== record.workflow.version || snapshot.digest !== record.workflow.digest) fail('WORKFLOW_SNAPSHOT_CHANGED', '工作固定流程身份、版本或摘要已变化。');
  for (const outputId of record.expectedOutputs) if (!snapshot.definition.outputs.some(output => output.id === outputId)) fail('INVALID_WORKFLOW_WORK', '预期产物不属于固定流程。');
  for (const output of Object.values(record.artifacts)) if (snapshot.definition.outputs.find(item => item.id === output.outputId)?.role !== output.role) fail('INVALID_WORKFLOW_WORK', '通用产物不属于固定流程或角色不一致。');
  for (const link of record.links) if (!snapshot.definition.stages.some(stage => stage.id === link.consumerStageId)) fail('INVALID_WORKFLOW_WORK', '依赖消费阶段不属于当前固定流程。');
  return snapshot;
}
async function readRecord(root: string, workId: string): Promise<{ record: WorkflowWorkRecord; original: string }> {
  const original = await readWorkRecordText(root, workId);
  if (original === null) fail('WORK_NOT_FOUND', '工作尚未登记。');
  let value: unknown; try { value = JSON.parse(original); } catch { fail('INVALID_WORKFLOW_WORK', '工作记录不是有效 JSON。'); }
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 4) fail('UNSUPPORTED_RECORD_VERSION', '工作记录不支持此版本；仅支持当前版本 4。原文件保留，不迁移或继承批准。');
  return { record: parseWorkflowWorkRecord(value, workId), original };
}
async function checkScope(root: string, owner: WorkScope): Promise<void> {
  const metadata = await readProjectMetadata(root);
  if (owner.repositories.some(repository => repository !== '.' && !metadata.repositories.includes(repository))) fail('INVALID_WORK_SCOPE', '工作范围包含未登记仓库。');
}
/** Registration checks only the sources it persists, grouped by their actual repository. */
export async function assertSharedRegistrationReferences(root: string, workId: string, references: readonly FileRef[], proofs?: SharedWriteProof[]): Promise<void> {
  const repositories = new Map<string, Set<string>>();
  for (const reference of references) {
    const paths = repositories.get(reference.repository) ?? new Set<string>();
    paths.add(reference.path); repositories.set(reference.repository, paths);
  }
  const roots = new Map<string, Set<string>>();
  for (const [repository, paths] of repositories) {
    const repositoryRoot = await resolveRepositoryRoot(root, repository, workId);
    const selected = roots.get(repositoryRoot) ?? new Set<string>();
    for (const path of paths) selected.add(path);
    roots.set(repositoryRoot, selected);
  }
  for (const [repositoryRoot, paths] of roots) {
    if (proofs) proofs.push({root: repositoryRoot, paths: [...paths]});
    else await assertSharedWritePaths(repositoryRoot, [...paths]);
  }
}
function replay(record: WorkflowWorkRecord, operationId: string, inputDigest: string, kind: WorkflowWorkOperation['kind']): WorkflowWorkOperation | undefined {
  const previous = record.operations.find(entry => entry.operationId === operationId);
  if (previous && (previous.inputDigest !== inputDigest || previous.kind !== kind)) fail('OPERATION_CONFLICT', 'operationId 已用于不同内容或操作。');
  return previous;
}
function notes(record: WorkflowWorkRecord, snapshot: WorkflowSnapshot): string {
  const unknown = WORKFLOW_FACTS.filter(fact => record.impact[fact] === 'unknown');
  return `# ${record.title}\n\n## 目标与选择\n\n${record.goal}\n\n流程：${snapshot.id}@${snapshot.version}。选择理由：${record.selectionReason}\n\n## 范围与预期产物\n\n仓库：${record.scope.repositories.join('、')}。目标：${record.scope.targets.join('、')}。\n\n预期产物：${record.expectedOutputs.join('、')}。\n\n## 影响与来源\n\n未明确影响：${unknown.join('、') || '无'}。动作来源仅是待核对的来源声明，不认证用户身份或产生权限。\n\n## 完成条件\n\n${record.completionCriteria.map(value => `- ${value}`).join('\n')}\n\n## 进展\n\n已保存固定流程和工作意图；尚未开始或验证阶段，未交付、未验收。产物经明确登记加入，不自动生成需求或设计。\n`;
}
/** Read and bind current intent sources; callers own locking and final freshness checks. */
export async function prepareWorkflowWorkIntent(root: string, workId: string, value: WorkflowWorkInput): Promise<{
  input: WorkflowWorkInput; snapshot: WorkflowSnapshot; workflow: WorkflowWorkRecord['workflow'];
  basis: WorkflowWorkRecord['basis']; actionSources: WorkflowWorkRecord['actionSources'];
  observed: { reference: FileRef; contents: string }[];
}> {
  validateWorkId(workId);
  const input = parseWorkflowWorkInput(value);
  await checkScope(root, input.scope);
  let activation: WorkflowActivationBinding | undefined;
  let snapshot: WorkflowSnapshot | undefined;
  if (input.workflow.startsWith('project.')) {
    const active = await (await import('./workflow-policy.js')).loadActiveProjectWorkflow(root, input.workflow, input.workflowVersion);
    snapshot = active.snapshot; activation = active.activation;
  } else snapshot = (await loadBuiltinWorkflows()).find(item => item.id === input.workflow && (input.workflowVersion === undefined || item.version === input.workflowVersion));
  if (!snapshot) fail('WORKFLOW_REQUIRED', '未找到明确选择的内置流程。');
  if (input.expectedOutputs.some(output => !snapshot.definition.outputs.some(item => item.id === output))) fail('INVALID_WORKFLOW_WORK', '预期产物必须引用固定定义中的 outputId。');
  const observed: { reference: FileRef; contents: string }[] = []; let totalBytes = 0;
  async function capture(reference: FileRef): Promise<string> {
    const contents = await readWorkflowReference(root, reference, input.scope);
    if (contents === null || !contents.trim()) fail('SOURCE_MISSING', '工作依据或动作来源不存在或为空。');
    totalBytes += Buffer.byteLength(contents);
    if (totalBytes > WORKFLOW_WORK_LIMITS.aggregateBytes) fail('WORKFLOW_WORK_TOO_LARGE', '工作来源合计超过 16 MiB。');
    observed.push({ reference, contents }); return contents;
  }
  const boundBasis: WorkflowWorkRecord['basis'] = [];
  for (const entry of input.basis) boundBasis.push({ ...entry, sha256: hash(await capture(entry.reference)) });
  const boundSources: WorkflowWorkRecord['actionSources'] = [];
  for (const entry of input.actionSources) {
    const contents = await capture(entry.reference);
    if (!contents.includes(entry.quote)) fail('SOURCE_QUOTE_MISSING', '动作来源文件不包含所声明原话。');
    boundSources.push({ ...entry, sha256: hash(contents) });
  }
  return { input, snapshot,
    workflow: { id: snapshot.id, version: snapshot.version, digest: snapshot.digest, path: `${paths(workId).directory}/workflow/definitions/${snapshot.digest}.json`, ...(activation ? { activation } : {}) },
    basis: boundBasis, actionSources: boundSources, observed };
}
export async function createWorkflowWork(rootInput: string, workId: string, title: string, value: unknown) {
  validateWorkId(workId); text(title, 200);
  if (/[\r\n\x00-\x1f]/u.test(title)) fail('INVALID_TITLE', '工作标题须为单行文本。');
  const input = parseWorkflowWorkInput(value); const inputDigest = hash(canonical({ workId, title: title.trim(), input }));
  const root = await resolveWorkRoot(rootInput, workId); await readProjectMetadata(root);
  return withProjectLock(root, async () => {
    await readProjectMetadata(root); await checkScope(root, input.scope);
    const locations = paths(workId);
    const existing = await readWorkRecordText(root, workId);
    if (existing !== null) {
      const { record } = await readRecord(root, workId);
      const previous = replay(record, input.operationId, inputDigest, 'create');
      if (!previous) fail('WORK_EXISTS', '工作已存在；使用原工作接续或选择新的标识。');
      await loadWorkflowSnapshot(root, record);
      return { root, id: workId, schemaVersion: 4, revision: previous.revision, changed: false, historical: true, currentValidity: 'not-evaluated', automaticTransition: false };
    }
    try { await lstat(await assertSafePath(root, locations.directory)); fail('WORK_EXISTS', '工作目录已有资料，不能覆盖或自动登记。'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const prepared = await prepareWorkflowWorkIntent(root, workId, input);
    const { snapshot, observed } = prepared;
    const createdAt = new Date().toISOString();
    const record: WorkflowWorkRecord = {
      schemaVersion: 4, id: workId, title: title.trim(), createdAt, level: input.level ?? 'change', revision: 1, workflowRevision: 1, scope: input.scope,
      goal: input.goal, selectionReason: input.reason, impact: impacts(input.impact), basis: prepared.basis, actionSources: prepared.actionSources,
      expectedOutputs: input.expectedOutputs, completionCriteria: input.completionCriteria,
      workflow: prepared.workflow, artifacts: {}, links: [],
      operations: [{ operationId: input.operationId, kind: 'create', inputDigest, revision: 1, at: createdAt }],
    };
    parseWorkflowWorkRecord(record, workId);
    const serializedRecord = serializeWorkflowWorkRecord(record);
    const changes: FileChange[] = [
      { path: record.workflow.path, before: null, after: JSON.stringify(snapshot, null, 2) + '\n' },
      { path: locations.notes, before: null, after: notes(record, snapshot) },
      { path: locations.record, before: null, after: serializedRecord },
    ];
    await assertSafePaths(root, changes.map(change => change.path));
    await assertSharedRegistrationReferences(root, workId, observed.map(observation => observation.reference));
    for (const observation of observed) if (await readWorkflowReference(root, observation.reference, input.scope) !== observation.contents) fail('CONTENT_CHANGED', '工作来源在登记前发生变化。');
    if (record.workflow.activation) await (await import('./workflow-policy.js')).assertWorkflowActivationCurrent(root, record);
    await applyChanges(root, changes);
    return { root, id: workId, schemaVersion: 4, revision: 1, workflowRevision: record.workflowRevision, links: record.links, workflow: record.workflow, goal: record.goal, selectionReason: record.selectionReason,
      scope: record.scope, impact: record.impact, basis: record.basis, actionSources: record.actionSources, expectedOutputs: record.expectedOutputs,
      completionCriteria: record.completionCriteria, changed: true, automaticTransition: false, authorization: 'not-evaluated', notes: locations.notes };
  });
}
export function parseWorkflowOutputInput(value: unknown): WorkflowOutputInput {
  const item = object(value, ['operationId', 'expectedRevision', 'outputId'], ['source', 'content', 'template', 'confirmationRefs']);
  if (['source', 'content', 'template'].filter(key => Object.hasOwn(item, key)).length !== 1) fail('INVALID_WORKFLOW_WORK', '产物须明确选择 source、content 或 template 中的一种。');
  const result: WorkflowOutputInput = { operationId: id(item.operationId), expectedRevision: count(item.expectedRevision), outputId: flowId(item.outputId) };
  if (item.source !== undefined) result.source = validateWorkflowReference(item.source);
  if (item.content !== undefined) result.content = text(item.content, WORKFLOW_WORK_LIMITS.referenceBytes);
  if (item.template !== undefined) {
    if (!templateTypes.includes(item.template as TemplateType)) fail('INVALID_TEMPLATE', '文档模板不受支持。');
    result.template = item.template as TemplateType;
  }
  if (item.confirmationRefs !== undefined) result.confirmationRefs = unique(list(item.confirmationRefs, raw => {
    const entry = object(raw, ['workId', 'requestId', 'decisionId']);
    return { workId: id(entry.workId), requestId: id(entry.requestId), decisionId: id(entry.decisionId) };
  }), entry => canonical(entry));
  size(result); return result;
}
async function generationAllowed(root: string, record: WorkflowWorkRecord, snapshot: WorkflowSnapshot, outputId: string, confirmationRefs: ConfirmationReference[]): Promise<void> {
  const output = snapshot.definition.outputs.find(item => item.id === outputId)!;
  const stages = new Map(snapshot.definition.stages.map(stage => [stage.id, stage]));
  const applicable = resolveWorkflowApplicability(snapshot.definition, record.impact);
  const producer = stages.get(output.producer)!;
  if (applicable.stages[producer.id] !== 'applicable') fail('WORKFLOW_CONDITION_UNRESOLVED', '产物生产阶段不适用或条件尚未明确。');
  if (!producer.actions.some(action => ['write-report', 'edit-documents'].includes(action)) || output.role === 'code') fail('WORKFLOW_POLICY_REQUIRED', '此产物不能通过文档生成代替真实实现或操作。');
  const action = producer.actions.includes('write-report') ? 'write-report' : 'edit-documents';
  const policy = await (await import('./workflow-policy.js')).inspectWorkflowPolicy(root, record.id, {
    stageId: producer.id, phase: 'start', actions: [action], confirmationRefs,
  });
  if (!policy.allowed) fail('WORKFLOW_POLICY_REQUIRED', policy.issues.join('；'));
}
export async function addWorkflowOutput(rootInput: string, workId: string, value: unknown) {
  const input = parseWorkflowOutputInput(value); const inputDigest = hash(canonical(input));
  const root = await resolveWorkRoot(rootInput, workId); await readProjectMetadata(root);
  return withProjectLock(root, async () => {
    await readProjectMetadata(root); const data = await readRecord(root, workId); const record = data.record;
    await checkScope(root, record.scope); const snapshot = await loadWorkflowSnapshot(root, record);
    await (await import('./workflow-policy.js')).assertWorkflowActivationCurrent(root, record);
    const locations = paths(workId); const notes = await readTextIfExists(root, locations.notes);
    if (notes === null) fail('WORK_NOT_READY', '工作入口 work.md 不存在。');
    const previous = replay(record, input.operationId, inputDigest, 'output-add');
    if (previous) return { root, id: workId, outputId: previous.outputId, revision: previous.revision, changed: false, historical: true, currentValidity: 'not-evaluated', automaticTransition: false };
    if (record.revision !== input.expectedRevision) fail('REVISION_CONFLICT', '工作修订已变化，请读取当前记录。');
    const declared = snapshot.definition.outputs.find(item => item.id === input.outputId);
    if (!declared) fail('INVALID_WORKFLOW_WORK', '产物标识未在固定流程中声明。');
    if (Object.hasOwn(record.artifacts, input.outputId)) fail('ARTIFACT_CONFLICT', '产物已登记；不能用新操作覆盖原登记。');
    if (!input.source) await generationAllowed(root, record, snapshot, input.outputId, input.confirmationRefs ?? []);
    if (input.template && (!input.template.endsWith(`-${declared.role}`) || !input.template.startsWith(`${record.level}-`))) fail('INVALID_TEMPLATE', '模板角色或层级与所选产物不一致。');
    const source = input.source ?? { repository: '.', path: `${locations.directory}/${declared.role}.md` };
    within(source, record.scope);
    if (Object.values(record.artifacts).some(output => refKey(output.source) === refKey(source))) fail('ARTIFACT_CONFLICT', '多个产物不能共用同一文件。');
    const before = await readWorkflowReference(root, source, record.scope);
    let content: string;
    if (input.source) {
      if (before === null || !before.trim()) fail('ARTIFACT_MISSING', '引用产物不存在或为空。');
      content = before;
    } else {
      if (before !== null) fail('ARTIFACT_CONFLICT', '产物目标已经存在，请明确引用，不覆盖正文。');
      content = input.content ?? (await readFile(new URL(`../resources/templates/${input.template!}.md`, import.meta.url), 'utf8')).replaceAll('{{title}}', record.title);
    }
    const registeredAt = new Date().toISOString();
    const output: WorkflowWorkArtifact = { outputId: input.outputId, role: declared.role, source, origin: input.source ? 'reference' : 'generated', status: 'draft', registeredAt, registeredHash: hash(content), ...(input.template ? { template: input.template } : {}) };
    record.artifacts[input.outputId] = output; record.revision++;
    record.operations.push({ operationId: input.operationId, kind: 'output-add', inputDigest, revision: record.revision, at: registeredAt, outputId: input.outputId });
    parseWorkflowWorkRecord(record, workId);
    const changes: FileChange[] = [{ path: locations.record, before: data.original, after: serializeWorkflowWorkRecord(record) }];
    if (!input.source) changes.unshift({ path: source.path, before: null, after: content });
    await assertSafePaths(root, changes.map(change => change.path));
    await assertSharedRegistrationReferences(root, workId,
      [source, ...record.basis.map(entry => entry.reference), ...record.actionSources.map(entry => entry.reference)]);
    if (await readWorkflowReference(root, source, record.scope) !== before || await readTextIfExists(root, locations.notes) !== notes) fail('CONTENT_CHANGED', '产物或工作入口在登记前已变化。');
    await loadWorkflowSnapshot(root, record);
    await (await import('./workflow-policy.js')).assertWorkflowActivationCurrent(root, record);
    if (!input.source) await generationAllowed(root, (await readRecord(root, workId)).record, snapshot, input.outputId, input.confirmationRefs ?? []);
    await applyChanges(root, changes);
    return { root, id: workId, outputId: input.outputId, source, revision: record.revision, changed: true, status: 'draft', automaticTransition: false, authorization: 'not-evaluated' };
  });
}
export async function resumeWorkflowWork(rootInput: string, workId: string) {
  const root = await resolveWorkRoot(rootInput, workId); await readProjectMetadata(root);
  const { record } = await readRecord(root, workId); await checkScope(root, record.scope);
  const snapshot = await loadWorkflowSnapshot(root, record); const notes = await readTextIfExists(root, paths(workId).notes);
  const issues = contentIssues(notes, '工作说明'); const sourceIssues: string[] = [];
  try { await (await import('./workflow-policy.js')).assertWorkflowActivationCurrent(root, record); }
  catch (error) { sourceIssues.push((error as Error).message); }
  for (const entry of [...record.basis, ...record.actionSources]) {
    try { const actual = await readWorkflowReference(root, entry.reference, record.scope); if (actual === null || hash(actual) !== entry.sha256) sourceIssues.push(`来源已变化或缺失：${entry.reference.repository}/${entry.reference.path}`); }
    catch (error) { sourceIssues.push((error as Error).message); }
  }
  const artifacts: Record<string, WorkflowWorkArtifact & { currentHash: string | null; changedSinceRegistration: boolean; issues: string[] }> = {};
  for (const [key, output] of Object.entries(record.artifacts)) {
    const problems: string[] = []; let currentHash: string | null = null;
    try {
      const content = await readWorkflowReference(root, output.source, record.scope);
      if (content === null || !content.trim()) problems.push('已登记产物不存在或为空。');
      else { currentHash = hash(content); if (output.source.path.endsWith('.md')) problems.push(...contentIssues(content, output.role)); }
    } catch (error) { problems.push((error as Error).message); }
    artifacts[key] = { ...output, currentHash, changedSinceRegistration: currentHash !== output.registeredHash, issues: problems };
    issues.push(...problems.map(problem => `${key}：${problem}`));
  }
  const applicability = resolveWorkflowApplicability(snapshot.definition, record.impact);
  const missingOutputs = snapshot.definition.outputs.filter(output => applicability.outputs[output.id] !== 'not-applicable' && !Object.hasOwn(record.artifacts, output.id)).map(output => output.id);
  const unknownImpact = WORKFLOW_FACTS.filter(fact => record.impact[fact] === 'unknown');
  return {
    root, id: workId, title: record.title, schemaVersion: 4, revision: record.revision, workflowRevision: record.workflowRevision, links: record.links, level: record.level, scope: record.scope,
    goal: record.goal, selectionReason: record.selectionReason, workflow: record.workflow, impact: record.impact, unknownImpact, applicability, artifacts, notes,
    basis: record.basis, actionSources: record.actionSources, expectedOutputs: record.expectedOutputs, completionCriteria: record.completionCriteria, missingOutputs, sourceIssues,
    issues: [...issues, ...sourceIssues], ready: false, registrationReady: issues.length === 0 && sourceIssues.length === 0, status: 'registered',
    stageExecution: 'not-evaluated', deliveryStatus: 'not-evaluated', acceptanceStatus: 'not-evaluated', authorization: 'not-evaluated', automaticTransition: false,
    limitation: '只读接续并展示登记与当前文件；来源声明不认证用户身份，登记不代表阶段完成、操作许可、交付或验收。',
  };
}
