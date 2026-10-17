import { lstat, readdir, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { assertSharedPaths, requireReadyProject, sha256 } from './core.js';
import { inspectConfirmations } from './confirmations.js';
import { applyChanges, assertSafePath, hasPendingTransaction, readTextIfExists, withProjectLock } from './files.js';
import { parseWorkRecord, readWorkReference, templateTypes, validateWorkId, validateWorkScope, workReferenceLink } from './work.js';
import type { ArtifactRole, FileRef, TemplateType, WorkArtifact, WorkRecordV2, WorkScope } from './work.js';
import type { FileChange } from './types.js';

interface WorkInspection {
  id: string;
  location: string;
  registration: 'registered' | 'unregistered' | 'legacy' | 'invalid' | 'legacy-file';
  structureIssues: string[];
  artifactIssues: string[];
  confirmations: unknown;
  ready: boolean;
}
interface AdoptionInput {
  title: string;
  level: WorkRecordV2['level'];
  scope: WorkScope;
  entry?: FileRef;
  artifacts: Partial<Record<ArtifactRole, { type: TemplateType; source: FileRef }>>;
}
export interface WorkAdoptionPlan {
  root: string;
  id: string;
  planId: string;
  ready: boolean;
  conflicts: string[];
  warnings: string[];
  changes: FileChange[];
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function json(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是对象。`);
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !allowed.includes(key))) throw new Error(`${label}含有不支持的字段。`);
  return item;
}
function fileRef(value: unknown): FileRef {
  const item = object(value, ['repository', 'path'], '文件引用');
  if (typeof item.repository !== 'string' || typeof item.path !== 'string') throw new Error('文件引用需要 repository 和 path。');
  return { repository: item.repository, path: item.path };
}
function adoptionInput(value: unknown): AdoptionInput {
  const item = object(value, ['title', 'level', 'scope', 'entry', 'artifacts'], '历史映射');
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200 || /[\r\n\x00-\x1f]/.test(item.title)
    || !['product', 'module', 'change'].includes(String(item.level))) {
    throw new Error('历史映射必须明确 title 和 level。');
  }
  const scope = validateWorkScope(item.scope);
  const artifacts: AdoptionInput['artifacts'] = {};
  const mappings = object(item.artifacts, ['requirements', 'design'], '产物映射');
  if (!Object.keys(mappings).length) throw new Error('历史接入至少需要一个明确的产物映射。');
  for (const role of ['requirements', 'design'] as const) {
    if (mappings[role] === undefined) continue;
    const artifact = object(mappings[role], ['type', 'source'], '产物映射');
    if (!templateTypes.includes(artifact.type as TemplateType) || artifact.type !== `${item.level}-${role}`) {
      throw new Error('产物类型必须与角色和文档层级一致。');
    }
    artifacts[role] = { type: artifact.type as TemplateType, source: fileRef(artifact.source) };
  }
  const result: AdoptionInput = { title: item.title, level: item.level as AdoptionInput['level'], scope, artifacts };
  if (item.entry !== undefined) result.entry = fileRef(item.entry);
  return result;
}

async function inspectOne(root: string, name: string, repositories: string[]): Promise<WorkInspection> {
  const location = `.tiller/work/${name}`;
  const result: WorkInspection = {
    id: name, location, registration: 'unregistered', structureIssues: [], artifactIssues: [],
    confirmations: { status: 'unknown', automaticTransition: false }, ready: false,
  };
  try {
    const target = await assertSafePath(root, location);
    let stat;
    try { stat = await lstat(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      result.structureIssues.push('工作目录不存在。');
      return result;
    }
    if (stat.isFile()) {
      result.registration = 'legacy-file';
      result.structureIssues.push('单文件资料尚未登记；请明确入口、产物角色及范围后预览接入。');
      return result;
    }
    if (!stat.isDirectory()) throw new Error('工作位置不是普通目录。');
    validateWorkId(name);
    const notes = await readTextIfExists(root, `${location}/work.md`);
    if (notes === null) result.structureIssues.push('缺少 work.md；README.md 不能自动替代工作入口。');
    const text = await readTextIfExists(root, `${location}/record.json`);
    if (text === null) result.structureIssues.push('缺少 record.json，当前工作未登记。');
    else {
      const record = parseWorkRecord(text, name);
      result.registration = record.schemaVersion === 1 ? 'legacy' : 'registered';
      if (record.schemaVersion === 1) {
        result.structureIssues.push('版本 1 记录可只读接续；多产物写入前需要显式迁移。');
        if (await readWorkReference(root, { repository: '.', path: record.document }) === null) {
          result.artifactIssues.push(`已登记产物不存在：${record.document}`);
        }
      } else {
        for (const repository of record.scope.repositories) {
          if (repository !== '.' && !repositories.includes(repository)) result.structureIssues.push(`工作范围包含未登记仓库：${repository}`);
        }
        for (const [role, artifact] of Object.entries(record.artifacts)) {
          try {
            if (await readWorkReference(root, artifact.source) === null) result.artifactIssues.push(`已登记 ${role} 产物不存在：${artifact.source.path}`);
          } catch (error) { result.artifactIssues.push(`${role}：${message(error)}`); }
        }
      }
    }
    if (notes !== null) {
      try {
        const confirmations = await inspectConfirmations(root, name);
        result.confirmations = { ...confirmations, status: confirmations.requests.length ? 'recorded' : 'unknown' };
      }
      catch (error) { result.confirmations = { status: 'unknown', issues: [message(error)], automaticTransition: false }; }
    }
  } catch (error) {
    result.registration = 'invalid';
    result.structureIssues.push(message(error));
  }
  result.ready = result.registration === 'registered' && !result.structureIssues.length && !result.artifactIssues.length;
  return result;
}

/** Read-only and deliberately independent of registration: no age or semantic inference. */
export async function inspectWork(rootInput: string, id?: string) {
  const root = resolve(rootInput);
  const metadata = await requireReadyProject(root, { write: false });
  const works: WorkInspection[] = [];
  if (id !== undefined) {
    validateWorkId(id);
    works.push(await inspectOne(root, id, metadata.repositories));
  } else {
    const directory = await assertSafePath(root, '.tiller/work');
    let names: string[] = [];
    try { names = await readdir(directory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const name of names.sort()) works.push(await inspectOne(root, name, metadata.repositories));
  }
  return { root, ready: works.every(work => work.ready), works, issues: works.flatMap(work => [...work.structureIssues, ...work.artifactIssues].map(issue => `${work.id}: ${issue}`)), automaticTransition: false };
}

/** Bind the complete existing target tree, including confirmation snapshots, without altering it. */
async function treeInputs(root: string, directory: string, inputs: Record<string, string | null>): Promise<void> {
  const absolute = await assertSafePath(root, directory);
  let entries;
  try { entries = await readdir(absolute, { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') { inputs[directory] = null; return; }
    throw error;
  }
  inputs[directory] = json(entries.map(entry => entry.name).sort());
  for (const entry of entries) {
    const relative = `${directory}/${entry.name}`;
    const target = await assertSafePath(root, relative);
    if (entry.isDirectory()) await treeInputs(root, relative, inputs);
    else if (entry.isFile()) inputs[relative] = sha256((await readFile(target)).toString('base64'));
    else throw new Error(`历史资料包含不支持的文件类型：${relative}`);
  }
}

export async function planWorkAdoption(rootInput: string, id: string, input: unknown, inputPath?: string): Promise<WorkAdoptionPlan> {
  const root = resolve(rootInput);
  validateWorkId(id);
  const metadata = await requireReadyProject(root);
  if (await hasPendingTransaction(root)) throw new Error('存在未完成事务，请先执行 tiller recover。');
  const mapping = adoptionInput(input);
  for (const repository of mapping.scope.repositories) {
    if (repository !== '.' && !metadata.repositories.includes(repository)) throw new Error(`范围包含未登记仓库：${repository}`);
  }
  const directory = `.tiller/work/${id}`;
  const recordPath = `${directory}/record.json`;
  const notesPath = `${directory}/work.md`;
  const inputs: Record<string, string | null> = { '.tiller/project.json': await readTextIfExists(root, '.tiller/project.json') };
  await treeInputs(root, directory, inputs);
  if (inputPath !== undefined) {
    inputs[inputPath] = await readTextIfExists(root, inputPath);
    if (inputs[inputPath] === null) throw new Error('历史映射输入文件不存在。');
    if (JSON.stringify(JSON.parse(inputs[inputPath]!)) !== JSON.stringify(input)) throw new Error('历史映射输入已变化，请重新读取。');
  }
  const conflicts: string[] = [];
  const changes: FileChange[] = [];
  const original = await readTextIfExists(root, recordPath);
  const old = original === null ? undefined : parseWorkRecord(original, id);
  if (old?.schemaVersion === 2) conflicts.push('工作已采用版本 2 登记；请使用 add 或 bind，不重复接入。');
  const notes = await readTextIfExists(root, notesPath);
  if (mapping.entry) {
    if (mapping.entry.repository !== '.' || !mapping.entry.path.startsWith('.tiller/work/')) throw new Error('历史入口必须位于管理工程 .tiller/work/ 内。');
    const relative = mapping.entry.path.slice('.tiller/work/'.length);
    if (relative.includes('/') && !relative.startsWith(`${id}/`)) throw new Error('接入已有目录必须沿用原工作标识。');
    const content = await readWorkReference(root, mapping.entry);
    if (content === null) throw new Error('指定的历史入口不存在。');
    inputs[`source:${json(mapping.entry)}`] = content;
  } else if (notes === null) throw new Error('缺少工作入口；必须明确映射原入口或历史单文件。');
  const artifacts: WorkRecordV2['artifacts'] = {};
  const sources = new Set<string>();
  for (const role of ['requirements', 'design'] as const) {
    const item = mapping.artifacts[role];
    if (!item) continue;
    const key = `${item.source.repository}/${item.source.path}`.toLowerCase();
    if (sources.has(key)) throw new Error('需求与设计不能指向同一混合文件。');
    sources.add(key);
    if (item.source.repository === '.' && (item.source.path.toLowerCase() === notesPath.toLowerCase()
      || item.source.path.toLowerCase() === mapping.entry?.path.toLowerCase())) {
      throw new Error('工作过程入口不能同时映射为需求或设计；请先人工整理独立产物。');
    }
    if (!mapping.scope.repositories.includes(item.source.repository)) throw new Error('产物仓库不在明确映射范围内。');
    const content = await readWorkReference(root, item.source);
    if (content === null || !content.trim()) throw new Error(`历史产物不存在或为空：${item.source.path}`);
    inputs[`source:${json(item.source)}`] = content;
    const artifact: WorkArtifact = { ...item, origin: 'history', status: 'draft' };
    if (old?.schemaVersion === 1 && item.source.repository === '.' && item.source.path === old.document) {
      if (item.type !== old.type) conflicts.push('迁移产物类型与旧登记不同。');
      const history = [...(old.completionHistory ?? []), ...(old.completion ? [old.completion] : [])];
      if (history.length) artifact.completionHistory = history;
    }
    artifacts[role] = artifact;
  }
  if (old?.schemaVersion === 1) {
    if (!Object.values(artifacts).some(item => item.source.repository === '.' && item.source.path === old.document && item.type === old.type)) {
      conflicts.push('迁移映射必须保留旧登记产物及类型。');
    }
    const historyPath = `${directory}/history/record-v1.json`;
    const previous = await readTextIfExists(root, historyPath);
    if (previous !== null && previous !== original) conflicts.push('共享历史副本已有不同内容，不能覆盖。');
    else changes.push({ path: historyPath, before: previous, after: original! });
  }
  const record: WorkRecordV2 = {
    schemaVersion: 2, id, title: mapping.title, createdAt: old?.createdAt ?? '<assigned-at-adoption>',
    level: mapping.level, scope: mapping.scope, artifacts,
  };
  parseWorkRecord(json(record), id);
  if (notes === null) {
    const links = await Promise.all(Object.entries(artifacts).map(async ([role, item]) => `- [${role}](<${await workReferenceLink(root, id, item.source)}>)`));
    changes.push({ path: notesPath, before: null, after: `# ${mapping.title}\n\n历史资料接入记录。原始创建时间与历史人工确认未知；接入不代表采用设计或批准实施。\n\n原入口：[历史资料](<${posix.relative(directory, mapping.entry!.path)}>)\n\n${links.join('\n')}\n` });
  }
  changes.push({ path: recordPath, before: original, after: json(record) });
  await assertSharedPaths(root, changes.map(change => change.path));
  const plan = { root, id, ready: conflicts.length === 0, conflicts, warnings: ['历史正文及确认快照保持原样；接入不是历史批准或当前设计确认。', 'createdAt 对无登记历史表示本次登记时间，不推断原始创建时间。'], changes };
  return { ...plan, planId: sha256(json({ ...plan, input, inputPath: inputPath ?? null, inputs })) };
}

export async function applyWorkAdoption(root: string, id: string, input: unknown, planId: string, inputPath?: string) {
  if (!/^[a-f0-9]{64}$/.test(planId)) throw new Error('接入计划标识无效；请先预览。');
  const initial = await planWorkAdoption(root, id, input, inputPath);
  if (initial.planId !== planId) throw new Error('接入计划已过期；请重新预览。');
  if (!initial.ready) throw new Error(`接入存在冲突：${initial.conflicts.join('；')}`);
  return withProjectLock(initial.root, async () => {
    const current = await planWorkAdoption(initial.root, id, input, inputPath);
    if (current.planId !== planId || !current.ready) throw new Error('取得锁后接入依据发生变化；请重新预览。');
    const changes = current.changes.map(change => {
      if (change.path !== `.tiller/work/${id}/record.json`) return change;
      const record = JSON.parse(change.after) as WorkRecordV2;
      if (record.createdAt === '<assigned-at-adoption>') record.createdAt = new Date().toISOString();
      parseWorkRecord(json(record), id);
      return { ...change, after: json(record) };
    });
    await applyChanges(initial.root, changes);
    return { root: initial.root, id, planId, changed: true, registration: 'registered', historicalApproval: 'unknown', automaticTransition: false };
  });
}
