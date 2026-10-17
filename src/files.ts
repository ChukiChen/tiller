import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { FileChange } from './types.js';
import { resolveDeliveryLockRoot } from './delivery-location.js';

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
  validateRelativePath(relative);
  const absoluteRoot = path.resolve(root);
  const rootStat = await lstat(absoluteRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`工程根目录必须是普通目录：${absoluteRoot}`);
  }
  let current = absoluteRoot;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`拒绝通过符号链接访问：${current}`);
      if (index < parts.length - 1 && !stat.isDirectory()) {
        throw new Error(`父路径不是目录：${current}`);
      }
      if (stat.isFile() && stat.nlink > 1) throw new Error(`拒绝操作硬链接文件：${current}`);
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
  }
  return path.join(absoluteRoot, ...parts);
}

export async function readTextIfExists(root: string, relative: string): Promise<string | null> {
  const target = await assertSafePath(root, relative);
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`不是普通文件：${relative}`);
    const bytes = await readFile(target);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`文件不是有效 UTF-8：${relative}`);
    return text;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
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
  root = await resolveDeliveryLockRoot(root);
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
  for (const change of effective) {
    if (await readTextIfExists(root, change.path) !== change.before) throw new Error(`文件已变化：${change.path}`);
  }
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
