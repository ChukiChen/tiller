import type { ProjectMetadata, RepositoryRecord } from './types.js';
import { normalizeVerifyConfig } from './test-output.js';

type RepositoryMetadata = Pick<ProjectMetadata, 'mode' | 'repositories' | 'resourceVersion'>;
const SUPPORTED_RESOURCE_VERSIONS = ['0.4.0', '0.5.0'] as const;

function invalidMapping(message = '仓库路径映射缺失或无效；必须逐一登记标识对应的直接目录或 repositories/<标识>。'): never {
  throw new Error(message);
}

function readLegacyRecords(ids: string[], repositoryPaths: unknown): RepositoryRecord[] {
  if (repositoryPaths === undefined) {
    if (ids.length === 0) return [];
    invalidMapping();
  }
  if (!repositoryPaths || typeof repositoryPaths !== 'object' || Array.isArray(repositoryPaths)) invalidMapping();
  const mappings = repositoryPaths as Record<string, unknown>;
  if (Object.keys(mappings).length !== ids.length) invalidMapping();
  return ids.map(id => {
    const relative = mappings[id];
    if (typeof relative !== 'string') invalidMapping();
    return { id, path: relative };
  });
}

function readObjectRecord(item: Record<string, unknown>): RepositoryRecord {
  const unknown = Object.keys(item).filter(key => key !== 'id' && key !== 'path' && key !== 'verify');
  if (unknown.length) throw new Error(`仓库记录含未知字段：${unknown.join('、')}。`);
  if (typeof item.id !== 'string' || typeof item.path !== 'string') throw new Error('工程仓库清单格式无效。');
  const verify = item.verify === undefined ? undefined : normalizeVerifyConfig(item.verify, `仓库 ${item.id}`);
  return { id: item.id, path: item.path, ...(verify ? { verify } : {}) };
}

/** Accept the object list, or the historical string list plus `repositoryPaths`. */
export function readRepositoryRecords(input: { repositories: unknown; repositoryPaths?: unknown }): RepositoryRecord[] {
  if (!Array.isArray(input.repositories)) throw new Error('工程仓库清单格式无效。');
  const items = input.repositories;
  if (items.length === 0 || items.every(item => typeof item === 'string')) {
    return readLegacyRecords(items as string[], input.repositoryPaths);
  }
  if (!items.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    throw new Error('工程仓库清单格式无效。');
  }
  if (input.repositoryPaths !== undefined) throw new Error('仓库对象清单不能同时携带 repositoryPaths。');
  return items.map(item => readObjectRecord(item as Record<string, unknown>));
}

/** Pure validation: usable while resolving delivery locations without loading the project again. */
export function validateRepositoryMappings(metadata: RepositoryMetadata): void {
  if (!SUPPORTED_RESOURCE_VERSIONS.includes(metadata.resourceVersion as typeof SUPPORTED_RESOURCE_VERSIONS[number])) {
    throw new Error('工程资源版本不受支持，不能解析仓库映射。');
  }
  if (!Array.isArray(metadata.repositories)) throw new Error('工程仓库清单格式无效。');
  for (const repository of metadata.repositories) {
    if (!repository || typeof repository !== 'object' || Array.isArray(repository)) throw new Error('工程仓库清单格式无效。');
    const unknown = Object.keys(repository).filter(key => key !== 'id' && key !== 'path' && key !== 'verify');
    if (unknown.length) throw new Error(`仓库记录含未知字段：${unknown.join('、')}。`);
    const id = repository.id;
    if (typeof id !== 'string' || !id || /[\\/\x00-\x1f<>:"|?*]/u.test(id) ||
        id === '.' || id === '..' || /[. ]$/u.test(id) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(id) ||
        ['.git', '.tiller', 'repositories', '__proto__', 'constructor', 'prototype'].includes(id.toLowerCase())) {
      throw new Error(`不安全或保留的仓库标识：${id}`);
    }
    if (repository.path !== id && repository.path !== `repositories/${id}`) {
      invalidMapping();
    }
    if (repository.verify !== undefined) normalizeVerifyConfig(repository.verify, `仓库 ${id}`);
  }
  if (new Set(metadata.repositories.map(repository => repository.id.toLowerCase())).size !== metadata.repositories.length ||
      !['project', 'workspace'].includes(metadata.mode) ||
      (metadata.mode === 'project' && metadata.repositories.length > 0) ||
      (metadata.mode === 'workspace' && metadata.repositories.length === 0)) throw new Error('工程模式与仓库范围不一致。');
}

export function repositoryPath(metadata: RepositoryMetadata, id: string): string {
  validateRepositoryMappings(metadata);
  if (id === '.') return '.';
  const repository = metadata.repositories.find(item => item.id === id);
  if (!repository) throw new Error(`仓库未登记：${id}`);
  return repository.path;
}
