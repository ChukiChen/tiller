import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const npm = process.env.npm_execpath;
assert.ok(npm, 'Run through npm run test:package');
const project = process.cwd();
const output = resolve('.tiller/local/package-validation');
mkdirSync(output, { recursive: true });
function run(command, args, cwd, status = 0) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: process.env,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result.stdout;
}
function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Package', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd, encoding: 'utf8', timeout: 20_000, windowsHide: true,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
function gitCommitIfDirty(cwd, message) {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8', timeout: 20_000, windowsHide: true });
  assert.equal(status.status, 0, status.stderr);
  if (!status.stdout.trim()) return;
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '--quiet', '-m', message);
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
function replaceTaskSection(content, title, body) {
  const lines = content.split('\n');
  const start = lines.findIndex(line => line.trim() === `### ${title}`);
  assert.notEqual(start, -1, `missing task section: ${title}`);
  let end = start + 1;
  while (end < lines.length && !/^#{2,3}\s+/u.test(lines[end])) end++;
  while (end > start + 1 && !lines[end - 1].trim()) end--;
  return [...lines.slice(0, start + 1), '', body, '', ...lines.slice(end)].join('\n');
}

const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--ignore-scripts=false', '--json', '--pack-destination', output], project))[0];
const paths = new Set(packed.files.map(file => file.path));
for (const path of ['dist/cli.js', 'dist/flow.js', 'resources/entry.md', 'resources/usage.md', 'resources/pull_request_template.md', 'resources/merge_request_template.md']) {
  assert.ok(paths.has(path), path);
}
assert.ok(!paths.has('resources/run.cjs'), 'resources/run.cjs must not be packaged');
for (const path of [...paths]) assert.ok(!/^resources\/(?:workflows|templates)\//u.test(path), path);
const expectedModules = ['branch-cleanup', 'branch-conventions', 'cases', 'cli', 'commit-conventions', 'confirmer', 'core', 'doctor', 'files', 'flow', 'init-apply', 'init-baseline', 'plans', 'platform-api', 'pr', 'project-metadata', 'project-root', 'release', 'repository-paths', 'shared-paths', 'task-id', 'task-worktrees', 'test-output', 'test-reporter', 'types', 'upgrade'];
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
assert.equal(Object.hasOwn(initialized.metadata.managedFiles, '.tiller/run.cjs'), false);
assert.ok(!existsSync(join(target, '.tiller/run.cjs')), 'init must not write a launcher');
const help = run(process.execPath, [cli, '--help'], target);
assert.ok(help.includes('tiller start'), 'tiller start');
assert.ok(help.includes('tiller plan start'), 'plan start');
assert.ok(help.includes('tiller case add'), 'case add');
assert.ok(help.includes('tiller pr'), 'pr');
assert.ok(help.includes('tiller review'), 'review');
assert.ok(help.includes('tiller release'), 'release');
assert.ok(help.includes('--platform'), 'platform');
assert.ok(help.includes('--slug'), 'slug');
assert.ok(help.includes('--summary'), 'summary');
assert.ok(help.includes('--requirement'), 'requirement input');
assert.ok(help.includes('--requirement-file'), 'requirement file input');
assert.ok(!help.includes('advanced'), 'advanced help must not be advertised');
assert.ok(!/lite|lightweight/iu.test(help), 'lite naming must be gone');
const installedUsage = readFileSync(join(target, '.tiller/usage.md'), 'utf8');
assert.ok(installedUsage.includes('tiller start'));
assert.ok(installedUsage.includes('case add'));
assert.ok(installedUsage.includes('tiller pr'));
assert.ok(installedUsage.includes('tiller review'));
assert.ok(installedUsage.includes('tiller release'));
assert.ok(installedUsage.includes('--requirement-file'));
const installedTemplate = readFileSync(join(target, '.github/pull_request_template.md'), 'utf8');
for (const heading of ['关联任务', '变更内容', '验收条件', '验证结果', '影响与风险']) assert.ok(installedTemplate.includes(`## ${heading}`), heading);
const gitlabTarget = join(root, 'gitlab-target');
mkdirSync(gitlabTarget, { recursive: true });
const gitlabInitialized = JSON.parse(run(process.execPath, [cli, 'init', gitlabTarget, '--platform', 'gitlab', '--json'], root));
assert.equal(gitlabInitialized.metadata.platform, 'gitlab');
assert.ok(existsSync(join(gitlabTarget, '.gitlab/merge_request_templates/Default.md')));
assert.ok(!existsSync(join(gitlabTarget, '.github/pull_request_template.md')));
const installedEntry = readFileSync(join(install, 'node_modules/tiller/resources/entry.md'), 'utf8').trimEnd();
assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), `<!-- tiller:entry:start -->\n${installedEntry}\n<!-- tiller:entry:end -->\n`);
const invoke = (args, status = 0) => JSON.parse(run(process.execPath, [cli, ...args, '--json'], target, status));
const taskId = '20261021-package-smoke';
mkdirSync(join(target, '.tiller/specs/modules/package-smoke'), { recursive: true });
writeFileSync(join(target, '.tiller/specs/modules/package-smoke/requirements.md'), '# Package smoke\n\n## Behavior\n\nThe packaged flow runs.\n\n## 验收条件\n\n- AC-1: package starts a task\n');
writeFileSync(join(target, '.tiller/specs/modules/package-smoke/design.md'), '# Package smoke design\n\nUse the installed CLI.\n');
const planned = invoke(['plan', 'start', 'package-plan', '--title', 'Package plan', '--goal', 'Verify packaged planning',
  '--spec', '.tiller/specs/requirements.md', '--item', 'P-1=Package flow;size=small;deps=-;specs=.tiller/specs/requirements.md']);
assert.deepEqual(planned.items, ['P-1']);
invoke(['plan', 'confirm', 'package-plan', '--quote', 'Package smoke plan confirmed']);
git(target, 'init', '--quiet');
git(target, 'add', '-A');
git(target, 'commit', '--quiet', '--allow-empty', '-m', 'package baseline');
const started = invoke(['start', taskId, '--title', 'Package smoke', '--requirement', 'Verify the default flow package entry',
  '--criterion', 'AC-1=package starts a task', '--plan', 'package-plan', '--item', 'P-1', '--target', '.']);
assert.equal(started.id, taskId);
assert.equal(started.size, 'small');
assert.ok(!started.next.includes('advanced'));
// start 只写任务 worktree；包冒烟按 worktree 读任务记录与提交夹具
const taskCheckout = join(target, '.tiller/local', taskId, 'worktrees');
assert.ok(existsSync(join(taskCheckout, '.tiller/task', taskId, 'task.md')), 'task record lives in worktree');
assert.ok(!existsSync(join(target, '.tiller/task', taskId, 'task.md')), 'primary is not seeded with task tree');
const taskRecord = join(taskCheckout, '.tiller/task', taskId, 'task.md');
assert.ok(!readFileSync(taskRecord, 'utf8').includes('"preExisting"'), 'new task marker omits preExisting');
assert.match(readFileSync(taskRecord, 'utf8'), /^### 使用场景$/mu);
const resumed = invoke(['resume', taskId]);
assert.equal(resumed.criteria[0].text, 'package starts a task');
assert.deepEqual(readdirSync(join(taskCheckout, '.tiller/task', taskId)), ['task.md']);
for (const args of [['advanced'], ['work', 'create'], ['workflow', 'list'], ['planning'], ['task'], ['delivery-check']]) {
  assert.equal(invoke(args, 2).error.code, 'INVALID_ARGUMENT', args.join(' '));
}
let requirementRecord = readFileSync(taskRecord, 'utf8');
requirementRecord = replaceTaskSection(requirementRecord, '使用场景', '包安装用户需要可重复验证默认流程。');
requirementRecord = replaceTaskSection(requirementRecord, '业务范围', ['- 做：验证发布包初始化与默认流程。', '- 不做：扩展发布能力。', '- 假设与待确认：无。'].join('\n'));
requirementRecord = replaceTaskSection(requirementRecord, '关键行为', '安装后的命令可完成初始化、任务确认与验证。');
requirementRecord = replaceTaskSection(requirementRecord, '异常与边界', '失败时返回非零并给出可读错误。');
writeFileSync(taskRecord, requirementRecord);
invoke(['confirm', taskId, 'requirements', '--quote', 'Package smoke requirement confirmed']);
const added = invoke(['case', 'add', taskId, '--module', 'package-smoke', '--kind', 'behavior', '--title', 'Packaged flow works',
  '--expected', 'the packaged test passes its named case',
  '--spec', '.tiller/specs/modules/package-smoke/requirements.md', '--criterion', 'AC-1']);
assert.equal(added.id, 'CASE-001');
mkdirSync(join(taskCheckout, 'test'), { recursive: true });
writeFileSync(join(taskCheckout, 'test/package-smoke.test.mjs'), "import assert from 'node:assert/strict';\nimport test from 'node:test';\n\ntest('CASE-001 package flow works', () => { assert.equal(1, 1); });\n");
gitCommitIfDirty(taskCheckout, 'test: package smoke fixture');
const verified = invoke(['verify', taskId, '--criterion', 'AC-1', '--case', added.id]);
assert.deepEqual(verified.cases, ['CASE-001']);
const checked = invoke(['check', taskId]);
assert.equal(checked.ready, true, checked.issues.join('\n'));
gitCommitIfDirty(taskCheckout, 'chore(workflow): 同步验证记录');
const accepted = invoke(['accept', taskId, '--quote', 'Package smoke accepted']);
assert.equal(accepted.ok, true);
gitCommitIfDirty(taskCheckout, 'chore(workflow): 记录交付验收');
const draft = invoke(['pr', taskId, '--draft-only']);
assert.equal(draft.branch, `feat/${taskId}`);
assert.ok(draft.title.endsWith(`[${taskId}]`));
assert.match(draft.body, /^## 关联任务$/mu);
// close 前把 feat 快进到 primary，否则共享记录在主分支上会因缺测试而阶段回落
git(target, 'merge', '--ff-only', `feat/${taskId}`);
const sharedTaskRecord = join(target, '.tiller/task', taskId, 'task.md');
const resolveTaskMd = () => existsSync(taskRecord) ? taskRecord : sharedTaskRecord;
const beforeClose = readFileSync(resolveTaskMd(), 'utf8');
const closed = invoke(['close', taskId, '--reason', 'Package smoke delivered']);
assert.equal(closed.stage, '已验收');
assert.ok(existsSync(sharedTaskRecord), 'merged task record remains on primary after close');
assert.equal(readFileSync(sharedTaskRecord, 'utf8'), beforeClose);
assert.equal(invoke(['resume', taskId]).stage, '已验收');
assert.equal(invoke(['reopen', taskId, '--reason', 'Package smoke reopened']).stage, '已验证');
invoke(['accept', taskId, '--quote', 'Package smoke accepted again']);
assert.equal(invoke(['plan', 'status', 'package-plan']).items[0].status, '已验收');
const upgrade = invoke(['upgrade', '--plan']);
assert.equal(upgrade.ready, true);
assert.deepEqual(upgrade.changes, []);
assert.equal(manifest(dirname(sharedTaskRecord)).length, 1);
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ version, files: packed.files.length }));
process.stdout.write(`Package smoke passed: ${version}, ${packed.files.length} packaged files.\n`);
