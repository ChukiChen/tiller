import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkflowFixtureAt, startStage } from './workflow-fixtures.mjs';
import { readWorkflowControlText } from '../dist/workflow-work.js';
import { cli, failure, fixture, gitRepository, put, snapshot, success } from './helpers.mjs';

test('init preserves existing user entry, ignore rules, project rules and specifications', (t) => {
  const root = fixture(t);
  const entry = '# Existing instructions\r\nKeep all user content.\r\n';
  const ignore = '# Existing ignores\r\nprivate/\r\n';
  put(root, 'AGENTS.md', entry);
  put(root, '.gitignore', ignore);
  put(root, '.tiller/specs/requirements.md', '# 用户需求\n不能覆盖。\n');
  put(root, '.tiller/rules/project.md', '# 项目规则\n禁止发布。\n');
  success(cli(root, 'init'));
  assert.ok(readFileSync(join(root, 'AGENTS.md'), 'utf8').startsWith(entry));
  assert.ok(readFileSync(join(root, '.gitignore'), 'utf8').startsWith(ignore));
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /\.tiller\/local/);
  assert.equal(readFileSync(join(root, '.tiller/specs/requirements.md'), 'utf8'), '# 用户需求\n不能覆盖。\n');
  assert.equal(readFileSync(join(root, '.tiller/rules/project.md'), 'utf8'), '# 项目规则\n禁止发布。\n');
  for (const path of ['.tiller/project.json', '.tiller/index.md']) assert.ok(existsSync(join(root, path)), path);
  const before = snapshot(root);
  success(cli(root, 'init'));
  assert.deepEqual(snapshot(root), before, 'repeating init must preserve all shared bytes');
  success(cli(root, 'status'));
  assert.deepEqual(snapshot(root), before, 'status must be read-only');
});

test('init supports a target containing Chinese characters and spaces', (t) => {
  const root = fixture(t);
  const target = join(root, '中文 项目');
  mkdirSync(target);
  success(cli(root, 'init', target));
  success(cli(root, 'status', target));
  assert.ok(existsSync(join(target, '.tiller/project.json')));
  assert.equal(existsSync(join(root, '.tiller')), false);
});

test('workspace explicitly registers child Git directories and Git files without changing repositories', (t) => {
  const root = fixture(t);
  gitRepository(root, 'repo-a');
  const separate = fixture(t);
  gitRepository(root, 'repo-b', join(separate, 'git-data'));
  put(root, 'repo-a/keep.txt', 'A');
  put(root, 'repo-b/keep.txt', 'B');
  const a = snapshot(join(root, 'repo-a'));
  const b = snapshot(join(root, 'repo-b'));
  success(cli(root, 'init', '--mode', 'workspace', '--repo', 'repo-a', '--repo', 'repo-b'));
  success(cli(root, 'status'));
  assert.deepEqual(snapshot(join(root, 'repo-a')), a);
  assert.deepEqual(snapshot(join(root, 'repo-b')), b);
  const before = snapshot(root);
  success(cli(root, 'init', '--mode', 'workspace', '--repo', 'repo-a', '--repo', 'repo-b'));
  assert.deepEqual(snapshot(root), before);
});

test('workspace rejects empty, nonexistent, non-Git, outside and nested repository selections before writing', (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  gitRepository(outside, 'external');
  mkdirSync(join(root, 'plain'));
  mkdirSync(join(root, 'nested'));
  gitRepository(join(root, 'nested'), 'repo');
  for (const args of [[], ['--repo', 'missing'], ['--repo', 'plain'], ['--repo', join(outside, 'external')], ['--repo', 'nested/repo']]) {
    const before = snapshot(root);
    failure(cli(root, 'init', '--mode', 'workspace', ...args));
    assert.deepEqual(snapshot(root), before, args.join(' '));
  }
});

test('init rejects a symlinked management directory without writing through it', (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  put(outside, 'keep.txt', 'outside content');
  symlinkSync(outside, join(root, '.tiller'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = snapshot(outside);
  failure(cli(root, 'init'));
  assert.deepEqual(snapshot(outside), before);
  assert.equal(existsSync(join(root, 'AGENTS.md')), false);
});

test('workspace rejects symlinked repositories even when they look like direct children', (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  const repo = gitRepository(outside, 'repo');
  symlinkSync(repo, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = snapshot(outside);
  failure(cli(root, 'init', '--mode', 'workspace', '--repo', 'linked'));
  assert.deepEqual(snapshot(outside), before);
  assert.equal(existsSync(join(root, '.tiller/project.json')), false);
});

test('invalid metadata JSON is rejected without overwriting existing project content', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, '.tiller/project.json', '{broken');
  const before = snapshot(root);
  failure(cli(root, 'init'));
  failure(cli(root, 'status'));
  assert.deepEqual(snapshot(root), before);
});

test('a future schema version is rejected without implicit migration', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const metadata = JSON.parse(readFileSync(join(root, '.tiller/project.json'), 'utf8'));
  metadata.schemaVersion = 999;
  put(root, '.tiller/project.json', `${JSON.stringify(metadata, null, 2)}\n`);
  const before = snapshot(root);
  failure(cli(root, 'init'));
  failure(cli(root, 'status'));
  failure(cli(root, 'work', 'create', 'draft', '--title', 'Draft', '--type', 'product-requirements'));
  assert.deepEqual(snapshot(root), before);
});

test('unknown flags and unexpected positional arguments never silently succeed', (t) => {
  const root = fixture(t);
  for (const args of [['init', '--froce'], ['init', '.', 'extra'], ['status', '--froce'], ['work', 'create', 'draft', '--title', 'Title', '--type', 'product-requirements', '--froce']]) {
    failure(cli(root, ...args));
    assert.deepEqual(snapshot(root), {});
  }
});

test('missing initialization cannot be bypassed by creating work', (t) => {
  const root = fixture(t);
  put(root, 'create.json', '{}');
  const before = snapshot(root);
  const rejected = failure(cli(root, 'work', 'create', 'draft', '--title', '需求草稿', '--workflow', 'analysis', '--input', 'create.json'));
  assert.notEqual(rejected.error.code, 'INVALID_ARGUMENT');
  assert.deepEqual(snapshot(root), before);
});

test('changing a managed file produces a conflict without overwriting the edit', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, '.tiller/index.md', '# User maintained index\nKeep this edit.\n');
  const before = snapshot(root);
  failure(cli(root, 'init'));
  assert.deepEqual(snapshot(root), before);
});

test('current work resume preserves dated IDs and rejects duplicate creation and removed completion', async t => {
  const root = fixture(t); success(cli(root, 'init'));
  const id = '20260331-student-service';
  await createWorkflowFixtureAt(root, id);
  const before = snapshot(root);
  const resumed = success(cli(root, 'work', 'resume', id));
  assert.equal(resumed.workId ?? resumed.id, id);
  assert.deepEqual(snapshot(root), before);
  for (const args of [
    ['complete', id], ['complete', id, '--evidence', 'evidence.md'],
    ['create', id, '--title', 'Replacement'], ['bind', id, '--artifact', 'requirements'],
  ]) {
    assert.equal(failure(cli(root, 'work', ...args)).error.code, 'INVALID_ARGUMENT');
    assert.deepEqual(snapshot(root), before);
  }
  for (const invalid of ['../escape', 'nested/item', '..\\escape', '20260331', '2026331-student', '20260331--student', '20260331-Student']) {
    assert.equal(failure(cli(root, 'work', 'resume', invalid)).error.code, 'INVALID_WORK_ID');
    assert.deepEqual(snapshot(root), before);
  }
});

test('work --path targets a Chinese project without creating caller records', async t => {
  const root = fixture(t); const target = join(root, '中文 项目'); mkdirSync(target);
  success(cli(root, 'init', target)); await createWorkflowFixtureAt(target, 'draft');
  const before = snapshot(root);
  const resumed = success(cli(root, 'work', 'resume', 'draft', '--path', target));
  assert.equal(resumed.root, target);
  assert.deepEqual(snapshot(root), before); assert.equal(existsSync(join(root, '.tiller')), false);
});

test('unsafe and ignored output references never mutate current work records', async t => {
  const root = fixture(t); gitRepository(root, '.'); success(cli(root, 'init'));
  await createWorkflowFixtureAt(root, 'notes');
  const outside = fixture(t); put(outside, 'evidence.md', '# Outside evidence\n');
  symlinkSync(outside, join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  put(root, 'ignored.md', '# Ignored evidence\n');
  put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + '\nignored.md\n');
  for (const path of ['../outside.md', join(outside, 'evidence.md'), 'external/evidence.md', '.git/config', '.tiller/local/private.md', 'ignored.md', 'missing.md']) {
    put(root, 'output.json', JSON.stringify({ operationId: 'output', expectedRevision: 1, outputId: 'scope-output', source: { repository: '.', path } }));
    const before = snapshot(root);
    failure(cli(root, 'work', 'output', 'add', 'notes', '--input', 'output.json'));
    assert.deepEqual(snapshot(root), before);
  }
});

test('ordinary work resumption reads ignored records without changing sharing rules', async t => {
  const root = fixture(t); gitRepository(root, '.'); success(cli(root, 'init'));
  await createWorkflowFixtureAt(root, 'notes');
  put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + '\n.tiller/work/notes/record.json\n');
  const before = snapshot(root);
  success(cli(root, 'work', 'resume', 'notes'));
  assert.deepEqual(snapshot(root), before);
});

test('ordinary stage status reads ignored control files without mutating them', async t => {
  const root = fixture(t); gitRepository(root, '.'); success(cli(root, 'init'));
  const f = await createWorkflowFixtureAt(root, 'notes');
  const stage = f.snapshot.definition.stages[0].id;
  await startStage(f, stage);
  success(cli(root, 'work', 'stage', 'status', 'notes', '--stage', stage));
  put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + '\n.tiller/work/notes/stages/state.json\n');
  const before = snapshot(root);
  assert.equal(await readWorkflowControlText(root, '.tiller/work/notes/stages/state.json', 1024 * 1024),
    readFileSync(join(root, '.tiller/work/notes/stages/state.json'), 'utf8'));
  success(cli(root, 'work', 'stage', 'status', 'notes', '--stage', stage));
  assert.deepEqual(snapshot(root), before);
});

test('recover rolls back a partial file transaction and permits a clean retry', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const original = readFileSync(join(root, '.tiller/index.md'), 'utf8');
  const changes = [
    { path: '.tiller/index.md', before: original, after: '# Interrupted index\n' },
    { path: '.tiller/context/interrupted.md', before: null, after: '# Created before interruption\n' },
    { path: '.tiller/context/not-yet-written.md', before: null, after: '# Pending\n' },
  ];
  put(root, changes[0].path, changes[0].after);
  put(root, changes[1].path, changes[1].after);
  put(root, '.tiller/local/transaction.json', JSON.stringify({ schemaVersion: 1, changes }));
  failure(cli(root, 'init'));
  success(cli(root, 'recover'));
  assert.equal(readFileSync(join(root, '.tiller/index.md'), 'utf8'), original);
  assert.equal(existsSync(join(root, changes[1].path)), false);
  assert.equal(existsSync(join(root, changes[2].path)), false);
  assert.equal(existsSync(join(root, '.tiller/local/transaction.json')), false);
  success(cli(root, 'status'));
  success(cli(root, 'init'));
});

test('recover refuses the entire rollback when a later user edit conflicts', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const original = readFileSync(join(root, '.tiller/index.md'), 'utf8');
  const changes = [
    { path: '.tiller/context/recoverable.md', before: null, after: '# Recoverable\n' },
    { path: '.tiller/index.md', before: original, after: '# Transaction content\n' },
  ];
  put(root, changes[0].path, changes[0].after);
  put(root, changes[1].path, '# Subsequent user edit\nKeep this content.\n');
  const journal = JSON.stringify({ schemaVersion: 1, changes });
  put(root, '.tiller/local/transaction.json', journal);
  const before = snapshot(root);
  failure(cli(root, 'recover'));
  assert.deepEqual(snapshot(root), before);
  assert.equal(readFileSync(join(root, '.tiller/local/transaction.json'), 'utf8'), journal);
});
