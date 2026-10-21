import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

// Synthetic fixture approvals are never real user authorization or self-hosting evidence.
export function checkInstalledGates(projectRoot, transcriptPath, { complete = false } = {}) {
  const workId = '20261021-package-gates';
  const directory = `.tiller/work/${workId}`;
  const ref = path => ({ repository: '.', path });
  const transcript = [];
  const journal = `${transcriptPath}.jsonl`;
  appendFileSync(journal, JSON.stringify({ synthetic: true, event: 'start', projectRoot, startedAt: new Date().toISOString() }) + '\n');
  const saveTranscript = () => writeFileSync(transcriptPath, JSON.stringify({ synthetic: true, projectRoot, journal, commands: transcript }, null, 2) + '\n');
  const finish = summary => { saveTranscript(); return summary; };
  const write = (path, value) => {
    const destination = join(projectRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const read = path => JSON.parse(readFileSync(join(projectRoot, path), 'utf8'));
  const invoke = (args, status = 0) => {
    const started = performance.now();
    const result = spawnSync(process.execPath, ['.tiller/run.cjs', ...args, '--json'], {
      cwd: projectRoot, encoding: 'utf8', timeout: 600_000, windowsHide: true,
    });
    transcript.push({ args, durationMs: Math.round(performance.now() - started), status: result.status,
      signal: result.signal, stdout: result.stdout, stderr: result.stderr });
    appendFileSync(journal, JSON.stringify({ synthetic: true, projectRoot, ...transcript.at(-1) }) + '\n');
    try {
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status, status, result.stderr || result.stdout);
      const data = JSON.parse(result.stdout);
      assert.equal(data.ok, status === 0, result.stdout);
      return data;
    } catch (error) { saveTranscript(); throw error; }
  };
  const withInput = (args, value, suffix, status = 0) => {
    const path = `package-inputs/${suffix}.json`;
    write(path, value);
    return invoke([...args, '--input', path], status);
  };
  const transact = (args, value, suffix) => {
    const prepared = withInput([...args, '--plan'], value, suffix);
    return withInput([...args, '--apply', prepared.planId], value, suffix);
  };
  const snapshot = invoke(['workflow', 'show', 'feature']).snapshot;
  const scope = { repositories: ['.'], targets: [workId] };
  const quote = 'Implement, inspect and verify the declared package fixture documents; code editing is allowed only inside this disposable fixture.';
  write('package-instruction.md', `# Synthetic package authorization\n\n${quote}\n`);
  withInput(['work', 'create', workId, '--workflow', 'feature', '--title', 'Synthetic installed package gates'], {
    operationId: 'package-create', expectedRevision: 0, workflow: 'feature',
    goal: 'Verify the installed document delivery path', reason: 'Bounded synthetic package fixture', scope,
    impact: Object.fromEntries(['modifiesCode', 'changesBehavior', 'production', 'writesData', 'credentials',
      'irreversible', 'externalService', 'semanticChange', 'experimentSideEffects', 'release'].map(key => [key, false])),
    basis: [], actionSources: [{ actions: ['read', 'write-report', 'test', 'edit-code'], reference: ref('package-instruction.md'), quote, scope }],
    expectedOutputs: snapshot.definition.completion.requiredOutputs,
    completionCriteria: ['Declared outputs are observed and execution checks pass.'],
  }, 'create');
  const recordPath = join(projectRoot, directory, 'record.json');
  const before = readFileSync(recordPath, 'utf8');
  const gap = invoke(['work', 'delivery-check', workId], 1);
  assert.equal(gap.technicalReady, false);
  assert.ok(gap.issues.length > 0);
  const taskGap = invoke(['work', 'task', 'status', workId], 1);
  assert.equal(taskGap.technicalReady, false);
  assert.equal(readFileSync(recordPath, 'utf8'), before);
  assert.equal(existsSync(join(projectRoot, directory, 'tasks.json')), false);
  assert.equal(existsSync(join(projectRoot, directory, 'delivery-checks')), false);
  if (!complete) return finish({ synthetic: true, workId, unplannedReads: 'rejected-without-writes', commandCount: transcript.length });

  const requirements = ref(`${directory}/requirements.md`);
  const design = ref(`${directory}/design.md`);
  const standard = ref(`${directory}/standard.md`);
  const output = ref('docs/package-result.md');
  const sources = Object.fromEntries(snapshot.definition.outputs.map(item => [item.id, ref(`${directory}/${item.id}.md`)]));
  sources['requirements-output'] = requirements;
  sources['design-output'] = design;
  write(requirements.path, '# Package requirement\n\nREQ-1: the installed entry verifies delivered operating instructions.\n');
  write(design.path, '# Package design\n\nRead a concrete document through an actual execution and independent observations.\n');
  write(standard.path, '# Package standard\n\nUse the installed launcher and preserve actual outputs and timings.\n');
  const categories = Object.fromEntries(['unit', 'interface', 'integration', 'scenario', 'performance', 'security',
    'reliability', 'compatibility', 'usability'].map(category => [category, {
    applicability: category === 'usability' ? 'applicable' : 'not-applicable',
    reason: 'Bounded synthetic operating-document checks; not a general product-quality claim.',
  }]));
  const selection = (id, artifactIds, inputs, execution = false) => ({
    caseIds: [], requirements: ['REQ-1'], modules: [], categories,
    reason: 'Observe the declared current documents.', scenarioReason: 'Isolated document fixture with no business-module integration.',
    checks: [
      ...(execution ? [{ id, kind: 'execution', suite: 'package-document', artifactIds, inputs,
        requirements: ['REQ-1'], categories: ['usability'], reason: 'Execute the actual document assertion.' }] : []),
      { id: `${id}-review`, kind: 'manual', artifactIds, inputs, requirements: ['REQ-1'], categories: ['usability'],
        reason: 'Read current documents after capture; this synthetic observation is not a user approval.' },
    ],
  });
  const taskSelection = selection('task-document', ['document'], [output], true);
  const deliverySelection = selection('overall-document', ['delivered-document'], [output], true);
  write('.tiller/verification/config.json', { schemaVersion: 1, modules: [], requirements: [{ id: 'REQ-1', source: requirements }], categories,
    suites: [{ id: 'package-document', repository: '.', command: 'node', cwd: '.', timeoutMs: 10000, inputs: [output],
      args: ['-e', `const assert=require('node:assert/strict');const fs=require('node:fs');assert.match(fs.readFileSync(${JSON.stringify(output.path)},'utf8'),/Verified package instructions/);console.log('package document checked');`] }] });
  const confirmationRefs = [];
  const initialStatus = invoke(['work', 'stage', 'status', workId]);
  const binding = { workflowDigest: initialStatus.context.snapshot.digest, intentDigest: initialStatus.context.intentDigest };
  const stageRevision = () => {
    const path = `${directory}/stages/state.json`;
    return existsSync(join(projectRoot, path)) ? read(path).revision : 0;
  };
  const stageSelection = stageId => {
    const stage = snapshot.definition.stages.find(item => item.id === stageId);
    const ids = snapshot.definition.completion.requiredStages.includes(stageId)
      ? snapshot.definition.completion.requiredOutputs : stage.produces;
    return selection(`stage-${stageId}`, ids, ids.map(id => sources[id]));
  };
  const startStage = (stageId, delegation) => {
    const stage = snapshot.definition.stages.find(item => item.id === stageId);
    const verification = stageSelection(stageId);
    const receipt = transact(['work', 'stage', 'start', workId, '--stage', stageId], {
      operationId: `start-${stageId}`, expectedStageRevision: stageRevision(), verification,
      checkMappings: stage.checks.map((text, index) => ({ index, text, checkIds: verification.checks.map(check => check.id) })),
      confirmationRefs: [...confirmationRefs], ...(delegation ? { delegation } : {}),
    }, `start-${stageId}`);
    return { receipt, verification };
  };
  const registerOutputs = stageId => {
    for (const outputId of snapshot.definition.stages.find(item => item.id === stageId).produces) {
      const record = read(`${directory}/record.json`);
      withInput(['work', 'output', 'add', workId], { operationId: `output-${outputId}`, expectedRevision: record.revision,
        outputId, source: sources[outputId], confirmationRefs: [...confirmationRefs] }, `output-${outputId}`);
    }
  };
  const confirm = (requestId, gate, subjects, upstream) => {
    const requested = withInput(['work', 'request-confirmation', workId], {
      requestId, gate, scope, subjects, upstream, workflowBinding: { ...binding, stageId: gate },
      reviewSummary: 'Synthetic package fixture: review this exact bounded object.', openIssues: [],
      nextAction: 'Continue only this synthetic installation check.',
    }, `request-${requestId}`);
    const pending = invoke(['work', 'check-gate', workId, '--request', requestId], 1);
    assert.equal(pending.automaticTransition, false);
    const source = ref(`${directory}/synthetic-source-${requestId}.md`);
    const decisionQuote = `Synthetic approval of ${requestId} for this package fixture only.`;
    write(source.path, `# Synthetic package source\n\n${decisionQuote}\n`);
    const decisionId = `approve-${requestId}`;
    withInput(['work', 'record-decision', workId], { requestId, decisionId, outcome: 'approved', conditions: [],
      source: { kind: 'conversation', reference: source, quote: decisionQuote, presentation: ref(requested.presentation) },
      sourceReview: { reviewer: 'synthetic-package-fixture', rationale: 'Fixture association only; neither real user approval nor self-hosting evidence.',
        reviewedAt: new Date().toISOString() } }, `decision-${requestId}`);
    const reference = { workId, requestId, decisionId };
    confirmationRefs.push(reference);
    return reference;
  };
  const workflow = (stageId, actions, taskId) => ({
    stageId, actions, confirmationRefs: [...confirmationRefs], ...(taskId ? { taskId } : {}),
  });
  const observe = (selected, suffix, stageId, taskId) => {
    const manual = { ...selected, checks: selected.checks.filter(check => check.kind === 'manual') };
    const environment = `synthetic installed package observation: ${suffix}`;
    const captured = withInput(['verification', 'capture', workId], {
      selection: manual, environment, workflow: workflow(stageId, ['write-report'], taskId),
    }, `${suffix}-capture`);
    const observations = manual.checks.flatMap(check => check.inputs.map(source => {
      const text = readFileSync(join(projectRoot, source.path), 'utf8');
      assert.ok(text.trim());
      if (source.path === output.path) assert.match(text, /^# Verified package instructions\n/);
      return `${check.id}: read ${source.path} (${Buffer.byteLength(text)} bytes)`;
    }));
    const evidence = ref(`${directory}/evidence/${suffix}.md`);
    write(evidence.path, '# Actual synthetic fixture observations\n\n' + observations.join('\n') +
      '\n\nThese reads occurred after capture; this is not user acceptance or self-hosting evidence.\n');
    const recorded = withInput(['verification', 'record', workId], { captureId: captured.record.id, environment,
      results: manual.checks.map(check => ({ checkId: check.id, status: 'passed', evidence,
        note: 'Current fixture documents read and assertions completed after capture.' })) }, `${suffix}-record`);
    return manual.checks.map(check => ({ workId, runId: recorded.record.id, checkId: check.id, environment }));
  };
  const finishStage = (stageId, started, evidenceRefs = observe(started.verification, `stage-${stageId}`, stageId)) =>
    transact(['work', 'stage', 'verify', workId, '--stage', stageId], {
      operationId: `verify-${stageId}`, expectedStageRevision: stageRevision(), attemptId: started.receipt.attemptId,
      evidenceRefs, confirmationRefs: [...confirmationRefs],
    }, `verify-${stageId}`);
  const basis = {};
  for (const stageId of ['requirements', 'design']) {
    const started = startStage(stageId);
    registerOutputs(stageId);
    const evidence = observe(started.verification, `stage-${stageId}`, stageId);
    basis[stageId] = confirm(`package-${stageId}`, stageId,
      stageId === 'requirements' ? [requirements] : [design, standard], confirmationRefs.map(item => item.requestId));
    finishStage(stageId, started, evidence);
  }
  const planningStage = startStage('planning');
  const plan = { schemaVersion: 1, ownerWorkId: workId, revision: 'v-one', scope,
    requirements: [{ id: 'REQ-1', source: requirements }], basis,
    tasks: [{ id: 'instructions', title: 'Verify installed package instructions', outcome: 'Actual execution and observation verify the document.',
      scope, modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis,
      specifications: { requirements: [requirements], design: [design], standards: [standard] }, pendingDetails: [], dependencies: [],
      artifacts: [{ id: 'document', type: 'document', purpose: 'Provide operating instructions.', required: true,
        checks: taskSelection.checks.map(check => check.id), source: output }], verification: taskSelection, humanCheckpoints: [] }],
    delivery: { requiredTasks: ['instructions'], artifacts: [{ id: 'delivered-document', type: 'reference',
      purpose: 'Deliver verified instructions.', required: true, checks: deliverySelection.checks.map(check => check.id),
      taskId: 'instructions', artifactId: 'document' }], verification: deliverySelection, humanCheckpoints: [], openIssues: [] },
    changeReason: 'Synthetic installation test of the current complete CLI path.' };
  const registered = transact(['work', 'plan', 'register', workId], {
    operationId: 'package-register', expectedRevision: 0, plan,
  }, 'register');
  write(sources['planning-output'].path, '# Package planning\n\nThe registered v-one task covers REQ-1 and the overall delivery checks.\n');
  registerOutputs('planning');
  const saved = read(`${directory}/planning/v-one/definition.json`);
  const planningBasis = confirm('package-planning', 'planning', [sources['planning-output'],
    ref(`${directory}/planning/v-one/definition.json`), ref(`${directory}/planning/v-one/review.md`),
    ...saved.specificationFiles.map(({ repository, path }) => ({ repository, path }))], [basis.design.requestId]);
  const activated = transact(['work', 'plan', 'activate', workId], {
    operationId: 'package-activate', expectedRevision: registered.revision, revision: 'v-one', confirmation: planningBasis,
  }, 'activate');
  finishStage('planning', planningStage);
  const implementation = startStage('implementation', { kind: 'development-tasks', planningRevision: 'v-one', taskIds: ['instructions'] });
  const started = transact(['work', 'task', 'start', workId, '--task', 'instructions'], {
    operationId: 'package-start', expectedRevision: activated.revision,
  }, 'start-task');
  write(output.path, '# Verified package instructions\n\nRun the installed launcher, inspect the current object, and retain verification output.\n');
  const execute = (selected, suffix, stageId, taskId) => {
    const execution = { ...selected, checks: selected.checks.filter(check => check.kind === 'execution') };
    const result = transact(['verification', 'run', workId, '--suite', 'package-document'], {
      selection: execution, workflow: workflow(stageId, ['test'], taskId),
    }, suffix);
    assert.equal(result.record.execution.exitCode, 0);
    assert.match(result.record.execution.output, /package document checked/);
    return execution.checks.map(check => ({ workId, runId: result.record.id, checkId: check.id, environment: result.record.environment }));
  };
  const evidenceRefs = [...execute(taskSelection, 'task-execution', 'implementation', 'instructions'),
    ...observe(taskSelection, 'task-review', 'implementation', 'instructions')];
  const verified = transact(['work', 'task', 'verify', workId, '--task', 'instructions'], {
    operationId: 'package-verify', expectedRevision: started.revision, attemptId: started.attemptId, evidenceRefs,
  }, 'verify-task');
  assert.equal(verified.technicalReady, true);
  write(sources['implementation-output'].path, '# Package implementation\n\nThe registered instructions task produced and verified its actual document.\n');
  registerOutputs('implementation');
  finishStage('implementation', implementation);
  const verification = startStage('verification');
  write(sources['verification-output'].path, '# Package verification\n\nEach current output and overall document check was independently observed.\n');
  registerOutputs('verification');
  const planningEvidenceRefs = [...execute(deliverySelection, 'overall-execution', 'verification'),
    ...observe(deliverySelection, 'overall-review', 'verification')];
  const finalEvidence = observe(verification.verification, 'stage-verification', 'verification');
  finishStage('verification', verification, finalEvidence);
  const inputs = { verification: verification.verification, evidenceRefs: finalEvidence, planningEvidenceRefs,
    checkMappings: snapshot.definition.completion.checks.map((text, index) => ({
      index, text, checkIds: verification.verification.checks.map(check => check.id),
    })) };
  const checked = withInput(['work', 'delivery-check', workId], inputs, 'delivery-input');
  assert.equal(checked.technicalReady, true);
  assert.equal(checked.processEvidence.status, 'complete');
  assert.equal(checked.acceptance.status, 'not-requested');
  const state = invoke(['work', 'stage', 'status', workId]);
  const taskBytes = readFileSync(join(projectRoot, directory, 'tasks.json'), 'utf8');
  const ready = transact(['work', 'delivery-ready', workId], {
    operationId: 'package-ready', expected: state.controlSnapshot, ...inputs,
  }, 'ready');
  assert.equal(ready.technicalReady, true);
  assert.equal(ready.acceptance.status, 'not-evaluated');
  assert.equal(ready.disposition, 'ready');
  assert.deepEqual(ready.controlSnapshot, state.controlSnapshot);
  assert.equal(readFileSync(join(projectRoot, directory, 'tasks.json'), 'utf8'), taskBytes);
  assert.equal(withInput(['work', 'delivery-check', workId], inputs, 'delivery-input').technicalReady, true);
  return finish({ synthetic: true, workId, unplannedReads: 'rejected-without-writes', commandCount: transcript.length,
    receiptId: ready.id, basisDigest: ready.basisDigest, technicalReady: ready.technicalReady, acceptance: 'not-requested' });
}
