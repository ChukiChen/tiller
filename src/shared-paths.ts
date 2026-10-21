import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { assertSafePaths, readTextIfExists } from './files.js';

export interface SharedWriteProof {root: string; paths: readonly string[]}
/** Merge declared paths before any eligibility I/O; no proof result is retained. */
export async function assertSharedWriteProofs(proofs: readonly SharedWriteProof[]): Promise<void> {
  const roots = new Map<string, Set<string>>();
  for (const proof of proofs) {
    const root = path.resolve(proof.root); const paths = roots.get(root) ?? new Set<string>();
    for (const relative of proof.paths) paths.add(relative);
    roots.set(root, paths);
  }
  for (const [root, paths] of roots) await assertSharedWritePaths(root, [...paths]);
}

function gitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C' };
  delete environment.GIT_DIR;
  delete environment.GIT_WORK_TREE;
  delete environment.GIT_COMMON_DIR;
  return environment;
}

async function checkWithoutGit(root: string): Promise<void> {
  const ignore = await readTextIfExists(root, '.gitignore');
  const patterns = ignore?.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#')) ?? [];
  if (patterns.some(line => line !== '/.tiller/local/')) {
    throw new Error('Git 不可用，无法核对现有忽略规则是否排除共享资料；请先检查忽略配置。');
  }
  let ancestor = path.resolve(root);
  while (true) {
    try {
      await lstat(path.join(ancestor, '.git'));
      throw new Error('Git 不可用，无法核对 Git 工程的共享资料忽略状态。');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return;
    ancestor = parent;
  }
}

/** Fresh discovery, including physical ancestors and bare-repository candidates.
 * Any marker (even malformed) is left to Git; only proven absence avoids a process.
 */
async function hasRepositoryCandidate(root: string): Promise<boolean> {
  let current = await realpath(root);
  while (true) {
    for (const name of ['.git', 'HEAD']) {
      try { await lstat(path.join(current, name)); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/** Shared-data eligibility belongs to write/registration and explicit delivery checks. */
export async function assertSharedWritePaths(root: string, relatives: readonly string[]): Promise<void> {
  if (!relatives.length) return;
  const paths = [...new Set(relatives)];
  await assertSafePaths(root, paths);
  if (!await hasRepositoryCandidate(root)) {
    const ignore = await readTextIfExists(root, '.gitignore');
    const patterns = ignore?.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#')) ?? [];
    // Explicit Git configuration and nontrivial ignore policies still require
    // Git's own diagnostics, even when repository discovery found no marker.
    if (patterns.every(line => line === '/.tiller/local/')
      && !Object.keys(process.env).some(name => /^GIT_CONFIG(?:$|_)/u.test(name))) return;
  }
  let ignored: string;
  try {
    ignored = await new Promise<string>((resolve, reject) => {
      const child = execFile('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
        cwd: root, env: gitEnvironment(), windowsHide: true, timeout: 10000,
        maxBuffer: 16 * 1024 * 1024, encoding: 'utf8',
      }, (error, stdout, stderr) => {
        if (!error || error.code === 1) resolve(stdout);
        else reject(Object.assign(error, { stderr }));
      });
      child.stdin!.on('error', error => {
        if ((error as NodeJS.ErrnoException).code !== 'EPIPE') reject(error);
      });
      child.stdin!.end(`${paths.join('\0')}\0`, 'utf8');
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return checkWithoutGit(root);
    if ((error as { stderr?: string }).stderr?.includes('not a git repository')) return;
    throw new Error(`无法核对共享资料的 Git 状态：${(error as Error).message}`);
  }
  const excluded = ignored.split('\0').filter(Boolean);
  if (excluded.length) throw new Error(`共享资料被 Git 忽略，未修改现有规则：${excluded.join('、')}`);
}
