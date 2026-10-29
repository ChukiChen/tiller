'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CURRENT_RESOURCE_VERSION = '0.5.0';
const CURRENT_CLI_VERSION = '0.5.0';

const canonical = value => { const real = fs.realpathSync.native(value); return process.platform === 'win32' ? real.toLowerCase() : real; };
function capture(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
const RECOVERY = '请使用已知可用的 tiller CLI 执行 runtime bind --path <工程根目录>，或在工程根目录执行 npm install --prefix .tiller/local/cli /path/to/tiller-VERSION.tgz（使用已核对的本地安装包）；不会自动联网安装。';
function ordinary(absolute, file) {
  const resolved = path.resolve(absolute);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error(`拒绝链接路径：${current}`);
  }
  const stat = fs.lstatSync(resolved);
  if (file ? !stat.isFile() : !stat.isDirectory()) throw new Error(`不是普通${file ? '文件' : '目录'}：${resolved}`);
  return resolved;
}
function jsonFile(absolute) {
  ordinary(absolute, true);
  const bytes = fs.readFileSync(absolute);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error('文件不是有效 UTF-8。');
  return JSON.parse(text);
}
function validateBinding(value, root) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 ||
      Object.keys(value).sort().join(',') !== 'cliPath,projectRoot,schemaVersion' ||
      typeof value.projectRoot !== 'string' || !path.isAbsolute(value.projectRoot) || canonical(value.projectRoot) !== canonical(root) ||
      typeof value.cliPath !== 'string' || !path.isAbsolute(value.cliPath)) {
    throw new Error('本机 runtime.json 无效或属于其他工程，保留原文件，请核对后移出该文件再重新绑定。');
  }
  return value;
}
function readBinding(root) {
  const file = path.join(root, '.tiller/local/runtime.json');
  let value;
  try { value = jsonFile(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return validateBinding(value, root);
}
function validateProjectContract(root) {
  const metadata = jsonFile(path.join(root, '.tiller/project.json'));
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.schemaVersion !== 1 ||
      !['0.4.0', CURRENT_RESOURCE_VERSION].includes(metadata.resourceVersion)) {
    throw new Error(`工程资源契约不受支持；仅支持当前资源 ${CURRENT_RESOURCE_VERSION} 及直接兼容的上一版本，原文件保留，不自动迁移。`);
  }
}
function inspectCli(file) {
  const cliPath = ordinary(file, true);
  if (path.basename(cliPath) !== 'cli.js' || path.basename(path.dirname(cliPath)) !== 'dist') throw new Error('CLI 必须是 tiller 安装包的 dist/cli.js。');
  const manifest = jsonFile(path.join(path.dirname(path.dirname(cliPath)), 'package.json'));
  if (manifest?.name !== 'tiller' || manifest.type !== 'module' || manifest.bin?.tiller !== 'dist/cli.js' || manifest.version !== CURRENT_CLI_VERSION) {
    throw new Error(`CLI 安装包身份、入口或版本无效，仅支持当前 tiller ${CURRENT_CLI_VERSION}。`);
  }
  return { cliPath, version: manifest.version };
}
function validateCli(file) {
  const cli = inspectCli(file);
  const probe = capture(process.execPath, [cli.cliPath, '--version'], {
    shell: false, windowsHide: true, timeout: 10000, maxBuffer: 65536,
    env: { ...process.env, TILLER_RUNTIME_PROBE: '1' },
  });
  if (probe.error || probe.status !== 0 || probe.stdout.trim() !== cli.version) {
    throw new Error('CLI --version 验证失败，安装可能损坏或版本不一致。');
  }
  return cli;
}
function git(root, args) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_') && key !== 'GIT_TERMINAL_PROMPT') delete env[key];
  const result = capture('git', ['-C', root, ...args], { shell: false, windowsHide: true, timeout: 10000, env });
  if (result.error || result.status !== 0) throw new Error('无法验证 Git worktree 登记。');
  return result.stdout.trim();
}
function mainCheckout(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  const currentIdentity = canonical(ordinary(root, false));
  if (canonical(git(root, ['rev-parse', '--show-toplevel'])) !== currentIdentity) throw new Error('Git 工程身份不匹配。');
  const common = canonical(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const records = git(root, ['worktree', 'list', '--porcelain', '-z']).split('\0\0').filter(Boolean);
  const paths = records.map(record => record.split('\0').find(field => field.startsWith('worktree '))?.slice(9)).filter(Boolean);
  const registered = paths.filter(item => fs.existsSync(item) && canonical(item) === currentIdentity);
  if (registered.length !== 1) throw new Error('当前目录不在 Git worktree 登记中，不能使用其他目录的 CLI。');
  const first = paths[0];
  if (!first || canonical(first) === currentIdentity) return null;
  const main = fs.realpathSync.native(ordinary(first, false));
  if (canonical(git(main, ['rev-parse', '--path-format=absolute', '--git-common-dir'])) !== common ||
      canonical(git(main, ['rev-parse', '--show-toplevel'])) !== canonical(main)) throw new Error('Git 主工程身份不匹配。');
  return main;
}
function* runtimeCandidates(inputRoot) {
  const root = path.resolve(inputRoot);
  ordinary(root, false);
  // The active project's resources also govern installations borrowed from its main checkout.
  validateProjectContract(root);
  const roots = [root];
  for (let index = 0; index < roots.length; index++) {
    const candidateRoot = roots[index];
    // Validate saved local data even when a preferred installation exists.
    const binding = readBinding(candidateRoot);
    const candidates = [
      path.join(candidateRoot, '.tiller/local/cli/node_modules/tiller/dist/cli.js'),
      path.join(candidateRoot, 'node_modules/tiller/dist/cli.js'),
      ...(binding ? [binding.cliPath] : []),
    ];
    for (const candidate of candidates) yield { candidate, sourceRoot: candidateRoot };
    if (index === 0) { const main = mainCheckout(root); if (main) roots.push(main); }
  }
}
function resolveRuntime(inputRoot) {
  const issues = [];
  try {
    for (const { candidate, sourceRoot } of runtimeCandidates(inputRoot)) {
      try { return { ready: true, ...validateCli(candidate), sourceRoot, issues: [] }; }
      catch (error) { if (error.code !== 'ENOENT') issues.push(error.message); }
    }
  } catch (error) { issues.push(error.message); }
  return { ready: false, issues: [...issues, RECOVERY] };
}
async function run() {
  if (process.env.TILLER_RUNTIME_PROBE === '1') { process.stderr.write('拒绝递归 CLI 启动器。\n'); process.exitCode = 1; return; }
  const root = path.dirname(__dirname);
  const issues = []; let selected;
  try {
    for (const { candidate } of runtimeCandidates(root)) {
      try {
        const cli = inspectCli(candidate);
        // Loading the complete dependency graph detects a damaged installation without a probe process.
        const loaded = await import(pathToFileURL(cli.cliPath).href);
        if (loaded.CLI_VERSION !== cli.version || typeof loaded.runCli !== 'function') throw new Error('CLI 导出契约或版本无效。');
        selected = loaded; break;
      } catch (error) { if (error.code !== 'ENOENT') issues.push(`CLI 验证失败：${error.message}`); }
    }
  } catch (error) { issues.push(error.message); }
  if (!selected) { process.stderr.write(`tiller CLI 不可用：${[...issues, RECOVERY].join('\n')}\n`); process.exitCode = 1; return; }
  // A command failure must never fall back to a second installation and execute again.
  try { await selected.runCli(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`无法启动 tiller：${error.message}\n${RECOVERY}\n`); process.exitCode = 1; }
}
module.exports = { resolveRuntime, validateCli, validateBinding };
if (require.main === module) void run();
