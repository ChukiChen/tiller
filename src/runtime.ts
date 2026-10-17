import { createRequire } from 'node:module';
import { realpath, open, rename, unlink, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseMetadata, matchesManagedDigest } from './core.js';
import { assertSafePath, readTextIfExists, withProjectLock } from './files.js';

export interface RuntimeStatus {
  ready: boolean;
  cliPath?: string;
  version?: string;
  sourceRoot?: string;
  issues: string[];
}
const runtime = createRequire(import.meta.url)('../resources/run.cjs') as {
  resolveRuntime(root: string): RuntimeStatus;
  validateCli(path: string): { cliPath: string; version: string };
  validateBinding(value: unknown, root: string): unknown;
};

export async function runtimeStatus(root: string): Promise<RuntimeStatus> {
  const status = runtime.resolveRuntime(resolve(root));
  try {
    const launcher = await readTextIfExists(resolve(root), '.tiller/run.cjs');
    if (launcher === null) {
      return { ...status, ready: false, issues: [...status.issues, '共享启动器不存在；请显式升级工程资源后使用 node .tiller/run.cjs。'] };
    }
    const metadataText = await readTextIfExists(resolve(root), '.tiller/project.json');
    if (!metadataText) throw new Error('工程元信息不存在，无法验证共享启动器。');
    const digest = parseMetadata(metadataText).managedFiles['.tiller/run.cjs'];
    if (!digest || !matchesManagedDigest('.tiller/run.cjs', launcher, digest)) {
      throw new Error('共享启动器与工程登记摘要不符；请核对修改后通过升级或恢复修复，保留当前文件。');
    }
  } catch (error) { return { ...status, ready: false, issues: [...status.issues, (error as Error).message] }; }
  return status;
}

export async function bindRuntime(inputRoot: string, currentCli: string): Promise<RuntimeStatus> {
  const root = resolve(inputRoot);
  const cli = runtime.validateCli(await realpath(currentCli));
  await withProjectLock(root, async () => {
    const relative = '.tiller/local/runtime.json';
    const original = await readTextIfExists(root, relative);
    if (original !== null) runtime.validateBinding(JSON.parse(original), root);
    const content = JSON.stringify({ schemaVersion: 1, projectRoot: root, cliPath: cli.cliPath }, null, 2) + '\n';
    if (content === original) return;
    // Delivery locking can route to the anchor; this checkout still owns its local binding.
    await mkdir(await assertSafePath(root, '.tiller/local'), { recursive: true });
    await assertSafePath(root, '.tiller/local');
    const ignorePath = await assertSafePath(root, '.tiller/local/.gitignore');
    try {
      const ignore = await open(ignorePath, 'wx', 0o600);
      try { await ignore.writeFile('*\n', 'utf8'); } finally { await ignore.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const contents = await readTextIfExists(root, '.tiller/local/.gitignore');
      const patterns = contents?.split(/\r?\n/u).filter(line => line.trim() && !line.startsWith('#'));
      if (!patterns?.length || patterns.some(line => line !== '*')) throw new Error('本机忽略文件未排除所有数据，请先协调 .tiller/local/.gitignore。');
    }
    const temporaryRelative = `.tiller/local/runtime-${randomUUID()}.tmp`;
    const temporary = await assertSafePath(root, temporaryRelative);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(content, 'utf8'); await file.sync(); } finally { await file.close(); }
    try {
      if (await readTextIfExists(root, relative) !== original) throw new Error('本机 CLI 登记已变化，保留原文件。');
      await rename(temporary, await assertSafePath(root, relative));
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  });
  return runtimeStatus(root);
}
