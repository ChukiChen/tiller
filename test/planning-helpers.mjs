import { initialize } from '../dist/core.js';
import { createWork, addWork } from '../dist/work.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { readRegisteredPlanning, planningConfirmationSubjects } from '../dist/planning.js';
import { fixture, put, gitRepository } from './helpers.mjs';

const categories = ['unit', 'interface', 'integration', 'scenario', 'performance', 'security', 'reliability', 'compatibility', 'usability'];
export function documentSelection(source, artifactId = 'document', checkId = 'document-review') {
  return {
    caseIds: [], requirements: ['REQ-1'], modules: [],
    categories: Object.fromEntries(categories.map(category => [category, { applicability: category === 'usability' ? 'applicable' : 'not-applicable', reason: '本次为独立文档交付，检查正文及人工审阅。' }])),
    reason: '人工核对需求覆盖和文档正文。', scenarioReason: '纯文档工作不涉及业务模块集成或系统执行。',
    checks: [{ id: checkId, kind: 'manual', artifactIds: [artifactId], inputs: [source], requirements: ['REQ-1'], categories: ['usability'], reason: '检查具体文档内容和需求兑现。' }],
  };
}
export async function fixtureDecision(root, workId, requestId, decisionId, outcome = 'approved') {
  const reference = { repository: '.', path: `.tiller/work/${workId}/source-${decisionId}.md` };
  put(root, reference.path, '# 隔离测试用户来源\n\n同意本次展示的具体范围和内容。\n');
  return recordDecision(root, workId, {
    decisionId, requestId, outcome, conditions: [],
    source: { kind: 'conversation', reference, quote: '同意本次展示的具体范围和内容。', presentation: { repository: '.', path: `.tiller/work/${workId}/reviews/request-${requestId}/presentation.md` } },
    sourceReview: { reviewer: '隔离测试执行者', rationale: '测试夹具明确对应当前请求；不声称真实用户批准。', reviewedAt: '2026-10-19T00:00:00.000Z' },
  });
}
export async function setupPlanning(t, { workId = 'planning-work', mode = 'project', repository = '.' } = {}) {
  const root = fixture(t);
  if (mode === 'workspace' && repository === '.') repository = 'business';
  if (mode === 'workspace') gitRepository(root, repository);
  await initialize({ root, mode, ...(mode === 'workspace' ? { repositories: [repository] } : {}) });
  const scope = { repositories: repository === '.' ? ['.'] : ['.', repository], targets: [workId] };
  await createWork(root, workId, '任务规划测试', { type: 'change-requirements', scope });
  const directory = `.tiller/work/${workId}`;
  const requirements = { repository: '.', path: `${directory}/requirements.md` };
  const design = { repository: '.', path: `${directory}/design.md` };
  const standard = { repository: '.', path: `${directory}/standard.md` };
  const output = { repository, path: 'docs/result.md' };
  put(root, requirements.path, '# 文档交付需求\n\nREQ-1：读者能根据说明完成一次操作。\n');
  put(root, standard.path, '# 开发规范\n\n文档使用 Markdown，所有检查保留实际证据。\n');
  const baseRequest = { scope, subjects: [requirements], upstream: [], reviewSummary: '核对本次文档目标。', openIssues: [], nextAction: '继续已展示的下一阶段' };
  await requestConfirmation(root, workId, { ...baseRequest, requestId: 'requirements', gate: 'requirements' });
  await fixtureDecision(root, workId, 'requirements', 'approve-requirements');
  await addWork(root, workId, { type: 'change-design', requirementsBasis: { workId, requestId: 'requirements' } });
  put(root, design.path, '# 文档交付设计\n\n通过单份共享说明和明确人工检查兑现需求。\n');
  await requestConfirmation(root, workId, { ...baseRequest, requestId: 'design', gate: 'design', subjects: [design, standard], upstream: ['requirements'] });
  await fixtureDecision(root, workId, 'design', 'approve-design');
  const basis = { requirements: { workId, requestId: 'requirements', decisionId: 'approve-requirements' }, design: { workId, requestId: 'design', decisionId: 'approve-design' } };
  const plan = {
    schemaVersion: 1, ownerWorkId: workId, revision: 'v-one', scope,
    requirements: [{ id: 'REQ-1', source: requirements }], basis,
    tasks: [{ id: 'write-document', title: '写操作说明', outcome: '交付有正文且经过审阅的说明。', scope, modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis,
      specifications: { requirements: [requirements], design: [design], standards: [standard] }, pendingDetails: [], dependencies: [],
      artifacts: [{ id: 'document', type: 'document', purpose: '让读者完成操作。', required: true, checks: ['document-review'], source: output }],
      verification: documentSelection(output), humanCheckpoints: [] }],
    delivery: { requiredTasks: ['write-document'], artifacts: [{ id: 'delivered-document', type: 'reference', purpose: '交付已验证的操作说明。', required: true, checks: ['delivery-review'], taskId: 'write-document', artifactId: 'document' }], verification: documentSelection(output, 'delivered-document', 'delivery-review'), humanCheckpoints: [], openIssues: [] },
    changeReason: '首次规划：说明文档需求覆盖、任务与检查条件。',
  };
  async function approvePlanning(revision = 'v-one', requestId = 'planning-one') {
    const registered = await readRegisteredPlanning(root, workId, revision);
    await requestConfirmation(root, workId, { ...baseRequest, requestId, gate: 'planning', subjects: planningConfirmationSubjects(workId, registered.record), upstream: ['design'], reviewSummary: '已展示不可变规划、待细化事项及逐任务修订差异。' });
    const decisionId = `approve-${requestId}`;
    await fixtureDecision(root, workId, requestId, decisionId);
    return { workId, requestId, decisionId };
  }
  return { root, workId, plan, registration: { operationId: 'register-one', expectedRevision: 0, plan }, approvePlanning };
}
