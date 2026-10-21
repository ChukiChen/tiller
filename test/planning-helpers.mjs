import { initialize } from '../dist/core.js';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, lstatSync, utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { resolveRepositoryRoot } from '../dist/delivery-location.js';
import { captureVerificationObservation, recordVerificationEvidence } from '../dist/verification-runs.js';
import { planWorkflowStageOperation, applyWorkflowStageOperation } from '../dist/workflow-stages.js';
import { createWorkflowFixtureAt, workflowStageRevision, startStage } from './workflow-fixtures.mjs';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { readRegisteredPlanning, planningConfirmationSubjects } from '../dist/planning.js';
import { fixture, put, gitRepository } from './helpers.mjs';

const categories = ['unit', 'interface', 'integration', 'scenario', 'performance', 'security', 'reliability', 'compatibility', 'usability'];
// Only identical, explicitly opted-in single-repository preparation is retained.
// These are original synthetic manual observations, not newly executed evidence.
const predecessorSeeds = new Map();
const seedBytesLimit = 8 * 1024 * 1024;
function predecessorManifest(root, workId) {
  const files = []; let bytes = 0;
  const visit = path => {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) throw new Error('Preparation seeds cannot contain links.');
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path))) visit(`${path}/${name}`);
    } else {
      bytes += stat.size;
      if (bytes > seedBytesLimit) throw new Error('Preparation seed exceeds its bounded byte budget.');
      const content = readFileSync(join(root, path));
      if (content.toString('utf8').includes(root) || content.toString('utf8').includes(root.replaceAll('\\', '/')))
        throw new Error('Preparation seed has an absolute activity-root binding.');
      files.push({ path, content, sha256: createHash('sha256').update(content).digest('hex'), atime: stat.atime, mtime: stat.mtime });
    }
  };
  for (const path of [`.tiller/work/${workId}`, '.tiller/verification/config.json', 'instruction.md']) visit(path);
  return files;
}
function rebindDevelopmentContext(context, root) {
  context.root = root;
  context.binding = async stageId => {
    const policy = await loadWorkflowPolicyContext(root, context.workId);
    return { workflowDigest: policy.snapshot.digest, intentDigest: policy.intentDigest, ...(stageId ? { stageId } : {}) };
  };
  return context;
}
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
export function developmentStageSelection(context, stageId) {
  const stage = context.snapshot.definition.stages.find(item => item.id === stageId);
  const ids = context.snapshot.definition.completion.requiredStages.includes(stageId)
    ? context.snapshot.definition.completion.requiredOutputs : stage.produces;
  const selection = documentSelection(context.outputSources[ids[0]], ids[0], `workflow-${stageId}`);
  selection.checks[0].artifactIds = ids;
  selection.checks[0].inputs = ids.map(id => context.outputSources[id]);
  return selection;
}

export async function registerDevelopmentOutputs(context, stageId) {
  for (const outputId of context.snapshot.definition.stages.find(stage => stage.id === stageId).produces) {
    const record = JSON.parse(readFileSync(join(context.root, `.tiller/work/${context.workId}/record.json`), 'utf8'));
    if (record.artifacts[outputId]) continue;
    await addWorkflowOutput(context.root, context.workId, { operationId: `output-${outputId}`, expectedRevision: record.revision,
      outputId, source: context.outputSources[outputId], confirmationRefs: context.confirmationRefs });
  }
}

export async function observeDevelopmentSelection(context, stageId, selection) {
  const workflow = { stageId, actions: ['write-report'], confirmationRefs: [...context.confirmationRefs] };
  const captured = await captureVerificationObservation(context.root, context.workId, { selection, environment: 'synthetic development observer', workflow });
  const observations = [];
  for (const check of selection.checks) for (const source of check.inputs) {
    const repositoryRoot = await resolveRepositoryRoot(context.root, source.repository, context.workId);
    const text = readFileSync(join(repositoryRoot, source.path), 'utf8');
    assert.ok(text.trim(), `Expected actual contents at ${source.path}`);
    observations.push(`${check.id}: read ${source.repository}:${source.path} (${Buffer.byteLength(text)} bytes)`);
  }
  const evidence = { repository: '.', path: `.tiller/work/${context.workId}/evidence/stage-${stageId}-${++context.counter}.md` };
  put(context.root, evidence.path, '# Actual isolated fixture observations\n\n' + observations.join('\n') + '\n');
  const recorded = await recordVerificationEvidence(context.root, context.workId, { captureId: captured.record.id, environment: captured.record.environment,
    results: selection.checks.map(check => ({ checkId: check.id, status: 'passed', evidence, note: 'Read the current fixture subjects after capture.' })) });
  return selection.checks.map(check => ({ workId: context.workId, runId: recorded.record.id, checkId: check.id, environment: recorded.record.environment }));
}

export async function startDevelopmentStage(context, stageId, overrides = {}, kind = 'start') {
  const verification = overrides.verification ?? developmentStageSelection(context, stageId);
  const stage = context.snapshot.definition.stages.find(item => item.id === stageId);
  return startStage(context, stageId, { verification,
    checkMappings: stage.checks.map((text, index) => ({ index, text, checkIds: verification.checks.map(check => check.id) })), ...overrides }, kind);
}

export async function finishDevelopmentStage(context, stageId, started, evidenceRefs) {
  evidenceRefs ??= await observeDevelopmentSelection(context, stageId, started.input.verification);
  const input = { operationId: `verify-${stageId}-${++context.counter}`, expectedStageRevision: workflowStageRevision(context),
    attemptId: started.receipt.attemptId, evidenceRefs, confirmationRefs: [...context.confirmationRefs] };
  const plan = await planWorkflowStageOperation(context.root, context.workId, stageId, 'verify', input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  const receipt = await applyWorkflowStageOperation(context.root, context.workId, stageId, 'verify', input, plan.planId);
  const result = { start: started, receipt, verification: started.input.verification, evidenceRefs };
  context.completed.set(stageId, result);
  return result;
}

// The caller owns initialization; existing workspace repository mappings remain intact.
export async function seedApprovedDevelopment(root, workId, options = {}) {
  const seedable = options.reuseSeed === true
    && Object.keys(options).every(key => ['reuseSeed', 'scope'].includes(key))
    && JSON.parse(readFileSync(join(root, '.tiller/project.json'), 'utf8')).mode === 'project'
    && !existsSync(join(root, '.git')) && !existsSync(join(root, '.tiller/workflow-policy/index.json'))
    && !existsSync(join(root, `.tiller/work/${workId}`))
    && (!options.scope || JSON.stringify(options.scope) === JSON.stringify({ repositories: ['.'], targets: [workId] }));
  const seed = seedable ? predecessorSeeds.get(workId) : undefined;
  if (seed) {
    for (const file of seed.files) {
      assert.equal(createHash('sha256').update(file.content).digest('hex'), file.sha256);
      const path = put(root, file.path, file.content);
      utimesSync(path, file.atime, file.mtime);
    }
    return rebindDevelopmentContext(structuredClone(seed.context), root);
  }
  const context = await createWorkflowFixtureAt(root, workId, 'feature', {
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.workflowSnapshot ? { workflow: options.workflowSnapshot.id, expectedOutputs: options.workflowSnapshot.definition.completion.requiredOutputs } : {}),
  });
  if (options.workflowSnapshot) context.snapshot = options.workflowSnapshot;
  const directory = `.tiller/work/${workId}`;
  const ref = name => ({ repository: '.', path: `${directory}/${name}.md` });
  context.requirements = options.requirementsSource ?? ref('requirements');
  context.design = options.designSource ?? ref('design');
  context.standard = options.standardSource ?? ref('standard');
  context.outputSources = Object.fromEntries(context.snapshot.definition.outputs.map(output => [output.id, ref(output.id)]));
  context.outputSources['requirements-output'] = context.requirements;
  context.outputSources['design-output'] = context.design;
  rebindDevelopmentContext(context, root);
  for (const [source, text] of [
    [context.requirements, options.requirementsText ?? '# 文档交付需求\n\nREQ-1：读者能根据说明完成一次操作。\n'],
    [context.design, options.designText ?? '# 文档交付设计\n\n通过单份共享说明和明确人工检查兑现需求。\n'],
    [context.standard, options.standardText ?? '# 开发规范\n\n文档使用 Markdown，所有检查保留实际证据。\n'],
  ]) put(await resolveRepositoryRoot(root, source.repository, workId), source.path, text);
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [],
    requirements: [{ id: 'REQ-1', source: context.requirements }], categories: documentSelection(context.requirements).categories, suites: [] }));
  context.basis = {};
  for (const stageId of ['requirements', 'design']) {
    const started = await startDevelopmentStage(context, stageId);
    await registerDevelopmentOutputs(context, stageId);
    const evidenceRefs = await observeDevelopmentSelection(context, stageId, started.input.verification);
    const requestId = options[`${stageId}RequestId`] ?? stageId;
    const decisionId = options[`${stageId}DecisionId`] ?? `approve-${stageId}`;
    await requestConfirmation(root, workId, { requestId, gate: stageId, scope: context.scope,
      subjects: stageId === 'requirements' ? [context.requirements] : [context.design, context.standard],
      upstream: context.confirmationRefs.map(ref => ref.requestId), workflowBinding: await context.binding(stageId),
      reviewSummary: '核对当前实际文档及已展示的明确范围。', openIssues: [], nextAction: '继续已展示的下一阶段。' });
    await fixtureDecision(root, workId, requestId, decisionId);
    const reference = { workId, requestId, decisionId };
    context.confirmationRefs.push(reference); context.basis[stageId] = reference;
    await finishDevelopmentStage(context, stageId, started, evidenceRefs);
  }
  if (seedable && predecessorSeeds.size < 4) {
    try {
      const files = predecessorManifest(root, workId);
      const { binding: _binding, root: _root, ...state } = context;
      predecessorSeeds.set(workId, { files, context: structuredClone(state) });
    } catch (error) {
      // An ineligible or oversized preparation remains an ordinary real fixture.
      if (!/Preparation seed/u.test(error.message)) throw error;
    }
  }
  return context;
}

export async function setupPlanning(t, { root: existingRoot, workId = 'planning-work', mode = 'project', repository = '.', scope: requestedScope, ...options } = {}) {
  const root = existingRoot ?? fixture(t);
  if (mode === 'workspace' && repository === '.') repository = 'business';
  if (!existingRoot) {
    if (mode === 'workspace') gitRepository(root, repository);
    await initialize({ root, mode, ...(mode === 'workspace' ? { repositories: [repository] } : {}) });
  }
  const scope = requestedScope ?? { repositories: repository === '.' ? ['.'] : ['.', repository], targets: [workId] };
  const { taskIds: _taskIds, runtime: _runtime, ...preparationOptions } = options;
  const context = await seedApprovedDevelopment(root, workId, { ...preparationOptions, scope,
    reuseSeed: !existingRoot && mode === 'project' && options.reuseSeed !== false });
  const { requirements, design, standard, basis } = context;
  const output = { repository, path: 'docs/result.md' };
  const baseRequest = { scope, subjects: [requirements], upstream: [], reviewSummary: '核对本次文档目标。', openIssues: [], nextAction: '继续已展示的下一阶段' };
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
    const output = context.outputSources['planning-output'];
    put(root, output.path, `# 已展示规划\n\n${revision}\n${registered.record.sha256 ?? ''}\n`);
    await registerDevelopmentOutputs(context, 'planning');
    await requestConfirmation(root, workId, { ...baseRequest, requestId, gate: 'planning', subjects: [output, ...planningConfirmationSubjects(workId, registered.record)], upstream: [basis.design.requestId], workflowBinding: await context.binding('planning'), reviewSummary: '已展示不可变规划、待细化事项及逐任务修订差异。' });
    const decisionId = `approve-${requestId}`;
    await fixtureDecision(root, workId, requestId, decisionId);
    return { workId, requestId, decisionId };
  }
  return Object.assign(context, { plan, registration: { operationId: 'register-one', expectedRevision: 0, plan }, approvePlanning });
}
