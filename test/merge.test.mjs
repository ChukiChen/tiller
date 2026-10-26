import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cli, cliPath, confirmTask, failure, fixture, put, spawnCaptured, success } from './helpers.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const read = (root, relative) => readFileSync(join(root, relative), 'utf8');

function git(root, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=Tiller Test', '-c', 'user.email=tiller@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function configure(root) {
  git(root, 'config', 'user.name', 'Tiller Test');
  git(root, 'config', 'user.email', 'tiller@example.invalid');
}

function fakeTool(t, root, binary, mode) {
  if (process.platform === 'win32') {
    t.skip('The fake platform executable uses a POSIX shell script.');
    return null;
  }
  const directory = join(root, 'fake-bin');
  put(root, `fake-bin/${binary}`, [
    '#!/bin/sh',
    'printf "%s|%s\\n" "$(basename "$0")" "$*" >> "${TILLER_FAKE_MERGE_LOG:?}"',
    `if [ "${mode}" = success ]; then`,
    '  printf "https://example.invalid/tiller/merge/1\\n"',
    '  exit 0',
    'fi',
    'printf "merge rejected\\n" >&2',
    'exit 7',
    '',
  ].join('\n'));
  chmodSync(join(directory, binary), 0o755);
  return directory;
}

function platformCalls(log) {
  return readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const [name, ...args] = line.split('|');
    return { name, args: args.join('|') };
  });
}

function cliAt(root, environment, ...args) {
  const result = spawnCaptured(process.execPath, [cliPath, ...args, '--json'], {
    cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, ...environment },
  });
  assert.equal(result.signal, null, result.stderr);
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { assert.fail(`Expected JSON output: ${result.stdout}\n${result.stderr}`); }
  return { ...result, data };
}

function initialize(t, platform, binary, mode) {
  const root = fixture(t);
  configure(root);
  const directory = fakeTool(t, root, binary, mode);
  if (!directory) return null;
  const log = join(root, 'platform.log');
  const environment = { PATH: `${directory}:${process.env.PATH ?? ''}`, TILLER_FAKE_MERGE_LOG: log };
  const initialized = success(cliAt(root, environment, 'init', '--platform', platform));
  put(root, 'platform.log', '');
  return { root, environment, log, baseline: initialized.initBaseline };
}

function acceptTask(root, id) {
  put(root, '.tiller/specs/modules/workflow/requirements.md', '# Workflow\n\n## Merge\n\nAccepted tasks can be merged.\n');
  put(root, '.tiller/specs/modules/workflow/design.md', '# Workflow design\n\nDelegate merge and cleanup.\n');
  put(root, 'src/merge-fixture.ts', 'export const mergeFixture = true;\n');
  success(cli(root, 'start', id, '--title', `Merge ${id}`, '--requirement', 'Merge an accepted task.',
    '--criterion', 'AC-1=Merge behavior is observable', '--size', 'small', '--target', '.'));
  success(confirmTask(root, id, 'requirements', '--by', 'Tiller Test'));
  const added = success(cli(root, 'case', 'add', id, '--module', 'workflow', '--kind', 'behavior',
    '--title', 'Merge fixture', '--expected', 'The accepted task can be merged.', '--criterion', 'AC-1',
    '--source', 'src/merge-fixture.ts'));
  const testPath = `test/${id}.test.mjs`;
  const testName = `${added.id} merge fixture`;
  put(root, testPath, `import test from 'node:test';\n\ntest('${testName}', () => {});\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '--quiet', '-m', 'test(workflow): 准备 merge 夹具');
  success(cli(root, 'verify', id, '--criterion', 'AC-1', '--test', `${testPath}::${testName}`));
  success(cli(root, 'accept', id, '--by', 'Tiller Test'));
}

test('CASE-234 README 面向最终用户的介绍与快速开始', () => {
  const readme = read(repository, 'README.md');
  assert.match(readme, /^# tiller\n/u);
  assert.deepEqual([...readme.matchAll(/^## (.+)$/gmu)].map(match => match[1]), ['快速开始']);
  assert.deepEqual([...readme.matchAll(/^### (.+)$/gmu)].map(match => match[1]), ['安装', '初始化工程', '用 AI 开发一个功能']);
  assert.match(readme, /npm install -g \.\/tiller-0\.5\.0\.tgz/u);
  assert.match(readme, /chore\(tiller\): 完成工程初始化/u);
  assert.match(readme, /合入[^\n]*git pull/u);
  assert.match(readme, /用 Codex 等 AI 编程工具/u);
  assert.match(readme, /`start` →（standard 任务先完成设计确认）→ 实现 → `verify` → `pr` → `merge`\/`close`/u);
  assert.match(readme, /需求范围、standard 任务的设计，以及最终交付验收/u);
  assert.match(readme, /合入与本机清理由 AI 按 tiller 约定完成/u);
  assert.match(readme, /合入操作由 AI 推进/u);
  assert.deepEqual([...readme.matchAll(/```[^\n]*\n([\s\S]*?)```/gu)].map(match => match[1].trim()),
    ['npm install -g ./tiller-0.5.0.tgz', 'tiller init .']);
  assert.doesNotMatch(readme, /尚未发布到 npm|维护者|决策记录/u);
});

test('CASE-242 README 以 AI 执行为主并使用 github/gitlab 命令名', () => {
  const readme = read(repository, 'README.md');
  assert.match(readme, /AI 会按工程内的 tiller 约定执行/u);
  assert.match(readme, /你主要负责在关键节点确认/u);
  assert.match(readme, /合入与本机清理由 AI 按 tiller 约定完成/u);
  assert.doesNotMatch(readme, /\bgh\b|\bglab\b/u);
  assert.doesNotMatch(readme, /```[^\n]*\n[^`]*(?:tiller\s+)?(?:pr|merge|close)\b/u);
  assert.doesNotMatch(readme, /squash|平台 CLI|底层工具名/u);
});

test('CASE-235 GitHub merge 成功后自动清理本机任务', async t => {
  const initialized = initialize(t, 'github', 'github', 'success');
  if (!initialized) return;
  const { root, environment, log } = initialized;
  const id = '20261026-github-merge';
  acceptTask(root, id);
  const local = join(root, '.tiller/local', id);
  assert.ok(existsSync(local));

  const merged = success(cliAt(root, environment, 'merge', id));
  assert.equal(merged.merged, true);
  assert.equal(merged.platform, 'github');
  assert.equal(merged.branch, `feat/${id}`);
  assert.equal(merged.command, `github pr merge feat/${id} --squash`);
  assert.equal(merged.close.id, id);
  assert.equal(existsSync(local), false);
  assert.deepEqual(platformCalls(log), [{ name: 'github', args: `pr merge feat/${id} --squash` }]);
});

test('CASE-236 GitHub merge 失败时保留下本机任务', async t => {
  const initialized = initialize(t, 'github', 'github', 'failure');
  if (!initialized) return;
  const { root, environment, log } = initialized;
  const id = '20261026-github-merge-failed';
  acceptTask(root, id);
  const local = join(root, '.tiller/local', id);

  const failed = failure(cliAt(root, environment, 'merge', id));
  assert.equal(failed.error.code, 'MERGE_FAILED');
  assert.match(failed.error.message, /merge rejected/u);
  assert.ok(existsSync(local));
  assert.ok(existsSync(join(local, 'worktrees')));
  assert.deepEqual(platformCalls(log), [{ name: 'github', args: `pr merge feat/${id} --squash` }]);
});

test('CASE-237 GitLab merge 成功后自动清理本机任务', async t => {
  const initialized = initialize(t, 'gitlab', 'gitlab', 'success');
  if (!initialized) return;
  const { root, environment, log } = initialized;
  const id = '20261026-gitlab-merge';
  acceptTask(root, id);
  const local = join(root, '.tiller/local', id);

  const merged = success(cliAt(root, environment, 'merge', id));
  assert.equal(merged.platform, 'gitlab');
  assert.equal(merged.command, `gitlab mr merge feat/${id} --squash --yes`);
  assert.equal(existsSync(local), false);
  assert.deepEqual(platformCalls(log), [{ name: 'gitlab', args: `mr merge feat/${id} --squash --yes` }]);
});

test('CASE-238 GitLab merge 失败时保留下本机任务', async t => {
  const initialized = initialize(t, 'gitlab', 'gitlab', 'failure');
  if (!initialized) return;
  const { root, environment, log } = initialized;
  const id = '20261026-gitlab-merge-failed';
  acceptTask(root, id);
  const local = join(root, '.tiller/local', id);

  const failed = failure(cliAt(root, environment, 'merge', id));
  assert.equal(failed.error.code, 'MERGE_FAILED');
  assert.ok(existsSync(local));
  assert.ok(existsSync(join(local, 'worktrees')));
  assert.deepEqual(platformCalls(log), [{ name: 'gitlab', args: `mr merge feat/${id} --squash --yes` }]);
});

test('CASE-239 init-id merge 合入初始化分支并清理 local', async t => {
  const initialized = initialize(t, 'github', 'github', 'success');
  if (!initialized) return;
  const { root, environment, log, baseline } = initialized;

  const merged = success(cliAt(root, environment, 'merge', baseline.id));
  assert.equal(merged.branch, 'chore/tiller-init');
  assert.equal(merged.close.stage, '已关闭');
  assert.equal(existsSync(join(root, '.tiller/local', baseline.id)), false);
  assert.equal(JSON.parse(read(root, '.tiller/project.json')).initBaseline.status, 'merged');
  assert.deepEqual(platformCalls(log), [{ name: 'github', args: 'pr merge chore/tiller-init --squash' }]);

  const started = success(cliAt(root, {}, 'start', '20261026-after-init-merge', '--title', 'After init',
    '--requirement', 'The merged initialization does not block tasks.', '--criterion', 'AC-1=Start succeeds',
    '--size', 'small', '--target', '.'));
  assert.equal(started.id, '20261026-after-init-merge');
});

test('CASE-244 PATH 仅有官方短名时仍以 github/gitlab 调用并成功', async t => {
  if (process.platform === 'win32') {
    t.skip('The fake platform executable uses a POSIX shell script.');
    return;
  }
  for (const item of [
    { platform: 'github', binary: 'gh', name: 'github', args: 'pr merge' },
    { platform: 'gitlab', binary: 'glab', name: 'gitlab', args: 'mr merge' },
  ]) {
    const root = fixture(t);
    configure(root);
    const directory = fakeTool(t, root, item.binary, 'success');
    if (!directory) return;
    const log = join(root, 'platform.log');
    const environment = { PATH: `${directory}:${process.env.PATH ?? ''}`, TILLER_FAKE_MERGE_LOG: log };
    success(cliAt(root, environment, 'init', '--platform', item.platform));
    assert.equal(platformCalls(log)[0]?.name, item.name);
    assert.match(platformCalls(log)[0]?.args ?? '', /^(?:pr|mr) create/u);
    put(root, 'platform.log', '');

    const id = `20261026-${item.name}-fallback`;
    acceptTask(root, id);
    const merged = success(cliAt(root, environment, 'merge', id));
    assert.equal(merged.platform, item.platform);
    assert.match(merged.command, new RegExp(`^${item.name} ${item.args}`, 'u'));
    assert.deepEqual(platformCalls(log), [{ name: item.name, args: `${item.args} feat/${id} --squash${item.name === 'gitlab' ? ' --yes' : ''}` }]);
  }

  const root = fixture(t);
  configure(root);
  const id = '20261026-no-platform-cli';
  success(cliAt(root, { PATH: '/usr/bin:/bin' }, 'init', '--platform', 'github'));
  acceptTask(root, id);
  const unavailable = failure(cliAt(root, { PATH: '/usr/bin:/bin' }, 'merge', id));
  assert.equal(unavailable.error.code, 'MERGE_TOOL_UNAVAILABLE');
  assert.match(unavailable.error.message, /无法执行 github/u);
  assert.doesNotMatch(unavailable.error.message, /\bgh\b|\bglab\b/u);
});

test('CASE-240 接入文档说明 merge 与网页合入手动 close', () => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) assert.equal(read(repository, pair[0]), read(repository, pair[1]), pair.join(' == '));

  for (const relative of ['resources/usage.md', 'resources/rules/core.md', 'resources/rules/activities/delivery.md']) {
    const content = read(repository, relative);
    assert.match(content, /merge <id>/u, relative);
    assert.match(content, /merge <init-id>/u, relative);
    assert.match(content, /网页合入[^\n]*(?:手动|`close`)[^\n]*close/u, relative);
  }
  assert.match(read(repository, 'resources/usage.md'), /github pr merge.*gitlab mr merge.*squash/u);
  assert.match(read(repository, 'resources/rules/activities/delivery.md'), /失败不清理/u);
});

test('CASE-243 受管文档与 CLI help 使用 github/gitlab 并保持镜像一致', () => {
  for (const pair of [
    ['resources/usage.md', '.tiller/usage.md'],
    ['resources/rules/core.md', '.tiller/rules/core.md'],
    ['resources/rules/activities/delivery.md', '.tiller/rules/activities/delivery.md'],
  ]) {
    const content = read(repository, pair[0]);
    assert.equal(content, read(repository, pair[1]), pair.join(' == '));
    assert.doesNotMatch(content, /\bgh\b|\bglab\b/u, pair[0]);
    assert.match(content, /`github pr merge`[^\n]*`gitlab mr merge`/u, pair[0]);
  }
  assert.match(read(repository, 'resources/usage.md'), /合入统一使用 `github`\/`gitlab`/u);
  const help = success(cli(repository, '--help')).help;
  assert.match(help, /github pr merge 或 gitlab mr merge/u);
  assert.doesNotMatch(help, /\bgh\b|\bglab\b/u);
});

test('CASE-241 版本保持 0.5.0 且新用例均有测试引用', () => {
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  assert.match(read(repository, 'src/cli.ts'), /CLI_VERSION = '0\.5\.0'/u);
  const source = read(repository, 'test/merge.test.mjs');
  for (let number = 234; number <= 241; number += 1) {
    assert.match(source, new RegExp(`test\\('[^'\\n]*CASE-${number}\\b`, 'u'));
  }
});

test('CASE-245 文档 CLI 名称任务保持 0.5.0 并通过质量门禁', () => {
  assert.equal(JSON.parse(read(repository, 'package.json')).version, '0.5.0');
  assert.equal(JSON.parse(read(repository, '.tiller/project.json')).resourceVersion, '0.5.0');
  assert.match(read(repository, 'src/cli.ts'), /CLI_VERSION = '0\.5\.0'/u);
  const sources = [read(repository, 'test/merge.test.mjs'), read(repository, 'test/rules.test.mjs'),
    read(repository, 'test/init-baseline.test.mjs')].join('\n');
  for (const id of ['CASE-242', 'CASE-243', 'CASE-244', 'CASE-245']) {
    assert.match(sources, new RegExp(`test\\('[^'\\n]*${id}\\b`, 'u'));
  }
});
