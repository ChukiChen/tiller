import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTasks, activateTaskPlan, writeTaskDocument, observeTask } from './task-helpers.mjs';
import { developmentStageSelection, registerDevelopmentOutputs, finishDevelopmentStage } from './planning-helpers.mjs';
import { planTaskOperation, applyTaskOperation } from '../dist/tasks.js';
import { planWorkflowStageOperation } from '../dist/workflow-stages.js';
import { evaluateVerificationSelection } from '../dist/verification-runs.js';
import { workflowStageRevision } from './workflow-fixtures.mjs';
import { initialize } from '../dist/core.js';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { loadBuiltinWorkflows, parseWorkflowSnapshot, workflowDefinitionDigest } from '../dist/workflow-catalog.js';
import { planWorkflowRegistration, applyWorkflowRegistration, loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation } from '../dist/confirmations.js';
import { inspectTaskStatus } from '../dist/tasks.js';
import { inspectWorkflowStages, inspectWorkflowTaskExecution, withWorkflowStageInputs } from '../dist/workflow-stages.js';
import { fixtureDecision, startDevelopmentStage } from './planning-helpers.mjs';
import { fixture, put } from './helpers.mjs';

async function operate(context, taskId, kind, extra = {}) {
  const input = { operationId: `${kind}-${taskId}`, expectedRevision: context.revision, ...extra };
  const plan = await planTaskOperation(context.root, context.workId, taskId, kind, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  const receipt = await applyTaskOperation(context.root, context.workId, taskId, kind, input, plan.planId);
  context.revision = receipt.revision;
  return receipt;
}

test('task observation requires an actual task start and cannot authorize another task or stage with identical checks', async t => {
  const context = await setupTasks(t, { taskIds: ['task-a', 'task-b'], reuseSeed: false });
  const selection = developmentStageSelection(context, 'implementation');
  for (const task of context.plan.tasks) {
    task.artifacts[0] = { ...task.artifacts[0], id: 'implementation-output',
      source: context.outputSources['implementation-output'], checks: selection.checks.map(check => check.id) };
    task.verification = structuredClone(selection);
  }
  context.plan.delivery.artifacts[0].artifactId = 'implementation-output';
  await activateTaskPlan(context);
  await writeTaskDocument(context, 'task-a');
  await registerDevelopmentOutputs(context, 'implementation');
  await assert.rejects(observeTask(context, 'task-a'), /开始|start|执行/u);

  const first = await operate(context, 'task-a', 'start');
  const firstEvidence = await observeTask(context, 'task-a');
  await operate(context, 'task-a', 'verify', { attemptId: first.attemptId, evidenceRefs: firstEvidence });
  const second = await operate(context, 'task-b', 'start');
  const wrong = await planTaskOperation(context.root, context.workId, 'task-b', 'verify', {
    operationId: 'wrong-task-observation', expectedRevision: context.revision, attemptId: second.attemptId, evidenceRefs: firstEvidence,
  });
  assert.equal(wrong.operationAllowed, false, 'Identical bytes and check IDs do not turn A authorization into B authorization.');
  const taskStatus = (await inspectTaskStatus(context.root, context.workId, 'task-a')).tasks[0];
  const stageEvidence = await evaluateVerificationSelection(context.root, context.workId, selection, firstEvidence, taskStatus.artifactSnapshots,
    { history: 'selected', workflow: { stageId: 'implementation', attemptId: context.implementation.receipt.attemptId } });
  assert.equal(stageEvidence.ready, false, 'The same passing task observation is ineligible as stage-attempt evidence.');
  const stage = await planWorkflowStageOperation(context.root, context.workId, 'implementation', 'verify', {
    operationId: 'task-evidence-as-stage', expectedStageRevision: workflowStageRevision(context),
    attemptId: context.implementation.receipt.attemptId, evidenceRefs: firstEvidence, confirmationRefs: context.confirmationRefs,
  });
  assert.equal(stage.operationAllowed, false, 'Task authorization cannot complete the enclosing stage, even for its exact checks and inputs.');
});

test('successive development stages evaluate only their own delegated tasks without recursive completion', { timeout: 1_800_000 }, async t => {
  const root = fixture(t); await initialize({ root });
  const workId = 'split-development';
  const scope = { repositories: ['.'], targets: [workId] };
  await createWorkflowFixtureAt(root, 'definition-owner', 'analysis', { scope });
  const builtin = (await loadBuiltinWorkflows()).find(item => item.id === 'feature');
  const definition = structuredClone(builtin.definition);
  definition.id = 'project.split-development';
  const original = definition.stages.find(stage => stage.id === 'implementation');
  const first = { ...original, id: 'dev-a', produces: ['output-a'] };
  const second = { ...original, id: 'dev-b', dependsOn: ['dev-a'], consumes: ['output-a'], produces: ['output-b'] };
  const replacement = { ...original, id: 'dev-c', produces: ['output-c'] };
  definition.stages.splice(definition.stages.indexOf(original), 1, first, second, replacement);
  definition.stages.find(stage => stage.id === 'verification').dependsOn = ['dev-b', 'dev-c'];
  definition.stages.find(stage => stage.id === 'verification').consumes = ['output-b', 'output-c'];
  definition.outputs = definition.outputs.filter(output => output.id !== 'implementation-output');
  definition.outputs.push({ id: 'output-a', role: 'code', title: 'First task result', producer: 'dev-a' },
    { id: 'output-b', role: 'code', title: 'Second task result', producer: 'dev-b' },
    { id: 'output-c', role: 'code', title: 'Replacement delegation result', producer: 'dev-c' });
  definition.completion.requiredOutputs = definition.completion.requiredOutputs.filter(id => id !== 'implementation-output').concat(['output-a', 'output-b', 'output-c']);
  const source = { repository: '.', path: `.tiller/workflows/${definition.id}@${definition.version}.json` };
  put(root, source.path, JSON.stringify(definition));
  const registration = { operationId: 'register-split', expectedRevision: 0, ownerWorkId: 'definition-owner',
    candidate: { id: definition.id, version: definition.version }, baseline: { id: builtin.id, version: builtin.version }, confirmationRefs: [] };
  const preview = await planWorkflowRegistration(root, registration);
  const policy = await loadWorkflowPolicyContext(root, 'definition-owner');
  await requestConfirmation(root, 'definition-owner', { requestId: 'split-definition', gate: 'scope', scope,
    subjects: [source], upstream: [], reviewSummary: 'Approve two ordered development delegations and an independent replacement stage.',
    openIssues: [], nextAction: 'Register this exact synthetic definition.',
    workflowBinding: { workflowDigest: policy.snapshot.digest, intentDigest: policy.intentDigest },
    scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'definition-owner', changeDigest: preview.changeDigest } });
  await fixtureDecision(root, 'definition-owner', 'split-definition', 'approve-split');
  registration.confirmationRefs = [{ workId: 'definition-owner', requestId: 'split-definition', decisionId: 'approve-split' }];
  const allowed = await planWorkflowRegistration(root, registration);
  await applyWorkflowRegistration(root, registration, allowed.planId);
  const workflowSnapshot = parseWorkflowSnapshot({ id: definition.id, version: definition.version, digest: workflowDefinitionDigest(definition), definition });
  const context = await setupTasks(t, { root, workId, scope, taskIds: ['task-a', 'task-b'], workflowSnapshot });
  context.implementationStage = 'dev-a';
  context.stageTaskIds = { 'dev-a': ['task-a'], 'dev-b': ['task-b'] };
  context.taskStageIds = { 'task-a': 'dev-a', 'task-b': 'dev-b' };
  await activateTaskPlan(context);
  const taskA = await operate(context, 'task-a', 'start');
  await writeTaskDocument(context, 'task-a');
  await operate(context, 'task-a', 'verify', { attemptId: taskA.attemptId, evidenceRefs: await observeTask(context, 'task-a') });
  put(root, context.outputSources['output-a'].path, '# First stage output\nTask A has its own observed result.\n');
  await registerDevelopmentOutputs(context, 'dev-a');
  await finishDevelopmentStage(context, 'dev-a', context.implementation);
  const devB = await startDevelopmentStage(context, 'dev-b', {
    delegation: { kind: 'development-tasks', planningRevision: context.plan.revision, taskIds: ['task-b'] },
  });
  const taskB = await operate(context, 'task-b', 'start');
  await writeTaskDocument(context, 'task-b');
  await operate(context, 'task-b', 'verify', { attemptId: taskB.attemptId, evidenceRefs: await observeTask(context, 'task-b') });
  put(root, context.outputSources['output-b'].path, '# Second stage output\nTask B has its own observed result.\n');
  await registerDevelopmentOutputs(context, 'dev-b');
  await finishDevelopmentStage(context, 'dev-b', devB);
  const status = await inspectTaskStatus(root, workId);
  assert.deepEqual(status.tasks.map(task => task.effectiveStatus), ['verified', 'verified']);
  const stages = await inspectWorkflowStages(root, workId, 'dev-b');
  assert.equal(stages.stages[0].effectiveStatus, 'verified');

  await withWorkflowStageInputs(root, workId, async ({ current, evaluated }) => {
    await evaluated.loadDevelopment();
    // At the evaluator boundary, force the otherwise-invalid cross-graph wait:
    // A needs B, B's stage needs dev-a, and dev-a completion needs A.
    // All starts/observations above are real; only this read-round copy changes.
    const originalPlanning = current.development.planning;
    try {
      current.development.planning = { ...originalPlanning, registration: { ...originalPlanning.registration,
        plan: { ...originalPlanning.registration.plan, tasks: originalPlanning.registration.plan.tasks.map(task =>
          task.id === 'task-a' ? { ...task, dependencies: [{ taskId: 'task-b', artifacts: ['document'] }] } : task) } } };
      let timeout;
      const results = await Promise.race([
        Promise.allSettled([evaluated.development(['task-a']),
          evaluated.evaluate(['dev-a']).then(() => evaluated.status('dev-a'))]),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Cross-graph evaluation did not settle within 120 seconds.')), 120_000);
        }),
      ]).finally(() => clearTimeout(timeout));
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          assert.equal(result.reason.code, 'TASK_INPUT_CHANGED', 'A changed planning identity is rejected before the graph can recurse.');
        } else if (index === 0) {
          assert.equal(result.value, null, 'Changing the planning identity after input loading must be rejected.');
          assert.ok(current.developmentIssues.includes('任务输入不属于当前规划或控制记录。'));
        } else {
          assert.equal(result.value?.technicalReady, false, 'Cyclic task/stage dependencies must not be technically ready.');
        }
      }
    } finally { current.development.planning = originalPlanning; }
  });

  // Moving A in an approved replacement plan must ignore its old plan's dev-a
  // delegation, while two owners in the current plan remain an error.
  const revised = structuredClone(context.plan); revised.revision = 'v-two';
  context.implementationStage = 'dev-c';
  context.stageTaskIds['dev-c'] = ['task-a'];
  context.taskStageIds['task-a'] = 'dev-c';
  context.implementation = undefined;
  await activateTaskPlan(context, revised, 'move-task-a');
  const moved = await inspectWorkflowTaskExecution(root, workId, 'task-a');
  assert.equal(moved.stageId, 'dev-c');
  assert.equal(moved.delegation.planningRevision, revised.revision);
  const movedStatus = (await inspectTaskStatus(root, workId, 'task-a')).tasks[0];
  assert.equal(movedStatus.effectiveStatus, 'stale', 'An observation authorized in dev-a cannot silently move to dev-c.');
  await startDevelopmentStage(context, 'dev-a', {
    delegation: { kind: 'development-tasks', planningRevision: revised.revision, taskIds: ['task-a'] },
  }, 'resume');
  await assert.rejects(inspectWorkflowTaskExecution(root, workId, 'task-a'), /唯一当前开发阶段委托/u);
});
