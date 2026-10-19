import type { ProjectMetadata } from './types.js';

type RepositoryMetadata = Pick<ProjectMetadata, 'mode' | 'repositories' | 'repositoryPaths' | 'resourceVersion'>;

/** Pure validation: usable while resolving delivery locations without loading the project again. */
export function validateRepositoryMappings(metadata: RepositoryMetadata): void {
  if (!['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3', '0.3.4', '0.3.5'].includes(metadata.resourceVersion)) {
    throw new Error('工程资源版本不受支持，不能解析仓库映射。');
  }
  if (!Array.isArray(metadata.repositories)) throw new Error('工程仓库清单格式无效。');
  for (const id of metadata.repositories) {
    if (typeof id !== 'string' || !id || /[\\/\x00-\x1f<>:"|?*]/u.test(id) ||
        id === '.' || id === '..' || /[. ]$/u.test(id) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(id) ||
        ['.git', '.tiller', 'repositories', '__proto__', 'constructor', 'prototype'].includes(id.toLowerCase())) {
      throw new Error(`不安全或保留的仓库标识：${id}`);
    }
  }
  if (new Set(metadata.repositories.map(id => id.toLowerCase())).size !== metadata.repositories.length ||
      !['project', 'workspace'].includes(metadata.mode) ||
      (metadata.mode === 'project' && metadata.repositories.length > 0) ||
      (metadata.mode === 'workspace' && metadata.repositories.length === 0)) throw new Error('工程模式与仓库范围不一致。');
  const mappings = metadata.repositoryPaths;
  if (mappings === undefined && ['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0'].includes(metadata.resourceVersion)) return;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings) ||
      Object.keys(mappings).length !== metadata.repositories.length ||
      metadata.repositories.some(id => !Object.hasOwn(mappings, id) ||
        (mappings[id] !== id && mappings[id] !== `repositories/${id}`))) {
    throw new Error('仓库路径映射缺失或无效；必须逐一登记标识对应的直接目录或 repositories/<标识>。');
  }
}

export function repositoryPath(metadata: RepositoryMetadata, id: string): string {
  validateRepositoryMappings(metadata);
  if (id === '.') return '.';
  if (!metadata.repositories.includes(id)) throw new Error(`仓库未登记：${id}`);
  return metadata.repositoryPaths?.[id] ?? id;
}
