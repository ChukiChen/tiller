import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tiller-cli-'));
  t.after(() => {
    const resolved = resolve(root);
    assert.equal(dirname(resolved), resolve(tmpdir()));
    assert.ok(resolved.startsWith(join(resolve(tmpdir()), 'tiller-cli-')));
    rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}

export function put(root, path, content) {
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  assert.ok(rel !== '..' && !rel.startsWith(`..${sep}`));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

function hasRepositoryAncestor(pathname) {
  let current = resolve(pathname);
  while (true) {
    if (existsSync(join(current, '.git')) || existsSync(join(current, 'HEAD'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

// Some CI sandboxes mark the system temp root as a repository. Keep tests that
// exercise non-repository behavior isolated without weakening that check.
export function repositoryFreeFixture(t) {
  const candidates = process.platform === 'win32' ? [tmpdir()] : ['/dev/shm', tmpdir()];
  const base = candidates.find(pathname => existsSync(pathname) && !hasRepositoryAncestor(pathname));
  if (!base) {
    t.skip('No temporary directory without a repository ancestor is available.');
    return null;
  }
  const root = mkdtempSync(join(base, 'tiller-clean-'));
  t.after(() => rmSync(resolve(root), { recursive: true, force: true }));
  return root;
}

export function cli(root, ...args) {
  const result = spawnSync(process.execPath, [cliPath, ...args, '--json'], {
    // Git-backed delivery commands spawn several processes; allow bounded headroom
    // when the full suite runs concurrently on Windows.
    cwd: root, encoding: 'utf8', timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { assert.fail(`Expected JSON output: ${result.stdout}\n${result.stderr}`); }
  return { ...result, data };
}

export function success(result) {
  assert.equal(result.status, 0, JSON.stringify(result.data));
  assert.equal(result.data.ok, true);
  return result.data;
}

export function failure(result) {
  assert.notEqual(result.status, 0, JSON.stringify(result.data));
  assert.equal(result.data.ok, false);
  if (result.data.error) {
    assert.equal(typeof result.data.error.code, 'string');
    assert.ok(result.data.error.message);
  } else {
    assert.ok(Array.isArray(result.data.issues) && result.data.issues.length > 0,
      'a failed readiness check must explain its issues');
  }
  return result.data;
}

// Runtime transaction journals may change; shared project content must not.
export function snapshot(root) {
  const files = {};
  function visit(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (name === '.tiller/local' || item.isSymbolicLink()) continue;
      const path = join(dir, item.name);
      if (item.isDirectory()) visit(path, name);
      else files[name] = readFileSync(path).toString('base64');
    }
  }
  visit(root);
  return files;
}

export function gitRepository(root, name, separateGitDir) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  const args = ['init', '--quiet'];
  if (separateGitDir) args.push('--separate-git-dir', separateGitDir);
  args.push(path);
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 20_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return path;
}
