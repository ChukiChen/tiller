import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision, readConfirmation } from '../dist/confirmations.js';
import { inspectWorkflowStageExecution, inspectWorkflowStages } from '../dist/workflow-stages.js';
import { inspectWorkflowTransition, planWorkflowTransition, applyWorkflowTransition, parseWorkflowTransitionInput } from '../dist/workflow-transitions.js';
import { createWorkflowFixture, completeStage } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

const ref = path => ({ repository: '.', path });
const rawRecord = f => readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8');
const record = f => JSON.parse(rawRecord(f));
function nextIntent(value) {
  return { workflow: value.workflow.id, workflowVersion: value.workflow.version, goal: value.goal, reason: value.selectionReason,
    scope: value.scope, impact: value.impact, basis: value.basis.map(({ sha256, ...entry }) => entry),
    actionSources: value.actionSources.map(({ sha256, ...entry }) => entry), expectedOutputs: value.expectedOutputs,
    completionCriteria: value.completionCriteria, level: value.level };
}
async function transition(f, change = {}) {
  const current = await inspectWorkflowTransition(f.root, f.workId);
  return { operationId: `change-${++f.counter}`, expected: current.controlSnapshot, next: nextIntent(current.record),
    outputMappings: [], evidenceMappings: [], confirmationRefs: [], ...change };
}
async function approve(f, input, requestId = 'approve-change', extra = {}) {
  const plan = await planWorkflowTransition(f.root, f.workId, input);
  const context = await loadWorkflowPolicyContext(f.root, f.workId);
  const proposal = `${requestId}-proposal.json`;
  put(f.root, proposal, JSON.stringify({ changeDigest: plan.changeDigest, from: plan.from, to: plan.to,
    input, scope: plan.approvalScope, outputs: plan.outputMappings, evidence: plan.evidenceMappings }, null, 2));
  const requested = await requestConfirmation(f.root, f.workId, { requestId, gate: 'scope',
    scope: plan.approvalScope, subjects: [ref(proposal)], upstream: [], reviewSummary: 'Synthetic review of the exact future workflow and scope.',
    openIssues: [], nextAction: 'Apply only this explicit workflow conversion.',
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest },
    scopeBinding: { kind: 'workflow-transition', ownerWorkId: f.workId, changeDigest: plan.changeDigest }, ...extra });
  const source = `${requestId}-decision.md`; put(f.root, source, 'Approve this exact displayed workflow conversion.\n');
  await recordDecision(f.root, f.workId, { decisionId: `${requestId}-yes`, requestId, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: ref(source), quote: 'Approve this exact displayed workflow conversion.', presentation: ref(requested.presentation) },
    sourceReview: { reviewer: 'Synthetic test fixture', rationale: 'The synthetic decision matches the exact displayed proposal.', reviewedAt: new Date().toISOString() } });
  input.confirmationRefs = [{ workId: f.workId, requestId, decisionId: `${requestId}-yes` }];
  return plan;
}

test('workflow transitions: mapping preserves old revision and files without inheriting completion or approvals', async t => {
  const f = await createWorkflowFixture(t);
  put(f.root, 'conclusion.md', '# Observed fixture output\nA bounded analysis conclusion.\n');
  await addWorkflowOutput(f.root, f.workId, { operationId: 'report', expectedRevision: record(f).revision,
    outputId: 'report-output', source: ref('conclusion.md') });
  const before = rawRecord(f); const content = readFileSync(join(f.root, 'conclusion.md'), 'utf8');
  const input = await transition(f, { outputMappings: [{ from: 'report-output', to: 'report-output' }] });
  const preview = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(preview.requiresApproval, false); assert.equal(preview.operationAllowed, true);
  const result = await applyWorkflowTransition(f.root, f.workId, input, preview.planId);
  assert.equal(result.changed, true);
  assert.equal(readFileSync(join(f.root, result.archive), 'utf8'), before);
  assert.equal(readFileSync(join(f.root, 'conclusion.md'), 'utf8'), content);
  const current = record(f);
  assert.equal(current.workflowRevision, current.revision);
  assert.equal(current.artifacts['report-output'].origin, 'reference');
  assert.equal(current.artifacts['report-output'].status, 'draft');
  assert.deepEqual(current.links, []);
  assert.ok((await inspectWorkflowStages(f.root, f.workId)).stages.every(stage => !stage.technicalReady));
  const replay = await applyWorkflowTransition(f.root, f.workId, input, preview.planId);
  assert.equal(replay.historical, true); assert.equal(replay.currentValidity, 'not-evaluated'); assert.equal(replay.changed, false);
  await assert.rejects(planWorkflowTransition(f.root, f.workId, { ...input, outputMappings: [] }), /operationId/u);
});

test('workflow transitions: analysis to feature needs exact approval and cannot grant code execution', async t => {
  const f = await createWorkflowFixture(t);
  const initial = await completeStage(f, 'scope');
  const stageBytes = readFileSync(join(f.root, `.tiller/work/${f.workId}/stages/state.json`), 'utf8');
  const input = await transition(f);
  input.next = { ...input.next, workflow: 'feature', goal: 'Implement the explicitly reviewed new feature.',
    expectedOutputs: ['implementation-output'], impact: { ...input.next.impact, modifiesCode: true } };
  input.evidenceMappings = [{ reference: initial.evidenceRefs[0], sourceStageId: 'scope', targetStageId: 'requirements', checkIndex: 0 }];
  const blocked = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(blocked.operationAllowed, false); assert.equal(blocked.requiresApproval, true);
  assert.ok(blocked.newPermissions.includes('edit-code'));
  assert.equal(blocked.evidenceMappings[0].reusableAsCurrentEvidence, false);
  const before = rawRecord(f);
  await assert.rejects(applyWorkflowTransition(f.root, f.workId, input, blocked.planId), /scope/u);
  assert.equal(rawRecord(f), before);
  await approve(f, input);
  const approved = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(approved.operationAllowed, true, JSON.stringify(approved.blockingReasons));
  await applyWorkflowTransition(f.root, f.workId, input, approved.planId);
  assert.equal(readFileSync(join(f.root, `.tiller/work/${f.workId}/stages/state.json`), 'utf8'), stageBytes);
  const stages = await inspectWorkflowStages(f.root, f.workId);
  assert.ok(stages.stages.every(stage => !stage.technicalReady));
  assert.equal(stages.stages.some(stage => stage.stageId === 'scope'), false);
  await assert.rejects(inspectWorkflowStageExecution(f.root, f.workId, 'implementation'), { code: 'WORKFLOW_STAGE_START_REQUIRED' });
  assert.equal((await readConfirmation(f.root, input.confirmationRefs[0])).check.confirmed, false);
  const replay = await applyWorkflowTransition(f.root, f.workId, input, approved.planId);
  assert.equal(replay.historical, true, 'A historical receipt does not require old approval to authorize the new generation.');
});

test('workflow transitions: future scope is explicitly approved and a subset cannot cover expansion', async t => {
  const f = await createWorkflowFixture(t);
  const input = await transition(f);
  input.next.scope = { ...input.next.scope, targets: [...input.next.scope.targets, 'future-target'] };
  await approve(f, input, 'subset', { scope: f.scope });
  const subset = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(subset.operationAllowed, false);
  assert.match(subset.blockingReasons.join(' '), /范围/u);
  input.confirmationRefs = [];
  await approve(f, input, 'complete');
  const plan = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  await applyWorkflowTransition(f.root, f.workId, input, plan.planId);
  assert.ok(record(f).scope.targets.includes('future-target'));
});

test('workflow transitions: malformed mappings, current bytes and stale controls refuse without rewriting history', async t => {
  const f = await createWorkflowFixture(t);
  const input = await transition(f); const before = rawRecord(f);
  assert.throws(() => parseWorkflowTransitionInput({ ...input, outputMappings: [{ from: 'report-output', to: 'report-output' }, { from: 'report-output', to: 'report-output' }] }), /一一对应/u);
  assert.throws(() => parseWorkflowTransitionInput({ ...input, next: { ...input.next, expectedRevision: 0 } }), /创建操作/u);
  await assert.rejects(planWorkflowTransition(f.root, f.workId, { ...input, outputMappings: [{ from: 'report-output', to: 'report-output' }] }), /实际已登记/u);
  const plan = await planWorkflowTransition(f.root, f.workId, input);
  put(f.root, `.tiller/work/${f.workId}/record.json`, before + ' ');
  await assert.rejects(applyWorkflowTransition(f.root, f.workId, input, plan.planId), /控制字节/u);
  assert.equal(rawRecord(f), before + ' ');
  put(f.root, `.tiller/work/${f.workId}/record.json`, before);
  put(f.root, 'instruction.md', '# Changed source\nThe original authorization is no longer present.\n');
  const changed = await planWorkflowTransition(f.root, f.workId, input).catch(error => error);
  assert.ok(changed instanceof Error || !changed.operationAllowed);
  assert.equal(rawRecord(f), before);
});

test('workflow transitions: post-write approval source race restores owned bytes and preserves external change', async t => {
  const f = await createWorkflowFixture(t);
  const input = await transition(f); input.next.goal = 'A newly approved analysis goal.';
  await approve(f, input);
  const plan = await planWorkflowTransition(f.root, f.workId, input);
  const before = rawRecord(f); const target = join(f.root, `.tiller/work/${f.workId}/record.json`);
  const originalRename = fsPromises.rename; let changed = false;
  fsPromises.rename = async function (from, to) {
    const result = await originalRename.call(this, from, to);
    if (!changed && String(to) === target && record(f).workflowRevision > 1) {
      changed = true;
      put(f.root, 'approve-change-decision.md', 'External revocation changed the decision source.\n');
    }
    return result;
  };
  syncBuiltinESMExports();
  try { await assert.rejects(applyWorkflowTransition(f.root, f.workId, input, plan.planId), /批准|转换|来源/u); }
  finally { fsPromises.rename = originalRename; syncBuiltinESMExports(); }
  assert.equal(changed, true);
  assert.equal(rawRecord(f), before);
  assert.match(readFileSync(join(f.root, 'approve-change-decision.md'), 'utf8'), /External revocation/u);
  assert.equal(existsSync(join(f.root, `.tiller/work/${f.workId}/transitions/${input.operationId}/receipt.json`)), false);
});

test('workflow transitions: externally changed work retains its referenced archive and receipt', async t => {
  const f = await createWorkflowFixture(t); const before = rawRecord(f);
  const input = await transition(f); const plan = await planWorkflowTransition(f.root, f.workId, input);
  const target = join(f.root, `.tiller/work/${f.workId}/record.json`);
  const originalRename = fsPromises.rename; let changed = false;
  fsPromises.rename = async function (from, to) {
    const result = await originalRename.call(this, from, to);
    if (!changed && String(to) === target && record(f).workflowRevision > 1) {
      changed = true;
      put(f.root, `.tiller/work/${f.workId}/record.json`, JSON.stringify({ ...record(f), title: 'External writer content' }, null, 2) + '\n');
    }
    return result;
  };
  syncBuiltinESMExports();
  try { await assert.rejects(applyWorkflowTransition(f.root, f.workId, input, plan.planId), { code: 'CONTENT_CHANGED' }); }
  finally { fsPromises.rename = originalRename; syncBuiltinESMExports(); }
  assert.equal(changed, true); assert.equal(record(f).title, 'External writer content');
  const directory = join(f.root, `.tiller/work/${f.workId}/transitions/${input.operationId}`);
  assert.equal(readFileSync(join(directory, 'from-record.json'), 'utf8'), before);
  assert.equal(JSON.parse(readFileSync(join(directory, 'receipt.json'), 'utf8')).planId, plan.planId);
});
