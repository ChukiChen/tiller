import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const npm = process.env.npm_execpath;
assert.ok(npm, 'Run through npm run test:package');
const project = process.cwd();
const output = resolve('.tiller/local/package-validation');
mkdirSync(output, { recursive: true });
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--json', '--pack-destination', output], project))[0];
assert.ok(packed.files.some(file => file.path === 'dist/cli.js'));
assert.ok(packed.files.some(file => file.path === 'resources/templates/product-requirements.md'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.1.0.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.2.0.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.2.1.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.2.2.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.0.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.1.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.2.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.3.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.4.json'));
assert.ok(packed.files.some(file => file.path === 'resources/usage.md'));
assert.ok(packed.files.some(file => file.path === 'resources/run.cjs'));
assert.ok(packed.files.some(file => file.path === 'dist/runtime.js'));
assert.ok(packed.files.some(file => file.path === 'dist/repository-paths.js'));
for (const module of ['delivery-environment', 'delivery-actions', 'delivery-location', 'delivery-git', 'review-adapters']) {
  assert.ok(packed.files.some(file => file.path === `dist/${module}.js`));
}
assert.ok(!packed.files.some(file => /^(src|test|\.tiller|node_modules)\//.test(file.path)));
const root = mkdtempSync(join(tmpdir(), 'tiller-package-'));
const install = join(root, 'installed');
const target = join(root, '中文 工程');
mkdirSync(target, { recursive: true });
run(process.execPath, [npm, 'install', '--prefix', install, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(output, packed.filename)], root);
const cli = join(install, 'node_modules/tiller/dist/cli.js');
const version = run(process.execPath, [npm, 'exec', '--prefix', install, '--offline', '--', 'tiller', '--version'], root).trim();
assert.equal(version, '0.3.5');
const initialized = JSON.parse(run(process.execPath, [cli, 'init', target, '--json'], root));
assert.equal(initialized.ready, true);
assert.equal(run(process.execPath, ['.tiller/run.cjs', '--version'], target).trim(), '0.3.5');
assert.equal(JSON.parse(run(process.execPath, ['.tiller/run.cjs', 'runtime', 'status', '--json'], target)).ok, true);
assert.ok(readFileSync(join(target, '.tiller/usage.md'), 'utf8').includes('node .tiller/run.cjs'));
const installedEntry = readFileSync(join(install, 'node_modules/tiller/resources/entry.md'), 'utf8').trimEnd();
assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), `<!-- tiller:entry:start -->\n${installedEntry}\n<!-- tiller:entry:end -->\n`);
const created = JSON.parse(run(process.execPath, [cli, 'work', 'create', '20261015-product-outline', '--title', '本地书签整理', '--path', target, '--json'], root));
assert.equal(created.status, 'draft');
assert.ok(readFileSync(join(target, created.document), 'utf8').includes('本地书签整理'));
const resumed = JSON.parse(run(process.execPath, [cli, 'work', 'resume', '20261015-product-outline', '--path', target, '--json'], root));
assert.equal(resumed.status, 'draft');
assert.equal(resumed.ready, false);
writeFileSync(join(target, created.document), '# Requirements\nAdd and search local bookmarks.\n');
const requestPath = '.tiller/work/20261015-product-outline/request.json';
writeFileSync(join(target, requestPath), JSON.stringify({
  requestId: 'requirements-1', gate: 'requirements', scope: { repositories: ['.'], targets: ['20261015-product-outline'] },
  subjects: [{ repository: '.', path: created.document }], upstream: [],
  reviewSummary: 'Review bookmark behavior', openIssues: [], nextAction: 'Prepare a design',
}));
const requested = JSON.parse(run(process.execPath, [cli, 'work', 'request-confirmation', '20261015-product-outline', '--input', requestPath, '--path', target, '--json'], root));
assert.equal(requested.status, 'pending');
const pending = spawnSync(process.execPath, [cli, 'work', 'check-gate', '20261015-product-outline', '--request', 'requirements-1', '--path', target, '--json'], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.ifError(pending.error);
assert.equal(pending.status, 1);
assert.equal(JSON.parse(pending.stdout).automaticTransition, false);
const beforeApproval = spawnSync(process.execPath, [cli, 'work', 'add', '20261015-product-outline', '--type', 'product-design', '--requirements-request', 'requirements-1', '--path', target, '--json'], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.ifError(beforeApproval.error);
assert.equal(beforeApproval.status, 1);
assert.equal(JSON.parse(beforeApproval.stdout).error.code, 'REQUIREMENTS_CONFIRMATION_REQUIRED');
// Synthetic inputs only in this disposable installation test; never real approval evidence.
const sourcePath = '.tiller/work/20261015-product-outline/synthetic-source.md';
writeFileSync(join(target, sourcePath), '# Synthetic source\nApprove this exact requirement for the installation test.\n');
const decisionPath = '.tiller/work/20261015-product-outline/decision.json';
writeFileSync(join(target, decisionPath), JSON.stringify({
  decisionId: 'requirements-yes', requestId: 'requirements-1', outcome: 'approved', conditions: [],
  source: { kind: 'conversation', reference: { repository: '.', path: sourcePath }, quote: 'Approve this exact requirement for the installation test.', presentation: { repository: '.', path: requested.presentation } },
  sourceReview: { reviewer: 'synthetic-package-test', rationale: 'Matches the synthetic fixture to this installation test request.', reviewedAt: new Date().toISOString() },
}));
run(process.execPath, [cli, 'work', 'record-decision', '20261015-product-outline', '--input', decisionPath, '--path', target, '--json'], root);
const added = JSON.parse(run(process.execPath, [cli, 'work', 'add', '20261015-product-outline', '--type', 'product-design', '--requirements-request', 'requirements-1', '--path', target, '--json'], root));
assert.equal(added.changed, true);
assert.equal(JSON.parse(run(process.execPath, [cli, 'work', 'inspect', '20261015-product-outline', '--path', target, '--json'], root)).ready, true);
assert.equal(JSON.parse(run(process.execPath, [cli, 'work', 'bind', '20261015-product-outline', '--artifact', 'design', '--requirements-work', '20261015-product-outline', '--requirements-request', 'requirements-1', '--path', target, '--json'], root)).changed, false);
const confirmationPath = join(target, '.tiller/work/20261015-product-outline/confirmations.json');
const oldRegistry = JSON.parse(readFileSync(confirmationPath, 'utf8'));
oldRegistry.schemaVersion = 1;
const originalRegistry = JSON.stringify(oldRegistry, null, 2) + '\n';
writeFileSync(confirmationPath, originalRegistry);
const migration = JSON.parse(run(process.execPath, [cli, 'work', 'migrate-confirmations', '20261015-product-outline', '--plan', '--path', target, '--json'], root));
assert.equal(migration.required, true);
const migrated = JSON.parse(run(process.execPath, [cli, 'work', 'migrate-confirmations', '20261015-product-outline', '--apply', migration.planId, '--path', target, '--json'], root));
assert.equal(migrated.changed, true);
assert.equal(readFileSync(join(target, '.tiller/work/20261015-product-outline/history/confirmations-v1.json'), 'utf8'), originalRegistry);
const { trackedContent } = await import(pathToFileURL(join(install, 'node_modules/tiller/dist/core.js')).href);
const baseline = JSON.parse(readFileSync(join(install, 'node_modules/tiller/resources/baselines/0.2.0.json'), 'utf8'));
const metadataPath = join(target, '.tiller/project.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
for (const [relative, content] of Object.entries(baseline.files)) {
  const path = join(target, relative);
  const current = readFileSync(path, 'utf8');
  writeFileSync(path, current.replace(trackedContent(relative, current), () => content));
  metadata.managedFiles[relative] = createHash('sha256').update(content).digest('hex');
}
metadata.resourceVersion = '0.2.0';
for (const relative of ['.tiller/usage.md', '.tiller/run.cjs']) {
  delete metadata.managedFiles[relative];
  unlinkSync(join(target, relative));
}
writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
const upgradePlan = JSON.parse(run(process.execPath, [cli, 'upgrade', target, '--plan', '--json'], root));
assert.equal(upgradePlan.sourceVersion, '0.2.0');
assert.equal(upgradePlan.targetVersion, '0.3.5');
const upgraded = JSON.parse(run(process.execPath, [cli, 'upgrade', target, '--apply', upgradePlan.planId, '--json'], root));
assert.equal(upgraded.ready, true);
assert.equal(run(process.execPath, ['.tiller/run.cjs', '--version'], target).trim(), '0.3.5');
assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), `<!-- tiller:entry:start -->\n${installedEntry}\n<!-- tiller:entry:end -->\n`);
assert.deepEqual(Object.keys(JSON.parse(run(process.execPath, [cli, 'work', 'resume', '20261015-product-outline', '--path', target, '--json'], root)).artifacts).sort(), ['design', 'requirements']);
const plan = JSON.parse(run(process.execPath, [cli, 'upgrade', target, '--plan', '--json'], root));
assert.equal(plan.changes.length, 0);
const grouped = join(root, '分组 多仓库');
for (const name of ['service-a', 'service-b']) {
  const repo = join(grouped, 'repositories', name);
  mkdirSync(repo, { recursive: true });
  run('git', ['init', '--quiet', repo], root);
}
const groupedInit = JSON.parse(run(process.execPath, [cli, 'init', grouped, '--mode', 'workspace', '--repo', 'repositories/service-a', '--repo', 'repositories/service-b', '--json'], root));
assert.equal(groupedInit.ready, true);
assert.deepEqual(groupedInit.metadata.repositories, ['service-a', 'service-b']);
assert.deepEqual(groupedInit.metadata.repositoryPaths, { 'service-a': 'repositories/service-a', 'service-b': 'repositories/service-b' });
assert.equal(JSON.parse(run(process.execPath, [cli, 'status', grouped, '--json'], root)).ready, true);
assert.equal(JSON.parse(run(process.execPath, [cli, 'init', grouped, '--mode', 'workspace', '--repo', 'service-a', '--repo', 'service-b', '--json'], root)).changed, false);
const result = { package: join(output, packed.filename), integrity: packed.integrity, root, install, target, cli, version, checks: ['package contents and upgrade baselines', 'isolated install', 'npm bin execution', 'Chinese and spaced paths', 'single bundled entry and rules', 'dated work creation', 'read-only resume', 'pending confirmation blocks design', 'same-work design after synthetic approval', 'structure inspection', 'repeat basis binding', 'explicit confirmation migration preserves original', '0.2.0 upgrade and multi-artifact resume', 'upgrade preview', 'grouped workspace initialization and repeat detection', 'generated launcher and runtime status', 'upgraded launcher remains usable'] };
writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
