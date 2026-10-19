import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { cli, confirmFixture, failure, fixture, gitRepository, put, snapshot, success } from './helpers.mjs';

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
  failure(cli(root, 'work', 'create', 'draft', '--title', '需求草稿', '--type', 'product-requirements'));
  assert.deepEqual(snapshot(root), {});
});

test('work create produces a draft, resume is read-only and duplicate creation never overwrites', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'draft', '--title', '需求草稿', '--type', 'product-requirements'));
  assert.ok(existsSync(join(root, '.tiller/work/draft/work.md')));
  assert.ok(existsSync(join(root, '.tiller/work/draft/requirements.md')));
  put(root, '.tiller/work/draft/requirements.md', '# 我的未完成需求\nTODO\n');
  const before = snapshot(root);
  const resumed = success(cli(root, 'work', 'resume', 'draft'));
  assert.match(JSON.stringify(resumed), /需求|draft/);
  assert.deepEqual(snapshot(root), before);
  failure(cli(root, 'work', 'create', 'draft', '--title', '替代内容', '--type', 'product-requirements'));
  assert.deepEqual(snapshot(root), before);
  failure(cli(root, 'work', 'check', 'draft'));
  assert.deepEqual(snapshot(root), before);
});

test('work IDs cannot escape the work directory', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const before = snapshot(root);
  for (const id of ['../escape', 'nested/item', '..\\escape']) {
    failure(cli(root, 'work', 'create', id, '--title', 'Unsafe', '--type', 'product-requirements'));
    failure(cli(root, 'work', 'resume', id));
    assert.deepEqual(snapshot(root), before);
  }
});

test('work complete requires explicit existing evidence and rejects placeholder drafts', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'draft', '--title', '需求草稿', '--type', 'product-requirements'));
  put(root, '.tiller/work/draft/evidence.md', '# Review\nReviewed the current draft against the requested scope.\n');
  const before = snapshot(root);
  failure(cli(root, 'work', 'complete', 'draft'));
  failure(cli(root, 'work', 'complete', 'draft', '--evidence', '.tiller/work/draft/missing.md'));
  failure(cli(root, 'work', 'complete', 'draft', '--evidence', '.tiller/work/draft/evidence.md'));
  assert.deepEqual(snapshot(root), before);
});

test('work --path targets the selected project without initializing the caller directory', (t) => {
  const root = fixture(t);
  const target = join(root, '中文 项目');
  mkdirSync(target);
  success(cli(root, 'init', target));
  success(cli(root, 'work', 'create', 'draft', '--title', '总体需求草稿', '--type', 'product-requirements', '--path', target));
  assert.ok(existsSync(join(target, '.tiller/work/draft/requirements.md')));
  const before = snapshot(root);
  success(cli(root, 'work', 'resume', 'draft', '--path', target));
  assert.deepEqual(snapshot(root), before);
  assert.equal(existsSync(join(root, '.tiller')), false);
});

test('design creation requires a current requirements confirmation and preserves its dependency', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const before = snapshot(root);
  failure(cli(root, 'work', 'create', 'design', '--title', 'Design', '--type', 'product-design'));
  assert.deepEqual(snapshot(root), before);
  success(cli(root, 'work', 'create', 'requirements', '--title', 'Requirements'));
  const document = '.tiller/work/requirements/requirements.md';
  put(root, document, '# Requirements\nThe user can add a student with a unique identifier.\n');
  confirmFixture(root, 'requirements', [document], 'req-1', 'requirements');
  success(cli(root, 'work', 'create', 'design', '--title', 'Design', '--type', 'product-design', '--requirements-work', 'requirements', '--requirements-request', 'req-1'));
  put(root, '.tiller/work/design/design.md', '# Design\nUse a map keyed by the student identifier.\n');
  success(cli(root, 'work', 'check', 'design'));
  put(root, document, '# Requirements\nIdentifiers may now be repeated.\n');
  failure(cli(root, 'work', 'check', 'design'));
});

test('dated work identifiers survive confirmation, completion and resume without renaming', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  const id = '20260331-student-service';
  const base = `.tiller/work/${id}`;
  success(cli(root, 'work', 'create', id, '--title', 'Student service'));
  const record = JSON.parse(readFileSync(join(root, base, 'record.json'), 'utf8'));
  assert.equal(record.id, id);
  assert.equal(record.artifacts.requirements.source.path, `${base}/requirements.md`);
  put(root, record.artifacts.requirements.source.path, '# Requirements\nManage students by unique identifiers.\n');
  put(root, `${base}/review.md`, '# Review\nChecked the student identifiers and scoped delivery.\n');
  confirmFixture(root, id, [record.artifacts.requirements.source.path], 'req-1', 'requirements');
  success(cli(root, 'work', 'create', '20260331-student-design', '--title', 'Design', '--type', 'change-design', '--requirements-work', id, '--requirements-request', 'req-1'));
  confirmFixture(root, id, [record.artifacts.requirements.source.path, `${base}/review.md`]);
  success(cli(root, 'work', 'complete', id, '--evidence', `${base}/review.md`, '--acceptance', 'accept-1'));
  const before = snapshot(root);
  success(cli(root, 'work', 'resume', id));
  assert.deepEqual(snapshot(root), before);
  for (const invalid of ['20260331', '2026331-student', '20260331--student', '20260331-../student', '20260331-Student']) {
    assert.equal(failure(cli(root, 'work', 'create', invalid, '--title', 'Invalid')).error.code, 'INVALID_WORK_ID');
  }
  assert.deepEqual(snapshot(root), before);
});

test('technical readiness never bypasses acceptance and incomplete completion records are rejected', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', 'Notes'));
  const document = '.tiller/work/notes/requirements.md';
  const evidence = '.tiller/work/notes/review.md';
  put(root, document, '# Notes\nSave and search local notes.\n');
  put(root, evidence, '# Review\nChecked the scope and acceptance criteria.\n');
  success(cli(root, 'work', 'check', 'notes'));
  const before = snapshot(root);
  assert.equal(failure(cli(root, 'work', 'complete', 'notes', '--evidence', evidence)).error.code, 'ACCEPTANCE_REQUIRED');
  assert.deepEqual(snapshot(root), before);
  confirmFixture(root, 'notes', [document, evidence]);
  const complete = success(cli(root, 'work', 'complete', 'notes', '--evidence', evidence, '--acceptance', 'accept-1'));
  assert.equal(complete.confirmation.confirmationBasis, 'reported-review');
  assert.equal(complete.automaticTransition, false);
  const recordPath = '.tiller/work/notes/record.json';
  const record = JSON.parse(readFileSync(join(root, recordPath), 'utf8'));
  delete record.artifacts.requirements.completion.confirmation;
  put(root, recordPath, JSON.stringify(record));
  const malformed = snapshot(root);
  failure(cli(root, 'work', 'resume', 'notes'));
  assert.deepEqual(snapshot(root), malformed);
});

test('changing a managed file produces a conflict without overwriting the edit', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  put(root, '.tiller/index.md', '# User maintained index\nKeep this edit.\n');
  const before = snapshot(root);
  failure(cli(root, 'init'));
  assert.deepEqual(snapshot(root), before);
});

const reviewedRequirements = `# 本地笔记 总体需求

> 状态：草稿，尚未确认。

## 产品定位与问题
帮助个人开发者保存和查找本地文字笔记，减少散落资料的查找成本。

## 场景与范围
支持本机新增、查看和搜索笔记；不包含多人同步和云端备份。

## 典型使用过程
用户输入文字形成笔记，随后输入关键词查看匹配内容；失败时保留原有笔记。

## 核心需求与约束
R1：保存输入的笔记内容。R2：按关键词查找并查看匹配笔记。资料保存在本机。

## 整体验收方向
保存一条包含指定关键词的笔记，重新打开后可检索并读到原文；不存在的关键词返回空结果。

## 详细需求索引
当前尚无模块需求文档；后续开展具体能力时按需细化。

## 待澄清问题
当前文档编写范围内无待澄清问题，产品要求仍需使用者确认。
`;

test('document completion binds evidence to current content and detects subsequent document edits', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.tiller/work/notes/requirements.md', reviewedRequirements);
  put(root, '.tiller/work/notes/evidence.md', '# 文档检查依据\n\n已核对本地笔记的目标、范围、两项核心需求与验收方向对应；仅交付需求草稿，不表示产品实现或需求批准。\n');
  success(cli(root, 'work', 'check', 'notes'));
  confirmFixture(root, 'notes', ['.tiller/work/notes/requirements.md', '.tiller/work/notes/evidence.md']);
  success(cli(root, 'work', 'complete', 'notes', '--evidence', '.tiller/work/notes/evidence.md', '--acceptance', 'accept-1'));
  success(cli(root, 'work', 'check', 'notes'));
  put(root, '.tiller/work/notes/requirements.md', `${reviewedRequirements}\n补充需求：支持删除笔记。\n`);
  const before = snapshot(root);
  const resumed = success(cli(root, 'work', 'resume', 'notes'));
  assert.match(JSON.stringify(resumed), /stale/);
  failure(cli(root, 'work', 'check', 'notes'));
  assert.deepEqual(snapshot(root), before, 'detecting stale evidence must be read-only');
});

test('changing completion evidence also invalidates the previous conclusion', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.tiller/work/notes/requirements.md', reviewedRequirements);
  put(root, '.tiller/work/notes/evidence.md', '# 文档检查依据\n\n已核对目标、边界与验收方向，需求草稿具备继续讨论所需信息。\n');
  confirmFixture(root, 'notes', ['.tiller/work/notes/requirements.md', '.tiller/work/notes/evidence.md']);
  success(cli(root, 'work', 'complete', 'notes', '--evidence', '.tiller/work/notes/evidence.md', '--acceptance', 'accept-1'));
  put(root, '.tiller/work/notes/evidence.md', '# 撤回检查结论\n\n发现遗漏删除场景，需要补充需求后重新评审。\n');
  const before = snapshot(root);
  assert.match(JSON.stringify(success(cli(root, 'work', 'resume', 'notes'))), /stale/);
  failure(cli(root, 'work', 'check', 'notes'));
  assert.deepEqual(snapshot(root), before);
});

test('repeating completion is a no-op and re-review preserves the prior completion evidence', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.tiller/work/notes/requirements.md', reviewedRequirements);
  const firstEvidence = '.tiller/work/notes/review-original.md';
  put(root, firstEvidence, '# 初次评审\n\n已核对笔记保存和检索需求与验收方向，交付草稿用于后续讨论。\n');
  confirmFixture(root, 'notes', ['.tiller/work/notes/requirements.md', firstEvidence]);
  success(cli(root, 'work', 'complete', 'notes', '--evidence', firstEvidence, '--acceptance', 'accept-1'));
  const recordPath = join(root, '.tiller/work/notes/record.json');
  const originalCompletion = JSON.parse(readFileSync(recordPath, 'utf8')).artifacts.requirements.completion;
  const before = snapshot(root);
  const repeated = success(cli(root, 'work', 'complete', 'notes', '--evidence', firstEvidence, '--acceptance', 'accept-1'));
  assert.equal(repeated.changed, false);
  assert.deepEqual(snapshot(root), before);
  put(root, '.tiller/work/notes/requirements.md', `${reviewedRequirements}\n补充：检索结果应保留完整笔记内容。\n`);
  failure(cli(root, 'work', 'check', 'notes'));
  const nextEvidence = '.tiller/work/notes/review-updated.md';
  put(root, nextEvidence, '# 补充评审\n\n已核对检索完整内容的补充约束和原验收方向相容，记录修订后的文档依据。\n');
  confirmFixture(root, 'notes', ['.tiller/work/notes/requirements.md', nextEvidence], 'accept-2');
  success(cli(root, 'work', 'complete', 'notes', '--evidence', nextEvidence, '--acceptance', 'accept-2'));
  success(cli(root, 'work', 'check', 'notes'));
  const updated = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(updated.artifacts.requirements.completionHistory, [originalCompletion]);
  assert.equal(updated.artifacts.requirements.completion.evidence, nextEvidence);
  assert.equal(readFileSync(join(root, firstEvidence), 'utf8'), '# 初次评审\n\n已核对笔记保存和检索需求与验收方向，交付草稿用于后续讨论。\n');
});

test('completion rejects evidence outside the project and evidence linked outside it', (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.tiller/work/notes/requirements.md', reviewedRequirements);
  put(outside, 'evidence.md', '# 外部资料\n没有授权读取外部评审依据。\n');
  symlinkSync(outside, join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  const before = snapshot(root);
  failure(cli(root, 'work', 'complete', 'notes', '--evidence', join(outside, 'evidence.md')));
  failure(cli(root, 'work', 'complete', 'notes', '--evidence', 'external/evidence.md'));
  assert.deepEqual(snapshot(root), before);
});

test('completion rejects self-evidence and local or Git metadata paths regardless of casing', (t) => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.tiller/work/notes/requirements.md', reviewedRequirements);
  const before = snapshot(root);
  for (const evidence of [
    '.tiller/work/notes/requirements.md', '.TILLER/work/notes/Requirements.md',
    '.tiller/work/notes/work.md', '.tiller/WORK/notes/Work.md',
    '.TILLER/local/review.md', '.GIT/review.md',
  ]) {
    const result = failure(cli(root, 'work', 'complete', 'notes', '--evidence', evidence));
    assert.equal(result.error?.code, 'INVALID_EVIDENCE', evidence);
    assert.deepEqual(snapshot(root), before);
  }
});

test('ignored evidence cannot complete work and ignoring existing evidence invalidates readiness', (t) => {
  const root = fixture(t);
  gitRepository(root, '.');
  success(cli(root, 'init'));
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.tiller/work/notes/requirements.md', reviewedRequirements);
  const evidence = 'private/review.md';
  put(root, evidence, '# 文档评审\n\n已检查保存与检索需求和验收方向一致，文档可交付讨论。\n');
  const ignorePath = join(root, '.gitignore');
  const originalIgnore = readFileSync(ignorePath, 'utf8');
  put(root, '.gitignore', `${originalIgnore}\n/private/\n`);
  const ignoredBefore = snapshot(root);
  failure(cli(root, 'work', 'complete', 'notes', '--evidence', evidence));
  assert.deepEqual(snapshot(root), ignoredBefore);
  put(root, '.gitignore', originalIgnore);
  confirmFixture(root, 'notes', ['.tiller/work/notes/requirements.md', evidence]);
  success(cli(root, 'work', 'complete', 'notes', '--evidence', evidence, '--acceptance', 'accept-1'));
  success(cli(root, 'work', 'check', 'notes'));
  put(root, '.gitignore', `${originalIgnore}\n/private/\n`);
  const before = snapshot(root);
  const resumed = success(cli(root, 'work', 'resume', 'notes'));
  assert.equal(resumed.ready, false);
  assert.ok(resumed.issues.length > 0);
  failure(cli(root, 'work', 'check', 'notes'));
  assert.deepEqual(snapshot(root), before);
});

test('ignored work files cannot be created or silently resumed as shared records', (t) => {
  const root = fixture(t);
  gitRepository(root, '.');
  success(cli(root, 'init'));
  const originalIgnore = readFileSync(join(root, '.gitignore'), 'utf8');
  put(root, '.gitignore', `${originalIgnore}\n/.tiller/work/notes/requirements.md\n`);
  const beforeCreate = snapshot(root);
  failure(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  assert.deepEqual(snapshot(root), beforeCreate);
  put(root, '.gitignore', originalIgnore);
  success(cli(root, 'work', 'create', 'notes', '--title', '本地笔记', '--type', 'product-requirements'));
  put(root, '.gitignore', `${originalIgnore}\n/.tiller/work/notes/record.json\n`);
  const beforeResume = snapshot(root);
  failure(cli(root, 'work', 'resume', 'notes'));
  assert.deepEqual(snapshot(root), beforeResume);
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
