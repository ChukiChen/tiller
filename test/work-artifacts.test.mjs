import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWork, addWork, bindWork, resumeWork, checkWork, completeWork, parseWorkRecord } from '../dist/work.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { fixture, put, snapshot, gitRepository } from './helpers.mjs';

const ref = path => ({ repository: '.', path });
const doc = (id, role = 'requirements') => `.tiller/work/${id}/${role}.md`;
const record = (root, id) => JSON.parse(readFileSync(join(root, `.tiller/work/${id}/record.json`), 'utf8'));
async function approve(root, id, subjects, requestId = 'req-1', gate = 'requirements', scope = { repositories: ['.'], targets: [id] }) {
  const presentation = await requestConfirmation(root, id, { requestId, gate, scope, subjects, upstream: [], reviewSummary: 'Synthetic scoped review', openIssues: [], nextAction: 'Use only this reviewed artifact' });
  const source = `.tiller/work/${id}/${requestId}-source.md`;
  put(root, source, '# Synthetic input\nApprove this exact request.\n');
  await recordDecision(root, id, { decisionId: `${requestId}-yes`, requestId, outcome: 'approved', conditions: [], source: { kind: 'conversation', reference: ref(source), quote: 'Approve this exact request.', presentation: ref(presentation.presentation) }, sourceReview: { reviewer: 'test-reviewer', rationale: 'Matched the synthetic source and scope.', reviewedAt: new Date().toISOString() } });
}
async function draft(root, id = 'feature') {
  await initialize({ root });
  await createWork(root, id, 'Feature', 'change-requirements');
  put(root, doc(id), '# Requirements\nProvide a unique student identifier.\n');
}

test('schema3 adds design to the same work after matching requirements approval, preserving original content', async t => {
  const root = fixture(t); await draft(root);
  const before = snapshot(root);
  await assert.rejects(addWork(root, 'feature', 'change-design'), /需求/);
  assert.deepEqual(snapshot(root), before);
  await approve(root, 'feature', [ref(doc('feature'))]);
  const notes = readFileSync(join(root, '.tiller/work/feature/work.md'), 'utf8');
  const result = await addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'req-1' });
  assert.equal(result.changed, true);
  assert.equal(record(root, 'feature').schemaVersion, 3);
  assert.deepEqual(Object.keys(record(root, 'feature').artifacts), ['requirements', 'design']);
  assert.equal(readFileSync(join(root, '.tiller/work/feature/work.md'), 'utf8'), notes);
  assert.equal(readFileSync(join(root, doc('feature')), 'utf8'), '# Requirements\nProvide a unique student identifier.\n');
  const after = snapshot(root);
  assert.equal((await addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'req-1' })).changed, false);
  assert.deepEqual(snapshot(root), after);
  put(root, doc('feature'), '# Requirements\nIdentifiers may repeat.\n');
  await assert.rejects(addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'req-1' }), /确认/);
  assert.equal((await checkWork(root, 'feature')).ready, false);
});

test('design rejects approved unrelated subjects or insufficient scope without mutation', async t => {
  const root = fixture(t); await draft(root);
  put(root, 'other.md', '# Other\nUnrelated requirements.\n');
  await approve(root, 'feature', [ref('other.md')], 'wrong-subject');
  await approve(root, 'feature', [ref(doc('feature'))], 'wrong-scope', 'requirements', { repositories: ['.'], targets: ['other'] });
  const before = snapshot(root);
  await assert.rejects(addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'wrong-subject' }), /需求产物/);
  await assert.rejects(addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'wrong-scope' }), /范围/);
  assert.deepEqual(snapshot(root), before);
});

test('create and add reference existing shared specifications without copies and reject conflicting aliases', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, '.tiller/specs/existing.md', '# Existing requirements\nUse the existing requirements.\n');
  const source = ref('.tiller/specs/existing.md');
  await createWork(root, 'reuse', 'Reuse', { type: 'module-requirements', source });
  assert.equal(existsSync(join(root, doc('reuse'))), false);
  assert.equal(record(root, 'reuse').artifacts.requirements.origin, 'reference');
  const before = snapshot(root);
  assert.equal((await addWork(root, 'reuse', { type: 'module-requirements', source })).changed, false);
  await assert.rejects(addWork(root, 'reuse', 'product-requirements'), /层级/);
  await assert.rejects(addWork(root, 'reuse', { type: 'module-requirements', source: ref('other.md') }), /不同/);
  await assert.rejects(addWork(root, 'reuse', { type: 'module-requirements', source, scope: { repositories: ['.'], targets: ['different'] } }), /范围/);
  assert.deepEqual(snapshot(root), before);
  await approve(root, 'reuse', [source]);
  await assert.rejects(addWork(root, 'reuse', { type: 'module-design', source, requirementsBasis: { workId: 'reuse', requestId: 'req-1' } }), /同一/);
});

test('creation supports explicit scope for generated documents and direct design inherits approved scope', async t => {
  const root = fixture(t); await initialize({ root });
  const scope = { repositories: ['.'], targets: ['student-service'] };
  await createWork(root, 'req', 'Req', { type: 'module-requirements', scope });
  put(root, doc('req'), '# Requirements\nManage students.\n');
  await approve(root, 'req', [ref(doc('req'))], 'req-1', 'requirements', scope);
  const result = await createWork(root, 'design', 'Design', 'module-design', { workId: 'req', requestId: 'req-1' });
  assert.deepEqual(result.scope, scope);
  assert.deepEqual(record(root, 'design').scope, scope);
});

test('cross-repository references require explicit identity, registered repositories and scope', async t => {
  const root = fixture(t); gitRepository(root, 'repo-a');
  await initialize({ root, mode: 'workspace', repositories: ['repo-a'] });
  put(root, 'repo-a/requirements.md', '# Requirements\nA shared repository specification.\n');
  const source = { repository: 'repo-a', path: 'requirements.md' };
  await assert.rejects(createWork(root, 'wrong', 'Wrong', { type: 'product-requirements', source }), /范围/);
  await assert.rejects(createWork(root, 'alias', 'Alias', { type: 'product-requirements', source: ref('repo-a/requirements.md') }), /身份/);
  await createWork(root, 'cross', 'Cross', { type: 'product-requirements', source, scope: { repositories: ['.', 'repo-a'], targets: ['cross'] } });
  assert.equal((await resumeWork(root, 'cross')).content, '# Requirements\nA shared repository specification.\n');
  assert.equal(existsSync(join(root, doc('cross'))), false);
  const evidence = '.tiller/work/cross/review.md'; put(root, evidence, '# Review\nReviewed the exact external requirement.\n');
  await approve(root, 'cross', [source, ref(evidence)], 'accept-cross', 'acceptance', { repositories: ['.', 'repo-a'], targets: ['cross'] });
  await completeWork(root, 'cross', evidence, 'accept-cross');
  assert.equal((await checkWork(root, 'cross')).ready, true);
});

test('completion chooses an artifact, preserves the other draft and never reports whole work complete', async t => {
  const root = fixture(t); await draft(root);
  await approve(root, 'feature', [ref(doc('feature'))]);
  await addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'req-1' });
  const evidence = '.tiller/work/feature/review.md'; put(root, evidence, '# Review\nRequirement delivery checked.\n');
  await approve(root, 'feature', [ref(doc('feature')), ref(evidence)], 'accept-req', 'acceptance');
  await assert.rejects(completeWork(root, 'feature', evidence, 'accept-req'), /artifact/);
  await completeWork(root, 'feature', evidence, 'accept-req', 'requirements');
  const current = record(root, 'feature');
  assert.equal(current.artifacts.requirements.status, 'complete');
  assert.equal(current.artifacts.design.status, 'draft');
  const resumed = await resumeWork(root, 'feature');
  assert.equal(resumed.status, 'active');
  assert.equal(resumed.artifacts.requirements.acceptanceStatus, 'reported-review');
  assert.equal(resumed.ready, false);
  const before = snapshot(root);
  assert.equal((await completeWork(root, 'feature', evidence, 'accept-req', 'requirements')).changed, false);
  assert.deepEqual(snapshot(root), before);
});

test('binding imported design requires current requirements, keeps history and invalidates earlier completion', async t => {
  const root = fixture(t); await draft(root);
  await approve(root, 'feature', [ref(doc('feature'))]);
  await addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'req-1' });
  put(root, doc('feature', 'design'), '# Design\nUse a map keyed by identifier.\n');
  const evidence = '.tiller/work/feature/design-review.md'; put(root, evidence, '# Review\nDesign draft review complete.\n');
  await approve(root, 'feature', [ref(doc('feature', 'design')), ref(evidence)], 'accept-design', 'acceptance');
  await completeWork(root, 'feature', evidence, 'accept-design', 'design');
  const oldCompletion = record(root, 'feature').artifacts.design.completion;
  await approve(root, 'feature', [ref(doc('feature'))], 'req-2');
  const body = readFileSync(join(root, doc('feature', 'design')), 'utf8');
  await bindWork(root, 'feature', 'design', { workId: 'feature', requestId: 'req-2' });
  const design = record(root, 'feature').artifacts.design;
  assert.equal(design.status, 'draft'); assert.equal(design.completion, undefined);
  assert.deepEqual(design.completionHistory, [oldCompletion]);
  assert.deepEqual(design.requirementsBasisHistory[0].before, { workId: 'feature', requestId: 'req-1' });
  assert.equal(readFileSync(join(root, doc('feature', 'design')), 'utf8'), body);
  await assert.rejects(completeWork(root, 'feature', evidence, 'accept-design', 'design'), /旧验收/);
  const before = snapshot(root);
  assert.equal((await bindWork(root, 'feature', 'design', { workId: 'feature', requestId: 'req-2' })).changed, false);
  assert.deepEqual(snapshot(root), before);
});

for (const schemaVersion of [1, 2]) {
  test(`schema ${schemaVersion} rejects reads and mutations without changing historical files`, async t => {
    const root = fixture(t); await draft(root);
    const old = schemaVersion === 1
      ? { schemaVersion, id: 'feature', title: 'Feature', type: 'change-requirements', document: doc('feature'), createdAt: new Date().toISOString(), status: 'draft' }
      : { ...record(root, 'feature'), schemaVersion };
    put(root, '.tiller/work/feature/record.json', JSON.stringify(old));
    const before = snapshot(root);
    const unsupported = error => error.code === 'UNSUPPORTED_RECORD_VERSION' && error.message.includes('work create');
    await assert.rejects(resumeWork(root, 'feature'), unsupported);
    assert.equal((await checkWork(root, 'feature')).ready, false);
    await assert.rejects(addWork(root, 'feature', 'change-requirements'), unsupported);
    await assert.rejects(bindWork(root, 'feature', 'design', { workId: 'feature', requestId: 'req-1' }), unsupported);
    await assert.rejects(completeWork(root, 'feature', 'review.md'), unsupported);
    assert.deepEqual(snapshot(root), before);
  });
}

test('reference inputs reject private paths, process-entry artifacts and unsupported self-declared states', async t => {
  const root = fixture(t); await initialize({ root });
  for (const source of [ref('../outside.md'), ref('.tiller/local/a.md'), ref('.git/a.md'), { repository: '../outside', path: 'a.md' }]) {
    await assert.rejects(createWork(root, 'bad', 'Bad', { type: 'product-requirements', source }));
  }
  await assert.rejects(createWork(root, 'bad', 'Bad', { type: 'product-requirements', approved: true }), /不支持/);
  put(root, '.tiller/work/other/work.md', '# Process\nProcess notes.\n');
  await assert.rejects(createWork(root, 'bad', 'Bad', { type: 'product-requirements', source: ref('.tiller/work/other/work.md') }), /入口/);
  assert.equal(existsSync(join(root, '.tiller/work/bad/record.json')), false);
});

test('create refuses an unregistered existing directory instead of silently adopting README notes', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, '.tiller/work/notes/README.md', '# Existing notes\nKeep the original content.\n');
  const before = snapshot(root);
  await assert.rejects(createWork(root, 'notes', 'Notes'), error => error.code === 'WORK_EXISTS');
  assert.deepEqual(snapshot(root), before);
});

test('work check reports actionable structural gaps for unregistered README-only work', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, '.tiller/work/notes/README.md', '# Notes\nRetain this handwritten content.\n');
  const before = snapshot(root); const result = await checkWork(root, 'notes');
  assert.equal(result.ready, false); assert.equal(result.registration, 'unregistered');
  assert.match(result.issues.join(' '), /work.md/); assert.match(result.issues.join(' '), /record.json/);
  assert.deepEqual(snapshot(root), before);
});

test('completion and resume reject approval of matching files under an unrelated scope', async t => {
  const root = fixture(t); await draft(root);
  const evidence = '.tiller/work/feature/review.md'; put(root, evidence, '# Review\nReviewed the requirement.\n');
  await approve(root, 'feature', [ref(doc('feature')), ref(evidence)], 'wrong-accept', 'acceptance', { repositories: ['.'], targets: ['other'] });
  const before = snapshot(root);
  await assert.rejects(completeWork(root, 'feature', evidence, 'wrong-accept'), /范围/);
  assert.deepEqual(snapshot(root), before);
  await approve(root, 'feature', [ref(doc('feature')), ref(evidence)], 'correct-accept', 'acceptance');
  await completeWork(root, 'feature', evidence, 'correct-accept');
  const current = record(root, 'feature'); current.scope.targets = ['expanded-target'];
  put(root, '.tiller/work/feature/record.json', JSON.stringify(current));
  const resumed = await resumeWork(root, 'feature');
  assert.equal(resumed.ready, false); assert.equal(resumed.status, 'stale');
  assert.match(resumed.issues.join(' '), /范围/);
});

test('new work references old specification text with fresh approval and no inherited state', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, '.tiller/work/history/README.md', '# Old notes\nOriginal process record.\n');
  put(root, '.tiller/specs/old-requirements.md', '# Requirements\nManage student identifiers.\n');
  put(root, '.tiller/specs/old-design.md', '# Design\nUse an identifier map.\n');
  const originals = snapshot(root);
  const source = ref('.tiller/specs/old-requirements.md');
  await createWork(root, 'fresh', 'Fresh', { type: 'change-requirements', source });
  const designInput = { type: 'change-design', source: ref('.tiller/specs/old-design.md'), requirementsBasis: { workId: 'fresh', requestId: 'req-1' } };
  await assert.rejects(addWork(root, 'fresh', designInput), /确认|不存在/);
  await approve(root, 'fresh', [source]);
  await addWork(root, 'fresh', designInput);
  assert.equal((await resumeWork(root, 'fresh')).ready, true);
  assert.equal(record(root, 'fresh').artifacts.design.status, 'draft');
  assert.equal(record(root, 'fresh').artifacts.design.completion, undefined);
  for (const [file, contents] of Object.entries(originals)) assert.equal(snapshot(root)[file], contents);
});

test('current records reject unknown fields at every nested record boundary', async t => {
  const root = fixture(t); await draft(root);
  await approve(root, 'feature', [ref(doc('feature'))]);
  await addWork(root, 'feature', 'change-design', { workId: 'feature', requestId: 'req-1' });
  put(root, doc('feature', 'design'), '# Design\nUse a map.\n');
  const evidence = '.tiller/work/feature/review.md'; put(root, evidence, '# Review\nReviewed design.\n');
  await approve(root, 'feature', [ref(doc('feature', 'design')), ref(evidence)], 'accept-design', 'acceptance');
  await completeWork(root, 'feature', evidence, 'accept-design', 'design');
  await approve(root, 'feature', [ref(doc('feature'))], 'req-2');
  await bindWork(root, 'feature', 'design', { workId: 'feature', requestId: 'req-2' });
  const valid = record(root, 'feature');
  for (const select of [
    value => value, value => value.scope, value => value.artifacts,
    value => value.artifacts.design, value => value.artifacts.design.source,
    value => value.artifacts.design.requirementsBasis,
    value => value.artifacts.design.requirementsBasisHistory[0],
    value => value.artifacts.design.requirementsBasisHistory[0].before,
    value => value.artifacts.design.requirementsBasisHistory[0].after,
    value => value.artifacts.design.completionHistory[0],
    value => value.artifacts.design.completionHistory[0].confirmation,
  ]) {
    const invalid = structuredClone(valid); select(invalid).unrecognized = true;
    assert.throws(() => parseWorkRecord(JSON.stringify(invalid), 'feature'), /不支持|只支持/);
  }
  const missingApproval = structuredClone(valid);
  delete missingApproval.artifacts.design.completionHistory[0].confirmation;
  assert.throws(() => parseWorkRecord(JSON.stringify(missingApproval), 'feature'), /验收关联/);
  const legacyOrigin = structuredClone(valid); legacyOrigin.artifacts.design.origin = 'history';
  assert.throws(() => parseWorkRecord(JSON.stringify(legacyOrigin), 'feature'), /角色、层级或状态/);
});
