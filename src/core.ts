import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  applyChanges, assertSafePath, hasPendingTransaction, readTextIfExists, readTextInputs,
  recoverChanges, validateRelativePath, withProjectLock,
} from './files.js';
import type { FileChange, InitializeOptions, ProjectInspection, ProjectMetadata, ProjectMode, ProjectPlatform, RepositoryRecord } from './types.js';
import type { TextReadInput } from './files.js';
import { validateRepositoryMappings } from './repository-paths.js';
import {
  GITHUB_TEMPLATE, GITLAB_TEMPLATE, META, REQUIRED_MANAGED, RESOURCE_VERSION, SCHEMA_VERSION, SHARED_RESOURCES,
  managedFilesForPlatform, normalizePlatform, parseMetadata, templatePathsForPlatform,
} from './project-metadata.js';
import { createInitBaseline, type InitBaselineResult } from './init-baseline.js';
import { assertSharedWritePaths } from './shared-paths.js';

export {
  GITHUB_TEMPLATE, GITLAB_TEMPLATE, META, PR_TEMPLATE, REQUIRED_MANAGED, RESOURCE_VERSION, SCHEMA_VERSION, RULES,
  SHARED_RESOURCES, managedFilesForPlatform, normalizePlatform, parseMetadata, templatePathsForPlatform,
} from './project-metadata.js';

export type { InitializeOptions, ProjectInspection, ProjectMetadata, ProjectMode, ProjectPlatform } from './types.js';

export interface InitializeResult extends ProjectInspection {
  changed: boolean;
  warnings: string[];
  firstCommit: { message: string; paths: string[] };
  initBaseline?: InitBaselineResult;
}

export const ENTRY_START = '<!-- tiller:entry:start -->';
export const ENTRY_END = '<!-- tiller:entry:end -->';
export const INDEX_START = '<!-- tiller:index:start -->';
export const INDEX_END = '<!-- tiller:index:end -->';
export const IGNORE_START = '# tiller:local:start';
export const IGNORE_END = '# tiller:local:end';
const EOL_EQUIVALENT_MANAGED = new Set([...REQUIRED_MANAGED, GITLAB_TEMPLATE]);
const execFileAsync = promisify(execFile);

type DetectedRunner = 'junit-maven' | 'junit-gradle' | 'pytest';

async function hasFile(root: string, relative: string): Promise<boolean> {
  try { return (await lstat(path.join(root, relative))).isFile(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}

async function hasPytestLayout(root: string): Promise<boolean> {
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && /^(?:test_.+|.+_test)\.py$/u.test(entry.name)) return true;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const directory of ['tests', 'test']) {
    try {
      const entries = await readdir(path.join(root, directory), { withFileTypes: true, recursive: true });
      if (entries.some(entry => entry.isFile() && entry.name.endsWith('.py'))) return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return false;
}

async function detectVerifyRunner(root: string): Promise<{ runner: DetectedRunner; file: string } | null> {
  for (const [file, runner] of [['pom.xml', 'junit-maven'], ['build.gradle', 'junit-gradle'], ['build.gradle.kts', 'junit-gradle']] as const) {
    if (await hasFile(root, file)) return { runner, file };
  }
  if (await hasFile(root, 'pytest.ini')) return { runner: 'pytest', file: 'pytest.ini' };
  if (await hasFile(root, 'pyproject.toml')) {
    const pyproject = await readFile(path.join(root, 'pyproject.toml'), 'utf8');
    if (/^\s*\[tool\.pytest(?:\.ini_options)?\]\s*$/mu.test(pyproject)) return { runner: 'pytest', file: 'pyproject.toml [tool.pytest]' };
  }
  if (await hasPytestLayout(root)) return { runner: 'pytest', file: 'Python 测试布局' };
  return null;
}

function firstCommitSuggestion(metadata: ProjectMetadata): InitializeResult['firstCommit'] {
  return {
    message: '建议先提交受管入口，再开始业务改动。',
    paths: [META, ...Object.keys(metadata.managedFiles)],
  };
}

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

export function managedDigest(relative: string, text: string): string {
  return sha256(normalizedManagedContent(relative, trackedContent(relative, text)));
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


async function checkRepository(root: string, repository: string, relative: string): Promise<string> {
  const target = relative === '.' ? path.resolve(root) : await assertSafePath(root, relative);
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

function sameRepositoryScope(left: RepositoryRecord[], right: RepositoryRecord[]): boolean {
  const key = (items: RepositoryRecord[]): string => JSON.stringify(items.map(item => [item.id, item.path]).sort((a, b) => a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
  return key(left) === key(right);
}

async function normalizeRepositories(root: string, mode: ProjectMode, supplied: string[]): Promise<RepositoryRecord[]> {
  if (mode === 'project' && supplied.length) throw new Error('当前工程方式不能额外指定仓库。');
  if (mode === 'workspace' && supplied.length === 0) throw new Error('独立管理工程必须明确至少一个已有本地仓库。');
  const records: RepositoryRecord[] = [];
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
    validateRepositoryMappings({ mode: 'workspace', repositories: [{ id, path: relative }], resourceVersion: RESOURCE_VERSION });
    if (!explicitDirect && relative === id) {
      const direct = await exists(id);
      const grouped = await exists(`repositories/${id}`);
      if (direct && grouped) throw new Error(`仓库路径有歧义，请明确指定 ./${id} 或 repositories/${id}。`);
      if (grouped) relative = `repositories/${id}`;
    }
    if (records.some(record => record.id.toLowerCase() === id.toLowerCase())) throw new Error(`仓库重复：${suppliedPath}`);
    const identity = await checkRepository(root, id, relative);
    if (identities.has(identity)) throw new Error(`仓库 Git 身份重复：${id}`);
    identities.add(identity);
    records.push({ id, path: relative });
  }
  return records.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function ignoreRepository(repository: string): string {
  return `/${repository.replace(/[\[\]#!]/gu, '\\$&')}/`;
}

export function repositoryIgnorePatterns(metadata: Pick<ProjectMetadata, 'repositories'>): string[] {
  return [...new Set(metadata.repositories.map(repository => {
    const relative = repository.path;
    return ignoreRepository(relative.startsWith('repositories/') ? 'repositories' : relative);
  }))];
}

async function checkSharedIgnore(root: string, managed: string[] = REQUIRED_MANAGED): Promise<void> {
  await assertSharedWritePaths(root, [META, ...managed]);
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
    '- `cases/`：产品级测试设计与回归事实，保存编号、前置条件、步骤、输入、预期结果和稳定 specs 需求引用；关联 AC 对新用例为“无”，AC 覆盖由 verify 的 AC→测试→CASE 记录承担。',
    '- `plans/`：大功能的规划与任务拆分，按需建立；单次任务仍以 `task.md` 为准。',
    '- `rules/`：通用规则及已有项目约定。',
    '- `context/`：项目背景、现状与资料索引。',
    '- `task/`：当前任务记录，按任务标识读取结构化需求、设计、确认与验证。',
    '- `local/`：本机锁与恢复信息，不作为共享事实来源。', '',
    '任务创建或资料变化后，以实际文件和任务记录为准；确认绑定结构化正文，原话可选且不替代正文。',
    '验证由 tiller 执行声明的测试并从私有报告核实；完整输出只写 `local/<id>/logs/`，外部报告须写明理由并显式放行。评审发现写入 task.md，未清除阻塞项阻断验收；已验收任务按验收提交复查，specs 未回写只提示；发布用只读 release 清单。',
    INDEX_END,
  ].join('\n');
}

async function pullRequestTemplates(
  root: string,
  managedFiles: Record<string, string>,
  platform: ProjectPlatform,
): Promise<{ changes: FileChange[]; digests: Record<string, string> }> {
  const changes: FileChange[] = [];
  const digests: Record<string, string> = {};
  for (const relative of templatePathsForPlatform(platform)) {
    if (Object.hasOwn(managedFiles, relative)) { digests[relative] = managedFiles[relative]!; continue; }
    const resource = relative === GITHUB_TEMPLATE ? 'pull_request_template.md' : 'merge_request_template.md';
    const content = await readFile(new URL(`../resources/${resource}`, import.meta.url), 'utf8');
    if (!content.trim()) throw new Error(`分发合并请求模板为空：${relative}`);
    const before = await readTextIfExists(root, relative);
    if (before !== null && !equivalentManagedContent(relative, before, content)) {
      digests[relative] = managedDigest(relative, before);
      continue;
    }
    if (before === null) changes.push({ path: relative, before: null, after: content });
    digests[relative] = managedDigest(relative, before ?? content);
  }
  return { changes, digests };
}

function orderedManagedFiles(managedFiles: Record<string, string>, platform: ProjectPlatform): Record<string, string> {
  const ordered: Record<string, string> = {};
  for (const relative of managedFilesForPlatform(platform)) {
    const digest = managedFiles[relative];
    if (digest) ordered[relative] = digest;
  }
  return ordered;
}

const SKELETON_FILES: { path: string; content: string }[] = [
  {
    path: '.tiller/specs/requirements.md',
    content: [
      '# 项目需求', '',
      '写跨任务的业务需求；单次任务需求写进 `task.md`。', '',
      '## 使用场景', '', '写主要使用场景与背景依据。', '',
      '## 目标', '', '写希望改变的结果，不写实现路径。', '',
      '## 业务范围', '', '- 做：', '- 不做：', '- 假设与待确认：', '',
      '## 关键行为', '', '写用户可观察的主要行为。', '',
      '## 异常与边界', '', '写失败、空值、权限、规模和兼容边界。', '',
      '## 验收条件', '', '写可观察、可验证的 AC-n 条件；模块由文件路径区分。', '',
    ].join('\n'),
  },
  {
    path: '.tiller/specs/design.md',
    content: [
      '# 项目设计', '',
      '写当前有效的技术方案；简单实现细节留在代码和任务记录中。', '',
      '## 方案', '', '写架构、模块边界、关键接口与数据流。', '',
      '## 失败处理', '', '写失败、回滚与恢复方式。', '',
      '## 取舍', '', '写重要备选方案与选择理由。', '',
      '## 影响与风险', '', '写影响范围、兼容性与风险缓解。', '',
      '## 验证入口', '', '写可重跑的构建、测试或检查入口。', '',
    ].join('\n'),
  },
  {
    path: '.tiller/specs/decisions.md',
    content: '# 长期决定\n\n只记录仍然有效、会约束后续实现的取舍。每条写背景、决定、代价和日期；被推翻的决定标注替代关系。\n',
  },
  {
    path: '.tiller/specs/modules/README.md',
    content: [
      '# 模块规格', '',
      '每个模块建立同名目录，按需放 `requirements.md` 与 `design.md`。模块名使用小写字母、数字和连字符；全局用例目录必须使用同一名称。', '',
      '`requirements.md` 写使用场景、目标、业务范围、关键行为、异常与边界、验收条件。', '',
      '`design.md` 写方案、失败处理、取舍、影响与风险、验证入口。', '',
    ].join('\n'),
  },
  {
    path: '.tiller/context/project.md',
    content: '# 项目背景\n\n记录项目目标、用户、当前状态、目录职责、构建/测试入口、主要依赖和已知限制。架构或入口变化时同步更新。\n',
  },
  {
    path: '.tiller/cases/index.md',
    content: '# 全局用例\n\n这里是跨任务的测试设计与回归事实源；单次任务记录留在 `.tiller/task/<id>/task.md`。\n\n```text\ncases/modules/<模块>/{behavior,interface,performance,security}.md\ncases/scenarios/<场景>.md\n```\n\n模块名须与 `.tiller/specs/modules/` 一致。每条 Markdown 用例含前置条件、步骤、输入、预期结果、类型、优先级和稳定 specs 需求引用；新用例的关联 AC 写“无”。先用 `tiller case add` 登记用例，再让测试名引用 `CASE-NNN`；tiller 扫描测试建立反查。验收覆盖由任务 verify 的 AC→测试→CASE 记录承担，没有测试引用时用例显示为待实现。场景额外声明经过的 `modules`。\n',
  },
  { path: '.tiller/cases/modules/.gitkeep', content: '' },
  { path: '.tiller/cases/scenarios/.gitkeep', content: '' },
  {
    path: '.tiller/plans/README.md',
    content: '# 实施规划\n\n大功能用 `tiller plan start <id> --title ... --goal ... --spec ... --item ...` 建一份规划，确认后用 `start --plan <id> --item <编号>` 挂接任务。依赖未验收时默认阻塞开工。单次小改动不必建规划。\n',
  },
];

async function skeletonChanges(root: string): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  for (const item of SKELETON_FILES) {
    const before = await readTextIfExists(root, item.path);
    if (before === null) changes.push({ path: item.path, before: null, after: item.content });
  }
  return changes;
}

async function buildIndex(root: string, mode: ProjectMode, repositories: RepositoryRecord[]): Promise<string> {
  const lines = [buildIndexSection(mode), '', '## 已有资料', ''];
  let count = 0;
  for (const category of ['specs', 'cases', 'plans', 'context', 'task', 'rules']) {
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
      lines.push(`- [${repository.id.replace(/[\[\]]/gu, '\\$&')}](../${repository.path.split('/').map(encodeURIComponent).join('/')}/)：用途未知；进入该仓库前读取其已有约定。`);
    }
    lines.push('', '仓库关联只描述范围，不授予跨仓库修改、提交或发布权限。');
  }
  return `${lines.join('\n')}\n`;
}

async function inspectProjectState(root: string): Promise<ProjectInspection> {
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
    result.compatibility = 'read-write';
    if (await hasPendingTransaction(absoluteRoot)) result.issues.push('存在未完成事务，请先执行 tiller recover。');
    const managed = await readTextInputs(absoluteRoot, Object.keys(result.metadata.managedFiles));
    for (const { path: relative, text: current } of managed) {
      try {
        if (current === null) result.issues.push(`接入文件缺失：${relative}`);
        else if (!matchesManagedDigest(relative, trackedContent(relative, current), result.metadata.managedFiles[relative]!)) result.issues.push(`接入文件内容已变化：${relative}`);
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
        const identity = await checkRepository(absoluteRoot, repository.id, repository.path);
        if (identities.has(identity)) throw new Error('仓库 Git 身份重复。');
        identities.add(identity);
      }
      catch (error) { result.issues.push(`仓库不可用 ${repository.id}：${(error as Error).message}`); }
    }
    try { await checkSharedIgnore(absoluteRoot, Object.keys(result.metadata.managedFiles)); }
    catch (error) { result.issues.push((error as Error).message); }
    result.ready = result.issues.length === 0;
  } catch (error) { result.issues.push((error as Error).message); }
  return result;
}

export async function inspectProject(root: string): Promise<ProjectInspection> {
  return inspectProjectState(root);
}

/** Read only the current metadata contract. Whole-project health is an explicit inspection. */
export async function readProjectMetadata(root: string, inputs?: TextReadInput): Promise<ProjectMetadata> {
  const metadata = await readRepositoryMetadata(root, inputs);
  if (metadata === null) throw new Error('工程尚未初始化。');
  return metadata;
}

/** Optional metadata for repository positioning; no retained results or hidden inspection. */
export async function readRepositoryMetadata(root: string, inputs?: TextReadInput): Promise<ProjectMetadata | null> {
  const text = await readTextIfExists(root, META, inputs);
  return text === null ? null : parseMetadata(text);
}

export async function initialize(options: InitializeOptions): Promise<InitializeResult> {
  const root = path.resolve(options.root);
  const mode = options.mode ?? 'project';
  if (mode !== 'project' && mode !== 'workspace') throw new Error('初始化方式必须为 project 或 workspace。');
  await mkdir(root, { recursive: true });
  const existingText = await readTextIfExists(root, META);
  // Unknown versions must not acquire a lock or leave other changes in that project.
  const existing = existingText === null ? null : parseMetadata(existingText);
  const detected = await detectVerifyRunner(root);
  const existingPlatform = existing ? normalizePlatform(existing.platform) : undefined;
  const platform = options.platform === undefined ? existingPlatform ?? 'github' : normalizePlatform(options.platform);
  if (existing && options.platform !== undefined && options.platform !== existingPlatform) {
    throw new Error('已有工程的平台配置不同；重复初始化不会切换 github、gitlab 或 both。');
  }
  const repositories = await normalizeRepositories(root, mode, options.repositories ?? []);
  if (existing && (existing.mode !== mode || !sameRepositoryScope(existing.repositories, repositories))) {
    throw new Error('初始化方式、仓库范围或路径与已有工程不同；重复初始化不会转换模式或修改范围。');
  }
  await checkSharedIgnore(root, existing ? Object.keys(existing.managedFiles) : managedFilesForPlatform(platform));
  return withProjectLock(root, async () => {
    const underLockText = await readTextIfExists(root, META);
    if (underLockText !== existingText) throw new Error('工程元信息已变化，请重试。');
    if (existing !== null) {
      const inspection = await inspectProject(root);
      if (!inspection.ready) throw new Error(inspection.issues.join('\n'));
      const skeleton = await skeletonChanges(root);
      const templates = await pullRequestTemplates(root, existing.managedFiles, platform);
      const changes = [...skeleton, ...templates.changes];
      let metadataChange: FileChange | null = null;
      const needsPlatform = options.platform !== undefined && existing.platform !== platform;
      const needsTemplate = Object.entries(templates.digests).some(([relative, digest]) => existing.managedFiles[relative] !== digest);
      const needsRunner = detected !== null && existing.verify?.runner === undefined;
      const nextVerify = needsRunner ? { ...(existing.verify ?? {}), runner: detected.runner } : existing.verify;
      if (needsPlatform || needsTemplate || needsRunner) {
        const metadata: ProjectMetadata = {
          ...existing,
          ...(needsPlatform ? { platform } : {}),
          ...(nextVerify === undefined ? {} : { verify: nextVerify }),
          managedFiles: orderedManagedFiles({ ...existing.managedFiles, ...templates.digests }, platform),
        };
        const after = `${JSON.stringify(metadata, null, 2)}\n`;
        metadataChange = { path: META, before: existingText, after };
        changes.push(metadataChange);
      }
      const effective = changes.filter(change => change.before !== change.after);
      const warnings: string[] = [];
      if (detected) {
        warnings.push(existing.verify?.runner === undefined || existing.verify?.runner === detected.runner
          ? `检测到 ${detected.file}，verify.runner 为 ${detected.runner}。`
          : `检测到 ${detected.file}，但当前 verify.runner 为 ${existing.verify.runner}；请确认是否需要切换为 ${detected.runner}。`);
      }
      if (!effective.length) return { ...inspection, changed: false, warnings,
        firstCommit: firstCommitSuggestion(inspection.metadata!) };
      await applyChanges(root, effective);
      let completed = await inspectProject(root);
      if (!completed.ready) throw new Error(`补齐项目骨架后检查未通过：${completed.issues.join('\n')}`);
      const initialized = await createInitBaseline(root, completed.metadata!, effective, platform);
      warnings.push(...initialized.warnings, ...(initialized.baseline?.warnings ?? []));
      completed = await inspectProject(root);
      if (!completed.ready) throw new Error(`初始化集成后检查未通过：${completed.issues.join('\n')}`);
      return { ...completed, changed: true, warnings, firstCommit: firstCommitSuggestion(completed.metadata!),
        ...(initialized.baseline ? { initBaseline: initialized.baseline } : {}) };
    }
    if (await hasPendingTransaction(root)) throw new Error('存在未完成事务，请先执行 tiller recover。');
    const changes: FileChange[] = await skeletonChanges(root);
    const managedFiles: Record<string, string> = {};
    for (const resource of SHARED_RESOURCES) {
      const content = await readFile(new URL(`../resources/${resource}`, import.meta.url), 'utf8');
      if (!content.trim()) throw new Error(`分发共享资源为空：${resource}`);
      const relative = `.tiller/${resource}`;
      const before = await readTextIfExists(root, relative);
      if (before !== null && !equivalentManagedContent(relative, before, content)) throw new Error(`已有文件与分发资源冲突，未覆盖：${relative}`);
      changes.push({ path: relative, before, after: before ?? content });
      managedFiles[relative] = managedDigest(relative, content);
    }
    const templates = await pullRequestTemplates(root, managedFiles, platform);
    changes.push(...templates.changes);
    Object.assign(managedFiles, templates.digests);
    const entry = await readFile(new URL('../resources/entry.md', import.meta.url), 'utf8');
    if (!entry.trim()) throw new Error('分发入口资源为空。');
    const agentsBefore = await readTextIfExists(root, 'AGENTS.md');
    const agentsAfter = appendSection(agentsBefore, entry, ENTRY_START, ENTRY_END);
    changes.push({ path: 'AGENTS.md', before: agentsBefore, after: agentsAfter });
    managedFiles['AGENTS.md'] = managedDigest('AGENTS.md', agentsAfter);
    const ignoreBefore = await readTextIfExists(root, '.gitignore');
    const ignoreBody = ['/.tiller/local/', ...repositoryIgnorePatterns({ repositories })].join('\n');
    const ignoreAfter = appendSection(ignoreBefore, ignoreBody, IGNORE_START, IGNORE_END);
    changes.push({ path: '.gitignore', before: ignoreBefore, after: ignoreAfter });
    managedFiles['.gitignore'] = managedDigest('.gitignore', ignoreAfter);
    const indexBefore = await readTextIfExists(root, '.tiller/index.md');
    const indexAfter = await buildIndex(root, mode, repositories);
    if (indexBefore !== null && indexBefore !== indexAfter) throw new Error('已有 .tiller/index.md 需要协调接入，未覆盖原有索引。');
    changes.push({ path: '.tiller/index.md', before: indexBefore, after: indexAfter });
    managedFiles['.tiller/index.md'] = managedDigest('.tiller/index.md', indexAfter);
    const metadata: ProjectMetadata = {
      schemaVersion: SCHEMA_VERSION, resourceVersion: RESOURCE_VERSION, mode, repositories,
      ...(options.platform === undefined && platform === 'github' ? {} : { platform }),
      ...(detected === null ? {} : { verify: { runner: detected.runner } }),
      managedFiles: orderedManagedFiles(managedFiles, platform), createdAt: new Date().toISOString(),
    };
    changes.push({ path: META, before: null, after: `${JSON.stringify(metadata, null, 2)}\n` });
    await applyChanges(root, changes);
    let inspection = await inspectProject(root);
    if (!inspection.ready) throw new Error(`文件接入后检查未通过：${inspection.issues.join('\n')}`);
    const warnings = detected ? [`检测到 ${detected.file}，已写入 verify.runner=${detected.runner}。`] : [];
    const initialized = await createInitBaseline(root, inspection.metadata!, changes, platform);
    warnings.push(...initialized.warnings, ...(initialized.baseline?.warnings ?? []));
    inspection = await inspectProject(root);
    if (!inspection.ready) throw new Error(`初始化集成后检查未通过：${inspection.issues.join('\n')}`);
    return { ...inspection, changed: true, warnings, firstCommit: firstCommitSuggestion(inspection.metadata!),
      ...(initialized.baseline ? { initBaseline: initialized.baseline } : {}) };
  });
}

export async function recoverProject(root: string): Promise<{ root: string; recovered: boolean }> {
  const absoluteRoot = path.resolve(root);
  const metadataText = await readTextIfExists(absoluteRoot, META);
  if (metadataText !== null) parseMetadata(metadataText);
  return withProjectLock(absoluteRoot, async () => ({ root: absoluteRoot, recovered: await recoverChanges(absoluteRoot) }));
}
