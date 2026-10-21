import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createStartedBaseline, baselineAuthorization } from './workflow-fixtures.mjs';
import { verificationCategories } from '../dist/verification-cases.js';
import { parseVerificationSelection } from '../dist/verification-selection.js';
import { captureVerificationObservation as captureVerificationObservationRaw, recordVerificationEvidence, evaluateVerificationSelection, planVerificationRun as planVerificationRunRaw, applyVerificationRun as applyVerificationRunRaw, reportVerification } from '../dist/verification-runs.js';
import { fixture, put, snapshot, gitRepository } from './helpers.mjs';


const planVerificationRun = (root, id, suite, selection) => planVerificationRunRaw(root, id, suite, selection, baselineAuthorization(['test']));
const applyVerificationRun = (root, id, suite, planId, selection) => applyVerificationRunRaw(root, id, suite, planId, selection, baselineAuthorization(['test']));
const captureVerificationObservation = (root, id, input) => captureVerificationObservationRaw(root, id, { ...input, workflow: baselineAuthorization(['write-report']) });

const workId = 'scoped-verification';
const ref = path => ({ repository: '.', path });
const digest = value => createHash('sha256').update(value).digest('hex');
function categories(applicable = 'unit') {
  return Object.fromEntries(verificationCategories.map(category => [category, {
    applicability: category === applicable ? 'applicable' : 'not-applicable', reason: 'Reviewed fixture scope',
  }]));
}
function selection(caseIds = ['TC-A']) {
  return { caseIds, requirements: ['REQ-A'], modules: ['a'], categories: categories(), reason: 'Only changed module A', scenarioReason: 'Cross-module and system coverage reviewed for this bounded fixture', checks: [] };
}
async function setup(t, withCases = true, scope) {
  const root = fixture(t);
  await initialize({ root });
  put(root, 'spec-a.md', '# Requirement A\nObserved behavior and review scope.\n');
  put(root, 'spec-b.md', '# Unrelated requirement B\n');
  put(root, 'a.mjs', 'console.log("A passed")\n');
  put(root, 'b.mjs', 'console.log("B passed")\n');
  put(root, 'observed.md', '# Actual fixture observation\nObserved the captured version explicitly.\n');
  const config = { schemaVersion: 1, modules: [{ id: 'a', design: ref('spec-a.md') }, { id: 'b', design: ref('spec-b.md') }],
    requirements: [{ id: 'REQ-A', source: ref('spec-a.md') }, { id: 'REQ-B', source: ref('spec-b.md') }], categories: categories(),
    suites: withCases ? ['a', 'b'].map(id => ({ id, repository: '.', command: 'node', args: [`${id}.mjs`], cwd: '.', timeoutMs: 5000, inputs: [ref(`${id}.mjs`)] })) : [] };
  config.categories.security = { applicability: 'pending', reason: 'Unrelated global risk decision' };
  put(root, '.tiller/verification/config.json', JSON.stringify(config));
  if (withCases) for (const id of ['a', 'b']) put(root, `.tiller/verification/modules/${id}/unit.yaml`, `schema_version: 1
cases:
  - id: TC-${id.toUpperCase()}
    title: ${id} behavior
    modules: [${id}]
    categories: [unit]
    requirements: [REQ-${id.toUpperCase()}]
    given: [captured inputs]
    when: [observe]
    then: [expected behavior]
    automation:
      suite: ${id}
      test_ref: TC-${id.toUpperCase()}
      source:
        repository: .
        path: ${id}.mjs
`);
  await createStartedBaseline(root, workId, scope);
  return root;
}
async function observe(root, selected, result = { caseId: 'TC-A', status: 'passed' }, id = workId) {
  const captured = await captureVerificationObservation(root, id, { selection: selected, environment: 'explicit fixture observer' });
  const reported = await recordVerificationEvidence(root, id, { captureId: captured.record.id, environment: captured.record.environment,
    results: [{ ...result, evidence: ref('observed.md'), note: 'Observed after capture; this fixture is not a real approval.' }] });
  return { captured, reported };
}

test('scoped evaluation ignores unrelated gaps and changes while stable work identity prevents self invalidation', async t => {
  const root = await setup(t);
  const selected = selection();
  await observe(root, selected);
  const before = await evaluateVerificationSelection(root, workId, selected);
  assert.equal(before.ready, true, before.issues.join('\n'));
  assert.ok(before.warnings.some(item => item.includes('REQ-B')));
  assert.ok(before.warnings.some(item => item.includes('security')));
  assert.equal((await reportVerification(root, workId)).ready, false);
  const workPath = `.tiller/work/${workId}/record.json`;
  const work = JSON.parse(readFileSync(join(root, workPath), 'utf8'));
  work.title = 'Changed descriptive title';
  put(root, workPath, JSON.stringify(work));
  put(root, `.tiller/work/${workId}/tasks.json`, '{"progress":"verified"}\n');
  put(root, `.tiller/work/${workId}/work.md`, '# Updated progress\n');
  put(root, 'b.mjs', 'throw new Error("unrelated")\n');
  put(root, 'spec-b.md', '# Changed unrelated specification\n');
  const after = await evaluateVerificationSelection(root, workId, selected);
  assert.equal(after.ready, true, after.issues.join('\n'));
  assert.equal(after.basisDigest, before.basisDigest);
  put(root, 'a.mjs', '// changed actual tested input\n');
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).cases[0].status, 'stale');
});

test('a report cannot capture current code retroactively or conceal a newer unexecuted attempt', async t => {
  const root = await setup(t);
  const selected = selection();
  await assert.rejects(recordVerificationEvidence(root, workId, { environment: 'fixture', results: [{ caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'old report' }] }), /非空文本/);
  const captured = await captureVerificationObservation(root, workId, { selection: selected, environment: 'fixture' });
  put(root, 'a.mjs', '// code changed before recording old observation\n');
  const reported = await recordVerificationEvidence(root, workId, { captureId: captured.record.id, environment: 'fixture', results: [{ caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'Actual observation of original captured object' }] });
  assert.equal(reported.record.bindings['case:TC-A'].inputs['.::a.mjs'], captured.record.bindings['case:TC-A'].inputs['.::a.mjs']);
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).ready, false);
  const valid = await observe(root, selected);
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).ready, true);
  await captureVerificationObservation(root, workId, { selection: selected, environment: 'next uncompleted observation' });
  const latest = await evaluateVerificationSelection(root, workId, selected, [{ workId, runId: valid.reported.record.id, caseId: 'TC-A' }]);
  assert.equal(latest.ready, false);
  assert.ok(latest.issues.some(issue => issue.includes('最新尝试')));
  await assert.rejects(recordVerificationEvidence(root, workId, { captureId: valid.captured.record.id, environment: valid.captured.record.environment,
    results: [{ caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'Cannot overwrite later attempt' }] }), /较新/);
  await observe(root, selected, { caseId: 'TC-A', status: 'failed' });
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).cases[0].status, 'failed');
});

test('manual document checks require actual inputs, cover current artifacts and reject control self references', async t => {
  const root = await setup(t, false);
  const selected = { ...selection([]), categories: categories('usability'), checks: [{ id: 'document-review', kind: 'manual',
    artifactIds: ['document'], inputs: [ref('spec-a.md')], requirements: ['REQ-A'], categories: ['usability'], reason: 'Read the actual document against scope' }] };
  const { reported } = await observe(root, selected, { checkId: 'document-review', status: 'passed' });
  const expected = { document: { '.::spec-a.md': digest(readFileSync(join(root, 'spec-a.md'))) } };
  const ready = await evaluateVerificationSelection(root, workId, selected, [], expected);
  assert.equal(ready.ready, true, ready.issues.join('\n'));
  assert.equal(ready.evidenceRefs[0].runId, reported.record.id);
  assert.equal(ready.cases.length, 0);
  assert.equal((await evaluateVerificationSelection(root, workId, selected, [], { document: { ...expected.document, '.::a.mjs': digest(readFileSync(join(root, 'a.mjs'))) } })).ready, false);
  assert.equal((await evaluateVerificationSelection(root, workId, selected, [], {})).ready, false);
  for (const path of ['.tiller/local/private.md', `.tiller/work/${workId}/tasks.json`, `.tiller/work/${workId}/delivery-checks/check.json`, `.tiller/work/${workId}/reviews/request/presentation.md`]) {
    const invalid = structuredClone(selected); invalid.checks[0].inputs = [ref(path)];
    assert.throws(() => parseVerificationSelection(invalid), /控制资料|内部数据/);
  }
  const noInputs = structuredClone(selected); noInputs.checks[0].inputs = [];
  assert.throws(() => parseVerificationSelection(noInputs), /受检输入/);
  assert.throws(() => parseVerificationSelection({ ...selected, checks: [] }), /不能为空/);
  const before = snapshot(root);
  const invalidEvidence = { captureId: reported.record.id, environment: reported.record.environment,
    results: [{ checkId: 'document-review', status: 'passed', evidence: ref(`.tiller/work/${workId}/tasks.json`), note: 'self evidence forbidden' }] };
  await assert.rejects(recordVerificationEvidence(root, workId, invalidEvidence), /控制资料/);
  assert.deepEqual(snapshot(root), before);
});

test('evidence cannot alias tested inputs through filename case differences', async t => {
  const root = await setup(t);
  const captured = await captureVerificationObservation(root, workId, { selection: selection(), environment: 'case alias observer' });
  const before = snapshot(root);
  for (const path of ['A.MJS', 'SPEC-A.MD']) {
    await assert.rejects(recordVerificationEvidence(root, workId, { captureId: captured.record.id, environment: captured.record.environment,
      results: [{ caseId: 'TC-A', status: 'passed', evidence: ref(path), note: 'Case aliases are not independent observations' }] }), /独立/);
    assert.deepEqual(snapshot(root), before);
  }
});

test('execution checks preserve suite versus case distinction and match complete artifact inputs', async t => {
  const root = await setup(t);
  const selected = selection();
  selected.checks = [{ id: 'runtime', kind: 'execution', suite: 'a', artifactIds: ['source'], inputs: [ref('a.mjs')], requirements: ['REQ-A'], categories: ['unit'], reason: 'Require actual invocation' }];
  const plan = await planVerificationRun(root, workId, 'a', selected);
  const executed = await applyVerificationRun(root, workId, 'a', plan.planId, selected);
  const expected = { source: { '.::a.mjs': digest(readFileSync(join(root, 'a.mjs'))) } };
  const afterRun = await evaluateVerificationSelection(root, workId, selected, [], expected);
  assert.equal(afterRun.ready, false);
  assert.equal(afterRun.cases[0].status, 'not-run');
  assert.equal(afterRun.checks[0].status, 'passed');
  await recordVerificationEvidence(root, workId, { captureId: executed.record.id, environment: executed.record.environment,
    results: [{ caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'External case-level adapter observation' }] });
  assert.equal((await evaluateVerificationSelection(root, workId, selected, [], expected)).ready, true);
  const uncovered = { source: { ...expected.source, '.::b.mjs': digest(readFileSync(join(root, 'b.mjs'))) } };
  assert.equal((await evaluateVerificationSelection(root, workId, selected, [], uncovered)).ready, false);
  put(root, 'a.mjs', 'process.exit(9)\n');
  const failedPlan = await planVerificationRun(root, workId, 'a', selected);
  const failed = await applyVerificationRun(root, workId, 'a', failedPlan.planId, selected);
  await recordVerificationEvidence(root, workId, { captureId: failed.record.id, environment: failed.record.environment,
    results: [{ caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'Manual assertion cannot upgrade failed execution' },
      { checkId: 'runtime', status: 'passed', evidence: ref('observed.md'), note: 'The actual failed invocation remains authoritative' }] });
  const afterFailure = await evaluateVerificationSelection(root, workId, selected);
  assert.equal(afterFailure.ready, false);
  assert.equal(afterFailure.cases[0].status, 'failed');
  assert.equal(afterFailure.checks[0].status, 'failed');
});

test('one explicit case result also satisfies its declared artifact check without duplicate outcomes', async t => {
  const root = await setup(t);
  const selected = selection();
  selected.checks = [{ id: 'case-review', kind: 'case', caseId: 'TC-A', artifactIds: ['source'], inputs: [ref('a.mjs')],
    requirements: ['REQ-A'], categories: ['unit'], reason: 'Case verifies this exact source artifact' }];
  await observe(root, selected);
  const checked = await evaluateVerificationSelection(root, workId, selected, [], { source: { '.::a.mjs': digest(readFileSync(join(root, 'a.mjs'))) } });
  assert.equal(checked.ready, true, checked.issues.join('\n'));
  assert.equal(checked.checks[0].status, 'passed');
  assert.equal(checked.checks[0].recordId, checked.cases[0].recordId);
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).basisDigest, (await evaluateVerificationSelection(root, workId, selected)).basisDigest);
  const oldCheck = await captureVerificationObservation(root, workId, { selection: selected, environment: 'fixture' });
  await observe(root, selection(), { caseId: 'TC-A', status: 'failed' });
  await assert.rejects(recordVerificationEvidence(root, workId, { captureId: oldCheck.record.id, environment: 'fixture',
    results: [{ checkId: 'case-review', status: 'passed', evidence: ref('observed.md'), note: 'Old check must not conceal a later failed case' }] }), /较新/);
});

test('binary generated outputs bind actual bytes and shared provenance with source inputs', async t => {
  const root = await setup(t, false);
  gitRepository(root, '.');
  put(root, '.gitignore', `${readFileSync(join(root, '.gitignore'), 'utf8')}\ndist/\n`);
  put(root, 'dist/output.bin', Buffer.from([0, 255, 0, 1]));
  put(root, 'build-provenance.md', '# Build provenance\nFixture output from a.mjs; bytes inspected before observing.\n');
  const selected = { ...selection([]), checks: [{ id: 'output-review', kind: 'manual', artifactIds: ['build'],
    inputs: [ref('a.mjs'), { ...ref('dist/output.bin'), binary: true, provenance: ref('build-provenance.md') }], requirements: ['REQ-A'], categories: ['unit'], reason: 'Inspect actual generated bytes and source' }] };
  const selfProvenance = structuredClone(selected);
  selfProvenance.checks[0].inputs[1].provenance = ref('DIST/OUTPUT.BIN');
  assert.throws(() => parseVerificationSelection(selfProvenance), /自身/);
  await observe(root, selected, { checkId: 'output-review', status: 'passed' });
  const expected = { build: Object.fromEntries(['a.mjs', 'dist/output.bin'].map(path => [`.::${path}`, digest(readFileSync(join(root, path)))])) };
  assert.equal((await evaluateVerificationSelection(root, workId, selected, [], expected)).ready, true);
  put(root, 'dist/output.bin', Buffer.from([0, 255, 2, 1]));
  assert.equal((await evaluateVerificationSelection(root, workId, selected, [], expected)).checks[0].status, 'stale');
  const unreviewed = structuredClone(selected); delete unreviewed.checks[0].inputs[1].provenance;
  assert.throws(() => parseVerificationSelection(unreviewed), /provenance/);
});

test('business files with control-like basenames remain valid inputs and independent evidence', async t => {
  const root = await setup(t, false);
  put(root, 'src/tasks.json', '{"businessTask":"sample"}\n');
  put(root, 'docs/work.md', '# Business workflow documentation\n');
  put(root, 'reviews/record.json', '{"observed":"business files verified"}\n');
  const selected = { ...selection([]), checks: [{ id: 'business-docs', kind: 'manual', artifactIds: ['business'],
    inputs: [ref('src/tasks.json'), ref('docs/work.md')], requirements: ['REQ-A'], categories: ['unit'], reason: 'These files are business content, not Tiller control records' }] };
  const captured = await captureVerificationObservation(root, workId, { selection: selected, environment: 'fixture' });
  await recordVerificationEvidence(root, workId, { captureId: captured.record.id, environment: 'fixture',
    results: [{ checkId: 'business-docs', status: 'passed', evidence: ref('reviews/record.json'), note: 'Independent observation of business inputs' }] });
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).ready, true);
});

test('malformed global configuration and duplicate identities remain fatal for a narrow selection', async t => {
  const root = await setup(t);
  const configPath = '.tiller/verification/config.json';
  const config = JSON.parse(readFileSync(join(root, configPath), 'utf8'));
  config.requirements.push({ id: 'REQ-A', source: ref('spec-b.md') });
  put(root, configPath, JSON.stringify(config));
  await assert.rejects(evaluateVerificationSelection(root, workId, selection()), /重复标识/);
  config.requirements.pop(); config.suites[1].repository = 'unknown';
  put(root, configPath, JSON.stringify(config));
  await assert.rejects(evaluateVerificationSelection(root, workId, selection()), /仓库未登记/);
});

test('cross-work evidence must be explicit, scope-matched and the latest result for its origin', async t => {
  const root = await setup(t);
  const other = 'related-verification';
  const work = JSON.parse(readFileSync(join(root, `.tiller/work/${workId}/record.json`), 'utf8'));
  await createStartedBaseline(root, other, work.scope);
  const selected = selection();
  const { reported } = await observe(root, selected, { caseId: 'TC-A', status: 'passed' }, other);
  assert.equal((await evaluateVerificationSelection(root, workId, selected)).ready, false);
  await assert.rejects(evaluateVerificationSelection(root, workId, selected, [{ workId: other, runId: reported.record.id, caseId: 'TC-A' }]), /非空文本/);
  const refs = [{ workId: other, runId: reported.record.id, caseId: 'TC-A', environment: reported.record.environment }];
  await assert.rejects(evaluateVerificationSelection(root, workId, selected, [{ ...refs[0], environment: 'other environment' }]), /环境/);
  assert.equal((await evaluateVerificationSelection(root, workId, selected, refs)).ready, true);
  await observe(root, selected, { caseId: 'TC-A', status: 'failed' }, other);
  assert.equal((await evaluateVerificationSelection(root, workId, selected, refs)).ready, false);
});

test('newer check outcomes invalidate case aliases and cannot be overwritten with an older capture', async t => {
  const root = await setup(t);
  const selected = selection();
  selected.checks = [{ id: 'case-review', kind: 'case', caseId: 'TC-A', artifactIds: ['source'], inputs: [ref('a.mjs')],
    requirements: ['REQ-A'], categories: ['unit'], reason: 'Observe the same case and source' }];
  const old = await captureVerificationObservation(root, workId, { selection: selected, environment: 'fixture' });
  await recordVerificationEvidence(root, workId, { captureId: old.record.id, environment: 'fixture', results: [
    { caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'Original case passed' },
  ] });
  await observe(root, selected, { checkId: 'case-review', status: 'failed' });
  const report = await evaluateVerificationSelection(root, workId, selected);
  assert.equal(report.ready, false);
  assert.equal(report.cases[0].status, 'failed');
  assert.equal(report.checks[0].status, 'failed');
  await assert.rejects(recordVerificationEvidence(root, workId, { captureId: old.record.id, environment: 'fixture', results: [
    { caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'Cannot hide newer check failure' },
  ] }), /较新/);
});

test('actual execution checks cannot be satisfied by a captured manual observation', async t => {
  const root = await setup(t);
  const selected = selection([]);
  selected.checks = [{ id: 'runtime', kind: 'execution', suite: 'a', artifactIds: ['source'], inputs: [ref('a.mjs')],
    requirements: ['REQ-A'], categories: ['unit'], reason: 'Requires actual invocation' }];
  const before = snapshot(root);
  await assert.rejects(captureVerificationObservation(root, workId, { selection: selected, environment: 'fixture' }), /实际套件运行/);
  assert.deepEqual(snapshot(root), before);
});

test('restoring files cannot rehabilitate a run known to have changed its tested inputs', async t => {
  const root = await setup(t);
  const originalSpec = readFileSync(join(root, 'spec-a.md'), 'utf8');
  put(root, 'a.mjs', 'import { writeFileSync } from "node:fs"; writeFileSync("spec-a.md", "changed during execution");\n');
  const selected = selection();
  const plan = await planVerificationRun(root, workId, 'a', selected);
  const executed = await applyVerificationRun(root, workId, 'a', plan.planId, selected);
  assert.equal(executed.record.staleAfterExecution, true);
  put(root, 'spec-a.md', originalSpec);
  await recordVerificationEvidence(root, workId, { captureId: executed.record.id, environment: executed.record.environment, results: [
    { caseId: 'TC-A', status: 'passed', evidence: ref('observed.md'), note: 'A pass claim cannot clear known execution drift' },
  ] });
  const report = await evaluateVerificationSelection(root, workId, selected);
  assert.equal(report.ready, false);
  assert.equal(report.cases[0].status, 'stale');
});

test('one manual case can bind multiple artifact checks without losing observed inputs', async t => {
  const root = await setup(t);
  const casePath = '.tiller/verification/modules/a/unit.yaml';
  put(root, casePath, readFileSync(join(root, casePath), 'utf8').split('    automation:')[0]);
  const selected = selection();
  selected.checks = ['a', 'b'].map(id => ({ id: `review-${id}`, kind: 'case', caseId: 'TC-A', artifactIds: [`source-${id}`], inputs: [ref(`${id}.mjs`)],
    requirements: ['REQ-A'], categories: ['unit'], reason: 'This manual case observes both source artifacts' }));
  await observe(root, selected);
  const artifacts = Object.fromEntries(['a', 'b'].map(id => [`source-${id}`, { [`.::${id}.mjs`]: digest(readFileSync(join(root, `${id}.mjs`))) }]));
  const report = await evaluateVerificationSelection(root, workId, selected, [], artifacts);
  assert.equal(report.ready, true, report.issues.join('\n'));
  assert.deepEqual(report.checks.map(check => check.status), ['passed', 'passed']);
  put(root, 'b.mjs', '// changed second observed artifact\n');
  const changed = await evaluateVerificationSelection(root, workId, selected, [], artifacts);
  assert.equal(changed.ready, false);
  assert.equal(changed.cases[0].status, 'stale');
});

test('cross-work evidence compares scope membership independently of declaration order', async t => {
  const root = await setup(t, true, { repositories: ['.'], targets: ['target-a', 'target-b'] });
  const originalPath = `.tiller/work/${workId}/record.json`;
  const work = JSON.parse(readFileSync(join(root, originalPath), 'utf8'));
  const other = 'scope-order-verification';
  await createStartedBaseline(root, other, { repositories: ['.'], targets: ['target-b', 'target-a'] });
  const { reported } = await observe(root, selection(), { caseId: 'TC-A', status: 'passed' }, other);
  const references = [{ workId: other, runId: reported.record.id, caseId: 'TC-A', environment: reported.record.environment }];
  const report = await evaluateVerificationSelection(root, workId, selection(), references);
  assert.equal(report.ready, true, report.issues.join('\n'));
  work.scope.targets = ['target-a', 'different-target'];
  put(root, originalPath, JSON.stringify(work));
  await assert.rejects(evaluateVerificationSelection(root, workId, selection(), references), /范围|记录|摘要/);
});
