import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { inspectTaskStatus, planTaskOperation, applyTaskOperation } from '../dist/tasks.js';
import { setupTasks, activateTaskPlan, writeTaskDocument, observeTask, approveTaskCheckpoint } from './task-helpers.mjs';
import { gitRepository, put } from './helpers.mjs';

const stateText = context => readFileSync(join(context.root, `.tiller/work/${context.workId}/tasks.json`), 'utf8');
const reference = path => ({ repository: '.', path });
async function preview(context, taskId, operation, operationId, extra = {}) {
  const input = { operationId, expectedRevision: context.revision, ...extra };
  const plan = await planTaskOperation(context.root, context.workId, taskId, operation, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  return { input, plan, apply: () => applyTaskOperation(context.root, context.workId, taskId, operation, input, plan.planId) };
}
async function commit(context, pending) {
  const receipt = await pending.apply();
  assert.equal(receipt.changed, true);
  context.revision = receipt.revision;
  return receipt;
}
async function rejectsIgnored(context, pending, paths) {
  const ignore = readFileSync(join(context.root, '.gitignore'), 'utf8');
  const before = stateText(context);
  try {
    for (const path of paths) {
      put(context.root, '.gitignore', `${ignore}\n/${path}\n`);
      await assert.rejects(pending.apply(), /共享资料被 Git 忽略/u);
      assert.equal(stateText(context), before, 'Rejected registration must preserve task events and receipts');
    }
  } finally { put(context.root, '.gitignore', ignore); }
}

for (const control of ['planning-definition', 'work-record']) test(`task start rejects ignored active control ${control}`, async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  await activateTaskPlan(context);
  gitRepository(context.root, '.');
  const pending = await preview(context, 'foundation', 'start', `start-${control}`);
  const path = control === 'planning-definition'
    ? `.tiller/work/${context.workId}/planning/${context.plan.revision}/definition.json`
    : `.tiller/work/${context.workId}/record.json`;
  await rejectsIgnored(context, pending, [path]);
});

test('task start protects current planning approval, workflow and stage control sources', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  await activateTaskPlan(context);
  gitRepository(context.root, '.');
  const pending = await preview(context, 'foundation', 'start', 'start-control-sources');
  const directory = `.tiller/work/${context.workId}`;
  const work = JSON.parse(readFileSync(join(context.root, `${directory}/record.json`), 'utf8'));
  const state = JSON.parse(stateText(context));
  await rejectsIgnored(context, pending, [
    `${directory}/planning/${context.plan.revision}/review.md`, `${directory}/plan.md`,
    `${directory}/stages/state.json`, work.workflow.path,
    ...work.actionSources.map(source => source.reference.path),
    `${directory}/source-${state.activePlanning.confirmation.decisionId}.md`,
  ]);
  await commit(context, pending);
});

test('task start checks current specifications and checkpoint approval sources while queries remain Git-free', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  context.task('foundation').humanCheckpoints.push({ id: 'start-review', operation: 'start',
    purpose: 'Review the declared task before starting.', subjects: [context.requirements] });
  await activateTaskPlan(context);
  const checkpoint = await approveTaskCheckpoint(context, 'foundation', 'start-review', 'start');
  gitRepository(context.root, '.');
  const input = { operationId: 'start-shared', expectedRevision: context.revision, checkpointRefs: [checkpoint] };
  const ignore = readFileSync(join(context.root, '.gitignore'), 'utf8');
  put(context.root, '.gitignore', `${ignore}\n/${context.standard.path}\n`);
  const trace = join(context.root, '.tiller/local/task-query-git.jsonl');
  writeFileSync(trace, '');
  const previous = process.env.GIT_TRACE2_EVENT;
  process.env.GIT_TRACE2_EVENT = trace;
  let plan;
  try {
    const status = await inspectTaskStatus(context.root, context.workId, 'foundation');
    assert.equal(status.tasks[0].recordedStatus, 'pending');
    plan = await planTaskOperation(context.root, context.workId, 'foundation', 'start', input);
    assert.equal(plan.operationAllowed, true);
    const starts = readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(event => event.event === 'start');
    assert.deepEqual(starts, []);
  } finally {
    if (previous === undefined) delete process.env.GIT_TRACE2_EVENT;
    else process.env.GIT_TRACE2_EVENT = previous;
    put(context.root, '.gitignore', ignore);
  }
  const pending = { apply: () => applyTaskOperation(context.root, context.workId, 'foundation', 'start', input, plan.planId) };
  await rejectsIgnored(context, pending, [context.standard.path,
    `.tiller/work/${context.workId}/source-${checkpoint.decisionId}.md`]);
  await commit(context, pending);
});

test('task verify and dependent start reject ignored artifacts or evidence without checking independent tasks', async t => {
  const context = await setupTasks(t);
  await activateTaskPlan(context);
  gitRepository(context.root, '.');
  const started = await commit(context, await preview(context, 'foundation', 'start', 'start-foundation'));
  await writeTaskDocument(context, 'foundation');
  const evidenceRefs = await observeTask(context, 'foundation');
  const pending = await preview(context, 'foundation', 'verify', 'verify-foundation', { attemptId: started.attemptId, evidenceRefs });
  const artifact = context.task('foundation').artifacts[0].source.path;
  const evidence = `.tiller/work/${context.workId}/evidence/foundation-${context.observationSequence}.md`;
  await rejectsIgnored(context, pending, [artifact, evidence]);

  const before = stateText(context);
  const original = readFileSync(join(context.root, artifact), 'utf8');
  const nativeExec = childProcess.execFile;
  let changed = false;
  childProcess.execFile = function(file, args, options, callback) {
    if (file !== 'git' || args[0] !== 'check-ignore') return nativeExec.call(this, file, args, options, callback);
    return nativeExec.call(this, file, args, options, (...result) => {
      if (!changed) { changed = true; put(context.root, artifact, `${original}\nChanged after observation.\n`); }
      callback(...result);
    });
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(pending.apply(), { code: 'TASK_ARTIFACTS_CHANGED' });
    assert.equal(changed, true);
    assert.equal(stateText(context), before);
  } finally {
    childProcess.execFile = nativeExec; syncBuiltinESMExports();
    put(context.root, artifact, original);
  }
  await commit(context, pending);
  const dependent = await preview(context, 'downstream', 'start', 'start-downstream');
  await rejectsIgnored(context, dependent, [artifact, evidence]);
  const ignore = readFileSync(join(context.root, '.gitignore'), 'utf8');
  put(context.root, '.gitignore', `${ignore}\n/${artifact}\n/${evidence}\n`);
  try { await commit(context, await preview(context, 'independent', 'start', 'start-independent')); }
  finally { put(context.root, '.gitignore', ignore); }
  await commit(context, await preview(context, 'downstream', 'start', 'start-downstream-after-independent'));
});

test('generated task outputs may be ignored but their inputs and provenance must remain shared', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation', 'downstream'] });
  const task = context.task('foundation');
  const artifact = { id: 'bundle', type: 'generated', purpose: 'Deliver a reproducible generated fixture.', required: true,
    checks: ['foundation-review'], output: reference('dist/result.bin'),
    inputs: [reference('src/input.txt')], evidence: reference('evidence/build.json') };
  task.artifacts.push(artifact);
  task.verification.checks[0].artifactIds.push(artifact.id);
  task.verification.checks[0].inputs.push(...artifact.inputs, artifact.evidence,
    { ...artifact.output, binary: true, provenance: artifact.evidence });
  context.task('downstream').dependencies[0].artifacts.push(artifact.id);
  await activateTaskPlan(context);
  gitRepository(context.root, '.');
  const ignore = readFileSync(join(context.root, '.gitignore'), 'utf8');
  put(context.root, '.gitignore', `${ignore}\n/dist/\n`);
  const started = await commit(context, await preview(context, 'foundation', 'start', 'start-generated'));
  await writeTaskDocument(context, 'foundation');
  put(context.root, artifact.inputs[0].path, 'Actual generator input.\n');
  put(context.root, artifact.output.path, 'Actual generated fixture bytes.\n');
  const bound = ref => ({ ...ref, sha256: createHash('sha256').update(readFileSync(join(context.root, ref.path))).digest('hex') });
  put(context.root, artifact.evidence.path, JSON.stringify({ schemaVersion: 1,
    output: bound(artifact.output), inputs: artifact.inputs.map(bound), command: 'synthetic fixture generation',
    observer: 'task sharing test', observedAt: '2026-10-19T00:00:00.000Z', environment: 'isolated fixture' }));
  const evidenceRefs = await observeTask(context, 'foundation');
  const pending = await preview(context, 'foundation', 'verify', 'verify-generated', { attemptId: started.attemptId, evidenceRefs });
  await rejectsIgnored(context, pending, [artifact.inputs[0].path, artifact.evidence.path]);
  await commit(context, pending);
  await commit(context, await preview(context, 'downstream', 'start', 'start-from-generated'));
});
