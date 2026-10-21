import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlanningDefinition, planPlanningRegistration, applyPlanningRegistration, planPlanningActivation, applyPlanningActivation, loadActivePlanning, loadPlanningState, readRegisteredPlanning, parsePlanningState } from '../dist/planning.js';
import { requestConfirmation, readConfirmation } from '../dist/confirmations.js';
import { planDeliveryPreparation, applyDeliveryPreparation } from '../dist/delivery-environment.js';
import { git } from '../dist/delivery-git.js';
import { setupPlanning, fixtureDecision, documentSelection, seedApprovedDevelopment, registerDevelopmentOutputs } from './planning-helpers.mjs';
import { put } from './helpers.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const file = (root, workId, name) => join(root, '.tiller', 'work', workId, name);
async function register(context, input = context.registration) {
  const preview = await planPlanningRegistration(context.root, context.workId, input);
  return applyPlanningRegistration(context.root, context.workId, input, preview.planId);
}
async function activate(context, revision = 'v-one', requestId = 'planning-one', expectedRevision = 1) {
  const confirmation = await context.approvePlanning(revision, requestId);
  const input = { operationId: `activate-${revision}`, expectedRevision, revision, confirmation };
  const preview = await planPlanningActivation(context.root, context.workId, input);
  return { input, preview, receipt: await applyPlanningActivation(context.root, context.workId, input, preview.planId) };
}

test('bounded manual preparation copies preserve historical bytes and isolate later mutations', async t => {
  const first = await setupPlanning(t);
  const second = await setupPlanning(t);
  assert.notEqual(first.root, second.root);
  for (const name of ['record.json', 'stages/state.json', 'confirmations.json']) {
    assert.equal(readFileSync(file(first.root, first.workId, name), 'utf8'), readFileSync(file(second.root, second.workId, name), 'utf8'));
  }
  const firstSource = join(first.root, first.requirements.path);
  const secondSource = join(second.root, second.requirements.path);
  assert.ok(Math.abs(statSync(firstSource).mtimeMs - statSync(secondSource).mtimeMs) < 2);
  const original = readFileSync(secondSource, 'utf8');
  put(first.root, first.requirements.path, '# Changed only in the first independent fixture\n');
  assert.equal(readFileSync(secondSource, 'utf8'), original);
  assert.equal(existsSync(file(second.root, second.workId, 'tasks.json')), false);
  assert.equal(existsSync(join(second.root, '.tiller/local/lock.json')), false);
  assert.equal(existsSync(join(second.root, '.git')), false);
});

test('planning validates graph, coverage, safe scopes, explicit checks and strict structures', async t => {
  const context = await setupPlanning(t, { reuseSeed: true }); const original = context.plan;
  const mutations = [
    plan => { plan.extra = true; },
    plan => { plan.schemaVersion = 2; },
    plan => { plan.tasks.push(copy(plan.tasks[0])); },
    plan => { plan.tasks[0].id = 'constructor'; },
    plan => { plan.requirements.push({ ...plan.requirements[0], id: 'req-1' }); },
    plan => { plan.requirements.push({ id: 'REQ-2', source: plan.requirements[0].source }); },
    plan => { plan.requirements[0].exclusion = '排除后不能继续分配任务'; },
    plan => { plan.tasks[0].dependencies = [{ taskId: 'unknown', artifacts: ['document'] }]; },
    plan => { plan.tasks[0].dependencies = [{ taskId: plan.tasks[0].id, artifacts: ['document'] }]; },
    plan => { plan.tasks[0].scope.targets = ['other-target']; },
    plan => { plan.tasks[0].artifacts[0].source.path = '../escape.md'; },
    plan => { plan.tasks[0].artifacts[0].source.path = `.tiller/work/${context.workId}/tasks.json`; },
    plan => { plan.tasks[0].specifications.standards[0].path = `.tiller/work/${context.workId}/work.md`; },
    plan => { plan.tasks[0].specifications.standards.push({ repository: '.', path: '.tiller/local/private.md' }); },
    plan => { plan.tasks[0].artifacts[0].required = false; },
    plan => { plan.tasks[0].artifacts[0].checks = ['unknown-check']; },
    plan => { plan.tasks[0].verification.checks[0].artifactIds = ['unknown']; },
    plan => { plan.tasks[0].verification.checks[0].inputs[0] = { repository: '.', path: 'dist/result.bin', binary: true, provenance: { repository: 'outside', path: 'evidence.md' } }; },
    plan => { plan.delivery.verification.checks[0].inputs[0] = { repository: '.', path: 'dist/result.bin', binary: true, provenance: { repository: 'outside', path: 'evidence.md' } }; },
    plan => { const { source, ...original } = plan.tasks[0].artifacts[0]; plan.tasks[0].artifacts[0] = { ...original, type: 'generated', output: { repository: '.', path: '.tiller/local/transaction.json' }, inputs: [source], evidence: { repository: '.', path: 'evidence.md' } }; },
    plan => { plan.tasks[0].verification = { ...plan.tasks[0].verification, caseIds: [], checks: [] }; },
    plan => { plan.tasks[0].basis.design = null; },
    plan => { plan.tasks[0].humanCheckpoints = [{ id: 'gate', operation: 'delivery-ready', purpose: 'bad', subjects: [plan.requirements[0].source] }]; },
    plan => { plan.delivery.requiredTasks = []; },
  ];
  for (const mutation of mutations) { const plan = copy(original); mutation(plan); assert.throws(() => parsePlanningDefinition(plan), mutation.toString()); }
  const cycle = copy(original); const second = copy(cycle.tasks[0]); second.id = 'second';
  cycle.tasks.push(second); cycle.delivery.requiredTasks.push('second');
  cycle.tasks[0].dependencies = [{ taskId: 'second', artifacts: ['document'] }]; second.dependencies = [{ taskId: 'write-document', artifacts: ['document'] }];
  assert.throws(() => parsePlanningDefinition(cycle), /循环/u);
  const deferred = copy(original); deferred.tasks[0].basis.design = null; deferred.tasks[0].specifications.design = []; deferred.tasks[0].pendingDetails = ['后续补充任务详细设计并取得确认。'];
  assert.equal(parsePlanningDefinition(deferred).tasks[0].basis.design, null);
  const excluded = copy(original); excluded.requirements.push({ id: 'REQ-2', source: excluded.requirements[0].source, exclusion: '明确移到后续工作，不在本次交付范围。' });
  assert.equal(parsePlanningDefinition(excluded).requirements.length, 2);
  const wrong = copy(context.registration); wrong.plan.scope.targets = ['other-target']; wrong.plan.tasks[0].scope.targets = ['other-target'];
  await assert.rejects(planPlanningRegistration(context.root, context.workId, wrong), /范围/u);
  assert.equal(existsSync(file(context.root, context.workId, 'tasks.json')), false);
});

test('registration is immutable and activation requires the exact reviewed plan and current user decision', async t => {
  const context = await setupPlanning(t); const { root, workId } = context;
  const preview = await planPlanningRegistration(root, workId, context.registration);
  assert.equal(preview.technicalReady, false);
  assert.equal(existsSync(file(root, workId, 'tasks.json')), false);
  assert.equal(existsSync(file(root, workId, 'planning')), false);
  const saved = await applyPlanningRegistration(root, workId, context.registration, preview.planId);
  assert.equal(saved.changed, true); assert.equal(saved.revision, 1);
  assert.equal((await loadPlanningState(root, workId)).state.activePlanning, null);
  const original = readFileSync(file(root, workId, 'planning/v-one/definition.json'), 'utf8');
  assert.equal((await applyPlanningRegistration(root, workId, context.registration, preview.planId)).changed, false);
  const changedOperation = copy(context.registration); changedOperation.plan.changeReason = '同一操作不能改变输入。';
  await assert.rejects(planPlanningRegistration(root, workId, changedOperation), { code: 'OPERATION_CONFLICT' });
  await assert.rejects(planPlanningRegistration(root, workId, { ...context.registration, operationId: 'register-again', expectedRevision: 1 }), { code: 'REVISION_EXISTS' });
  const activation = { operationId: 'activate-v-one', expectedRevision: 1, revision: 'v-one', confirmation: { workId, requestId: 'missing', decisionId: 'missing' } };
  await assert.rejects(planPlanningActivation(root, workId, activation), /请求不存在/u);
  put(root, context.outputSources['planning-output'].path, '# 规划审阅\n\n已登记当前版本的任务边界。\n');
  await registerDevelopmentOutputs(context, 'planning');
  await requestConfirmation(root, workId, {
    workflowBinding: await context.binding('planning'), requestId: 'incomplete-planning', gate: 'planning', scope: context.plan.scope, subjects: [context.outputSources['planning-output'], { repository: '.', path: saved.definitionPath }], upstream: ['design'],
    reviewSummary: '此测试故意漏掉规格和审阅视图。', openIssues: [], nextAction: '激活当前规划',
  });
  await fixtureDecision(root, workId, 'incomplete-planning', 'approve-incomplete');
  await assert.rejects(planPlanningActivation(root, workId, { ...activation, confirmation: { workId, requestId: 'incomplete-planning', decisionId: 'approve-incomplete' } }), /全部规格/u);
  const activated = await activate(context);
  assert.equal(activated.receipt.revision, 2);
  const current = await loadActivePlanning(root, workId);
  assert.equal(current.ready, true); assert.equal(current.technicalReady, false);
  assert.equal(current.state.events.length, 1);
  assert.equal((await applyPlanningActivation(root, workId, activated.input, activated.preview.planId)).changed, false);
  assert.equal((await loadActivePlanning(root, workId)).ready, true);
  assert.equal(readFileSync(file(root, workId, 'planning/v-one/definition.json'), 'utf8'), original);
  const view = readFileSync(file(root, workId, 'plan.md'), 'utf8');
  put(root, `.tiller/work/${workId}/plan.md`, view + '\n手工改动');
  const stale = await loadActivePlanning(root, workId); assert.equal(stale.ready, false); assert.match(stale.issues.join(' '), /plan.md/u);
  put(root, `.tiller/work/${workId}/plan.md`, view);
  await fixtureDecision(root, workId, 'planning-one', 'revoke-planning', 'revoked');
  assert.equal((await loadActivePlanning(root, workId)).ready, false);
});

test('revision changes preserve independent task candidates and historical activation facts without copying approval', async t => {
  const context = await setupPlanning(t); const { root, workId } = context;
  const base = context.plan.tasks[0];
  const downstream = { ...copy(base), id: 'downstream', dependencies: [{ taskId: base.id, artifacts: ['document'] }] };
  const independent = { ...copy(base), id: 'independent' };
  context.plan.tasks.push(downstream, independent); context.plan.delivery.requiredTasks.push('downstream', 'independent');
  await register(context); await activate(context);
  const before = await readRegisteredPlanning(root, workId, 'v-one');
  const second = copy(context.plan); second.revision = 'v-two'; second.changeReason = '调整首任务完成条件，保留不受影响的独立任务。'; second.tasks[0].outcome = '交付含额外示例的说明。';
  const input = { operationId: 'register-two', expectedRevision: 2, plan: second };
  const planned = await planPlanningRegistration(root, workId, input);
  assert.deepEqual(planned.changes.changed, ['write-document', 'downstream']);
  assert.deepEqual(planned.changes.retainedCandidates, ['independent']);
  await applyPlanningRegistration(root, workId, input, planned.planId);
  const after = await readRegisteredPlanning(root, workId, 'v-two');
  assert.equal(before.record.taskDigests.independent, after.record.taskDigests.independent);
  assert.notEqual(before.record.taskDigests.downstream, after.record.taskDigests.downstream);
  assert.equal((await loadActivePlanning(root, workId)).registration.plan.revision, 'v-one');
  await assert.rejects(planPlanningActivation(root, workId, { operationId: 'wrong-approval', expectedRevision: 3, revision: 'v-two', confirmation: { workId, requestId: 'planning-one', decisionId: 'approve-planning-one' } }), /不可变规划/u);
  await activate(context, 'v-two', 'planning-two', 3);
  const state = (await loadActivePlanning(root, workId)).state;
  assert.deepEqual(state.events.map(event => event.revision), ['v-one', 'v-two']);
  assert.deepEqual(state.events[1].changes.retainedCandidates, ['independent']);
  assert.equal(readFileSync(file(root, workId, 'planning/v-one/definition.json'), 'utf8'), before.original);
  const removed = copy(second); removed.revision = 'v-three'; removed.changeReason = '明确取消下游任务。'; removed.tasks = removed.tasks.filter(task => task.id !== 'downstream'); removed.delivery.requiredTasks = removed.delivery.requiredTasks.filter(id => id !== 'downstream');
  const removedPreview = await planPlanningRegistration(root, workId, { operationId: 'register-three', expectedRevision: 4, plan: removed });
  assert.deepEqual(removedPreview.changes.removed, ['downstream']);
});

test('changed bases, obsolete expectedRevision and old state versions cannot overwrite saved planning', async t => {
  const context = await setupPlanning(t); const { root, workId } = context;
  const preview = await planPlanningRegistration(root, workId, context.registration);
  const standard = context.plan.tasks[0].specifications.standards[0].path;
  const originalStandard = readFileSync(join(root, standard), 'utf8');
  put(root, standard, '# 新规范\n\n内容已变，应重新预览。\n');
  await assert.rejects(applyPlanningRegistration(root, workId, context.registration, preview.planId), /确认|变化/u);
  assert.equal(existsSync(file(root, workId, 'tasks.json')), false);
  put(root, standard, originalStandard);
  await register(context);
  await assert.rejects(planPlanningRegistration(root, workId, { ...context.registration, operationId: 'later', plan: { ...context.plan, revision: 'v-two' } }), { code: 'REVISION_CONFLICT' });
  const stateText = readFileSync(file(root, workId, 'tasks.json'), 'utf8');
  const state = JSON.parse(stateText);
  put(root, `.tiller/work/${workId}/tasks.json`, JSON.stringify({ ...state, schemaVersion: 2 }));
  await assert.rejects(loadPlanningState(root, workId), { code: 'UNSUPPORTED_RECORD_VERSION' });
  assert.equal(JSON.parse(readFileSync(file(root, workId, 'tasks.json'), 'utf8')).schemaVersion, 2);
  put(root, `.tiller/work/${workId}/tasks.json`, stateText);
  assert.throws(() => parsePlanningState(JSON.stringify({ ...state, passed: true }), workId), /未知字段/u);
  const immutable = file(root, workId, 'planning/v-one/definition.json'); const stored = JSON.parse(readFileSync(immutable, 'utf8'));
  put(root, `.tiller/work/${workId}/planning/v-one/definition.json`, JSON.stringify({ ...stored, schemaVersion: 2 }));
  await assert.rejects(readRegisteredPlanning(root, workId, 'v-one'), { code: 'UNSUPPORTED_RECORD_VERSION' });
});

test('workspace planning validates registered repository identities and permits future outputs without fabricating completion', async t => {
  const context = await setupPlanning(t, { mode: 'workspace', repository: 'business' });
  const invalid = copy(context.registration); const aliased = { repository: '.', path: 'business/docs/result.md' };
  invalid.plan.tasks[0].artifacts[0].source = aliased; invalid.plan.tasks[0].verification = documentSelection(aliased);
  await assert.rejects(planPlanningRegistration(context.root, context.workId, invalid), /登记身份/u);
  for (const selection of ['task', 'delivery']) {
    const invalidProvenance = copy(context.registration);
    const verification = selection === 'task' ? invalidProvenance.plan.tasks[0].verification : invalidProvenance.plan.delivery.verification;
    verification.checks[0].inputs = [{ repository: 'business', path: 'dist/result.bin', binary: true, provenance: aliased }];
    await assert.rejects(planPlanningRegistration(context.root, context.workId, invalidProvenance), /登记身份/u);
  }
  const result = await register(context);
  assert.equal(result.technicalReady, false);
  const registered = await readRegisteredPlanning(context.root, context.workId, 'v-one');
  assert.equal(registered.record.plan.tasks[0].artifacts[0].source.repository, 'business');
  assert.equal((await loadPlanningState(context.root, context.workId)).state.activePlanning, null);
});

test('planning activation events have one ordered receipt and an earlier registration', () => {
  const confirmation = { workId: 'planning-work', requestId: 'planning-one', decisionId: 'approve-planning-one' };
  const hash = 'a'.repeat(64);
  const receipt = (operationId, kind, revision, planningRevision) => ({ operationId, inputDigest: hash, kind, revision, planningRevision, basisDigest: hash, operationAllowed: true, technicalReady: false, blockingReasons: [] });
  const event = (sequence, operationId, revision) => ({ sequence, operationId, kind: 'planning-activated', at: '2026-10-19T00:00:00.000Z', revision, definitionDigest: hash, confirmation, changes: { added: [], changed: [], retainedCandidates: [], removed: [], removedRequirements: [] } });
  const state = {
    schemaVersion: 1, ownerWorkId: 'planning-work', revision: 4,
    activePlanning: { revision: 'v-two', confirmation, definitionDigest: hash, eventSequence: 2 },
    operations: [receipt('register-one', 'register', 1, 'v-one'), receipt('activate-one', 'activate', 2, 'v-one'), receipt('register-two', 'register', 3, 'v-two'), receipt('activate-two', 'activate', 4, 'v-two')],
    events: [event(1, 'activate-one', 'v-one'), event(2, 'activate-two', 'v-two')],
  };
  assert.equal(parsePlanningState(JSON.stringify(state), state.ownerWorkId).events.length, 2);
  const mutations = [
    value => { value.events = []; value.activePlanning = null; },
    value => { value.events[0] = { ...copy(value.events[1]), sequence: 1 }; },
    value => { value.operations[0].planningRevision = 'unrelated'; },
    value => { [value.operations[0], value.operations[1]] = [value.operations[1], value.operations[0]]; value.operations.forEach((item, index) => { item.revision = index + 1; }); },
    value => { [value.events[0], value.events[1]] = [value.events[1], value.events[0]]; value.events.forEach((item, index) => { item.sequence = index + 1; }); value.activePlanning.revision = 'v-one'; },
  ];
  for (const mutation of mutations) {
    const invalid = copy(state); mutation(invalid);
    assert.throws(() => parsePlanningState(JSON.stringify(invalid), invalid.ownerWorkId), /激活事件/u);
  }
});

test('optional planning artifacts may omit checks but declared checks remain explicit', () => {
  const source = { repository: '.', path: 'document.md' };
  const scope = { repositories: ['.'], targets: ['documentation'] };
  const basis = { requirements: { workId: 'planning-work', requestId: 'requirements', decisionId: 'approved-requirements' }, design: { workId: 'planning-work', requestId: 'design', decisionId: 'approved-design' } };
  const optional = { id: 'supplement', type: 'document', source: { repository: '.', path: 'supplement.md' }, purpose: '可选补充示例。', required: false, optionalReason: '核心操作说明可独立交付。', checks: [] };
  const plan = {
    schemaVersion: 1, ownerWorkId: 'planning-work', revision: 'v-one', scope, requirements: [{ id: 'REQ-1', source }], basis,
    tasks: [{ id: 'write-document', title: '文档', outcome: '提供操作说明。', scope, modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis: { requirements: null, design: null }, specifications: { requirements: [], design: [], standards: [] }, pendingDetails: ['补足详细规格。'], dependencies: [],
      artifacts: [{ id: 'document', type: 'document', source, purpose: '核心说明。', required: true, checks: ['document-review'] }, optional], verification: documentSelection(source), humanCheckpoints: [] }],
    delivery: { requiredTasks: ['write-document'], artifacts: [{ id: 'delivered-document', type: 'reference', purpose: '提供核心说明。', required: true, checks: ['delivery-review'], taskId: 'write-document', artifactId: 'document' }, copy(optional)], verification: documentSelection(source, 'delivered-document', 'delivery-review'), humanCheckpoints: [], openIssues: [] },
    changeReason: '区分必要文档和可选补充示例。',
  };
  const parsed = parsePlanningDefinition(plan);
  assert.deepEqual(parsed.tasks[0].artifacts[1].checks, []);
  assert.deepEqual(parsed.delivery.artifacts[1].checks, []);
  const missingReason = copy(plan); delete missingReason.tasks[0].artifacts[1].optionalReason;
  assert.throws(() => parsePlanningDefinition(missingReason), /理由/u);
  const required = copy(plan); required.tasks[0].artifacts[1].required = true;
  assert.throws(() => parsePlanningDefinition(required), /不能为空/u);
  const invalidCheck = copy(plan); invalidCheck.tasks[0].artifacts[1].checks = ['missing-check'];
  assert.throws(() => parsePlanningDefinition(invalidCheck), /产物检查/u);
  const explicitCheck = copy(plan);
  explicitCheck.tasks[0].artifacts[1].checks = ['supplement-review'];
  explicitCheck.tasks[0].verification.checks.push({ ...documentSelection(optional.source, 'supplement', 'supplement-review').checks[0] });
  assert.equal(parsePlanningDefinition(explicitCheck).tasks[0].verification.checks.at(-1).id, 'supplement-review');
});

test('cross-work task specification confirmation uses explicit current identity and does not authorize a broader scope', async t => {
  const context = await setupPlanning(t); const { root, workId, plan } = context;
  const sourceWork = 'source-specification'; const source = plan.requirements[0].source;
  await seedApprovedDevelopment(root, sourceWork, { scope: plan.scope, requirementsSource: source,
    requirementsText: readFileSync(join(root, source.path), 'utf8'), requirementsRequestId: 'shared-requirements', requirementsDecisionId: 'approve-shared' });
  plan.tasks[0].basis.requirements = { workId: sourceWork, requestId: 'shared-requirements', decisionId: 'approve-shared' };
  plan.tasks[0].relatedWorks = [sourceWork];
  const preview = await planPlanningRegistration(root, workId, context.registration);
  assert.equal(preview.operationAllowed, true);
  const wrong = copy(context.registration); wrong.plan.tasks[0].basis.requirements.decisionId = 'unrelated-approval';
  await assert.rejects(planPlanningRegistration(root, workId, wrong), /当前决定/u);
  const sourcePath = `.tiller/work/${sourceWork}/record.json`; const original = readFileSync(join(root, sourcePath), 'utf8');
  put(root, sourcePath, JSON.stringify({ ...JSON.parse(original), schemaVersion: 2 }));
  await assert.rejects(applyPlanningRegistration(root, workId, context.registration, preview.planId), { code: 'UNSUPPORTED_RECORD_VERSION' });
  assert.equal(existsSync(file(root, workId, 'tasks.json')), false);
  assert.equal(JSON.parse(readFileSync(join(root, sourcePath), 'utf8')).schemaVersion, 2);
});

test('accumulated specification paths reject case aliases before writing immutable records', async t => {
  const context = await setupPlanning(t, { reuseSeed: true });
  const task = context.plan.tasks[0];
  task.basis = { ...task.basis, design: null }; task.pendingDetails = ['详细设计待补充。'];
  task.specifications.standards[0].path = task.specifications.standards[0].path.replace('standard.md', 'STANDARD.md');
  await assert.rejects(planPlanningRegistration(context.root, context.workId, context.registration), /大小写别名/u);
  assert.equal(existsSync(file(context.root, context.workId, 'tasks.json')), false);
  assert.equal(existsSync(file(context.root, context.workId, 'planning/v-one/definition.json')), false);
});

test('cross-work approval cannot approve different bytes at the same repository path in another activity root', async t => {
  const context = await setupPlanning(t, { mode: 'workspace', repository: 'business' });
  const { root, workId, plan } = context; const sourceWork = 'isolated-specification';
  const business = join(root, 'business'); const source = { repository: 'business', path: 'shared-requirements.md' };
  const approvedRequirements = '# 来源工作已确认的需求正文\n\nREQ-1：读者按照已核对的操作说明读取输入、执行步骤，并核对本次输出。\n';
  const differentRequirements = '# 当前工作中同名但不同的未确认正文\n\nREQ-1：读者必须额外检查另一项输出；该新增要求未包含在来源工作的确认中。\n';
  await git(business, ['config', 'core.autocrlf', 'false']);
  put(business, source.path, approvedRequirements);
  await git(business, ['checkout', '-b', 'main']);
  await git(business, ['add', '--all']);
  await git(business, ['-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Synthetic isolated specification baseline']);
  await seedApprovedDevelopment(root, sourceWork, { scope: plan.scope, requirementsSource: source,
    requirementsText: approvedRequirements, designSource: plan.tasks[0].specifications.design[0],
    designText: readFileSync(join(root, plan.tasks[0].specifications.design[0].path), 'utf8') });
  const input = { schemaVersion: 1, designRequest: 'design', repositories: [{ id: 'business', base: 'HEAD', branch: 'codex/isolated-specification', target: 'main' }] };
  const preparation = await planDeliveryPreparation(root, sourceWork, input);
  const prepared = await applyDeliveryPreparation(root, sourceWork, input, preparation.planId);
  assert.notEqual(prepared.bindings.business.root, business);
  put(business, source.path, differentRequirements);
  const confirmation = { workId: sourceWork, requestId: 'requirements', decisionId: 'approve-requirements' };
  assert.equal((await readConfirmation(root, confirmation)).check.confirmed, true);
  plan.tasks[0].basis = { ...plan.tasks[0].basis, requirements: confirmation };
  plan.tasks[0].specifications.requirements = [source]; plan.tasks[0].relatedWorks = [sourceWork];
  await assert.rejects(planPlanningRegistration(root, workId, context.registration), { code: 'CONTENT_CHANGED' });
  assert.equal(existsSync(file(root, workId, 'tasks.json')), false);
  assert.equal(readFileSync(join(prepared.bindings.business.root, source.path), 'utf8'), approvedRequirements);
});
