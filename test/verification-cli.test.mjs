import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createWorkflowFixtureAt, startStage } from './workflow-fixtures.mjs';
import { cli, fixture, put, success, failure, snapshot } from './helpers.mjs';

test('verification CLI creates no business cases and check stays read-only', t => {
  const root = fixture(t);
  assert.equal(cli(root, 'verification', 'init').status, 1);
  success(cli(root, 'init'));
  const created = success(cli(root, 'verification', 'init'));
  assert.equal(created.changed, true);
  const before = readFileSync(join(root, '.tiller/verification/config.json'), 'utf8');
  const checked = success(cli(root, 'verification', 'check'));
  assert.deepEqual(checked.cases, []);
  assert.equal(checked.coverage.categories.length, 9);
  assert.ok(checked.coverage.categories.every(item => item.applicability === 'pending' && item.cases.length === 0));
  assert.equal(checked.files, undefined);
  assert.equal(readFileSync(join(root, '.tiller/verification/config.json'), 'utf8'), before);
  assert.equal(success(cli(root, 'verification', 'init')).changed, false);
  assert.equal(cli(root, 'verification', 'check', 'extra').status, 2);
  assert.equal(cli(root, 'verification', 'check', '--suite', 'x').status, 2);
});

test('verification CLI binds explicit runs and distinguishes reported case evidence', async t => {
  const root = fixture(t);
  success(cli(root, 'init'));
  success(cli(root, 'verification', 'init'));
  const f = await createWorkflowFixtureAt(root, '20261019-testing', 'bugfix');
  put(root, 'design.md', '# Module design\n');
  put(root, 'requirements.md', '# Requirement\n');
  put(root, 'test.cjs', 'process.stdout.write("fixture passed\\n");\n');
  put(root, 'evidence.md', '# Observed result\nThe fixture printed fixture passed.\n');
  const config = JSON.parse(readFileSync(join(root, '.tiller/verification/config.json'), 'utf8'));
  for (const key of Object.keys(config.categories)) config.categories[key] = { applicability: key === 'unit' ? 'applicable' : 'not-applicable', reason: 'Bounded fixture scope' };
  config.modules = [{id:'sample', design:{repository:'.',path:'design.md'}}];
  config.requirements = [{id:'REQ-1', source:{repository:'.',path:'requirements.md'}}];
  config.suites = [{id:'sample',repository:'.',command:'node',args:['test.cjs'],cwd:'.',timeoutMs:5000,inputs:[{repository:'.',path:'test.cjs'}]}];
  put(root, '.tiller/verification/config.json', JSON.stringify(config));
  put(root, '.tiller/verification/modules/sample/unit.yaml', `schema_version: 1
cases:
  - id: TC-1
    title: fixture prints expected output
    modules: [sample]
    categories: [unit]
    requirements: [REQ-1]
    given: [fixture exists]
    when: [execute fixture]
    then: [expected output]
    automation:
      suite: sample
      test_ref: TC-1
      source:
        repository: .
        path: test.cjs
`);
  success(cli(root, 'verification', 'check'));
  await startStage(f, 'reproduce');
  put(root, 'run.json', JSON.stringify({ workflow: { stageId: 'reproduce', actions: ['test'], confirmationRefs: [] } }));
  const plan = success(cli(root, 'verification', 'run', '20261019-testing', '--suite', 'sample', '--input', 'run.json', '--plan'));
  assert.match(plan.planId, /^[a-f0-9]{64}$/);
  const executed = success(cli(root, 'verification', 'run', '20261019-testing', '--suite', 'sample', '--input', 'run.json', '--apply', plan.planId));
  assert.equal(executed.record.schemaVersion, 2);
  const beforeReport = cli(root, 'verification', 'report', '20261019-testing');
  assert.equal(beforeReport.status, 1, 'suite exit 0 alone cannot complete cases');
  put(root, 'result.json', JSON.stringify({captureId:executed.record.id,environment:executed.record.environment,results:[{caseId:'TC-1',status:'passed',evidence:{repository:'.',path:'evidence.md'},note:'explicit external observation'}]}));
  success(cli(root, 'verification', 'record', '20261019-testing', '--input', 'result.json'));
  success(cli(root, 'verification', 'report', '20261019-testing'));
  put(root, 'test.cjs', 'process.exitCode = 1;\n');
  assert.equal(cli(root, 'verification', 'report', '20261019-testing').status, 1);
  assert.equal(cli(root, 'verification', 'run', '20261019-testing', '--suite', 'sample', '--input', 'run.json', '--apply', plan.planId).status, 1);
  const recordPath = join(root, executed.path);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const original = JSON.stringify({ ...record, schemaVersion: 1 }, null, 4) + '\r\n';
  put(root, executed.path, original);
  const before = snapshot(root);
  for (const args of [
    ['report', '20261019-testing'],
    ['run', '20261019-testing', '--suite', 'sample', '--input', 'run.json', '--plan'],
    ['record', '20261019-testing', '--input', 'result.json'],
  ]) {
    const rejected = failure(cli(root, 'verification', ...args));
    assert.equal(rejected.error.code, 'UNSUPPORTED_RECORD_VERSION');
    assert.match(rejected.error.message, /版本 1.*版本 2.*新建工作/);
    assert.equal(readFileSync(recordPath, 'utf8'), original);
    assert.deepEqual(snapshot(root), before);
  }
});
