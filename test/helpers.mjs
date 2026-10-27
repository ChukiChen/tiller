import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initialize as initializeCore } from '../dist/core.js';

export const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tiller-cli-'));
  const initialized = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.ifError(initialized.error && initialized.error.code !== 'EPERM' ? initialized.error : null);
  assert.equal(initialized.status, 0, initialized.stderr);
  const committed = spawnSync('git', [
    '-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid',
    'commit', '--quiet', '--allow-empty', '-m', 'baseline',
  ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.ifError(committed.error && committed.error.code !== 'EPERM' ? committed.error : null);
  assert.equal(committed.status, 0, committed.stderr);
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

function replaceTaskSection(content, title, body) {
  const lines = content.split('\n');
  const start = lines.findIndex(line => line.trim() === `### ${title}`);
  if (start < 0) return content;
  let end = start + 1;
  while (end < lines.length && !/^#{2,3}\s+/u.test(lines[end])) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return [...lines.slice(0, start + 1), '', body, '', ...lines.slice(end)].join('\n');
}

export function completeRequirement(root, id) {
  const relative = `.tiller/task/${id}/task.md`;
  let content = readFileSync(join(root, relative), 'utf8');
  content = replaceTaskSection(content, '使用场景', '主要用户需要当前行为可靠。');
  content = replaceTaskSection(content, '业务范围', [
    '- 做：实现确认的验收条件。', '- 不做：范围外变更。', '- 假设与待确认：无。',
  ].join('\n'));
  content = replaceTaskSection(content, '关键行为', '验收条件描述的行为可观察。');
  content = replaceTaskSection(content, '异常与边界', '失败时返回明确结果，不破坏既有行为。');
  writeFileSync(join(root, relative), content);
}

export function completeDesign(root, id) {
  const relative = `.tiller/task/${id}/task.md`;
  let content = readFileSync(join(root, relative), 'utf8');
  content = replaceTaskSection(content, '方案', '沿用现有命令边界实现本次行为。');
  content = replaceTaskSection(content, '失败处理', '失败时返回明确结果并保留原记录。');
  content = replaceTaskSection(content, '取舍', '不新增并行入口，保持现有接口。');
  content = replaceTaskSection(content, '影响与风险', '影响限于本任务范围，按现有测试复核。');
  content = replaceTaskSection(content, '验证入口', '运行引用本用例的具名测试。');
  writeFileSync(join(root, relative), content);
}

export function confirmTask(root, id, gate, ...args) {
  if (gate === 'requirements') completeRequirement(root, id);
  if (gate === 'design') completeDesign(root, id);
  return cli(root, 'confirm', id, gate, ...args);
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

// The managed runner may suppress a grandchild Node process's captured stdout.
// Redirect through a shell to a file so tests still observe the real child output.
export function spawnCaptured(command, args, options = {}) {
  const capture = mkdtempSync(join(tmpdir(), 'tiller-capture-'));
  const stdoutPath = join(capture, 'stdout');
  const stderrPath = join(capture, 'stderr');
  const stdinPath = join(capture, 'stdin');
  const { env, input, ...rest } = options;
  if (input !== undefined) writeFileSync(stdinPath, input);
  const script = input === undefined
    ? '"$@" > "$TILLER_STDOUT" 2> "$TILLER_STDERR"'
    : '"$@" < "$TILLER_STDIN" > "$TILLER_STDOUT" 2> "$TILLER_STDERR"';
  const result = spawnSync('/bin/sh', ['-c', script, 'tiller-capture', command, ...args], {
    ...rest,
    encoding: 'utf8',
    env: { ...process.env, ...env, TILLER_STDIN: stdinPath, TILLER_STDOUT: stdoutPath, TILLER_STDERR: stderrPath },
  });
  const read = pathname => {
    try { return readFileSync(pathname, 'utf8'); }
    catch { return ''; }
  };
  const output = { ...result, stdout: read(stdoutPath), stderr: read(stderrPath) };
  rmSync(capture, { recursive: true, force: true });
  return output;
}

export function cli(root, ...args) {
  // Legacy fixtures focus on behaviors after initialization. Their freshly
  // generated baseline PR is intentionally unmerged, so opt those calls out of
  // the new gate. CASE-231 exercises the default gate through a raw CLI call.
  const effectiveArgs = args[0] === 'start' && !args.includes('--skip-init-gate')
    ? [args[0], '--skip-init-gate', ...args.slice(1)]
    : args;
  const result = spawnCaptured(process.execPath, [cliPath, ...effectiveArgs, '--json'], {
    // Git-backed delivery commands spawn several processes; allow bounded headroom
    // when the full suite runs concurrently on Windows.
    cwd: root, encoding: 'utf8', timeout: 60_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.signal, null, result.stderr);
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { assert.fail(`Expected JSON output: ${result.stdout}\n${result.stderr}`); }
  if (result.status === 0 && args[0] === 'init' && data.initBaseline) settleInitBaseline(root, data);
  return { ...result, data };
}

export function settleInitBaseline(root, result) {
  const baseline = result.initBaseline;
  if (!baseline) return result;
  const checkout = spawnSync('git', [
    '-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid',
    'checkout', baseline.commit, '--', '.',
  ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.ifError(checkout.error && checkout.error.code !== 'EPERM' ? checkout.error : null);
  assert.equal(checkout.status, 0, checkout.stderr);
  const unstage = spawnSync('git', [
    '-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid',
    'reset', '--mixed', '--quiet', 'HEAD', '--', '.',
  ], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.ifError(unstage.error && unstage.error.code !== 'EPERM' ? unstage.error : null);
  assert.equal(unstage.status, 0, unstage.stderr);
  return result;
}

export async function initializeSettled(options) {
  const result = await initializeCore(options);
  if (result.initBaseline) settleInitBaseline(result.root ?? options.root, result);
  return result;
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
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  const committed = spawnSync('git', [
    '-C', path, '-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid',
    'commit', '--quiet', '--allow-empty', '-m', 'baseline',
  ], { encoding: 'utf8', timeout: 20_000 });
  assert.ifError(committed.error && committed.error.code !== 'EPERM' ? committed.error : null);
  assert.equal(committed.status, 0, committed.stderr);
  return path;
}
