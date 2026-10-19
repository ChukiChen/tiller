import { readConfirmation } from './confirmations.js';
import type { ConfirmationOperation, ConfirmationReference, Scope } from './confirmations.js';
import { gateIssue } from './gate-conditions.js';
import type { GateIssue } from './gate-conditions.js';

export interface GateExceptionBinding {
  reference: ConfirmationReference; requestFingerprint: string; decisionFingerprint: string;
  conditionIds: string[]; reason: string; allowedAction: string; endCondition: string; basisDigest: string;
}
export interface ExceptionInspection {
  operationAllowed: boolean; exceptions: GateExceptionBinding[]; blockingReasons: GateIssue[];
}

/** Consumes only explicitly bounded, currently confirmed exceptions; never changes technical facts. */
export async function inspectExceptions(root: string, workId: string, scope: Scope,
  operation: ConfirmationOperation, taskId: string | undefined, issues: GateIssue[],
  basisDigest: string, refs: ConfirmationReference[]): Promise<ExceptionInspection> {
  const exceptions: GateExceptionBinding[] = []; const invalid: GateIssue[] = [];
  const covered = new Set<string>(); const seen = new Set<string>();
  for (const reference of refs) {
    try {
      const identity = `${reference.workId}::${reference.requestId}`.toLowerCase();
      if (reference.workId !== workId || seen.has(identity)) throw new Error('例外须属于当前工作且不能重复引用。');
      seen.add(identity);
      const checked = await readConfirmation(root, reference); const binding = checked.request.exceptionBinding;
      if (checked.request.gate !== 'exception' || !binding || binding.ownerWorkId !== workId
        || binding.taskId !== taskId || binding.operation !== operation || binding.basisDigest !== basisDigest) throw new Error('例外身份、操作或当前对象摘要不匹配。');
      if (!scope.repositories.every(repo => checked.request.scope.repositories.includes(repo))
        || !scope.targets.every(target => checked.request.scope.targets.includes(target))) throw new Error('例外确认未覆盖当前范围。');
      if (!checked.check.confirmed) throw new Error('例外尚未得到当前有效批准，或来源、对象、决定已失效。');
      if (binding.allowedAction !== operation || binding.endCondition !== 'basis-change-or-revocation') throw new Error('自动消费仅支持 allowedAction 等于操作名称、endCondition 为 basis-change-or-revocation；其他文本须先澄清。');
      if (!binding.conditionIds.length || binding.conditionIds.some(id => {
        const issue = issues.find(issue => issue.conditionId === id);
        return !issue || !issue.exceptionAllowed || covered.has(id);
      })) throw new Error('例外包含未知、重复或不可豁免的条件。');
      for (const id of binding.conditionIds) covered.add(id);
      exceptions.push({ reference, requestFingerprint: checked.requestFingerprint, decisionFingerprint: checked.decisionFingerprint,
        conditionIds: [...binding.conditionIds], reason: binding.reason, allowedAction: binding.allowedAction,
        endCondition: binding.endCondition, basisDigest: binding.basisDigest });
    } catch (error) {
      invalid.push(gateIssue('INVALID_EXCEPTION', (error as Error).message, taskId === undefined ? {} : { taskId }, '重新展示具体条件、当前对象及支持的失效约束，登记真实用户决定。'));
    }
  }
  const blockingReasons = [...issues.filter(issue => !covered.has(issue.conditionId)), ...invalid];
  return { operationAllowed: blockingReasons.length === 0, exceptions, blockingReasons };
}
