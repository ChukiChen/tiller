import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { equivalentManagedContent, initialize, inspectProject, matchesManagedDigest, parseMetadata, sha256, SHARED_RESOURCES, trackedContent } from '../dist/core.js';
import { applyUpgrade, planUpgrade } from '../dist/upgrade.js';
import { fixture, gitRepository, put, snapshot } from './helpers.mjs';

const read = (root, name) => readFileSync(join(root, name), 'utf8');
const added = ['.tiller/usage.md', '.tiller/run.cjs'];
async function legacy(t, workspace = false) {
  const root = fixture(t);
  if (workspace) gitRepository(root, 'repositories/service-a');
  await initialize({ root, mode: workspace ? 'workspace' : 'project', repositories: workspace ? ['repositories/service-a'] : [] });
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  const baseline = JSON.parse(readFileSync(new URL('../resources/baselines/0.3.1.json', import.meta.url), 'utf8'));
  for (const [relative, original] of Object.entries(baseline.files)) {
    const content = workspace && relative === '.tiller/index.md' ? original.replace('管理方式：当前工程。', '管理方式：独立管理工程。') : original;
    const current = read(root, relative);
    put(root, relative, current.replace(trackedContent(relative, current), () => content));
    metadata.managedFiles[relative] = sha256(content);
  }
  for (const relative of added) {
    rmSync(join(root, relative), { force: true });
    delete metadata.managedFiles[relative];
  }
  metadata.resourceVersion = '0.3.1';
  put(root, '.tiller/project.json', JSON.stringify(metadata));
  return root;
}

test('initialization supplies shared usage and launcher with discoverable links and no machine paths', async t => {
  const root = fixture(t);
  const result = await initialize({ root });
  assert.equal(result.metadata.resourceVersion, '0.3.4');
  assert.equal(Object.keys(result.metadata.managedFiles).length, 13);
  for (const name of added) {
    assert.equal(read(root, name), readFileSync(new URL(`../resources/${name.slice(8)}`, import.meta.url), 'utf8'));
    assert.ok(!read(root, name).includes(root));
  }
  assert.match(read(root, 'AGENTS.md'), /\.tiller\/usage\.md/u);
  assert.match(read(root, '.tiller/index.md'), /\]\(usage\.md\)/u);
  const before = snapshot(root);
  assert.equal((await initialize({ root })).changed, false);
  assert.deepEqual(snapshot(root), before);
});

for (const workspace of [false, true]) test(`0.3.1 upgrades add usage while preserving index surroundings and mappings (${workspace})`, async t => {
  const root = await legacy(t, workspace);
  const index = '前文\r\n' + read(root, '.tiller/index.md') + '\r\n用户导航\r\n';
  put(root, '.tiller/index.md', index);
  const metadata = JSON.parse(read(root, '.tiller/project.json'));
  assert.equal((await inspectProject(root)).ready, true);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.deepEqual(snapshot(root), before);
  const result = await applyUpgrade(root, plan.planId);
  assert.equal(result.ready, true);
  assert.deepEqual(result.metadata.repositoryPaths, metadata.repositoryPaths);
  const after = read(root, '.tiller/index.md');
  assert.equal(after.replace(trackedContent('.tiller/index.md', after), ''), index.replace(trackedContent('.tiller/index.md', index), ''));
  assert.match(after, /\]\(usage\.md\)/u);
  assert.ok(after.includes(workspace ? '管理方式：独立管理工程。' : '管理方式：当前工程。'));
  for (const name of added) assert.ok(read(root, name).length > 0);
});

for (const name of added) test(`existing customized ${name} is protected on init and upgrade`, async t => {
  const root = fixture(t);
  put(root, name, '用户原文\n');
  const before = snapshot(root);
  await assert.rejects(initialize({ root }), /冲突/u);
  assert.deepEqual(snapshot(root), before);
  const old = await legacy(t);
  put(old, name, '用户原文\n');
  const oldBefore = snapshot(old);
  const plan = await planUpgrade(old);
  assert.equal(plan.ready, false);
  await assert.rejects(applyUpgrade(old, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(old), oldBefore);
});

test('upgrade binds newly added file contents into the plan and accepts identical distributed resources', async t => {
  const root = await legacy(t);
  const plan = await planUpgrade(root);
  put(root, '.tiller/usage.md', readFileSync(new URL('../resources/usage.md', import.meta.url), 'utf8'));
  await assert.rejects(applyUpgrade(root, plan.planId), /过期/u);
  const current = await planUpgrade(root);
  assert.equal(current.ready, true, current.conflicts.join('\n'));
  assert.equal((await applyUpgrade(root, current.planId)).ready, true);
  put(root, '.tiller/run.cjs', read(root, '.tiller/run.cjs') + '\n// user edit\n');
  assert.equal((await inspectProject(root)).ready, false);
  assert.equal((await planUpgrade(root)).ready, false);
});

test('metadata managed set remains strict for both legacy and current versions', async t => {
  const root = await legacy(t);
  const old = JSON.parse(read(root, '.tiller/project.json'));
  old.managedFiles['.tiller/usage.md'] = sha256('unexpected');
  assert.throws(() => parseMetadata(JSON.stringify(old)), /受管文件依据/u);
  const current = fixture(t);
  await initialize({ root: current });
  for (const version of ['0.3.2', '0.3.3', '0.3.4']) {
    const metadata = JSON.parse(read(current, '.tiller/project.json'));
    metadata.resourceVersion = version;
    assert.equal(Object.keys(parseMetadata(JSON.stringify(metadata)).managedFiles).length, 13);
    delete metadata.managedFiles['.tiller/run.cjs'];
    assert.throws(() => parseMetadata(JSON.stringify(metadata)), /受管文件依据/u);
  }
});

test('old read-only inspection remains valid when new entry paths are ignored, but upgrade refuses them', async t => {
  const root = await legacy(t);
  gitRepository(root, '.');
  put(root, '.gitignore', read(root, '.gitignore') + '\n/.tiller/run.cjs\n');
  assert.equal((await inspectProject(root)).ready, true);
  const before = snapshot(root);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, false);
  assert.ok(plan.conflicts.some(issue => issue.includes('共享资料被 Git 忽略')));
  await assert.rejects(applyUpgrade(root, plan.planId), /冲突/u);
  assert.deepEqual(snapshot(root), before);
});


test('managed resource EOL equivalence is bidirectional and restricted to the distributed allowlist', () => {
  const lf = 'first line\nsecond line\n';
  const crlf = lf.replace(/\n/gu, '\r\n');
  for (const relative of ['AGENTS.md', '.gitignore', '.tiller/index.md', ...SHARED_RESOURCES.map(name => `.tiller/${name}`)]) {
    assert.equal(equivalentManagedContent(relative, lf, crlf), true, relative);
    assert.equal(equivalentManagedContent(relative, crlf, lf), true, relative);
    assert.equal(matchesManagedDigest(relative, lf, sha256(crlf)), true, relative);
    assert.equal(matchesManagedDigest(relative, crlf, sha256(lf)), true, relative);
    assert.equal(equivalentManagedContent(relative, lf, crlf.replace('second', 'changed')), false, relative);
    assert.equal(matchesManagedDigest(relative, crlf.replace('second', 'changed'), sha256(lf)), false, relative);
  }
  for (const relative of ['.tiller/work/task/requirements.md', '.tiller/work/task/confirmations.json', '.tiller/rules/project.md', '.tiller/context/notes.md', '.tiller/RUN.cjs', '.tiller/rules/../usage.md', 'src/code.ts']) {
    assert.equal(equivalentManagedContent(relative, lf, crlf), false, relative);
    assert.equal(matchesManagedDigest(relative, lf, sha256(crlf)), false, relative);
    assert.equal(matchesManagedDigest(relative, crlf, sha256(lf)), false, relative);
    assert.equal(matchesManagedDigest(relative, lf, sha256(lf)), true, relative);
  }
});

test('resource checkout EOL conversion keeps inspection ready and preserves bytes on repeated init', async t => {
  for (const eol of ['\n', '\r\n']) {
    const root = fixture(t);
    await initialize({ root });
    const metadata = JSON.parse(read(root, '.tiller/project.json'));
    for (const name of SHARED_RESOURCES) {
      const relative = `.tiller/${name}`;
      const normalized = read(root, relative).replace(/\r\n/gu, '\n');
      metadata.managedFiles[relative] = sha256(normalized.replace(/\n/gu, eol === '\n' ? '\r\n' : '\n'));
      put(root, relative, normalized.replace(/\n/gu, eol));
    }
    put(root, '.tiller/project.json', JSON.stringify(metadata));
    assert.equal((await inspectProject(root)).ready, true);
    const before = snapshot(root);
    assert.equal((await initialize({ root })).changed, false);
    assert.deepEqual(snapshot(root), before);
    put(root, '.tiller/run.cjs', read(root, '.tiller/run.cjs') + '// modified\n');
    assert.equal((await inspectProject(root)).ready, false);
  }
});


test('initialization and upgrade accept existing distributed resources with alternate EOL without rewriting them', async t => {
  const files = Object.fromEntries(added.map(relative => {
    const source = readFileSync(new URL(`../resources/${relative.slice(8)}`, import.meta.url), 'utf8');
    return [relative, source.includes('\r\n') ? source.replace(/\r\n/gu, '\n') : source.replace(/\n/gu, '\r\n')];
  }));
  const fresh = fixture(t);
  for (const [relative, text] of Object.entries(files)) put(fresh, relative, text);
  assert.equal((await initialize({ root: fresh })).ready, true);
  for (const [relative, text] of Object.entries(files)) assert.equal(read(fresh, relative), text);
  const root = await legacy(t);
  for (const [relative, text] of Object.entries(files)) put(root, relative, text);
  const plan = await planUpgrade(root);
  assert.equal(plan.ready, true, plan.conflicts.join('\n'));
  assert.equal((await applyUpgrade(root, plan.planId)).ready, true);
  for (const [relative, text] of Object.entries(files)) assert.equal(read(root, relative), text);
});
