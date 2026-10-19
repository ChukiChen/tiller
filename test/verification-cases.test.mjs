import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { initialize } from '../dist/core.js';
import { inspectVerification, scaffoldVerification, readVerificationReference, verificationCategories } from '../dist/verification-cases.js';
import { parseVerificationYaml } from '../dist/verification-yaml.js';

async function project(t, workspace = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tiller-verification-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (workspace) {
    await promisify(execFile)('git', ['init', '--quiet', path.join(root, 'repositories', 'service-a')]);
    await initialize({ root, mode: 'workspace', repositories: ['service-a'] });
  } else await initialize({ root });
  return root;
}
async function put(root, relative, content) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), content);
}
async function catalog(t, workspace = false) {
  const root = await project(t, workspace);
  await scaffoldVerification(root);
  const ref = file => ({ repository: '.', path: file });
  const config = JSON.parse(await readFile(path.join(root, '.tiller/verification/config.json'), 'utf8'));
  config.modules = [{ id: 'alpha', design: ref('design.md') }, { id: 'beta', design: ref('design.md') }];
  config.requirements = [{ id: 'REQ-1', source: ref('requirements.md') }];
  config.categories.interface = { applicability: 'applicable', reason: 'CLI is a public interface.' };
  config.suites = [{ id: 'api', repository: '.', command: 'node', args: ['test.mjs'], cwd: '.', timeoutMs: 1000, inputs: [ref('source.ts')] }];
  for (const file of ['design.md', 'requirements.md', 'test.mjs', 'source.ts']) await put(root, file, `${file}\n`);
  await put(root, '.tiller/verification/config.json', JSON.stringify(config));
  await put(root, '.tiller/verification/modules/alpha/interface.yaml', caseText());
  return { root, config };
}
function caseText(overrides = '') {
  return `schema_version: 1
cases:
  - id: TC-ALPHA-001
    title: Preserve existing files
    modules: [alpha]
    categories: [interface]
    requirements: [REQ-1]
    given:
      - Existing file
    when:
      - Initialize project
    then:
      - Existing content remains
    automation:
      suite: api
      test_ref: preserves-user-content
      source:
        repository: '.'
        path: test.mjs
${overrides}`;
}

test('restricted YAML parses readable block lists, quoted scalars and nested criteria', () => {
  const parsed = parseVerificationYaml(caseText('    criteria:\n      latency:\n        maximum: 200\n      error_rate: 0.01\n      required: true\n'));
  assert.equal(parsed.cases[0].automation.source.repository, '.');
  assert.deepEqual(parsed.cases[0].criteria, { latency: { maximum: 200 }, error_rate: 0.01, required: true });
  assert.deepEqual(parseVerificationYaml("title: student's record\n"), { title: "student's record" });
  assert.deepEqual(parseVerificationYaml("values: ['a,b', \"x#y\", 'it''s', false, 3] # comment\n"), { values: ['a,b', 'x#y', "it's", false, 3] });
});

test('restricted YAML rejects ambiguous or executable syntax, duplicate and unsafe keys and excessive input', () => {
  for (const text of [
    'a: 1\na: 2\n', '__proto__: x\n', 'x:\n  constructor: x\n', 'x: &anchor thing\n', 'x: *anchor\n', 'x: !!str hello\n',
    'x:\n  <<: value\n', 'x: |\n  multiline\n', 'x: >\n  multiline\n', 'x: null\n', 'x: 1e3\n', 'x: 2026-10-19\n',
    'x: [a, [b]]\n', 'x: [a,]\n', 'x: {a: b}\n', 'x:\n   y: wrong-indent\n', 'x:\n\ty: tabs\n',
    'x: "unterminated\n', 'x: a: b\n', 'x: yes\n', 'x: .NaN\n', 'x: 999999999999999999999\n',
  ]) assert.throws(() => parseVerificationYaml(text), undefined, text);
  assert.throws(() => parseVerificationYaml('x: ' + 'a'.repeat(1024 * 1024)), /MiB/u);
  assert.throws(() => parseVerificationYaml(Array.from({ length: 20 }, (_, i) => '  '.repeat(i) + 'x:').join('\n') + '\n' + '  '.repeat(20) + 'v: final'), /深度/u);
});

test('scaffold is safe, empty, repeatable and preserves user-authored index', async t => {
  const root = await project(t);
  assert.equal((await scaffoldVerification(root)).changed, true);
  const config = JSON.parse(await readFile(path.join(root, '.tiller/verification/config.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.categories), [...verificationCategories]);
  assert.ok(Object.values(config.categories).every(value => value.applicability === 'pending'));
  assert.deepEqual(config.modules, []);
  await put(root, '.tiller/verification/index.md', 'User testing strategy\n');
  assert.deepEqual(await scaffoldVerification(root), { changed: false, ready: true, issues: [] });
  assert.equal(await readFile(path.join(root, '.tiller/verification/index.md'), 'utf8'), 'User testing strategy\n');
  assert.deepEqual((await inspectVerification(root)).cases, []);
});

test('scaffold refuses partial or orphan verification content without overwriting', async t => {
  const root = await project(t);
  await put(root, '.tiller/verification/index.md', 'Keep\n');
  await assert.rejects(scaffoldVerification(root), /部分存在/u);
  assert.equal(await readFile(path.join(root, '.tiller/verification/index.md'), 'utf8'), 'Keep\n');
  await rm(path.join(root, '.tiller/verification/index.md'));
  await put(root, '.tiller/verification/modules/alpha/unit.yaml', 'Keep\n');
  await assert.rejects(scaffoldVerification(root), /未登记/u);
});

test('inspection resolves declared references and records text snapshots without executing tests', async t => {
  const { root } = await catalog(t);
  const result = await inspectVerification(root);
  assert.equal(result.ready, true, result.issues.join('\n'));
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0].file, '.tiller/verification/modules/alpha/interface.yaml');
  for (const file of ['design.md', 'requirements.md', 'source.ts', 'test.mjs']) assert.equal(result.files[`.::${file}`], `${file}\n`);
  assert.equal(result.config.suites[0].command, 'node');
  assert.equal(result.cases[0].passed, undefined);
  assert.equal(await readVerificationReference(root, { repository: '.', path: 'test.mjs' }), 'test.mjs\n');
});

test('catalog rejects unresolved ids, unknown fields, duplicate cases and duplicate suite mappings', async t => {
  const { root } = await catalog(t);
  const file = '.tiller/verification/modules/alpha/interface.yaml';
  for (const [text, expected] of [
    [caseText().replace('[REQ-1]', '[MISSING]'), /需求未登记/u],
    [caseText().replace('[alpha]', '[missing]'), /模块未登记/u],
    [caseText().replace('[interface]', '[unknown]'), /未知测试类别/u],
    [caseText().replace('suite: api', 'suite: absent'), /套件未登记/u],
    [caseText('    misspelled: true\n'), /未知字段/u],
    [caseText().replace('then:', 'then_typo:'), /未知字段/u],
    [caseText() + caseText().split('cases:\n')[1], /重复用例标识/u],
    [caseText() + caseText().split('cases:\n')[1].replace('TC-ALPHA-001', 'TC-ALPHA-002'), /重复测试引用/u],
  ]) {
    await put(root, file, text);
    const result = await inspectVerification(root);
    assert.equal(result.ready, false);
    assert.match(result.issues.join('\n'), expected);
  }
});

test('module membership, cross-module scope and system placement are checked', async t => {
  const { root } = await catalog(t);
  await put(root, '.tiller/verification/modules/alpha/interface.yaml', caseText().replace('[interface]', '[unit]'));
  assert.match((await inspectVerification(root)).issues.join('\n'), /必须包含文件名对应类别/u);
  await put(root, '.tiller/verification/modules/alpha/interface.yaml', caseText().replace('[interface]', '[interface, security]'));
  assert.equal((await inspectVerification(root)).ready, true);
  await rm(path.join(root, '.tiller/verification/modules/alpha/interface.yaml'));
  await put(root, '.tiller/verification/modules/alpha/arbitrary.yaml', 'schema_version: 1\ncases: []\n');
  assert.match((await inspectVerification(root)).issues.join('\n'), /文件名必须为已定义测试类别/u);
  await rm(path.join(root, '.tiller/verification/modules/alpha/arbitrary.yaml'));
  await put(root, '.tiller/verification/cross-module/enrollment.yaml', caseText());
  assert.match((await inspectVerification(root)).issues.join('\n'), /至少涉及两个/u);
  await put(root, '.tiller/verification/cross-module/enrollment.yaml', caseText().replace('[alpha]', '[alpha, beta]'));
  assert.equal((await inspectVerification(root)).ready, true);
  await rm(path.join(root, '.tiller/verification/cross-module/enrollment.yaml'));
  await put(root, '.tiller/verification/system/install.yaml', caseText().replace('[alpha]', '[]'));
  assert.equal((await inspectVerification(root)).ready, true);
  await put(root, '.tiller/verification/unplaced.yaml', caseText());
  assert.match((await inspectVerification(root)).issues.join('\n'), /位置无效/u);
});

test('configuration rejects unknown fields, inconsistent applicability and unbounded or missing suite inputs', async t => {
  const { root, config } = await catalog(t);
  for (const change of [
    value => { value.unrecognized = true; },
    value => { value.suites[0].inputs = []; },
    value => { value.suites[0].timeoutMs = 0; },
    value => { value.suites[0].cwd = '../outside'; },
    value => { value.categories.interface.applicability = 'not-applicable'; },
    value => { value.modules.push(value.modules[0]); },
    value => { delete value.categories.security; },
  ]) {
    const value = structuredClone(config); change(value);
    await put(root, '.tiller/verification/config.json', JSON.stringify(value));
    assert.equal((await inspectVerification(root)).ready, false);
  }
});

test('references refuse ignored local files, traversal, unregistered repositories and symlinks', async t => {
  const { root } = await catalog(t);
  for (const ref of [
    { repository: '.', path: '.tiller/local/private.md' },
    { repository: '.', path: '../outside.md' },
    { repository: '.', path: '.git/config' },
    { repository: 'unknown', path: 'design.md' },
    { repository: '.', path: 'absent.md' },
  ]) await assert.rejects(readVerificationReference(root, ref));
  await mkdir(path.join(root, 'reference-source'));
  await put(root, 'reference-source/design.md', 'Linked design\n');
  await symlink(path.join(root, 'reference-source'), path.join(root, 'linked'), 'junction');
  await assert.rejects(readVerificationReference(root, { repository: '.', path: 'linked/design.md' }), /符号链接/u);
  await symlink(path.join(root, '.tiller/verification/modules/alpha'), path.join(root, '.tiller/verification/modules/linked'), 'junction');
  assert.equal((await inspectVerification(root)).ready, false);
});

test('multi-repository references use registered identities instead of management traversal', async t => {
  const { root, config } = await catalog(t, true);
  await put(root, 'repositories/service-a/design.md', 'Business design\n');
  config.modules[0].design = { repository: 'service-a', path: 'design.md' };
  await put(root, '.tiller/verification/config.json', JSON.stringify(config));
  const result = await inspectVerification(root);
  assert.equal(result.ready, true, result.issues.join('\n'));
  assert.equal(result.files['service-a::design.md'], 'Business design\n');
  await assert.rejects(readVerificationReference(root, { repository: '.', path: 'repositories/service-a/design.md' }), /仓库标识/u);
});

test('management suites cannot select repository container or nested repositories through cwd casing', async t => {
  const { root, config } = await catalog(t, true);
  await mkdir(path.join(root, 'repositories/unregistered'), { recursive: true });
  for (const cwd of ['repositories', 'Repositories', 'repositories/service-a', 'Repositories/service-a', 'repositories/SERVICE-A', 'repositories/unregistered', 'REPOSITORIES/unregistered']) {
    config.suites[0].cwd = cwd;
    await put(root, '.tiller/verification/config.json', JSON.stringify(config));
    const result = await inspectVerification(root);
    assert.equal(result.ready, false, cwd);
    assert.match(result.issues.join('\n'), /套件必须通过业务仓库标识/u, cwd);
  }
  config.suites[0].repository = 'service-a';
  config.suites[0].cwd = '.';
  await put(root, '.tiller/verification/config.json', JSON.stringify(config));
  const allowed = await inspectVerification(root);
  assert.equal(allowed.ready, true, allowed.issues.join('\n'));
});
