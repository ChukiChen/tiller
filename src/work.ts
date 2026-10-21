import { relative, resolve, sep } from 'node:path';
import { resolveRepositoryRoot } from './delivery-location.js';
import { repositoryPath } from './repository-paths.js';
import { readProjectMetadata } from './core.js';
import { readTextIfExists, validateRelativePath, assertSafePaths } from './files.js';
import { parseWorkflowWorkRecord, loadWorkflowSnapshot, resumeWorkflowWork, readWorkRecordText, WORKFLOW_WORK_LIMITS } from './workflow-work.js';
import type { WorkflowWorkRecord } from './workflow-work.js';

export const templateTypes = ['product-requirements', 'product-design', 'module-requirements', 'module-design', 'change-requirements', 'change-design'] as const;
export type TemplateType = typeof templateTypes[number];
export interface FileRef { repository: string; path: string }
export interface WorkScope { repositories: string[]; targets: string[] }
export type WorkRecord = WorkflowWorkRecord;
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
function pathsFor(id: string) { validateWorkId(id); const directory = `.tiller/work/${id}`; return { directory, record: `${directory}/record.json`, notes: `${directory}/work.md` }; }
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
export function parseWorkRecord(text: string, id: string): WorkRecord {
  validateWorkId(id);
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > WORKFLOW_WORK_LIMITS.recordBytes) fail('INVALID_WORK_RECORD', '工作记录超过 1 MiB 大小限制。');
  let raw: unknown; try { raw = JSON.parse(text); } catch { fail('INVALID_WORK_RECORD', '工作记录不是有效 JSON。'); }
  const value = object(raw, '工作记录');
  if (value.schemaVersion !== 4) fail('UNSUPPORTED_RECORD_VERSION', '工作记录版本 ' + String(value.schemaVersion) + ' 不受支持；仅支持当前版本 4。原文件保留，不迁移或继承批准。');
  return parseWorkflowWorkRecord(value, id);
}
export async function readWorkReference(root: string, reference: FileRef): Promise<string | null> {
  validateWorkReference(reference);
  const metadata = await readProjectMetadata(root);
  if (reference.repository !== '.' && !metadata.repositories.includes(reference.repository)) fail('INVALID_WORK_REFERENCE', `仓库未登记：${reference.repository}`);
  const location = reference.path.toLowerCase();
  const boundaries = metadata.repositories.map(repository => repositoryPath(metadata, repository).toLowerCase());
  if (metadata.mode === 'workspace') boundaries.push('repositories');
  if (reference.repository === '.' && boundaries.some(boundary => location === boundary || location.startsWith(`${boundary}/`))) fail('INVALID_WORK_REFERENCE', '业务仓库文档须使用已登记仓库身份。');
  const repositoryRoot = await resolveRepositoryRoot(root, reference.repository);
  await assertSafePaths(repositoryRoot, [reference.path]);
  return readTextIfExists(repositoryRoot, reference.path);
}
export async function loadWorkRecord(root: string, id: string) {
  const paths = pathsFor(id); const metadata = await readProjectMetadata(root);
  const original = await readWorkRecordText(root, id);
  if (original === null) fail('WORK_NOT_FOUND', `工作 ${id} 尚未登记；请用 work inspect 检查缺口，并用 work create 新建工作引用所需资料。`);
  const record = parseWorkRecord(original, id);
  if (record.scope.repositories.some(repo => repo !== '.' && !metadata.repositories.includes(repo))) fail('INVALID_WORK_SCOPE', '工作范围含未登记仓库。');
  await loadWorkflowSnapshot(root, record);
  return { record, original, paths, notes: await readTextIfExists(root, paths.notes) };
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
export async function workReferenceLink(root: string, id: string, reference: FileRef): Promise<string> {
  const repositoryRoot = await resolveRepositoryRoot(root, reference.repository, id);
  return relative(resolve(root, pathsFor(id).directory), resolve(repositoryRoot, reference.path)).split(sep).join('/');
}
export async function resumeWork(rootInput: string, id: string) {
  return resumeWorkflowWork(rootInput, id);
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
