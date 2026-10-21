import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBuiltinWorkflows } from '../dist/workflow-catalog.js';
import { planWorkflowRegistration, applyWorkflowRegistration, loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { createWorkflowFixture } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

test('workflow registration checks actual candidate and owner sources only at the write boundary', async t => {
  const f = await createWorkflowFixture(t);
  const definition = structuredClone((await loadBuiltinWorkflows()).find(item => item.id === 'analysis').definition);
  definition.id = 'project.audit';
  const candidatePath = `.tiller/workflows/${definition.id}@${definition.version}.json`;
  put(f.root, candidatePath, JSON.stringify(definition));
  const input = { operationId: 'register-shared', expectedRevision: 0, ownerWorkId: f.workId,
    candidate: { id: definition.id, version: definition.version }, baseline: { id: 'analysis', version: definition.version }, confirmationRefs: [] };
  const record = JSON.parse(readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8'));
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const ignore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  const plan = await planWorkflowRegistration(f.root, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  for (const path of [candidatePath, 'instruction.md', record.workflow.path]) {
    put(f.root, '.gitignore', `${ignore}\n/${path}\n`);
    try {
      assert.equal((await planWorkflowRegistration(f.root, input)).operationAllowed, true);
      await assert.rejects(applyWorkflowRegistration(f.root, input, plan.planId), error => error.message.includes(path));
      assert.equal(existsSync(join(f.root, '.tiller/workflow-policy/index.json')), false);
    } finally { put(f.root, '.gitignore', ignore); }
  }
  const activated = await applyWorkflowRegistration(f.root, input, plan.planId);
  assert.equal(activated.changed, true);
  definition.version = '2.0.0';
  put(f.root, `.tiller/workflows/${definition.id}@${definition.version}.json`, JSON.stringify(definition));
  const extension = { ...input, operationId: 'extend-shared', expectedRevision: 1,
    candidate: { id: definition.id, version: definition.version }, baseline: input.candidate };
  const extensionPlan = await planWorkflowRegistration(f.root, extension);
  assert.equal(extensionPlan.operationAllowed, true, JSON.stringify(extensionPlan.blockingReasons));
  const baselineReceipt = `.tiller/workflow-policy/receipts/${activated.receiptId}.json`;
  put(f.root, '.gitignore', `${ignore}\n/${baselineReceipt}\n`);
  try {
    assert.equal((await planWorkflowRegistration(f.root, extension)).operationAllowed, true);
    await assert.rejects(applyWorkflowRegistration(f.root, extension, extensionPlan.planId), error => error.message.includes(baselineReceipt));
  } finally { put(f.root, '.gitignore', ignore); }
  assert.equal((await applyWorkflowRegistration(f.root, extension, extensionPlan.planId)).changed, true);
});

test('workflow registration rejects ignored approval sources and presentations at commit', async t => {
  const f = await createWorkflowFixture(t);
  const definition = structuredClone((await loadBuiltinWorkflows()).find(item => item.id === 'analysis').definition);
  definition.id = 'project.expanded'; definition.stages[0].actions.push('edit-code');
  put(f.root, `.tiller/workflows/${definition.id}@${definition.version}.json`, JSON.stringify(definition));
  const input = { operationId: 'register-approved', expectedRevision: 0, ownerWorkId: f.workId,
    candidate: { id: definition.id, version: definition.version }, baseline: { id: 'analysis', version: definition.version }, confirmationRefs: [] };
  const proposal = await planWorkflowRegistration(f.root, input);
  assert.equal(proposal.operationAllowed, false);
  const context = await loadWorkflowPolicyContext(f.root, f.workId);
  const requested = await requestConfirmation(f.root, f.workId, { requestId: 'extension', gate: 'scope', scope: f.scope,
    subjects: [{ repository: '.', path: 'instruction.md' }], upstream: [], reviewSummary: 'Synthetic review of the exact extension.',
    openIssues: [], nextAction: 'Register only this extension.',
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest },
    scopeBinding: { kind: 'workflow-extension', ownerWorkId: f.workId, changeDigest: proposal.changeDigest } });
  put(f.root, 'extension-decision.md', 'Approve this exact presented extension.\n');
  await recordDecision(f.root, f.workId, { decisionId: 'extension-yes', requestId: 'extension', outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: { repository: '.', path: 'extension-decision.md' }, quote: 'Approve this exact presented extension.',
      presentation: { repository: '.', path: requested.presentation } },
    sourceReview: { reviewer: 'Synthetic fixture', rationale: 'Exact displayed extension approved in this fixture.', reviewedAt: new Date().toISOString() } });
  input.confirmationRefs = [{ workId: f.workId, requestId: 'extension', decisionId: 'extension-yes' }];
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const ignore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  const plan = await planWorkflowRegistration(f.root, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  for (const path of ['extension-decision.md', requested.presentation, `.tiller/work/${f.workId}/confirmations.json`]) {
    put(f.root, '.gitignore', `${ignore}\n/${path}\n`);
    try {
      assert.equal((await planWorkflowRegistration(f.root, input)).operationAllowed, true);
      await assert.rejects(applyWorkflowRegistration(f.root, input, plan.planId), error => error.message.includes(path));
      assert.equal(existsSync(join(f.root, '.tiller/workflow-policy/index.json')), false);
    } finally { put(f.root, '.gitignore', ignore); }
  }
});
