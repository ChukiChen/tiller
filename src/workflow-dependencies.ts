import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { readProjectMetadata } from './core.js';
import { locateDelivery, resolveWorkRoot, withDeliveryLocation, withoutDeliveryBinding } from './delivery-location.js';
import { applyChanges, assertSafePath, hasPendingTransaction, readTextIfExists, withProjectLock, assertSafePaths } from './files.js';
import { validateWorkId } from './work.js';
import type { FileRef } from './work.js';
import type { FileChange } from './types.js';
import { parsePlanningState } from './planning.js';
import type { WorkflowSnapshot } from './workflow-catalog.js';
import {
  parseWorkflowLink, parseWorkflowWorkRecord, readWorkRecordText, readWorkflowControlText, readWorkflowReference, serializeWorkflowWorkRecord,
  assertSharedRegistrationReferences,
} from './workflow-work.js';
import type { WorkflowLink, WorkflowWorkRecord } from './workflow-work.js';
import { assertWorkflowActivationCurrent, assertWorkflowActivationSharing, assertWorkflowPolicyContextCurrent, loadWorkflowPolicyContext } from './workflow-policy.js';
import { loadWorkflowStageInputs, parseWorkflowControlSnapshot, readWorkflowControlSnapshot } from './workflow-stages.js';
import type { WorkflowControlSnapshot, WorkflowStageStatus, WorkflowStageInputs } from './workflow-stages.js';

export const WORKFLOW_DEPENDENCY_LIMITS = Object.freeze({ nodes: 1024, depth: 64, links: 256 });
export interface WorkflowLinkSelector {
  id: string; consumerStageId: string; producer: { workId: string; stageId: string; outputId: string };
}
export interface WorkflowLinksInput {
  operationId: string; expected: WorkflowControlSnapshot; links: WorkflowLinkSelector[];
}
export interface WorkflowDependencyFact {
  linkId: string; producer: WorkflowLink['producer']; binding: WorkflowLink['binding'];
  current: {
    workflowRevision: number; attemptId: string; eventSequence: number; source: FileRef;
    sha256: string; completionBasisDigest: string;
  } | null;
  valid: boolean;
}
interface DependencyResult { facts: WorkflowDependencyFact[]; issues: string[]; basisDigest: string }
type PolicyContext = Awaited<ReturnType<typeof loadWorkflowPolicyContext>>;
interface DependencyTraversal { path: Set<string>; visited: Set<string> }
const inspection = new AsyncLocalStorage<DependencyTraversal>();
interface ProducerInput {
  root: string; context: PolicyContext; stages: WorkflowStageStatus[]; controls: WorkflowControlSnapshot;
  artifacts: { outputId: string; source: FileRef; content: string | null }[];
  assertSharing(visited: Set<string>): Promise<void>;
  assertCurrent(): Promise<void>;
}
export interface WorkflowDependencyInputs {
  root: string; workId: string; recordDigest: string; snapshotDigest: string;
  selectors: WorkflowLinkSelector[]; producers: ProducerInput[]; issues: { workId: string; message: string }[];
  allProducers?: ProducerInput[];
}
interface DependencyGraph { contexts: ReadonlyMap<string, PolicyContext>; order: { workId: string; stageId: string }[] }
function fail(message: string, code = 'INVALID_WORKFLOW_DEPENDENCY'): never { throw Object.assign(new Error(message), { code }); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function freezeInputs<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freezeInputs(entry);
    Object.freeze(value);
  }
  return value;
}
function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function bytesHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key)!))
    || keys.some(key => !Object.hasOwn(value, key))) fail('关联输入包含缺失、未知或非普通字段。');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64) fail('关联标识无效。');
  validateWorkId(value); return value;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail('关联摘要无效。');
  return value;
}
export function parseWorkflowLinksInput(value: unknown): WorkflowLinksInput {
  const item = object(value, ['operationId', 'expected', 'links']);
  if (!Array.isArray(item.links) || item.links.length > WORKFLOW_DEPENDENCY_LIMITS.links) fail('关联数量超出限制。');
  const links = item.links.map(raw => {
    const link = object(raw, ['id', 'consumerStageId', 'producer']); const producer = object(link.producer, ['workId', 'stageId', 'outputId']);
    return { id: id(link.id), consumerStageId: id(link.consumerStageId),
      producer: { workId: id(producer.workId), stageId: id(producer.stageId), outputId: id(producer.outputId) } };
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(links.map(link => link.id)).size !== links.length
    || new Set(links.map(link => canonical({ consumerStageId: link.consumerStageId, producer: link.producer }))).size !== links.length)
    fail('关联标识或消费关系重复。');
  return { operationId: id(item.operationId), expected: parseWorkflowControlSnapshot(item.expected), links };
}
/** This scope only guards traversal paths and node budgets; it stores no results. */
export async function withWorkflowDependencyTraversal<T>(fn: () => Promise<T>): Promise<T> {
  if (inspection.getStore()) return fn();
  return inspection.run({ path: new Set(), visited: new Set() }, fn);
}
function stageKey(root: string, record: WorkflowWorkRecord, stageId: string): string {
  return canonical([root, record.id, record.workflowRevision, stageId]);
}
function enter(round: DependencyTraversal, key: string): void {
  if (round.path.has(key)) fail('关联工作阶段存在循环依赖。', 'WORKFLOW_DEPENDENCY_CYCLE');
  if (round.path.size >= WORKFLOW_DEPENDENCY_LIMITS.depth || (!round.visited.has(key) && round.visited.size >= WORKFLOW_DEPENDENCY_LIMITS.nodes))
    fail('关联遍历超出深度或节点上限。', 'WORKFLOW_DEPENDENCY_LIMIT');
  round.visited.add(key); round.path.add(key);
}
async function withProducerRoot<T>(root: string, workId: string, fn: (producerRoot: string) => Promise<T>): Promise<T> {
  const anchor = (await locateDelivery(root))?.anchorRoot ?? root;
  return withoutDeliveryBinding(async () => {
    const producerRoot = await resolveWorkRoot(anchor, workId);
    return withDeliveryLocation(producerRoot, workId, () => fn(producerRoot));
  });
}
async function dependencyControls(root: string, workId: string): Promise<WorkflowControlSnapshot> {
  const tasks = await readWorkflowControlText(root, `.tiller/work/${workId}/tasks.json`, 2 * 1024 * 1024);
  return readWorkflowControlSnapshot(root, workId, tasks !== null);
}
/** Collect producer contexts and requested stages explicitly, once per producer work. */
export async function loadWorkflowDependencyInputs(root: string, record: WorkflowWorkRecord, snapshot: WorkflowSnapshot,
  stageIds: readonly string[], options: { selectors?: WorkflowLinkSelector[]; context?: PolicyContext; graph?: DependencyGraph;
    ownerInput?: Pick<WorkflowStageInputs, 'current' | 'evaluated'> } = {}): Promise<WorkflowDependencyInputs> {
  return withWorkflowDependencyTraversal(async () => {
    for (const stageId of stageIds) if (!snapshot.definition.stages.some(stage => stage.id === stageId)) fail('消费阶段不在当前固定流程中。');
    const allSelectors = options.selectors ?? record.links;
    const selectors = allSelectors.filter(link => stageIds.includes(link.consumerStageId))
      .map(link => ({ id: link.id, consumerStageId: link.consumerStageId, producer: { workId: link.producer.workId, stageId: link.producer.stageId, outputId: link.producer.outputId } }));
    const inputs: WorkflowDependencyInputs = { root, workId: record.id, recordDigest: hash(record), snapshotDigest: snapshot.digest,
      selectors, producers: [], issues: [] };
    if (!selectors.length) return freezeInputs(inputs);
    const context = options.context ?? await loadWorkflowPolicyContext(root, record.id);
    if (hash(context.record) !== hash(record)) fail('消费工作在依赖装载期间变化。', 'CONTENT_CHANGED');
    let graph: DependencyGraph;
    try { graph = options.graph ?? await checkGraph(root, context, allSelectors, stageIds); }
    catch (error) { inputs.issues.push(...[...new Set(selectors.map(link => link.producer.workId))].map(workId => ({ workId, message: (error as Error).message }))); return freezeInputs(inputs); }
    try {
      // Declare the entire producer DAG before loading or evaluating any stage.
      const required = new Set<string>(); const requested = new Map<string, Set<string>>();
      const outputIds = new Map<string, Set<string>>();
      const linksFor = (workId: string) => workId === record.id ? allSelectors : graph.contexts.get(workId)!.record.links;
      const key = (workId: string, stageId: string) => `${workId}::${stageId}`;
      function includeLink(link: WorkflowLinkSelector) {
        const ids = requested.get(link.producer.workId) ?? new Set<string>(); ids.add(link.producer.stageId); requested.set(link.producer.workId, ids);
        const outputs = outputIds.get(link.producer.workId) ?? new Set<string>(); outputs.add(link.producer.outputId); outputIds.set(link.producer.workId, outputs);
        include(link.producer.workId, link.producer.stageId);
      }
      function include(workId: string, stageId: string) {
        const identity = key(workId, stageId); if (required.has(identity)) return;
        required.add(identity);
        const definition = graph.contexts.get(workId)!.snapshot.definition.stages.find(stage => stage.id === stageId)!;
        for (const dependency of definition.dependsOn) include(workId, dependency);
        for (const link of linksFor(workId).filter(link => link.consumerStageId === stageId)) includeLink(link);
      }
      for (const selector of selectors) includeLink(selector);
      const order = graph.order.filter(node => required.has(key(node.workId, node.stageId)));
      type Loaded = Pick<WorkflowStageInputs, 'current' | 'evaluated'> & Partial<Pick<WorkflowStageInputs, 'metadata' | 'root' | 'workId'>>;
      const loaded = new Map<string, Loaded>(); const producers = new Map<string, ProducerInput>();
      for (const workId of new Set(order.map(node => node.workId))) {
        await withProducerRoot(root, workId, async producerRoot => {
          const expected = graph.contexts.get(workId)!;
          if (expected.root !== producerRoot) fail('关联生产工作的活动目录已变化。', 'CONTENT_CHANGED');
          const material = workId === record.id && options.ownerInput ? options.ownerInput : await loadWorkflowStageInputs(producerRoot, workId, expected);
          if (material.current.root !== producerRoot || hash(material.current.context.record) !== hash(expected.record)) fail('生产工作输入身份不一致。', 'CONTENT_CHANGED');
          loaded.set(workId, material);
          await material.evaluated.loadOutputs([...(outputIds.get(workId) ?? [])]);
          const artifacts = [...(outputIds.get(workId) ?? [])].flatMap(id => {
            const artifact = material.evaluated.artifact(id); return artifact ? [artifact] : [];
          });
          let controls = material.current.controlSnapshot;
          if (controls.tasks === null) {
            const taskText = await readWorkflowControlText(producerRoot, `.tiller/work/${workId}/tasks.json`, 2 * 1024 * 1024);
            if (taskText !== null) controls = { ...controls, tasks: { revision: parsePlanningState(taskText, workId).revision, sha256: bytesHash(taskText) } };
          }
          producers.set(workId, { root: producerRoot, context: material.current.context, stages: [], artifacts,
            controls,
            assertCurrent: async (): Promise<void> => {
              await material.evaluated.verifyInputs(false);
              await assertWorkflowPolicyContextCurrent(material.current.context);
              if (controls.tasks === null && await readWorkflowControlText(producerRoot, `.tiller/work/${workId}/tasks.json`, 2 * 1024 * 1024) !== null)
                fail('关联生产任务控制资料已变化。', 'CONTENT_CHANGED');
              if (canonical(await readWorkflowControlSnapshot(producerRoot, workId, controls.tasks !== null)) !== canonical(controls))
                fail('关联生产控制资料已变化。', 'CONTENT_CHANGED');
              await assertWorkflowActivationCurrent(producerRoot, material.current.context.record);
            },
            assertSharing: async (visited: Set<string>): Promise<void> => {
              await material.evaluated.assertSharing(undefined, visited);
            } });
        });
      }
      const perWork = new Map<string, WorkflowDependencyInputs>();
      for (const [workId, material] of loaded) {
        const stageIds = new Set(order.filter(node => node.workId === workId).map(node => node.stageId));
        const links = linksFor(workId).filter(link => stageIds.has(link.consumerStageId));
        perWork.set(workId, { root: material.current.root, workId, recordDigest: hash(material.current.context.record),
          snapshotDigest: material.current.context.snapshot.digest, selectors: links,
          producers: [...new Set(links.map(link => link.producer.workId))].map(id => producers.get(id)!), issues: [] });
      }
      for (const node of order) {
        const material = loaded.get(node.workId)!;
        const status = await withProducerRoot(root, node.workId, () => material.evaluated.evaluateNode(node.stageId, perWork.get(node.workId)!));
        if (requested.get(node.workId)?.has(node.stageId)) producers.get(node.workId)!.stages.push(status);
      }
      // The operation owner proves this material once, after evaluation and any sharing checks.
      inputs.producers = [...new Set(selectors.map(link => link.producer.workId))].map(id => producers.get(id)!);
      inputs.allProducers = [...producers.values()];
    } catch (error) {
      inputs.issues.push(...[...new Set(selectors.map(link => link.producer.workId))].map(workId => ({ workId, message: (error as Error).message })));
    }
    return freezeInputs(inputs);
  });
}
function producerFact(owner: WorkflowWorkRecord, selector: WorkflowLinkSelector, inputs: WorkflowDependencyInputs) {
  if (selector.producer.workId === owner.id) fail('关联必须指向另一个工作；同工作依赖由固定阶段图声明。');
  const problem = inputs.issues.find(issue => issue.workId === selector.producer.workId);
  if (problem) fail(problem.message);
  const producerInput = inputs.producers.find(producer => producer.context.record.id === selector.producer.workId);
  if (!producerInput) fail('缺少显式生产工作输入。');
  const { context } = producerInput;
  if (context.sourceIssues.length) fail(`生产工作来源当前无效：${context.sourceIssues.join('；')}`);
  const declared = context.snapshot.definition.outputs.find(output => output.id === selector.producer.outputId);
  if (!declared || declared.producer !== selector.producer.stageId) fail('关联产物与生产阶段不匹配。');
  const artifact = producerInput.artifacts.find(item => item.outputId === selector.producer.outputId);
  if (!artifact) fail('关联产物尚未登记。');
  const status = producerInput.stages.find(stage => stage.stageId === selector.producer.stageId);
  if (!status) fail('关联生产阶段不存在。');
  if (status.workflowRevision !== context.record.workflowRevision) fail('关联生产阶段与工作修订不匹配。', 'CONTENT_CHANGED');
  if (!status.technicalReady || status.effectiveStatus !== 'verified' || !status.attemptId || status.eventSequence === null || !status.completionBasisDigest)
    fail(`关联生产阶段未有效验证：${selector.producer.workId}/${selector.producer.stageId}。`);
  if (artifact.content === null) fail('关联产物当前缺失。');
  const sha256 = bytesHash(artifact.content); const referenceKey = `${artifact.source.repository}::${artifact.source.path}`;
  if (status.artifactSnapshots[selector.producer.outputId]?.[referenceKey] !== sha256) fail('关联产物不属于当前生产阶段验证快照。');
  const producer = { ...selector.producer, workflowRevision: context.record.workflowRevision };
  const binding = { attemptId: status.attemptId, eventSequence: status.eventSequence, source: artifact.source, sha256 };
  return { producer, binding, current: { workflowRevision: producer.workflowRevision, ...binding, completionBasisDigest: status.completionBasisDigest } };
}
async function assertSourcesCurrent(root: string, record: WorkflowWorkRecord): Promise<void> {
  const entries = [...record.basis, ...record.actionSources];
  const references = [...new Map(entries.map(entry => [canonical(entry.reference), entry.reference])).values()];
  const contents = new Map<string, string | null>();
  for (const reference of references) contents.set(canonical(reference), await readWorkflowReference(root, reference, record.scope));
  for (const entry of entries) {
    const text = contents.get(canonical(entry.reference));
    if (text === undefined || text === null || bytesHash(text) !== entry.sha256 || 'quote' in entry && !text.includes(entry.quote)) fail('工作依据或动作授权来源已变化。', 'CONTENT_CHANGED');
  }
}
export async function assertWorkflowDependencyInputsCurrent(inputs: WorkflowDependencyInputs,
  owner?: {root: string; workId: string}): Promise<void> {
  for (const producer of inputs.allProducers ?? inputs.producers) await withProducerRoot(inputs.root, producer.context.record.id, async producerRoot => {
    if (producerRoot !== producer.root) fail('关联生产工作的活动目录已变化。', 'CONTENT_CHANGED');
    // A DAG may return to an earlier stage of its owner. That exact owner proves its own
    // material and control bytes, including the expected state after its own commit.
    if (owner?.root === producerRoot && owner.workId === producer.context.record.id) return;
    await producer.assertCurrent();
  });
}
/** Compare loaded producer facts without touching files or recursively evaluating stages. */
export function evaluateWorkflowDependencyInputs(root: string, record: WorkflowWorkRecord, snapshot: WorkflowSnapshot, stageId: string,
  inputs: WorkflowDependencyInputs): DependencyResult {
  if (!snapshot.definition.stages.some(stage => stage.id === stageId)) fail('消费阶段不在当前固定流程中。');
  if (inputs.root !== root || inputs.workId !== record.id || inputs.recordDigest !== hash(record) || inputs.snapshotDigest !== snapshot.digest) fail('依赖输入不属于当前消费工作。');
  const facts: WorkflowDependencyFact[] = []; const issues: string[] = [];
  for (const link of record.links.filter(link => link.consumerStageId === stageId).sort((a, b) => a.id.localeCompare(b.id))) {
    let current: WorkflowDependencyFact['current'] = null; let valid = false;
    try {
      const observed = producerFact(record, link, inputs); current = observed.current;
      valid = canonical(observed.producer) === canonical(link.producer) && canonical(observed.binding) === canonical(link.binding);
      if (!valid) issues.push(`关联 ${link.id} 的生产修订、执行轮次或产物已变化，须显式重新关联。`);
    } catch (error) { issues.push(`关联 ${link.id}：${(error as Error).message}`); }
    facts.push({ linkId: link.id, producer: link.producer, binding: link.binding, current, valid });
  }
  return { facts, issues, basisDigest: hash(facts) };
}
export async function inspectWorkflowDependenciesInContext(root: string, record: WorkflowWorkRecord, snapshot: WorkflowSnapshot, stageId: string,
  supplied?: WorkflowDependencyInputs): Promise<DependencyResult> {
  return withWorkflowDependencyTraversal(async () => {
    if (!snapshot.definition.stages.some(stage => stage.id === stageId)) fail('消费阶段不在当前固定流程中。');
    const traversal = inspection.getStore()!; const key = stageKey(root, record, stageId); enter(traversal, key);
    try {
      const inputs = supplied ?? await loadWorkflowDependencyInputs(root, record, snapshot, [stageId]);
      const result = evaluateWorkflowDependencyInputs(root, record, snapshot, stageId, inputs);
      if (!supplied) await assertWorkflowDependencyInputsCurrent(inputs);
      return result;
    } finally { traversal.path.delete(key); }
  });
}
export async function inspectWorkflowDependencies(rootInput: string, workId: string, stageId: string): Promise<DependencyResult> {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, () => withWorkflowDependencyTraversal(async () => {
    if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
    const context = await loadWorkflowPolicyContext(root, workId); await assertWorkflowActivationCurrent(root, context.record);
    const controls = await dependencyControls(root, workId);
    const inputs = await loadWorkflowDependencyInputs(root, context.record, context.snapshot, [id(stageId)], { context });
    const result = evaluateWorkflowDependencyInputs(root, context.record, context.snapshot, id(stageId), inputs);
    await assertWorkflowDependencyInputsCurrent(inputs);
    result.issues.unshift(...context.sourceIssues);
    if (!context.sourceIssues.length) await assertSourcesCurrent(root, context.record);
    if (canonical(await dependencyControls(root, workId)) !== canonical(controls)) fail('消费工作控制资料已变化。', 'CONTENT_CHANGED');
    return result;
  }));
}
/** Check replacement edges as a graph before evaluation, including each work's local stage edges. */
async function checkGraph(root: string, owner: PolicyContext, selectors: WorkflowLinkSelector[], stageIds: readonly string[] = selectors.map(selector => selector.consumerStageId)): Promise<DependencyGraph> {
  const contexts = new Map<string, PolicyContext>([[owner.record.id, owner]]);
  const order: DependencyGraph['order'] = [];
  const traversal = { path: new Set<string>(), visited: new Set<string>() }; const completed = new Set<string>();
  async function visit(workId: string, stageId: string): Promise<void> {
    let context = contexts.get(workId);
    if (!context) {
      if (contexts.size >= WORKFLOW_DEPENDENCY_LIMITS.nodes) fail('关联工作数量超出限制。', 'WORKFLOW_DEPENDENCY_LIMIT');
      context = await withProducerRoot(root, workId, async producerRoot => {
        const result = await loadWorkflowPolicyContext(producerRoot, workId);
        await assertWorkflowActivationCurrent(producerRoot, result.record); return result;
      });
      contexts.set(workId, context);
    }
    const key = stageKey(context.root, context.record, stageId);
    if (traversal.path.has(key)) fail('候选关联将形成循环阶段依赖。', 'WORKFLOW_DEPENDENCY_CYCLE');
    if (completed.has(key)) return;
    enter(traversal, key);
    try {
      const stage = context.snapshot.definition.stages.find(stage => stage.id === stageId); if (!stage) fail('关联引用不存在的阶段。');
      for (const dependency of stage.dependsOn) await visit(workId, dependency);
      const links = workId === owner.record.id ? selectors : context.record.links;
      for (const link of links.filter(link => link.consumerStageId === stageId)) {
        if (link.producer.workId === workId) fail('关联不能指向本工作。');
        await visit(link.producer.workId, link.producer.stageId);
      }
      completed.add(key);
      order.push({ workId, stageId });
    } finally { traversal.path.delete(key); }
  }
  for (const stageId of new Set(stageIds)) await visit(owner.record.id, stageId);
  return { contexts, order };
}
function receiptPath(workId: string, operationId: string): string { return `.tiller/work/${workId}/workflow/links/${operationId}.json`; }
interface LinkBasis { workId: string; input: WorkflowLinksInput; controlSnapshot: WorkflowControlSnapshot; links: WorkflowLink[]; facts: WorkflowDependencyFact[] }
interface LinkReceipt { schemaVersion: 1; planId: string; revision: number; at: string; basis: LinkBasis }
async function readReceipt(root: string, workId: string, input: WorkflowLinksInput, revision: number): Promise<LinkReceipt> {
  const contents = await readWorkflowControlText(root, receiptPath(workId, input.operationId), 2 * 1024 * 1024);
  if (contents === null) fail('关联历史回执缺失。');
  const receipt = object(JSON.parse(contents), ['schemaVersion', 'planId', 'revision', 'at', 'basis']);
  const basis = object(receipt.basis, ['workId', 'input', 'controlSnapshot', 'links', 'facts']);
  if (receipt.schemaVersion !== 1 || receipt.revision !== revision || basis.workId !== workId || canonical(parseWorkflowLinksInput(basis.input)) !== canonical(input)
    || digest(receipt.planId) !== hash(basis) || typeof receipt.at !== 'string' || !Number.isFinite(Date.parse(receipt.at))) fail('关联历史回执与操作不匹配。');
  parseWorkflowControlSnapshot(basis.controlSnapshot);
  if (!Array.isArray(basis.links) || basis.links.length > WORKFLOW_DEPENDENCY_LIMITS.links) fail('关联历史回执列表无效。');
  basis.links.forEach(parseWorkflowLink);
  return receipt as unknown as LinkReceipt;
}
/** Return only an operation-bound, validated receipt path; directory membership is not archive authority. */
export async function workflowLinkArchivePaths(root: string, workId: string, operationId: string): Promise<string[]> {
  id(workId); id(operationId);
  const original = await readWorkRecordText(root, workId); if (original === null) fail('工作记录不存在。');
  const record = parseWorkflowWorkRecord(JSON.parse(original), workId);
  const operation = record.operations.find(entry => entry.operationId === operationId && entry.kind === 'links-change');
  if (!operation) fail('关联归档缺少对应工作操作。');
  const path = receiptPath(workId, operationId);
  const contents = await readWorkflowControlText(root, path, 2 * 1024 * 1024); if (contents === null) fail('关联历史回执缺失。');
  const input = parseWorkflowLinksInput(JSON.parse(contents)?.basis?.input);
  if (input.operationId !== operationId || hash(input) !== operation.inputDigest) fail('关联归档输入与工作操作不一致。');
  await readReceipt(root, workId, input, operation.revision);
  return [path];
}
async function prepare(root: string, workId: string, input: WorkflowLinksInput) {
  return withWorkflowDependencyTraversal(async () => {
    if (await hasPendingTransaction(root)) fail('存在未完成事务，请先恢复。');
    const original = await readWorkRecordText(root, workId); if (original === null) fail('工作记录不存在。');
    const record = parseWorkflowWorkRecord(JSON.parse(original), workId); const inputDigest = hash(input);
    const previous = record.operations.find(operation => operation.operationId === input.operationId);
    if (previous) {
      if (previous.kind !== 'links-change' || previous.inputDigest !== inputDigest) fail('操作标识已经用于不同输入。', 'OPERATION_CONFLICT');
      const receipt = await readReceipt(root, workId, input, previous.revision);
      return { original, record, inputDigest, planId: receipt.planId, basis: receipt.basis, issues: [] as string[], historical: true, revision: previous.revision, dependencyInputs: undefined as WorkflowDependencyInputs | undefined };
    }
    const context = await loadWorkflowPolicyContext(root, workId); await assertWorkflowActivationCurrent(root, context.record);
    if (canonical(context.record) !== canonical(record)) fail('工作在关联检查期间变化。', 'CONTENT_CHANGED');
    const controlSnapshot = await readWorkflowControlSnapshot(root, workId, input.expected.tasks !== null);
    if (canonical(input.expected) !== canonical(controlSnapshot)) fail('关联控制快照已变化。', 'REVISION_CONFLICT');
    const issues = [...context.sourceIssues]; const links: WorkflowLink[] = []; const facts: WorkflowDependencyFact[] = [];
    let graph: DependencyGraph | undefined;
    try { graph = await checkGraph(root, context, input.links); } catch (error) { issues.push((error as Error).message); }
    const dependencyInputs = !issues.length && graph ? await loadWorkflowDependencyInputs(root, record, context.snapshot,
      [...new Set(input.links.map(link => link.consumerStageId))], { selectors: input.links, context, graph }) : undefined;
    if (!issues.length) for (const selector of input.links) {
      try {
        const observed = producerFact(record, selector, dependencyInputs!);
        const link = parseWorkflowLink({ id: selector.id, consumerStageId: selector.consumerStageId, producer: observed.producer, binding: observed.binding });
        links.push(link); facts.push({ linkId: link.id, producer: link.producer, binding: link.binding, current: observed.current, valid: true });
      } catch (error) { issues.push(`关联 ${selector.id}：${(error as Error).message}`); }
    }
    if (dependencyInputs) await assertWorkflowDependencyInputsCurrent(dependencyInputs);
    if (canonical(await readWorkflowControlSnapshot(root, workId, input.expected.tasks !== null)) !== canonical(controlSnapshot)) fail('消费工作控制资料已变化。', 'CONTENT_CHANGED');
    if (!context.sourceIssues.length) await assertSourcesCurrent(root, context.record);
    const basis: LinkBasis = { workId, input, controlSnapshot, links, facts };
    return { original, record, inputDigest, planId: hash(basis), basis, issues, historical: false, revision: record.revision + 1, dependencyInputs };
  });
}
export async function planWorkflowLinks(rootInput: string, workId: string, value: unknown) {
  const input = parseWorkflowLinksInput(value); const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const plan = await prepare(root, workId, input);
    return { root, workId, planId: plan.planId, revision: plan.revision, links: plan.basis.links,
      operationAllowed: !plan.issues.length, blockingReasons: plan.issues, historical: plan.historical, automaticTransition: false };
  });
}
export async function applyWorkflowLinks(rootInput: string, workId: string, value: unknown, planId: string) {
  const input = parseWorkflowLinksInput(value); digest(planId); const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, () => withDeliveryLocation(root, workId, async () => {
    await readProjectMetadata(root); const plan = await prepare(root, workId, input);
    if (plan.planId !== planId) fail('关联预览后依据已变化。', 'CONTENT_CHANGED');
    if (plan.issues.length) fail(`关联条件未满足：${plan.issues.join('；')}`);
    if (plan.historical) return { changed: false, historical: true, revision: plan.revision, planId, currentValidity: 'not-evaluated', automaticTransition: false };
    const at = new Date().toISOString(); const next = structuredClone(plan.record);
    next.links = plan.basis.links; next.revision++;
    next.operations.push({ operationId: input.operationId, kind: 'links-change', inputDigest: plan.inputDigest, revision: next.revision, at });
    parseWorkflowWorkRecord(next, workId);
    const receipt: LinkReceipt = { schemaVersion: 1, planId, revision: next.revision, at, basis: plan.basis };
    const receiptText = json(receipt); if (Buffer.byteLength(receiptText) > 2 * 1024 * 1024) fail('关联回执过大。');
    const changes: FileChange[] = [
      { path: `.tiller/work/${workId}/record.json`, before: plan.original, after: serializeWorkflowWorkRecord(next) },
      { path: receiptPath(workId, input.operationId), before: null, after: receiptText },
    ];
    await assertSafePaths(root, changes.map(change => change.path));
    const references: FileRef[] = [
      { repository: '.', path: '.tiller/project.json' }, { repository: '.', path: plan.record.workflow.path },
      ...plan.record.basis.map(item => item.reference), ...plan.record.actionSources.map(item => item.reference),
    ];
    if (plan.basis.controlSnapshot.stages.sha256 !== null) references.push({ repository: '.', path: `.tiller/work/${workId}/stages/state.json` });
    if (plan.basis.controlSnapshot.tasks !== null) references.push({ repository: '.', path: `.tiller/work/${workId}/tasks.json` });
    await assertSharedRegistrationReferences(root, workId, references);
    await assertWorkflowActivationSharing(root, plan.record);
    const visited = new Set<string>();
    for (const producer of plan.dependencyInputs?.producers ?? []) await withProducerRoot(root, producer.context.record.id, async producerRoot => {
      if (producerRoot !== producer.root) fail('关联生产工作的活动目录已变化。', 'CONTENT_CHANGED');
      const selected: FileRef[] = producer.artifacts.map(artifact => artifact.source);
      if (producer.controls.tasks !== null) selected.push({ repository: '.', path: `.tiller/work/${producer.context.record.id}/tasks.json` });
      await assertSharedRegistrationReferences(producerRoot, producer.context.record.id, selected);
      await producer.assertSharing(visited);
    });
    if (plan.dependencyInputs) await assertWorkflowDependencyInputsCurrent(plan.dependencyInputs);
    if (canonical(await readWorkflowControlSnapshot(root, workId, input.expected.tasks !== null)) !== canonical(plan.basis.controlSnapshot)) fail('关联写入前控制资料已变化。', 'CONTENT_CHANGED');
    await assertSourcesCurrent(root, plan.record);
    await assertWorkflowActivationCurrent(root, plan.record);
    await applyChanges(root, changes);
    try {
      await withWorkflowDependencyTraversal(async () => {
        const context = await loadWorkflowPolicyContext(root, workId); await assertWorkflowActivationCurrent(root, context.record);
        if (canonical(context.record) !== canonical(next) || context.sourceIssues.length) fail('关联写后工作或来源变化。', 'CONTENT_CHANGED');
        const observed: WorkflowDependencyFact[] = [];
        const stageIds = [...new Set(next.links.map(link => link.consumerStageId))];
        const dependencyInputs = await loadWorkflowDependencyInputs(root, context.record, context.snapshot, stageIds, { context });
        for (const stageId of stageIds) {
          const result = evaluateWorkflowDependencyInputs(root, context.record, context.snapshot, stageId, dependencyInputs);
          if (result.issues.length) fail(`关联写后依据变化：${result.issues.join('；')}`, 'CONTENT_CHANGED');
          observed.push(...result.facts);
        }
        await assertWorkflowDependencyInputsCurrent(dependencyInputs);
        await assertSourcesCurrent(root, context.record);
        observed.sort((a, b) => a.linkId.localeCompare(b.linkId));
        if (canonical(observed) !== canonical(plan.basis.facts)) fail('关联写后生产证据变化。', 'CONTENT_CHANGED');
        const controls = await readWorkflowControlSnapshot(root, workId, input.expected.tasks !== null);
        if (canonical(controls.stages) !== canonical(input.expected.stages) || canonical(controls.tasks) !== canonical(input.expected.tasks))
          fail('关联写后阶段或任务控制变化。', 'CONTENT_CHANGED');
        for (const change of changes) if (await readTextIfExists(root, change.path) !== change.after) fail('关联写后控制文件被外部修改。', 'CONTENT_CHANGED');
      });
    } catch (error) {
      const recordChange = changes[0]!;
      if (await readTextIfExists(root, recordChange.path) !== recordChange.after) throw error;
      // Restore the owned record before deleting its receipt. An externally changed record retains its audit trail.
      for (const change of changes) if (await readTextIfExists(root, change.path) === change.after) {
        if (change.before === null) await unlink(await assertSafePath(root, change.path));
        else await applyChanges(root, [{ path: change.path, before: change.after, after: change.before }]);
      }
      throw error;
    }
    return { changed: true, historical: false, revision: next.revision, planId, currentValidity: 'verified-at-write', automaticTransition: false };
  }));
}
