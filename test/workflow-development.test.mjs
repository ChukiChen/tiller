import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureVerificationObservation, recordVerificationEvidence } from '../dist/verification-runs.js';
import { planWorkflowStageOperation, applyWorkflowStageOperation, readWorkflowControlSnapshot, inspectWorkflowStages, inspectWorkflowTaskExecution } from '../dist/workflow-stages.js';
import { planWorkflowTransition, applyWorkflowTransition } from '../dist/workflow-transitions.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import {
  planPlanningRegistration, applyPlanningRegistration, readRegisteredPlanning, planningConfirmationSubjects,
  planPlanningActivation, applyPlanningActivation,
} from '../dist/planning.js';
import { planTaskOperation, applyTaskOperation, inspectTaskStatus } from '../dist/tasks.js';
import { inspectWorkDelivery } from '../dist/overall-delivery.js';
import {
  createWorkflowFixture, workflowRef as ref, workflowStageRevision, stageStartInput, stageSelection, workflowCategories,
  startStage, registerStageOutputs, observeStage, completeStage, stageStatus, verifyInput, withStageReadCounter,
} from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

async function approve(f, stageId, subjects, extra = {}) {
  const context = await loadWorkflowPolicyContext(f.root, f.workId);
  const requestId = `${stageId}-approval-${++f.counter}`;
  const request = await requestConfirmation(f.root, f.workId, {
    requestId, gate: stageId, scope: f.scope, subjects,
    upstream: f.confirmationRefs.map(reference => reference.requestId),
    reviewSummary: 'Review the actual fixture output and its declared boundary.', openIssues: [], nextAction: 'Continue the declared fixture stage.',
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest, stageId }, ...extra,
  });
  const source = ref(`decisions/${requestId}.md`);
  put(f.root, source.path, '# Synthetic user decision\nApprove these exact presented fixture subjects.\n');
  const decisionId = `${requestId}-yes`;
  await recordDecision(f.root, f.workId, {
    decisionId, requestId, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: source, quote: 'Approve these exact presented fixture subjects.', presentation: ref(request.presentation) },
    sourceReview: { reviewer: 'fixture-observer', rationale: 'This synthetic decision explicitly matches the fixture presentation.', reviewedAt: new Date().toISOString() },
  });
  const reference = { workId: f.workId, requestId, decisionId };
  f.confirmationRefs.push(reference); return reference;
}

test('workflow development accepts completion approvals and requires current explicit task delegation', async t => {
  const f = await createWorkflowFixture(t, 'feature');
  put(f.root, 'requirement-map.md', '# Fixture requirement\nREQ-1: deliver a verified implementation output.\n');
  put(f.root, '.tiller/verification/config.json', JSON.stringify({
    schemaVersion: 1, modules: [], requirements: [{ id: 'REQ-1', source: ref('requirement-map.md') }], categories: workflowCategories, suites: [],
  }));
  const started = await startStage(f, 'requirements');
  await registerStageOutputs(f, 'requirements');
  const evidenceRefs = await observeStage(f, 'requirements', started.input.verification);
  const missingApproval = await planWorkflowStageOperation(f.root, f.workId, 'requirements', 'verify', verifyInput(f, started, evidenceRefs));
  assert.equal(missingApproval.operationAllowed, false);
  await approve(f, 'requirements', [ref('outputs/requirements-output.md')]);
  const input = verifyInput(f, started, evidenceRefs, { confirmationRefs: f.confirmationRefs });
  const plan = await planWorkflowStageOperation(f.root, f.workId, 'requirements', 'verify', input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  await applyWorkflowStageOperation(f.root, f.workId, 'requirements', 'verify', input, plan.planId);
  const status = await stageStatus(f, 'requirements');
  assert.equal(status.effectiveStatus, 'verified');
  assert.equal(status.attemptId, started.receipt.attemptId);
  assert.equal(workflowStageRevision(f), 2, 'Approval is a completion fact; no resume event is necessary.');
  assert.deepEqual(status.confirmationRefs, f.confirmationRefs);

  const designStarted = await startStage(f, 'design');
  await registerStageOutputs(f, 'design');
  await approve(f, 'design', [ref('outputs/design-output.md')]);
  await completeStage(f, 'design', designStarted);
  const planningStarted = await startStage(f, 'planning');
  await registerStageOutputs(f, 'planning');
  const selection = stageSelection(f, 'implementation');
  selection.requirements = ['REQ-1']; selection.checks[0].requirements = ['REQ-1'];
  const taskSelection = structuredClone(selection);
  taskSelection.checks[0].id = 'check-implement-task';
  const basis = { requirements: f.confirmationRefs[0], design: f.confirmationRefs[1] };
  const artifact = { id: 'implementation-output', type: 'document', purpose: 'Deliver the observed implementation fixture.',
    required: true, checks: ['check-implement-task'], source: ref('outputs/implementation-output.md') };
  const definition = {
    schemaVersion: 1, ownerWorkId: f.workId, revision: 'v-one', scope: f.scope, basis,
    requirements: [{ id: 'REQ-1', source: ref('outputs/requirements-output.md') }],
    tasks: [{ id: 'implement', title: 'Implement the declared fixture', outcome: 'An observed and verified output.', scope: f.scope,
      modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis,
      specifications: { requirements: [ref('outputs/requirements-output.md')], design: [ref('outputs/design-output.md')], standards: [ref('outputs/design-output.md')] },
      pendingDetails: [], dependencies: [], artifacts: [artifact], verification: taskSelection, humanCheckpoints: [] }],
    delivery: { requiredTasks: ['implement'], artifacts: [{ ...artifact, type: 'reference', source: undefined, taskId: 'implement', artifactId: artifact.id }],
      verification: taskSelection, humanCheckpoints: [], openIssues: [] },
    changeReason: 'Declare the exact development task, its outputs and actual verification.',
  };
  delete definition.delivery.artifacts[0].source;
  const registration = { operationId: 'register-development', expectedRevision: 0, plan: definition };
  const registrationPlan = await planPlanningRegistration(f.root, f.workId, registration);
  await applyPlanningRegistration(f.root, f.workId, registration, registrationPlan.planId);
  const registered = await readRegisteredPlanning(f.root, f.workId, 'v-one');
  const planningApproval = await approve(f, 'planning', [
    ref('outputs/planning-output.md'), ...planningConfirmationSubjects(f.workId, registered.record),
  ]);
  const activation = { operationId: 'activate-development', expectedRevision: 1, revision: 'v-one', confirmation: planningApproval };
  const activationPlan = await planPlanningActivation(f.root, f.workId, activation);
  await applyPlanningActivation(f.root, f.workId, activation, activationPlan.planId);
  await completeStage(f, 'planning', planningStarted);

  const taskStartInput = { operationId: 'start-implement', expectedRevision: 2, checkpointRefs: [] };
  await assert.rejects(planTaskOperation(f.root, f.workId, 'implement', 'start', taskStartInput), /阶段|委托/);
  const noDelegation = await planWorkflowStageOperation(f.root, f.workId, 'implementation', 'start', stageStartInput(f, 'implementation'));
  assert.equal(noDelegation.operationAllowed, false);
  assert.match(noDelegation.blockingReasons.join(';'), /委托/);
  const delegation = { kind: 'development-tasks', planningRevision: 'v-one', taskIds: ['implement'] };
  const implementation = await startStage(f, 'implementation', { verification: selection, delegation });
  const taskStartPlan = await planTaskOperation(f.root, f.workId, 'implement', 'start', taskStartInput);
  assert.equal(taskStartPlan.operationAllowed, true, JSON.stringify(taskStartPlan.blockingReasons));
  // Changing the stage attempt after a task preview must invalidate that preview.
  const resumed = await startStage(f, 'implementation', { verification: selection, delegation }, 'resume');
  await assert.rejects(applyTaskOperation(f.root, f.workId, 'implement', 'start', taskStartInput, taskStartPlan.planId), { code: 'CONTENT_CHANGED' });
  const currentTaskPlan = await withStageReadCounter(async stageReads => {
    const plan = await planTaskOperation(f.root, f.workId, 'implement', 'start', taskStartInput);
    assert.equal(stageReads(), 2, 'Task preview loads stages once and independently proves their bytes once before return.');
    return plan;
  });
  const taskStarted = await applyTaskOperation(f.root, f.workId, 'implement', 'start', taskStartInput, currentTaskPlan.planId);
  assert.notEqual(resumed.receipt.attemptId, implementation.receipt.attemptId);
  await registerStageOutputs(f, 'implementation');
  const implementationEvidence = await observeStage(f, 'implementation', selection);
  const notVerifiedTask = await planWorkflowStageOperation(f.root, f.workId, 'implementation', 'verify',
    verifyInput(f, resumed, implementationEvidence, { confirmationRefs: f.confirmationRefs }));
  assert.equal(notVerifiedTask.operationAllowed, false);
  assert.match(notVerifiedTask.blockingReasons.join(';'), /委托任务/);
  const captured = await captureVerificationObservation(f.root, f.workId, {
    selection: taskSelection, environment: 'synthetic-observer',
    workflow: { stageId: 'implementation', taskId: 'implement', actions: ['write-report'], confirmationRefs: f.confirmationRefs },
  });
  const taskObservation = ref('observations/implementation-task.md');
  const observations = taskSelection.checks.flatMap(check => check.inputs.map(input => {
    assert.match(readFileSync(join(f.root, input.path), 'utf8'), /Observed fixture output/u);
    return `${input.path}: observed expected fixture marker`;
  }));
  put(f.root, taskObservation.path, '# Actual task observations\n' + observations.join('\n') + '\n');
  const recorded = await recordVerificationEvidence(f.root, f.workId, {
    captureId: captured.record.id, environment: captured.record.environment,
    results: taskSelection.checks.map(check => ({ checkId: check.id, status: 'passed', evidence: taskObservation,
      note: 'Read the actual fixture file after task-bound capture; outcome belongs to this synthetic test.' })),
  });
  const taskEvidence = taskSelection.checks.map(check => ({ workId: f.workId, runId: recorded.record.id,
    checkId: check.id, environment: recorded.record.environment }));
  const taskVerifyInput = { operationId: 'verify-implement', expectedRevision: 3, attemptId: taskStarted.attemptId, evidenceRefs: taskEvidence };
  const taskVerifyPlan = await planTaskOperation(f.root, f.workId, 'implement', 'verify', taskVerifyInput);
  assert.equal(taskVerifyPlan.operationAllowed, true, JSON.stringify(taskVerifyPlan.blockingReasons));
  await applyTaskOperation(f.root, f.workId, 'implement', 'verify', taskVerifyInput, taskVerifyPlan.planId);
  const implementationVerify = verifyInput(f, resumed, implementationEvidence, { confirmationRefs: f.confirmationRefs });
  const implementationPlan = await planWorkflowStageOperation(f.root, f.workId, 'implementation', 'verify', implementationVerify);
  assert.equal(implementationPlan.operationAllowed, true, JSON.stringify(implementationPlan.blockingReasons));
  await applyWorkflowStageOperation(f.root, f.workId, 'implementation', 'verify', implementationVerify, implementationPlan.planId);
  const finished = await completeStage(f, 'verification');
  const deliveryInput = {
    verification: finished.verification, evidenceRefs: finished.evidenceRefs, planningEvidenceRefs: taskEvidence,
    checkMappings: f.snapshot.definition.completion.checks.map((text, index) => ({ index, text, checkIds: [finished.verification.checks[0].id] })),
  };
  const ready = await inspectWorkDelivery(f.root, f.workId, deliveryInput);
  assert.equal(ready.technicalReady, true, JSON.stringify(ready.issues));
  assert.equal((await stageStatus(f, 'implementation')).taskBindings[0].taskId, 'implement');
  put(f.root, 'outputs/implementation-output.md', '# Changed implementation\nObserved fixture output now needs fresh task verification.\n');
  assert.equal((await inspectTaskStatus(f.root, f.workId, 'implement')).tasks[0].effectiveStatus, 'stale');
  assert.equal((await stageStatus(f, 'implementation')).effectiveStatus, 'stale');
  const staleDelivery = await inspectWorkDelivery(f.root, f.workId, deliveryInput);
  assert.equal(staleDelivery.technicalReady, false);
  assert.equal(staleDelivery.operationAllowed, false);

  const { record } = await loadWorkflowPolicyContext(f.root, f.workId);
  const transition = {
    operationId: 'new-development-generation', expected: await readWorkflowControlSnapshot(f.root, f.workId, true),
    next: {
      workflow: record.workflow.id, workflowVersion: record.workflow.version, goal: record.goal, reason: record.selectionReason,
      scope: record.scope, impact: record.impact, basis: record.basis.map(({ sha256, ...item }) => item),
      actionSources: record.actionSources.map(({ sha256, ...item }) => item),
      expectedOutputs: record.expectedOutputs, completionCriteria: record.completionCriteria, level: record.level,
    },
    outputMappings: [], evidenceMappings: [], confirmationRefs: [],
  };
  const transitionPlan = await planWorkflowTransition(f.root, f.workId, transition);
  assert.equal(transitionPlan.operationAllowed, true, JSON.stringify(transitionPlan));
  await applyWorkflowTransition(f.root, f.workId, transition, transitionPlan.planId);
  put(f.root, `.tiller/work/${f.workId}/tasks.json`, '{invalid historical task state');
  const nextGeneration = await inspectWorkflowStages(f.root, f.workId);
  assert.equal(nextGeneration.development, null, 'Old generation delegation does not load the old task record.');
  assert.equal(nextGeneration.controlSnapshot.tasks, null);
  assert.ok(nextGeneration.stages.every(stage => stage.attemptId === null));
  await assert.rejects(inspectWorkflowTaskExecution(f.root, f.workId, 'implement'), /唯一当前开发阶段委托/u);
});
