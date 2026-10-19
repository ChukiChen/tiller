import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkInstalledGates } from './package-gates-smoke.mjs';

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
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.5.json'));
assert.ok(packed.files.some(file => file.path === 'resources/baselines/0.3.6.json'));
assert.ok(packed.files.some(file => file.path === 'resources/usage.md'));
assert.ok(packed.files.some(file => file.path === 'resources/run.cjs'));
assert.ok(packed.files.some(file => file.path === 'dist/runtime.js'));
assert.ok(packed.files.some(file => file.path === 'dist/repository-paths.js'));
for (const module of ['delivery-environment', 'delivery-actions', 'delivery-location', 'delivery-git', 'review-adapters']) {
  assert.ok(packed.files.some(file => file.path === `dist/${module}.js`));
}
for (const module of ['verification-cases', 'verification-yaml', 'verification-runs', 'verification-selection', 'planning', 'planning-types', 'task-records', 'tasks', 'task-artifacts', 'gate-conditions', 'gate-exceptions', 'overall-delivery']) {
  assert.ok(packed.files.some(file => file.path === `dist/${module}.js`));
}
assert.ok(!packed.files.some(file => /^(src|test|\.tiller|node_modules)\//.test(file.path)));
const root = mkdtempSync(join(tmpdir(), 'tiller-package-'));
const install = join(root, 'installed');
const target = join(root, '中文 工程');
mkdirSync(target, { recursive: true });
run(process.execPath, [npm, 'install', '--prefix', install, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(output, packed.filename)], root);
const cli = join(install, 'node_modules/tiller/dist/cli.js');
const version = run(process.execPath, [npm, 'exec', '--prefix', install, '--offline', '--', 'tiller', '--version'], root).trim();
assert.equal(version, '0.4.0');
const initialized = JSON.parse(run(process.execPath, [cli, 'init', target, '--json'], root));
assert.equal(initialized.ready, true);
assert.equal(run(process.execPath, ['.tiller/run.cjs', '--version'], target).trim(), '0.4.0');
const help = run(process.execPath, ['.tiller/run.cjs', '--help'], target);
for (const command of ['work plan register', 'work plan activate', 'work task start|verify|resume', 'work delivery-check', 'work delivery-ready']) assert.ok(help.includes(command), command);
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
const currentRegistryBytes = readFileSync(confirmationPath, 'utf8');
const oldRegistry = JSON.parse(currentRegistryBytes);
oldRegistry.schemaVersion = 1;
const originalRegistry = JSON.stringify(oldRegistry, null, 2) + '\n';
writeFileSync(confirmationPath, originalRegistry);
const rejectedLegacy = spawnSync(process.execPath, [cli, 'work', 'check-gate', '20261015-product-outline', '--request', 'requirements-1', '--path', target, '--json'], { cwd: root, encoding: 'utf8', timeout: 120_000, windowsHide: true });
assert.ifError(rejectedLegacy.error);
assert.equal(rejectedLegacy.status, 1);
assert.equal(JSON.parse(rejectedLegacy.stdout).error.code, 'UNSUPPORTED_RECORD_VERSION');
assert.equal(readFileSync(confirmationPath, 'utf8'), originalRegistry);
// Restore the fixture's original current-format record, never migrate the old record.
writeFileSync(confirmationPath, currentRegistryBytes);
const workRecordPath = join(target, '.tiller/work/20261015-product-outline/record.json');
const currentWorkBytes = readFileSync(workRecordPath, 'utf8');
const oldWork = { ...JSON.parse(currentWorkBytes), schemaVersion: 2 };
const oldWorkBytes = JSON.stringify(oldWork, null, 2) + '\n';
writeFileSync(workRecordPath, oldWorkBytes);
const rejectedOldWork = spawnSync(process.execPath, ['.tiller/run.cjs', 'work', 'resume', '20261015-product-outline', '--json'], { cwd: target, encoding: 'utf8', timeout: 120_000, windowsHide: true });
assert.ifError(rejectedOldWork.error);
assert.equal(rejectedOldWork.status, 1);
assert.equal(JSON.parse(rejectedOldWork.stdout).error.code, 'UNSUPPORTED_RECORD_VERSION');
assert.equal(readFileSync(workRecordPath, 'utf8'), oldWorkBytes);
writeFileSync(workRecordPath, currentWorkBytes);
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
assert.equal(upgradePlan.targetVersion, '0.4.0');
const upgraded = JSON.parse(run(process.execPath, [cli, 'upgrade', target, '--apply', upgradePlan.planId, '--json'], root));
assert.equal(upgraded.ready, true);
assert.equal(run(process.execPath, ['.tiller/run.cjs', '--version'], target).trim(), '0.4.0');
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
for (const projectRoot of [target, grouped]) {
  const verificationInit = JSON.parse(run(process.execPath, [cli, 'verification', 'init', '--path', projectRoot, '--json'], root));
  assert.equal(verificationInit.changed, true);
  const inspection = JSON.parse(run(process.execPath, [cli, 'verification', 'check', '--path', projectRoot, '--json'], root));
  assert.equal(inspection.ready, true);
  assert.deepEqual(inspection.cases, []);
  assert.equal(Object.keys(inspection.config.categories).length, 9);
  assert.equal(inspection.files, undefined);
}
const result = { package: join(output, packed.filename), integrity: packed.integrity, root, install, target, cli, version, checks: ['package contents and upgrade baselines', 'isolated install', 'npm bin execution', 'Chinese and spaced paths', 'single bundled entry and rules', 'dated work creation', 'read-only resume', 'pending confirmation blocks design', 'same-work design after synthetic approval', 'structure inspection', 'repeat basis binding', 'unsupported confirmation records rejected without changes', '0.2.0 upgrade and multi-artifact resume', 'upgrade preview', 'grouped workspace initialization and repeat detection', 'generated launcher and runtime status', 'upgraded launcher remains usable'] };
result.checks.push('verification commands and empty applicability in both modes');
result.gates = {
  project: checkInstalledGates(target, join(output, 'gates-project-transcript.json'), { complete: true }),
  workspace: checkInstalledGates(grouped, join(output, 'gates-workspace-transcript.json')),
};
result.checks.push('0.4.0 gate modules and installed launcher help', 'old work and confirmation records rejected byte-for-byte',
  'unplanned task and delivery checks reject without writes in both modes',
  'installed CLI planning, activation, task start, actual execution, task verification and delivery ready with explicit synthetic approvals');
writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
