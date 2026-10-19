import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { resolveRepositoryRoot, resolveWorkRoot } from './delivery-location.js';
import { repositoryPath } from './repository-paths.js';
import { assertSharedPaths, requireReadyProject } from './core.js';
import { applyChanges, assertSafePath, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { assertAcceptance, checkGate, inspectConfirmations } from './confirmations.js';
import type { FileChange } from './types.js';

export const templateTypes = ['product-requirements', 'product-design', 'module-requirements', 'module-design', 'change-requirements', 'change-design'] as const;
export type TemplateType = typeof templateTypes[number];
export type ArtifactRole = 'requirements' | 'design';
export interface FileRef { repository: string; path: string }
export interface WorkScope { repositories: string[]; targets: string[] }
export interface RequirementsBasis { workId: string; requestId: string }
export interface Completion {
  documentHash: string; evidence: string; evidenceHash: string; at: string;
  confirmation: Awaited<ReturnType<typeof assertAcceptance>>;
}
export interface WorkArtifact {
  type: TemplateType; source: FileRef; origin: 'generated' | 'reference';
  status: 'draft' | 'complete'; requirementsBasis?: RequirementsBasis;
  requirementsBasisHistory?: { at: string; before?: RequirementsBasis; after: RequirementsBasis }[];
  completion?: Completion; completionHistory?: Completion[];
}
export interface WorkRecord {
  schemaVersion: 3; id: string; title: string; createdAt: string;
  level: 'product' | 'module' | 'change'; scope: WorkScope;
  artifacts: Partial<Record<ArtifactRole, WorkArtifact>>;
}
export type WorkRecordV2 = WorkRecord;
export interface ArtifactInput { type: TemplateType; source?: FileRef; scope?: WorkScope; requirementsBasis?: RequirementsBasis }
const roles: ArtifactRole[] = ['requirements', 'design'];
function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); }
export function validateWorkId(id: string): void {
  if (typeof id !== 'string' || !/^(?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || id.length > 64
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:-|$)/i.test(id)) fail('INVALID_WORK_ID', '工作标识须为 1–64 位小写字母、数字和单个连字符，以字母或 YYYYMMDD-日期前缀开头，不得使用设备保留名。');
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_WORK_RECORD', `${label}须为对象。`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_ARGUMENT', '输入含不支持的字段。');
}
function hash(content: string): string { return createHash('sha256').update(content).digest('hex'); }
function pathsFor(id: string) { validateWorkId(id); const directory = `.tiller/work/${id}`; return { directory, record: `${directory}/record.json`, notes: `${directory}/work.md` }; }
function roleOf(type: TemplateType): ArtifactRole { return type.endsWith('design') ? 'design' : 'requirements'; }
function levelOf(type: TemplateType): WorkRecord['level'] { return type.split('-')[0] as WorkRecord['level']; }
function template(value: unknown): TemplateType {
  if (!templateTypes.includes(value as TemplateType)) fail('INVALID_TEMPLATE', `支持的模板：${templateTypes.join(', ')}`);
  return value as TemplateType;
}
export function validateWorkReference(value: unknown): FileRef {
  const item = object(value, '产物引用'); keys(item, ['repository', 'path']);
  if (typeof item.repository !== 'string' || typeof item.path !== 'string') fail('INVALID_WORK_RECORD', '产物引用须包含 repository 与 path。');
  if (item.repository !== '.') validateRelativePath(item.repository);
  validateRelativePath(item.path);
  const parts = item.path.toLowerCase().split('/');
  if (!item.path.endsWith('.md') || parts.includes('.git') || parts.some((part, index) => part === '.tiller' && parts[index + 1] === 'local')) fail('INVALID_WORK_RECORD', '产物须引用共享 Markdown 文件，不能引用 Git 或本机资料。');
  return { repository: item.repository, path: item.path };
}
export function validateWorkScope(value: unknown): WorkScope {
  const item = object(value, '工作范围'); keys(item, ['repositories', 'targets']);
  for (const key of ['repositories', 'targets']) {
    const values = item[key];
    if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string' || !v.trim() || /[\x00-\x1f]/.test(v)) || new Set(values).size !== values.length) fail('INVALID_WORK_RECORD', '工作范围须包含不重复、非空的 repositories 和 targets。');
  }
  for (const repository of item.repositories as string[]) if (repository !== '.') validateRelativePath(repository);
  return { repositories: [...item.repositories as string[]], targets: [...item.targets as string[]] };
}
function basisValue(value: unknown): RequirementsBasis {
  const item = object(value, '需求确认依据'); keys(item, ['workId', 'requestId']);
  validateWorkId(item.workId as string); validateWorkId(item.requestId as string);
  return { workId: item.workId as string, requestId: item.requestId as string };
}
export function parseArtifactInput(value: unknown, basis?: RequirementsBasis): ArtifactInput {
  const item = typeof value === 'string' ? { type: value } : object(value, '产物输入');
  keys(item, ['type', 'source', 'scope', 'requirementsBasis']);
  if (basis && item.requirementsBasis) fail('INVALID_ARGUMENT', '需求依据不能同时通过输入和参数指定。');
  const result: ArtifactInput = { type: template(item.type) };
  if (item.source !== undefined) result.source = validateWorkReference(item.source);
  if (item.scope !== undefined) result.scope = validateWorkScope(item.scope);
  if (item.requirementsBasis !== undefined || basis) result.requirementsBasis = basisValue(item.requirementsBasis ?? basis);
  if (roleOf(result.type) === 'requirements' && result.requirementsBasis) fail('INVALID_ARGUMENT', '需求确认引用只适用于设计模板。');
  return result;
}
function evidencePath(value: string): string {
  try { return validateWorkReference({ repository: '.', path: value }).path; }
  catch { fail('INVALID_EVIDENCE', '证据须为工程内共享 Markdown 文件的相对路径，不能引用本机资料或 Git 内部文件。'); }
}
function sameRef(a: FileRef, b: FileRef): boolean { return a.repository.toLowerCase() === b.repository.toLowerCase() && a.path.toLowerCase() === b.path.toLowerCase(); }
function sameScope(a: WorkScope, b: WorkScope): boolean {
  return ['repositories', 'targets'].every(key => JSON.stringify([...a[key as keyof WorkScope]].sort()) === JSON.stringify([...b[key as keyof WorkScope]].sort()));
}
function validateCompletion(value: unknown, source: FileRef, id: string): void {
  const item = object(value, '完成记录');
  keys(item, ['documentHash', 'evidence', 'evidenceHash', 'at', 'confirmation']);
  if (typeof item.evidence !== 'string' || typeof item.at !== 'string' || typeof item.documentHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.documentHash)
    || typeof item.evidenceHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.evidenceHash)) fail('INVALID_WORK_RECORD', '完成记录缺少证据关联。');
  evidencePath(item.evidence);
  if (sameRef(source, { repository: '.', path: item.evidence }) || item.evidence.toLowerCase() === pathsFor(id).notes.toLowerCase()) fail('INVALID_WORK_RECORD', '产物或工作说明本身不能代替独立评审依据。');
  {
    const confirmation = object(item.confirmation, '验收关联');
    keys(confirmation, ['requestId', 'decisionId', 'confirmationBasis', 'requestFingerprint', 'decisionFingerprint']);
    if (typeof confirmation.requestId !== 'string' || typeof confirmation.decisionId !== 'string' || confirmation.confirmationBasis !== 'reported-review'
      || typeof confirmation.requestFingerprint !== 'string' || typeof confirmation.decisionFingerprint !== 'string') fail('INVALID_WORK_RECORD', '人工验收关联无效。');
  }
}
function validateArtifact(item: WorkArtifact, id: string, role: ArtifactRole, level: WorkRecord['level']): void {
  keys(object(item, '产物'), ['type', 'source', 'origin', 'status', 'requirementsBasis', 'requirementsBasisHistory', 'completion', 'completionHistory']);
  template(item.type); validateWorkReference(item.source);
  if (roleOf(item.type) !== role || levelOf(item.type) !== level || !['generated', 'reference'].includes(item.origin)
    || !['draft', 'complete'].includes(item.status)) fail('INVALID_WORK_RECORD', '产物角色、层级或状态无效。');
  if (/^\.tiller\/work\/[^/]+\/work\.md$/i.test(item.source.path)) fail('INVALID_WORK_RECORD', '工作入口不能同时作为需求或设计产物。');
  if (item.origin === 'generated' && !sameRef(item.source, { repository: '.', path: `${pathsFor(id).directory}/${role}.md` })) fail('INVALID_WORK_RECORD', '生成产物位置与工作标识不匹配。');
  if (item.status === 'complete') validateCompletion(item.completion, item.source, id);
  else if (item.completion !== undefined) fail('INVALID_WORK_RECORD', '草稿不能带有完成结论。');
  if (item.completionHistory !== undefined) {
    if (!Array.isArray(item.completionHistory)) fail('INVALID_WORK_RECORD', '完成历史须为数组。');
    for (const completion of item.completionHistory) validateCompletion(completion, item.source, id);
  }
  if (item.requirementsBasis !== undefined) { basisValue(item.requirementsBasis); if (role !== 'design') fail('INVALID_WORK_RECORD', '需求不能关联设计前置依据。'); }
  if (item.requirementsBasisHistory !== undefined) {
    if (role !== 'design' || !Array.isArray(item.requirementsBasisHistory)) fail('INVALID_WORK_RECORD', '需求依据历史无效。');
    for (const entry of item.requirementsBasisHistory) {
      keys(object(entry, '需求依据历史'), ['at', 'before', 'after']);
      if (!entry || typeof entry.at !== 'string') fail('INVALID_WORK_RECORD', '需求依据变更时间缺失。');
      basisValue(entry.after); if (entry.before !== undefined) basisValue(entry.before);
    }
  }
}
export function parseWorkRecord(text: string, id: string): WorkRecord {
  validateWorkId(id);
  let raw: unknown; try { raw = JSON.parse(text); } catch { fail('INVALID_WORK_RECORD', '工作记录不是有效 JSON。'); }
  const value = object(raw, '工作记录');
  if (value.schemaVersion !== 3) fail('UNSUPPORTED_RECORD_VERSION', `工作记录版本 ${String(value.schemaVersion)} 不受支持；需要版本 3。请使用 work create 新建工作，原文件保留且不会迁移。`);
  keys(value, ['schemaVersion', 'id', 'title', 'createdAt', 'level', 'scope', 'artifacts']);
  if (value.id !== id || typeof value.title !== 'string' || !value.title.trim() || typeof value.createdAt !== 'string') fail('INVALID_WORK_RECORD', '工作记录必要字段无效。');
  if (!['product', 'module', 'change'].includes(value.level as string)) fail('INVALID_WORK_RECORD', '工作记录层级无效。');
  validateWorkScope(value.scope);
  const artifacts = object(value.artifacts, '产物登记');
  if (!Object.keys(artifacts).length || Object.keys(artifacts).some(key => !roles.includes(key as ArtifactRole))) fail('INVALID_WORK_RECORD', '只支持一个主需求和一个主设计。');
  for (const role of roles) if (artifacts[role] !== undefined) validateArtifact(object(artifacts[role], '产物') as unknown as WorkArtifact, id, role, value.level as WorkRecord['level']);
  const req = artifacts.requirements as WorkArtifact | undefined; const design = artifacts.design as WorkArtifact | undefined;
  if (req && design && sameRef(req.source, design.source)) fail('INVALID_WORK_RECORD', '需求与设计不能指向同一混合文件。');
  for (const artifact of Object.values(artifacts) as WorkArtifact[]) if (!(value.scope as WorkScope).repositories.includes(artifact.source.repository)) fail('INVALID_WORK_RECORD', '产物引用超出工作仓库范围。');
  return value as unknown as WorkRecord;
}
export async function readWorkReference(root: string, reference: FileRef): Promise<string | null> {
  validateWorkReference(reference);
  const metadata = await requireReadyProject(root, { write: false });
  if (reference.repository !== '.' && !metadata.repositories.includes(reference.repository)) fail('INVALID_WORK_REFERENCE', `仓库未登记：${reference.repository}`);
  const location = reference.path.toLowerCase();
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  if (reference.repository === '.' && boundaries.some(boundary => location === boundary || location.startsWith(`${boundary}/`))) fail('INVALID_WORK_REFERENCE', '业务仓库文档须使用已登记仓库身份。');
  const repositoryRoot = await resolveRepositoryRoot(root, reference.repository);
  await assertSharedPaths(repositoryRoot, [reference.path]);
  return readTextIfExists(repositoryRoot, reference.path);
}
export async function loadWorkRecord(root: string, id: string, write = false) {
  const paths = pathsFor(id); await requireReadyProject(root, { write });
  await assertSharedPaths(root, [paths.record, paths.notes]);
  const original = await readTextIfExists(root, paths.record);
  if (original === null) fail('WORK_NOT_FOUND', `工作 ${id} 尚未登记；请用 work inspect 检查缺口，并用 work create 新建工作引用所需资料。`);
  const record = parseWorkRecord(original, id);
  await validateScopeRepositories(root, record.scope);
  return { record, original, paths, notes: await readTextIfExists(root, paths.notes) };
}
async function validateScopeRepositories(root: string, scope: WorkScope): Promise<void> {
  const metadata = await requireReadyProject(root, { write: false });
  if (scope.repositories.some(repo => repo !== '.' && !metadata.repositories.includes(repo))) fail('INVALID_WORK_SCOPE', '工作范围含未登记仓库。');
}
async function requireRequirements(root: string, basis: RequirementsBasis | undefined, scope?: WorkScope, requirementSource?: FileRef) {
  if (!basis) fail('REQUIREMENTS_CONFIRMATION_REQUIRED', '设计需要有效的需求确认依据；请指定 requirements-work 和 requirements-request。');
  basisValue(basis);
  const gate = await checkGate(root, basis.workId, basis.requestId);
  if (gate.gate !== 'requirements' || !gate.confirmed) fail('REQUIREMENTS_CONFIRMATION_REQUIRED', `对应需求尚未有效确认：${gate.issues.join('；')}`);
  const registryText = await readTextIfExists(root, `.tiller/work/${basis.workId}/confirmations.json`);
  // checkGate has validated the registry, snapshots, source review and current file bytes.
  const registry = JSON.parse(registryText ?? '{}') as { requests: { requestId: string; scope: WorkScope; subjects: FileRef[]; files: (FileRef & { sha256: string })[] }[] };
  const request = registry.requests.find(item => item.requestId === basis.requestId);
  if (!request) fail('REQUIREMENTS_CONFIRMATION_REQUIRED', '需求请求已变化。');
  const requirement = requirementSource ?? (await loadWorkRecord(root, basis.workId)).record.artifacts.requirements?.source;
  if (!requirement || !request.subjects.some(ref => sameRef(ref, requirement))) fail('REQUIREMENTS_CONFIRMATION_REQUIRED', '需求请求未包含当前采用的需求产物。');
  const contents = await readWorkReference(root, requirement);
  if (contents === null || !request.files.some(file => sameRef(file, requirement) && file.sha256 === hash(contents))) fail('REQUIREMENTS_CONFIRMATION_REQUIRED', '需求产物与确认快照不匹配。');
  const effective = scope ?? request.scope;
  if (!effective.repositories.every(repo => request.scope.repositories.includes(repo)) || !effective.targets.every(target => request.scope.targets.includes(target))) fail('REQUIREMENTS_CONFIRMATION_REQUIRED', '需求确认范围不能覆盖当前工作范围。');
  return { scope: validateWorkScope(request.scope), requirement };
}
export function contentIssues(content: string | null, label: string): string[] {
  if (content === null) return [`${label}不存在。`];
  const issues: string[] = [];
  if (/<!--\s*TODO\b/i.test(content) || /^\s*(?:[-*]\s+)?TODO\b/im.test(content) || /\{\{[^}]+\}\}/.test(content)) issues.push(`${label}仍含未填写占位内容。`);
  const visible = content.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!/^#\s+\S/m.test(visible)) issues.push(`${label}缺少文档标题。`);
  if (!visible.split(/\r?\n/).filter(line => !/^\s*(?:#|>|[-*]\s*$|$)/.test(line)).join('\n').trim()) issues.push(`${label}缺少实际正文。`);
  for (const section of visible.split(/^##\s+/m).slice(1)) {
    const lines = section.split(/\r?\n/); const title = lines.shift() ?? '';
    if (!lines.some(line => line.trim() && !/^\s*#/.test(line))) issues.push(`${label}的“${title.trim()}”章节为空。`);
  }
  return issues;
}
async function prepareArtifact(root: string, record: WorkRecord, input: ArtifactInput) {
  const role = roleOf(input.type);
  if (levelOf(input.type) !== record.level) fail('ARTIFACT_CONFLICT', '产物模板层级与工作不一致。');
  if (input.scope && !sameScope(input.scope, record.scope)) fail('ARTIFACT_CONFLICT', '补充产物不能改变已有工作范围。');
  const source = input.source ?? { repository: '.', path: `${pathsFor(record.id).directory}/${role}.md` };
  const artifact: WorkArtifact = { type: input.type, source, origin: input.source ? 'reference' : 'generated', status: 'draft', ...(input.requirementsBasis ? { requirementsBasis: input.requirementsBasis } : {}) };
  validateArtifact(artifact, record.id, role, record.level);
  if (!record.scope.repositories.includes(source.repository)) fail('INVALID_WORK_SCOPE', '产物引用超出工作仓库范围。');
  const other = record.artifacts[role === 'design' ? 'requirements' : 'design'];
  if (other && sameRef(source, other.source)) fail('ARTIFACT_CONFLICT', '需求与设计不能引用同一文件。');
  if (role === 'design') await requireRequirements(root, input.requirementsBasis, record.scope, record.artifacts.requirements?.source);
  const previous = record.artifacts[role];
  const content = await readWorkReference(root, source);
  if (previous) {
    if (previous.type !== artifact.type || !sameRef(previous.source, source) || JSON.stringify(previous.requirementsBasis) !== JSON.stringify(artifact.requirementsBasis)) fail('ARTIFACT_CONFLICT', '产物已登记不同类型、位置或依据；更新设计依据请使用 work bind。');
    if (content === null) fail('ARTIFACT_MISSING', '已登记产物不存在，不能用重复 add 覆盖或修复。');
    return { role, artifact: previous, changes: [] as FileChange[], changed: false, content };
  }
  if (input.source) {
    if (content === null || !content.trim()) fail('ARTIFACT_MISSING', '引用的共享产物不存在或为空。');
    return { role, artifact, changes: [] as FileChange[], changed: true, content };
  }
  if (content !== null) fail('ARTIFACT_CONFLICT', '目标文件已经存在，请明确引用，不覆盖正文。');
  const templateContent = await readFile(new URL(`../resources/templates/${input.type}.md`, import.meta.url), 'utf8');
  return { role, artifact, changes: [{ path: source.path, before: null, after: templateContent.replaceAll('{{title}}', record.title) }], changed: true, content: null };
}
export async function workReferenceLink(root: string, id: string, reference: FileRef): Promise<string> {
  const repositoryRoot = await resolveRepositoryRoot(root, reference.repository, id);
  return relative(resolve(root, pathsFor(id).directory), resolve(repositoryRoot, reference.path)).split(sep).join('/');
}
async function notesContent(root: string, record: WorkRecord): Promise<string> {
  const links = (await Promise.all(Object.entries(record.artifacts).map(async ([role, artifact]) =>
    `- [${role}](<${await workReferenceLink(root, record.id, artifact.source)}>)`))).join('\n');
  return `# ${record.title}\n\n## 目标与授权\n\n建立文档工作；登记或草稿不代表内容已确认或获准实现。按实际用户授权补充范围。\n\n## 依据与产物\n\n- [项目规则索引](../../rules/index.md)\n${links}\n\n## 进展\n\n已建立工作入口。登记保存在 record.json；逐步补充需求与设计，保留实际用户决定。\n\n## 下一步\n\n读取项目依据并补充必要信息，完成后记录针对实际产物的独立评审证据。\n`;
}
// Preconditions must run before opening the transaction: project readers reject pending journals.
async function saveChanges(root: string, changes: FileChange[], verify: () => Promise<void>) {
  await verify();
  await applyChanges(root, changes);
}
export async function createWork(rootInput: string, id: string, title: string, typeInput: unknown = 'product-requirements', requirementsBasis?: RequirementsBasis) {
  validateWorkId(id);
  if (!title.trim() || title.length > 200 || /[\r\n\x00-\x1f]/.test(title)) fail('INVALID_TITLE', '标题须为 1–200 字符的单行文本。');
  const input = parseArtifactInput(typeInput, requirementsBasis); const root = await resolveWorkRoot(rootInput, id);
  await requireReadyProject(root);
  return withProjectLock(root, async () => {
    await requireReadyProject(root); const paths = pathsFor(id);
    try {
      await lstat(await assertSafePath(root, paths.directory));
      fail('WORK_EXISTS', '工作目录已经存在；请使用 work inspect 检查，并用其他标识新建工作引用所需资料。');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await assertSharedPaths(root, [paths.record, paths.notes]);
    for (const path of [paths.record, paths.notes]) if (await readTextIfExists(root, path) !== null) fail('WORK_EXISTS', `工作已经存在：${path}；请使用 resume 或 inspect 接续。`);
    const scope = input.scope ?? (roleOf(input.type) === 'design' ? (await requireRequirements(root, input.requirementsBasis)).scope : { repositories: ['.'], targets: [id] });
    await validateScopeRepositories(root, scope);
    const record: WorkRecord = { schemaVersion: 3, id, title: title.trim(), createdAt: new Date().toISOString(), level: levelOf(input.type), scope, artifacts: {} };
    const prepared = await prepareArtifact(root, record, input); record.artifacts[prepared.role] = prepared.artifact;
    await saveChanges(root, [...prepared.changes, { path: paths.notes, before: null, after: await notesContent(root, record) }, { path: paths.record, before: null, after: JSON.stringify(record, null, 2) + '\n' }], async () => {
      if (roleOf(input.type) === 'design') await requireRequirements(root, input.requirementsBasis, scope);
      if (input.source && await readWorkReference(root, input.source) !== prepared.content) fail('CONTENT_CHANGED', '引用产物在写入前发生变化。');
    });
    return { root, id, status: 'draft', document: prepared.artifact.source.path, source: prepared.artifact.source, notes: paths.notes, scope, changed: true, automaticTransition: false };
  });
}
export async function addWork(rootInput: string, id: string, inputValue: unknown, requirementsBasis?: RequirementsBasis) {
  const root = await resolveWorkRoot(rootInput, id); const input = parseArtifactInput(inputValue, requirementsBasis); await requireReadyProject(root);
  return withProjectLock(root, async () => {
    const data = await loadWorkRecord(root, id, true); const record = data.record as WorkRecord;
    if (data.notes === null) fail('WORK_NOT_READY', '工作入口 work.md 不存在。');
    await validateScopeRepositories(root, record.scope);
    const prepared = await prepareArtifact(root, record, input);
    if (!prepared.changed) return { root, id, artifact: prepared.role, source: prepared.artifact.source, changed: false, automaticTransition: false };
    record.artifacts[prepared.role] = prepared.artifact;
    await saveChanges(root, [...prepared.changes, { path: data.paths.record, before: data.original, after: JSON.stringify(record, null, 2) + '\n' }], async () => {
      if (prepared.role === 'design') await requireRequirements(root, input.requirementsBasis, record.scope, record.artifacts.requirements?.source);
      if (input.source && await readWorkReference(root, input.source) !== prepared.content) fail('CONTENT_CHANGED', '引用产物在写入前发生变化。');
      if (await readTextIfExists(root, data.paths.notes) !== data.notes) fail('CONTENT_CHANGED', '工作入口在写入前发生变化。');
    });
    return { root, id, artifact: prepared.role, source: prepared.artifact.source, changed: true, automaticTransition: false };
  });
}
export async function bindWork(rootInput: string, id: string, role: string, basis: RequirementsBasis) {
  if (role !== 'design') fail('INVALID_ARGUMENT', 'work bind 仅支持 design。');
  const root = await resolveWorkRoot(rootInput, id); basisValue(basis); await requireReadyProject(root);
  return withProjectLock(root, async () => {
    const data = await loadWorkRecord(root, id, true); const record = data.record as WorkRecord;
    const artifact = record.artifacts.design;
    if (!artifact) fail('ARTIFACT_MISSING', '工作尚未登记设计。');
    const content = await readWorkReference(root, artifact.source);
    if (content === null) fail('ARTIFACT_MISSING', '已登记设计文件不存在。');
    await requireRequirements(root, basis, record.scope, record.artifacts.requirements?.source);
    if (JSON.stringify(artifact.requirementsBasis) === JSON.stringify(basis)) return { root, id, artifact: role, changed: false, automaticTransition: false };
    artifact.requirementsBasisHistory = [...(artifact.requirementsBasisHistory ?? []), { at: new Date().toISOString(), ...(artifact.requirementsBasis ? { before: artifact.requirementsBasis } : {}), after: basis }];
    artifact.requirementsBasis = basis;
    if (artifact.completion) { artifact.completionHistory = [...(artifact.completionHistory ?? []), artifact.completion]; delete artifact.completion; }
    artifact.status = 'draft';
    await saveChanges(root, [{ path: data.paths.record, before: data.original, after: JSON.stringify(record, null, 2) + '\n' }], async () => {
      await requireRequirements(root, basis, record.scope, record.artifacts.requirements?.source);
      if (await readWorkReference(root, artifact.source) !== content) fail('CONTENT_CHANGED', '设计内容在绑定前发生变化。');
    });
    return { root, id, artifact: role, requirementsBasis: basis, changed: true, automaticTransition: false };
  });
}
async function assertAcceptanceScope(root: string, record: WorkRecord, artifact: WorkArtifact, requestId: string): Promise<void> {
  const latestBinding = artifact.requirementsBasisHistory?.at(-1);
  const text = await readTextIfExists(root, `.tiller/work/${record.id}/confirmations.json`);
  const registry = JSON.parse(text ?? '{}') as { requests?: { requestId: string; createdAt: string; scope: WorkScope }[] };
  const request = registry.requests?.find(item => item.requestId === requestId);
  if (!request || !record.scope.repositories.every(repo => request.scope.repositories.includes(repo)) || !record.scope.targets.every(target => request.scope.targets.includes(target))) fail('ACCEPTANCE_REQUIRED', '验收请求范围不能覆盖当前工作范围。');
  if (latestBinding && request.createdAt < latestBinding.at) fail('ACCEPTANCE_REQUIRED', '设计需求依据已重新绑定，请取得绑定之后针对当前交付的新验收；旧验收保留为历史。');
}
async function evaluateArtifact(root: string, record: WorkRecord, artifact: WorkArtifact) {
  const issues: string[] = []; let document: string | null = null; let stale = false; let acceptanceStatus = 'not-recorded';
  try { document = await readWorkReference(root, artifact.source); } catch (error) { issues.push((error as Error).message); }
  issues.push(...contentIssues(document, roleOf(artifact.type)));
  if (roleOf(artifact.type) === 'design') {
    try { await requireRequirements(root, artifact.requirementsBasis, record.scope, record.artifacts.requirements?.source); }
    catch (error) { issues.push((error as Error).message); stale = true; }
  }
  const previous = artifact.completion;
  if (artifact.status === 'complete' && previous) {
    let evidence: string | null = null;
    try { evidence = await readWorkReference(root, { repository: '.', path: previous.evidence }); } catch (error) { issues.push((error as Error).message); }
    stale ||= document === null || hash(document) !== previous.documentHash || evidence === null || hash(evidence) !== previous.evidenceHash;
    if (stale) issues.push('产物或验收依据已变化，原完成结论失效；需重新评审。');
    issues.push(...contentIssues(evidence, '验收依据'));
    if (previous.confirmation) {
      try {
        const current = await assertAcceptance(root, record.id, previous.confirmation.requestId, artifact.source, previous.evidence);
        await assertAcceptanceScope(root, record, artifact, previous.confirmation.requestId);
        if (JSON.stringify(current) !== JSON.stringify(previous.confirmation)) throw new Error('人工验收决定已变化，需要重新核对交付。');
        acceptanceStatus = 'reported-review';
      } catch (error) { stale = true; acceptanceStatus = 'needs-review'; issues.push((error as Error).message); }
    }
  }
  return { ...artifact, document: artifact.source.path, content: document, status: stale ? 'stale' : artifact.status, ready: issues.length === 0, issues, acceptanceStatus,
    completionKind: 'human-review-record' };
}
export async function resumeWork(rootInput: string, id: string) {
  const root = await resolveWorkRoot(rootInput, id); const data = await loadWorkRecord(root, id); const record = data.record;
  const artifacts: Partial<Record<ArtifactRole, Awaited<ReturnType<typeof evaluateArtifact>>>> = {};
  for (const role of roles) if (record.artifacts[role]) artifacts[role] = await evaluateArtifact(root, record, record.artifacts[role]);
  const values = Object.values(artifacts); const only = values.length === 1 ? values[0] : undefined;
  const issues = [...contentIssues(data.notes, '工作说明'), ...values.flatMap(item => item.issues)];
  let confirmations: Awaited<ReturnType<typeof inspectConfirmations>> | { issues: string[] };
  try { confirmations = await inspectConfirmations(root, id); } catch (error) { confirmations = { issues: [(error as Error).message] }; issues.push((error as Error).message); }
  return { root, id, title: record.title, schemaVersion: data.record.schemaVersion, level: record.level, scope: record.scope, artifacts,
    type: only?.type, document: only?.document, content: only?.content, notes: data.notes,
    status: only?.status ?? (values.some(item => item.status === 'stale') ? 'stale' : 'active'), ready: issues.length === 0, issues,
    acceptanceStatus: only?.acceptanceStatus ?? 'per-artifact', completionKind: only?.completionKind ?? 'per-artifact', confirmations,
    sourceVerification: 'not-independently-verified', automaticTransition: false,
    limitation: '只读接续；结构检查不代表内容已确认，单个产物完成不代表整项开发、验收或发布获准。' };
}
export async function checkWork(rootInput: string, id: string) {
  // History inspection imports the shared schema parser; defer this import to avoid initialization cycles.
  const { inspectWork } = await import('./work-history.js');
  const inspection = await inspectWork(rootInput, id);
  if (!inspection.ready) return { ...inspection, id, registration: inspection.works[0]?.registration,
    limitation: '结构检查未通过；请新建当前格式工作引用所需资料，未知确认不代表批准。' };
  const result = await resumeWork(rootInput, id);
  return { ...result, inspection, content: undefined, notes: undefined };
}
export async function completeWork(rootInput: string, id: string, evidenceInput: string, acceptanceRequest?: string, roleInput?: string) {
  const root = await resolveWorkRoot(rootInput, id); const evidenceLocation = evidencePath(evidenceInput); await requireReadyProject(root);
  return withProjectLock(root, async () => {
    const data = await loadWorkRecord(root, id, true); const record = data.record as WorkRecord;
    const available = Object.keys(record.artifacts);
    if (roleInput === undefined && available.length !== 1) fail('ARTIFACT_REQUIRED', '存在多个产物，请用 --artifact 明确 requirements 或 design。');
    const role = (roleInput ?? available[0]) as ArtifactRole;
    if (!roles.includes(role) || !record.artifacts[role]) fail('ARTIFACT_MISSING', '指定产物尚未登记。');
    const artifact = record.artifacts[role];
    if (sameRef(artifact.source, { repository: '.', path: evidenceLocation }) || evidenceLocation.toLowerCase() === data.paths.notes.toLowerCase()) fail('INVALID_EVIDENCE', '请提供独立评审依据，而不是产物或工作入口本身。');
    const document = await readWorkReference(root, artifact.source); const evidence = await readWorkReference(root, { repository: '.', path: evidenceLocation });
    const issues = [...contentIssues(document, '草稿'), ...contentIssues(data.notes, '工作说明'), ...contentIssues(evidence, '验收依据')];
    if (issues.length || document === null || evidence === null) fail('WORK_NOT_READY', issues.join('\n'));
    if (!acceptanceRequest) fail('ACCEPTANCE_REQUIRED', '完成产物需要 --acceptance 对应有效人工验收；技术检查不能代替用户验收。');
    if (role === 'design') await requireRequirements(root, artifact.requirementsBasis, record.scope, record.artifacts.requirements?.source);
    const confirmation = await assertAcceptance(root, id, acceptanceRequest, artifact.source, evidenceLocation);
    await assertAcceptanceScope(root, record, artifact, acceptanceRequest);
    const completion = { documentHash: hash(document), evidence: evidenceLocation, evidenceHash: hash(evidence), at: new Date().toISOString(), confirmation };
    const previous = artifact.completion;
    if (previous && previous.documentHash === completion.documentHash && previous.evidence === completion.evidence && previous.evidenceHash === completion.evidenceHash && JSON.stringify(previous.confirmation) === JSON.stringify(confirmation)) return { root, id, artifact: role, status: 'complete', evidence: evidenceLocation, confirmation, changed: false, automaticTransition: false };
    artifact.completionHistory = [...(artifact.completionHistory ?? []), ...(previous ? [previous] : [])]; artifact.completion = completion; artifact.status = 'complete';
    await saveChanges(root, [{ path: data.paths.record, before: data.original, after: JSON.stringify(record, null, 2) + '\n' }], async () => {
      if (await readWorkReference(root, artifact.source) !== document || await readWorkReference(root, { repository: '.', path: evidenceLocation }) !== evidence || await readTextIfExists(root, data.paths.notes) !== data.notes) fail('CONTENT_CHANGED', '核对期间内容发生变化。');
      if (role === 'design') await requireRequirements(root, artifact.requirementsBasis, record.scope, record.artifacts.requirements?.source);
      const rechecked = await assertAcceptance(root, id, acceptanceRequest, artifact.source, evidenceLocation);
      await assertAcceptanceScope(root, record, artifact, acceptanceRequest);
      if (JSON.stringify(rechecked) !== JSON.stringify(confirmation)) fail('CONTENT_CHANGED', '验收依据在写入前发生变化。');
    });
    return { root, id, artifact: role, status: 'complete', evidence: evidenceLocation, confirmation, changed: true, sourceVerification: 'not-independently-verified', automaticTransition: false,
      limitation: '已保存指定文档产物的人工验收关联；不代表全部工作交付、需求或设计批准或发布许可。' };
  });
}
