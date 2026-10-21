import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { loadActivePlanning, loadPlanningState, assertActivePlanningCurrent } from '../dist/planning.js';
import { setupTasks, activateTaskPlan } from './task-helpers.mjs';

test('active planning reuses explicit state without reopening tasks control', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  await activateTaskPlan(context);
  const loaded = await loadPlanningState(context.root, context.workId);
  const original = fs.readFile;
  const target = join(context.root, loaded.path);
  let reads = 0;
  fs.readFile = async function(path, ...args) {
    if (String(path) === target) reads++;
    return original.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    const active = await loadActivePlanning(context.root, context.workId, loaded);
    assert.equal(active.ready, true);
    assert.equal(active.stateText, loaded.original);
    assert.equal(reads, 0, 'The owner already loaded tasks.json for this observation.');
    await loadActivePlanning(context.root, context.workId);
    assert.equal(reads, 1, 'An independent observation still loads current state.');
    for (const invalid of [
      { ...loaded, root: join(context.root, 'other') },
      { ...loaded, path: '.tiller/work/other/tasks.json' },
      { ...loaded, state: { ...loaded.state, ownerWorkId: 'other' } },
      { ...loaded, state: { ...loaded.state, revision: loaded.state.revision + 1 } },
      { ...loaded, original: null },
      { ...loaded, work: { ...loaded.work, original: '{}' } },
    ]) await assert.rejects(loadActivePlanning(context.root, context.workId, invalid), { code: 'PLANNING_INPUT_CHANGED' });
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

test('active planning proof retains material and control freshness without reevaluating approval rules', async t => {
  const context = await setupTasks(t, { taskIds: ['foundation'] });
  await activateTaskPlan(context);
  const input = await loadActivePlanning(context.root, context.workId);
  assert.equal(input.ready, true);
  await assertActivePlanningCurrent(input);
  const subject = input.registration.specificationFiles[0];
  const target = join(context.root, subject.path);
  const original = await fs.readFile(target, 'utf8');
  await fs.writeFile(target, original + '\nExternal specification change.\n');
  await assert.rejects(assertActivePlanningCurrent(input), /变化|不一致/u);
  await fs.writeFile(target, original);
  await assertActivePlanningCurrent(input);
  const tasks = join(context.root, `.tiller/work/${context.workId}/tasks.json`);
  await fs.appendFile(tasks, '\n');
  await assert.rejects(assertActivePlanningCurrent(input), /控制记录/u);
});
