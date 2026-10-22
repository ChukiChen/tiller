import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const npm = process.env.npm_execpath;
assert.ok(npm, 'Run through npm run test:package');
const project = process.cwd();
const output = resolve('.tiller/local/package-validation');
mkdirSync(output, { recursive: true });
function run(command, args, cwd, status = 0) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result.stdout;
}
function manifest(root) {
  const entries = [];
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) visit(join(directory, entry.name), relative + '/');
      else entries.push([relative, createHash('sha256').update(readFileSync(join(directory, entry.name))).digest('hex')]);
    }
  };
  visit(root);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--ignore-scripts=false', '--json', '--pack-destination', output], project))[0];
const paths = new Set(packed.files.map(file => file.path));
for (const path of ['dist/cli.js', 'dist/flow.js', 'resources/entry.md', 'resources/usage.md', 'resources/run.cjs']) {
  assert.ok(paths.has(path), path);
}
for (const path of [...paths]) assert.ok(!/^resources\/(?:workflows|templates)\//u.test(path), path);
const expectedModules = ['cli', 'core', 'files', 'flow', 'project-metadata', 'repository-paths', 'runtime', 'shared-paths', 'task-id', 'types', 'upgrade'];
const packagedModules = [...paths].filter(path => /^dist\/[^/]+\.js$/u.test(path)).map(path => path.slice(5, -3)).sort();
assert.deepEqual(packagedModules, expectedModules);
assert.ok(![...paths].some(path => /^(src|test|\.tiller|node_modules)\//u.test(path)));

const root = mkdtempSync(join(tmpdir(), 'tiller-package-'));
const install = join(root, 'installed');
const target = join(root, '中文 工程');
mkdirSync(target, { recursive: true });
run(process.execPath, [npm, 'install', '--prefix', install, '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
  '--package-lock=false', join(output, packed.filename)], root);
const cli = join(install, 'node_modules/tiller/dist/cli.js');
const version = run(process.execPath, [npm, 'exec', '--prefix', install, '--offline', '--', 'tiller', '--version'], root).trim();
assert.equal(version, '0.5.0');
const initialized = JSON.parse(run(process.execPath, [cli, 'init', target, '--json'], root));
assert.equal(initialized.ready, true);
assert.equal(initialized.metadata.resourceVersion, '0.5.0');
assert.equal(run(process.execPath, ['.tiller/run.cjs', '--version'], target).trim(), version);
const help = run(process.execPath, ['.tiller/run.cjs', '--help'], target);
assert.ok(help.includes('tiller start'), 'tiller start');
assert.ok(help.includes('--requirement'), 'requirement input');
assert.ok(!help.includes('--goal'), 'goal input is renamed');
assert.ok(!help.includes('advanced'), 'advanced help must not be advertised');
assert.equal(JSON.parse(run(process.execPath, ['.tiller/run.cjs', 'runtime', 'status', '--json'], target)).ok, true);
assert.ok(readFileSync(join(target, '.tiller/usage.md'), 'utf8').includes('node .tiller/run.cjs'));
const installedEntry = readFileSync(join(install, 'node_modules/tiller/resources/entry.md'), 'utf8').trimEnd();
assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), `<!-- tiller:entry:start -->\n${installedEntry}\n<!-- tiller:entry:end -->\n`);
const invoke = (args, status = 0) => JSON.parse(run(process.execPath, ['.tiller/run.cjs', ...args, '--json'], target, status));
const taskId = '20261021-package-smoke';
const started = invoke(['start', taskId, '--title', 'Package smoke', '--requirement', 'Verify the default flow package entry',
  '--criterion', 'AC-1=package starts a task', '--size', 'small', '--target', '.']);
assert.equal(started.id, taskId);
assert.ok(!started.next.includes('advanced'));
const resumed = invoke(['resume', taskId]);
assert.equal(resumed.criteria[0].text, 'package starts a task');
assert.deepEqual(readdirSync(join(target, '.tiller/task', taskId)), ['task.md']);
for (const args of [['advanced'], ['work', 'create'], ['workflow', 'list'], ['planning'], ['task'], ['delivery-check']]) {
  assert.equal(invoke(args, 2).error.code, 'INVALID_ARGUMENT', args.join(' '));
}
const upgrade = invoke(['upgrade', '--plan']);
assert.equal(upgrade.ready, true);
assert.deepEqual(upgrade.changes, []);
assert.equal(manifest(join(target, '.tiller/task', taskId)).length, 1);
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ version, files: packed.files.length }));
process.stdout.write(`Package smoke passed: ${version}, ${packed.files.length} packaged files.\n`);
