import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkInstalledGates } from './package-gates-smoke.mjs';

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
for (const path of ['dist/cli.js', 'resources/templates/product-requirements.md', 'resources/usage.md', 'resources/run.cjs']) {
  assert.ok(paths.has(path), path);
}
for (const module of ['runtime', 'repository-paths', 'delivery-environment', 'delivery-actions', 'delivery-location',
  'delivery-git', 'review-adapters', 'verification-cases', 'verification-yaml', 'verification-runs', 'verification-selection',
  'planning', 'planning-types', 'task-records', 'tasks', 'task-artifacts', 'gate-conditions', 'gate-exceptions',
  'overall-delivery', 'workflow-catalog', 'workflow-work', 'workflow-policy', 'workflow-stages',
  'workflow-dependencies', 'workflow-transitions', 'workflow-delivery']) {
  assert.ok(paths.has(`dist/${module}.js`), module);
}
const workflows = ['requirements', 'analysis', 'research', 'feature', 'bugfix', 'improvement', 'review',
  'validation', 'documentation', 'migration', 'operations'];
for (const workflow of workflows) assert.ok(paths.has(`resources/workflows/${workflow}.json`), workflow);
assert.ok(![...paths].some(path => /^(src|test|\.tiller|node_modules|resources\/baselines)\//.test(path)));
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
for (const command of ['workflow list', 'work stage', 'work plan register', 'work plan activate',
  'work task start|verify|resume', 'work delivery-check', 'work delivery-ready']) assert.ok(help.includes(command), command);
assert.equal(JSON.parse(run(process.execPath, ['.tiller/run.cjs', 'runtime', 'status', '--json'], target)).ok, true);
assert.ok(readFileSync(join(target, '.tiller/usage.md'), 'utf8').includes('node .tiller/run.cjs'));
const installedEntry = readFileSync(join(install, 'node_modules/tiller/resources/entry.md'), 'utf8').trimEnd();
assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), `<!-- tiller:entry:start -->\n${installedEntry}\n<!-- tiller:entry:end -->\n`);
const invoke = (args, status = 0) => JSON.parse(run(process.execPath, ['.tiller/run.cjs', ...args, '--json'], target, status));
assert.deepEqual(invoke(['workflow', 'list']).workflows.map(item => item.snapshot.id).sort(), [...workflows].sort());
const definition = invoke(['workflow', 'show', 'analysis']).snapshot.definition;
const workId = '20261021-package-analysis';
const scope = { repositories: ['.'], targets: [workId] };
const quote = 'Read the specified package material and record the scope.';
writeFileSync(join(target, 'package-request.md'), `# Synthetic package request\n\n${quote}\n`);
const create = {
  operationId: 'package-analysis-create', expectedRevision: 0, workflow: 'analysis', goal: 'Inspect installed package material',
  reason: 'Bounded synthetic installation fixture', scope,
  impact: Object.fromEntries(['modifiesCode', 'changesBehavior', 'production', 'writesData', 'credentials',
    'irreversible', 'externalService', 'semanticChange', 'experimentSideEffects', 'release'].map(key => [key, false])),
  basis: [], actionSources: [{ actions: ['read', 'write-report'], reference: { repository: '.', path: 'package-request.md' }, quote, scope }],
  expectedOutputs: definition.completion.requiredOutputs, completionCriteria: ['Scope is explicitly recorded.'],
};
writeFileSync(join(target, 'create.json'), JSON.stringify(create));
invoke(['work', 'create', workId, '--title', '安装包分析', '--workflow', 'analysis', '--input', 'create.json']);
const resumed = invoke(['work', 'resume', workId]);
assert.equal(resumed.workflow.id, 'analysis');
assert.equal(resumed.ready, false);
assert.equal(resumed.automaticTransition, false);
const recordPath = join(target, '.tiller/work', workId, 'record.json');
const current = JSON.parse(readFileSync(recordPath, 'utf8'));
assert.equal(current.schemaVersion, 4);
writeFileSync(join(target, 'output.json'), JSON.stringify({ operationId: 'package-scope', expectedRevision: current.revision,
  outputId: 'scope-output', content: '# Scope\nRead the declared package material without implementing changes.\n' }));
invoke(['work', 'output', 'add', workId, '--input', 'output.json']);
const registered = invoke(['work', 'workflow', 'inspect', workId]);
assert.ok(registered.record.artifacts['scope-output']);
const unchanged = manifest(target);
invoke(['work', 'create', 'obsolete', '--title', 'Obsolete', '--type', 'product-requirements'], 2);
invoke(['work', 'add', workId, '--type', 'product-design', '--requirements-request', 'old-request'], 2);
invoke(['work', 'bind', workId, '--artifact', 'design'], 2);
assert.deepEqual(manifest(target), unchanged);

const metadataPath = join(target, '.tiller/project.json');
const currentMetadata = readFileSync(metadataPath, 'utf8');
for (const resourceVersion of ['0.4.0', '99.0.0']) {
  writeFileSync(metadataPath, JSON.stringify({ ...JSON.parse(currentMetadata), resourceVersion }, null, 2) + '\n');
  const before = manifest(target);
  run(process.execPath, ['.tiller/run.cjs', '--version'], target, 1);
  for (const args of [['init', target], ['upgrade', target, '--plan']]) {
    const rejected = JSON.parse(run(process.execPath, [cli, ...args, '--json'], root, 1));
    assert.equal(rejected.ok, false);
  }
  assert.deepEqual(manifest(target), before);
  writeFileSync(metadataPath, currentMetadata);
}
const preserved = manifest(target);
const upgrade = JSON.parse(run(process.execPath, [cli, 'upgrade', target, '--plan', '--json'], root));
assert.equal(upgrade.sourceVersion, version);
assert.equal(upgrade.targetVersion, version);
assert.deepEqual(upgrade.changes, []);
assert.equal(JSON.parse(run(process.execPath, [cli, 'upgrade', target, '--apply', upgrade.planId, '--json'], root)).ready, true);
assert.equal(JSON.parse(run(process.execPath, [cli, 'init', target, '--json'], root)).changed, false);
assert.deepEqual(manifest(target), preserved);

const grouped = join(root, '分组 多仓库');
for (const name of ['service-a', 'service-b']) {
  const repo = join(grouped, 'repositories', name);
  mkdirSync(repo, { recursive: true });
  run('git', ['init', '--quiet', repo], root);
}
const groupedInit = JSON.parse(run(process.execPath, [cli, 'init', grouped, '--mode', 'workspace', '--repo',
  'repositories/service-a', '--repo', 'repositories/service-b', '--json'], root));
assert.equal(groupedInit.ready, true);
assert.deepEqual(groupedInit.metadata.repositories, ['service-a', 'service-b']);
assert.deepEqual(groupedInit.metadata.repositoryPaths, { 'service-a': 'repositories/service-a', 'service-b': 'repositories/service-b' });
assert.equal(JSON.parse(run(process.execPath, [cli, 'status', grouped, '--json'], root)).ready, true);
assert.equal(JSON.parse(run(process.execPath, [cli, 'init', grouped, '--mode', 'workspace', '--repo',
  'service-a', '--repo', 'service-b', '--json'], root)).changed, false);
for (const projectRoot of [target, grouped]) {
  assert.equal(JSON.parse(run(process.execPath, [cli, 'verification', 'init', '--path', projectRoot, '--json'], root)).changed, true);
  const inspection = JSON.parse(run(process.execPath, [cli, 'verification', 'check', '--path', projectRoot, '--json'], root));
  assert.equal(inspection.ready, true);
  assert.deepEqual(inspection.cases, []);
  assert.equal(Object.keys(inspection.config.categories).length, 9);
  assert.equal(inspection.files, undefined);
}
const gates = {
  project: checkInstalledGates(target, join(output, 'gates-project-transcript.json'), { complete: true }),
  workspace: checkInstalledGates(grouped, join(output, 'gates-workspace-transcript.json')),
};
for (const [path, schemaVersion, args] of [
  [recordPath, 2, ['work', 'resume', workId]],
  [join(target, '.tiller/work', gates.project.workId, 'confirmations.json'), 1,
    ['work', 'check-gate', gates.project.workId, '--request', 'package-requirements']],
]) {
  const original = readFileSync(path, 'utf8');
  writeFileSync(path, JSON.stringify({ ...JSON.parse(original), schemaVersion }, null, 2) + '\n');
  const before = manifest(target);
  assert.equal(invoke(args, 1).error.code, 'UNSUPPORTED_RECORD_VERSION');
  assert.deepEqual(manifest(target), before);
  writeFileSync(path, original);
}
const result = { package: join(output, packed.filename), integrity: packed.integrity, root, install, target, cli, version, gates,
  checks: ['current workflow resources and modules without historical baselines', 'isolated offline install and npm bin',
    'Chinese and spaced paths', 'generated launcher and runtime status', 'explicit workflow and output registration',
    'removed flags and routes rejected without writes', 'old and unknown project versions rejected without writes',
    'current no-op upgrade and repeat initialization preserve all bytes', 'explicit grouped repository paths',
    'verification initialization in both modes', 'unplanned task and delivery reads reject without writes in both modes',
    'installed stage, planning, task, execution, observation and delivery chain with synthetic approvals',
    'old work and confirmation records rejected without writes', 'per-command actual gate timings retained'] };
writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
