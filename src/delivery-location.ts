import { AsyncLocalStorage } from 'node:async_hooks';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { assertSafePath, readTextIfExists, validateRelativePath } from './files.js';
import { git } from './delivery-git.js';
import { repositoryPath, validateRepositoryMappings } from './repository-paths.js';
import type { ProjectMetadata } from './types.js';
import type { DeliveryLocation } from './delivery-types.js';

const activeLocation = new AsyncLocalStorage<DeliveryLocation | undefined>();
export const bindingPath = (id: string): string => `.tiller/local/delivery/${validateWorkId(id)}/binding.json`;
export function validateWorkId(id: string): string {
  if (typeof id !== 'string' || !/^(?:[0-9]{8}-)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(id) || id.length > 64 ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:-|$)/iu.test(id)) {
    throw Object.assign(new Error('工作标识须为 1–64 位小写字母、数字和单个连字符，以字母或 YYYYMMDD-日期前缀开头，不得使用设备保留名。'), { code: 'INVALID_WORK_ID' });
  }
  return id;
}

export async function samePath(left: string, right: string): Promise<boolean> {
  const canonical = async (value: string): Promise<string> => {
    const result = await realpath(value);
    return process.platform === 'win32' ? result.toLowerCase() : result;
  };
  return await canonical(left) === await canonical(right);
}

export async function gitIdentity(root: string): Promise<{ root: string; commonDir: string; gitDir: string }> {
  const parts = (await git(root, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir', '--absolute-git-dir'])).trim().split(/\r?\n/u);
  if (parts.length !== 3) throw new Error('Git 工作目录身份输出无效。');
  const [top, common, gitDir] = parts as [string, string, string];
  if (!await samePath(root, top)) throw new Error('Git 工作目录身份不一致。');
  const worktrees = (await git(root, ['worktree', 'list', '--porcelain', '-z'])).split('\0\0');
  const registered = worktrees.some(item => {
    const worktree = item.split('\0').find(field => field.startsWith('worktree '));
    if (!worktree) return false;
    const normalize = (value: string): string => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    return normalize(worktree.slice(9)) === normalize(top);
  });
  if (!registered) throw new Error('Git checkout 未在仓库 worktree 清单登记。');
  return { root: await realpath(root), commonDir: await realpath(common), gitDir: await realpath(gitDir) };
}

export function parseDeliveryLocation(text: string): DeliveryLocation {
  const data = JSON.parse(text) as DeliveryLocation;
  if (data?.schemaVersion !== 1 || data.state !== 'active' || !['project', 'workspace'].includes(data.mode) ||
      typeof data.anchorRoot !== 'string' || !path.isAbsolute(data.anchorRoot) ||
      typeof data.recordRoot !== 'string' || !path.isAbsolute(data.recordRoot) || !data.bindings || typeof data.bindings !== 'object') {
    throw new Error('隔离环境定位格式无效；不能生成另一份活动记录。');
  }
  validateWorkId(data.workId);
  for (const [id, value] of Object.entries(data.bindings)) {
    if (id !== '.') { validateRelativePath(id); if (id.includes('/')) throw new Error('仓库标识无效。'); }
    if (!value || !['root', 'sourceRoot', 'commonDir'].every(key => typeof value[key as keyof typeof value] === 'string' && path.isAbsolute(value[key as keyof typeof value]))) {
      throw new Error('仓库本机绑定无效。');
    }
  }
  return data;
}

async function checkoutPointer(root: string): Promise<{ anchorRoot: string; workId: string } | null> {
  // Read the local marker before spawning Git. Ordinary/uninitialized projects have no binding.
  let gitDirectory: string;
  try {
    const marker = await assertSafePath(root, '.git');
    const stat = await lstat(marker);
    if (stat.isDirectory()) gitDirectory = marker;
    else {
      const match = /^gitdir: (.+)\s*$/u.exec((await readFile(marker, 'utf8')).trim());
      if (!match) throw new Error('Git 本机定位文件无效。');
      gitDirectory = path.resolve(root, match[1]!);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const filename = path.join(gitDirectory, 'tiller-binding.json');
  let data;
  try {
    const stat = await lstat(filename);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error('Git 定位绑定必须是普通文件。');
    data = JSON.parse(await readFile(filename, 'utf8')) as { schemaVersion: number; anchorRoot: string; workId: string };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (data.schemaVersion !== 1 || typeof data.anchorRoot !== 'string' || !path.isAbsolute(data.anchorRoot)) throw new Error('Git 活动定位无效。');
  validateWorkId(data.workId);
  const identity = await gitIdentity(root);
  if (!await samePath(identity.gitDir, gitDirectory)) throw new Error('Git 活动目录身份不一致。');
  return data;
}

export async function locateDelivery(rootInput: string, id?: string): Promise<DeliveryLocation | null> {
  const root = path.resolve(rootInput);
  if (id) validateWorkId(id);
  const scoped = activeLocation.getStore();
  if (scoped && (!id || scoped.workId === id) && [scoped.anchorRoot, scoped.recordRoot, ...Object.values(scoped.bindings).map(item => item.root)].some(value => path.resolve(value) === root)) return scoped;
  const pointer = await checkoutPointer(root);
  if (pointer && id && pointer.workId !== id) throw new Error('当前活动 checkout 属于另一项工作。');
  const workId = id ?? pointer?.workId;
  if (!workId) return null;
  const anchorRoot = pointer?.anchorRoot ?? root;
  const text = await readTextIfExists(anchorRoot, bindingPath(workId));
  if (!text) {
    if (pointer) throw new Error('活动登记缺失；请恢复定位，不能创建第二份历史。');
    return null;
  }
  const location = parseDeliveryLocation(text);
  if (location.workId !== workId || !await samePath(location.anchorRoot, anchorRoot)) throw new Error('活动登记与工作身份不一致。');
  if (pointer && !Object.values(location.bindings).some(item => path.resolve(item.root).toLowerCase() === root.toLowerCase())) {
    throw new Error('当前 checkout 不再是该工作的活动目录。');
  }
  const metadata = JSON.parse((await readTextIfExists(location.anchorRoot, '.tiller/project.json')) ?? 'null') as ProjectMetadata | null;
  if (!metadata || metadata.schemaVersion !== 1 || metadata.mode !== location.mode || !Array.isArray(metadata.repositories)) throw new Error('主工程管理方式与活动登记不一致。');
  validateRepositoryMappings(metadata);
  const owner = location.bindings['.']?.root ?? location.anchorRoot;
  if (!await samePath(location.recordRoot, owner)) throw new Error('共同资料位置不属于已登记管理目录。');
  if (!await samePath(location.recordRoot, location.anchorRoot)) {
    const activeMetadata = JSON.parse((await readTextIfExists(location.recordRoot, '.tiller/project.json')) ?? 'null') as ProjectMetadata | null;
    if (!activeMetadata || activeMetadata.schemaVersion !== 1) throw new Error('活动管理目录缺少工程登记。');
    validateRepositoryMappings(activeMetadata);
    if (activeMetadata.mode !== metadata.mode || activeMetadata.repositories.length !== metadata.repositories.length ||
        metadata.repositories.some(repository => !activeMetadata.repositories.includes(repository) || repositoryPath(activeMetadata, repository) !== repositoryPath(metadata, repository))) {
      throw new Error('活动源目录登记与主工程仓库映射不一致。');
    }
  }
  const recordText = await readTextIfExists(location.recordRoot, `.tiller/work/${workId}/delivery.json`);
  const record = recordText ? JSON.parse(recordText) as { schemaVersion: number; workId: string; repositories: { id: string; branch: string }[] } : null;
  if (!record || record.schemaVersion !== 1 || record.workId !== workId || !Array.isArray(record.repositories)) throw new Error('活动交付记录缺失或格式无效。');
  if (record.repositories.length !== Object.keys(location.bindings).length) throw new Error('共享交付范围与本机映射不一致。');
  for (const [repository, binding] of Object.entries(location.bindings)) {
    if ((location.mode === 'project' && repository !== '.') || (repository !== '.' && !metadata.repositories.includes(repository))) throw new Error('活动仓库不属于工程登记范围。');
    const expectedSource = repository === '.' ? location.anchorRoot : await assertSafePath(location.anchorRoot, repositoryPath(metadata, repository));
    if (!await samePath(binding.sourceRoot, expectedSource)) throw new Error('活动源目录不属于登记仓库。');
    const expectedRoot = await assertSafePath(location.anchorRoot, location.mode === 'project' ? `.tiller/local/worktrees/${workId}` : `.tiller/local/worktrees/${workId}/${repository === '.' ? 'management' : `repositories/${repository}`}`);
    const returned = await samePath(binding.root, binding.sourceRoot);
    if (!returned && !await samePath(binding.root, expectedRoot)) throw new Error('活动目录不符合本工作的隔离布局。');
    const sourceIdentity = await gitIdentity(binding.sourceRoot);
    const identity = await gitIdentity(binding.root);
    if (!await samePath(identity.commonDir, binding.commonDir) || !await samePath(sourceIdentity.commonDir, binding.commonDir)) throw new Error('活动仓库 Git 身份已变化。');
    const repo = record.repositories.find(item => item.id === repository);
    if (!repo || (!returned && (await git(binding.root, ['symbolic-ref', '--short', 'HEAD'])).trim() !== repo.branch)) throw new Error('活动仓库分支已变化。');
  }
  return location;
}

export async function resolveWorkRoot(root: string, id: string): Promise<string> {
  return (await locateDelivery(root, id))?.recordRoot ?? path.resolve(root);
}

export async function resolveDeliveryLockRoot(root: string): Promise<string> {
  return (await locateDelivery(root))?.anchorRoot ?? path.resolve(root);
}

export async function resolveRepositoryRoot(root: string, repository: string, id?: string): Promise<string> {
  const location = await locateDelivery(root, id);
  const anchorRoot = location?.anchorRoot ?? path.resolve(root);
  const metadata = JSON.parse((await readTextIfExists(anchorRoot, '.tiller/project.json')) ?? 'null') as ProjectMetadata | null;
  if (metadata) {
    if (metadata.schemaVersion !== 1) throw new Error('工程元信息版本不支持。');
    validateRepositoryMappings(metadata);
  }
  if (repository === '.') return location?.recordRoot ?? path.resolve(root);
  if (!metadata) throw new Error('仓库定位需要已初始化工程和明确的仓库登记。');
  const relative = repositoryPath(metadata, repository);
  if (location?.bindings[repository]) return location.bindings[repository].root;
  return assertSafePath(anchorRoot, relative);
}

export function runWithDeliveryBinding<T>(location: DeliveryLocation, fn: () => Promise<T>): Promise<T> {
  return activeLocation.run(location, fn);
}

export function withoutDeliveryBinding<T>(fn: () => Promise<T>): Promise<T> {
  return activeLocation.run(undefined, fn);
}

export async function withDeliveryLocation<T>(root: string, id: string, fn: () => Promise<T>): Promise<T> {
  const location = await locateDelivery(root, id);
  return location ? runWithDeliveryBinding(location, fn) : fn();
}
