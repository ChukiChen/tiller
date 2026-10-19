import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// These approvals are synthetic package fixtures, never real user authorization or AI self-hosting evidence.
export function checkInstalledGates(projectRoot, transcriptPath, { complete = false } = {}) {
  const workId = '20261019-package-gates';
  const directory = `.tiller/work/${workId}`;
  const ref = path => ({ repository: '.', path });
  const transcript = [];
  const write = (path, value) => {
    const destination = join(projectRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const invoke = (args, status = 0) => {
    const result = spawnSync(process.execPath, ['.tiller/run.cjs', ...args, '--json'], { cwd: projectRoot, encoding: 'utf8', timeout: 600_000, windowsHide: true });
    transcript.push({ args, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr });
    writeFileSync(transcriptPath, JSON.stringify({ synthetic: true, projectRoot, commands: transcript }, null, 2) + '\n');
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, status, result.stderr || result.stdout);
    const data = JSON.parse(result.stdout);
    assert.equal(data.ok, status === 0, result.stdout);
    return data;
  };
  const withInput = (args, value, suffix, status = 0) => {
    const path = `${directory}/${suffix}.json`;
    write(path, value);
    return invoke([...args, '--input', path], status);
  };
  const transact = (args, value, suffix) => {
    const prepared = withInput([...args, '--plan'], value, suffix);
    return withInput([...args, '--apply', prepared.planId], value, suffix);
  };
  invoke(['work', 'create', workId, '--type', 'change-requirements', '--title', 'Synthetic installed package gate checks']);
  const recordPath = join(projectRoot, directory, 'record.json');
  const before = readFileSync(recordPath, 'utf8');
  const gap = invoke(['work', 'delivery-check', workId], 1);
  assert.equal(gap.technicalReady, false);
  assert.equal(gap.processEvidence.status, 'unknown');
  assert.ok(gap.issues.some(issue => issue.code === 'PLANNING_REQUIRED'));
  const taskGap = invoke(['work', 'task', 'status', workId], 1);
  assert.equal(taskGap.technicalReady, false);
  assert.equal(readFileSync(recordPath, 'utf8'), before);
  assert.equal(existsSync(join(projectRoot, directory, 'tasks.json')), false);
  assert.equal(existsSync(join(projectRoot, directory, 'delivery-checks')), false);
  if (!complete) return { synthetic: true, workId, unplannedReads: 'rejected-without-writes', commandCount: transcript.length };

  const scope = { repositories: ['.'], targets: [workId] };
  const requirements = ref(`${directory}/requirements.md`);
  const design = ref(`${directory}/design.md`);
  const standard = ref(`${directory}/standard.md`);
  const output = ref('docs/package-result.md');
  write(requirements.path, '# Package gate requirement\n\nREQ-1: the installed entry must verify the delivered operating instructions.\n');
  const confirm = (requestId, gate, subjects, upstream) => {
    const requested = withInput(['work', 'request-confirmation', workId], { requestId, gate, scope, subjects, upstream,
      reviewSummary: 'Synthetic installation fixture only: review this exact bounded object.', openIssues: [], nextAction: 'Continue this synthetic installation check.' }, `request-${requestId}`);
    const source = ref(`${directory}/synthetic-source-${requestId}.md`);
    const quote = `Synthetic approval of ${requestId} for this package fixture only.`;
    write(source.path, `# Synthetic package source\n\n${quote}\n`);
    const decisionId = `approve-${requestId}`;
    withInput(['work', 'record-decision', workId], { requestId, decisionId, outcome: 'approved', conditions: [],
      source: { kind: 'conversation', reference: source, quote, presentation: ref(requested.presentation) },
      sourceReview: { reviewer: 'synthetic-package-fixture', rationale: 'Fixture association only; this is neither a real user approval nor real AI self-hosting evidence.', reviewedAt: new Date().toISOString() } }, `decision-${requestId}`);
    return { workId, requestId, decisionId };
  };
  const requirementBasis = confirm('package-requirements', 'requirements', [requirements], []);
  invoke(['work', 'add', workId, '--type', 'change-design', '--requirements-request', requirementBasis.requestId]);
  write(design.path, '# Package gate design\n\nOne document task is checked by an actual Node process reading its expected content, then independently checked for overall delivery.\n');
  write(standard.path, '# Package fixture standard\n\nUse the installed launcher and preserve actual command outputs.\n');
  const designBasis = confirm('package-design', 'design', [design, standard], [requirementBasis.requestId]);
  const basis = { requirements: requirementBasis, design: designBasis };
  const categories = Object.fromEntries(['unit', 'interface', 'integration', 'scenario', 'performance', 'security', 'reliability', 'compatibility', 'usability']
    .map(category => [category, { applicability: category === 'usability' ? 'applicable' : 'not-applicable', reason: 'Bounded operating-document package fixture with explicit execution checks.' }]));
  const selection = (id, artifactId) => ({ caseIds: [], requirements: ['REQ-1'], modules: [], categories,
    reason: 'Execute the declared check against the current delivered document.', scenarioReason: 'This document fixture has no business modules or cross-module integrations.',
    checks: [
      { id, kind: 'execution', suite: 'package-document', artifactIds: [artifactId], inputs: [output], requirements: ['REQ-1'], categories: ['usability'], reason: 'Read the actual output and assert its expected instructions.' },
      { id: `${id}-review`, kind: 'manual', artifactIds: [artifactId], inputs: [output], requirements: ['REQ-1'], categories: ['usability'], reason: 'Synthetic package fixture review of the current document; not a real human approval.' },
    ] });
  const taskSelection = selection('task-document', 'document');
  const deliverySelection = selection('overall-document', 'delivered-document');
  const plan = { schemaVersion: 1, ownerWorkId: workId, revision: 'v-one', scope, requirements: [{ id: 'REQ-1', source: requirements }], basis,
    tasks: [{ id: 'instructions', title: 'Verify installed package instructions', outcome: 'The declared document exists and passes its actual execution check.', scope, modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis,
      specifications: { requirements: [requirements], design: [design], standards: [standard] }, pendingDetails: [], dependencies: [],
      artifacts: [{ id: 'document', type: 'document', purpose: 'Provide usable operating instructions.', required: true, checks: ['task-document', 'task-document-review'], source: output }], verification: taskSelection, humanCheckpoints: [] }],
    delivery: { requiredTasks: ['instructions'], artifacts: [{ id: 'delivered-document', type: 'reference', purpose: 'Deliver the verified instructions.', required: true, checks: ['overall-document', 'overall-document-review'], taskId: 'instructions', artifactId: 'document' }], verification: deliverySelection, humanCheckpoints: [], openIssues: [] },
    changeReason: 'Synthetic package installation test of the complete CLI gate path.' };
  write('.tiller/verification/config.json', { schemaVersion: 1, modules: [], requirements: plan.requirements, categories,
    suites: [{ id: 'package-document', repository: '.', command: 'node', cwd: '.', timeoutMs: 10000, inputs: [output],
      args: ['-e', `const assert=require('node:assert/strict');const fs=require('node:fs');assert.match(fs.readFileSync(${JSON.stringify(output.path)},'utf8'),/Verified package instructions/);console.log('package document checked');`] }] });
  const registered = transact(['work', 'plan', 'register', workId], { operationId: 'package-register', expectedRevision: 0, plan }, 'register');
  const savedDefinition = JSON.parse(readFileSync(join(projectRoot, directory, 'planning/v-one/definition.json'), 'utf8'));
  const planningBasis = confirm('package-planning', 'planning', [ref(`${directory}/planning/v-one/definition.json`), ref(`${directory}/planning/v-one/review.md`),
    ...savedDefinition.specificationFiles.map(({ repository, path }) => ({ repository, path }))], [designBasis.requestId]);
  const activated = transact(['work', 'plan', 'activate', workId], { operationId: 'package-activate', expectedRevision: registered.revision, revision: 'v-one', confirmation: planningBasis }, 'activate');
  const started = transact(['work', 'task', 'start', workId, '--task', 'instructions'], { operationId: 'package-start', expectedRevision: activated.revision }, 'start');
  write(output.path, '# Verified package instructions\n\nRun the installed launcher, inspect the current object, and retain the verification output.\n');
  const execute = (selected, suffix) => {
    const executionSelection = { ...selected, checks: selected.checks.filter(check => check.kind === 'execution') };
    const result = transact(['verification', 'run', workId, '--suite', 'package-document'], { selection: executionSelection }, suffix);
    assert.equal(result.record.execution.exitCode, 0);
    assert.match(result.record.execution.output, /package document checked/);
    return [{ workId, runId: result.record.id, checkId: selected.checks[0].id, environment: result.record.environment }];
  };
  const observe = (selected, suffix) => {
    const manualSelection = { ...selected, checks: selected.checks.filter(check => check.kind === 'manual') };
    const environment = `synthetic installed package review: ${suffix}`;
    const captured = withInput(['verification', 'capture', workId], { selection: manualSelection, environment }, `${suffix}-capture`);
    const document = readFileSync(join(projectRoot, output.path), 'utf8');
    assert.match(document, /^# Verified package instructions\n/);
    assert.ok(document.includes('Run the installed launcher, inspect the current object, and retain the verification output.'));
    const evidence = ref(`${directory}/evidence/${suffix}.md`);
    write(evidence.path, `# Synthetic package document review\n\nAfter capture, the fixture read ${output.path} and asserted its heading and operating instructions. This automated fixture models a manual evidence record; it is not real user approval or AI self-hosting evidence.\n`);
    const recorded = withInput(['verification', 'record', workId], { captureId: captured.captureId, environment,
      results: manualSelection.checks.map(check => ({ checkId: check.id, status: 'passed', evidence, note: 'Synthetic fixture read and assertions completed after capture.' })) }, `${suffix}-record`);
    return manualSelection.checks.map(check => ({ workId, runId: recorded.record.id, checkId: check.id, environment }));
  };
  const evidenceRefs = [...execute(taskSelection, 'task-execution'), ...observe(taskSelection, 'task-review')];
  const verified = transact(['work', 'task', 'verify', workId, '--task', 'instructions'], { operationId: 'package-verify', expectedRevision: started.revision, attemptId: started.attemptId, evidenceRefs }, 'verify');
  assert.equal(verified.technicalReady, true);
  const deliveryEvidence = [...execute(deliverySelection, 'overall-execution'), ...observe(deliverySelection, 'overall-review')];
  const inputs = { evidenceRefs: deliveryEvidence };
  const checked = withInput(['work', 'delivery-check', workId], inputs, 'delivery-input');
  assert.equal(checked.technicalReady, true);
  assert.equal(checked.processEvidence.status, 'complete');
  assert.equal(checked.acceptance.status, 'not-requested');
  const taskState = readFileSync(join(projectRoot, directory, 'tasks.json'), 'utf8');
  const ready = transact(['work', 'delivery-ready', workId], { operationId: 'package-ready', expectedRevision: verified.revision, ...inputs }, 'ready');
  assert.equal(ready.technicalReady, true);
  assert.equal(ready.acceptance.status, 'not-evaluated');
  assert.equal(ready.disposition, 'ready');
  assert.equal(readFileSync(join(projectRoot, directory, 'tasks.json'), 'utf8'), taskState);
  assert.equal(withInput(['work', 'delivery-check', workId], inputs, 'delivery-input').technicalReady, true);
  return { synthetic: true, workId, unplannedReads: 'rejected-without-writes', commandCount: transcript.length, receiptId: ready.id, basisDigest: ready.basisDigest, technicalReady: ready.technicalReady, acceptance: 'not-requested' };
}
