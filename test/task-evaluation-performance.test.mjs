import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { linkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { initialize } from '../dist/core.js';
import * as tasks from '../dist/tasks.js';
import { planningDigest } from '../dist/planning.js';
import { validateTaskHistory } from '../dist/task-records.js';
import { fixture, put } from './helpers.mjs';

function context(root, count = 12) {
  // A synthetic, already-loaded pending context exercises the internal evaluator;
  // it never creates task/control records or represents an approved real plan.
  const spec = { repository: '.', path: 'shared-spec.md' };
  const definitions = Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`, scope: { repositories: ['.'], targets: ['synthetic'] },
    basis: { requirements: {}, design: {} },
    specifications: { requirements: [spec], design: [spec], standards: [spec] },
    pendingDetails: [], dependencies: [], humanCheckpoints: [],
  }));
  return { root, issues: [], state: { revision: 0, events: [] },
    registration: { plan: { ownerWorkId: 'synthetic', revision: 'v-one', tasks: definitions },
      taskDigests: Object.fromEntries(definitions.map(task => [task.id, 'a'.repeat(64)])) } };
}

test('explicit task inputs cannot cross projects with identical planning records', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Specification\nCurrent result.\n');
  const first = context(root, 1);
  const input = await tasks.loadTaskEvaluationInput(first);
  const evaluated = await tasks.evaluateTaskInputs(first, input);
  const other = { ...first, root: fixture(t) };
  await assert.rejects(tasks.evaluateTaskInputs(other, input), { code: 'TASK_INPUT_CHANGED' });
  await assert.rejects(tasks.inspectTasksInPlanning(other, undefined, { input, tasks: evaluated }), { code: 'TASK_INPUT_CHANGED' });
});

async function duringSpecRead(root, fn, mutate) {
  const target = join(root, 'shared-spec.md');
  const original = fs.readFile;
  let reads = 0;
  fs.readFile = async function(path, ...args) {
    const contents = await original.call(this, path, ...args);
    if (String(path) === target) {
      reads++;
      if (reads === 1 && mutate) await mutate();
    }
    return contents;
  };
  syncBuiltinESMExports();
  try { return await fn(() => reads); }
  finally { fs.readFile = original; syncBuiltinESMExports(); }
}

test('pending tasks share specification reads and each independent inspection reads fresh bytes', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Synthetic specification\nDescribe the current expected result.\n');
  const current = context(root);
  await duringSpecRead(root, async reads => {
    const first = await tasks.inspectTasksInPlanning(current);
    assert.equal(first.tasks.length, 12);
    assert.ok(first.tasks.every(task => task.effectiveStatus === 'pending'));
    assert.equal(reads(), 2, 'Read the shared body once, then prove the same bytes before returning.');
    writeFileSync(join(root, 'shared-spec.md'), '');
    const second = await tasks.inspectTasksInPlanning(current);
    assert.ok(second.tasks.every(task => task.blockingReasons.some(issue => issue.code === 'TASK_SPECIFICATIONS_INVALID')));
    assert.equal(reads(), 4, 'An independent query must not inherit the previous specification.');
  });
});

test('specification changes during task evaluation reject explicit input proof', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Synthetic specification\nOriginal current result.\n');
  await duringSpecRead(root, async () => {
    await assert.rejects(tasks.inspectTasksInPlanning(context(root)),
      { code: 'TASK_SPECIFICATIONS_CHANGED' });
  }, () => writeFileSync(join(root, 'shared-spec.md'), '# Changed specification\nChanged during evaluation.\n'));
});

test('one stage can evaluate its task union once and project delegations without further reads', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Synthetic specification\nCurrent stage input.\n');
  const current = context(root, 3);
  await duringSpecRead(root, async reads => {
    const input = await tasks.loadTaskEvaluationInput(current, ['task-0', 'task-1']);
    const statuses = await tasks.evaluateTaskInputs(current, input);
    assert.equal(reads(), 1);
    const evaluation = { input, tasks: statuses };
    assert.equal((await tasks.inspectTasksInPlanning(current, ['task-0'], evaluation)).tasks[0].taskId, 'task-0');
    assert.equal((await tasks.inspectTasksInPlanning(current, ['task-1'], evaluation)).tasks[0].taskId, 'task-1');
    assert.equal(reads(), 1, 'Projection is pure and does not reopen specifications.');
    await tasks.assertTaskEvaluationInputCurrent(input);
    assert.equal(reads(), 2);
    writeFileSync(join(root, 'shared-spec.md'), '# Changed specification\nA new independent input sees current bytes.\n');
    await assert.rejects(tasks.assertTaskEvaluationInputCurrent(input), { code: 'TASK_SPECIFICATIONS_CHANGED' });
    const fresh = await tasks.inspectTasksInPlanning(current, ['task-1']);
    assert.equal(fresh.tasks[0].effectiveStatus, 'pending');
  });
});

test('explicit dependency graph visits a shared ancestor once and keeps cancelled history', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Synthetic specification\nCurrent dependency contract.\n');
  const current = context(root, 4);
  current.registration.plan.tasks[1].dependencies = [{ taskId: 'task-0', artifacts: [] }];
  current.registration.plan.tasks[2].dependencies = [{ taskId: 'task-0', artifacts: [] }];
  current.registration.plan.tasks[3].dependencies = [{ taskId: 'task-1', artifacts: [] }, { taskId: 'task-2', artifacts: [] }];
  const input = await tasks.loadTaskEvaluationInput(current, 'task-3');
  const statuses = await tasks.evaluateTaskInputs(current, input);
  assert.equal(statuses.length, 4);
  assert.equal(new Set(statuses.map(task => task.taskId)).size, 4);
  assert.equal(statuses[0].taskId, 'task-0');
  assert.equal(statuses.at(-1).taskId, 'task-3');
  assert.equal(statuses.at(-1).effectiveStatus, 'blocked');
  assert.ok(statuses.at(-1).blockingReasons.some(reason => reason.code === 'DEPENDENCY_NOT_VERIFIED'));
  current.state.events.push({ kind: 'task-started', taskId: 'removed', attemptId: 'historical', sequence: 1 });
  const historyInput = await tasks.loadTaskEvaluationInput(current, ['removed']);
  const projected = tasks.projectTaskStatuses(current, await tasks.evaluateTaskInputs(current, historyInput), ['removed']);
  assert.equal(projected.tasks[0].effectiveStatus, 'cancelled');
});

test('a cyclic selected dependency graph rejects before evaluation', async t => {
  const root = fixture(t); await initialize({ root });
  const current = context(root, 2);
  current.registration.plan.tasks[0].dependencies = [{ taskId: 'task-1', artifacts: [] }];
  current.registration.plan.tasks[1].dependencies = [{ taskId: 'task-0', artifacts: [] }];
  await assert.rejects(tasks.loadTaskEvaluationInput(current, 'task-0'), { code: 'TASK_DEPENDENCY_CYCLE' });
});

test('task history validation visits receipt entries in proportion to history size', () => {
  const count = 500;
  const events = [{ sequence: 1, kind: 'planning-activated', revision: 'v-one' }];
  const receipts = [];
  for (let index = 0; index < count; index++) {
    const event = { sequence: index + 2, operationId: `operation-${index}`, kind: 'task-started',
      taskId: `task-${index}`, attemptId: `attempt-${index}`, planningRevision: 'v-one', dependencies: [] };
    events.push(event);
    receipts.push({ operationId: event.operationId, kind: 'task-start', taskId: event.taskId,
      attemptId: event.attemptId, eventSequence: event.sequence, planningRevision: event.planningRevision });
  }
  let visits = 0;
  const operations = new Proxy(receipts, { get(target, property, receiver) {
    if (typeof property === 'string' && /^\d+$/u.test(property)) visits++;
    return Reflect.get(target, property, receiver);
  } });
  const state = { ownerWorkId: 'synthetic', events, operations };
  assert.doesNotThrow(() => validateTaskHistory(state));
  assert.ok(visits <= count * 4, `Expected linear receipt visits, observed ${visits}.`);
  const mismatched = structuredClone(receipts);
  mismatched.at(-1).attemptId = 'different-attempt';
  assert.throws(() => validateTaskHistory({ ...state, operations: mismatched }), /事件与操作回执/u);
});

test('concurrent independent task inputs do not share source observations', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Synthetic specification\nIndependent inputs.\n');
  const current = context(root, 2);
  await duringSpecRead(root, async reads => {
    const [first, second] = await Promise.all([
      tasks.loadTaskEvaluationInput(current), tasks.loadTaskEvaluationInput(current),
    ]);
    assert.notEqual(first, second);
    assert.equal(reads(), 2);
    writeFileSync(join(root, 'shared-spec.md'), '');
    await assert.rejects(tasks.assertTaskEvaluationInputCurrent(first), { code: 'TASK_SPECIFICATIONS_CHANGED' });
    await assert.rejects(tasks.assertTaskEvaluationInputCurrent(second), { code: 'TASK_SPECIFICATIONS_CHANGED' });
  });
});

test('invalid linked specifications block only tasks that actually reference them', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Valid specification\nCurrent expected result.\n');
  put(root, 'linked-source.md', '# Independent linked document\nInvalid access.\n');
  linkSync(join(root, 'linked-source.md'), join(root, 'linked-spec.md'));
  const current = context(root, 2);
  current.registration.plan.tasks[0].specifications.requirements = [{ repository: '.', path: 'linked-spec.md' }];
  const result = await tasks.inspectTasksInPlanning(current);
  assert.ok(result.tasks[0].blockingReasons.some(issue => issue.code === 'TASK_SPECIFICATIONS_INVALID' && /硬链接/u.test(issue.message)));
  assert.equal(result.tasks[1].effectiveStatus, 'pending');
});

test('verification identity checks start basis without evaluating its own completed task', async t => {
  const root = fixture(t); await initialize({ root });
  put(root, 'shared-spec.md', '# Task specification\nCurrent task start conditions.\n');
  const current = context(root, 1);
  const taskDigest = current.registration.taskDigests['task-0'];
  const checkpointDigest = planningDigest([]);
  const started = { kind: 'task-started', taskId: 'task-0', sequence: 1, startEventSequence: 1,
    taskDigest, startBasisDigest: planningDigest({ taskDigest, dependencies: [], checkpointDigest }),
    checkpointRefs: [], attemptId: 'current-attempt' };
  current.state.events.push(started, { ...started, kind: 'task-verified', sequence: 2 });
  // This context deliberately has no completion artifact/verification definitions.
  assert.equal(await tasks.inspectTaskVerificationInPlanning(current, 'task-0', true), taskDigest);
});
