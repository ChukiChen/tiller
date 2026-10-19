import { createHash } from 'node:crypto';
import { readConfirmation } from './confirmations.js';
import type { ConfirmationReference, Scope } from './confirmations.js';
import type { HumanCheckpoint } from './planning-types.js';
import { readVerificationReference } from './verification-cases.js';

export interface GateIssue {
  code: string; conditionId: string; message: string; nextAction: string; exceptionAllowed: boolean;
  taskId?: string; artifactId?: string; caseId?: string;
}
export interface GateConfirmationBinding {
  reference: ConfirmationReference; requestFingerprint: string; decisionFingerprint: string;
}
export function checkpointDefinitionDigest(checkpoint: HumanCheckpoint): string {
  const subjects = checkpoint.subjects.map(subject => ({ repository: subject.repository, path: subject.path }))
    .sort((a, b) => {
      const left = `${a.repository}\0${a.path}`; const right = `${b.repository}\0${b.path}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return createHash('sha256').update(JSON.stringify({ id: checkpoint.id, operation: checkpoint.operation, purpose: checkpoint.purpose, subjects })).digest('hex');
}
export function gateIssue(code: string, message: string,
  identity: { taskId?: string; artifactId?: string; caseId?: string; exceptionAllowed?: boolean } = {},
  nextAction = '补足该条件后重新预览，核对当前对象与证据。'): GateIssue {
  const { exceptionAllowed = false, ...subject } = identity;
  const suffix = createHash('sha256').update(JSON.stringify({ code, ...subject, message })).digest('hex').slice(0, 24);
  return { code, conditionId: `condition-${suffix}`, message, nextAction, exceptionAllowed, ...subject };
}
export async function inspectCheckpoints(root: string, workId: string, scope: Scope,
  operation: 'start' | 'verify' | 'delivery-ready', taskId: string | undefined,
  checkpoints: HumanCheckpoint[], refs: ConfirmationReference[]) {
  const issues: GateIssue[] = []; const bindings: GateConfirmationBinding[] = [];
  const identity = taskId === undefined ? {} : { taskId };
  const expected = checkpoints.filter(checkpoint => checkpoint.operation === operation);
  const found = new Set<string>();
  for (const reference of refs) {
    try {
      if (reference.workId !== workId) throw new Error('检查点必须使用唯一归属工作的确认。');
      const checked = await readConfirmation(root, reference);
      const binding = checked.request.checkpointBinding;
      const checkpoint = expected.find(item => item.id === binding?.checkpointId);
      if (checked.request.gate !== 'checkpoint' || !binding || !checkpoint || binding.ownerWorkId !== workId
        || binding.taskId !== taskId || binding.operation !== operation || found.has(checkpoint.id)) throw new Error('检查点身份、操作或重复引用与规划不符。');
      if (!scope.repositories.every(repo => checked.request.scope.repositories.includes(repo))
        || !scope.targets.every(target => checked.request.scope.targets.includes(target))) throw new Error('检查点确认没有覆盖当前范围。');
      if (!checked.check.confirmed) throw new Error(`检查点 ${checkpoint.id} 未获当前有效确认。`);
      if (binding.definitionDigest !== checkpointDefinitionDigest(checkpoint)) throw new Error('检查点定义已变化，须重新确认当前检查条件。');
      for (const subject of checkpoint.subjects) {
        const bound = checked.request.files.find(file => file.repository === subject.repository && file.path === subject.path);
        const current = await readVerificationReference(root, subject);
        if (!bound || createHash('sha256').update(current).digest('hex') !== bound.sha256) throw new Error('检查点未绑定当前实际对象。');
      }
      found.add(checkpoint.id);
      bindings.push({ reference, requestFingerprint: checked.requestFingerprint, decisionFingerprint: checked.decisionFingerprint });
    } catch (error) {
      issues.push(gateIssue('INVALID_CHECKPOINT', (error as Error).message, identity, '核对检查点身份、范围、当前内容及真实确认来源。'));
    }
  }
  for (const checkpoint of expected) if (!found.has(checkpoint.id)) {
    issues.push(gateIssue('CHECKPOINT_REQUIRED', `人工检查点尚未满足：${checkpoint.id}（${checkpoint.purpose}）。`,
      { ...identity, exceptionAllowed: true }, '展示该检查点的具体对象并登记真实用户决定。'));
  }
  return { issues, bindings };
}
