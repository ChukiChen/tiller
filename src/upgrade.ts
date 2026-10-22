import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ENTRY_END, ENTRY_START, IGNORE_END, IGNORE_START, INDEX_END, INDEX_START, META, RESOURCE_VERSION,
  SHARED_RESOURCES, buildIndexSection, inspectProject, managedDigest, managedSection, parseMetadata,
  repositoryIgnorePatterns, sha256 as coreSha256, trackedContent,
} from './core.js';
import { applyChanges, hasPendingTransaction, readTextIfExists, withProjectLock } from './files.js';
import type { FileChange, ProjectInspection, ProjectMetadata } from './types.js';

export interface UpgradePlan {
  root: string;
  planId: string;
  sourceVersion: string;
  targetVersion: string;
  ready: boolean;
  changes: FileChange[];
  conflicts: string[];
  warnings: string[];
}

const LIMITATIONS = [
  '只刷新 project.json 摘要仍一致、且用户未修改的受管文件；用户修改、缺失或冲突文件保持原样并列入冲突。',
  '不迁移业务资料、历史任务、旧确认或旧审计资料；业务文件与项目资料保持原样。',
  '规则约束依赖宿主遵守；CLI 检查不能认证决定者身份或阻止绕过 CLI 直接写入。',
];
const EOL_EQUIVALENT = new Set(['AGENTS.md', '.gitignore', '.tiller/index.md',
  ...SHARED_RESOURCES.map(resource => `.tiller/${resource}`)]);

function replaceSection(current: string, replacement: string, start: string, end: string): string {
  const section = managedSection(current, start, end);
  if (section === null) throw new Error('受管区段缺失');
  const index = current.indexOf(section);
  return `${current.slice(0, index)}${replacement}${current.slice(index + section.length)}`;
}

function differenceHint(current: string, expected: string): string {
  const left = current.split(/\r?\n/u);
  const right = expected.split(/\r?\n/u);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] === right[index]) continue;
    const clean = (value: string | undefined): string => (value ?? '（无）').slice(0, 100).replace(/[\r\n]/gu, ' ');
    return `首个差异在约第 ${index + 1} 行：当前 “${clean(left[index])}”，分发 “${clean(right[index])}”`;
  }
  return '内容存在换行或编码差异';
}

function withCurrentEol(current: string, desired: string): string {
  const desiredLf = desired.replace(/\r\n/gu, '\n');
  return current.includes('\r\n') ? desiredLf.replace(/\n/gu, '\r\n') : desiredLf;
}

async function desiredContent(metadata: ProjectMetadata, relative: string, current: string): Promise<string> {
  if (SHARED_RESOURCES.some(resource => `.tiller/${resource}` === relative)) {
    return withCurrentEol(current, await readFile(new URL(`../resources/${relative.slice('.tiller/'.length)}`, import.meta.url), 'utf8'));
  }
  if (relative === 'AGENTS.md') {
    const entry = await readFile(new URL('../resources/entry.md', import.meta.url), 'utf8');
    return replaceSection(current, withCurrentEol(current, `${ENTRY_START}\n${entry.trimEnd()}\n${ENTRY_END}`), ENTRY_START, ENTRY_END);
  }
  if (relative === '.gitignore') {
    const body = ['/.tiller/local/', ...repositoryIgnorePatterns(metadata)].join('\n');
    return replaceSection(current, withCurrentEol(current, `${IGNORE_START}\n${body}\n${IGNORE_END}`), IGNORE_START, IGNORE_END);
  }
  if (relative === '.tiller/index.md') return replaceSection(current, withCurrentEol(current, buildIndexSection(metadata.mode)), INDEX_START, INDEX_END);
  throw new Error(`未知受管文件：${relative}`);
}

function sameDigest(relative: string, tracked: string, digest: string): boolean {
  if (coreSha256(tracked) === digest) return true;
  if (!EOL_EQUIVALENT.has(relative)) return false;
  const normalized = tracked.replace(/\r\n/gu, '\n');
  return coreSha256(normalized) === digest || coreSha256(normalized.replace(/\n/gu, '\r\n')) === digest;
}

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }

/** Read-only preview; the digest binds current inputs, desired changes, conflicts and metadata. */
export async function planUpgrade(root: string): Promise<UpgradePlan> {
  const absoluteRoot = path.resolve(root);
  const metadataText = await readTextIfExists(absoluteRoot, META);
  if (metadataText === null) throw new Error('工程尚未初始化，不能升级。');
  const metadata = parseMetadata(metadataText);
  if (await hasPendingTransaction(absoluteRoot)) throw new Error('存在未完成事务，请先执行 tiller recover。');
  const inspection = await inspectProject(absoluteRoot);
  const conflicts = inspection.issues.filter(issue => !issue.startsWith('接入文件内容已变化：') && !issue.startsWith('接入文件缺失：'));
  const changes: FileChange[] = [];
  const managedFiles: Record<string, string> = {};
  const inputs: Record<string, unknown> = { metadata: metadataText };
  for (const relative of Object.keys(metadata.managedFiles)) {
    const current = await readTextIfExists(absoluteRoot, relative);
    inputs[relative] = current;
    if (current === null) {
      conflicts.push(`受管文件缺失：${relative}；升级不会凭摘要重建。`);
      continue;
    }
    let tracked: string;
    try { tracked = trackedContent(relative, current); }
    catch (error) {
      conflicts.push(`${relative} 的受管区段无效：${(error as Error).message}；升级不会覆盖。`);
      continue;
    }
    let desired = await desiredContent(metadata, relative, current);
    // A checkout may introduce only EOL differences. Keep the user's bytes when
    // the distributed content is otherwise identical instead of normalizing them.
    if (desired !== current && desired.replace(/\r\n/gu, '\n') === current.replace(/\r\n/gu, '\n')) {
      desired = current;
    }
    if (!sameDigest(relative, tracked, metadata.managedFiles[relative]!)) {
      conflicts.push(`用户修改了受管文件 ${relative}：${differenceHint(tracked, trackedContent(relative, desired))}；升级不会覆盖。`);
      continue;
    }
    inputs[`desired:${relative}`] = desired;
    const currentDigest = metadata.managedFiles[relative]!;
    managedFiles[relative] = sameDigest(relative, trackedContent(relative, desired), currentDigest)
      ? currentDigest
      : managedDigest(relative, desired);
    if (desired !== current) changes.push({ path: relative, before: current, after: desired });
  }
  const agents = inputs['AGENTS.md'];
  if (typeof agents === 'string') {
    let outside = agents;
    try { outside = agents.replace(trackedContent('AGENTS.md', agents), ''); } catch { /* Reported while checking the managed file. */ }
    if (/不要求[^\n。]*(逐阶段审批|人工审批)|已有授权无需逐阶段重复确认/u.test(outside)) {
      conflicts.push('AGENTS.md 受管区段外仍有旧的宽松审批表述；请先协调该项目约定，升级不会覆盖区段外内容。');
    }
  }
  const nextMetadata: ProjectMetadata = { ...metadata, resourceVersion: RESOURCE_VERSION, managedFiles };
  const nextMetadataText = `${JSON.stringify(nextMetadata, null, 2)}\n`;
  if (nextMetadataText !== metadataText) changes.push({ path: META, before: metadataText, after: nextMetadataText });
  const warnings = [...LIMITATIONS];
  if (metadata.resourceVersion !== RESOURCE_VERSION) {
    warnings.unshift(`将兼容资源 ${metadata.resourceVersion} 刷新到当前契约 ${RESOURCE_VERSION}；只更新受管文件及摘要，不迁移历史记录。`);
  }
  const plan = {
    root: absoluteRoot, sourceVersion: metadata.resourceVersion, targetVersion: RESOURCE_VERSION,
    ready: conflicts.length === 0, changes, conflicts: [...new Set(conflicts)], warnings,
  };
  return { ...plan, planId: sha256(JSON.stringify({ ...plan, inputs })) };
}

export async function applyUpgrade(root: string, planId: string): Promise<ProjectInspection & { changed: boolean; planId: string }> {
  if (!/^[a-f0-9]{64}$/u.test(planId)) throw new Error('升级计划标识无效；请先运行只读升级预览。');
  const initial = await planUpgrade(root);
  if (initial.planId !== planId) throw new Error('升级计划已过期；请重新预览当前内容。');
  if (!initial.ready) throw new Error(`升级存在冲突，未修改文件：\n${initial.conflicts.join('\n')}`);
  return withProjectLock(initial.root, async () => {
    const plan = await planUpgrade(initial.root);
    if (plan.planId !== planId || !plan.ready) throw new Error('取得锁后升级依据发生变化；请重新预览。');
    await applyChanges(plan.root, plan.changes, async () => {
      const result = await inspectProject(plan.root);
      const issues = result.issues.filter(issue => issue !== '存在未完成事务，请先执行 tiller recover。');
      if (issues.length || result.metadata?.resourceVersion !== RESOURCE_VERSION) {
        throw new Error(`升级复验未通过，保留恢复依据：${issues.join('\n')}`);
      }
    });
    const result = await inspectProject(plan.root);
    if (!result.ready) throw new Error(`升级后工程发生变化：${result.issues.join('\n')}`);
    return { ...result, changed: plan.changes.length > 0, planId };
  });
}
