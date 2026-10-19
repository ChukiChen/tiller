import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  applyChanges, assertSafePath, hasPendingTransaction, readTextIfExists,
  recoverChanges, validateRelativePath, withProjectLock,
} from './files.js';
import type { FileChange, InitializeOptions, ProjectInspection, ProjectMetadata, ProjectMode } from './types.js';
import { resolveRepositoryRoot } from './delivery-location.js';
import { repositoryPath, validateRepositoryMappings } from './repository-paths.js';

export type { InitializeOptions, ProjectInspection, ProjectMetadata, ProjectMode } from './types.js';

export const SCHEMA_VERSION = 1;
export const RESOURCE_VERSION = '0.3.5';
export const ENTRY_START = '<!-- tiller:entry:start -->';
export const ENTRY_END = '<!-- tiller:entry:end -->';
export const INDEX_START = '<!-- tiller:index:start -->';
export const INDEX_END = '<!-- tiller:index:end -->';
export const IGNORE_START = '# tiller:local:start';
export const IGNORE_END = '# tiller:local:end';
export const META = '.tiller/project.json';
export const RULES = [
  'rules/index.md', 'rules/core.md',
  'rules/activities/requirements.md', 'rules/activities/design.md',
  'rules/activities/implementation.md', 'rules/activities/delivery.md',
  'rules/quality/documents.md', 'rules/quality/verification.md',
] as const;
export const SHARED_RESOURCES = [...RULES, 'usage.md', 'run.cjs'] as const;
const LEGACY_MANAGED = ['AGENTS.md', '.gitignore', '.tiller/index.md', ...RULES.map(name => `.tiller/${name}`)];
const REQUIRED_MANAGED = ['AGENTS.md', '.gitignore', '.tiller/index.md', ...SHARED_RESOURCES.map(name => `.tiller/${name}`)];
const EOL_EQUIVALENT_MANAGED = new Set(REQUIRED_MANAGED);
const execFileAsync = promisify(execFile);

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_COMMON_DIR;
  environment.LC_ALL = 'C';
  return environment;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function managedSection(text: string, start: string, end: string): string | null {
  const startCount = text.split(start).length - 1;
  const endCount = text.split(end).length - 1;
  if (startCount === 0 && endCount === 0) return null;
  const begin = text.indexOf(start);
  const finish = text.indexOf(end);
  if (startCount !== 1 || endCount !== 1 || finish < begin) {
    throw new Error('受管区段标记缺失、重复或顺序错误；请先处理冲突。');
  }
  return text.slice(begin, finish + end.length);
}

export function trackedContent(relative: string, text: string): string {
  if (relative === 'AGENTS.md') {
    const section = managedSection(text, ENTRY_START, ENTRY_END);
    if (section === null) throw new Error('AGENTS.md 缺少 tiller 接入区段。');
    return section;
  }
  if (relative === '.gitignore') {
    const section = managedSection(text, IGNORE_START, IGNORE_END);
    if (section === null) throw new Error('.gitignore 缺少 tiller 本机数据排除区段。');
    return section;
  }
  if (relative === '.tiller/index.md') {
    const section = managedSection(text, INDEX_START, INDEX_END);
    if (section === null) throw new Error('.tiller/index.md 缺少 tiller 固定导航区段。');
    return section;
  }
  return text;
}

// Git checkout and editors may change EOL in distributed resources and managed sections.
// Only these exact paths allow equivalence; user documents and confirmation evidence stay byte-exact.
function normalizedManagedContent(relative: string, text: string): string {
  return EOL_EQUIVALENT_MANAGED.has(relative) ? text.replace(/\r\n/gu, '\n') : text;
}

export function equivalentManagedContent(relative: string, left: string, right: string): boolean {
  return normalizedManagedContent(relative, left) === normalizedManagedContent(relative, right);
}

export function matchesManagedDigest(relative: string, text: string, digest: string): boolean {
  if (sha256(text) === digest) return true;
  if (!EOL_EQUIVALENT_MANAGED.has(relative)) return false;
  const normalized = normalizedManagedContent(relative, text);
  return sha256(normalized) === digest || sha256(normalized.replace(/\n/gu, '\r\n')) === digest;
}

function appendSection(before: string | null, body: string, start: string, end: string): string {
  const block = `${start}\n${body.trimEnd()}\n${end}`;
  if (before !== null) {
    const existing = managedSection(before, start, end);
    if (existing !== null) {
      if (existing !== block) throw new Error('已有 tiller 受管区段与本版本不一致，未覆盖原文。');
      return before;
    }
  }
  return `${before ?? ''}${before ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}${block}\n`;
}

export function parseMetadata(text: string): ProjectMetadata {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('工程元信息不是有效 JSON。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('工程元信息格式无效。');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== SCHEMA_VERSION || !['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3', '0.3.4', RESOURCE_VERSION].includes(String(data.resourceVersion))) {
    throw new Error('工程格式或资源版本不受支持；保留现状，请使用兼容版本或显式迁移方案。');
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
  const requiredManaged = ['0.3.2', '0.3.3', '0.3.4', RESOURCE_VERSION].includes(String(data.resourceVersion)) ? REQUIRED_MANAGED : LEGACY_MANAGED;
  if (Object.keys(managed).length !== requiredManaged.length ||
      requiredManaged.some(name => !Object.hasOwn(managed, name) || typeof managed[name] !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(managed[name] as string))) throw new Error('受管文件依据不完整或含不支持的文件。');
  return data as unknown as ProjectMetadata;
}

async function checkRepository(root: string, repository: string, relative?: string): Promise<string> {
  const target = relative === undefined ? await resolveRepositoryRoot(root, repository)
    : relative === '.' ? path.resolve(root) : await assertSafePath(root, relative);
  if (!(await lstat(target)).isDirectory()) throw new Error(`仓库不是目录：${repository}`);
  const gitPath = await assertSafePath(target, '.git');
  const git = await lstat(gitPath);
  if (!git.isDirectory() && !git.isFile()) throw new Error(`仓库缺少有效 Git 标识：${repository}`);
  if (git.isFile()) {
    const marker = await readTextIfExists(target, '.git');
    if (!marker || !/^gitdir:\s*\S.*/u.test(marker.trim())) throw new Error(`Git 工作副本标识无效：${repository}`);
  }
  // A parent Git process must not redirect verification to a different repository.
  let topLevel: string;
  let commonDir: string;
  try {
    const result = await execFileAsync('git', ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'], {
      cwd: target, env: gitEnvironment(), windowsHide: true, timeout: 10000,
    });
    const parts = result.stdout.trim().split(/\r?\n/u);
    if (parts.length !== 2) throw new Error('Git 身份输出无效。');
    topLevel = await realpath(parts[0]!);
    commonDir = await realpath(parts[1]!);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`无法验证已有仓库 ${repository}：需要可用的 Git 命令。`);
    }
    throw new Error(`目录不是可验证的 Git 工作副本：${repository}；${(error as Error).message}`);
  }
  const expected = await realpath(target);
  const normalize = (value: string): string => process.platform === 'win32' ? value.toLowerCase() : value;
  if (normalize(path.resolve(topLevel)) !== normalize(path.resolve(expected))) {
    throw new Error(`Git 工作树根目录与指定仓库不一致：${repository}`);
  }
  return normalize(commonDir);
}

async function managementIdentity(root: string): Promise<string | null> {
  try { await lstat(await assertSafePath(root, '.git')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  return checkRepository(root, '.', '.');
}

async function normalizeRepositories(root: string, mode: ProjectMode, supplied: string[]): Promise<{ repositories: string[]; repositoryPaths: Record<string, string> }> {
  if (mode === 'project' && supplied.length) throw new Error('当前工程方式不能额外指定仓库。');
  if (mode === 'workspace' && supplied.length === 0) throw new Error('独立管理工程必须明确至少一个已有本地仓库。');
  const names: string[] = [];
  const repositoryPaths: Record<string, string> = {};
  const identities = new Set<string>();
  if (mode === 'workspace') {
    const identity = await managementIdentity(root);
    if (identity) identities.add(identity);
  }
  const exists = async (relative: string): Promise<boolean> => {
    const target = await assertSafePath(root, relative);
    try { await lstat(target); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  };
  for (const suppliedPath of supplied) {
    if (typeof suppliedPath !== 'string' || !suppliedPath.trim()) throw new Error('仓库路径不能为空。');
    const absolute = path.isAbsolute(suppliedPath);
    const input = (absolute ? path.relative(root, suppliedPath) : suppliedPath).split(path.sep).join('/');
    const explicitDirect = absolute || input.startsWith('./');
    let relative = input.startsWith('./') ? input.slice(2) : input;
    validateRelativePath(relative);
    const id = relative.startsWith('repositories/') ? relative.slice('repositories/'.length) : relative;
    validateRepositoryMappings({ mode: 'workspace', repositories: [id], repositoryPaths: { [id]: relative }, resourceVersion: RESOURCE_VERSION });
    if (!explicitDirect && relative === id) {
      const direct = await exists(id);
      const grouped = await exists(`repositories/${id}`);
      if (direct && grouped) throw new Error(`仓库路径有歧义，请明确指定 ./${id} 或 repositories/${id}。`);
      if (grouped) relative = `repositories/${id}`;
    }
    if (names.some(name => name.toLowerCase() === id.toLowerCase())) throw new Error(`仓库重复：${suppliedPath}`);
    const identity = await checkRepository(root, id, relative);
    if (identities.has(identity)) throw new Error(`仓库 Git 身份重复：${id}`);
    identities.add(identity);
    repositoryPaths[id] = relative;
    names.push(id);
  }
  const repositories = names.sort();
  return { repositories, repositoryPaths: Object.fromEntries(repositories.map(id => [id, repositoryPaths[id]!])) };
}

export function ignoreRepository(repository: string): string {
  return `/${repository.replace(/[\[\]#!]/gu, '\\$&')}/`;
}

export function repositoryIgnorePatterns(metadata: Pick<ProjectMetadata, 'repositories' | 'repositoryPaths'>): string[] {
  return [...new Set(metadata.repositories.map(id => {
    const relative = metadata.repositoryPaths?.[id] ?? id;
    return ignoreRepository(relative.startsWith('repositories/') ? 'repositories' : relative);
  }))];
}

export async function assertSharedPaths(root: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  for (const relative of paths) await assertSafePath(root, relative);
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: root, env: gitEnvironment(), windowsHide: true, timeout: 10000,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const ignore = await readTextIfExists(root, '.gitignore');
      const patterns = ignore?.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#')) ?? [];
      // Without Git, only the known local-only rule can be established as harmless.
      if (patterns.some(line => line !== '/.tiller/local/')) {
        throw new Error('Git 不可用，无法核对现有忽略规则是否排除共享资料；请先检查忽略配置。');
      }
      // The selected project can itself be nested inside a larger Git worktree.
      let ancestor = path.resolve(root);
      while (true) {
        try {
          await lstat(path.join(ancestor, '.git'));
          throw new Error('Git 不可用，无法核对 Git 工程的共享资料忽略状态。');
        } catch (markerError) {
          if ((markerError as NodeJS.ErrnoException).code !== 'ENOENT') throw markerError;
        }
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
      return;
    }
    if ((error as { stderr?: string }).stderr?.includes('not a git repository')) return;
    throw new Error(`无法核对共享资料的 Git 状态：${(error as Error).message}`);
  }
  try {
    const { stdout } = await execFileAsync('git', ['check-ignore', '--no-index', '--', ...paths], {
      cwd: root, env: gitEnvironment(), windowsHide: true, timeout: 10000,
    });
    if (stdout.trim()) throw new Error(`共享资料被 Git 忽略，未修改现有规则：${stdout.trim().split(/\r?\n/u).join('、')}`);
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return;
    throw error;
  }
}

async function checkSharedIgnore(root: string, managed: string[] = REQUIRED_MANAGED): Promise<void> {
  await assertSharedPaths(root, [META, ...managed]);
}

export function buildIndexSection(mode: ProjectMode): string {
  return [
    INDEX_START,
    '# 工程资料入口', '',
    `管理方式：${mode === 'project' ? '当前工程' : '独立管理工程'}。范围以 [工程元信息](project.json) 为准。`, '',
    '先读取 [使用指引](usage.md) 了解命令调用与恢复方式，再读取 [开发规则索引](rules/index.md)，按当前任务查找适用依据。',
    '本入口只表示文件接入；宿主实际读取和规则执行尚未验证。', '',
    '## 资料分类', '',
    '- `specs/`：总体与模块需求、设计及长期决定。',
    '- `rules/`：通用规则及已有项目约定。',
    '- `context/`：项目背景、现状与资料索引。',
    '- `work/`：按实际目录查找工作记录，读取目标、进展、阻碍、证据及下一步。',
    '- `local/`：本机锁与恢复信息，不作为共享事实来源。', '',
    '工作创建或资料变化后，以实际文件和工作记录为准；下方资料与工作链接可按实际情况更新。',
    INDEX_END,
  ].join('\n');
}

async function buildIndex(root: string, mode: ProjectMode, repositories: string[], repositoryPaths: Record<string, string>): Promise<string> {
  const lines = [buildIndexSection(mode), '', '## 已有资料', ''];
  let count = 0;
  for (const category of ['specs', 'context', 'work', 'rules']) {
    const base = `.tiller/${category}`;
    async function visit(relative: string): Promise<void> {
      const absolute = await assertSafePath(root, relative);
      let entries;
      try { entries = await readdir(absolute, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const child = `${relative}/${entry.name}`;
        await assertSafePath(root, child);
        if (entry.isDirectory()) await visit(child);
        else if (entry.isFile() && entry.name.endsWith('.md')) {
          const link = child.slice('.tiller/'.length);
          lines.push(`- [${link.replace(/[\[\]]/gu, '\\$&')}](${link.split('/').map(encodeURIComponent).join('/')})`);
          count++;
          if (count > 1000) throw new Error('已有资料过多，请先提供聚合索引后再接入。');
        }
      }
    }
    await visit(base);
  }
  if (!count) lines.push('尚未发现上述分类中的已有 Markdown 资料；项目背景未知，后续按实际需要补充。');
  if (repositories.length) {
    lines.push('', '## 被管理仓库', '');
    for (const repository of repositories) {
      lines.push(`- [${repository.replace(/[\[\]]/gu, '\\$&')}](../${repositoryPaths[repository]!.split('/').map(encodeURIComponent).join('/')}/)：用途未知；进入该仓库前读取其已有约定。`);
    }
    lines.push('', '仓库关联只描述范围，不授予跨仓库修改、提交或发布权限。');
  }
  return `${lines.join('\n')}\n`;
}

export async function inspectProject(root: string): Promise<ProjectInspection> {
  const absoluteRoot = path.resolve(root);
  const result: ProjectInspection = {
    root: absoluteRoot, initialized: false, ready: false, metadata: null, issues: [], hostVerification: 'not-verified',
    compatibility: 'unsupported',
  };
  try {
    const text = await readTextIfExists(absoluteRoot, META);
    if (text === null) {
      result.issues.push('工程尚未初始化。');
      if (await hasPendingTransaction(absoluteRoot)) result.issues.push('存在未完成事务，请先执行 tiller recover。');
      return result;
    }
    result.initialized = true;
    result.metadata = parseMetadata(text);
    result.compatibility = result.metadata.resourceVersion === RESOURCE_VERSION ? 'read-write' : 'read-only';
    if (await hasPendingTransaction(absoluteRoot)) result.issues.push('存在未完成事务，请先执行 tiller recover。');
    for (const [relative, digest] of Object.entries(result.metadata.managedFiles)) {
      try {
        const current = await readTextIfExists(absoluteRoot, relative);
        if (current === null) result.issues.push(`接入文件缺失：${relative}`);
        else if (!matchesManagedDigest(relative, trackedContent(relative, current), digest)) result.issues.push(`接入文件内容已变化：${relative}`);
      } catch (error) { result.issues.push((error as Error).message); }
    }
    const identities = new Set<string>();
    if (result.metadata.mode === 'workspace') {
      try {
        const identity = await managementIdentity(absoluteRoot);
        if (identity) identities.add(identity);
      } catch (error) { result.issues.push(`管理仓库不可用：${(error as Error).message}`); }
    }
    for (const repository of result.metadata.repositories) {
      try {
        const identity = await checkRepository(absoluteRoot, repository);
        if (identities.has(identity)) throw new Error('仓库 Git 身份重复。');
        identities.add(identity);
      }
      catch (error) { result.issues.push(`仓库不可用 ${repository}：${(error as Error).message}`); }
    }
    try { await checkSharedIgnore(absoluteRoot, Object.keys(result.metadata.managedFiles)); }
    catch (error) { result.issues.push((error as Error).message); }
    result.ready = result.issues.length === 0;
  } catch (error) { result.issues.push((error as Error).message); }
  return result;
}

export async function requireReadyProject(root: string, options: { write?: boolean } = {}): Promise<ProjectMetadata> {
  const result = await inspectProject(root);
  if (!result.ready || !result.metadata) throw new Error(result.issues.join('\n'));
  if (options.write !== false && result.compatibility !== 'read-write') {
    throw new Error('旧版工程仅支持只读检查与接续；新写入需要先预览并显式应用 tiller upgrade。');
  }
  return result.metadata;
}

export async function initialize(options: InitializeOptions): Promise<ProjectInspection & { changed: boolean }> {
  const root = path.resolve(options.root);
  const mode = options.mode ?? 'project';
  if (mode !== 'project' && mode !== 'workspace') throw new Error('初始化方式必须为 project 或 workspace。');
  await mkdir(root, { recursive: true });
  const existingText = await readTextIfExists(root, META);
  // Unknown versions must not acquire a lock or leave other changes in that project.
  const existing = existingText === null ? null : parseMetadata(existingText);
  const { repositories, repositoryPaths } = await normalizeRepositories(root, mode, options.repositories ?? []);
  if (existing && (existing.mode !== mode || JSON.stringify([...existing.repositories].sort()) !== JSON.stringify(repositories) ||
      repositories.some(id => repositoryPath(existing, id) !== repositoryPaths[id]))) {
    throw new Error('初始化方式、仓库范围或路径与已有工程不同；重复初始化不会转换模式或修改范围。');
  }
  await checkSharedIgnore(root, existing ? Object.keys(existing.managedFiles) : REQUIRED_MANAGED);
  return withProjectLock(root, async () => {
    const underLockText = await readTextIfExists(root, META);
    if (underLockText !== existingText) throw new Error('工程元信息已变化，请重试。');
    if (existing !== null) {
      const inspection = await inspectProject(root);
      if (!inspection.ready) throw new Error(inspection.issues.join('\n'));
      return { ...inspection, changed: false };
    }
    if (await hasPendingTransaction(root)) throw new Error('存在未完成事务，请先执行 tiller recover。');
    const changes: FileChange[] = [];
    const managedFiles: Record<string, string> = {};
    for (const resource of SHARED_RESOURCES) {
      const content = await readFile(new URL(`../resources/${resource}`, import.meta.url), 'utf8');
      if (!content.trim()) throw new Error(`分发共享资源为空：${resource}`);
      const relative = `.tiller/${resource}`;
      const before = await readTextIfExists(root, relative);
      if (before !== null && !equivalentManagedContent(relative, before, content)) throw new Error(`已有文件与分发资源冲突，未覆盖：${relative}`);
      changes.push({ path: relative, before, after: before ?? content });
      managedFiles[relative] = sha256(content);
    }
    const entry = await readFile(new URL('../resources/entry.md', import.meta.url), 'utf8');
    if (!entry.trim()) throw new Error('分发入口资源为空。');
    const agentsBefore = await readTextIfExists(root, 'AGENTS.md');
    const agentsAfter = appendSection(agentsBefore, entry, ENTRY_START, ENTRY_END);
    changes.push({ path: 'AGENTS.md', before: agentsBefore, after: agentsAfter });
    managedFiles['AGENTS.md'] = sha256(trackedContent('AGENTS.md', agentsAfter));
    const ignoreBefore = await readTextIfExists(root, '.gitignore');
    const ignoreBody = ['/.tiller/local/', ...repositoryIgnorePatterns({ repositories, repositoryPaths })].join('\n');
    const ignoreAfter = appendSection(ignoreBefore, ignoreBody, IGNORE_START, IGNORE_END);
    changes.push({ path: '.gitignore', before: ignoreBefore, after: ignoreAfter });
    managedFiles['.gitignore'] = sha256(trackedContent('.gitignore', ignoreAfter));
    const indexBefore = await readTextIfExists(root, '.tiller/index.md');
    const indexAfter = await buildIndex(root, mode, repositories, repositoryPaths);
    if (indexBefore !== null && indexBefore !== indexAfter) throw new Error('已有 .tiller/index.md 需要协调接入，未覆盖原有索引。');
    changes.push({ path: '.tiller/index.md', before: indexBefore, after: indexAfter });
    managedFiles['.tiller/index.md'] = sha256(trackedContent('.tiller/index.md', indexAfter));
    const metadata: ProjectMetadata = {
      schemaVersion: SCHEMA_VERSION, resourceVersion: RESOURCE_VERSION, mode, repositories, repositoryPaths,
      managedFiles, createdAt: new Date().toISOString(),
    };
    changes.push({ path: META, before: null, after: `${JSON.stringify(metadata, null, 2)}\n` });
    await applyChanges(root, changes);
    const inspection = await inspectProject(root);
    if (!inspection.ready) throw new Error(`文件接入后检查未通过：${inspection.issues.join('\n')}`);
    return { ...inspection, changed: true };
  });
}

export async function recoverProject(root: string): Promise<{ root: string; recovered: boolean }> {
  const absoluteRoot = path.resolve(root);
  return withProjectLock(absoluteRoot, async () => ({ root: absoluteRoot, recovered: await recoverChanges(absoluteRoot) }));
}
