import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, copyFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { bindRuntime, runtimeStatus } from '../dist/runtime.js';
import { initialize, inspectProject, sha256 } from '../dist/core.js';
import { spawnCaptured } from './helpers.mjs';

const CLI_VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'tiller-使用 空格-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, '工程');
  await mkdir(path.join(root, '.tiller'), { recursive: true });
  await initialize({ root });
  return { base, root };
}
async function cli(dir, version = CLI_VERSION) {
  await mkdir(path.join(dir, 'dist'), { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'tiller', version, type: 'module', bin: { tiller: 'dist/cli.js' } }));
  const file = path.join(dir, 'dist/cli.js');
  await writeFile(file, `import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const CLI_VERSION = ${JSON.stringify(version)};
export async function runCli(args = process.argv.slice(2)) {
  if (args[0] === '--version') { console.log(CLI_VERSION); return; }
  process.stdout.write(JSON.stringify({ args, cwd: process.cwd(), input: readFileSync(0, 'utf8') }));
  process.exitCode = Number(process.env.TEST_EXIT || 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await runCli();
`);
  return file;
}
function launch(root, args = [], options = {}) {
  return spawnCaptured(process.execPath, [path.join(root, '.tiller/run.cjs'), ...args], { cwd: root, encoding: 'utf8', input: 'stdin value', ...options });
}
function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('CASE-127 registered CLI survives cold launch and preserves argv, stdin, cwd and exit status', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, '安装 目录'));
  const shared = await readFile(path.join(root, '.tiller/run.cjs'), 'utf8');
  assert.equal((await bindRuntime(root, target)).ready, true);
  const args = ['中文 空格', '; echo unsafe', '$(pwd)', '&', '"quote"'];
  const result = launch(root, args, { cwd: base, env: { ...process.env, TEST_EXIT: '7' } });
  assert.equal(result.status, 7, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args, cwd: base, input: 'stdin value' });
  assert.equal((await runtimeStatus(root)).ready, true);
  assert.equal(await readFile(path.join(root, '.tiller/run.cjs'), 'utf8'), shared);
});

test('CASE-128 runtime binding checks current launcher bytes even after a successful status query', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, 'installation'));
  await runtimeStatus(root);
  const launcher = path.join(root, '.tiller/run.cjs');
  await writeFile(launcher, (await readFile(launcher, 'utf8')) + '\n// Changed before binding.\n');
  await assert.rejects(bindRuntime(root, target), /共享启动器与工程登记摘要不符/u);
  await assert.rejects(readFile(path.join(root, '.tiller/local/runtime.json')), error => error.code === 'ENOENT');
});

test('CASE-129 local installations are found without binding; stale and missing installations offer recovery', async t => {
  const { root } = await fixture(t);
  assert.equal((await runtimeStatus(root)).ready, false);
  assert.match(launch(root).stderr, /runtime bind|npm install/);
  const target = await cli(path.join(root, '.tiller/local/cli/node_modules/tiller'));
  assert.equal((await runtimeStatus(root)).cliPath, target);
  await bindRuntime(root, target);
  await rm(path.dirname(target), { recursive: true });
  assert.equal((await runtimeStatus(root)).ready, false);
  assert.equal(launch(root).status, 1);
});

for (const oldVersion of ['0.3.2', '0.4.4', '9.9.9', '0.5.0-rc.1']) test(`CASE-130 current resources skip ${oldVersion} local installation and use the exact current bound CLI`, async t => {
  const { base, root } = await fixture(t);
  await cli(path.join(root, '.tiller/local/cli/node_modules/tiller'), oldVersion);
  const replacement = await cli(path.join(base, 'current-install'));
  const metadata = await readFile(path.join(root, '.tiller/project.json'), 'utf8');
  const bound = await bindRuntime(root, replacement);
  assert.equal(bound.ready, true, bound.issues.join('\n'));
  assert.equal(realpathSync.native(bound.cliPath).toLowerCase(), realpathSync.native(replacement).toLowerCase());
  assert.equal((await runtimeStatus(root)).version, CLI_VERSION);
  const result = launch(root, ['--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), CLI_VERSION);
  assert.equal(await readFile(path.join(root, '.tiller/project.json'), 'utf8'), metadata);
});

for (const oldVersion of ['0.3.2', '0.4.4', '9.9.9', '0.5.0-rc.1']) test(`CASE-131 current resources reject ${oldVersion} CLI without changing installation or metadata`, async t => {
  const { root } = await fixture(t);
  const old = await cli(path.join(root, '.tiller/local/cli/node_modules/tiller'), oldVersion);
  const originalCli = await readFile(old, 'utf8');
  const metadata = await readFile(path.join(root, '.tiller/project.json'), 'utf8');
  const status = await runtimeStatus(root);
  assert.equal(status.ready, false);
  assert.ok(status.issues.some(issue => issue.includes(CLI_VERSION)), status.issues.join('\n'));
  const result = launch(root, ['--version']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /runtime bind|npm install/);
  assert.equal(await readFile(old, 'utf8'), originalCli);
  assert.equal(await readFile(path.join(root, '.tiller/project.json'), 'utf8'), metadata);
});

for (const resourceVersion of ['0.3.2', '0.4.4', '9.9.9']) for (const existing of [false, true]) {
  test(`CASE-132 unsupported resources ${resourceVersion} preserve ${existing ? 'existing' : 'absent'} runtime binding`, async t => {
    const { base, root } = await fixture(t);
    const target = await cli(path.join(base, 'install'));
    if (existing) await bindRuntime(root, target);
    const record = path.join(root, '.tiller/local/runtime.json');
    const original = existing ? await readFile(record, 'utf8') : null;
    const metadataPath = path.join(root, '.tiller/project.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    metadata.resourceVersion = resourceVersion;
    const bytes = JSON.stringify(metadata, null, 2) + '\n';
    await writeFile(metadataPath, bytes);
    assert.equal((await runtimeStatus(root)).ready, false);
    assert.equal(launch(root, ['--version']).status, 1);
    await assert.rejects(bindRuntime(root, target));
    assert.equal(await readFile(metadataPath, 'utf8'), bytes);
    if (existing) assert.equal(await readFile(record, 'utf8'), original);
    else await assert.rejects(readFile(record), { code: 'ENOENT' });
    assert.deepEqual((await readdir(path.join(root, '.tiller/local'))).filter(name => /^runtime-.*\.tmp$/u.test(name)), []);
  });
}

test('CASE-133 malformed or foreign binding and link paths are preserved and rejected', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, 'install'));
  await mkdir(path.join(root, '.tiller/local'), { recursive: true });
  const record = path.join(root, '.tiller/local/runtime.json');
  await writeFile(record, '{bad');
  await assert.rejects(bindRuntime(root, target));
  assert.equal(await readFile(record, 'utf8'), '{bad');
  assert.equal((await runtimeStatus(root)).ready, false);
  const foreign = JSON.stringify({ schemaVersion: 1, projectRoot: base, cliPath: target });
  await writeFile(record, foreign);
  await assert.rejects(bindRuntime(root, target), /其他工程/);
  assert.equal(await readFile(record, 'utf8'), foreign);
  await rm(record);
  const linked = path.join(root, 'node_modules');
  const outside = path.join(base, 'outside');
  await cli(path.join(outside, 'tiller'));
  await symlink(outside, linked, 'junction');
  assert.equal((await runtimeStatus(root)).ready, false);
  await assert.rejects(bindRuntime(root, path.join(linked, 'tiller/dist/cli.js')), /链接/u);
});

test('CASE-134 real Git worktree resolves the registered main checkout without copied local data', async t => {
  const { base, root } = await fixture(t);
  git(root, 'init', '--quiet');
  git(root, 'config', 'core.autocrlf', 'true');
  // Model an installation emitted with LF before Git converts it during checkout.
  // Recompute only this generated resource's original installation digest.
  const launcherPath = path.join(root, '.tiller/run.cjs');
  const launcher = (await readFile(launcherPath, 'utf8')).replaceAll('\r\n', '\n');
  await writeFile(launcherPath, launcher);
  const metadataPath = path.join(root, '.tiller/project.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  metadata.managedFiles['.tiller/run.cjs'] = sha256(launcher);
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
  assert.equal((await inspectProject(root)).ready, true);
  git(root, 'add', '--all');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture');
  const target = await cli(path.join(root, '.tiller/local/cli/node_modules/tiller'));
  await bindRuntime(root, target);
  await rm(path.join(root, '.tiller/local/cli'), { recursive: true });
  const external = await cli(path.join(base, '外部 安装'));
  await bindRuntime(root, external);
  const checkout = path.join(base, '活动 目录');
  git(root, 'worktree', 'add', '--detach', checkout);
  await cli(path.join(checkout, '.tiller/local/cli/node_modules/tiller'), '0.3.2');
  const result = launch(checkout, ['--version'], { env: { ...process.env, GIT_DIR: 'invalid', GIT_WORK_TREE: 'invalid', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true' } });
  assert.equal(result.status, 0, result.stderr);
  const runtime = await runtimeStatus(checkout);
  assert.equal(runtime.ready, true, runtime.issues.join('\n'));
  const inspection = await inspectProject(checkout);
  assert.equal(inspection.ready, true, inspection.issues.join('\n'));
  assert.equal(realpathSync.native(runtime.cliPath).toLowerCase(), realpathSync.native(external).toLowerCase());
  const copied = path.join(base, '复制');
  await mkdir(path.join(copied, '.tiller'), { recursive: true });
  await copyFile(path.join(checkout, '.git'), path.join(copied, '.git'));
  await copyFile(path.join(checkout, '.tiller/run.cjs'), path.join(copied, '.tiller/run.cjs'));
  assert.equal((await runtimeStatus(copied)).ready, false);
  assert.equal(launch(copied).status, 1);
});

test('CASE-135 old resource directories cannot claim shared entry ready', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, 'install'));
  await rm(path.join(root, '.tiller/run.cjs'));
  await assert.rejects(bindRuntime(root, target), /启动器不存在/u);
  await assert.rejects(readFile(path.join(root, '.tiller/local/runtime.json')), { code: 'ENOENT' });
  assert.deepEqual((await readdir(path.join(root, '.tiller/local'))).filter(name => /^runtime-.*\.tmp$/u.test(name)), []);
});


test('CASE-136 damaged CLI is not reported ready and rebinding restores stale installation', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, 'install'));
  await bindRuntime(root, target);
  await writeFile(target, 'invalid javascript {{{');
  assert.equal((await runtimeStatus(root)).ready, false);
  assert.match(launch(root).stderr, /验证失败/);
  const replacement = await cli(path.join(base, 'replacement'));
  assert.equal((await bindRuntime(root, replacement)).ready, true);
  assert.equal(realpathSync.native((await runtimeStatus(root)).cliPath).toLowerCase(), realpathSync.native(replacement).toLowerCase());
});

test('CASE-137 available project CLI does not require Git for direct use', async t => {
  const { root } = await fixture(t);
  await cli(path.join(root, 'node_modules/tiller'));
  await writeFile(path.join(root, '.git'), 'gitdir: nonexistent');
  const result = launch(root, ['--version']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), CLI_VERSION);
});


test('CASE-138 runtime status rejects modified shared launcher using managed metadata', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, 'install'));
  assert.equal((await bindRuntime(root, target)).ready, true);
  await writeFile(path.join(root, '.tiller/run.cjs'), 'invalid javascript {{{');
  const status = await runtimeStatus(root);
  assert.equal(status.ready, false);
  assert.match(status.issues.join(' '), /启动器.*摘要/);
});


test('CASE-139 binding rejects a changed launcher before replacing an existing local binding', async t => {
  const { base, root } = await fixture(t);
  const target = await cli(path.join(base, 'install'));
  await bindRuntime(root, target);
  const record = path.join(root, '.tiller/local/runtime.json');
  const original = await readFile(record, 'utf8');
  const replacement = await cli(path.join(base, 'replacement'));
  const launcher = path.join(root, '.tiller/run.cjs');
  const changed = 'invalid javascript {{{';
  await writeFile(launcher, changed);
  await assert.rejects(bindRuntime(root, replacement), /启动器.*摘要/u);
  assert.equal(await readFile(record, 'utf8'), original);
  assert.equal(await readFile(launcher, 'utf8'), changed);
  assert.deepEqual((await readdir(path.join(root, '.tiller/local'))).filter(name => /^runtime-.*\.tmp$/u.test(name)), []);
});
