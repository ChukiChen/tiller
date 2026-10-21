import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { evaluateTaskNode, evaluateTaskStart } from '../dist/task-rules.js';
import { planningDigest } from '../dist/planning-data.js';

// Synthetic domain facts never create a project, a receipt or a real approval.
function inputFor({ dependencies = [], latest, completion = null, checkpoints = {issues: [], bindings: []} } = {}) {
  const reference = {repository: '.', path: 'spec.md'};
  const task = {id: 'subject', dependencies, basis: {requirements: {}, design: {}}, pendingDetails: [],
    specifications: {requirements: [reference], design: [reference], standards: [reference]}};
  const context = {root: 'synthetic', issues: [], registration: {plan: {ownerWorkId: 'example', tasks: [task]},
    taskDigests: {subject: 'definition'}}, state: {events: latest ? [latest] : []}};
  const input = {identity: planningDigest({root: context.root, workId: 'example', registration: context.registration, state: context.state}),
    order: [task], selectedIds: ['subject'], latest: new Map(latest ? [['subject', latest]] : []),
    specifications: new Map([[JSON.stringify(['.', 'spec.md']), {reference, digest: 'content', issues: [], error: null}]]),
    nodes: new Map([['subject', {start: checkpoints, completion}]])};
  return {context, input, task};
}

test('task rules consume explicit facts without filesystem access across pending, active and verified states', async () => {
  const originals = [];
  for (const object of [fs, fsp]) for (const name of ['readFile', 'readFileSync', 'open', 'openSync', 'lstat', 'lstatSync', 'stat', 'realpath', 'readdir']) {
    if (typeof object[name] !== 'function') continue;
    originals.push([object, name, object[name]]);
    object[name] = () => { throw new Error(`Domain rules attempted filesystem access: ${name}`); };
  }
  syncBuiltinESMExports();
  try {
    const pending = inputFor();
    assert.equal((await evaluateTaskNode(pending.context, pending.input, 'subject', new Map())).effectiveStatus, 'pending');
    const basis = evaluateTaskStart(pending.context, pending.task, {issues: [], bindings: []}, pending.input, new Map());
    const started = {kind: 'task-started', taskId: 'subject', taskDigest: basis.taskDigest,
      startBasisDigest: basis.startBasisDigest, sequence: 1, startEventSequence: 1, attemptId: 'attempt'};
    const active = inputFor({latest: started});
    assert.equal((await evaluateTaskNode(active.context, active.input, 'subject', new Map())).effectiveStatus, 'active');
    const completion = {issues: [], warnings: [], artifactSnapshots: {document: {'repo::file': 'digest'}},
      verificationBasisDigest: 'evidence', checkpointDigest: 'checkpoint'};
    const verified = inputFor({latest: {...started, kind: 'task-verified', ...completion}, completion});
    // Completion points to an actual start event supplied as explicit facts.
    verified.context.state.events[0] = started;
    verified.input.identity = planningDigest({root: verified.context.root, workId: 'example', registration: verified.context.registration, state: verified.context.state});
    assert.equal((await evaluateTaskNode(verified.context, verified.input, 'subject', new Map())).technicalReady, true);
    completion.verificationBasisDigest = 'changed';
    assert.equal((await evaluateTaskNode(verified.context, verified.input, 'subject', new Map())).effectiveStatus, 'stale');
  } finally {
    for (const [object, name, original] of originals) object[name] = original;
    syncBuiltinESMExports();
  }
});

test('task rules reject missing observations and foreign identities without trying to load them', async () => {
  const {context, input} = inputFor();
  await assert.rejects(evaluateTaskNode({...context, root: 'another'}, input, 'subject', new Map()), {code: 'TASK_INPUT_CHANGED'});
  input.nodes.clear();
  await assert.rejects(evaluateTaskNode(context, input, 'subject', new Map()), {code: 'TASK_INPUT_INCOMPLETE'});
});

test('task dependency rules distinguish missing, unverified and current artifacts using only input data', async () => {
  const {context, input} = inputFor({dependencies: [{taskId: 'parent', artifacts: ['document']}]});
  await assert.rejects(evaluateTaskNode(context, input, 'subject', new Map()), {code: 'TASK_INPUT_INCOMPLETE'});
  const parent = {taskId: 'parent', technicalReady: false, eventSequence: 1, effectiveStatus: 'stale', artifactSnapshots: {}};
  const completed = new Map([['parent', parent]]);
  assert.ok((await evaluateTaskNode(context, input, 'subject', completed)).blockingReasons.some(issue => issue.code === 'DEPENDENCY_NOT_VERIFIED'));
  parent.technicalReady = true;
  assert.ok((await evaluateTaskNode(context, input, 'subject', completed)).blockingReasons.some(issue => issue.code === 'DEPENDENCY_ARTIFACT_REQUIRED'));
  parent.artifactSnapshots.document = {'repo::file': 'digest'};
  assert.equal((await evaluateTaskNode(context, input, 'subject', completed)).effectiveStatus, 'pending');
  assert.equal(completed.size, 1);
});
