import { createHash } from 'node:crypto';
import { withWorkflowStageInputs, inspectWorkflowStagesInInput } from './workflow-stages.js';
import type { WorkflowStageInputs } from './workflow-stages.js';
import { readWorkflowReference } from './workflow-work.js';
import { evaluateWorkflowCondition } from './workflow-catalog.js';
import { evaluateVerificationSelection } from './verification-runs.js';
import { parseVerificationSelection } from './verification-selection.js';
import { planningDigest } from './planning.js';
import { gateIssue } from './gate-conditions.js';
import type { GateIssue } from './gate-conditions.js';
import type { VerificationSelection, VerificationEvidenceReference, VerificationArtifactSnapshots } from './verification-selection.js';

export interface WorkflowCompletionCheckMapping { index: number; text: string; checkIds: string[] }
export interface WorkflowDeliveryInput {
  verification?: VerificationSelection;
  checkMappings: WorkflowCompletionCheckMapping[];
  evidenceRefs: VerificationEvidenceReference[];
}
export function parseWorkflowCompletionMappings(value: unknown): WorkflowCompletionCheckMapping[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error('整体完成检查映射须为有界列表。');
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('完成检查映射格式无效。');
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(key => !['index', 'text', 'checkIds'].includes(key)) || !Number.isSafeInteger(item.index)
      || Number(item.index) < 0 || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 2048
      || !Array.isArray(item.checkIds) || !item.checkIds.length || item.checkIds.length > 10000
      || item.checkIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(id))
      || new Set(item.checkIds).size !== item.checkIds.length) throw new Error('完成检查映射的索引、原文或实际检查无效。');
    return { index: Number(item.index), text: item.text, checkIds: item.checkIds as string[] };
  });
}
/** Only current technical facts; acceptance of this delivery is deliberately outside the kernel. */
export async function inspectWorkflowDelivery(root: string, workId: string, input: WorkflowDeliveryInput) {
  return withWorkflowStageInputs(root, workId, loaded => inspectWorkflowDeliveryInInput(root, workId, input, loaded));
}
export async function inspectWorkflowDeliveryInInput(root: string, workId: string, input: WorkflowDeliveryInput, loaded: WorkflowStageInputs) {
    const inspected = await inspectWorkflowStagesInInput(loaded);
    const { record, snapshot, intentDigest, sourceIssues } = inspected.context;
    const definition = snapshot.definition;
    const issues: GateIssue[] = sourceIssues.map(message => gateIssue('WORKFLOW_SOURCE_INVALID', message));
    const warnings: string[] = [];
    const stages = new Map(definition.stages.map(stage => [stage.id, stage]));
    const status = new Map(inspected.stages.map(stage => [stage.stageId, stage]));
    const requiredOutputs = new Set([...definition.completion.requiredOutputs, ...record.expectedOutputs]);
    const requiredStages = new Set<string>();
    const visit = (id: string) => {
      if (requiredStages.has(id)) return;
      requiredStages.add(id);
      const stage = stages.get(id);
      if (!stage) { issues.push(gateIssue('WORKFLOW_STAGE_MISSING', `完成阶段未声明：${id}`)); return; }
      for (const dependency of stage.dependsOn) visit(dependency);
    };
    for (const stageId of definition.completion.requiredStages) visit(stageId);
    for (const id of requiredOutputs) {
      const output = definition.outputs.find(item => item.id === id);
      if (!output) issues.push(gateIssue('WORKFLOW_OUTPUT_UNKNOWN', `完成产物未声明：${id}`));
      else visit(output.producer);
    }
    for (const id of requiredStages) {
      const current = status.get(id);
      if (!current) { issues.push(gateIssue('WORKFLOW_STAGE_MISSING', `完成阶段当前事实缺失：${id}`)); continue; }
      if (current.applicability === 'unresolved') issues.push(gateIssue('WORKFLOW_CONDITION_UNKNOWN', `必要阶段条件未知：${id}`));
      else if (current.applicability === 'applicable' && current.effectiveStatus !== 'verified')
        issues.push(gateIssue('WORKFLOW_STAGE_NOT_VERIFIED', `必要阶段 ${id} 当前未有效验证：${current.effectiveStatus}`));
      for (const issue of current.issues) issues.push(gateIssue('WORKFLOW_STAGE_INVALID', `${id}：${typeof issue === 'string' ? issue : JSON.stringify(issue)}`));
    }
    const artifacts: VerificationArtifactSnapshots = {};
    const reads = new Map<string, Promise<string | null>>();
    for (const id of requiredOutputs) {
      const declared = definition.outputs.find(output => output.id === id);
      if (!declared) continue;
      const producer = stages.get(declared.producer)!;
      const applicability = evaluateWorkflowCondition(producer.when, record.impact);
      if (applicability === 'not-applicable') continue;
      if (applicability === 'unresolved') { issues.push(gateIssue('WORKFLOW_OUTPUT_UNRESOLVED', `产物条件未知：${id}`, { artifactId: id })); continue; }
      const output = record.artifacts[id];
      if (!output) { issues.push(gateIssue('WORKFLOW_OUTPUT_MISSING', `必要产物未登记：${id}`, { artifactId: id })); continue; }
      try {
        const key = `${output.source.repository}::${output.source.path}`;
        const current = status.get(declared.producer)?.artifactSnapshots[id];
        if (current?.[key] && Object.keys(current).length === 1) { artifacts[id] = { ...current }; continue; }
        let pending = reads.get(key);
        if (!pending) { pending = readWorkflowReference(root, output.source, record.scope); reads.set(key, pending); }
        const content = await pending;
        if (content === null || !content.trim()) throw new Error('产物缺失或为空。');
        artifacts[id] = { [key]: createHash('sha256').update(content).digest('hex') };
      } catch (error) { issues.push(gateIssue('WORKFLOW_OUTPUT_INVALID', `${id}：${(error as Error).message}`, { artifactId: id })); }
    }
    const mappings = parseWorkflowCompletionMappings(input.checkMappings);
    let verificationBasisDigest: string | null = null;
    let evidenceRefs = input.evidenceRefs;
    if (!input.verification) issues.push(gateIssue('WORKFLOW_COMPLETION_VERIFICATION_REQUIRED', '整体完成条件尚未映射到真实验证选择。'));
    else {
      const selection = parseVerificationSelection(input.verification);
      const checks = new Set(selection.checks.map(check => check.id));
      if (mappings.length !== definition.completion.checks.length || new Set(mappings.map(mapping => mapping.index)).size !== mappings.length
        || mappings.some(mapping => definition.completion.checks[mapping.index] !== mapping.text || mapping.checkIds.some(id => !checks.has(id))))
        issues.push(gateIssue('WORKFLOW_COMPLETION_MAPPING_INVALID', '整体完成检查须逐项保留固定下标及原文，并绑定真实检查。'));
      try {
        const result = await evaluateVerificationSelection(root, workId, selection, input.evidenceRefs, artifacts,
          { history: 'selected', ...loaded.evaluated.taskOptions });
        verificationBasisDigest = result.basisDigest; evidenceRefs = result.evidenceRefs;
        issues.push(...result.issues.map(message => gateIssue('WORKFLOW_COMPLETION_VERIFICATION_REQUIRED', message)));
        warnings.push(...result.warnings);
      } catch (error) { issues.push(gateIssue('WORKFLOW_COMPLETION_VERIFICATION_INVALID', (error as Error).message)); }
    }
    const necessary = [...requiredStages].map(id => status.get(id)).filter(stage => stage !== undefined);
    const processEvidence = {
      status: necessary.length && necessary.every(stage => stage.applicability === 'not-applicable' || stage.effectiveStatus === 'verified') ? 'complete' as const : 'gap' as const,
      limitation: '仅核对受控阶段和任务事实，不认证未登记的宿主行为。',
    };
    const basisDigest = planningDigest({
      workId, workflow: record.workflow, intentDigest, applicability: necessary.map(stage => [stage.stageId, stage.applicability]),
      stages: necessary.map(stage => ({
        stageId: stage.stageId, effectiveStatus: stage.effectiveStatus, attemptId: stage.attemptId,
        eventSequence: stage.eventSequence, startBasisDigest: stage.startBasisDigest, completionBasisDigest: stage.completionBasisDigest,
        artifactSnapshots: stage.artifactSnapshots, verificationBasisDigest: stage.verificationBasisDigest, taskBindings: stage.taskBindings,
      })),
      artifacts, verificationBasisDigest, completion: definition.completion, checkMappings: mappings, issues, processEvidence,
    });
    return { ...inspected, issues, warnings, artifacts, requiredStages: [...requiredStages], requiredOutputs: [...requiredOutputs],
      basisDigest, verificationBasisDigest, evidenceRefs, processEvidence, technicalReady: issues.length === 0 };
}
