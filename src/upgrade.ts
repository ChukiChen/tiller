import path from 'node:path';
import {
  META, RESOURCE_VERSION, SHARED_RESOURCES, inspectProject, parseMetadata, sha256, trackedContent,
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
  '当前契约仅提供无变更检查，不迁移历史版本或重写受管资源；业务仓库、项目资料、自定义规则和历史工作保持原样。',
  '历史任务记录只作为事实保留，不转成人工批准；继续工作时应按默认工作流重新确认当前需求、范围和验收条件。',
  '规则约束依赖宿主遵守；CLI 检查不能认证决定者身份或阻止绕过 CLI 直接写入。',
];

/** Read-only preview; the digest binds both changes and unchanged managed inputs. */
export async function planUpgrade(root: string): Promise<UpgradePlan> {
  const absoluteRoot = path.resolve(root);
  const metadataText = await readTextIfExists(absoluteRoot, META);
  if (metadataText === null) throw new Error('工程尚未初始化，不能升级。');
  const metadata = parseMetadata(metadataText);
  if (metadata.resourceVersion !== RESOURCE_VERSION) throw new Error('工程资源版本不受支持；仅检查当前契约，保留旧工程原件。');
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
