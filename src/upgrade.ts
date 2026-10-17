import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ENTRY_START, ENTRY_END, IGNORE_START, IGNORE_END, META, RESOURCE_VERSION, SHARED_RESOURCES,
  assertSharedPaths, buildIndexSection, equivalentManagedContent, inspectProject, matchesManagedDigest, parseMetadata, repositoryIgnorePatterns, sha256, trackedContent,
} from './core.js';
import { applyChanges, hasPendingTransaction, readTextIfExists, withProjectLock } from './files.js';
import type { FileChange, ProjectInspection } from './types.js';

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
  '升级仅更新当前管理根目录的受管入口和规则，不修改业务仓库、项目资料、自定义规则或历史工作。',
  '历史完成记录不转成人工批准；进行中工作缺少确认来源时需要重新核对。',
  '工作记录不随规则升级迁移；历史资料先用 work inspect 检查，再按明确映射使用 work adopt 接入。',
  '规则约束依赖宿主遵守；CLI 检查不能认证决定者身份或阻止绕过 CLI 直接写入。',
];

/** Read-only preview; the digest binds both changes and unchanged managed inputs. */
export async function planUpgrade(root: string): Promise<UpgradePlan> {
  const absoluteRoot = path.resolve(root);
  const metadataText = await readTextIfExists(absoluteRoot, META);
  if (metadataText === null) throw new Error('工程尚未初始化，不能升级。');
  const metadata = parseMetadata(metadataText);
  if (await hasPendingTransaction(absoluteRoot)) throw new Error('存在未完成事务，请先执行 tiller recover。');
  const inspection = await inspectProject(absoluteRoot);
  const conflicts = [...inspection.issues];
  const changes: FileChange[] = [];
  const inputs: Record<string, string | null> = { [META]: metadataText };
  for (const relative of [...new Set([...Object.keys(metadata.managedFiles), ...SHARED_RESOURCES.map(resource => `.tiller/${resource}`)])].sort()) {
    inputs[relative] = await readTextIfExists(absoluteRoot, relative);
  }
  const agents = inputs['AGENTS.md'];
  if (agents) {
    let outside = agents;
    try { outside = agents.replace(trackedContent('AGENTS.md', agents), ''); } catch { /* Reported by inspection. */ }
    if (/不要求[^\n。]*(逐阶段审批|人工审批)|已有授权无需逐阶段重复确认/u.test(outside)) {
      conflicts.push('AGENTS.md 受管区段外仍有旧的宽松审批表述；请先协调该项目约定，升级不会覆盖区段外内容。');
    }
  }
  if (metadata.resourceVersion !== RESOURCE_VERSION) {
    const baseline = JSON.parse(await readFile(new URL(`../resources/baselines/${metadata.resourceVersion}.json`, import.meta.url), 'utf8')) as {
      resourceVersion: string; files: Record<string, string>;
    };
    if (!baseline || baseline.resourceVersion !== metadata.resourceVersion || !baseline.files ||
        typeof baseline.files !== 'object' || Array.isArray(baseline.files) ||
        Object.keys(baseline.files).length !== Object.keys(metadata.managedFiles).length - 1 ||
        Object.keys(metadata.managedFiles).filter(relative => relative !== '.gitignore')
          .some(relative => typeof baseline.files[relative] !== 'string')) {
      throw new Error('分发的旧资源基线无效。');
    }
    const oldFiles = { ...baseline.files };
    oldFiles['.gitignore'] = `${IGNORE_START}\n${['/.tiller/local/', ...repositoryIgnorePatterns(metadata)].join('\n')}\n${IGNORE_END}`;
    if (metadata.mode === 'workspace') {
      oldFiles['.tiller/index.md'] = oldFiles['.tiller/index.md']!.replace('管理方式：当前工程。', '管理方式：独立管理工程。');
    }
    const newFiles: Record<string, string> = { ...oldFiles };
    for (const resource of SHARED_RESOURCES) {
      newFiles[`.tiller/${resource}`] = await readFile(new URL(`../resources/${resource}`, import.meta.url), 'utf8');
    }
    newFiles['.tiller/index.md'] = buildIndexSection(metadata.mode);
    try { await assertSharedPaths(absoluteRoot, Object.keys(newFiles)); }
    catch (error) { conflicts.push((error as Error).message); }
    const entry = await readFile(new URL('../resources/entry.md', import.meta.url), 'utf8');
    newFiles['AGENTS.md'] = `${ENTRY_START}\n${entry.trimEnd()}\n${ENTRY_END}`;
    const managedFiles: Record<string, string> = {};
    for (const relative of Object.keys(newFiles).sort()) {
      const before = inputs[relative] ?? null;
      const oldContent = oldFiles[relative];
      const newContent = newFiles[relative];
      if (!Object.hasOwn(metadata.managedFiles, relative)) {
        if (typeof newContent !== 'string' || !newContent.trim()) throw new Error(`分发共享资源为空：${relative}`);
        if (before !== null && !equivalentManagedContent(relative, before, newContent)) {
          conflicts.push(`新增受管文件与已有内容冲突，保留原文：${relative}`);
          continue;
        }
        if (before === null) changes.push({ path: relative, before, after: newContent });
        managedFiles[relative] = sha256(newContent);
        continue;
      }
      if (typeof oldContent !== 'string' || typeof newContent !== 'string' || !newContent.trim() ||
          !matchesManagedDigest(relative, oldContent, metadata.managedFiles[relative]!)) {
        conflicts.push(`不能验证旧资源基线，保留原文：${relative}`);
        continue;
      }
      if (before === null) continue;
      let current: string;
      try { current = trackedContent(relative, before); } catch { continue; }
      if (!equivalentManagedContent(relative, current, oldContent)) {
        conflicts.push(`受管内容含用户修改，保留原文并等待协调：${relative}`);
        continue;
      }
      const after = before.replace(current, () => newContent);
      if (before !== after) changes.push({ path: relative, before, after });
      managedFiles[relative] = sha256(newContent);
    }
    if (conflicts.length === 0) {
      changes.push({ path: META, before: metadataText, after: `${JSON.stringify({
        ...metadata, resourceVersion: RESOURCE_VERSION, managedFiles,
        repositoryPaths: metadata.repositoryPaths ?? Object.fromEntries(metadata.repositories.map(id => [id, id])),
      }, null, 2)}\n` });
    }
  }
  const plan = {
    root: absoluteRoot, sourceVersion: metadata.resourceVersion, targetVersion: RESOURCE_VERSION,
    ready: conflicts.length === 0, changes, conflicts: [...new Set(conflicts)], warnings: [...LIMITATIONS],
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
