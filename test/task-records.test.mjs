import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { withProjectLock, hasPendingTransaction } from '../dist/files.js';
import { parsePlanningState, savePlanningState } from '../dist/planning.js';
import { parseTaskInput } from '../dist/task-records.js';
import { fixture, put } from './helpers.mjs';

const hash = 'a'.repeat(64);
const confirmation = { workId: 'planning-work', requestId: 'planning', decisionId: 'approved' };
function sampleState() {
  const state = { schemaVersion: 1, ownerWorkId: 'planning-work', revision: 4,
    activePlanning: { revision: 'v-one', confirmation, definitionDigest: hash, eventSequence: 1 },
    operations: [{ operationId: 'register', inputDigest: hash, kind: 'register', revision: 1, planningRevision: 'v-one', basisDigest: hash, operationAllowed: true, technicalReady: false, blockingReasons: [] },
      { operationId: 'activate', inputDigest: hash, kind: 'activate', revision: 2, planningRevision: 'v-one', basisDigest: hash, operationAllowed: true, technicalReady: false, blockingReasons: [] }],
    events: [{ sequence: 1, operationId: 'activate', kind: 'planning-activated', at: '2026-10-19T00:00:00.000Z', revision: 'v-one', definitionDigest: hash, confirmation, changes: { added: ['document'], changed: [], retainedCandidates: [], removed: [], removedRequirements: [] } }],
  };
  const start = { sequence: 2, operationId: 'start', kind: 'task-started', at: '2026-10-19T00:00:01.000Z', taskId: 'document', attemptId: 'attempt-one', planningRevision: 'v-one', taskDigest: hash, startBasisDigest: hash, dependencies: [], checkpointRefs: [], checkpointDigest: hash, startEventSequence: 2, artifactSnapshots: {}, verificationBasisDigest: null, evidenceRefs: [] };
  const verified = { ...start, sequence: 3, operationId: 'verify', kind: 'task-verified', at: '2026-10-19T00:00:02.000Z', artifactSnapshots: { document: { '.::docs/result.md': hash } }, verificationBasisDigest: hash, evidenceRefs: [{ workId: 'planning-work', runId: 'record-one', checkId: 'document-review' }] };
  state.events.push(start, verified);
  for (const event of [start, verified]) state.operations.push({ operationId: event.operationId, inputDigest: hash, kind: event.kind === 'task-verified' ? 'task-verify' : 'task-start', revision: event.sequence + 1, planningRevision: 'v-one', basisDigest: hash, operationAllowed: true, technicalReady: event.kind === 'task-verified', blockingReasons: [], taskId: event.taskId, attemptId: event.attemptId, eventSequence: event.sequence });
  return state;
}
test('task state preserves ordered start and completion facts and rejects invented or mismatched attempts', () => {
  const state = sampleState();
  assert.equal(parsePlanningState(JSON.stringify(state), 'planning-work').events.length, 3);
  const optionalOnly = structuredClone(state); optionalOnly.events[2].artifactSnapshots = {};
  assert.deepEqual(parsePlanningState(JSON.stringify(optionalOnly), 'planning-work').events[2].artifactSnapshots, {});
  const mutations = [
    value => { value.events[2].attemptId = 'unstarted'; value.operations[3].attemptId = 'unstarted'; },
    value => { value.events[2].startEventSequence = 1; },
    value => { value.events[2].startBasisDigest = 'b'.repeat(64); },
    value => { value.events[1].kind = 'task-resumed'; value.operations[2].kind = 'task-resume'; },
    value => { value.events[2].dependencies = [{ taskId: 'document', eventSequence: 3, artifactDigest: hash }]; },
    value => { value.events[2].artifactSnapshots = { document: { '.::.tiller/work/planning-work/tasks.json': hash } }; },
    value => { value.events[1].extra = true; },
    value => { value.operations[3].eventSequence = 2; },
    value => { value.events[1].planningRevision = 'v-other'; value.operations[2].planningRevision = 'v-other'; },
  ];
  for (const mutation of mutations) {
    const invalid = structuredClone(state); mutation(invalid);
    assert.throws(() => parsePlanningState(JSON.stringify(invalid), 'planning-work'));
  }
  assert.deepEqual(parseTaskInput({ operationId: 'start', expectedRevision: 2 }, 'start').checkpointRefs, []);
  assert.throws(() => parseTaskInput({ operationId: 'verify', expectedRevision: 3 }, 'verify'), /attemptId/u);
  assert.throws(() => parseTaskInput({ operationId: 'start', expectedRevision: 2, force: true }, 'start'), /未知/u);
});

test('task post-write validation restores its own control bytes and preserves concurrent external edits', async t => {
  const root = fixture(t); await initialize({ root, mode: 'project' });
  const path = '.tiller/work/transaction-test/tasks.json';
  const state = { schemaVersion: 1, ownerWorkId: 'transaction-test', revision: 0, activePlanning: null, events: [], operations: [] };
  const before = JSON.stringify(state); put(root, path, before);
  await assert.rejects(withProjectLock(root, () => savePlanningState(root, 'transaction-test', before, state, [], undefined, async () => {
    assert.equal(await hasPendingTransaction(root), false);
    throw new Error('post-write basis changed');
  })), /post-write basis changed/u);
  assert.equal(readFileSync(join(root, path), 'utf8'), before);
  assert.equal(await hasPendingTransaction(root), false);
  await assert.rejects(withProjectLock(root, () => savePlanningState(root, 'transaction-test', before, state, [], undefined, async () => {
    put(root, path, 'external concurrent bytes');
    throw new Error('post-write basis changed');
  })), { code: 'CONTENT_CHANGED' });
  assert.equal(readFileSync(join(root, path), 'utf8'), 'external concurrent bytes');
});

test('excepted verification preserves failures and permits a later real verification of the same attempt', () => {
  const state = sampleState();
  const completed = state.events.pop(); const receipt = state.operations.pop();
  const extra = { technicalBasisDigest: hash,
    exceptions: [{ reference: { workId: 'planning-work', requestId: 'exception', decisionId: 'approved' }, requestFingerprint: hash, decisionFingerprint: hash,
      conditionIds: ['condition-failed'], reason: '仅继续当前任务操作，真实缺口保留。', allowedAction: 'verify', endCondition: 'basis-change-or-revocation', basisDigest: hash }],
    failureReasons: [{ code: 'VERIFICATION_REQUIRED', conditionId: 'condition-failed', message: '必要检查尚未运行。', nextAction: '补足检查。', exceptionAllowed: true, taskId: 'document' }] };
  state.events.push({ ...completed, operationId: 'verify-excepted', kind: 'task-verification-excepted', ...extra }, { ...completed, sequence: 4 });
  state.operations.push({ ...receipt, operationId: 'verify-excepted', technicalReady: false, ...extra }, { ...receipt, eventSequence: 4, revision: 5 });
  state.revision = 5;
  assert.equal(parsePlanningState(JSON.stringify(state), 'planning-work').events.at(-1).kind, 'task-verified');
  const mutations = [
    value => { value.events[2].kind = 'task-verified'; },
    value => { value.events[2].failureReasons = []; value.operations[3].failureReasons = []; },
    value => { value.events[2].exceptions[0].allowedAction = 'start'; value.operations[3].exceptions[0].allowedAction = 'start'; },
    value => { value.events[2].failureReasons[0].exceptionAllowed = false; },
    value => { value.operations[3].technicalReady = true; },
    value => { value.events[3].startEventSequence = 3; },
    value => { value.events[2].exceptions[0].reference.workId = 'other-work'; value.operations[3].exceptions[0].reference.workId = 'other-work'; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(state); mutate(invalid);
    assert.throws(() => parsePlanningState(JSON.stringify(invalid), 'planning-work'));
  }
});
