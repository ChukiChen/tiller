import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWork, addWork, readWorkReference, resumeWork, workReferenceLink } from '../dist/work.js';
import { requestConfirmation, recordDecision, checkGate, checkMergeGate } from '../dist/confirmations.js';
import { planWorkAdoption, applyWorkAdoption } from '../dist/work-history.js';
import { runWithDeliveryBinding } from '../dist/delivery-location.js';
import { fixture, gitRepository, put } from './helpers.mjs';

const id = 'repository-layout';
const directory = `.tiller/work/${id}`;
const scope = { repositories: ['service-a'], targets: ['student-service'] };
const ref = (path, repository = 'service-a') => ({ repository, path });
const text = (root, path) => readFileSync(join(root, path), 'utf8');
async function setup(t, nested = true) {
  const root = fixture(t);
  const repository = gitRepository(root, nested ? 'repositories/service-a' : 'service-a');
  await initialize({ root, mode: 'workspace', repositories: [nested ? 'repositories/service-a' : 'service-a'] });
  put(repository, 'docs/requirements.md', '# Requirements\r\n\r\nStudent identifiers are unique.\r\n');
  put(repository, 'docs/design.md', '# Design\n\nValidate identifiers before insertion.\n');
  put(repository, 'docs/checks.md', '# Checks\n\nDuplicate identifiers rejected.\n');
  await createWork(root, id, 'Repository layout', { type: 'change-requirements', scope, source: ref('docs/requirements.md') });
  return { root, repository };
}
async function approve(root, requestId, gate, subjects, upstream = [], extra = {}) {
  const requested = await requestConfirmation(root, id, {
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

test('nested repository work preserves stable references, resolves links, and adds design after confirmation', async t => {
  const { root, repository } = await setup(t);
  const notes = text(root, `${directory}/work.md`);
  const link = notes.match(/\[requirements\]\(<([^>]+)>\)/)[1];
  assert.equal(resolve(root, directory, link), join(repository, 'docs/requirements.md'));
  assert.equal(await readWorkReference(root, ref('docs/requirements.md')), text(repository, 'docs/requirements.md'));
  await approve(root, 'requirements', 'requirements', [ref('docs/requirements.md')]);
  const registryBefore = JSON.parse(text(root, `${directory}/confirmations.json`));
  const snapshot = registryBefore.requests[0].files[0].snapshot;
  const snapshotBefore = readFileSync(join(root, snapshot));
  assert.deepEqual(Buffer.from(JSON.parse(snapshotBefore.toString('utf8')).content, 'utf8'), readFileSync(join(repository, 'docs/requirements.md')));
  await addWork(root, id, { type: 'change-design', source: ref('docs/design.md'), requirementsBasis: { workId: id, requestId: 'requirements' } });
  const record = JSON.parse(text(root, `${directory}/record.json`));
  assert.deepEqual(record.artifacts.requirements.source, ref('docs/requirements.md'));
  assert.deepEqual(record.artifacts.design.source, ref('docs/design.md'));
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
  put(root, 'repositories/unregistered/requirements.md', '# Unregistered\nMust not be shared management evidence.\n');
  for (const path of ['repositories/service-a/docs/requirements.md', 'REPOSITORIES/SERVICE-A/docs/requirements.md', 'repositories/unregistered/requirements.md']) {
    await assert.rejects(readWorkReference(root, ref(path, '.')), error => error.code === 'INVALID_WORK_REFERENCE');
    await assert.rejects(createWork(root, 'bad-reference', 'Bad', { type: 'change-requirements', source: ref(path, '.') }), /仓库身份/u);
    await assert.rejects(requestConfirmation(root, id, {
      requestId: 'bypass', gate: 'requirements', scope: { repositories: ['.'], targets: scope.targets },
      subjects: [ref(path, '.')], upstream: [], reviewSummary: 'Alias attempt.', openIssues: [], nextAction: 'Reject.',
    }), /仓库身份/u);
  }
  await assert.rejects(readWorkReference(root, ref('docs/requirements.md', 'repositories/service-a')), /未登记/u);
});

test('nested repository historical adoption keeps originals and builds actual-path navigation', async t => {
  const { root, repository } = await setup(t);
  const entry = '.tiller/work/history/README.md';
  const original = '# Original history\r\nKeep exact source bytes.\r\n';
  put(root, entry, original);
  const input = {
    title: 'Historical repository requirements', level: 'change', scope,
    entry: ref(entry, '.'), artifacts: { requirements: { type: 'change-requirements', source: ref('docs/requirements.md') } },
  };
  const plan = await planWorkAdoption(root, 'history', input);
  assert.equal(plan.ready, true);
  await applyWorkAdoption(root, 'history', input, plan.planId);
  assert.equal(text(root, entry), original);
  const notes = text(root, '.tiller/work/history/work.md');
  const link = notes.match(/\[requirements\]\(<([^>]+)>\)/)[1];
  assert.equal(resolve(root, '.tiller/work/history', link), join(repository, 'docs/requirements.md'));
  assert.deepEqual(JSON.parse(text(root, '.tiller/work/history/record.json')).artifacts.requirements.source, ref('docs/requirements.md'));
  const bad = structuredClone(input);
  bad.scope.repositories = ['.'];
  bad.artifacts.requirements.source = ref('repositories/service-a/docs/requirements.md', '.');
  await assert.rejects(planWorkAdoption(root, 'history', bad), /仓库身份/u);
});

test('merge evidence uses stable repository identity with nested paths', async t => {
  const { root } = await setup(t);
  await approve(root, 'requirements', 'requirements', [ref('docs/requirements.md')]);
  await approve(root, 'design', 'design', [ref('docs/design.md')], ['requirements']);
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

test('legacy direct repository references and existing snapshots remain readable without a path map', async t => {
  const { root, repository } = await setup(t, false);
  await approve(root, 'requirements', 'requirements', [ref('docs/requirements.md')]);
  const registryBefore = text(root, `${directory}/confirmations.json`);
  const metadata = JSON.parse(text(root, '.tiller/project.json'));
  metadata.resourceVersion = '0.3.0';
  for (const relative of ['.tiller/usage.md', '.tiller/run.cjs']) {
    delete metadata.managedFiles[relative];
    unlinkSync(join(root, relative));
  }
  delete metadata.repositoryPaths;
  put(root, '.tiller/project.json', JSON.stringify(metadata));
  assert.equal(await readWorkReference(root, ref('docs/requirements.md')), text(repository, 'docs/requirements.md'));
  assert.equal((await checkGate(root, id, 'requirements')).confirmed, true);
  assert.equal(text(root, `${directory}/confirmations.json`), registryBefore);
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
