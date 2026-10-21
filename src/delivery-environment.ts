import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertConfirmationSharing, checkGate, type ConfirmationReference } from './confirmations.js';
import { assertSharedWritePaths } from './shared-paths.js';
import { META, readProjectMetadata, sha256 } from './core.js';
import { applyChanges, assertSafePath, readTextIfExists, validateRelativePath, withProjectLock } from './files.js';
import { git, readGitFiles } from './delivery-git.js';
import { repositoryPath } from './repository-paths.js';
import { parseWorkRecord } from './work.js';
import { loadWorkflowSnapshot, readWorkRecordText } from './workflow-work.js';
import { assertWorkflowActivationCurrent } from './workflow-policy.js';
import {
  bindingPath, gitIdentity, locateDelivery, parseDeliveryLocation,
  runWithDeliveryBinding, samePath, validateWorkId, withoutDeliveryBinding,
} from './delivery-location.js';
import type {
  DeliveryContext, DeliveryLocation, DeliveryPreparationInput, DeliveryRecord,
  DeliveryRepository, PreparationTransfer,
} from './delivery-types.js';

export { resolveWorkRoot } from './delivery-location.js';
export type { DeliveryContext, DeliveryRecord } from './delivery-types.js';

interface TransferPlan extends PreparationTransfer { before: string | null; after: string | null }
interface RepositoryPlan extends DeliveryRepository {
  sourceRoot: string;
  commonDir: string;
  root: string;
  sourceHead: string;
  targetHead: string;
  sourceState: string;
  transfers: TransferPlan[];
}
interface PreparationPlan {
  schemaVersion: 1;
  action: 'prepare';
  workId: string;
  anchorRoot: string;
  recordRoot: string;
  mode: 'project' | 'workspace';
  designRequest: string;
  inputDigest: string;
  metadataDigest: string;
  repositories: RepositoryPlan[];
  planId: string;
}

function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`${label}格式或字段无效。`);
  return value as Record<string, unknown>;
}
function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.startsWith('-') || /[\x00-\x1f]/u.test(value)) throw new Error(`${label}无效。`);
  return value;
}
function parseInput(value: unknown): DeliveryPreparationInput {
  const input = object(value, ['schemaVersion', 'designRequest', 'repositories'], '准备输入');
  if (input.schemaVersion !== 1 || !Array.isArray(input.repositories) || input.repositories.length === 0) throw new Error('准备输入版本或仓库清单无效。');
  nonempty(input.designRequest, '设计请求');
  const seen = new Set<string>();
  for (const entry of input.repositories) {
    const repo = object(entry, ['id', 'base', 'branch', 'target', 'remote', 'transfers'], '仓库');
    const id = nonempty(repo.id, '仓库标识');
    if (id !== '.') { validateRelativePath(id); if (id.includes('/')) throw new Error('仓库标识必须是登记名称。'); }
    if (seen.has(id.toLowerCase())) throw new Error('仓库重复。');
    seen.add(id.toLowerCase());
    for (const key of ['base', 'branch', 'target']) nonempty(repo[key], key);
    if (repo.remote !== undefined) {
      const remote = nonempty(repo.remote, '远端名称');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(remote)) throw new Error('远端须使用已配置名称，不能内嵌 URL 或凭据。');
    }
    if (repo.transfers !== undefined && !Array.isArray(repo.transfers)) throw new Error('交接清单无效。');
    const files = new Set<string>();
    for (const item of (repo.transfers ?? []) as unknown[]) {
      const transfer = object(item, ['path', 'operation'], '交接条目');
      const filename = nonempty(transfer.path, '交接路径');
      validateRelativePath(filename);
      if (filename.split('/').some(part => part.toLowerCase() === '.git') || filename.toLowerCase().startsWith('.tiller/local/') ||
          /(^|\/)(\.env(?:\..*)?|credentials(?:\..*)?|id_rsa|id_ed25519)$/iu.test(filename) || /\.(pem|key|p12|pfx)$/iu.test(filename)) throw new Error(`拒绝交接 Git、本机或凭据文件：${filename}`);
      if (files.has(filename.toLowerCase())) throw new Error('交接路径重复。');
      files.add(filename.toLowerCase());
      if (!['add', 'modify', 'delete'].includes(String(transfer.operation))) throw new Error('交接操作不支持；重命名使用明确的删除与新增。');
    }
  }
  return input as unknown as DeliveryPreparationInput;
}

async function localWrite(root: string, relative: string, value: unknown): Promise<void> {
  const filename = await assertSafePath(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await assertSafePath(root, relative);
  const temporary = `${relative}.${randomUUID()}.tmp`;
  const handle = await open(await assertSafePath(root, temporary), 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(await assertSafePath(root, temporary), filename);
}

async function regularBytes(root: string, filename: string): Promise<Buffer | null> {
  const absolute = await assertSafePath(root, filename);
  try {
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o111))) throw new Error(`交接仅支持无执行位普通文件：${filename}`);
    return await readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function sourceState(root: string): Promise<string> {
  return sha256(await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) + await git(root, ['diff', '--binary', 'HEAD', '--']));
}

function blobDigest(bytes: Buffer): string {
  // Reject lossy/binary handoff instead of silently changing bytes.
  const content = bytes.toString('utf8');
  if (content.includes('\uFFFD') || content.includes('\0')) throw new Error('二进制交接暂不支持；请先形成获授权的基线提交。');
  return sha256(content);
}

async function checkDesign(root: string, id: string, requestId: string, repositories: string[]): Promise<ConfirmationReference> {
  const gate = await checkGate(root, id, requestId);
  if (gate.gate !== 'design' || !gate.confirmed || !gate.decisionId) throw new Error(`设计确认未满足：${gate.issues.join('；')}`);
  const registry = JSON.parse((await readTextIfExists(root, `.tiller/work/${id}/confirmations.json`))!) as { requests: { requestId: string; scope: { repositories: string[]; targets: string[] } }[] };
  const request = registry.requests.find(item => item.requestId === requestId);
  if (!request || repositories.some(repo => !request.scope.repositories.includes(repo))) throw new Error('设计确认未覆盖准备仓库范围。');
  const workText = await readWorkRecordText(root, id);
  if (!workText) throw Object.assign(new Error('交付需要当前格式的工作登记；请先创建新工作。'), { code: 'WORK_NOT_FOUND' });
  const work = parseWorkRecord(workText, id);
  await loadWorkflowSnapshot(root, work);
  await assertWorkflowActivationCurrent(root, work);
  if (repositories.some(repo => !work.scope.repositories.includes(repo))) throw new Error('交付仓库超出登记工作范围。');
  const targets = work.scope.targets;
  if (!Array.isArray(targets) || !targets.length || targets.some(target => typeof target !== 'string' || !request.scope.targets.includes(target))) throw new Error('设计确认未覆盖登记工作的目标范围。');
  return { workId: id, requestId, decisionId: gate.decisionId };
}

async function planContents(root: string, id: string, input: DeliveryPreparationInput): Promise<Omit<PreparationPlan, 'planId'>> {
  const metadata = await readProjectMetadata(root);
  if (await readTextIfExists(root, `.tiller/work/${id}/delivery.json`)) throw new Error('已有交付记录但缺少有效本机绑定；请恢复定位，不能创建第二份历史。');
  await checkDesign(root, id, input.designRequest, input.repositories.map(item => item.id));
  let managerGit = false;
  try { await lstat(await assertSafePath(root, '.git')); managerGit = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (managerGit) await gitIdentity(root);
  const ids = input.repositories.map(item => item.id);
  if (metadata.mode === 'project' && (ids.length !== 1 || ids[0] !== '.' || !managerGit)) throw new Error('当前工程方式必须准备自身 Git 仓库。');
  if (metadata.mode === 'workspace' && (ids.includes('.') !== managerGit || ids.some(value => value !== '.' && !metadata.repositories.includes(value)))) throw new Error('独立管理须分别列出 Git 管理仓库与已登记业务仓库；无 Git 管理根不指定管理分支。');
  const container = `.tiller/local/worktrees/${id}`;
  const repositories: RepositoryPlan[] = [];
  for (const supplied of input.repositories) {
    const sourceRoot = supplied.id === '.' ? root : await assertSafePath(root, repositoryPath(metadata, supplied.id));
    const identity = await gitIdentity(sourceRoot);
    await git(sourceRoot, ['check-ref-format', '--branch', supplied.branch]);
    await git(sourceRoot, ['check-ref-format', '--branch', supplied.target]);
    if (supplied.branch === supplied.target) throw new Error('开发分支与目标分支必须不同。');
    const base = (await git(sourceRoot, ['rev-parse', '--verify', `${supplied.base}^{commit}`])).trim();
    // Target existence is checked without fetching or changing source refs.
    const targetHead = (await git(sourceRoot, ['rev-parse', '--verify', `refs/heads/${supplied.target}^{commit}`])).trim();
    if (supplied.remote && !(await git(sourceRoot, ['remote'])).split(/\r?\n/u).includes(supplied.remote)) throw new Error('指定远端未配置。');
    let existing = false;
    try { await git(sourceRoot, ['show-ref', '--verify', `refs/heads/${supplied.branch}`]); existing = true; } catch { /* New branch. */ }
    if (existing) throw new Error(`开发分支已存在；不能占用：${supplied.branch}`);
    const destination = metadata.mode === 'project' ? container : `${container}/${supplied.id === '.' ? 'management' : `repositories/${supplied.id}`}`;
    const targetRoot = await assertSafePath(root, destination);
    try { await lstat(targetRoot); throw new Error(`活动目录已存在：${destination}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const transfers: TransferPlan[] = [];
    const sourceIndex = new Map<string, string[]>();
    if (supplied.transfers?.length) {
      const entries = (await git(sourceRoot, ['ls-files', '--stage', '-z', '--', ...supplied.transfers.map(item => item.path)])).split('\0').filter(Boolean);
      for (const indexed of entries) {
        const match = /^(\d+) [a-f0-9]+ (\d)\t(.+)$/u.exec(indexed);
        if (!match) throw new Error('无法核对交接文件索引模式。');
        const previous = sourceIndex.get(match[3]!) ?? [];
        previous.push(`${match[1]}:${match[2]}`);
        sourceIndex.set(match[3]!, previous);
      }
    }
    const baseline = await readGitFiles(sourceRoot, base, (supplied.transfers ?? []).map(item => item.path), blobDigest);
    for (const transfer of supplied.transfers ?? []) {
      const indexed = sourceIndex.get(transfer.path);
      if (indexed && (indexed.length !== 1 || indexed[0] !== '100644:0')) throw new Error(`交接不支持索引冲突、执行位、子模块或链接：${transfer.path}`);
      const ignored = await git(sourceRoot, ['check-ignore', '--no-index', '--', transfer.path]).catch((error: unknown) => {
        if ((error as { code?: number }).code === 1) return '';
        throw error;
      });
      if (ignored) throw new Error(`不能交接被忽略的文件：${transfer.path}`);
      const source = await regularBytes(sourceRoot, transfer.path);
      if (source && (source.includes(0) || !Buffer.from(source.toString('utf8'), 'utf8').equals(source))) throw new Error('二进制交接暂不支持；请先形成获授权的基线提交。');
      const before = baseline.get(transfer.path) ?? null;
      const after = source ? digest(source) : null;
      if ((transfer.operation === 'add' && (before !== null || after === null)) ||
          (transfer.operation === 'modify' && (before === null || after === null || before === after)) ||
          (transfer.operation === 'delete' && (before === null || after !== null))) throw new Error(`交接操作与基线/当前文件不一致：${transfer.path}`);
      transfers.push({ ...transfer, before, after });
    }
    repositories.push({ id: supplied.id, role: metadata.mode === 'workspace' && supplied.id === '.' ? 'management' : 'business',
      base, branch: supplied.branch, target: supplied.target, ...(supplied.remote ? { remote: supplied.remote } : {}),
      sourceRoot, commonDir: identity.commonDir, root: targetRoot, sourceHead: (await git(sourceRoot, ['rev-parse', 'HEAD'])).trim(), targetHead,
      sourceState: await sourceState(sourceRoot), transfers });
  }
  const recordRoot = repositories.find(item => item.id === '.')?.root ?? root;
  // Every active work/control file must survive relocation, including untracked approvals.
  if (recordRoot !== root) {
    const owner = repositories.find(item => item.id === '.')!;
    const required = new Set([META, ...Object.keys(metadata.managedFiles), ...await listFiles(root, '.tiller/rules'), ...await listFiles(root, `.tiller/work/${id}`)]);
    const registryText = await readTextIfExists(root, `.tiller/work/${id}/confirmations.json`);
    const collectReferences = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (!Array.isArray(value)) {
        const object = value as Record<string, unknown>;
        if (object.repository === '.' && typeof object.path === 'string') required.add(object.path);
      }
      for (const child of Object.values(value)) collectReferences(child);
    };
    collectReferences(JSON.parse(registryText!));
    collectReferences(parseWorkRecord((await readWorkRecordText(root, id))!, id));
    const sources = new Map<string, string>();
    for (const filename of required) {
      const source = await regularBytes(root, filename);
      const transfer = owner.transfers.find(item => item.path === filename);
      if (transfer?.after === (source ? digest(source) : null)) continue;
      if (!source) throw new Error(`活动资料未包含在基线或交接清单中：${filename}`);
      sources.set(filename, digest(source));
    }
    const baseline = await readGitFiles(root, owner.base, [...sources.keys()], blobDigest);
    for (const [filename, source] of sources) {
      if (baseline.get(filename) !== source) throw new Error(`活动资料未包含在基线或交接清单中：${filename}`);
    }
  }
  return { schemaVersion: 1, action: 'prepare', workId: id, anchorRoot: root, recordRoot, mode: metadata.mode,
    designRequest: input.designRequest, inputDigest: sha256(JSON.stringify(input)), metadataDigest: sha256((await readTextIfExists(root, META))!), repositories };
}

async function listFiles(root: string, relative: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(await assertSafePath(root, relative), { withFileTypes: true })) {
    const filename = `${relative}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await listFiles(root, filename));
    else { await regularBytes(root, filename); result.push(filename); }
  }
  return result.sort();
}

export async function planDeliveryPreparation(rootInput: string, id: string, value: unknown): Promise<PreparationPlan> {
  validateWorkId(id);
  const input = parseInput(value);
  const location = await locateDelivery(rootInput, id);
  if (location) throw new Error('隔离环境已准备；使用 delivery-status 核对活动身份，不重复创建。');
  const root = path.resolve(rootInput);
  return withProjectLock(root, async () => {
    const contents = await planContents(root, id, input);
    const plan: PreparationPlan = { ...contents, planId: sha256(JSON.stringify(contents)) };
    const filename = `.tiller/local/delivery/${id}/prepare-${plan.planId}.json`;
    const previous = await readTextIfExists(root, filename);
    if (previous && JSON.stringify(JSON.parse(previous)) !== JSON.stringify(plan)) throw new Error('准备计划摘要冲突。');
    if (!previous) await localWrite(root, filename, plan);
    return plan;
  });
}

async function verifyPreparedRepository(repo: RepositoryPlan): Promise<void> {
  const identity = await gitIdentity(repo.root);
  if (!await samePath(identity.commonDir, repo.commonDir) ||
      (await git(repo.root, ['symbolic-ref', '--short', 'HEAD'])).trim() !== repo.branch ||
      (await git(repo.root, ['rev-parse', 'HEAD'])).trim() !== repo.base) throw new Error('已创建环境身份、分支或基线发生变化，保留现场。');
}

async function copyTransfers(repo: RepositoryPlan): Promise<void> {
  await assertSharedWritePaths(repo.root, repo.transfers.map(transfer => transfer.path));
  for (const transfer of repo.transfers) {
    const source = await regularBytes(repo.sourceRoot, transfer.path);
    if ((source ? digest(source) : null) !== transfer.after) throw new Error(`交接来源已变化：${transfer.path}`);
    const current = await regularBytes(repo.root, transfer.path);
    const currentDigest = current ? digest(current) : null;
    if (currentDigest === transfer.after) continue;
    if (currentDigest !== transfer.before) throw new Error(`交接目标含不同内容：${transfer.path}`);
    const filename = await assertSafePath(repo.root, transfer.path);
    if (source === null) await unlink(filename);
    else {
      await mkdir(path.dirname(filename), { recursive: true });
      const temporary = `${transfer.path}.tiller-${randomUUID()}.tmp`;
      const handle = await open(await assertSafePath(repo.root, temporary), 'wx', 0o600);
      try { await handle.writeFile(source); await handle.sync(); } finally { await handle.close(); }
      const beforeWrite = await regularBytes(repo.root, transfer.path);
      if ((beforeWrite ? digest(beforeWrite) : null) !== transfer.before) throw new Error(`交接目标正在变化：${transfer.path}`);
      await rename(await assertSafePath(repo.root, temporary), filename);
    }
  }
  await assertSharedWritePaths(repo.root, repo.transfers.map(transfer => transfer.path));
}

export async function applyDeliveryPreparation(rootInput: string, id: string, value: unknown, planId: string) {
  validateWorkId(id);
  if (!/^[a-f0-9]{64}$/u.test(planId)) throw new Error('准备计划标识无效。');
  const input = parseInput(value);
  const existing = await locateDelivery(rootInput, id);
  const root = existing?.anchorRoot ?? path.resolve(rootInput);
  return withProjectLock(root, async () => {
    if (existing) {
      const context = await loadDeliveryContext(root, id);
      const event = context.record.events.find(item => item.action === 'prepare' && item.details.planId === planId && item.state === 'succeeded');
      if (!event || event.details.inputDigest !== sha256(JSON.stringify(input))) throw new Error('已有活动环境与请求计划不一致。');
      return { changed: false, ...context };
    }
    const text = await readTextIfExists(root, `.tiller/local/delivery/${id}/prepare-${planId}.json`);
    if (!text) throw new Error('准备计划不存在。');
    const plan = JSON.parse(text) as PreparationPlan;
    const { planId: storedId, ...contents } = plan;
    if (storedId !== planId || sha256(JSON.stringify(contents)) !== planId || plan.inputDigest !== sha256(JSON.stringify(input)) ||
        plan.workId !== id || !await samePath(plan.anchorRoot, root)) throw new Error('准备计划、输入或工程身份不一致。');
    if (sha256((await readTextIfExists(root, META)) ?? '') !== plan.metadataDigest) throw new Error('工程元信息已变化，重新准备。');
    const metadata = await readProjectMetadata(root);
    const design = await checkDesign(root, id, input.designRequest, input.repositories.map(item => item.id));
    await assertConfirmationSharing(root, [design]);
    const journalName = `.tiller/local/delivery/${id}/preparation.json`;
    const savedJournal = await readTextIfExists(root, journalName);
    const journal: { schemaVersion: 1; planId: string; state: string; created: string[]; creating?: string; error?: string } = savedJournal ? JSON.parse(savedJournal) : { schemaVersion: 1, planId, state: 'running', created: [] };
    if (journal.schemaVersion !== 1 || journal.planId !== planId) throw new Error('存在其他未完成准备操作，请先核对恢复记录。');
    for (const repo of plan.repositories) {
      const expectedSource = repo.id === '.' ? root : await assertSafePath(root, repositoryPath(metadata, repo.id));
      const destination = plan.mode === 'project' ? `.tiller/local/worktrees/${id}` : `.tiller/local/worktrees/${id}/${repo.id === '.' ? 'management' : `repositories/${repo.id}`}`;
      if (!await samePath(repo.sourceRoot, expectedSource) || path.resolve(repo.root) !== await assertSafePath(root, destination)) throw new Error('计划中的仓库或活动路径不属于本工程。');
      const identity = await gitIdentity(repo.sourceRoot);
      if (!await samePath(identity.commonDir, repo.commonDir) || (await git(repo.sourceRoot, ['rev-parse', 'HEAD'])).trim() !== repo.sourceHead ||
          (await git(repo.sourceRoot, ['rev-parse', '--verify', `refs/heads/${repo.target}^{commit}`])).trim() !== repo.targetHead ||
          await sourceState(repo.sourceRoot) !== repo.sourceState) throw new Error('来源仓库内容或身份已变化，计划过期。');
      for (const transfer of repo.transfers) {
        const bytes = await regularBytes(repo.sourceRoot, transfer.path);
        if ((bytes ? digest(bytes) : null) !== transfer.after) throw new Error('交接来源已变化，计划过期。');
      }
      await assertSharedWritePaths(repo.sourceRoot, repo.transfers.map(transfer => transfer.path));
    }
    await localWrite(root, journalName, journal);
    try {
      for (const repo of plan.repositories) {
        const relative = path.relative(root, repo.root).split(path.sep).join('/');
        await assertSafePath(root, relative);
        let created = journal.created.includes(repo.id);
        if (!created) {
          try {
            await lstat(repo.root);
            // A crash may occur after Git succeeds but before its journal receipt.
            if (journal.creating !== repo.id) throw new Error('活动目录被其他操作占用，不能接管。');
            await verifyPreparedRepository(repo);
            created = true;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          if (!created) {
            journal.creating = repo.id;
            await localWrite(root, journalName, journal);
            await mkdir(path.dirname(repo.root), { recursive: true });
            await git(repo.sourceRoot, ['worktree', 'add', '-b', repo.branch, '--', repo.root, repo.base]);
          }
          journal.created.push(repo.id);
          delete journal.creating;
          await localWrite(root, journalName, journal);
        }
        await verifyPreparedRepository(repo);
        await copyTransfers(repo);
      }
      const location: DeliveryLocation = { schemaVersion: 1, anchorRoot: root, recordRoot: plan.recordRoot, workId: id,
        mode: plan.mode, state: 'active', bindings: Object.fromEntries(plan.repositories.map(repo => [repo.id, { root: repo.root, sourceRoot: repo.sourceRoot, commonDir: repo.commonDir }])) };
      await runWithDeliveryBinding(location, async () => {
        await readProjectMetadata(plan.recordRoot);
        const currentDesign = await checkDesign(plan.recordRoot, id, input.designRequest, input.repositories.map(item => item.id));
        await assertConfirmationSharing(plan.recordRoot, [currentDesign]);
      });
      const record: DeliveryRecord = { schemaVersion: 2, workId: id, mode: plan.mode, designRequest: input.designRequest,
        createdAt: new Date().toISOString(), repositories: plan.repositories.map(repo => ({ id: repo.id, role: repo.role, base: repo.base, branch: repo.branch, target: repo.target, ...(repo.remote ? { remote: repo.remote } : {}) })),
        events: [{ id: '1', action: 'prepare', state: 'succeeded', at: new Date().toISOString(), details: { planId, inputDigest: plan.inputDigest, transferManifest: plan.repositories.map(repo => ({ repository: repo.id, files: repo.transfers })) } }] };
      const context: DeliveryContext = { anchorRoot: root, recordRoot: plan.recordRoot, workId: id, record, recordText: null, bindings: location.bindings };
      const priorRecord = await readTextIfExists(plan.recordRoot, `.tiller/work/${id}/delivery.json`);
      if (priorRecord) {
        const prior = JSON.parse(priorRecord) as DeliveryRecord;
        if (prior.schemaVersion !== 2) throw Object.assign(new Error('交付记录仅支持版本 2；请创建新工作，不支持迁移旧记录。'), { code: 'UNSUPPORTED_RECORD_VERSION' });
        if (prior.events?.[0]?.details.planId !== planId) throw new Error('交接目标已有其他交付记录。');
        context.record = prior;
        context.recordText = priorRecord;
      } else await saveDeliveryRecord(context, record);
      // Shared handoff evidence precedes the local activation pointer.
      for (const repo of plan.repositories) {
        const identity = await gitIdentity(repo.root);
        const filename = path.join(identity.gitDir, 'tiller-binding.json');
        const marker = JSON.stringify({ schemaVersion: 1, anchorRoot: root, workId: id }) + '\n';
        try {
          const handle = await open(filename, 'wx', 0o600);
          try { await handle.writeFile(marker); await handle.sync(); } finally { await handle.close(); }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(filename, 'utf8') !== marker) throw new Error('Git 本机定位冲突，保留现场。');
        }
      }
      await localWrite(root, bindingPath(id), location);
      journal.state = 'succeeded';
      delete journal.error;
      await localWrite(root, journalName, journal);
      return { changed: true, ...context };
    } catch (error) {
      journal.state = 'failed';
      journal.error = '准备未完成；保留已创建副本，核对相同计划后恢复。';
      await localWrite(root, journalName, journal);
      throw error;
    }
  });
}

/** Keep one freshly resolved delivery identity for the complete read/preview operation. */
export async function withDeliveryContext<T>(root: string, id: string, callback: (context: DeliveryContext) => Promise<T>): Promise<T> {
  const location = await locateDelivery(root, id);
  if (!location) throw new Error('尚未准备隔离交付环境，或本机定位尚未恢复。');
  return runWithDeliveryBinding(location, async () => callback(await loadDeliveryContext(location.recordRoot, id)));
}
export async function loadDeliveryContext(root: string, id: string): Promise<DeliveryContext> {
  const location = await locateDelivery(root, id);
  if (!location) throw new Error('尚未准备隔离交付环境，或本机定位尚未恢复。');
  const workText = await readWorkRecordText(location.recordRoot, id);
  if (!workText) throw Object.assign(new Error('交付需要当前格式的工作登记。'), { code: 'WORK_NOT_FOUND' });
  const work = parseWorkRecord(workText, id);
  await loadWorkflowSnapshot(location.recordRoot, work);
  const text = await readTextIfExists(location.recordRoot, `.tiller/work/${id}/delivery.json`);
  if (!text) throw new Error('活动交付记录缺失，不能生成第二份历史。');
  const record = JSON.parse(text) as DeliveryRecord;
  if (record.schemaVersion !== 2) throw Object.assign(new Error('交付记录仅支持版本 2；请创建新工作，不支持迁移旧记录。'), { code: 'UNSUPPORTED_RECORD_VERSION' });
  if (Object.keys(record).some(key => !['schemaVersion', 'workId', 'mode', 'designRequest', 'createdAt', 'repositories', 'events'].includes(key))) throw new Error('交付记录包含未知字段。');
  if (record.schemaVersion !== 2 || record.workId !== id || record.mode !== location.mode || !Array.isArray(record.repositories) || !Array.isArray(record.events)) throw new Error('交付记录格式不支持或身份不一致。');
  for (const repo of record.repositories) {
    if (!work.scope.repositories.includes(repo.id)) throw new Error('交付仓库超出登记工作范围。');
    const binding = location.bindings[repo.id];
    if (!binding) throw new Error('交付仓库缺少本机定位。');
    if (binding.root !== binding.sourceRoot && (await git(binding.root, ['symbolic-ref', '--short', 'HEAD'])).trim() !== repo.branch) throw new Error('活动仓库分支已变化。');
  }
  return { anchorRoot: location.anchorRoot, recordRoot: location.recordRoot, workId: id, record, recordText: text, bindings: location.bindings };
}

/** Caller holds the anchor lock; shared record uses the existing recoverable transaction writer. */
export async function saveDeliveryRecord(context: DeliveryContext, record: DeliveryRecord): Promise<void> {
  if (record.schemaVersion !== 2 || record.workId !== context.workId) throw new Error('交付记录身份无效。');
  const workText = await readWorkRecordText(context.recordRoot, context.workId);
  if (!workText) throw Object.assign(new Error('交付需要当前格式的工作登记。'), { code: 'WORK_NOT_FOUND' });
  const work = parseWorkRecord(workText, context.workId);
  await loadWorkflowSnapshot(context.recordRoot, work);
  if (record.repositories.some(repo => !work.scope.repositories.includes(repo.id))) throw new Error('交付仓库超出登记工作范围。');
  const filename = `.tiller/work/${context.workId}/delivery.json`;
  const before = await readTextIfExists(context.recordRoot, filename);
  if (before !== null && JSON.parse(before).schemaVersion !== 2) throw Object.assign(new Error('交付记录版本不支持；保留原文件，不迁移。'), { code: 'UNSUPPORTED_RECORD_VERSION' });
  if (before !== context.recordText) throw Object.assign(new Error('交付记录在读取后发生变化，重新核对再操作。'), { code: 'CONTENT_CHANGED' });
  const after = JSON.stringify(record, null, 2) + '\n';
  await applyChanges(context.recordRoot, [{ path: filename, before, after }]);
  context.record = record;
  context.recordText = after;
}

export async function withDeliveryLock<T>(root: string, id: string, callback: (context: DeliveryContext) => Promise<T>): Promise<T> {
  const location = await locateDelivery(root, id);
  if (!location) throw new Error('尚未准备隔离交付环境。');
  return withProjectLock(location.anchorRoot, async () => {
    const refreshed = await withoutDeliveryBinding(() => locateDelivery(location.anchorRoot, id));
    if (!refreshed) throw new Error('取得锁后活动定位缺失。');
    return runWithDeliveryBinding(refreshed, async () => callback(await loadDeliveryContext(refreshed.recordRoot, id)));
  });
}

export async function deliveryStatus(root: string, id: string) {
  const context = await loadDeliveryContext(root, id);
  const repositories = await Promise.all(context.record.repositories.map(async repo => {
    const binding = context.bindings[repo.id]!;
    return { ...repo, head: (await git(binding.root, ['rev-parse', 'HEAD'])).trim(), changes: await git(binding.root, ['status', '--porcelain=v1']), root: binding.root };
  }));
  return { workId: id, mode: context.record.mode, recordRoot: context.recordRoot, repositories, events: context.record.events, remoteQueried: false };
}

/** Does not copy/overwrite records: archiving must be verified before cleanup changes ownership. */
export async function rebindDeliveryAfterCleanup(context: DeliveryContext, repository: string): Promise<void> {
  const binding = context.bindings[repository];
  if (!binding) throw new Error('清理仓库未登记。');
  const identity = await gitIdentity(binding.sourceRoot);
  if (!await samePath(identity.commonDir, binding.commonDir)) throw new Error('原仓库身份已变化。');
  const location = parseDeliveryLocation((await readTextIfExists(context.anchorRoot, bindingPath(context.workId)))!);
  if (context.recordRoot === binding.root) {
    const prefix = `.tiller/work/${context.workId}`;
    const activeFiles = await listFiles(context.recordRoot, prefix);
    const sourceFiles = await listFiles(binding.sourceRoot, prefix);
    if (JSON.stringify(activeFiles) !== JSON.stringify(sourceFiles)) throw new Error('共同资料尚未归档到原目录，禁止清理唯一活动记录。');
    for (const filename of activeFiles) {
      if (!(await readFile(await assertSafePath(context.recordRoot, filename))).equals(await readFile(await assertSafePath(binding.sourceRoot, filename)))) throw new Error(`归档内容不一致：${filename}`);
    }
    location.recordRoot = binding.sourceRoot;
    context.recordRoot = binding.sourceRoot;
  }
  location.bindings[repository] = { ...binding, root: binding.sourceRoot };
  await localWrite(context.anchorRoot, bindingPath(context.workId), location);
  context.bindings = location.bindings;
}
