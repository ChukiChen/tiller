import type { InitBaseline, ProjectMetadata, ProjectPlatform } from './types.js';
import { readRepositoryRecords, validateRepositoryMappings } from './repository-paths.js';
import { normalizeVerifyConfig } from './test-output.js';

export const SCHEMA_VERSION = 1;
export const RESOURCE_VERSION = '0.5.0';
export const SUPPORTED_RESOURCE_VERSIONS = ['0.4.0', '0.5.0'] as const;
export const META = '.tiller/project.json';
export const GITHUB_TEMPLATE = '.github/pull_request_template.md';
export const GITLAB_TEMPLATE = '.gitlab/merge_request_templates/Default.md';
export const PR_TEMPLATE = GITHUB_TEMPLATE;
export const RULES = [
  'rules/index.md', 'rules/core.md',
  'rules/activities/requirements.md', 'rules/activities/design.md',
  'rules/activities/implementation.md', 'rules/activities/delivery.md',
  'rules/quality/documents.md', 'rules/quality/code.md', 'rules/quality/verification.md',
] as const;
export const SHARED_RESOURCES = [...RULES, 'usage.md', 'run.cjs'] as const;
export const PREVIOUS_MANAGED = ['AGENTS.md', '.gitignore', '.tiller/index.md', ...SHARED_RESOURCES.map(name => `.tiller/${name}`)];
export const PLATFORM_TEMPLATES: Record<ProjectPlatform, readonly string[]> = {
  github: [GITHUB_TEMPLATE],
  gitlab: [GITLAB_TEMPLATE],
  both: [GITHUB_TEMPLATE, GITLAB_TEMPLATE],
};
export const REQUIRED_MANAGED = [...PREVIOUS_MANAGED, GITHUB_TEMPLATE];

export function normalizePlatform(value: unknown): ProjectPlatform {
  if (value === undefined) return 'github';
  if (value === 'github' || value === 'gitlab' || value === 'both') return value;
  throw new Error('工程平台必须为 github、gitlab 或 both。');
}

export function templatePathsForPlatform(platform: ProjectPlatform = 'github'): string[] {
  return [...PLATFORM_TEMPLATES[platform]];
}

export function managedFilesForPlatform(platform: ProjectPlatform = 'github'): string[] {
  return [...PREVIOUS_MANAGED, ...templatePathsForPlatform(platform)];
}

export function parseMetadata(text: string): ProjectMetadata {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('工程元信息不是有效 JSON。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工程元信息格式无效。');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== SCHEMA_VERSION || !SUPPORTED_RESOURCE_VERSIONS.includes(data.resourceVersion as typeof SUPPORTED_RESOURCE_VERSIONS[number])) {
    throw new Error('工程格式或资源版本不受支持；仅支持当前契约，原有资料保持不变。');
  }
  if (data.mode !== 'project' && data.mode !== 'workspace') throw new Error('工程管理方式无效。');
  const platform = normalizePlatform(data.platform);
  if (data.verify !== undefined) normalizeVerifyConfig(data.verify, '工程');
  if (data.initBaseline !== undefined) {
    if (!data.initBaseline || typeof data.initBaseline !== 'object' || Array.isArray(data.initBaseline)) {
      throw new Error('初始化基线标记格式无效。');
    }
    const baseline = data.initBaseline as Record<string, unknown>;
    if (typeof baseline.id !== 'string' || !/^[0-9]{8}-tiller-init$/u.test(baseline.id) ||
        typeof baseline.branch !== 'string' || !baseline.branch.trim() || baseline.branch.length > 200 ||
        typeof baseline.commit !== 'string' || !/^[a-f0-9]{7,64}$/u.test(baseline.commit) ||
        (baseline.status !== undefined && baseline.status !== 'pending' && baseline.status !== 'merged')) {
      throw new Error('初始化基线标记不完整或无效。');
    }
    data.initBaseline = {
      id: baseline.id,
      branch: baseline.branch,
      commit: baseline.commit,
      ...(baseline.status === undefined ? {} : { status: baseline.status }),
    } satisfies InitBaseline;
  }
  const repositories = readRepositoryRecords({
    repositories: data.repositories,
    repositoryPaths: (data as { repositoryPaths?: unknown }).repositoryPaths,
  });
  validateRepositoryMappings({ mode: data.mode, repositories, resourceVersion: data.resourceVersion as string });
  data.repositories = repositories;
  delete (data as { repositoryPaths?: unknown }).repositoryPaths;
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) throw new Error('工程创建时间无效。');
  if (!data.managedFiles || typeof data.managedFiles !== 'object' || Array.isArray(data.managedFiles)) {
    throw new Error('受管文件依据缺失。');
  }
  const managed = data.managedFiles as Record<string, unknown>;
  const keys = Object.keys(managed).sort();
  const sameSet = (expected: string[]) => keys.length === expected.length && expected.every((name, index) => name === keys[index]);
  const templateOptions = platform === 'both'
    ? [[], [GITHUB_TEMPLATE], [GITLAB_TEMPLATE], [GITHUB_TEMPLATE, GITLAB_TEMPLATE]]
    : [[], [platform === 'gitlab' ? GITLAB_TEMPLATE : GITHUB_TEMPLATE]];
  const acceptedSets = templateOptions.map(templates => [...PREVIOUS_MANAGED, ...templates].sort());
  if (!acceptedSets.some(sameSet) ||
      keys.some(name => typeof managed[name] !== 'string' || !/^[0-9a-f]{64}$/u.test(managed[name] as string))) {
    throw new Error('受管文件依据不完整或含不支持的文件。');
  }
  return data as unknown as ProjectMetadata;
}
