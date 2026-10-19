import test from 'node:test';
import assert from 'node:assert/strict';
import { planTaskOperation, applyTaskOperation, inspectTaskStatus } from '../dist/tasks.js';
import { planVerificationRun, applyVerificationRun, recordVerificationEvidence } from '../dist/verification-runs.js';
import { setupTasks, activateTaskPlan, copy } from './task-helpers.mjs';
import { put } from './helpers.mjs';

test('a case-verified task may omit explicitly optional artifacts while retaining missing-artifact warnings', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  const { root, workId } = context;
  const task = context.task('foundation');
  task.artifacts[0].required = false;
  task.artifacts[0].optionalReason = '附加说明不影响核心输入校验；核心行为由明确用例验证。';
  task.artifacts[0].checks = [];
  task.verification.caseIds = ['TC-OPTIONAL'];
  task.verification.checks = [];
  task.verification.reason = '通过实际输入校验用例判断核心行为，可选说明缺失仍保留警告。';
  const source = { repository: '.', path: 'input.txt' };
  const testSource = { repository: '.', path: 'check-input.mjs' };
  put(root, source.path, 'expected-input\n');
  put(root, testSource.path, 'import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; assert.equal(readFileSync("input.txt","utf8"),"expected-input\\n"); console.log("TC-OPTIONAL passed");\n');
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [], requirements: context.plan.requirements,
    categories: task.verification.categories, suites: [{ id: 'optional-input', repository: '.', command: 'node', args: [testSource.path], cwd: '.', timeoutMs: 10000, inputs: [source, testSource] }] }));
  put(root, '.tiller/verification/system/optional.yaml', `schema_version: 1
cases:
  - id: TC-OPTIONAL
    title: 核对核心输入
    modules: []
    categories: [usability]
    requirements: [REQ-1]
    given: [明确输入文件]
    when: [运行实际断言]
    then: [输入与预期相同]
    automation:
      suite: optional-input
      test_ref: TC-OPTIONAL
      source:
        repository: .
        path: check-input.mjs
`);
  await activateTaskPlan(context);
  const startInput = { operationId: 'start-optional', expectedRevision: context.revision };
  const startPlan = await planTaskOperation(root, workId, task.id, 'start', startInput);
  assert.equal(startPlan.operationAllowed, true, JSON.stringify(startPlan.blockingReasons));
  const started = await applyTaskOperation(root, workId, task.id, 'start', startInput, startPlan.planId);
  const runPlan = await planVerificationRun(root, workId, 'optional-input', task.verification);
  const executed = await applyVerificationRun(root, workId, 'optional-input', runPlan.planId, task.verification);
  assert.equal(executed.ready, true);
  assert.match(executed.record.execution.output, /TC-OPTIONAL passed/);
  const evidence = { repository: '.', path: `.tiller/work/${workId}/optional-case-evidence.md` };
  put(root, evidence.path, `# 实际执行观察\n\n程序按当前显式输入运行，退出码为 ${executed.record.execution.exitCode}。以下保留实际输出：\n\n${executed.record.execution.output}`);
  const recorded = await recordVerificationEvidence(root, workId, { captureId: executed.record.id, environment: executed.record.environment,
    results: [{ caseId: 'TC-OPTIONAL', status: 'passed', evidence, note: '核对实际执行的断言及输出，不把套件成功自动推广为其他用例通过。' }] });
  const verifyInput = { operationId: 'verify-optional', expectedRevision: started.revision, attemptId: started.attemptId,
    evidenceRefs: [{ workId, runId: recorded.record.id, caseId: 'TC-OPTIONAL', environment: recorded.record.environment }] };
  const verifyPlan = await planTaskOperation(root, workId, task.id, 'verify', verifyInput);
  assert.equal(verifyPlan.operationAllowed, true, JSON.stringify(verifyPlan.blockingReasons));
  assert.ok(verifyPlan.warnings.some(warning => warning.includes('document')));
  const verified = await applyTaskOperation(root, workId, task.id, 'verify', verifyInput, verifyPlan.planId);
  assert.equal(verified.technicalReady, true);
  const status = await inspectTaskStatus(root, workId, task.id);
  assert.equal(status.tasks[0].effectiveStatus, 'verified');
  assert.deepEqual(status.tasks[0].artifactSnapshots, {});
  assert.ok(status.tasks[0].warnings.some(warning => warning.includes('document')));
});

test('querying only a cancelled task cannot report technical readiness from an empty active set', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation', 'independent'] });
  const { root, workId } = context;
  await activateTaskPlan(context);
  const input = { operationId: 'start-before-cancellation', expectedRevision: context.revision };
  const preview = await planTaskOperation(root, workId, 'foundation', 'start', input);
  assert.equal(preview.operationAllowed, true, JSON.stringify(preview.blockingReasons));
  const started = await applyTaskOperation(root, workId, 'foundation', 'start', input, preview.planId);
  const revision = copy(context.plan);
  revision.revision = 'v-two';
  revision.changeReason = '明确取消尚未交付的基础任务，保留独立任务及原开始历史。';
  revision.tasks = revision.tasks.filter(task => task.id !== 'foundation');
  revision.delivery.requiredTasks = ['independent'];
  revision.delivery.artifacts[0].taskId = 'independent';
  revision.delivery.verification.checks[0].inputs = [revision.tasks[0].artifacts[0].source];
  await activateTaskPlan(context, revision, 'two');
  const cancelled = await inspectTaskStatus(root, workId, 'foundation');
  assert.equal(cancelled.tasks.length, 1);
  assert.equal(cancelled.tasks[0].recordedStatus, 'active');
  assert.equal(cancelled.tasks[0].effectiveStatus, 'cancelled');
  assert.equal(cancelled.tasks[0].eventSequence, started.eventSequence);
  assert.equal(cancelled.ready, false);
  assert.equal(cancelled.technicalReady, false);
});
