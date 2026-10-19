import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { assertSharedPaths } from './core.js';
import { applyChanges, assertSafePath, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { resolveRepositoryRoot, resolveWorkRoot } from './delivery-location.js';
import { loadWorkRecord, validateWorkId } from './work.js';
import { inspectVerification, readVerificationReference, readVerificationBinary, verificationCategories } from './verification-cases.js';
import type { VerificationCase, VerificationConfig, VerificationReference, VerificationSuite } from './verification-cases.js';
import { assertVerificationInput, parseVerificationSelection } from './verification-selection.js';
import type { VerificationSelection, VerificationCheck, VerificationInput, VerificationEvidenceReference, VerificationArtifactSnapshots } from './verification-selection.js';
export { parseVerificationSelection } from './verification-selection.js';
export type { VerificationSelection } from './verification-selection.js';

const LIMIT = 64 * 1024;
const MAX_RECORD = 2 * 1024 * 1024;
const outcomes = ['passed', 'failed', 'skipped', 'not-run'] as const;
type Outcome = typeof outcomes[number];
type Snapshot = Record<string, string>;
interface EvidenceResult { caseId?: string; checkId?: string; status: Outcome; evidence: VerificationReference; note: string }
interface Binding { identity: string; definition: string; inputs: Snapshot; check: VerificationCheck | null; caseChecks: VerificationCheck[]; caseId: string | null; modules: string[] }
interface Invocation { repository: string; command: string; args: string[]; cwd: string }
interface Execution {
  invocation: Invocation; startedAt: string; finishedAt: string; durationMs: number;
  exitCode: number | null; signal: string | null; timedOut: boolean; outputLimited: boolean; error: string | null; output: string; suitePassed: boolean;
}
interface RunRecord {
  schemaVersion: 2; id: string; workId: string; createdAt: string; sequence: number;
  source: 'executed' | 'captured' | 'reported'; suite: string | null; caseIds: string[];
  bindings: Record<string, Binding>; evidence: Snapshot; captureId: string | null;
  environment: string; results: EvidenceResult[];
  execution: Execution | null; staleAfterExecution: boolean; digest: string;
}
function fail(message: string): never { throw new Error(message); }
function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('验证数据须为对象。');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) fail('验证数据包含未知字段。');
  return result;
}
function string(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) fail('验证字段须为有界非空文本。');
  return value;
}
function reference(value: unknown): VerificationReference {
  const ref = object(value, ['repository', 'path']);
  return { repository: string(ref.repository, 128), path: string(ref.path, 1024) };
}
function invocation(value: unknown): Invocation {
  const data = object(value, ['repository', 'command', 'args', 'cwd']);
  const repository = string(data.repository, 128); const command = string(data.command, 10000); const cwd = string(data.cwd, 1024);
  if (repository !== '.') validateRelativePath(repository);
  if (cwd !== '.') validateRelativePath(cwd);
  if (/[\r\n]/u.test(command) || !Array.isArray(data.args) || data.args.length > 10000
    || data.args.some(arg => typeof arg !== 'string' || arg.includes('\0') || arg.length > MAX_RECORD)) fail('执行命令或参数无效。');
  return { repository, command, cwd, args: [...data.args] as string[] };
}
function timestamp(value: unknown): string {
  const text = string(value, 40); const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) fail('执行时间必须是 ISO UTC 时间。');
  return text;
}
function independentEvidence(ref: VerificationReference): void {
  assertVerificationInput(ref);
  const path = ref.path.toLowerCase();
  if (/^\.tiller\/verification(?:\/|$)/u.test(path)) fail('验证证据必须是独立报告，不能引用用例定义、工作入口或命令维护的记录。');
}
function key(ref: VerificationReference): string { return `${ref.repository}::${ref.path}`; }
function fromKey(value: string): VerificationReference {
  const split = value.indexOf('::');
  if (split < 1 || value.indexOf('::', split + 2) !== -1) fail('验证快照引用格式错误。');
  return { repository: value.slice(0, split), path: value.slice(split + 2) };
}
function directory(workId: string): string { validateWorkId(workId); return `.tiller/work/${workId}/verification-runs`; }
function environment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
}
async function base(rootInput: string, workId: string) {
  const root = await resolveWorkRoot(rootInput, workId);
  const work = await loadWorkRecord(root, workId, true);
  await records(root, workId);
  const inspection = await inspectVerification(root, { definitionsOnly: true });
  if (!inspection.ready || !inspection.config) fail(`验证目录尚未就绪：${inspection.issues.join('；')}`);
  return { root, work, inspection, config: inspection.config, bindingCache: new Map<string, Binding>() };
}
async function currentSnapshot(root: string, original: Snapshot): Promise<Snapshot> {
  const current: Snapshot = {};
  for (const ref of Object.keys(original)) {
    try { current[ref] = hash(await readVerificationReference(root, fromKey(ref))); }
    catch { current[ref] = 'unavailable'; }
  }
  return current;
}
async function cwdFor(root: string, workId: string, suite: VerificationSuite): Promise<string> {
  const repositoryRoot = await resolveRepositoryRoot(root, suite.repository, workId);
  const cwd = suite.cwd === '.' ? resolve(repositoryRoot) : await assertSafePath(repositoryRoot, suite.cwd);
  const stat = await lstat(cwd);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('测试执行目录必须是普通目录。');
  return cwd;
}

function defaultSelection(config: VerificationConfig, cases: VerificationCase[]): VerificationSelection {
  return { caseIds: cases.map(item => item.id), requirements: [...new Set(cases.flatMap(item => item.requirements))],
    modules: [...new Set(cases.flatMap(item => item.modules))], categories: config.categories, checks: [],
    reason: '显式执行套件或全局报告的登记范围。', scenarioReason: '默认报告保留全部目录范围；局部任务须传入经评审的选择。' };
}
type Context = Awaited<ReturnType<typeof base>>;
function identity(context: Context): string {
  return hash(canonical({ workId: context.work.record.id, scope: normalizedScope(context) }));
}
function normalizedScope(context: Context) {
  const scope = context.work.record.scope;
  return { repositories: [...scope.repositories].sort(), targets: [...scope.targets].sort() };
}
async function bindingFor(context: Context, caseId: string | null, check: VerificationCheck | null, modules: string[] = [], caseChecks: VerificationCheck[] = []): Promise<Binding> {
  const cacheKey = canonical({ caseId, check, modules, caseChecks });
  const cached = context.bindingCache.get(cacheKey);
  if (cached) return cached;
  const test = caseId === null ? null : context.inspection.cases.find(item => item.id === caseId);
  if (caseId !== null && !test) fail(`所选用例不存在：${caseId}`);
  const suiteId = check?.kind === 'execution' ? check.suite : test?.automation?.suite;
  const suite = suiteId === undefined ? null : context.config.suites.find(item => item.id === suiteId);
  if (suiteId !== undefined && !suite) fail(`所选套件不存在：${suiteId}`);
  const scope = context.work.record.scope.repositories;
  if (suite && !scope.includes(suite.repository)) fail('测试仓库超出工作范围。');
  const testedInputs = [...(suite?.inputs ?? []), ...(check?.inputs ?? []), ...caseChecks.flatMap(item => item.inputs), ...(test?.automation ? [test.automation.source] : [])];
  if (!testedInputs.length) fail(`用例或人工检查缺少受检输入：${caseId ?? check?.id}`);
  const requirements = [...new Set([...(test?.requirements ?? []), ...(check?.requirements ?? []), ...caseChecks.flatMap(item => item.requirements)])].sort();
  const requirementDefinitions = requirements.map(id => {
    const entry = context.config.requirements.find(item => item.id === id);
    if (!entry) fail(`所选需求未登记：${id}`);
    return entry;
  });
  const moduleDefinitions = [...new Set([...(test?.modules ?? []), ...modules])].map(id => {
    const entry = context.config.modules.find(item => item.id === id);
    if (!entry) fail(`所选模块未登记：${id}`);
    return entry;
  });
  const references: VerificationInput[] = [...testedInputs, ...requirementDefinitions.map(item => item.source), ...moduleDefinitions.map(item => item.design)];
  references.push(...references.flatMap(ref => ref.provenance ? [ref.provenance] : []));
  const inputs: Snapshot = {};
  let total = 0;
  for (const ref of references) {
    assertVerificationInput(ref);
    if (!scope.includes(ref.repository)) fail('受检输入或规格仓库超出工作范围。');
    if (Object.hasOwn(inputs, key(ref))) continue;
    const content = ref.binary ? await readVerificationBinary(context.root, { repository: ref.repository, path: ref.path }) : await readVerificationReference(context.root, { repository: ref.repository, path: ref.path });
    total += Buffer.byteLength(content);
    if (total > 64 * 1024 * 1024 || Object.keys(inputs).length >= 1000) fail('单项验证输入超过容量限制。');
    inputs[key(ref)] = hash(content);
  }
  const binding = { identity: identity(context), definition: hash(canonical({ test, suite, check: caseId === null ? check : null, caseChecks, requirements: requirementDefinitions, modules: moduleDefinitions })), inputs, check, caseChecks, caseId, modules };
  context.bindingCache.set(cacheKey, binding);
  return binding;
}
async function selectedBindings(context: Context, selection: VerificationSelection): Promise<Record<string, Binding>> {
  for (const id of selection.requirements) if (!context.config.requirements.some(item => item.id === id)) fail(`所选需求未登记：${id}`);
  for (const id of selection.modules) if (!context.config.modules.some(item => item.id === id)) fail(`所选模块未登记：${id}`);
  const result: Record<string, Binding> = {};
  for (const caseId of selection.caseIds) {
    const checks = selection.checks.filter(check => check.caseId === caseId);
    // All checks of a case bind the same complete observed object and definition.
    result[`case:${caseId}`] = await bindingFor(context, caseId, null, [], checks);
  }
  for (const check of selection.checks) result[`check:${check.id}`] = await bindingFor(context, check.caseId ?? null, check, check.caseId ? [] : selection.modules,
    check.caseId ? selection.checks.filter(item => item.caseId === check.caseId) : []);
  if (!Object.keys(result).length) fail('验证选择不能为空。');
  return result;
}
async function bindingCurrent(context: Context, binding: Binding): Promise<boolean> {
  try { return canonical(await bindingFor(context, binding.caseId, binding.check, binding.modules, binding.caseChecks)) === canonical(binding); }
  catch { return false; }
}

export async function planVerificationRun(rootInput: string, workId: string, suiteId: string, selectionInput?: unknown) {
  string(suiteId, 128);
  const context = await base(rootInput, workId);
  const { root, work, inspection, config } = context;
  const suite = config.suites.find(item => item.id === suiteId);
  if (!suite) fail('测试套件未登记。');
  if (work.record.schemaVersion !== 3 || !work.record.scope.repositories.includes(suite.repository)) fail('测试仓库超出工作范围。');
  const cwd = await cwdFor(root, workId, suite);
  const selection = selectionInput === undefined ? defaultSelection(config, inspection.cases.filter(item => item.automation?.suite === suiteId)) : parseVerificationSelection(selectionInput);
  const caseIds = selection.caseIds;
  if (caseIds.some(id => inspection.cases.find(item => item.id === id)?.automation?.suite !== suiteId)
    || selection.checks.some(check => check.kind === 'manual' || (check.kind === 'execution' && check.suite !== suiteId))) fail('选择范围包含不属于执行套件的用例或检查。');
  const bindings = await selectedBindings(context, selection);
  const files = Object.assign({}, ...Object.values(bindings).map(binding => binding.inputs)) as Snapshot;
  const command = suite.command === 'node' ? process.execPath : suite.command;
  const environmentHash = hash(canonical(environment()));
  const configuredInvocation = invocation({ repository: suite.repository, command: suite.command, args: suite.args, cwd: suite.cwd });
  const binding = { root, workId, suite, command, cwd, bindings, caseIds, environmentHash };
  return { ready: true, planId: hash(canonical(binding)), root, workId, suiteId, repository: suite.repository, cwd, command,
    args: suite.args, invocation: configuredInvocation, timeoutMs: suite.timeoutMs, inputs: suite.inputs, files, bindings, selection, caseIds, environmentHash,
    limitation: '已配置命令是受信任程序，不是沙箱；可能修改文件或访问网络。超时只保证尝试终止直接子进程，不能保证后代进程退出。只绑定显式输入和目录引用，不能证明未声明依赖不变；进程成功不代表逐用例通过。' };
}

async function execute(plan: Awaited<ReturnType<typeof planVerificationRun>>): Promise<Execution> {
  const startedAt = new Date().toISOString(); const started = performance.now();
  return new Promise(resolveResult => {
    let output = ''; let timedOut = false; let outputLimited = false; let error: string | null = null; let settled = false;
    let child: ReturnType<typeof spawn>;
    const finish = (exitCode: number | null, signal: string | null): void => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(grace);
      resolveResult({ invocation: plan.invocation, startedAt, finishedAt: new Date().toISOString(), durationMs: Math.max(0, Math.round(performance.now() - started)),
        exitCode, signal, timedOut, outputLimited, error, output,
        suitePassed: exitCode === 0 && !timedOut && !outputLimited && !error });
    };
    let timer: NodeJS.Timeout; let grace: NodeJS.Timeout | undefined;
    const stop = (): void => {
      child.kill('SIGKILL');
      // Descendants may retain pipes; stop waiting and explicitly report incomplete termination.
      grace = setTimeout(() => { error ??= '子进程未在终止后关闭；后代进程状态未知。'; child.stdout?.destroy(); child.stderr?.destroy(); child.unref(); finish(null, 'SIGKILL'); }, 1500);
    };
    try { child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: environment(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (cause) { error = String(cause).slice(0, 4096); finish(null, null); return; }
    const collect = (chunk: Buffer): void => {
      if (settled) return;
      const remaining = LIMIT - Buffer.byteLength(output);
      output += chunk.subarray(0, Math.max(0, remaining)).toString('utf8');
      if (chunk.length > remaining && !outputLimited) { outputLimited = true; stop(); }
    };
    child.stdout?.on('data', collect); child.stderr?.on('data', collect);
    child.on('error', cause => { error = String(cause).slice(0, 4096); });
    child.on('close', (code, signal) => finish(code, signal));
    timer = setTimeout(() => { timedOut = true; stop(); }, plan.timeoutMs);
  });
}

function parseResults(value: unknown): EvidenceResult[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000) fail('结果须为 1–10000 项。');
  const seen = new Set<string>();
  return value.map(item => {
    const data = object(item, ['caseId', 'checkId', 'status', 'evidence', 'note']);
    if ((data.caseId === undefined) === (data.checkId === undefined)) fail('结果须明确且仅引用一个用例或检查。');
    const target = data.caseId === undefined ? { checkId: string(data.checkId, 128) } : { caseId: string(data.caseId, 128) };
    const targetKey = data.caseId === undefined ? `check:${data.checkId}` : `case:${data.caseId}`;
    if (seen.has(targetKey)) fail('结果包含重复用例或检查。'); seen.add(targetKey);
    if (!outcomes.includes(data.status as Outcome)) fail('用例结果状态无效。');
    const evidence = reference(data.evidence); independentEvidence(evidence);
    return { ...target, status: data.status as Outcome, evidence, note: string(data.note) };
  });
}
function resultKey(result: EvidenceResult): string { return result.caseId === undefined ? `check:${result.checkId}` : `case:${result.caseId}`; }
function relatedBindingNames(record: RunRecord, name: string, binding: Binding): string[] {
  return Object.entries(record.bindings).filter(([candidate, value]) => candidate === name
    || (binding.caseId !== null && value.caseId === binding.caseId)).map(([candidate]) => candidate);
}
function parseSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 20000) fail('验证快照无效。');
  for (const [ref, digest] of Object.entries(value)) {
    assertVerificationInput(reference(fromKey(ref)));
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) fail('验证快照摘要无效。');
  }
  return value as Snapshot;
}
function parseBindings(value: unknown): Record<string, Binding> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).length > 20000) fail('验证记录缺少逐项受检输入绑定。');
  for (const [name, raw] of Object.entries(value)) {
    if (!/^(case|check):[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(name)) fail('验证绑定身份无效。');
    const item = object(raw, ['identity', 'definition', 'inputs', 'check', 'caseChecks', 'caseId', 'modules']);
    for (const field of ['identity', 'definition']) if (typeof item[field] !== 'string' || !/^[a-f0-9]{64}$/u.test(item[field])) fail('验证绑定摘要无效。');
    if (!Object.keys(parseSnapshot(item.inputs)).length) fail('验证绑定输入不能为空。');
    if (item.caseId !== null) string(item.caseId, 128);
    if (!Array.isArray(item.modules) || item.modules.length > 10000 || new Set(item.modules).size !== item.modules.length) fail('验证绑定模块清单无效。');
    item.modules.forEach(module => string(module, 100));
    if (!Array.isArray(item.caseChecks) || item.caseChecks.length > 10000) fail('验证用例检查清单无效。');
    if (item.caseChecks.length) {
      const checks = item.caseChecks as VerificationCheck[];
      const parsed = parseVerificationSelection({ caseIds: [item.caseId], requirements: [...new Set(checks.flatMap(check => check.requirements))], modules: [],
        categories: Object.fromEntries(verificationCategories.map(category => [category, { applicability: 'pending', reason: '校验结构' }])), reason: '校验结构', scenarioReason: '校验结构', checks });
      if (parsed.checks.some(check => check.caseId !== item.caseId)) fail('验证用例检查关联不一致。');
    }
    if (item.check !== null) {
      const check = item.check as VerificationCheck;
      parseVerificationSelection({ caseIds: check.caseId ? [check.caseId] : [], requirements: check.requirements, modules: [],
        categories: Object.fromEntries(verificationCategories.map(category => [category, { applicability: 'pending', reason: '校验结构' }])), reason: '校验结构', scenarioReason: '校验结构', checks: [check] });
      if (name.startsWith('check:') && name !== `check:${check.id}`) fail('验证检查身份不一致。');
      if (item.caseId !== (check.caseId ?? null) || (item.caseId !== null
        && !(item.caseChecks as VerificationCheck[]).some(candidate => canonical(candidate) === canonical(check)))) fail('验证检查与用例绑定不一致。');
    }
    if (name.startsWith('check:') && item.check === null) fail('验证检查缺少定义。');
    if (name.startsWith('case:') && (name !== `case:${item.caseId}` || item.check !== null)) fail('验证用例身份不一致。');
  }
  return value as Record<string, Binding>;
}
function parseRecord(text: string, workId: string, filename: string): RunRecord {
  if (Buffer.byteLength(text) > MAX_RECORD) fail('验证记录过大。');
  const raw = JSON.parse(text) as unknown;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).schemaVersion !== 2) {
    throw Object.assign(new Error(`验证记录版本 ${String((raw as Record<string, unknown>).schemaVersion)} 不受支持；仅支持版本 2。请使用 tiller work create 新建工作并重新验证；旧记录不迁移、不删除，旧结果不自动继承。`), { code: 'UNSUPPORTED_RECORD_VERSION' });
  }
  const data = object(raw, ['schemaVersion', 'id', 'workId', 'createdAt', 'sequence', 'source', 'suite', 'caseIds', 'bindings', 'evidence', 'captureId', 'environment', 'results', 'execution', 'staleAfterExecution', 'digest']);
  if (data.workId !== workId || !['executed', 'captured', 'reported'].includes(String(data.source))
    || typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/.test(data.id) || filename !== `${data.id}.json`
    || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))
    || !Number.isSafeInteger(data.sequence) || Number(data.sequence) < 1 || typeof data.staleAfterExecution !== 'boolean') fail('验证记录身份或状态无效。');
  if (data.suite !== null) string(data.suite, 128);
  string(data.environment);
  if (!Array.isArray(data.caseIds) || data.caseIds.length > 10000 || new Set(data.caseIds).size !== data.caseIds.length) fail('验证记录用例清单无效。');
  data.caseIds.forEach(id => string(id, 128));
  const bindings = parseBindings(data.bindings);
  const evidence = parseSnapshot(data.evidence);
  if (data.caseIds.some(id => !Object.hasOwn(bindings, `case:${id}`))) fail('验证记录用例未绑定输入。');
  if (data.source === 'reported') {
    const results = parseResults(data.results);
    string(data.captureId, 36);
    if (data.execution !== null || results.some(r => !Object.hasOwn(bindings, resultKey(r)) || !Object.hasOwn(evidence, key(r.evidence)))) fail('报告结果关联无效。');
  } else if (data.source === 'captured') {
    if (data.captureId !== null || data.execution !== null || !Array.isArray(data.results) || data.results.length || Object.keys(evidence).length) fail('观察输入采集不能冒充结果。');
  } else {
    if (data.captureId !== null || data.suite === null || !Array.isArray(data.results) || data.results.length || Object.keys(evidence).length) fail('程序执行不能冒充逐用例结果。');
    const execution = object(data.execution, ['invocation', 'startedAt', 'finishedAt', 'durationMs', 'exitCode', 'signal', 'timedOut', 'outputLimited', 'error', 'output', 'suitePassed']);
    invocation(execution.invocation); timestamp(execution.startedAt); timestamp(execution.finishedAt);
    if (!Number.isSafeInteger(execution.durationMs) || Number(execution.durationMs) < 0) fail('执行时长必须是非负整数毫秒。');
    if ((execution.exitCode !== null && !Number.isSafeInteger(execution.exitCode)) || (execution.signal !== null && typeof execution.signal !== 'string')
      || (execution.error !== null && (typeof execution.error !== 'string' || execution.error.length > 4096)) || typeof execution.output !== 'string' || execution.output.length > LIMIT + 8
      || ['timedOut', 'outputLimited', 'suitePassed'].some(k => typeof execution[k] !== 'boolean')
      || execution.suitePassed !== (execution.exitCode === 0 && !execution.timedOut && !execution.outputLimited && !execution.error)) fail('程序执行结果无效。');
  }
  const { digest, ...body } = data;
  if (digest !== hash(canonical(body))) fail('验证记录内容摘要不匹配。');
  return data as unknown as RunRecord;
}
async function records(root: string, workId: string): Promise<RunRecord[]> {
  const relative = directory(workId); const dir = await assertSafePath(root, relative);
  await assertSharedPaths(root, [relative]);
  let names: string[];
  try { names = await readdir(dir); } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return []; throw cause; }
  if (names.length > 10000) fail('验证记录数量过大。');
  const result: RunRecord[] = [];
  for (const name of names) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) fail('验证结果目录包含非标准记录。');
    await assertSharedPaths(root, [`${relative}/${name}`]);
    const text = await readTextIfExists(root, `${relative}/${name}`);
    if (text === null) fail('验证记录在读取时消失。');
    result.push(parseRecord(text, workId, name));
  }
  if (new Set(result.map(r => r.sequence)).size !== result.length) fail('验证记录序号重复。');
  result.sort((a, b) => a.sequence - b.sequence);
  for (const record of result.filter(item => item.source === 'reported')) {
    const capture = result.find(item => item.id === record.captureId);
    if (!capture || capture.source === 'reported' || capture.sequence >= record.sequence || capture.environment !== record.environment) fail('结果缺少先前执行或观察输入记录。');
    for (const name of Object.keys(record.bindings)) {
      if (canonical(record.bindings[name]) !== canonical(capture.bindings[name])) fail('结果不能重采或改写受检输入。');
    }
  }
  return result;
}
/** Reads strict historical records without asserting that their tested inputs are still current. */
export async function readVerificationRecords(rootInput: string, workId: string): Promise<RunRecord[]> {
  const root = await resolveWorkRoot(rootInput, workId);
  await loadWorkRecord(root, workId);
  return records(root, workId);
}
async function newResultPath(root: string, workId: string, id: string): Promise<string> {
  const path = `${directory(workId)}/${id}.json`;
  await assertSharedPaths(root, [path]);
  if (await readTextIfExists(root, path) !== null) fail('验证结果目标已经存在，不能覆盖。');
  return path;
}
async function save(root: string, workId: string, body: Omit<RunRecord, 'schemaVersion' | 'id' | 'workId' | 'sequence' | 'createdAt' | 'digest'>, id = randomUUID()) {
  const previous = await records(root, workId);
  const recordBody = { schemaVersion: 2 as const, id, workId, sequence: (previous.at(-1)?.sequence ?? 0) + 1, createdAt: new Date().toISOString(), ...body };
  const record: RunRecord = { ...recordBody, digest: hash(canonical(recordBody)) };
  const path = await newResultPath(root, workId, id);
  const text = JSON.stringify(record, null, 2) + '\n'; parseRecord(text, workId, `${record.id}.json`);
  await applyChanges(root, [{ path, before: null, after: text }], async () => assertSharedPaths(root, [path]));
  return { path, record, limitation: '记录摘要用于发现意外修改，不是身份签名；报告和执行结果不代替人工验收，也不能证明宿主遵守了任务顺序。' };
}

export async function applyVerificationRun(rootInput: string, workId: string, suiteId: string, planId: string, selectionInput?: unknown) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, async () => {
    const plan = await planVerificationRun(root, workId, suiteId, selectionInput);
    if (plan.planId !== planId) fail('测试执行计划已变化，请重新预览。');
    await records(root, workId);
    const id = randomUUID();
    await newResultPath(root, workId, id);
    const execution = await execute(plan);
    let staleAfterExecution = true;
    try {
      const context = await base(root, workId);
      staleAfterExecution = (await Promise.all(Object.values(plan.bindings).map(binding => bindingCurrent(context, binding)))).some(current => !current);
    } catch { /* Preserve the actual execution even when it invalidated its own configuration. */ }
    const saved = await save(root, workId, { source: 'executed', suite: suiteId, caseIds: plan.caseIds, bindings: plan.bindings, evidence: {}, captureId: null,
      environment: `sha256:${plan.environmentHash}`, results: [], execution, staleAfterExecution }, id);
    return { ...saved, ready: execution.suitePassed && !staleAfterExecution };
  });
}

export async function captureVerificationObservation(rootInput: string, workId: string, input: unknown) {
  const data = object(input, ['selection', 'environment']);
  const selection = parseVerificationSelection(data.selection);
  if (selection.checks.some(check => check.kind === 'execution')) fail('执行检查必须通过实际套件运行采集；人工观察请使用 manual 检查。');
  const env = string(data.environment);
  const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, async () => {
    const context = await base(root, workId);
    const bindings = await selectedBindings(context, selection);
    const saved = await save(root, workId, { source: 'captured', suite: null, caseIds: selection.caseIds, bindings, evidence: {}, captureId: null,
      environment: env, results: [], execution: null, staleAfterExecution: false });
    return { ...saved, ready: true, captureId: saved.record.id };
  });
}

export async function recordVerificationEvidence(rootInput: string, workId: string, input: unknown) {
  const data = object(input, ['captureId', 'results', 'environment']);
  const results = parseResults(data.results); const env = string(data.environment);
  const captureId = string(data.captureId, 36);
  const root = await resolveWorkRoot(rootInput, workId);
  return withProjectLock(root, async () => {
    const context = await base(root, workId);
    const history = await records(root, workId);
    const capture = history.find(record => record.id === captureId);
    if (!capture || capture.source === 'reported') fail('结果必须引用执行或观察当时的受检输入；先执行套件或采集观察输入。');
    if (capture.environment !== env) fail('结果环境与受检输入记录不一致。');
    const bindings: Record<string, Binding> = {};
    const files: Snapshot = {};
    for (const result of results) {
      const name = resultKey(result);
      const binding = capture.bindings[name];
      if (!binding) fail('结果用例不存在或不属于指定采集范围。');
      if (history.some(record => record.sequence > capture.sequence && relatedBindingNames(record, name, binding).length)) fail('已有较新的结果或未完成尝试；不能用旧观察输入覆盖。');
      const evidenceKey = key(result.evidence).toLowerCase();
      if ([...Object.keys(binding.inputs), ...Object.keys(context.inspection.files)].some(inputKey => inputKey.toLowerCase() === evidenceKey)) fail('验证证据必须独立于配置、用例定义及被验证输入。');
      if (!context.work.record.scope.repositories.includes(result.evidence.repository)) fail('结果或证据仓库超出工作范围。');
      bindings[name] = binding;
      files[key(result.evidence)] = hash(await readVerificationReference(root, result.evidence));
    }
    if (canonical(await currentSnapshot(root, files)) !== canonical(files)) fail('记录期间验证依据发生变化。');
    const staleAfterExecution = (await Promise.all(Object.values(bindings).map(binding => bindingCurrent(context, binding)))).some(current => !current);
    const saved = await save(root, workId, { source: 'reported', suite: capture.suite, caseIds: results.flatMap(r => r.caseId ? [r.caseId] : []), bindings, evidence: files, captureId,
      environment: env, results, execution: null, staleAfterExecution });
    return { ...saved, ready: true };
  });
}

type EvaluatedState = { status: Outcome | 'stale'; recordId: string | null; source: string | null; workId: string; inputs: Snapshot };
export async function evaluateVerificationSelection(rootInput: string, workId: string, selectionInput: unknown,
  evidenceRefs: VerificationEvidenceReference[] = [], artifactSnapshots?: VerificationArtifactSnapshots) {
  const selection = parseVerificationSelection(selectionInput);
  const context = await base(rootInput, workId);
  const expected = await selectedBindings(context, selection);
  const history = await records(context.root, workId);
  const issues: string[] = [];
  const warnings: string[] = [];
  const states = new Map<string, EvaluatedState>();
  const references: VerificationEvidenceReference[] = [];
  const external = new Map<string, { context: Context; history: RunRecord[] }>();
  const explicit = new Map<string, VerificationEvidenceReference>();
  for (const raw of evidenceRefs) {
    const ref = object(raw, ['workId', 'runId', 'caseId', 'checkId', 'environment']);
    validateWorkId(string(ref.workId, 64)); string(ref.runId, 36);
    if (ref.workId !== workId || ref.environment !== undefined) string(ref.environment);
    if ((ref.caseId === undefined) === (ref.checkId === undefined)) fail('证据引用必须明确一个用例或检查。');
    const name = ref.caseId === undefined ? `check:${string(ref.checkId, 128)}` : `case:${string(ref.caseId, 128)}`;
    if (!expected[name] || explicit.has(name)) fail('证据引用超出选择范围或存在歧义。');
    explicit.set(name, raw);
  }
  for (const [name, binding] of Object.entries(expected)) {
    let owner = context; let candidates = history;
    const requested = explicit.get(name);
    if (requested && requested.workId !== workId) {
      let loaded = external.get(requested.workId);
      if (!loaded) {
        const other = await base(context.root, requested.workId);
        loaded = { context: other, history: await records(other.root, requested.workId) };
        external.set(requested.workId, loaded);
      }
      if (canonical(normalizedScope(loaded.context)) !== canonical(normalizedScope(context))) fail('跨工作证据范围不一致。');
      if (history.some(record => relatedBindingNames(record, name, binding).length)) fail('当前工作与跨工作证据均有尝试，无法安全判断更新顺序；请在当前工作重新验证。');
      owner = loaded.context; candidates = loaded.history;
    }
    const latest = candidates.filter(record => relatedBindingNames(record, name, binding).length).at(-1);
    let status: EvaluatedState['status'] = 'not-run';
    if (requested && latest?.id !== requested.runId) issues.push(`${name} 引用的结果不是最新尝试，不能挑选历史通过。`);
    if (latest) {
      if (requested?.environment !== undefined && requested.environment !== latest.environment) fail('显式证据引用的环境与结果不一致。');
      const related = relatedBindingNames(latest, name, binding);
      const actual = latest.bindings[name] ?? latest.bindings[related[0]!]!;
      const comparable = { ...actual, identity: binding.identity, check: binding.caseId === null ? actual.check : binding.check };
      const results = latest.results.filter(item => related.includes(resultKey(item)));
      const result = results.find(item => item.status !== 'passed') ?? results.find(item => resultKey(item) === name) ?? results[0];
      const evidenceSnapshot = result ? { [key(result.evidence)]: latest.evidence[key(result.evidence)]! } : {};
      const evidenceCurrent = canonical(await currentSnapshot(owner.root, evidenceSnapshot)) === canonical(evidenceSnapshot);
      const capture = latest.captureId ? candidates.find(record => record.id === latest.captureId) : latest;
      const stale = latest.staleAfterExecution || capture?.staleAfterExecution || !evidenceCurrent
        || !await bindingCurrent(owner, actual) || canonical(comparable) !== canonical(binding);
      const executionFailed = capture?.execution !== null && capture?.execution !== undefined && !capture.execution.suitePassed;
      status = stale ? 'stale' : executionFailed ? 'failed' : result?.status
        ?? (actual.check?.kind === 'execution' && latest.execution?.suitePassed ? 'passed' : 'not-run');
      if (requested && latest.id !== requested.runId) status = 'stale';
      if (status === 'passed') references.push({ workId: owner.work.record.id, runId: latest.id, environment: latest.environment,
        ...(name.startsWith('case:') ? { caseId: name.slice(5) } : { checkId: name.slice(6) }) });
      states.set(name, { status, recordId: latest.id, source: latest.source, workId: owner.work.record.id, inputs: actual.inputs });
    } else states.set(name, { status, recordId: null, source: null, workId, inputs: {} });
    if (status !== 'passed') issues.push(`${name} 尚未通过：${status}。`);
  }
  const cases = selection.caseIds.map(id => {
    const definition = context.inspection.cases.find(item => item.id === id)!;
    return { id, categories: definition.categories, ...states.get(`case:${id}`)! };
  });
  const checks = selection.checks.map(check => {
    const state = states.get(`check:${check.id}`)!;
    if (artifactSnapshots !== undefined) {
      for (const artifactId of check.artifactIds) {
        const files = artifactSnapshots[artifactId];
        if (!files || !Object.keys(files).length) { issues.push(`检查 ${check.id} 缺少当前产物快照：${artifactId}。`); continue; }
        for (const [ref, digest] of Object.entries(files)) {
          assertVerificationInput(reference(fromKey(ref)));
          if (!/^[a-f0-9]{64}$/u.test(digest)) fail('产物快照摘要无效。');
          if (state.inputs[ref] !== digest) issues.push(`检查 ${check.id} 的受测输入未覆盖当前产物 ${artifactId}：${ref}。`);
        }
      }
    }
    return { id: check.id, kind: check.kind, categories: check.categories, artifactIds: check.artifactIds, ...state };
  });
  const categories = verificationCategories.map(category => {
    const definition = selection.categories[category];
    const selected = [...cases, ...checks].filter(item => item.categories.includes(category));
    if (definition.applicability === 'pending') issues.push(`测试类别 ${category} 的适用性待明确。`);
    if (definition.applicability === 'not-applicable' && selected.length) issues.push(`所选检查与不适用类别冲突：${category}。`);
    if (definition.applicability === 'applicable' && (!selected.length || selected.some(item => item.status !== 'passed'))) issues.push(`测试类别 ${category} 仍有未通过或未执行用例/检查。`);
    return { category, ...definition, counts: Object.fromEntries([...outcomes, 'stale'].map(status => [status, selected.filter(item => item.status === status).length])), total: selected.length };
  });
  const requirements = selection.requirements.map(id => {
    const associatedCases = context.inspection.cases.filter(item => selection.caseIds.includes(item.id) && item.requirements.includes(id)).map(item => item.id);
    const associatedChecks = selection.checks.filter(item => item.requirements.includes(id)).map(item => item.id);
    if (!associatedCases.length && !associatedChecks.length) issues.push(`需求 ${id} 尚未关联所选用例或必要检查。`);
    return { id, cases: associatedCases, checks: associatedChecks, allPassed: associatedCases.length + associatedChecks.length > 0
      && associatedCases.every(id => states.get(`case:${id}`)?.status === 'passed') && associatedChecks.every(id => states.get(`check:${id}`)?.status === 'passed') };
  });
  for (const test of context.inspection.cases) if (!selection.caseIds.includes(test.id)) warnings.push(`范围外用例未纳入本次判断：${test.id}。`);
  for (const requirement of context.config.requirements) if (!selection.requirements.includes(requirement.id)) warnings.push(`范围外需求未检查覆盖：${requirement.id}。`);
  for (const category of verificationCategories) if (context.config.categories[category].applicability === 'pending') warnings.push(`全局类别 ${category} 待明确；本次依据选择范围判断。`);
  const runs = [];
  for (const record of history) {
    const stale = record.staleAfterExecution || canonical(await currentSnapshot(context.root, record.evidence)) !== canonical(record.evidence)
      || (await Promise.all(Object.values(record.bindings).map(binding => bindingCurrent(context, binding)))).some(current => !current);
    runs.push({ id: record.id, sequence: record.sequence, source: record.source, suite: record.suite, stale, execution: record.execution });
  }
  const basisDigest = hash(canonical({ selection, expected, evidenceRefs: references, cases, checks, issues, artifactSnapshots: artifactSnapshots ?? null }));
  return { root: context.root, workId, ready: !issues.length, issues, warnings, selection, categories, requirements, cases, checks, runs, evidenceRefs: references, basisDigest,
    artifactCoverage: artifactSnapshots === undefined ? 'not-supplied' : 'checked', automaticTransition: false,
    limitation: '输入采集证明当时登记的版本，不认证执行者或追认过去观察。人工/外部结果须在所绑定对象上实际重新核对；套件成功不等于用例通过。显式输入不能证明未声明依赖完整，产物覆盖须由调用方提供当前完整快照。' };
}

export async function reportVerification(rootInput: string, workId: string, selectionInput?: unknown) {
  if (selectionInput !== undefined) return evaluateVerificationSelection(rootInput, workId, selectionInput);
  const context = await base(rootInput, workId);
  const selection = defaultSelection(context.config, context.inspection.cases);
  selection.requirements = context.config.requirements.map(item => item.id);
  selection.modules = context.config.modules.map(item => item.id);
  if (!selection.caseIds.length) return { root: context.root, workId, ready: false, issues: ['没有可验证用例；纯文档检查须提供显式选择。'], cases: [], runs: [], requirements: [], categories: [], automaticTransition: false };
  return evaluateVerificationSelection(context.root, workId, selection);
}
