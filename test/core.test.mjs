import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { initialize, inspectProject, recoverProject, parseMetadata, readProjectMetadata, RESOURCE_VERSION, trackedContent, sha256 } from '../dist/core.js';
import { assertSharedWritePaths } from '../dist/shared-paths.js';
import { applyChanges, assertSafePath, readTextIfExists, withProjectLock } from '../dist/files.js';
import { resumeWork } from '../dist/work.js';
import { createWorkflowWork } from '../dist/workflow-work.js';

async function project(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tiller-core-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('initialization preserves content and repeated initialization is a no-op', async t => {
  const root = await project(t);
  await writeFile(path.join(root, 'AGENTS.md'), '# Existing\nKeep my rule.\n');
  await mkdir(path.join(root, '.tiller/rules'), { recursive: true });
  await writeFile(path.join(root, '.tiller/rules/project.md'), 'Existing project rule.\n');
  const first = await initialize({ root });
  assert.equal(first.changed, true);
  assert.equal(first.ready, true);
  assert.equal(first.hostVerification, 'not-verified');
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /^# Existing\nKeep my rule\.\n/);
  const original = await readFile(path.join(root, '.tiller/project.json'), 'utf8');
  const repeat = await initialize({ root });
  assert.equal(repeat.changed, false);
  assert.equal(await readFile(path.join(root, '.tiller/project.json'), 'utf8'), original);
  await writeFile(path.join(root, 'AGENTS.md'), (await readFile(path.join(root, 'AGENTS.md'), 'utf8')) + '\nUser addition\n');
  assert.equal((await initialize({ root })).ready, true);
});

test('initialization digests tolerate managed line-ending conversion but reject content changes', async t => {
  const root = await project(t);
  const initial = await initialize({ root });
  const originalMetadata = await readFile(path.join(root, '.tiller/project.json'), 'utf8');
  for (const [relative, digest] of Object.entries(initial.metadata.managedFiles)) {
    const text = await readFile(path.join(root, relative), 'utf8');
    assert.equal(digest, sha256(trackedContent(relative, text).replaceAll('\r\n', '\n')), relative);
  }
  for (const style of ['mixed', 'crlf', 'lf']) {
    for (const relative of Object.keys(initial.metadata.managedFiles)) {
      const file = path.join(root, relative);
      const text = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
      let line = 0;
      await writeFile(file, text.replace(/\n/gu, () => style === 'crlf' || (style === 'mixed' && line++ % 2) ? '\r\n' : '\n'));
    }
    const inspected = await inspectProject(root);
    assert.equal(inspected.ready, true, `${style}: ${inspected.issues.join('; ')}`);
    assert.equal((await initialize({ root })).changed, false);
    assert.equal(await readFile(path.join(root, '.tiller/project.json'), 'utf8'), originalMetadata);
  }
  const agents = path.join(root, 'AGENTS.md');
  await writeFile(agents, (await readFile(agents, 'utf8')).replace('# tiller 工作入口', '# Changed entry'));
  assert.equal((await inspectProject(root)).ready, false);
  await assert.rejects(initialize({ root }), /内容已变化/u);
});

test('workspace limits repository scope and never changes repository content', async t => {
  const root = await project(t);
  for (const name of ['甲 repo', 'beta']) await promisify(execFile)('git', ['init', '--quiet', path.join(root, name)]);
  await writeFile(path.join(root, '甲 repo', 'file.txt'), 'Do not edit');
  const result = await initialize({ root, mode: 'workspace', repositories: ['甲 repo', 'beta'] });
  assert.deepEqual(result.metadata.repositories, ['beta', '甲 repo']);
  assert.equal(await readFile(path.join(root, '甲 repo', 'file.txt'), 'utf8'), 'Do not edit');
  assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\/甲 repo\//);
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['beta'] }), /范围/);
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['../outside'] }), /不安全|平级/);
});

test('workspace groups repositories while keeping stable ids, navigation and ignore rules', async t => {
  const root = await project(t);
  for (const name of ['service-a', 'service-b']) await promisify(execFile)('git', ['init', '--quiet', path.join(root, 'repositories', name)]);
  const result = await initialize({ root, mode: 'workspace', repositories: ['service-a', 'repositories/service-b'] });
  assert.deepEqual(result.metadata.repositories, ['service-a', 'service-b']);
  assert.deepEqual(result.metadata.repositoryPaths, { 'service-a': 'repositories/service-a', 'service-b': 'repositories/service-b' });
  assert.equal((await inspectProject(root)).ready, true);
  assert.match(await readFile(path.join(root, '.tiller/index.md'), 'utf8'), /\.\.\/repositories\/service-a\//u);
  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  assert.equal(ignore.split('/repositories/').length, 2);
  assert.equal((await initialize({ root, mode: 'workspace', repositories: ['repositories/service-a', 'service-b'] })).changed, false);
});

test('workspace refuses ambiguous shorthand and never silently remaps initialized ids', async t => {
  const root = await project(t);
  for (const name of ['service-a', 'repositories/service-a']) await promisify(execFile)('git', ['init', '--quiet', path.join(root, name)]);
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['service-a'] }), /明确|歧义/u);
  assert.equal(await readTextIfExists(root, '.tiller/project.json'), null);
  const result = await initialize({ root, mode: 'workspace', repositories: ['./service-a'] });
  assert.deepEqual(result.metadata.repositoryPaths, { 'service-a': 'service-a' });
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['repositories/service-a'] }), /范围|路径/u);
  assert.equal((await initialize({ root, mode: 'workspace', repositories: ['./service-a'] })).changed, false);
  assert.equal((await initialize({ root, mode: 'workspace', repositories: [path.join(root, 'service-a')] })).changed, false);
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: [path.resolve(root, '../outside')] }), /不安全/u);
});

test('grouped repository parent symlinks and fabricated metadata mappings are rejected', async t => {
  const root = await project(t);
  const outside = await project(t);
  await promisify(execFile)('git', ['init', '--quiet', path.join(outside, 'service-a')]);
  await symlink(outside, path.join(root, 'repositories'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['repositories/service-a'] }), /符号链接/u);
  const ordinary = await project(t);
  await initialize({ root: ordinary });
  const metadata = JSON.parse(await readFile(path.join(ordinary, '.tiller/project.json'), 'utf8'));
  delete metadata.repositoryPaths;
  await writeFile(path.join(ordinary, '.tiller/project.json'), JSON.stringify(metadata));
  assert.equal((await inspectProject(ordinary)).ready, false);
});

test('workspace cannot register a management worktree as an independent business repository', async t => {
  const root = await project(t);
  const git = promisify(execFile);
  await git('git', ['init', '--quiet', root]);
  await git('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'Test baseline']);
  await git('git', ['-C', root, 'worktree', 'add', '--detach', path.join(root, 'repositories/service-a'), 'HEAD']);
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['service-a'] }), /Git 身份重复/u);
  assert.equal(await readTextIfExists(root, '.tiller/project.json'), null);
});

test('resource edits and unknown versions are preserved and block writes', async t => {
  const root = await project(t);
  await initialize({ root });
  await writeFile(path.join(root, '.tiller/rules/core.md'), 'My customized rules');
  assert.equal((await inspectProject(root)).ready, false);
  await assert.rejects(initialize({ root }), /内容已变化/);
  assert.equal(await readFile(path.join(root, '.tiller/rules/core.md'), 'utf8'), 'My customized rules');
  const metadata = JSON.parse(await readFile(path.join(root, '.tiller/project.json'), 'utf8'));
  metadata.schemaVersion = 99;
  await writeFile(path.join(root, '.tiller/project.json'), JSON.stringify(metadata));
  await assert.rejects(initialize({ root }), /版本不受支持/);
  assert.equal(await readTextIfExists(root, '.tiller/local/lock.json'), null);
});

test('recover validates every before/after before restoring and refuses later edits', async t => {
  const root = await project(t);
  await mkdir(path.join(root, '.tiller/local'), { recursive: true });
  const changes = [
    { path: '.tiller/a.md', before: 'before', after: 'after' },
    { path: '.tiller/b.md', before: null, after: 'new' },
  ];
  await writeFile(path.join(root, '.tiller/a.md'), 'after');
  await writeFile(path.join(root, '.tiller/b.md'), 'later edit');
  await writeFile(path.join(root, '.tiller/local/transaction.json'), JSON.stringify({ schemaVersion: 1, changes }));
  await assert.rejects(recoverProject(root), /恢复冲突/);
  assert.equal(await readFile(path.join(root, '.tiller/a.md'), 'utf8'), 'after');
  await writeFile(path.join(root, '.tiller/b.md'), 'new');
  assert.equal((await recoverProject(root)).recovered, true);
  assert.equal(await readFile(path.join(root, '.tiller/a.md'), 'utf8'), 'before');
  assert.equal(await readTextIfExists(root, '.tiller/b.md'), null);
});

test('file transactions reject mismatched baselines and serialize writers', async t => {
  const root = await project(t);
  await withProjectLock(root, async () => {
    await assert.rejects(withProjectLock(root, async () => {}), /正在运行/);
    await assert.rejects(applyChanges(root, [{ path: '.tiller/new.md', before: 'unexpected', after: 'hello' }]), /已变化/);
    await applyChanges(root, [{ path: '.tiller/new.md', before: null, after: 'hello' }]);
  });
  assert.equal(await readTextIfExists(root, '.tiller/new.md'), 'hello');
  assert.equal(await readTextIfExists(root, '.tiller/local/transaction.json'), null);
});

test('paths reject traversal and symbolic-link escapes', async t => {
  const root = await project(t);
  const outside = await project(t);
  await assert.rejects(assertSafePath(root, '../outside'), /不安全/);
  await assert.rejects(assertSafePath(root, '.tiller/../outside'), /不安全/);
  await symlink(outside, path.join(root, '.tiller'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(initialize({ root }), /符号链接/);
  assert.equal(await readTextIfExists(outside, 'project.json'), null);
});

test('git ignore conflicts are detected before shared files are written', async t => {
  const root = await project(t);
  await promisify(execFile)('git', ['init', '--quiet', root]);
  await writeFile(path.join(root, '.gitignore'), '.tiller/\n');
  await assert.rejects(initialize({ root }), /共享资料被 Git 忽略/);
  assert.equal(await readTextIfExists(root, '.tiller/project.json'), null);
  assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), '.tiller/\n');
});

test('schema validation refuses missing resource baselines and malicious recovery targets', async t => {
  const root = await project(t);
  await initialize({ root });
  const originalMetadata = await readFile(path.join(root, '.tiller/project.json'), 'utf8');
  const metadata = JSON.parse(originalMetadata);
  metadata.managedFiles = {};
  await writeFile(path.join(root, '.tiller/project.json'), JSON.stringify(metadata));
  assert.equal((await inspectProject(root)).ready, false);
  await assert.rejects(initialize({ root }), /受管文件依据/);
  await assert.rejects(recoverProject(root), /受管文件依据/);
  await writeFile(path.join(root, '.tiller/project.json'), originalMetadata);
  await writeFile(path.join(root, 'business.txt'), 'keep');
  await writeFile(path.join(root, '.tiller/local/transaction.json'), JSON.stringify({
    schemaVersion: 1, changes: [{ path: 'business.txt', before: 'tampered', after: 'keep' }],
  }));
  await assert.rejects(recoverProject(root), /只允许/);
  assert.equal(await readFile(path.join(root, 'business.txt'), 'utf8'), 'keep');
});

test('transactions reject local path casing aliases and noncanonical roots before writes', async t => {
  const root = await project(t);
  await withProjectLock(root, async () => {
    const originalLock = await readTextIfExists(root, '.tiller/local/lock.json');
    for (const unsafePath of ['.tiller/Local/lock.json', '.TILLER/LOCAL/lock.json', '.tiller/loCal', '.TILLER/work/file.md', 'agents.md']) {
      await assert.rejects(applyChanges(root, [{ path: unsafePath, before: null, after: 'unsafe' }]), /本机恢复记录|只允许/);
    }
    assert.equal(await readTextIfExists(root, '.tiller/local/lock.json'), originalLock);
    assert.equal(await readTextIfExists(root, '.tiller/local/transaction.json'), null);
    await assert.rejects(applyChanges(root, [
      { path: '.tiller/work/Item.md', before: null, after: 'one' },
      { path: '.tiller/work/item.md', before: null, after: 'two' },
    ]), /重复文件事务路径/);
  });
  await writeFile(path.join(root, '.tiller/local/transaction.json'), JSON.stringify({
    schemaVersion: 1, changes: [{ path: '.tiller/Local/lock.json', before: null, after: 'unsafe' }],
  }));
  await assert.rejects(recoverProject(root), /本机恢复记录/);
});

test('workspace verifies actual Git repositories and accepts valid gitdir files', async t => {
  const root = await project(t);
  await mkdir(path.join(root, 'fake/.git'), { recursive: true });
  await assert.rejects(initialize({ root, mode: 'workspace', repositories: ['fake'] }), /Git 工作副本/);
  assert.equal(await readTextIfExists(root, '.tiller/project.json'), null);
  const git = promisify(execFile);
  await git('git', ['init', '--quiet', '--separate-git-dir', path.join(root, 'git-data'), path.join(root, 'actual')]);
  const result = await initialize({ root, mode: 'workspace', repositories: ['actual'] });
  assert.equal(result.ready, true);
  assert.deepEqual(result.metadata.repositories, ['actual']);
  await rm(path.join(root, 'git-data'), { recursive: true });
  assert.equal((await inspectProject(root)).ready, false);
});

test('local ignore negations cannot expose transaction originals before root ignore is installed', async t => {
  const root = await project(t);
  await mkdir(path.join(root, '.tiller/local'), { recursive: true });
  const unsafeIgnore = '*\n!transaction.json\n';
  await writeFile(path.join(root, '.tiller/local/.gitignore'), unsafeIgnore);
  await assert.rejects(initialize({ root }), /未排除所有恢复数据/);
  assert.equal(await readTextIfExists(root, '.tiller/local/transaction.json'), null);
  assert.equal(await readTextIfExists(root, '.tiller/local/lock.json'), null);
  assert.equal(await readTextIfExists(root, '.gitignore'), null);
  assert.equal(await readTextIfExists(root, '.tiller/local/.gitignore'), unsafeIgnore);
  await writeFile(path.join(root, '.tiller/local/.gitignore'), ' *\n');
  await assert.rejects(initialize({ root }), /未排除所有恢复数据/);
  await writeFile(path.join(root, '.tiller/local/.gitignore'), '# Local only\n\n*\n');
  assert.equal((await initialize({ root })).ready, true);
});

test('shared path checks reject ignored evidence while allowing non-Git projects', async t => {
  const root = await project(t);
  await assertSharedWritePaths(root, ['private/review.md']);
  await promisify(execFile)('git', ['init', '--quiet', root]);
  await writeFile(path.join(root, '.gitignore'), 'private/\n');
  await assert.rejects(assertSharedWritePaths(root, ['private/review.md']), /共享资料被 Git 忽略/);
  await assertSharedWritePaths(root, ['.tiller/work/review/evidence.md']);
  await assert.rejects(assertSharedWritePaths(root, ['../outside']), /不安全/);
});

test('project index links remain editable without invalidating navigation or work resumption', async t => {
  const root = await project(t);
  await initialize({ root });
  const scope = { repositories: ['.'], targets: ['draft-feature'] };
  const source = { repository: '.', path: 'navigation-request.md' };
  const quote = 'Create a requirements draft for navigation testing.';
  await writeFile(path.join(root, source.path), `# Synthetic request\n${quote}\n`);
  await createWorkflowWork(root, 'draft-feature', 'Feature requirements', {
    operationId: 'create-navigation', expectedRevision: 0, workflow: 'requirements',
    goal: '验证导航可编辑且当前工作可接续。', reason: '本测试仅建立需求草稿工作。', scope, impact: {},
    basis: [{ reference: source, purpose: '明确合成测试目标与范围。' }],
    actionSources: [{ actions: ['read', 'write-report'], reference: source, quote, scope }],
    expectedOutputs: ['clarify-output', 'requirements-output'],
    completionCriteria: ['导航修改不破坏接入有效性和工作读取。'],
  });
  const original = await readTextIfExists(root, '.tiller/index.md');
  const updated = original + '\n## 当前工作\n\n- [功能需求工作](work/draft-feature/work.md)\n';
  await writeFile(path.join(root, '.tiller/index.md'), updated);
  assert.equal((await inspectProject(root)).ready, true);
  assert.equal((await initialize({ root })).changed, false);
  assert.equal(await readTextIfExists(root, '.tiller/index.md'), updated);
  await assert.doesNotReject(resumeWork(root, 'draft-feature'));
  await writeFile(path.join(root, '.tiller/index.md'), updated.replace('rules/index.md', 'rules/missing.md'));
  assert.equal((await inspectProject(root)).ready, false);
  await assert.doesNotReject(resumeWork(root, 'draft-feature'), 'Ordinary work reads do not inspect unrelated navigation resources.');
  await writeFile(path.join(root, '.tiller/index.md'), '# Index without navigation markers\n');
  assert.equal((await inspectProject(root)).ready, false);
  await assert.rejects(initialize({ root }), /缺少 tiller 固定导航区段/);
});


test('only current resource metadata is readable and historical bytes remain untouched', async t => {
  const root = await project(t);
  const initialized = await initialize({ root });
  assert.equal(RESOURCE_VERSION, '0.5.0');
  assert.equal(initialized.metadata.resourceVersion, RESOURCE_VERSION);
  assert.deepEqual(initialized.metadata.repositoryPaths, {});
  assert.equal(initialized.compatibility, 'read-write');
  const filename = path.join(root, '.tiller/project.json');
  const current = JSON.parse(await readFile(filename, 'utf8'));
  for (const resourceVersion of ['0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.3.2', '0.3.3', '0.3.4', '0.3.5', '0.3.6', '0.4.0', '99.0.0']) {
    const original = JSON.stringify({ ...current, resourceVersion });
    await writeFile(filename, original);
    assert.throws(() => parseMetadata(original), /版本不受支持/u);
    const inspection = await inspectProject(root);
    assert.equal(inspection.ready, false);
    assert.equal(inspection.compatibility, 'unsupported');
    await assert.rejects(readProjectMetadata(root), /版本不受支持/u);
    await assert.rejects(initialize({ root }), /版本不受支持/u);
    assert.equal(await readFile(filename, 'utf8'), original);
    assert.equal(await readTextIfExists(root, '.tiller/local/lock.json'), null);
    assert.equal(await readTextIfExists(root, '.tiller/local/transaction.json'), null);
  }
});

test('shared path checks honor ancestor ignores and reject bare repositories', async t => {
  const parent = await project(t);
  await promisify(execFile)('git', ['init', '--quiet', parent]);
  const nested = path.join(parent, 'nested');
  await mkdir(nested);
  await writeFile(path.join(parent, '.gitignore'), 'nested/private/\n');
  await assert.rejects(assertSharedWritePaths(nested, ['private/evidence.md']), /共享资料被 Git 忽略/u);
  await assertSharedWritePaths(nested, ['public/evidence.md']);
  const bare = await project(t);
  await promisify(execFile)('git', ['init', '--quiet', '--bare', bare]);
  await assert.rejects(assertSharedWritePaths(bare, ['shared.md']), /work tree/u);
});

test('shared path checks preserve fatal configuration and missing Git fallback failures', async t => {
  const root = await project(t);
  const parent = await project(t);
  await promisify(execFile)('git', ['init', '--quiet', parent]);
  const nested = path.join(parent, 'nested');
  await mkdir(nested);
  const malformed = path.join(root, 'malformed.gitconfig');
  await writeFile(malformed, '[broken\n');
  const prior = { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  try {
    process.env.GIT_CONFIG_GLOBAL = malformed;
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    await assert.rejects(assertSharedWritePaths(root, ['shared.md']), /bad config/u);
    if (prior.GIT_CONFIG_GLOBAL === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = prior.GIT_CONFIG_GLOBAL;
    process.env.PATH = path.join(root, 'missing-executables');
    await writeFile(path.join(root, '.gitignore'), '/.tiller/local/\n');
    await assertSharedWritePaths(root, ['shared.md']);
    await writeFile(path.join(root, '.gitignore'), 'private/\n');
    await assert.rejects(assertSharedWritePaths(root, ['shared.md']), /Git 不可用/u);
    await assert.rejects(assertSharedWritePaths(nested, ['shared.md']), /Git 不可用/u);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
