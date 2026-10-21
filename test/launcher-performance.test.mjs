import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initialize } from '../dist/core.js';
import { bindRuntime } from '../dist/runtime.js';
import { fixture, put } from './helpers.mjs';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
function launch(root, args, options = {}) {
  return spawnSync(process.execPath, [join(root, '.tiller/run.cjs'), ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, ...options,
  });
}
for (const argument of ['--version', '--help']) test(`launcher ${argument} uses one Node process after loading the full CLI`, async t => {
  const root = fixture(t);
  await initialize({ root });
  assert.equal((await bindRuntime(root, cli)).ready, true);
  const log = join(root, '.tiller/local/launch-pids.txt');
  const preload = put(root, '.tiller/local/trace-node.cjs',
    "require('node:fs').appendFileSync(process.env.TILLER_LAUNCH_PID_LOG, process.pid + '\\n');\n");
  const started = performance.now();
  const result = launch(root, [argument], {
    env: { ...process.env, TILLER_LAUNCH_PID_LOG: log,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(preload.replaceAll('\\', '/'))}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.match(result.stdout, argument === '--version' ? /^0\.5\.0\r?\n$/u : /tiller 0\.5\.0/u);
  const pids = readFileSync(log, 'utf8').trim().split(/\r?\n/u);
  t.diagnostic(`Actual Node starts: ${pids.length}; elapsed ${Math.round(performance.now() - started)}ms`);
  assert.equal(new Set(pids).size, 1, 'The launcher must not spawn a version probe or a second command process.');
});

test('importing the complete CLI performs no command or output', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(new URL('../dist/cli.js', import.meta.url).href)}); process.stdout.write('imported');`],
  { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'imported');
  assert.equal(result.stderr, '');
});

test('importing the CLI from stdin does not require a file entry or run a command', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    encoding: 'utf8', windowsHide: true,
    input: `await import(${JSON.stringify(new URL('../dist/cli.js', import.meta.url).href)}); process.stdout.write('imported');`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'imported');
  assert.equal(result.stderr, '');
});

test('launcher rejects a syntax error in a nonselected business module before running a command', async t => {
  const root = fixture(t); await initialize({ root });
  const install = join(root, 'node_modules/tiller');
  mkdirSync(install, { recursive: true });
  cpSync(new URL('../dist', import.meta.url), join(install, 'dist'), { recursive: true });
  cpSync(new URL('../resources', import.meta.url), join(install, 'resources'), { recursive: true });
  writeFileSync(join(install, 'package.json'), JSON.stringify({ name: 'tiller', version: '0.5.0', type: 'module', bin: { tiller: 'dist/cli.js' } }));
  writeFileSync(join(install, 'dist/repository-paths.js'), 'invalid JavaScript {{{\n');
  const target = join(root, 'must-not-initialize');
  const result = launch(root, ['init', target]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /验证失败/u);
  assert.equal(existsSync(target), false);
});

function invalidContract(root, { version = '0.5.0', exported = true, command = '' } = {}) {
  const install = join(root, 'node_modules/tiller');
  mkdirSync(join(install, 'dist'), { recursive: true });
  writeFileSync(join(install, 'package.json'), JSON.stringify({ name: 'tiller', version: '0.5.0', type: 'module', bin: { tiller: 'dist/cli.js' } }));
  writeFileSync(join(install, 'dist/cli.js'), `import { writeFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const CLI_VERSION = ${JSON.stringify(version)};
${exported ? 'export ' : ''}async function runCli() { ${command || `writeFileSync(${JSON.stringify(join(root, 'command-ran.txt'))}, 'called');`} }
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv[2] === '--version') console.log('0.5.0'); else await runCli();
}
`);
}

for (const [reason, options] of [['version', { version: '9.9.9' }], ['entry', { exported: false }]]) {
  test(`launcher rejects an invalid exported ${reason} without command side effects`, async t => {
    const root = fixture(t); await initialize({ root });
    invalidContract(root, options);
    const result = launch(root, ['status']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /导出契约或版本/u);
    assert.equal(existsSync(join(root, 'command-ran.txt')), false);
  });
}

test('a selected command failure does not select another installation or execute twice', async t => {
  const root = fixture(t); await initialize({ root });
  await bindRuntime(root, cli);
  invalidContract(root, { command: `writeFileSync(${JSON.stringify(join(root, 'command-ran.txt'))}, 'once'); throw new Error('synthetic command failure');` });
  const target = join(root, 'must-not-initialize');
  const result = launch(root, ['init', target]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /synthetic command failure/u);
  assert.equal(readFileSync(join(root, 'command-ran.txt'), 'utf8'), 'once');
  assert.equal(existsSync(target), false, 'The bound real CLI must not execute after the preferred command fails.');
});
