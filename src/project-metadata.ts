import type { ProjectMetadata } from './types.js';
import { validateRepositoryMappings } from './repository-paths.js';

export const SCHEMA_VERSION = 1;
export const RESOURCE_VERSION = '0.5.0';
export const META = '.tiller/project.json';
export const RULES = [
  'rules/index.md', 'rules/core.md',
  'rules/activities/requirements.md', 'rules/activities/design.md',
  'rules/activities/implementation.md', 'rules/activities/delivery.md',
  'rules/quality/documents.md', 'rules/quality/verification.md',
] as const;
export const SHARED_RESOURCES = [...RULES, 'usage.md', 'run.cjs'] as const;
export const REQUIRED_MANAGED = ['AGENTS.md', '.gitignore', '.tiller/index.md', ...SHARED_RESOURCES.map(name => `.tiller/${name}`)];

export function parseMetadata(text: string): ProjectMetadata {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('工程元信息不是有效 JSON。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工程元信息格式无效。');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== SCHEMA_VERSION || data.resourceVersion !== RESOURCE_VERSION) {
    throw new Error('工程格式或资源版本不受支持；仅支持当前契约，原有资料保持不变。');
  }
  if (data.mode !== 'project' && data.mode !== 'workspace') throw new Error('工程管理方式无效。');
  if (!Array.isArray(data.repositories) || !data.repositories.every(item => typeof item === 'string')) {
    throw new Error('工程仓库清单格式无效。');
  }
  validateRepositoryMappings(data as unknown as ProjectMetadata);
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) throw new Error('工程创建时间无效。');
  if (!data.managedFiles || typeof data.managedFiles !== 'object' || Array.isArray(data.managedFiles)) {
    throw new Error('受管文件依据缺失。');
  }
  const managed = data.managedFiles as Record<string, unknown>;
  if (Object.keys(managed).length !== REQUIRED_MANAGED.length ||
      REQUIRED_MANAGED.some(name => !Object.hasOwn(managed, name) || typeof managed[name] !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(managed[name] as string))) throw new Error('受管文件依据不完整或含不支持的文件。');
  return data as unknown as ProjectMetadata;
}
