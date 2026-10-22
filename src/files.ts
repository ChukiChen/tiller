import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { FileChange } from './types.js';
import { META, parseMetadata } from './project-metadata.js';
import { assertSharedWritePaths } from './shared-paths.js';

export type { FileChange } from './types.js';

const LOCAL = '.tiller/local';
const LOCK = `${LOCAL}/lock.json`;
const JOURNAL = `${LOCAL}/transaction.json`;

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function validateRelativePath(relative: string): void {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
      relative.includes('\\') || /[\x00-\x1f<>:"|?*]/u.test(relative)) {
    throw new Error(`不安全的相对路径：${relative}`);
  }
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/u.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)) {
      throw new Error(`不安全的路径片段：${relative}`);
    }
  }
}

/** Resolve only project-relative paths; reject links at every existing component. */
export async function assertSafePath(root: string, relative: string): Promise<string> {
  return (await assertSafePaths(root, [relative]))[0]!;
}

export interface ResolvedInputPath {
  target: string;
  stat: Awaited<ReturnType<typeof lstat>> | null;
}

/** Resolve a declared batch, visiting each common parent only once within this call. */
export async function inspectSafePaths(root: string, relatives: readonly string[]): Promise<ResolvedInputPath[]> {
  relatives.forEach(validateRelativePath);
  if (!relatives.length) return [];
  const absoluteRoot = path.resolve(root);
  const rootStat = await lstat(absoluteRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`工程根目录必须是普通目录：${absoluteRoot}`);
  }
  const visited = new Map<string, Promise<Awaited<ReturnType<typeof lstat>> | null>>();
  return mapInputBatch(relatives, async relative => {
    let current = absoluteRoot;
    let finalStat: Awaited<ReturnType<typeof lstat>> | null = null;
    const parts = relative.split('/');
    for (const [index, part] of parts.entries()) {
      current = path.join(current, part);
      let pending = visited.get(current);
      if (pending === undefined) {
        pending = lstat(current).catch(error => { if (!isMissing(error)) throw error; return null; });
        visited.set(current, pending);
      }
      const stat = await pending;
      if (stat === null) break;
      if (stat.isSymbolicLink()) throw new Error(`拒绝通过符号链接访问：${current}`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`父路径不是目录：${current}`);
      if (stat.isFile() && stat.nlink > 1) throw new Error(`拒绝操作硬链接文件：${current}`);
      if (index === parts.length - 1) finalStat = stat;
    }
    return { target: path.join(absoluteRoot, ...parts), stat: finalStat };
  });
}

/** Preserve sequential I/O; gains come from declaring each common input once. */
async function mapInputBatch<T, R>(inputs: readonly T[], read: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const [index, input] of inputs.entries()) results.push(await read(input, index));
  return results;
}

export async function assertSafePaths(root: string, relatives: readonly string[]): Promise<string[]> {
  return (await inspectSafePaths(root, relatives)).map(input => input.target);
}

export interface TextInput {
  path: string;
  text: string | null;
}

export interface TextInputOptions { maxBytes?: number }

function validateTextLimit(maxBytes: number | undefined): void {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) throw new Error('maxBytes 必须为非负安全整数。');
}

/** Explicit provisional bytes owned by one operation. Proofs always read independently. */
export class TextReadInput {
  private readonly roots = new Map<string, Map<string, {value: Promise<TextInput>; maximum: number}>>();

  async read(root: string, relatives: readonly string[], options: TextInputOptions): Promise<TextInput[]> {
    validateTextLimit(options.maxBytes); relatives.forEach(validateRelativePath);
    const absolute = path.resolve(root); const entries = this.roots.get(absolute) ?? new Map();
    this.roots.set(absolute, entries);
    const missing = [...new Set(relatives)].filter(relative => !entries.has(relative));
    if (missing.length) {
      const loaded = readTextInputs(absolute, missing, options);
      for (const [index, relative] of missing.entries()) {
        const entry = {value: loaded.then(values => ({...values[index]!})), maximum: options.maxBytes ?? Infinity};
        entries.set(relative, entry);
        void entry.value.catch(() => { if (entries.get(relative) === entry) entries.delete(relative); });
      }
    }
    const result: TextInput[] = [];
    for (const relative of relatives) {
      const entry = entries.get(relative)!;
      entry.maximum = Math.min(entry.maximum, options.maxBytes ?? Infinity);
      const input = await entry.value;
      if (input.text !== null && options.maxBytes !== undefined && Buffer.byteLength(input.text) > options.maxBytes)
        throw new Error(`文件超过读取大小限制：${relative}（最多 ${options.maxBytes} 字节）。`);
      result.push({...input});
    }
    return result;
  }

  async proofs(): Promise<TextProof[]> {
    const proofs: TextProof[] = [];
    for (const [root, entries] of this.roots) for (const entry of entries.values()) {
      const input = await entry.value;
      proofs.push({root, inputs: [{...input}], ...(Number.isFinite(entry.maximum) ? {maxBytes: entry.maximum} : {}),
        control: input.path.endsWith('.json')});
    }
    return proofs;
  }

  declared(root: string, relative: string): Promise<TextInput> | undefined {
    return this.roots.get(path.resolve(root))?.get(relative)?.value.then(input => ({...input}));
  }
}

export interface TextProof {
  root: string; inputs: readonly (TextInput | {path: string; sha256: string | null})[];
  maxBytes?: number; control?: boolean; onChanged?: () => never;
  verifyAfter?: {key: object; run: () => Promise<void>};
}
/** A single boundary declares all expected bytes before doing any proof I/O.
 * Materials precede controls; duplicate declarations retain the strictest bound.
 */
export async function proveTextInputs(proofs: readonly TextProof[]): Promise<void> {
  type Entry = {path: string; expected: string | null; maxBytes?: number; control: boolean; onChanged: (() => never) | undefined};
  const roots = new Map<string, Map<string, Entry>>();
  for (const proof of proofs) {
    validateTextLimit(proof.maxBytes);
    const root = path.resolve(proof.root); const entries = roots.get(root) ?? new Map<string, Entry>();
    roots.set(root, entries);
    for (const input of proof.inputs) {
      const expected = 'sha256' in input ? input.sha256 : input.text === null ? null : createHash('sha256').update(input.text).digest('hex');
      const observedMaximum = 'text' in input ? Math.max(4 * 1024 * 1024, input.text === null ? 0 : Buffer.byteLength(input.text)) : Infinity;
      const prior = entries.get(input.path);
      if (prior && prior.expected !== expected) throw Object.assign(new Error('同一边界的材料声明不一致，请重新检查。'), {code: 'INPUT_CHANGED'});
      entries.set(input.path, {path: input.path, expected, control: !!proof.control || !!prior?.control,
        maxBytes: Math.min(proof.maxBytes ?? observedMaximum, prior?.maxBytes ?? Infinity), onChanged: proof.onChanged ?? prior?.onChanged});
    }
  }
  for (const control of [false, true]) for (const [root, entries] of roots) {
    const groups = new Map<number, Entry[]>();
    for (const entry of entries.values()) if (entry.control === control) {
      const maximum = entry.maxBytes ?? Infinity; const group = groups.get(maximum) ?? [];
      group.push(entry); groups.set(maximum, group);
    }
    for (const [maximum, group] of groups) {
      const size = Number.isFinite(maximum) ? Math.max(1, Math.floor(64 * 1024 * 1024 / Math.max(1, maximum))) : 1;
      for (let offset = 0; offset < group.length; offset += size) {
        const batch = group.slice(offset, offset + size);
        const options = Number.isFinite(maximum) ? {maxBytes: maximum} : {};
        let actual: TextInput[];
        try { actual = await readTextInputs(root, batch.map(entry => entry.path), options); }
        catch (error) {
          // Preserve a domain's change error when an observed file becomes unreadable.
          for (const entry of batch) if (entry.onChanged) {
            try { await readTextInputs(root, [entry.path], options); } catch { entry.onChanged(); }
          }
          throw error;
        }
        for (const [index, input] of actual.entries()) {
          const expected = batch[index]!;
          const sha256 = input.text === null ? null : createHash('sha256').update(input.text).digest('hex');
          if (sha256 !== expected.expected) {
            expected.onChanged?.();
            throw Object.assign(new Error(`操作依据已变化，请重新执行：${input.path}`), {code: 'INPUT_CHANGED'});
          }
        }
      }
    }
  }
  const checked = new Set<object>();
  for (const proof of proofs) if (proof.verifyAfter && !checked.has(proof.verifyAfter.key)) {
    checked.add(proof.verifyAfter.key); await proof.verifyAfter.run();
  }
}

/** Collect operation inputs explicitly. No result survives this invocation. */
export async function readTextInputs(root: string, relatives: readonly string[], options: TextInputOptions = {}, materials?: TextReadInput): Promise<TextInput[]> {
  if (materials) return materials.read(root, relatives, options);
  const { maxBytes } = options;
  validateTextLimit(maxBytes);
  const unique = [...new Set(relatives)];
  const paths = await inspectSafePaths(root, unique);
  const inputs: TextInput[] = await mapInputBatch(paths, async (input, index) => {
    const relative = unique[index]!;
    if (input.stat === null) {
      return { path: relative, text: null };
    }
    if (!input.stat.isFile()) throw new Error(`不是普通文件：${relative}`);
    if (maxBytes !== undefined && input.stat.size > maxBytes) throw new Error(`文件超过读取大小限制：${relative}（最多 ${maxBytes} 字节）。`);
    let text: string | null = null;
    try {
      const bytes = await readFile(input.target);
      if (maxBytes !== undefined && bytes.byteLength > maxBytes) throw new Error(`文件超过读取大小限制：${relative}（最多 ${maxBytes} 字节）。`);
      text = bytes.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`文件不是有效 UTF-8：${relative}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return { path: relative, text };
  });
  if (unique.length === relatives.length) return inputs;
  const byPath = new Map(inputs.map(input => [input.path, input.text]));
  return relatives.map(relative => ({ path: relative, text: byPath.get(relative)! }));
}

/** Revalidate precisely the inputs a caller used at its return or commit boundary. */
export async function verifyTextInputs(root: string, inputs: readonly TextInput[], options: TextInputOptions = {}, proofs?: TextProof[], control = false): Promise<void> {
  validateTextLimit(options.maxBytes);
  if (proofs) { proofs.push({root, inputs, ...options, control}); return; }
  const current = await readTextInputs(root, inputs.map(input => input.path), options);
  for (const [index, input] of current.entries()) {
    if (input.text !== inputs[index]!.text) {
      throw Object.assign(new Error(`操作依据已变化，请重新执行：${input.path}`), { code: 'INPUT_CHANGED' });
    }
  }
}

export async function readTextIfExists(root: string, relative: string, inputs?: TextReadInput): Promise<string | null> {
  return (await readTextInputs(root, [relative], {}, inputs))[0]!.text;
}

async function ensureLocal(root: string): Promise<void> {
  const target = await assertSafePath(root, LOCAL);
  await mkdir(target, { recursive: true });
  await assertSafePath(root, LOCAL);
  // Protect local recovery data even if initialization fails before root .gitignore is written.
  const ignore = await assertSafePath(root, `${LOCAL}/.gitignore`);
  try {
    const file = await open(ignore, 'wx', 0o600);
    try { await file.writeFile('*\n', 'utf8'); } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const contents = await readTextIfExists(root, `${LOCAL}/.gitignore`);
    const patterns = contents?.split(/\r?\n/u).filter(line => line.trim() && !line.startsWith('#'));
    if (!patterns?.length || patterns.some(line => line !== '*')) {
      throw new Error('本机目录已有忽略文件未排除所有恢复数据，请先协调 .tiller/local/.gitignore。');
    }
  }
}

/** Serializes this CLI's writes. Stale locks are reclaimed only for a dead local PID. */
export async function withProjectLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  root = path.resolve(root);
  await ensureLocal(root);
  const lockPath = await assertSafePath(root, LOCK);
  const token = randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(lockPath, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ pid: process.pid, token }), 'utf8'); }
      finally { await file.close(); }
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readTextIfExists(root, LOCK);
      let owner: unknown;
      try { owner = JSON.parse(existing ?? ''); } catch { throw new Error('工程锁不可识别，请确认没有运行中的 tiller 后检查本机锁记录。'); }
      if (!owner || typeof owner !== 'object' || !('pid' in owner) ||
          !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0) {
        throw new Error('工程锁格式无效；不能安全接管。');
      }
      try {
        process.kill(Number(owner.pid), 0);
        throw new Error('工程已有 tiller 操作正在运行。');
      } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw probe;
      }
      // Serialize stale-lock reclamation too: two reclaimers must not unlink a new owner's lock.
      const reclaimPath = await assertSafePath(root, `${LOCAL}/lock-recovery.json`);
      let reclaim;
      try { reclaim = await open(reclaimPath, 'wx', 0o600); }
      catch (reclaimError) {
        if ((reclaimError as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new Error('另一个操作正在接管旧锁；若它已中断，请检查 lock-recovery.json 后清理该本机标记。');
        }
        throw reclaimError;
      }
      try {
        await reclaim.writeFile(JSON.stringify({ pid: process.pid, token }), 'utf8');
        if (await readTextIfExists(root, LOCK) !== existing) throw new Error('工程锁已变化，请重试。');
        await unlink(await assertSafePath(root, LOCK));
      } finally {
        await reclaim.close();
        await unlink(await assertSafePath(root, `${LOCAL}/lock-recovery.json`));
      }
    }
  }
  if (!acquired) throw new Error('无法取得工程锁。');
  try { return await fn(); }
  finally {
    const existing = await readTextIfExists(root, LOCK);
    if (existing && (JSON.parse(existing) as { token?: string }).token === token) {
      await unlink(await assertSafePath(root, LOCK));
    }
  }
}

async function replaceFile(root: string, relative: string, expected: string | null, content: string | null): Promise<void> {
  const target = await assertSafePath(root, relative);
  if (await readTextIfExists(root, relative) !== expected) throw new Error(`文件已被修改，保留现状：${relative}`);
  if (content === null) {
    if (expected !== null) await unlink(target);
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await assertSafePath(root, relative);
  const temporaryRelative = `${relative}.tiller-${randomUUID()}.tmp`;
  const temporary = await assertSafePath(root, temporaryRelative);
  const mode = expected === null ? 0o666 : (await lstat(target)).mode & 0o777;
  const file = await open(temporary, 'wx', mode);
  try {
    await file.writeFile(content, 'utf8');
    await file.sync();
  } finally { await file.close(); }
  try {
    if (await readTextIfExists(root, relative) !== expected) throw new Error(`写入前文件已变化：${relative}`);
    await rename(temporary, await assertSafePath(root, relative));
  } finally {
    try { await unlink(temporary); } catch (error) { if (!isMissing(error)) throw error; }
  }
}

function validateChanges(value: unknown): asserts value is FileChange[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10000) throw new Error('文件事务记录格式无效。');
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' ||
        (entry.before !== null && typeof entry.before !== 'string') || typeof entry.after !== 'string') {
      throw new Error('文件事务条目格式无效。');
    }
    validateRelativePath(entry.path);
    const key = entry.path.toLowerCase();
    if (key === '.tiller/local' || key.startsWith('.tiller/local/')) {
      throw new Error('文件事务不能修改其本机恢复记录。');
    }
    // Require the same canonical entry/root spelling on every supported filesystem.
    if (entry.path !== 'AGENTS.md' && entry.path !== '.gitignore' && !entry.path.startsWith('.tiller/')) {
      throw new Error('文件事务只允许修改 tiller 管理资料及工程入口。');
    }
    if (seen.has(key)) throw new Error(`重复文件事务路径：${entry.path}`);
    seen.add(key);
  }
}

export async function hasPendingTransaction(root: string): Promise<boolean> {
  return await readTextIfExists(root, JOURNAL) !== null;
}

/** Caller must hold the project lock; failed writes retain durable before/after recovery data. */
export async function applyChanges(root: string, changes: FileChange[], verify?: () => Promise<void>): Promise<void> {
  if (await hasPendingTransaction(root)) throw new Error('存在未完成事务，请先执行 tiller recover。');
  const effective = changes.filter(change => change.before !== change.after);
  if (!effective.length) return;
  validateChanges(effective);
  const metadataText = await readTextIfExists(root, META);
  if (metadataText !== null) parseMetadata(metadataText);
  const metadataChange = effective.find(change => change.path === META);
  if (metadataChange) parseMetadata(metadataChange.after);
  const current = await readTextInputs(root, effective.map(change => change.path));
  for (const [index, input] of current.entries()) {
    if (input.text !== effective[index]!.before) throw new Error(`文件已变化：${input.path}`);
  }
  await assertSharedWritePaths(root, effective.map(change => change.path));
  // Metadata is an operation prerequisite, including for writes that do not edit it.
  if (await readTextIfExists(root, META) !== metadataText) throw new Error('工程元信息已变化，请重新执行。');
  await ensureLocal(root);
  const journalPath = await assertSafePath(root, JOURNAL);
  const journal = await open(journalPath, 'wx', 0o600);
  try {
    await journal.writeFile(JSON.stringify({ schemaVersion: 1, changes: effective }, null, 2) + '\n', 'utf8');
    await journal.sync();
  } finally { await journal.close(); }
  for (const change of effective) await replaceFile(root, change.path, change.before, change.after);
  if (verify) await verify();
  await unlink(await assertSafePath(root, JOURNAL));
}

/** Caller holds the lock. Validate every file before undoing any transaction writes. */
export async function recoverChanges(root: string): Promise<boolean> {
  const metadataText = await readTextIfExists(root, META);
  if (metadataText !== null) parseMetadata(metadataText);
  const original = await readTextIfExists(root, JOURNAL);
  if (original === null) return false;
  let journal: { schemaVersion?: unknown; changes?: unknown };
  try { journal = JSON.parse(original) as typeof journal; }
  catch { throw new Error('恢复记录不是有效 JSON，保留所有文件。'); }
  if (!journal || journal.schemaVersion !== 1) throw new Error('不支持的恢复记录版本。');
  validateChanges(journal.changes);
  for (const change of journal.changes) {
    const current = await readTextIfExists(root, change.path);
    if (current !== change.before && current !== change.after) {
      throw new Error(`恢复冲突：${change.path} 含后续修改，未覆盖任何文件。`);
    }
  }
  for (const change of [...journal.changes].reverse()) {
    const current = await readTextIfExists(root, change.path);
    if (current === change.after) await replaceFile(root, change.path, change.after, change.before);
    else if (current !== change.before) throw new Error(`恢复期间文件已变化：${change.path}`);
  }
  if (await readTextIfExists(root, JOURNAL) !== original) throw new Error('恢复记录已变化，保留记录等待检查。');
  await unlink(await assertSafePath(root, JOURNAL));
  return true;
}
