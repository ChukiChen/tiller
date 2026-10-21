import type { WorkflowApplicability } from './workflow-catalog.js';
import type { StageEvent, WorkflowStageStartInput, WorkflowStageVerifyInput, WorkflowStageStatus } from './workflow-stages.js';

export interface StageRuleFacts {
  stageId: string;
  workflowRevision: number;
  applicability: WorkflowApplicability;
  sourceIssues: readonly string[];
  event?: StageEvent | undefined;
  start?: StageEvent | undefined;
  basis?: {basisDigest: string; issues: string[]};
  completion?: Pick<WorkflowStageStatus, 'artifactSnapshots' | 'verificationBasisDigest' | 'taskBindings' | 'completionBasisDigest' | 'issues'> | undefined;
}

/** Decide stage status from explicit facts. Loading and freshness checks belong to the caller. */
export function evaluateWorkflowStageFacts(facts: StageRuleFacts): WorkflowStageStatus {
  const {stageId, workflowRevision, applicability: state, event, start, basis, completion} = facts;
  const input = start?.input as WorkflowStageStartInput | undefined;
  const result: WorkflowStageStatus = {stageId, workflowRevision, applicability: state,
    effectiveStatus: state === 'not-applicable' ? 'not-applicable' : 'pending',
    attemptId: start?.attemptId ?? null, eventSequence: event?.sequence ?? null, startBasisDigest: start?.startBasisDigest ?? null,
    completionBasisDigest: null, artifactSnapshots: {}, verificationBasisDigest: null, taskBindings: [],
    verification: input?.verification ?? null, checkMappings: input?.checkMappings ?? [],
    evidenceRefs: event?.operation === 'verify' ? (event.input as WorkflowStageVerifyInput).evidenceRefs : [],
    confirmationRefs: event?.operation === 'verify' ? (event.input as WorkflowStageVerifyInput).confirmationRefs ?? input?.confirmationRefs ?? [] : input?.confirmationRefs ?? [],
    ...(input?.operationBinding ? {operationBinding: input.operationBinding} : {}), delegation: input?.delegation ?? null,
    technicalReady: false, issues: [...facts.sourceIssues]};
  if (state === 'not-applicable') { result.technicalReady = !result.issues.length; return result; }
  if (state === 'unresolved') { result.issues.push('阶段条件未知，不能视为不适用。'); result.effectiveStatus = 'blocked'; return result; }
  if (!start || !input) return result;
  if (!basis) throw Object.assign(new Error('阶段开始材料未包含在显式输入中。'), {code: 'WORKFLOW_STAGE_INPUT_INCOMPLETE'});
  result.issues.push(...basis.issues);
  if (basis.basisDigest !== start.startBasisDigest) result.issues.push('阶段开始依据已变化，必须 resume。');
  if (event?.operation === 'verify') {
    if (!completion) throw Object.assign(new Error('阶段完成材料未包含在显式输入中。'), {code: 'WORKFLOW_STAGE_INPUT_INCOMPLETE'});
    result.issues.push(...completion.issues);
    if (completion.completionBasisDigest !== event.completionBasisDigest) result.issues.push('阶段完成证据或委托任务事实已变化。');
    result.artifactSnapshots = completion.artifactSnapshots; result.verificationBasisDigest = completion.verificationBasisDigest;
    result.taskBindings = completion.taskBindings; result.completionBasisDigest = completion.completionBasisDigest;
    result.technicalReady = !result.issues.length; result.effectiveStatus = result.technicalReady ? 'verified' : 'stale';
  } else result.effectiveStatus = result.issues.length ? 'stale' : 'active';
  return result;
}
