import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { WORKFLOW_FACTS, createWorkflowSnapshot } from '../dist/workflow-catalog.js';
import { requestConfirmation, recordDecision, checkGate, readConfirmation } from '../dist/confirmations.js';
import { withConfirmationVisit, CONFIRMATION_LIMITS } from '../dist/confirmation-context.js';
import { fixture, put, snapshot } from './helpers.mjs';

const ref = path => ({ repository: '.', path });
const scope = { repositories: ['.'], targets: ['shared'] };
const facts = Object.fromEntries(WORKFLOW_FACTS.map(key => [key, false]));
async function setup(t) {
  const root = fixture(t); await initialize({ root });
  put(root, 'intent.md', '# Synthetic instruction\nReview this scope and its operation objects.\n');
  put(root, 'requirements.md', '# Requirements\nUnique identifiers.\n');
  put(root, 'design.md', '# Design\nUse a keyed map.\n');
  put(root, 'recovery.md', '# Recovery\nRestore the verified snapshot.\n');
  put(root, 'evidence.md', '# Evidence\nSynthetic checks.\n');
  return root;
}
async function work(root, id, workflow = 'feature', actions = ['read', 'write-report', 'operate']) {
  await createWorkflowWork(root, id, `Synthetic ${id}`, {
    operationId: 'create', expectedRevision: 0, workflow, goal: 'Assess the declared target', reason: 'Synthetic bounded fixture', scope,
    impact: facts, basis: [], actionSources: [{ actions, reference: ref('intent.md'), quote: 'Review this scope and its operation objects.', scope }],
    expectedOutputs: [workflow === 'feature' ? 'requirements-output' : workflow === 'operations' ? 'object-output' : 'report-output'], completionCriteria: ['Declared evidence matches the result'],
  });
  if (workflow === 'feature') {
    await addWorkflowOutput(root, id, { operationId: 'requirements', expectedRevision: 1, outputId: 'requirements-output', source: ref('requirements.md') });
    await addWorkflowOutput(root, id, { operationId: 'design', expectedRevision: 2, outputId: 'design-output', source: ref('design.md') });
  }
  const context = await loadWorkflowPolicyContext(root, id);
  return { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest };
}
function request(binding, requestId, gate = 'requirements', extra = {}) {
  return { requestId, gate, workflowBinding: { ...binding, ...(['requirements', 'design', 'planning', 'operation'].includes(gate) ? { stageId: gate } : {}) },
    scope, subjects: [ref(gate === 'design' ? 'design.md' : gate === 'operation' ? 'recovery.md' : 'requirements.md')], upstream: [], reviewSummary: 'Review these exact objects', openIssues: [], nextAction: 'Continue the declared bounded scope', ...extra };
}
function decision(root, id, requestId, decisionId, outcome = 'approved') {
  const path = `source-${id}-${decisionId}.md`; put(root, path, '# Synthetic decision\nApprove these exact objects.\n');
  return { requestId, decisionId, outcome, conditions: [], source: { kind: 'conversation', reference: ref(path), quote: 'Approve these exact objects.', presentation: ref(`.tiller/work/${id}/reviews/request-${requestId}/presentation.md`) },
    sourceReview: { reviewer: 'Synthetic fixture', rationale: 'Matches the fixture request and bounded scope', reviewedAt: '2026-10-20T00:00:00.000Z' } };
}

test('independent confirmation inputs observe source and decision changes without retaining results', async t => {
  const root = await setup(t); const binding = await work(root, 'inspection');
  await requestConfirmation(root, 'inspection', request(binding, 'requirements'));
  const approved = decision(root, 'inspection', 'requirements', 'approve');
  await recordDecision(root, 'inspection', approved);
  const reference = { workId: 'inspection', requestId: 'requirements', decisionId: 'approve' };
  const first = await readConfirmation(root, reference);
  const next = await readConfirmation(root, reference);
  assert.equal(first.check.confirmed, true);
  assert.deepEqual(next, first);
  assert.notStrictEqual(next, first);
  assert.equal(Object.isFrozen(first.request.files), true);
  assert.equal(Object.isFrozen(first.check), true);
  const sourcePath = approved.source.reference.path;
  const sourceText = readFileSync(join(root, sourcePath), 'utf8');
  put(root, sourcePath, `${sourceText}\nChanged source.\n`);
  assert.equal((await readConfirmation(root, reference)).check.confirmed, false);
  put(root, sourcePath, sourceText);
  assert.equal((await readConfirmation(root, reference)).check.confirmed, true);
  await assert.rejects(readConfirmation(root, { ...reference, decisionId: 'unknown' }), /当前决定/u);
  await recordDecision(root, 'inspection', decision(root, 'inspection', 'requirements', 'withdraw', 'revoked'));
  await assert.rejects(readConfirmation(root, reference), /当前决定/u);
  const revoked = await readConfirmation(root, { ...reference, decisionId: 'withdraw' });
  assert.equal(revoked.check.confirmed, false);
  assert.equal(revoked.check.status, 'invalidated');
});

test('typed confirmations reject note-only, old work and old registry without snapshots or conversion', async t => {
  const root = await setup(t); const binding = { workflowDigest: 'a'.repeat(64), intentDigest: 'b'.repeat(64) };
  put(root, '.tiller/work/notes/work.md', '# Only notes\n');
  const before = snapshot(root);
  await assert.rejects(requestConfirmation(root, 'notes', request(binding, 'approval')));
  assert.deepEqual(snapshot(root), before);
  put(root, '.tiller/work/notes/record.json', JSON.stringify({ schemaVersion: 3 }));
  const old = snapshot(root);
  await assert.rejects(requestConfirmation(root, 'notes', request(binding, 'approval')), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  assert.deepEqual(snapshot(root), old);
  const current = await work(root, 'current');
  put(root, '.tiller/work/current/confirmations.json', JSON.stringify({ schemaVersion: 3, workId: 'current', requests: [], decisions: [] }));
  const preserved = snapshot(root);
  await assert.rejects(requestConfirmation(root, 'current', request(current, 'approval')), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  assert.deepEqual(snapshot(root), preserved);
});

test('typed confirmation binds stable intent while unrelated output registration does not revoke approval', async t => {
  const root = await setup(t); const binding = await work(root, 'feature');
  await requestConfirmation(root, 'feature', request(binding, 'requirements'));
  await recordDecision(root, 'feature', decision(root, 'feature', 'requirements', 'approve'));
  put(root, 'planning.md', '# Planning\nImplement and verify.\n');
  await addWorkflowOutput(root, 'feature', { operationId: 'planning', expectedRevision: 3, outputId: 'planning-output', source: ref('planning.md') });
  assert.equal((await checkGate(root, 'feature', 'requirements')).confirmed, true);
  const path = '.tiller/work/feature/record.json'; const record = JSON.parse(readFileSync(join(root, path), 'utf8')); record.goal = 'A different goal'; put(root, path, JSON.stringify(record));
  assert.equal((await checkGate(root, 'feature', 'requirements')).confirmed, false);
});

test('scope approval is independent of ordinary stages and bound to its actual change digest', async t => {
  const root = await setup(t); const binding = await work(root, 'review', 'review');
  const scoped = request(binding, 'extension', 'scope', { scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'review', changeDigest: 'a'.repeat(64) } });
  assert.equal((await requestConfirmation(root, 'review', scoped)).status, 'pending');
  assert.equal((await recordDecision(root, 'review', decision(root, 'review', 'extension', 'approve'))).confirmed, true);
  await assert.rejects(requestConfirmation(root, 'review', { ...scoped, scopeBinding: { ...scoped.scopeBinding, changeDigest: 'b'.repeat(64) } }), /不同内容/u);
  await assert.rejects(requestConfirmation(root, 'review', request(binding, 'bad', 'requirements')), /阶段|产物/u);
});

test('operation approval binds stage, actions, objects, recovery and end condition without merge or release escape', async t => {
  const root = await setup(t); const binding = await work(root, 'ops', 'operations');
  const operationBinding = { ownerWorkId: 'ops', stageId: 'operation', actions: ['operate'], objects: [{ repository: '.', target: 'shared', environment: 'test', version: 'v1' }], recovery: { reference: ref('recovery.md'), condition: 'Restore if verification fails' }, endCondition: 'This version changes' };
  const input = request(binding, 'operation', 'operation', { operationBinding });
  assert.equal((await requestConfirmation(root, 'ops', input)).status, 'pending');
  assert.equal((await recordDecision(root, 'ops', decision(root, 'ops', 'operation', 'approve'))).confirmed, true);
  for (const changed of [
    { ...operationBinding, actions: ['merge'] }, { ...operationBinding, actions: ['release'] },
    { ...operationBinding, objects: [] }, { ...operationBinding, objects: [...operationBinding.objects, ...operationBinding.objects] },
    { ...operationBinding, objects: [{ ...operationBinding.objects[0], target: 'other' }] },
    { ...operationBinding, recovery: { ...operationBinding.recovery, reference: ref('missing.md') } },
  ]) await assert.rejects(requestConfirmation(root, 'ops', { ...input, requestId: 'bad', operationBinding: changed }));
  const original = decision(root, 'ops', 'operation', 'approve');
  const second = { ...input, requestId: 'changed', operationBinding: { ...operationBinding, objects: [{ ...operationBinding.objects[0], version: 'v2' }] } };
  await requestConfirmation(root, 'ops', second);
  await assert.rejects(recordDecision(root, 'ops', { ...original, requestId: 'changed', decisionId: 'reuse', source: { ...original.source, presentation: ref('.tiller/work/ops/reviews/request-changed/presentation.md') }, reuseOf: { requestId: 'operation', decisionId: 'approve', reason: 'Claimed editorial change' } }), /重新确认/u);
});

test('cross-work content references pin current decision and body without granting operation authority', async t => {
  const root = await setup(t); const source = await work(root, 'source'); const target = await work(root, 'target');
  await requestConfirmation(root, 'source', request(source, 'requirements'));
  await recordDecision(root, 'source', decision(root, 'source', 'requirements', 'approve'));
  const reference = { workId: 'source', requestId: 'requirements', decisionId: 'approve' };
  await requestConfirmation(root, 'target', request(target, 'design', 'design', { externalUpstream: [reference] }));
  assert.equal((await recordDecision(root, 'target', decision(root, 'target', 'design', 'approve-design'))).confirmed, true);
  const registry = JSON.parse(readFileSync(join(root, '.tiller/work/target/confirmations.json'), 'utf8'));
  assert.match(registry.requests[0].externalDependencies[0].decisionFingerprint, /^[a-f0-9]{64}$/u);
  await recordDecision(root, 'source', decision(root, 'source', 'requirements', 'withdraw', 'revoked'));
  assert.equal((await checkGate(root, 'target', 'design')).confirmed, false);
  assert.equal(existsSync(join(root, '.tiller/work/target/reviews/request-design/presentation.md')), true);
});

test('report acceptance requires a concrete document or delivery binding and rejects internal control evidence', async t => {
  const root = await setup(t); const binding = await work(root, 'review', 'review');
  await addWorkflowOutput(root, 'review', { operationId: 'report', expectedRevision: 1, outputId: 'report-output', source: ref('requirements.md') });
  await assert.rejects(requestConfirmation(root, 'review', request(binding, 'empty', 'acceptance')), /必须绑定/u);
  const accepted = request(binding, 'report', 'acceptance', { subjects: [ref('requirements.md'), ref('evidence.md')], documentBinding: { document: ref('requirements.md'), evidence: ref('evidence.md') } });
  assert.equal((await requestConfirmation(root, 'review', accepted)).status, 'pending');
  assert.equal((await recordDecision(root, 'review', decision(root, 'review', 'report', 'approve'))).confirmed, true);
  await assert.rejects(requestConfirmation(root, 'review', { ...accepted, requestId: 'internal', subjects: [ref('.tiller/workflow-policy/active.json')] }), /本机资料/u);
});

test('shared recursion context distinguishes work identities, rejects cycles and bounds depth while allowing diamonds', async t => {
  const root = fixture(t);
  await withConfirmationVisit(root, 'a', 'same', () => withConfirmationVisit(root, 'b', 'same', async () => true));
  await assert.rejects(withConfirmationVisit(root, 'a', 'one', () => withConfirmationVisit(root, 'b', 'two', () => withConfirmationVisit(root, 'a', 'one', async () => true))), /循环/u);
  await withConfirmationVisit(root, 'a', 'one', async () => {
    for (const branch of ['left', 'right']) await withConfirmationVisit(root, 'a', branch, () => withConfirmationVisit(root, 'a', 'leaf', async () => true));
  });
  const descend = depth => withConfirmationVisit(root, 'a', `depth-${depth}`, () => depth < CONFIRMATION_LIMITS.depth ? descend(depth + 1) : Promise.resolve());
  await assert.rejects(descend(0), /有界/u);
});


test('same gate on a different stage cannot satisfy a declared dependency', async t => {
  const root = await setup(t); await work(root, 'multiple');
  const path = '.tiller/work/multiple/record.json';
  const record = JSON.parse(readFileSync(join(root, path), 'utf8'));
  const definition = JSON.parse(readFileSync(join(root, record.workflow.path), 'utf8')).definition;
  const original = definition.stages.find(stage => stage.id === 'requirements');
  definition.stages.splice(1, 0, { ...original, id: 'other-requirements', produces: ['other-requirements-output'] });
  definition.outputs.push({ id: 'other-requirements-output', role: 'requirements', title: 'Additional requirements', producer: 'other-requirements' });
  definition.stages.find(stage => stage.id === 'design').dependsOn = ['requirements', 'other-requirements'];
  definition.stages.find(stage => stage.id === 'design').consumes.push('other-requirements-output');
  const fixed = createWorkflowSnapshot(definition);
  record.workflow.digest = fixed.digest;
  record.workflow.path = `.tiller/work/multiple/workflow/definitions/${fixed.digest}.json`;
  put(root, record.workflow.path, JSON.stringify(fixed)); put(root, path, JSON.stringify(record));
  put(root, 'other-requirements.md', '# Additional requirements\nSeparate intended object.\n');
  await addWorkflowOutput(root, 'multiple', { operationId: 'other-output', expectedRevision: 3, outputId: 'other-requirements-output', source: ref('other-requirements.md') });
  const context = await loadWorkflowPolicyContext(root, 'multiple');
  const binding = { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest };
  await requestConfirmation(root, 'multiple', request(binding, 'first'));
  await recordDecision(root, 'multiple', decision(root, 'multiple', 'first', 'first-approval'));
  await assert.rejects(requestConfirmation(root, 'multiple', request(binding, 'wrong-design', 'design', { upstream: ['first'] })), /流程上游/u);
  await requestConfirmation(root, 'multiple', request(binding, 'second', 'requirements', { workflowBinding: { ...binding, stageId: 'other-requirements' }, subjects: [ref('other-requirements.md')] }));
  await recordDecision(root, 'multiple', decision(root, 'multiple', 'second', 'second-approval'));
  assert.equal((await requestConfirmation(root, 'multiple', request(binding, 'correct-design', 'design', { upstream: ['first', 'second'] }))).status, 'pending');
});
