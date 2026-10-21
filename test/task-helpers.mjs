import { resolveRepositoryRoot } from '../dist/delivery-location.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planPlanningRegistration, applyPlanningRegistration, planPlanningActivation, applyPlanningActivation, loadPlanningState } from '../dist/planning.js';
import { captureVerificationObservation, recordVerificationEvidence, planVerificationRun, applyVerificationRun } from '../dist/verification-runs.js';
import { setupPlanning, documentSelection, fixtureDecision, startDevelopmentStage, registerDevelopmentOutputs, finishDevelopmentStage } from './planning-helpers.mjs';
import { requestConfirmation } from '../dist/confirmations.js';
import { checkpointDefinitionDigest } from '../dist/gate-conditions.js';
import { put } from './helpers.mjs';

export const copy = value => structuredClone(value);

export async function setupTasks(t, options = {}) {
  const context = await setupPlanning(t, options);
  const base = context.plan.tasks[0];
  const repository = base.artifacts[0].source.repository;
  const ids = options.taskIds ?? ['foundation', 'downstream', 'independent'];
  context.plan.tasks = ids.map(id => {
    const task = copy(base);
    task.id = id;
    task.title = `${id} 可验证交付`;
    task.artifacts[0].source = { repository, path: `docs/${id}.md` };
    task.artifacts[0].checks = [`${id}-review`];
    task.verification = documentSelection(task.artifacts[0].source, 'document', `${id}-review`);
    task.dependencies = id === 'downstream' ? [{ taskId: 'foundation', artifacts: ['document'] }] : [];
    return task;
  });
  context.plan.delivery.requiredTasks = ids;
  context.plan.delivery.artifacts[0].taskId = ids[0];
  context.plan.delivery.verification = documentSelection(context.plan.tasks[0].artifacts[0].source, 'delivered-document', 'delivery-review');
  if (options.runtime) {
    const task = context.plan.tasks[0];
    const check = { id: `${task.id}-runtime`, kind: 'execution', suite: 'document-runtime', artifactIds: ['document'],
      inputs: [task.artifacts[0].source], requirements: ['REQ-1'], categories: ['usability'], reason: '实际读取交付说明并检查预期正文。' };
    task.verification.checks.push(check);
    task.artifacts[0].checks.push(check.id);
  }
  context.registration.plan = context.plan;
  context.task = id => context.plan.tasks.find(task => task.id === id);
  context.refPath = async ref => ({ root: await resolveRepositoryRoot(context.root, ref.repository, context.workId), path: ref.path });
  context.write = async (ref, text) => { const target = await context.refPath(ref); return put(target.root, target.path, text); };
  const config = { schemaVersion: 1, modules: [], requirements: context.plan.requirements,
    categories: context.plan.tasks[0].verification.categories,
    suites: options.runtime ? [{ id: 'document-runtime', repository, command: 'node', cwd: '.', timeoutMs: 10000,
      args: ['-e', `const fs=require('node:fs'); if(!fs.readFileSync(${JSON.stringify(context.plan.tasks[0].artifacts[0].source.path)},'utf8').includes('可执行步骤'))process.exit(7);`],
      inputs: [context.plan.tasks[0].artifacts[0].source] }] : [] };
  put(context.root, '.tiller/verification/config.json', JSON.stringify(config));
  context.observationSequence = 0;
  return context;
}

export async function activateTaskPlan(context, plan = context.plan, suffix = 'one') {
  // A replacement approval supersedes the old planning grant; stale grants must
  // not poison otherwise unchanged task observations.
  context.confirmationRefs = [context.basis.requirements, context.basis.design];
  const planningStart = await startDevelopmentStage(context, 'planning', {}, context.completed.has('planning') ? 'resume' : 'start');
  const state = await loadPlanningState(context.root, context.workId);
  const input = { operationId: `register-${suffix}`, expectedRevision: state.state.revision, plan };
  const registration = await planPlanningRegistration(context.root, context.workId, input);
  await applyPlanningRegistration(context.root, context.workId, input, registration.planId);
  const confirmation = await context.approvePlanning(plan.revision, `planning-${suffix}`);
  context.confirmationRefs.push(confirmation);
  await registerDevelopmentOutputs(context, 'planning');
  const activationInput = { operationId: `activate-${suffix}`, expectedRevision: state.state.revision + 1, revision: plan.revision, confirmation };
  const activation = await planPlanningActivation(context.root, context.workId, activationInput);
  const activated = await applyPlanningActivation(context.root, context.workId, activationInput, activation.planId);
  context.plan = plan;
  context.revision = activated.revision;
  context.planningRequestId = `planning-${suffix}`;
  await finishDevelopmentStage(context, 'planning', planningStart);
  const implementationStage = context.implementationStage ?? 'implementation';
  context.implementation = await startDevelopmentStage(context, implementationStage, {
    delegation: { kind: 'development-tasks', planningRevision: plan.revision,
      taskIds: context.stageTaskIds?.[implementationStage] ?? plan.tasks.map(task => task.id) },
  }, context.implementation ? 'resume' : 'start');
  return { registration, activation };
}

export async function writeTaskDocument(context, taskId, content = '# 已核对说明\n\n可执行步骤：读取输入、执行操作、核对输出；异常时保留现场。\n') {
  return context.write(context.task(taskId).artifacts[0].source, content);
}

export async function observeTask(context, taskId, { status = 'passed', runtime = true, manual: includeManual = true } = {}) {
  const task = context.task(taskId);
  const workflow = { stageId: context.taskStageIds?.[taskId] ?? 'implementation', taskId, actions: ['write-report'], confirmationRefs: [...context.confirmationRefs] };
  const evidenceRefs = [];
  const manual = includeManual ? task.verification.checks.filter(check => check.kind === 'manual') : [];
  if (manual.length) {
    const captured = await captureVerificationObservation(context.root, context.workId, {
      selection: { ...task.verification, checks: manual }, environment: 'synthetic task observer', workflow,
    });
    const evidence = { repository: '.', path: `.tiller/work/${context.workId}/evidence/${taskId}-${++context.observationSequence}.md` };
    const observations = [];
    for (const check of manual) for (const input of check.inputs) {
      const target = await context.refPath(input);
      observations.push(`${check.id}: ${input.repository}:${input.path}\n${readFileSync(join(target.root, target.path), 'utf8')}`);
    }
    put(context.root, evidence.path, '# 隔离测试观察\n\n实际读取当前交付文档；此来源不代表真实用户验收。\n' + observations.join('\n'));
    const recorded = await recordVerificationEvidence(context.root, context.workId, {
      captureId: captured.record.id, environment: captured.record.environment,
      results: manual.map(check => ({ checkId: check.id, status, evidence, note: '对当前夹具对象作出明确结果；保留受检版本。' })),
    });
    evidenceRefs.push(...manual.map(check => ({ workId: context.workId, runId: recorded.record.id, checkId: check.id, environment: recorded.record.environment })));
  }
  if (runtime) for (const check of task.verification.checks.filter(check => check.kind === 'execution')) {
    const selection = { ...task.verification, checks: [check] };
    const executionWorkflow = { ...workflow, actions: ['test'] };
    const planned = await planVerificationRun(context.root, context.workId, check.suite, selection, executionWorkflow);
    const executed = await applyVerificationRun(context.root, context.workId, check.suite, planned.planId, selection, executionWorkflow);
    evidenceRefs.push({ workId: context.workId, runId: executed.record.id, checkId: check.id, environment: executed.record.environment });
  }
  return evidenceRefs;
}

export async function approveTaskCheckpoint(context, taskId, checkpointId, operation, suffix = checkpointId, outcome = 'approved') {
  const task = context.task(taskId);
  const checkpoint = task.humanCheckpoints.find(item => item.id === checkpointId);
  const requestId = `checkpoint-${suffix}`;
  await requestConfirmation(context.root, context.workId, { requestId, gate: 'checkpoint', scope: task.scope,
    workflowBinding: await context.binding('implementation'),
    subjects: checkpoint.subjects, upstream: [context.planningRequestId],
    checkpointBinding: { ownerWorkId: context.workId, taskId, checkpointId, operation, definitionDigest: checkpointDefinitionDigest(checkpoint) },
    reviewSummary: '隔离测试核对具体任务、操作、检查点和对象。', openIssues: [], nextAction: '仅允许当前明确任务操作。' });
  const decisionId = `approve-${requestId}`;
  await fixtureDecision(context.root, context.workId, requestId, decisionId, outcome);
  return { workId: context.workId, requestId, decisionId };
}
