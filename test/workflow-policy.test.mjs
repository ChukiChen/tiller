import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWorkflowWork, addWorkflowOutput, resumeWorkflowWork, parseWorkflowWorkRecord, validateWorkflowReference } from '../dist/workflow-work.js';
import { WORKFLOW_FACTS, createWorkflowSnapshot, loadBuiltinWorkflows } from '../dist/workflow-catalog.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { assertVerificationInput } from '../dist/verification-selection.js';
import {
  workflowIntentDigest, loadWorkflowPolicyContext, resolveWorkflowPolicy, inspectWorkflowPolicy,
  compareWorkflowPolicies, planWorkflowRegistration, applyWorkflowRegistration, loadActiveProjectWorkflow,
  assertWorkflowActivationCurrent,
  loadWorkflowPolicyInput, evaluateWorkflowPolicyInput, assertWorkflowPolicyInputCurrent,
} from '../dist/workflow-policy.js';
import { fixture, put, snapshot } from './helpers.mjs';
import { inspectWorkflowStages } from '../dist/workflow-stages.js';
import { withConfirmationVisit } from '../dist/confirmation-context.js';
import { startStage, workflowCategories } from './workflow-fixtures.mjs';

const ref = path => ({ repository: '.', path });
const allFalse = Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false]));
const scope = { repositories: ['.'], targets: ['shared'] };
const readRecord = (root, id) => JSON.parse(readFileSync(join(root, `.tiller/work/${id}/record.json`), 'utf8'));
const intent = (workflow = 'analysis', extra = {}) => ({
  operationId: 'create-one', expectedRevision: 0, workflow, goal: '核对明确范围与证据。', reason: '按实际交付选择流程。',
  scope, impact: allFalse, basis: [{ reference: ref('basis.md'), purpose: '已知问题。' }],
  actionSources: [{ actions: ['read', 'write-report', 'edit-documents'], reference: ref('request.md'), quote: 'Read, report and edit configuration in scope.', scope }],
  expectedOutputs: ['report-output'], completionCriteria: ['提供可核对的证据。'], ...extra,
});
async function setup(t) {
  const root = fixture(t); await initialize({ root });
  put(root, 'basis.md', '# 依据\n明确的问题与范围。\n');
  put(root, 'request.md', 'Read, report and edit configuration in scope.\n');
  await createWorkflowWork(root, 'owner', '配置审阅', intent());
  return root;
}
async function definition(id = 'analysis') { return structuredClone((await loadBuiltinWorkflows()).find(item => item.id === id).definition); }
async function candidate(root, change = () => {}, version = '1.0.0') {
  const value = await definition(); value.id = 'project.audit'; value.version = version; change(value);
  put(root, `.tiller/workflows/${value.id}@${version}.json`, JSON.stringify(value));
  return value;
}
const registration = (extra = {}) => ({
  operationId: 'register-one', expectedRevision: 0, ownerWorkId: 'owner',
  candidate: { id: 'project.audit', version: '1.0.0' }, baseline: { id: 'analysis', version: '1.0.0' }, confirmationRefs: [], ...extra,
});
async function approve(root, workId, requestId, gate, extra = {}) {
  const context = await loadWorkflowPolicyContext(root, workId);
  const request = await requestConfirmation(root, workId, {
    requestId, gate, scope, subjects: [ref('basis.md')], upstream: [], reviewSummary: '核对具体对象。',
    openIssues: [], nextAction: '仅推进已展示范围。', workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest }, ...extra,
  });
  put(root, `${requestId}-decision.md`, 'Approve this exact presented change.\n');
  await recordDecision(root, workId, {
    decisionId: `${requestId}-yes`, requestId, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: ref(`${requestId}-decision.md`), quote: 'Approve this exact presented change.', presentation: ref(request.presentation) },
    sourceReview: { reviewer: 'fixture', rationale: 'Synthetic user decision matches this fixture presentation.', reviewedAt: new Date().toISOString() },
  });
  return { workId, requestId, decisionId: `${requestId}-yes` };
}

test('declared policy approvals support pure repeated decisions and an independent late-change proof', async t => {
  const root = await setup(t);
  const reference = await approve(root, 'owner', 'batch-review', 'scope', {
    scopeBinding: {kind: 'workflow-extension', ownerWorkId: 'owner', changeDigest: 'a'.repeat(64)},
  });
  const context = await loadWorkflowPolicyContext(root, 'owner');
  const observed = await loadWorkflowPolicyInput(context, [reference]);
  assert.equal(observed.confirmations.reads.length, 1);
  const input = {stageId: 'scope', phase: 'start', actions: ['read'], confirmationRefs: [reference]};
  const nativeRead = fsPromises.readFile;
  fsPromises.readFile = async () => { throw new Error('Pure policy evaluation attempted filesystem I/O'); };
  syncBuiltinESMExports();
  try {
    const first = evaluateWorkflowPolicyInput(context, input, observed);
    for (let index = 0; index < 20; index++) assert.deepEqual(evaluateWorkflowPolicyInput(context, input, observed), first);
    assert.throws(() => evaluateWorkflowPolicyInput(context, {...input, confirmationRefs: [{...reference, requestId: 'undeclared'}]}, observed), /未在策略输入中声明/);
  } finally { fsPromises.readFile = nativeRead; syncBuiltinESMExports(); }
  await assertWorkflowPolicyInputCurrent(context, observed);
  put(root, 'batch-review-decision.md', 'The approval source changed after materialization.\n');
  await assert.rejects(assertWorkflowPolicyInputCurrent(context, observed));
});

test('workflow policy intent: output registration preserves intent while scope, impact and source changes invalidate it', async t => {
  const root = await setup(t);
  const before = await loadWorkflowPolicyContext(root, 'owner');
  await addWorkflowOutput(root, 'owner', { operationId: 'report-one', expectedRevision: 1, outputId: 'report-output', content: '# 调查结论\n已核对证据及边界。\n' });
  const after = await loadWorkflowPolicyContext(root, 'owner');
  assert.equal(before.intentDigest, after.intentDigest);
  assert.deepEqual(after.sourceIssues, []);
  const changed = structuredClone(after.record); changed.impact.production = true;
  assert.notEqual(workflowIntentDigest(changed), after.intentDigest);
  put(root, 'request.md', 'Read, report and edit configuration in scope.\nChanged scope.\n');
  assert.ok((await loadWorkflowPolicyContext(root, 'owner')).sourceIssues.length);
  assert.equal((await inspectWorkflowPolicy(root, 'owner', { stageId: 'report', phase: 'start', actions: ['write-report'], confirmationRefs: [] })).allowed, false);
});

test('workflow policy resolver: prior confirmations follow stages and code protection survives custom graph omissions', async () => {
  const feature = createWorkflowSnapshot(await definition('feature'));
  const start = resolveWorkflowPolicy(feature, allFalse, { stageId: 'design', phase: 'start', actions: ['write-report'] });
  assert.deepEqual(start.requiredConfirmations, ['requirements']);
  const verify = resolveWorkflowPolicy(feature, allFalse, { stageId: 'design', phase: 'verify', actions: ['write-report'] });
  assert.ok(verify.requiredConfirmations.includes('design'));
  const value = await definition(); value.id = 'project.weakened'; value.stages[0].actions.push('edit-code');
  const modified = resolveWorkflowPolicy(createWorkflowSnapshot(value), allFalse, { stageId: 'scope', phase: 'start', actions: ['edit-code'] });
  assert.deepEqual(modified.requiredConfirmations.sort(), ['design', 'planning', 'requirements']);
});

test('workflow policy resolver: unknown operation branches remain blocked and merge/release require dedicated approval', async () => {
  const operations = createWorkflowSnapshot(await definition('operations'));
  const unknown = resolveWorkflowPolicy(operations, { ...allFalse, release: 'unknown' }, { stageId: 'operation', phase: 'start', actions: ['operate'] });
  assert.ok(unknown.issues.length); assert.ok(unknown.requiredConfirmations.includes('operation'));
  const release = resolveWorkflowPolicy(operations, { ...allFalse, release: true }, { stageId: 'release', phase: 'start', actions: ['release'] });
  assert.ok(release.requiredConfirmations.includes('release'));
});

test('workflow policy authorization: stage actions and current sources must both cover actual actions', async t => {
  const root = await setup(t);
  const read = await inspectWorkflowPolicy(root, 'owner', { stageId: 'report', phase: 'start', actions: ['read'], confirmationRefs: [] });
  assert.equal(read.allowed, true); assert.equal(read.sourceVerification, 'not-independently-verified');
  const denied = await inspectWorkflowPolicy(root, 'owner', { stageId: 'report', phase: 'start', actions: ['edit-code'], confirmationRefs: [] });
  assert.equal(denied.allowed, false); assert.ok(denied.issues.some(issue => issue.includes('动作来源')));
});

test('workflow policy comparison: descriptions and added checks preserve policy, delayed confirmation does not', async () => {
  const baseline = await definition('feature'); const description = structuredClone(baseline);
  description.id = 'project.feature'; description.title = '说明调整'; description.stages[0].checks.push('额外检查。');
  assert.equal(compareWorkflowPolicies(createWorkflowSnapshot(baseline), createWorkflowSnapshot(description)).requiresApproval, false);
  const earlier = structuredClone(baseline); earlier.stages[0].confirmationAt = 'start';
  const delayed = structuredClone(earlier); delayed.id = 'project.feature'; delayed.stages[0].confirmationAt = 'verify';
  assert.ok(compareWorkflowPolicies(createWorkflowSnapshot(earlier), createWorkflowSnapshot(delayed)).differences.some(item => item.startsWith('confirmation-delayed')));
});

test('workflow policy comparison: unknown is not a boolean tautology and changed completion requires approval', async () => {
  const baseline = await definition();
  baseline.stages.at(-1).when = { any: [{ fact: 'production', equals: true }, { not: { fact: 'production', equals: true } }] };
  const candidate = structuredClone(baseline); candidate.id = 'project.audit'; delete candidate.stages.at(-1).when;
  const result = compareWorkflowPolicies(createWorkflowSnapshot(baseline), createWorkflowSnapshot(candidate));
  assert.equal(result.combinations, 3);
  assert.ok(result.differences.includes('condition-changed-unproven:report'));
  candidate.completion.result = 'change-verified';
  assert.ok(compareWorkflowPolicies(createWorkflowSnapshot(baseline), createWorkflowSnapshot(candidate)).differences.includes('completion-changed'));
});

test('workflow policy comparison preserves the proof space while unrelated stage facts do not affect equivalence', async t => {
  const baseline = await definition();
  baseline.stages[0].when = { any: WORKFLOW_FACTS.flatMap(fact => [{ fact, equals: true }, { fact, equals: false }]) };
  baseline.stages.at(-1).when = { any: [{ fact: 'production', equals: true }, { fact: 'production', equals: false }] };
  const candidate = structuredClone(baseline);
  candidate.id = 'project.audit';
  candidate.stages.at(-1).when = { all: [structuredClone(baseline.stages.at(-1).when)] };
  const started = performance.now();
  const result = compareWorkflowPolicies(createWorkflowSnapshot(baseline), createWorkflowSnapshot(candidate));
  assert.equal(result.requiresApproval, false);
  assert.equal(result.combinations, 3 ** WORKFLOW_FACTS.length);
  t.diagnostic(`Single-fact condition equivalence with ${WORKFLOW_FACTS.length} whole-policy facts: ${Math.round(performance.now() - started)}ms`);
});

test('workflow policy extensions: exact activation permits creation, retry retains history and source change revokes use', async t => {
  const root = await setup(t); await candidate(root);
  const input = registration(); const plan = await planWorkflowRegistration(root, input);
  assert.equal(plan.operationAllowed, true);
  const applied = await applyWorkflowRegistration(root, input, plan.planId);
  assert.equal(applied.changed, true);
  assert.equal((await applyWorkflowRegistration(root, input, plan.planId)).historical, true);
  const active = await loadActiveProjectWorkflow(root, 'project.audit');
  await createWorkflowWork(root, 'using', '固定扩展版本', intent('project.audit'));
  const record = readRecord(root, 'using');
  assert.deepEqual(record.workflow.activation, active.activation);
  await assertWorkflowActivationCurrent(root, record);
  put(root, 'request.md', 'Changed authorization.\n');
  await assert.rejects(loadActiveProjectWorkflow(root, 'project.audit'), /来源|意图/);
  assert.ok((await resumeWorkflowWork(root, 'using')).sourceIssues.length);
  await assert.rejects(applyWorkflowRegistration(root, input, plan.planId));
});

test('independent activation checks reread their owner and retain recursion and root boundaries', async t => {
  const root = await setup(t); await candidate(root);
  const input = registration();
  await applyWorkflowRegistration(root, input, (await planWorkflowRegistration(root, input)).planId);
  await createWorkflowWork(root, 'using', '固定扩展', intent('project.audit'));
  await createWorkflowWork(root, 'using-two', '另一个固定扩展', intent('project.audit'));
  const otherRoot = fixture(t); await initialize({ root: otherRoot });
  const record = readRecord(root, 'using');
  const originalOpen = fsPromises.open;
  let ownerReads = 0;
  fsPromises.open = async function (path, ...args) {
    if (String(path).replaceAll('\\', '/').endsWith('/work/owner/record.json')) ownerReads++;
    return originalOpen.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    await assertWorkflowActivationCurrent(root, record);
    const first = ownerReads; assert.ok(first > 0);
    await assertWorkflowActivationCurrent(root, structuredClone(record));
    assert.ok(ownerReads > first, 'A separate check must read current owner input even for identical arguments.');
    await assert.rejects(withConfirmationVisit(root, 'workflow-policy', record.workflow.activation.receiptId,
      () => assertWorkflowActivationCurrent(root, record)), { code: 'CONFIRMATION_RECURSION_LIMIT' });
    const beforeOther = ownerReads;
    await assertWorkflowActivationCurrent(root, readRecord(root, 'using-two'));
    assert.ok(ownerReads > beforeOther, 'Another work must validate its own activation.');
    await assert.rejects(assertWorkflowActivationCurrent(otherRoot, record));
    put(root, 'request.md', 'Changed authorization.\n');
    await assert.rejects(assertWorkflowActivationCurrent(root, record), /来源|意图/);
    put(root, 'request.md', 'Read, report and edit configuration in scope.\n');
    await assertWorkflowActivationCurrent(root, record);
  } finally {
    fsPromises.open = originalOpen; syncBuiltinESMExports();
  }
});

test('independent stage queries reject a real extension revocation', async t => {
  const root = await setup(t);
  await candidate(root, value => { value.stages.at(-1).actions.push('edit-code'); });
  const preview = await planWorkflowRegistration(root, registration());
  const approval = await approve(root, 'owner', 'extension', 'scope', {
    scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'owner', changeDigest: preview.changeDigest },
  });
  const input = registration({ confirmationRefs: [approval] });
  await applyWorkflowRegistration(root, input, (await planWorkflowRegistration(root, input)).planId);
  await createWorkflowWork(root, 'using', '受约束扩展', intent('project.audit'));
  put(root, '.tiller/verification/config.json', JSON.stringify({ schemaVersion: 1, modules: [], requirements: [], categories: workflowCategories, suites: [] }));
  const context = await loadWorkflowPolicyContext(root, 'using');
  await startStage({ root, workId: 'using', snapshot: context.snapshot, counter: 0, confirmationRefs: [] }, 'scope');
  const before = (await inspectWorkflowStages(root, 'using', 'scope')).stages[0];
  assert.equal(before.effectiveStatus, 'active'); assert.deepEqual(before.issues, []);
  put(root, 'revoke.md', 'Revoke this exact extension.\n');
  await recordDecision(root, 'owner', {
    decisionId: 'extension-no', requestId: 'extension', outcome: 'revoked', conditions: [],
    source: { kind: 'conversation', reference: ref('revoke.md'), quote: 'Revoke this exact extension.',
      presentation: ref('.tiller/work/owner/reviews/request-extension/presentation.md') },
  });
  await assert.rejects(assertWorkflowActivationCurrent(root, readRecord(root, 'using')));
  const after = (await inspectWorkflowStages(root, 'using', 'scope')).stages[0];
  assert.equal(after.effectiveStatus, 'stale'); assert.equal(after.technicalReady, false);
  assert.ok(after.issues.length > 0);
});

test('workflow policy extensions: multiple active versions require explicit selection and old create retry stays pinned', async t => {
  const root = await setup(t); await candidate(root);
  const one = registration(); await applyWorkflowRegistration(root, one, (await planWorkflowRegistration(root, one)).planId);
  const creation = intent('project.audit');
  await createWorkflowWork(root, 'using', '固定扩展', creation);
  await candidate(root, value => { value.title = '第二版说明'; }, '1.1.0');
  const two = registration({ operationId: 'register-two', expectedRevision: 1, candidate: { id: 'project.audit', version: '1.1.0' } });
  await applyWorkflowRegistration(root, two, (await planWorkflowRegistration(root, two)).planId);
  await assert.rejects(loadActiveProjectWorkflow(root, 'project.audit'), /多个/);
  assert.equal((await createWorkflowWork(root, 'using', '固定扩展', creation)).historical, true);
  assert.equal(readRecord(root, 'using').workflow.version, '1.0.0');
  await createWorkflowWork(root, 'using-two', '显式第二版', intent('project.audit', { workflowVersion: '1.1.0' }));
  assert.equal(readRecord(root, 'using-two').workflow.version, '1.1.0');
});

test('workflow policy extensions: weak policy needs exact scope approval and revocation reaches pinned works', async t => {
  const root = await setup(t); await candidate(root, value => { value.stages[0].actions.push('edit-code'); });
  const plain = registration();
  const preview = await planWorkflowRegistration(root, plain);
  assert.equal(preview.operationAllowed, false); assert.equal(preview.difference.requiresApproval, true);
  const approval = await approve(root, 'owner', 'extension', 'scope', { scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'owner', changeDigest: preview.changeDigest } });
  const input = registration({ confirmationRefs: [approval] });
  const ready = await planWorkflowRegistration(root, input);
  assert.equal(ready.changeDigest, preview.changeDigest); assert.equal(ready.operationAllowed, true);
  await applyWorkflowRegistration(root, input, ready.planId);
  await createWorkflowWork(root, 'using', '受约束扩展', intent('project.audit'));
  const blocked = await inspectWorkflowPolicy(root, 'using', { stageId: 'scope', phase: 'start', actions: ['edit-code'], confirmationRefs: [] });
  assert.equal(blocked.allowed, false); assert.ok(blocked.requiredConfirmations.includes('design'));
  const request = `.tiller/work/owner/reviews/request-extension/presentation.md`;
  put(root, 'revoke.md', 'Revoke this exact extension.\n');
  await recordDecision(root, 'owner', {
    decisionId: 'extension-no', requestId: 'extension', outcome: 'revoked', conditions: [],
    source: { kind: 'conversation', reference: ref('revoke.md'), quote: 'Revoke this exact extension.', presentation: ref(request) },
  });
  await assert.rejects(assertWorkflowActivationCurrent(root, readRecord(root, 'using')));
  await assert.rejects(applyWorkflowRegistration(root, input, ready.planId));
});

test('workflow policy extensions: version overwrite, stale plan and missing configuration permission preserve shared files', async t => {
  const root = await setup(t); await candidate(root);
  const input = registration(); const plan = await planWorkflowRegistration(root, input);
  await candidate(root, value => { value.title = 'Changed after preview'; });
  const before = snapshot(root);
  await assert.rejects(applyWorkflowRegistration(root, input, plan.planId), /变化/);
  assert.deepEqual(snapshot(root), before);
  const fresh = await planWorkflowRegistration(root, input);
  await applyWorkflowRegistration(root, input, fresh.planId);
  await candidate(root, value => { value.title = 'Same version changed again'; });
  await assert.rejects(loadActiveProjectWorkflow(root, 'project.audit'), /变化/);
  await assert.rejects(planWorkflowRegistration(root, registration({ operationId: 'overwrite', expectedRevision: 1 })), /不同摘要/);
});

test('workflow policy extensions: source authority is required even when policy is unchanged', async t => {
  const root = await setup(t);
  await createWorkflowWork(root, 'reader', '仅调查', intent('analysis', {
    actionSources: [{ actions: ['read', 'write-report'], reference: ref('request.md'), quote: 'Read, report and edit configuration in scope.', scope }],
  }));
  await candidate(root);
  const plan = await planWorkflowRegistration(root, registration({ ownerWorkId: 'reader' }));
  assert.equal(plan.operationAllowed, false); assert.ok(plan.blockingReasons.some(issue => issue.includes('配置编辑来源')));
});

test('workflow policy records: current contract rejects missing activation and control data cannot self-authorize', async t => {
  const root = await setup(t);
  const record = readRecord(root, 'owner');
  record.workflow.id = 'project.audit';
  assert.throws(() => parseWorkflowWorkRecord(record, 'owner'));
  for (const path of ['.tiller/workflow-policy/index.json', '.tiller/workflow-policy/receipts/proof.json']) {
    assert.throws(() => validateWorkflowReference(ref(path)));
    assert.throws(() => assertVerificationInput(ref(path)));
  }
  put(root, '.tiller/work/old/record.json', JSON.stringify({ schemaVersion: 3 }));
  const before = snapshot(root);
  await assert.rejects(loadWorkflowPolicyContext(root, 'old'), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  assert.deepEqual(snapshot(root), before);
});

test('workflow policy output integration: design generation requires explicit current requirements confirmation', async t => {
  const root = await setup(t);
  await createWorkflowWork(root, 'feature-work', '设计接通', intent('feature', { expectedOutputs: ['requirements-output', 'design-output'] }));
  put(root, 'requirements.md', '# 需求\n明确行为、范围及验收条件。\n');
  await addWorkflowOutput(root, 'feature-work', { operationId: 'requirements-ref', expectedRevision: 1, outputId: 'requirements-output', source: ref('requirements.md') });
  const context = await loadWorkflowPolicyContext(root, 'feature-work');
  const approval = await approve(root, 'feature-work', 'requirements-approved', 'requirements', {
    subjects: [ref('requirements.md')],
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest, stageId: 'requirements' },
  });
  const design = { operationId: 'design-one', expectedRevision: 2, outputId: 'design-output', content: '# 设计\n范围与实现方案对应，提供验证方法。\n' };
  const before = snapshot(root);
  await assert.rejects(addWorkflowOutput(root, 'feature-work', design), error => error.code === 'WORKFLOW_POLICY_REQUIRED');
  assert.deepEqual(snapshot(root), before);
  const result = await addWorkflowOutput(root, 'feature-work', { ...design, confirmationRefs: [approval] });
  assert.equal(result.changed, true);
  assert.equal((await loadWorkflowPolicyContext(root, 'feature-work')).intentDigest, context.intentDigest);
});

test('workflow policy operation integration: exact environment and version are required for actual action', async t => {
  const root = await setup(t);
  const extended = await definition('operations');
  extended.id = 'project.audit';
  extended.stages.find(stage => stage.id === 'observation').actions.push('operate');
  put(root, '.tiller/workflows/project.audit@1.0.0.json', JSON.stringify(extended));
  const extensionInput = registration({ baseline: { id: 'operations', version: '1.0.0' } });
  const extensionPlan = await planWorkflowRegistration(root, extensionInput);
  const extensionApproval = await approve(root, 'owner', 'operation-extension', 'scope', {
    scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'owner', changeDigest: extensionPlan.changeDigest },
  });
  const approvedExtension = { ...extensionInput, confirmationRefs: [extensionApproval] };
  await applyWorkflowRegistration(root, approvedExtension, (await planWorkflowRegistration(root, approvedExtension)).planId);
  await createWorkflowWork(root, 'operation-work', '受控操作', intent('project.audit', {
    expectedOutputs: ['operation-output'],
    actionSources: [{ actions: ['read', 'write-report', 'operate'], reference: ref('request.md'), quote: 'Read, report and edit configuration in scope.', scope }],
  }));
  put(root, 'recovery.md', '# 恢复\n失败时停止并按已确认步骤恢复。\n');
  const context = await loadWorkflowPolicyContext(root, 'operation-work');
  const operationBinding = {
    ownerWorkId: 'operation-work', stageId: 'operation', actions: ['operate'],
    objects: [{ repository: '.', target: 'shared', environment: 'isolated-test', version: 'one' }],
    recovery: { reference: ref('recovery.md'), condition: '失败立即停止。' }, endCondition: '实际观察结果已保存。',
  };
  const approval = await approve(root, 'operation-work', 'operate-approved', 'operation', {
    subjects: [ref('basis.md'), ref('recovery.md')], operationBinding,
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest, stageId: 'operation' },
  });
  const input = { stageId: 'operation', phase: 'start', actions: ['operate'], confirmationRefs: [approval], operationBinding };
  const accepted = await inspectWorkflowPolicy(root, 'operation-work', input);
  assert.equal(accepted.allowed, true, accepted.issues.join(';'));
  const changed = structuredClone(input); changed.operationBinding.objects[0].version = 'two';
  const denied = await inspectWorkflowPolicy(root, 'operation-work', changed);
  assert.equal(denied.allowed, false);
  assert.ok(denied.issues.some(issue => issue.includes('对象')));
  // A predecessor approval permits observing that stage, but cannot authorize another operation.
  const readObservation = await inspectWorkflowPolicy(root, 'operation-work', {
    stageId: 'observation', phase: 'start', actions: ['read'], confirmationRefs: [approval],
  });
  assert.equal(readObservation.allowed, true, readObservation.issues.join(';'));
  const inheritedOnly = await inspectWorkflowPolicy(root, 'operation-work', {
    stageId: 'observation', phase: 'start', actions: ['operate'], confirmationRefs: [approval],
    operationBinding: { ...operationBinding, stageId: 'observation' },
  });
  assert.equal(inheritedOnly.allowed, false);
  assert.ok(inheritedOnly.issues.some(issue => issue.includes('observation/operation')));
  const observationBinding = { ...operationBinding, stageId: 'observation' };
  const currentApproval = await approve(root, 'operation-work', 'observe-operation', 'operation', {
    upstream: [approval.requestId], subjects: [ref('basis.md'), ref('recovery.md')], operationBinding: observationBinding,
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest, stageId: 'observation' },
  });
  const explicitCurrent = await inspectWorkflowPolicy(root, 'operation-work', {
    stageId: 'observation', phase: 'start', actions: ['operate'], confirmationRefs: [approval, currentApproval], operationBinding: observationBinding,
  });
  assert.equal(explicitCurrent.allowed, true, explicitCurrent.issues.join(';'));
});

test('workflow policy scope coverage: exact change digest cannot expand a subset approval', async t => {
  const root = await setup(t);
  const expandedScope = { repositories: ['.'], targets: ['shared', 'other'] };
  await createWorkflowWork(root, 'broad-owner', '多个目标的配置', intent('analysis', {
    scope: expandedScope, actionSources: [{ actions: ['read', 'write-report', 'edit-documents'], reference: ref('request.md'), quote: 'Read, report and edit configuration in scope.', scope: expandedScope }],
  }));
  await candidate(root, value => { value.stages[0].actions.push('edit-code'); });
  const input = registration({ ownerWorkId: 'broad-owner' });
  const preview = await planWorkflowRegistration(root, input);
  const reference = await approve(root, 'broad-owner', 'subset', 'scope', {
    scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'broad-owner', changeDigest: preview.changeDigest },
  });
  const denied = await planWorkflowRegistration(root, { ...input, confirmationRefs: [reference] });
  assert.equal(denied.operationAllowed, false);
  assert.ok(denied.blockingReasons.some(reason => reason.includes('未覆盖')));
});
