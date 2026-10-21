import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {createWorkflowFixture, stageStartInput} from './workflow-fixtures.mjs';
import {setupTasks, activateTaskPlan} from './task-helpers.mjs';
import {planWorkflowStageOperation, applyWorkflowStageOperation} from '../dist/workflow-stages.js';
import {planTaskOperation, applyTaskOperation} from '../dist/tasks.js';
import {put} from './helpers.mjs';

async function afterTransaction(root, action, mutation) {
  const native = fs.unlink; let changed = false;
  fs.unlink = async function (path, ...args) {
    const result = await native.call(this, path, ...args);
    if (!changed && String(path) === join(root, '.tiller/local/transaction.json')) { changed = true; mutation(); }
    return result;
  };
  syncBuiltinESMExports();
  try { await assert.rejects(action()); assert.equal(changed, true, 'Mutation must happen after the actual transaction'); }
  finally { fs.unlink = native; syncBuiltinESMExports(); }
}

test('stage post-write proof rolls back late source drift and preserves an external control edit', async t => {
  const f = await createWorkflowFixture(t);
  const input = stageStartInput(f, 'scope');
  const plan = await planWorkflowStageOperation(f.root, f.workId, 'scope', 'start', input);
  assert.equal(plan.operationAllowed, true);
  const state = `.tiller/work/${f.workId}/stages/state.json`;
  const source = readFileSync(join(f.root, 'instruction.md'), 'utf8');
  const apply = () => applyWorkflowStageOperation(f.root, f.workId, 'scope', 'start', input, plan.planId);
  await afterTransaction(f.root, apply, () => put(f.root, 'instruction.md', `${source}\nChanged after write.\n`));
  assert.equal(existsSync(join(f.root, state)), false, 'A failed initial start must leave no event');
  put(f.root, 'instruction.md', source);
  let external;
  await afterTransaction(f.root, apply, () => {
    external = readFileSync(join(f.root, state), 'utf8') + '\n';
    put(f.root, state, external);
    put(f.root, 'instruction.md', `${source}\nChanged with an external control edit.\n`);
  });
  assert.equal(readFileSync(join(f.root, state), 'utf8'), external);
});

test('task post-write proof rolls back late planning drift and preserves an external control edit', async t => {
  const f = await setupTasks(t, {taskIds: ['subject']}); await activateTaskPlan(f);
  const input = {operationId: 'commit-proof', expectedRevision: f.revision};
  const plan = await planTaskOperation(f.root, f.workId, 'subject', 'start', input);
  assert.equal(plan.operationAllowed, true);
  const state = `.tiller/work/${f.workId}/tasks.json`; const before = readFileSync(join(f.root, state), 'utf8');
  const sourcePath = f.plan.tasks[0].specifications.standards[0].path;
  const source = readFileSync(join(f.root, sourcePath), 'utf8');
  const apply = () => applyTaskOperation(f.root, f.workId, 'subject', 'start', input, plan.planId);
  await afterTransaction(f.root, apply, () => put(f.root, sourcePath, `${source}\nChanged after write.\n`));
  assert.equal(readFileSync(join(f.root, state), 'utf8'), before);
  put(f.root, sourcePath, source);
  let external;
  await afterTransaction(f.root, apply, () => {
    external = readFileSync(join(f.root, state), 'utf8') + '\n';
    put(f.root, state, external); put(f.root, sourcePath, `${source}\nChanged with external control edit.\n`);
  });
  assert.equal(readFileSync(join(f.root, state), 'utf8'), external);
});
