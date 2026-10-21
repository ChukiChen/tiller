import { createHash } from 'node:crypto';
import { lstat, open, opendir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertSafePath } from './files.js';

export const BUILTIN_WORKFLOW_IDS = ['requirements', 'analysis', 'research', 'feature', 'bugfix', 'improvement', 'review', 'validation', 'documentation', 'migration', 'operations'] as const;
/** writesData means business/environment persistent data, excluding explicitly authorized isolated
 * local experiment scratch files. experimentSideEffects includes writes/configuration/payments
 * beyond that isolation. Production, credentials, external services and irreversible effects
 * are independent facts and never waived by the local-experiment action category. */
export const WORKFLOW_FACTS = ['modifiesCode', 'changesBehavior', 'production', 'writesData', 'credentials', 'irreversible', 'externalService', 'semanticChange', 'experimentSideEffects', 'release'] as const;
export const WORKFLOW_ACTIONS = ['read', 'write-report', 'edit-documents', 'local-experiment', 'edit-code', 'test', 'configure-environment', 'write-data', 'external-service', 'commit', 'push', 'review', 'merge', 'release', 'operate'] as const;
export const WORKFLOW_CONFIRMATIONS = ['requirements', 'design', 'planning', 'acceptance', 'scope', 'operation', 'merge', 'release'] as const;
export const WORKFLOW_LIMITS = Object.freeze({ bytes: 262144, stages: 128, outputs: 256, list: 128, text: 2048, conditionDepth: 8, conditionNodes: 64, projectDefinitions: 128, catalogBytes: 4194304 });

export type WorkflowFact = typeof WORKFLOW_FACTS[number];
export type WorkflowAction = typeof WORKFLOW_ACTIONS[number];
export type WorkflowConfirmation = typeof WORKFLOW_CONFIRMATIONS[number];
export type WorkflowFacts = Partial<Record<WorkflowFact, boolean | 'unknown'>>;
export type WorkflowCondition = { fact: WorkflowFact; equals: boolean } | { all: WorkflowCondition[] } | { any: WorkflowCondition[] } | { not: WorkflowCondition };
export type WorkflowApplicability = 'applicable' | 'not-applicable' | 'unresolved';
export interface WorkflowStage {
  id: string; title: string; dependsOn: string[]; consumes: string[]; produces: string[];
  checks: string[]; confirmations: WorkflowConfirmation[]; confirmationAt?: 'start' | 'verify'; actions: WorkflowAction[]; when?: WorkflowCondition;
}
export interface WorkflowOutput { id: string; role: string; title: string; producer: string }
export interface WorkflowDefinition {
  schemaVersion: 1; id: string; version: string; title: string; appliesTo: string[]; notApplicableTo: string[];
  stages: WorkflowStage[]; outputs: WorkflowOutput[];
  completion: { requiredStages: string[]; requiredOutputs: string[]; checks: string[]; result: 'requirements-confirmed' | 'report-delivered' | 'change-verified' | 'operation-observed' };
}
export interface WorkflowSnapshot { id: string; version: string; digest: string; definition: WorkflowDefinition }
export interface ProjectWorkflowCandidate { path: string; status: 'validated-candidate'; snapshot: WorkflowSnapshot }

function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('流程字段必须是普通对象。');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('流程不支持符号字段。');
  const record = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!required.includes(key) && !optional.includes(key)) throw new Error(`未知流程字段：${key}`);
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!)) throw new Error('流程不能包含访问器。');
  }
  for (const key of required) if (!Object.hasOwn(record, key)) throw new Error(`缺少流程字段：${key}`);
  return record;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > WORKFLOW_LIMITS.text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) throw new Error('流程文本无效或超出长度限制。');
  return value;
}
function identifier(value: unknown): string {
  const result = text(value);
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(result) || ['constructor', 'prototype'].includes(result)) throw new Error(`流程标识无效：${result}`);
  return result;
}
function list<T>(value: unknown, parse: (entry: unknown) => T, maximum: number = WORKFLOW_LIMITS.list, minimum = 0): T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error('流程列表为空或超出数量限制。');
  return Array.from(value, parse);
}
function unique(values: string[]): string[] {
  if (new Set(values).size !== values.length) throw new Error('流程列表存在重复值。');
  return values;
}
function strings(value: unknown, minimum = 0): string[] { return unique(list(value, text, WORKFLOW_LIMITS.list, minimum)); }
function ids(value: unknown, maximum: number = WORKFLOW_LIMITS.list, minimum = 0): string[] { return unique(list(value, identifier, maximum, minimum)); }
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`未知流程枚举值：${String(value)}`);
  return value as T;
}
function condition(value: unknown, depth = 0, budget = { nodes: 0 }): WorkflowCondition {
  if (depth > WORKFLOW_LIMITS.conditionDepth || ++budget.nodes > WORKFLOW_LIMITS.conditionNodes) throw new Error('流程条件超出深度或节点限制。');
  const record = object(value, [], ['fact', 'equals', 'all', 'any', 'not']);
  if (Object.hasOwn(record, 'fact')) {
    object(record, ['fact', 'equals']);
    if (typeof record.equals !== 'boolean') throw new Error('流程条件比较值必须为布尔值。');
    return { fact: choice(record.fact, WORKFLOW_FACTS), equals: record.equals };
  }
  for (const key of ['all', 'any', 'not'] as const) {
    if (!Object.hasOwn(record, key)) continue;
    object(record, [key]);
    if (key === 'not') return { not: condition(record.not, depth + 1, budget) };
    const terms = list(record[key], entry => condition(entry, depth + 1, budget), WORKFLOW_LIMITS.conditionNodes, 1);
    return key === 'all' ? { all: terms } : { any: terms };
  }
  throw new Error('流程条件缺少运算符。');
}
function stage(value: unknown): WorkflowStage {
  const record = object(value, ['id', 'title', 'dependsOn', 'consumes', 'produces', 'checks', 'confirmations', 'actions'], ['when', 'confirmationAt']);
  const parsed: WorkflowStage = {
    id: identifier(record.id), title: text(record.title), dependsOn: ids(record.dependsOn),
    consumes: ids(record.consumes, WORKFLOW_LIMITS.outputs), produces: ids(record.produces, WORKFLOW_LIMITS.outputs), checks: strings(record.checks, 1),
    confirmations: unique(list(record.confirmations, entry => choice(entry, WORKFLOW_CONFIRMATIONS))) as WorkflowConfirmation[],
    actions: unique(list(record.actions, entry => choice(entry, WORKFLOW_ACTIONS), WORKFLOW_LIMITS.list, 1)) as WorkflowAction[],
  };
  if (Object.hasOwn(record, 'when')) parsed.when = condition(record.when);
  if (parsed.confirmations.length) parsed.confirmationAt = choice(record.confirmationAt, ['start', 'verify']);
  else if (Object.hasOwn(record, 'confirmationAt')) throw new Error('没有确认要求的阶段不能指定确认时点。');
  if (parsed.confirmations.some(gate => ['operation', 'release', 'merge'].includes(gate)) && parsed.confirmationAt !== 'start') throw new Error('操作、合入及发布确认必须先于动作。');
  // These independent operation protections cannot be removed by a project definition.
  if (parsed.actions.includes('release') && (!parsed.confirmations.includes('release') || !parsed.confirmations.includes('acceptance'))) throw new Error('发布动作必须声明同对象的验收和发布确认。');
  if (parsed.actions.includes('merge') && !parsed.confirmations.includes('merge')) throw new Error('合入动作必须声明合入确认。');
  return parsed;
}
function output(value: unknown): WorkflowOutput {
  const record = object(value, ['id', 'role', 'title', 'producer']);
  return { id: identifier(record.id), role: identifier(record.role), title: text(record.title), producer: identifier(record.producer) };
}

// Ten closed boolean facts give a bounded truth table. Bitsets check conditional reachability
// and producer implication without exponential graph traversal or arbitrary expression execution.
const ASSIGNMENTS = 1 << WORKFLOW_FACTS.length;
const ALL_ASSIGNMENTS = (1n << BigInt(ASSIGNMENTS)) - 1n;
const FACT_MASKS = WORKFLOW_FACTS.map((_, index) => {
  let mask = 0n;
  for (let assignment = 0; assignment < ASSIGNMENTS; assignment++) if (assignment & (1 << index)) mask |= 1n << BigInt(assignment);
  return mask;
});
function conditionMask(value: WorkflowCondition | undefined): bigint {
  if (!value) return ALL_ASSIGNMENTS;
  if ('fact' in value) {
    const mask = FACT_MASKS[WORKFLOW_FACTS.indexOf(value.fact)]!;
    return value.equals ? mask : ALL_ASSIGNMENTS ^ mask;
  }
  if ('not' in value) return ALL_ASSIGNMENTS ^ conditionMask(value.not);
  if ('all' in value) return value.all.reduce((mask, term) => mask & conditionMask(term), ALL_ASSIGNMENTS);
  return value.any.reduce((mask, term) => mask | conditionMask(term), 0n);
}
function validateGraph(definition: WorkflowDefinition): void {
  unique(definition.stages.map(item => item.id));
  unique(definition.outputs.map(item => item.id));
  const stages = new Map(definition.stages.map(item => [item.id, item]));
  const outputs = new Map(definition.outputs.map(item => [item.id, item]));
  const masks = new Map(definition.stages.map(item => [item.id, conditionMask(item.when)]));
  const ancestors = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  function visit(id: string): Set<string> {
    if (visiting.has(id)) throw new Error(`流程阶段依赖成环：${id}`);
    const existing = ancestors.get(id);
    if (existing) return existing;
    const current = stages.get(id);
    if (!current) throw new Error(`阶段引用不存在：${id}`);
    visiting.add(id);
    const result = new Set<string>();
    for (const dependency of current.dependsOn) {
      result.add(dependency);
      for (const ancestor of visit(dependency)) result.add(ancestor);
    }
    visiting.delete(id);
    ancestors.set(id, result);
    return result;
  }
  for (const current of definition.stages) {
    visit(current.id);
    if (masks.get(current.id) === 0n) throw new Error(`阶段条件永不成立：${current.id}`);
    for (const id of current.produces) if (outputs.get(id)?.producer !== current.id) throw new Error(`产物生产者不一致：${id}`);
    for (const id of current.consumes) {
      const produced = outputs.get(id);
      if (!produced || !ancestors.get(current.id)!.has(produced.producer)) throw new Error(`产物没有前置生产者：${id}`);
      if ((masks.get(current.id)! & (ALL_ASSIGNMENTS ^ (masks.get(produced.producer) ?? 0n))) !== 0n) throw new Error(`条件分支不能保证消费产物存在：${id}`);
    }
  }
  for (const produced of definition.outputs) {
    if (!stages.get(produced.producer)?.produces.includes(produced.id)) throw new Error(`产物未被阶段生产：${produced.id}`);
    if (!definition.completion.requiredOutputs.includes(produced.id) && !definition.stages.some(current => current.consumes.includes(produced.id))) throw new Error(`产物未连接到消费或结束条件：${produced.id}`);
  }
  let endingMask = 0n;
  for (const id of definition.completion.requiredStages) {
    if (!stages.has(id)) throw new Error(`结束阶段不存在：${id}`);
    endingMask |= masks.get(id)!;
  }
  if (endingMask !== ALL_ASSIGNMENTS) throw new Error('存在无法到达结束阶段的条件分支。');
  for (const current of definition.stages) {
    let reachable = 0n;
    for (const end of definition.completion.requiredStages) if (end === current.id || ancestors.get(end)!.has(current.id)) reachable |= masks.get(end)!;
    if ((masks.get(current.id)! & (ALL_ASSIGNMENTS ^ reachable)) !== 0n) throw new Error(`阶段不能到达结束条件：${current.id}`);
  }
  let outputMask = 0n;
  for (const id of definition.completion.requiredOutputs) {
    const produced = outputs.get(id);
    if (!produced) throw new Error(`结束产物不存在：${id}`);
    outputMask |= masks.get(produced.producer)!;
  }
  if (outputMask !== ALL_ASSIGNMENTS) throw new Error('存在没有必要交付产物的条件分支。');
}

export function parseWorkflowDefinition(value: unknown): WorkflowDefinition {
  const record = object(value, ['schemaVersion', 'id', 'version', 'title', 'appliesTo', 'notApplicableTo', 'stages', 'outputs', 'completion']);
  if (record.schemaVersion !== 1) throw new Error('不支持的流程定义版本。');
  const id = text(record.id);
  if (!BUILTIN_WORKFLOW_IDS.includes(id as typeof BUILTIN_WORKFLOW_IDS[number])) {
    if (!id.startsWith('project.')) throw new Error('扩展流程标识必须使用 project.*。');
    identifier(id.slice('project.'.length));
  }
  const version = text(record.version);
  if (!/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/u.test(version)) throw new Error('流程版本必须是固定的 major.minor.patch。');
  const completion = object(record.completion, ['requiredStages', 'requiredOutputs', 'checks', 'result']);
  const definition: WorkflowDefinition = {
    schemaVersion: 1, id, version, title: text(record.title), appliesTo: strings(record.appliesTo, 1), notApplicableTo: strings(record.notApplicableTo, 1),
    stages: list(record.stages, stage, WORKFLOW_LIMITS.stages, 1), outputs: list(record.outputs, output, WORKFLOW_LIMITS.outputs, 1),
    completion: {
      requiredStages: ids(completion.requiredStages, WORKFLOW_LIMITS.stages, 1), requiredOutputs: ids(completion.requiredOutputs, WORKFLOW_LIMITS.outputs, 1),
      checks: strings(completion.checks, 1), result: choice(completion.result, ['requirements-confirmed', 'report-delivered', 'change-verified', 'operation-observed']),
    },
  };
  if (Buffer.byteLength(JSON.stringify(definition), 'utf8') > WORKFLOW_LIMITS.bytes) throw new Error('流程定义超过字节限制。');
  validateGraph(definition);
  return definition;
}
export function parseWorkflowJson(source: string): WorkflowDefinition {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > WORKFLOW_LIMITS.bytes) throw new Error('流程定义超过字节限制。');
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('流程定义必须是有效 JSON。'); }
  return parseWorkflowDefinition(parsed);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(definition: WorkflowDefinition): string { return createHash('sha256').update(canonical(definition), 'utf8').digest('hex'); }
export function workflowDefinitionDigest(value: unknown): string { return digest(parseWorkflowDefinition(value)); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function createWorkflowSnapshot(value: unknown): WorkflowSnapshot {
  const definition = parseWorkflowDefinition(value);
  return freeze({ id: definition.id, version: definition.version, digest: digest(definition), definition });
}
export function parseWorkflowSnapshot(value: unknown): WorkflowSnapshot {
  const record = object(value, ['id', 'version', 'digest', 'definition']);
  const snapshot = createWorkflowSnapshot(record.definition);
  if (record.id !== snapshot.id || record.version !== snapshot.version || record.digest !== snapshot.digest) throw new Error('流程快照标识、版本或摘要不匹配。');
  return snapshot;
}
/** Compare pinned definitions before accepting a catalog update; this does not approve extensions. */
export function assertWorkflowVersionConsistency(values: readonly WorkflowSnapshot[]): void {
  const versions = new Map<string, string>();
  for (const value of values) {
    const snapshot = parseWorkflowSnapshot(value);
    const key = `${snapshot.id}@${snapshot.version}`;
    if (versions.has(key) && versions.get(key) !== snapshot.digest) throw new Error(`同一流程版本内容发生变化：${key}`);
    versions.set(key, snapshot.digest);
  }
}
function facts(value: unknown): WorkflowFacts {
  const record = object(value, [], [...WORKFLOW_FACTS]);
  for (const entry of Object.values(record)) if (entry !== true && entry !== false && entry !== 'unknown') throw new Error('影响事实必须是布尔值或 unknown。');
  return record as WorkflowFacts;
}
function evaluate(value: WorkflowCondition | undefined, input: WorkflowFacts): WorkflowApplicability {
  if (!value) return 'applicable';
  if ('fact' in value) {
    const actual = input[value.fact];
    return actual === undefined || actual === 'unknown' ? 'unresolved' : actual === value.equals ? 'applicable' : 'not-applicable';
  }
  if ('not' in value) {
    const result = evaluate(value.not, input);
    return result === 'unresolved' ? result : result === 'applicable' ? 'not-applicable' : 'applicable';
  }
  const results = ('all' in value ? value.all : value.any).map(term => evaluate(term, input));
  if ('all' in value && results.includes('not-applicable')) return 'not-applicable';
  if ('any' in value && results.includes('applicable')) return 'applicable';
  if (results.includes('unresolved')) return 'unresolved';
  return 'all' in value ? 'applicable' : 'not-applicable';
}
export function evaluateWorkflowCondition(value: WorkflowCondition | undefined, input: WorkflowFacts): WorkflowApplicability {
  return evaluate(value === undefined ? undefined : condition(value), facts(input));
}
/** Applicability is not readiness or authorization. A false conditional dependency can be skipped;
 * an unresolved dependency cannot. Consumers always require their applicable producer's output.
 * Stage execution and dependency evidence are checked by the lifecycle layer, not this catalog. */
export function resolveWorkflowApplicability(value: unknown, input: WorkflowFacts): { stages: Record<string, WorkflowApplicability>; outputs: Record<string, WorkflowApplicability>; unresolvedStages: string[] } {
  const definition = parseWorkflowDefinition(value);
  const checkedFacts = facts(input);
  const stages = Object.fromEntries(definition.stages.map(current => [current.id, evaluate(current.when, checkedFacts)]));
  return {
    stages, outputs: Object.fromEntries(definition.outputs.map(produced => [produced.id, stages[produced.producer]!])),
    unresolvedStages: definition.stages.filter(current => stages[current.id] === 'unresolved').map(current => current.id),
  };
}
async function readDefinition(root: string, relative: string): Promise<{ definition: WorkflowDefinition; bytes: number }> {
  const target = await assertSafePath(root, relative);
  const before = await lstat(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > WORKFLOW_LIMITS.bytes) throw new Error(`流程文件无效或超出大小限制：${relative}`);
  const file = await open(target, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > WORKFLOW_LIMITS.bytes || stat.dev !== before.dev || stat.ino !== before.ino) throw new Error('读取时流程文件已变化或不安全。');
    const buffer = Buffer.alloc(WORKFLOW_LIMITS.bytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const result = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset > WORKFLOW_LIMITS.bytes) throw new Error('流程定义超过字节限制。');
    const bytes = buffer.subarray(0, offset);
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) throw new Error('流程文件不是有效 UTF-8。');
    await assertSafePath(root, relative);
    return { definition: parseWorkflowJson(source), bytes: offset };
  } finally { await file.close(); }
}
export async function loadBuiltinWorkflows(): Promise<WorkflowSnapshot[]> {
  const root = fileURLToPath(new URL('../resources/workflows/', import.meta.url));
  const result: WorkflowSnapshot[] = [];
  for (const id of BUILTIN_WORKFLOW_IDS) {
    const { definition } = await readDefinition(root, `${id}.json`);
    if (definition.id !== id) throw new Error(`内置流程标识与文件不一致：${id}`);
    result.push(createWorkflowSnapshot(definition));
  }
  return result;
}
/** Read-only candidates. Registration, policy comparison and real approval belong to the activation layer. */
export async function loadProjectWorkflows(root: string): Promise<ProjectWorkflowCandidate[]> {
  const relative = '.tiller/workflows';
  const directory = await assertSafePath(root, relative);
  let handle;
  try { handle = await opendir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const entries = [];
  for await (const entry of handle) {
    entries.push(entry);
    if (entries.length > WORKFLOW_LIMITS.projectDefinitions) throw new Error('项目流程数量超过限制。');
  }
  const result: ProjectWorkflowCandidate[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!entry.isFile() || !/^project\.[a-z][a-z0-9-]{0,63}@[0-9]+\.[0-9]+\.[0-9]+\.json$/u.test(entry.name)) throw new Error(`项目流程必须是 project.<name>@<version>.json 普通文件：${entry.name}`);
    const source = `${relative}/${entry.name}`;
    const loaded = await readDefinition(root, source);
    totalBytes += loaded.bytes;
    if (totalBytes > WORKFLOW_LIMITS.catalogBytes) throw new Error('项目流程总字节数超过限制。');
    const snapshot = createWorkflowSnapshot(loaded.definition);
    const key = `${snapshot.id}@${snapshot.version}`;
    if (!snapshot.id.startsWith('project.') || entry.name !== `${key}.json` || seen.has(key)) throw new Error('项目流程标识/版本重复、覆盖内置或与文件名不一致。');
    seen.add(key);
    result.push({ path: source, status: 'validated-candidate', snapshot });
  }
  return result;
}
