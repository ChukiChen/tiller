import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initialize } from '../dist/core.js';
import { readWorkReference, resumeWork, workReferenceLink } from '../dist/work.js';
import { requestConfirmation, recordDecision, checkGate, checkMergeGate } from '../dist/confirmations.js';
import { inspectWork } from '../dist/work-history.js';
import { runWithDeliveryBinding } from '../dist/delivery-location.js';
import { fixture, gitRepository, put } from './helpers.mjs';
import { createWorkflowFixtureAt } from './workflow-fixtures.mjs';
import { seedApprovedDevelopment } from './planning-helpers.mjs';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';

const id = 'repository-layout';
const directory = `.tiller/work/${id}`;
const scope = { repositories: ['.', 'service-a'], targets: ['student-service'] };
const ref = (path, repository = 'service-a') => ({ repository, path });
const text = (root, path) => readFileSync(join(root, path), 'utf8');
async function setup(t, nested = true, approved = false) {
  const root = fixture(t);
  const repository = gitRepository(root, nested ? 'repositories/service-a' : 'service-a');
  await initialize({ root, mode: 'workspace', repositories: [nested ? 'repositories/service-a' : 'service-a'] });
  put(repository, 'docs/requirements.md', '# Requirements\r\n\r\nStudent identifiers are unique.\r\n');
  put(repository, 'docs/design.md', '# Design\n\nValidate identifiers before insertion.\n');
  put(repository, 'docs/checks.md', '# Checks\n\nDuplicate identifiers rejected.\n');
  if (approved) {
    await seedApprovedDevelopment(root, id, { scope, requirementsSource: ref('docs/requirements.md'), designSource: ref('docs/design.md'),
      requirementsText: text(repository, 'docs/requirements.md'), designText: text(repository, 'docs/design.md') });
  } else {
    await createWorkflowFixtureAt(root, id, 'feature', { scope });
    await addWorkflowOutput(root, id, { operationId: 'reference-requirements', expectedRevision: 1, outputId: 'requirements-output', source: ref('docs/requirements.md') });
  }
  return { root, repository };
}
async function approve(root, requestId, gate, subjects, upstream = [], extra = {}) {
  const context = await loadWorkflowPolicyContext(root, id);
  const requested = await requestConfirmation(root, id, {
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest, ...(['requirements', 'design'].includes(gate) ? { stageId: gate } : {}) },
    requestId, gate, scope, subjects, upstream, reviewSummary: 'Synthetic review only.',
    openIssues: [], nextAction: 'Verify this fixture.', ...extra,
  });
  const source = `${directory}/source-${requestId}.md`;
  put(root, source, '# Synthetic source\nApprove this fixture only.\n');
  await recordDecision(root, id, {
    decisionId: `approve-${requestId}`, requestId, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: ref(source, '.'), quote: 'Approve this fixture only.', presentation: ref(requested.presentation, '.') },
    sourceReview: { reviewer: 'fixture-reviewer', rationale: 'Synthetic scoped source, not real approval.', reviewedAt: '2026-10-16T00:00:00.000Z' },
  });
}

test('nested repository work preserves stable references, links, and approved output source bytes', async t => {
  const { root, repository } = await setup(t, true, true);
  const notes = text(root, `${directory}/work.md`);
  const link = await workReferenceLink(root, id, ref('docs/requirements.md'));
  assert.equal(resolve(root, directory, link), join(repository, 'docs/requirements.md'));
  assert.equal(await readWorkReference(root, ref('docs/requirements.md')), text(repository, 'docs/requirements.md'));
  const registryBefore = JSON.parse(text(root, `${directory}/confirmations.json`));
  const snapshot = registryBefore.requests[0].files[0].snapshot;
  const snapshotBefore = readFileSync(join(root, snapshot));
  assert.deepEqual(Buffer.from(JSON.parse(snapshotBefore.toString('utf8')).content, 'utf8'), readFileSync(join(repository, 'docs/requirements.md')));
  const record = JSON.parse(text(root, `${directory}/record.json`));
  assert.deepEqual(record.artifacts['requirements-output'].source, ref('docs/requirements.md'));
  assert.deepEqual(record.artifacts['design-output'].source, ref('docs/design.md'));
  assert.deepEqual(record.scope, scope);
  assert.equal(text(root, `${directory}/work.md`), notes);
  assert.deepEqual(readFileSync(join(root, snapshot)), snapshotBefore);
  assert.equal((await checkGate(root, id, 'requirements')).confirmed, true);
  assert.equal((await resumeWork(root, id)).id, id);
  put(repository, 'docs/requirements.md', '# Requirements\n\nIdentifiers may repeat.\n');
  assert.equal((await checkGate(root, id, 'requirements')).confirmed, false);
});

test('management references cannot bypass mapped or reserved repository boundaries', async t => {
  const { root } = await setup(t);
  const context = await loadWorkflowPolicyContext(root, id);
  put(root, 'repositories/unregistered/requirements.md', '# Unregistered\nMust not be shared management evidence.\n');
  for (const path of ['repositories/service-a/docs/requirements.md', 'REPOSITORIES/SERVICE-A/docs/requirements.md', 'repositories/unregistered/requirements.md']) {
    await assert.rejects(readWorkReference(root, ref(path, '.')), error => error.code === 'INVALID_WORK_REFERENCE');
    await assert.rejects(addWorkflowOutput(root, id, { operationId: 'bad-reference', expectedRevision: 2, outputId: 'design-output', source: ref(path, '.') }), /稳定仓库标识/u);
    await assert.rejects(requestConfirmation(root, id, {
      workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest, stageId: 'requirements' },
      requestId: 'bypass', gate: 'requirements', scope,
      subjects: [ref('docs/requirements.md'), ref(path, '.')], upstream: [], reviewSummary: 'Alias attempt.', openIssues: [], nextAction: 'Reject.',
    }), /仓库身份/u);
  }
  await assert.rejects(readWorkReference(root, ref('docs/requirements.md', 'repositories/service-a')), /未登记/u);
});

test('historical files remain intact and may be referenced by a newly created work', async t => {
  const { root, repository } = await setup(t);
  const entry = '.tiller/work/history/README.md';
  const original = '# Original history\r\nKeep exact source bytes.\r\n';
  put(root, entry, original);
  assert.equal((await inspectWork(root, 'history')).ready, false);
  await createWorkflowFixtureAt(root, 'new-history-reference', 'feature', { scope });
  await addWorkflowOutput(root, 'new-history-reference', { operationId: 'reference-requirements', expectedRevision: 1, outputId: 'requirements-output', source: ref('docs/requirements.md') });
  assert.equal(text(root, entry), original);
  const link = await workReferenceLink(root, 'new-history-reference', ref('docs/requirements.md'));
  assert.equal(resolve(root, '.tiller/work/new-history-reference', link), join(repository, 'docs/requirements.md'));
  assert.equal(JSON.parse(text(root, '.tiller/work/new-history-reference/record.json')).schemaVersion, 4);
});

test('merge evidence uses stable repository identity with nested paths', async t => {
  const { root } = await setup(t, true, true);
  const binding = {
    documentsVersion: 'd'.repeat(64), repositories: [{
      repository: 'service-a', review: { provider: 'github', id: '42', url: 'https://example.invalid/owner/service-a/pull/42' },
      sourceOid: 'a'.repeat(40), targetBranch: 'main', targetOid: 'b'.repeat(40), dependencies: [],
      checks: { version: 'checks-1', evidence: [ref('docs/checks.md')] },
    }],
  };
  await approve(root, 'merge', 'merge', [ref('docs/checks.md')], ['design'], { mergeBinding: binding });
  assert.equal((await checkMergeGate(root, id, 'merge', binding)).confirmed, true);
  const stored = JSON.parse(text(root, `${directory}/confirmations.json`)).requests.find(request => request.requestId === 'merge');
  assert.deepEqual(stored.files.map(file => ref(file.path, file.repository)), [ref('docs/checks.md')]);
  assert.deepEqual(stored.mergeBinding, binding);
});

test('current direct repository paths use explicit mappings and retain source identity', async t => {
  const { root, repository } = await setup(t, false);
  const metadata = JSON.parse(text(root, '.tiller/project.json'));
  assert.deepEqual(metadata.repositoryPaths, { 'service-a': 'service-a' });
  const recordBefore = text(root, `${directory}/record.json`);
  assert.equal(await readWorkReference(root, ref('docs/requirements.md')), text(repository, 'docs/requirements.md'));
  assert.equal(text(root, `${directory}/record.json`), recordBefore);
  assert.equal(await workReferenceLink(root, id, ref('docs/requirements.md')), '../../../service-a/docs/requirements.md');
  await assert.rejects(readWorkReference(root, ref('service-a/docs/requirements.md', '.')), /仓库身份/u);
});

test('active management navigation points to sibling business worktrees', async t => {
  const { root } = await setup(t);
  const recordRoot = join(root, '.tiller/local/worktrees/feature/management');
  const businessRoot = join(root, '.tiller/local/worktrees/feature/repositories/service-a');
  const location = { anchorRoot: root, recordRoot, workId: id, bindings: { 'service-a': { root: businessRoot } } };
  // The resolver's validated binding is injected; environment tests cover its Git identity validation.
  const link = await runWithDeliveryBinding(location, () => workReferenceLink(recordRoot, id, ref('docs/design.md')));
  assert.equal(link, '../../../../repositories/service-a/docs/design.md');
  assert.equal(resolve(recordRoot, directory, link), join(businessRoot, 'docs/design.md'));
});
