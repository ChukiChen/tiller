import { validateRelativePath } from './files.js';
import { verificationCategories } from './verification-cases.js';
import type { VerificationCategory, VerificationConfig, VerificationReference } from './verification-cases.js';

export type VerificationInput = VerificationReference & { binary?: true; provenance?: VerificationReference };
export interface VerificationCheck {
  id: string;
  kind: 'case' | 'manual' | 'execution';
  caseId?: string;
  suite?: string;
  artifactIds: string[];
  inputs: VerificationInput[];
  requirements: string[];
  categories: VerificationCategory[];
  reason: string;
}
export interface VerificationSelection {
  caseIds: string[];
  requirements: string[];
  modules: string[];
  categories: VerificationConfig['categories'];
  reason: string;
  scenarioReason: string;
  checks: VerificationCheck[];
}
export interface VerificationEvidenceReference { workId: string; runId: string; caseId?: string; checkId?: string; environment?: string }
export type VerificationArtifactSnapshots = Record<string, Record<string, string>>;

function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象。`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key))) throw new Error(`${label} 包含未知字段。`);
  return result;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000 || value.includes('\0')) throw new Error(`${label} 必须是有界非空文本。`);
  return value;
}
function identifiers(value: unknown, label: string, empty = true): string[] {
  if (!Array.isArray(value) || value.length > 10000 || (!empty && !value.length)) throw new Error(`${label} 必须是${empty ? '' : '非空'}有限数组。`);
  const result = value.map(item => {
    const id = text(item, label);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error(`${label} 标识无效。`);
    return id;
  });
  if (new Set(result.map(item => item.toLowerCase())).size !== result.length) throw new Error(`${label} 包含重复标识。`);
  return result;
}
export function assertVerificationInput(ref: VerificationReference): void {
  validateRelativePath(ref.path);
  if (ref.repository !== '.') { validateRelativePath(ref.repository); if (ref.repository.includes('/')) throw new Error('验证仓库须使用稳定标识。'); }
  const path = ref.path.toLowerCase();
  if (path.split('/').some(part => ['.git', 'node_modules'].includes(part))
    || /(?:^|\/)\.tiller\/local(?:\/|$)/u.test(path)
    || /(?:^|\/)\.tiller\/work\/[^/]+\/(?:(?:work\.md|plan\.md|record\.json|tasks\.json|confirmations\.json|delivery\.json)$|(?:verification-runs|delivery-checks|reviews|planning)(?:\/|$))/u.test(path)
    || /(?:^|\/)\.tiller\/project\.json$/u.test(path)) throw new Error('验证输入不能引用可变控制资料、结果自身或本机内部数据。');
}
export function parseVerificationSelection(value: unknown): VerificationSelection {
  const data = object(value, ['caseIds', 'requirements', 'modules', 'categories', 'reason', 'scenarioReason', 'checks'], '验证选择');
  const caseIds = identifiers(data.caseIds, '用例');
  const requirements = identifiers(data.requirements, '需求');
  const modules = identifiers(data.modules, '模块');
  const categoryData = object(data.categories, [...verificationCategories], '类别适用性');
  const categories = Object.fromEntries(verificationCategories.map(category => {
    const entry = object(categoryData[category], ['applicability', 'reason'], category);
    if (!['applicable', 'not-applicable', 'pending'].includes(String(entry.applicability))) throw new Error(`类别适用性无效：${category}`);
    return [category, { applicability: entry.applicability, reason: text(entry.reason, '类别理由') }];
  })) as VerificationConfig['categories'];
  if (!Array.isArray(data.checks) || data.checks.length > 10000) throw new Error('必要检查须为有限数组。');
  const checks = data.checks.map(raw => {
    const check = object(raw, ['id', 'kind', 'caseId', 'suite', 'artifactIds', 'inputs', 'requirements', 'categories', 'reason'], '必要检查');
    const id = identifiers([check.id], '检查')[0]!;
    if (!['case', 'manual', 'execution'].includes(String(check.kind))) throw new Error('检查类型无效。');
    const kind = check.kind as VerificationCheck['kind'];
    if ((kind === 'case') !== (check.caseId !== undefined) || (kind === 'execution') !== (check.suite !== undefined)) throw new Error('检查类型与用例/套件引用不匹配。');
    const caseId = check.caseId === undefined ? undefined : identifiers([check.caseId], '检查用例')[0]!;
    const suite = check.suite === undefined ? undefined : identifiers([check.suite], '检查套件')[0]!;
    if (caseId !== undefined && !caseIds.includes(caseId)) throw new Error('检查用例须包含在选择范围。');
    const artifactIds = identifiers(check.artifactIds, '受检产物', false);
    if (!Array.isArray(check.inputs) || !check.inputs.length || check.inputs.length > 10000) throw new Error('必要检查必须明确非空受检输入。');
    const inputs = check.inputs.map(rawRef => {
      const ref = object(rawRef, ['repository', 'path', 'binary', 'provenance'], '受检输入');
      const result = { repository: text(ref.repository, '输入仓库'), path: text(ref.path, '输入路径') };
      assertVerificationInput(result);
      if (ref.binary === undefined && ref.provenance === undefined) return result;
      if (ref.binary !== true || ref.provenance === undefined) throw new Error('二进制输入须明确 binary:true 和共享核对来源 provenance。');
      const rawProvenance = object(ref.provenance, ['repository', 'path'], '二进制来源');
      const provenance = { repository: text(rawProvenance.repository, '来源仓库'), path: text(rawProvenance.path, '来源路径') };
      assertVerificationInput(provenance);
      if (`${result.repository}::${result.path}`.toLowerCase() === `${provenance.repository}::${provenance.path}`.toLowerCase()) throw new Error('二进制输入不能以自身作为核对来源。');
      return { ...result, binary: true as const, provenance };
    });
    if (new Set(inputs.map(ref => `${ref.repository}::${ref.path}`.toLowerCase())).size !== inputs.length) throw new Error('受检输入重复。');
    const checkRequirements = identifiers(check.requirements, '检查需求');
    if (checkRequirements.some(id => !requirements.includes(id))) throw new Error('检查需求超出选择范围。');
    const checkCategories = identifiers(check.categories, '检查类别', false) as VerificationCategory[];
    if (checkCategories.some(category => !verificationCategories.includes(category))) throw new Error('检查类别无效。');
    return { id, kind, ...(caseId === undefined ? {} : { caseId }), ...(suite === undefined ? {} : { suite }), artifactIds, inputs,
      requirements: checkRequirements, categories: checkCategories, reason: text(check.reason, '检查理由') };
  });
  if (new Set(checks.map(check => check.id.toLowerCase())).size !== checks.length) throw new Error('必要检查标识重复。');
  if (!caseIds.length && !checks.length) throw new Error('验证选择不能为空；纯文档任务也须声明必要检查。');
  return { caseIds, requirements, modules, categories, checks, reason: text(data.reason, '选择理由'), scenarioReason: text(data.scenarioReason, '跨模块及系统场景选择依据') };
}
