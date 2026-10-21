import { createHash } from 'node:crypto';

export interface GateIssue {
  code: string; conditionId: string; message: string; nextAction: string; exceptionAllowed: boolean;
  taskId?: string; artifactId?: string; caseId?: string;
}
export function gateIssue(code: string, message: string,
  identity: { taskId?: string; artifactId?: string; caseId?: string; exceptionAllowed?: boolean } = {},
  nextAction = '补足该条件后重新预览，核对当前对象与证据。'): GateIssue {
  const { exceptionAllowed = false, ...subject } = identity;
  const suffix = createHash('sha256').update(JSON.stringify({ code, ...subject, message })).digest('hex').slice(0, 24);
  return { code, conditionId: `condition-${suffix}`, message, nextAction, exceptionAllowed, ...subject };
}
