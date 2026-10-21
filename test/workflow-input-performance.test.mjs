import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { createWorkflowFixture } from './workflow-fixtures.mjs';
import { another, complete, selector, link } from './workflow-dependency-fixtures.mjs';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';
import { loadWorkflowDependencyInputs, assertWorkflowDependencyInputsCurrent, inspectWorkflowDependencies } from '../dist/workflow-dependencies.js';
import { withWorkflowStageInputs, inspectWorkflowStagesInInput } from '../dist/workflow-stages.js';
import { setupTasks, activateTaskPlan } from './task-helpers.mjs';
import { put } from './helpers.mjs';

test('stage inputs load only selected outputs and reject a missing output appearing before proof', async t => {
  const f = await createWorkflowFixture(t);
  await complete(f, 'scope');
  const output = `outputs/${f.workId}/scope-output.md`;
  const target = join(f.root, output);
  const original = readFileSync(target, 'utf8');
  const nativeRead = fs.readFile; let reads = 0;
  fs.readFile = async function (path, ...args) {
    if (String(path) === target) reads++;
    return nativeRead.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    await withWorkflowStageInputs(f.root, f.workId, async ({ evaluated }) => {
      assert.equal(reads, 0, 'Loading controls must not eagerly load registered outputs');
      await evaluated.loadOutputs(['scope-output']);
      await evaluated.loadOutputs(['scope-output']);
      assert.equal(reads, 1, 'One declared output is read once during materialization');
      assert.equal(evaluated.artifact('scope-output').content, original);
    });
    assert.equal(reads, 2, 'The operation owner independently proves the selected output');
    await fs.unlink(target);
    await assert.rejects(withWorkflowStageInputs(f.root, f.workId, async ({ evaluated }) => {
      await evaluated.loadOutputs(['scope-output']);
      assert.equal(evaluated.artifact('scope-output').content, null);
      put(f.root, output, original);
    }), {code: 'CONTENT_CHANGED'});
  } finally { fs.readFile = nativeRead; syncBuiltinESMExports(); }
});

test('one explicit diamond input loads producer contexts and evaluates shared stage nodes once', async t => {
  const d = await createWorkflowFixture(t);
  const finished = await complete(d, 'scope');
  const b = await another(d, 'branch-b'); const c = await another(d, 'branch-c');
  await link(b, [selector(d)]); await complete(b, 'scope');
  await link(c, [selector(d)]); await complete(c, 'scope');
  const a = await another(d, 'consumer-a');
  await link(a, [selector(b, 'scope', 'scope', 'from-b'), selector(c, 'scope', 'scope', 'from-c')]);
  const context = await loadWorkflowPolicyContext(a.root, a.workId);
  const parsed = new Map(); const evaluated = new Map();
  const nativeParse = JSON.parse; const nativeHash = crypto.createHash;
  JSON.parse = function (text, ...args) {
    const value = nativeParse.call(this, text, ...args);
    if (value?.schemaVersion === 4 && value.id && new Error().stack.includes('loadWorkflowPolicyContext ('))
      parsed.set(value.id, (parsed.get(value.id) ?? 0) + 1);
    return value;
  };
  crypto.createHash = function (...args) {
    const hash = nativeHash.apply(this, args); const update = hash.update;
    hash.update = function (text, ...rest) {
      if (typeof text === 'string' && text.startsWith('{')) {
        let value; try { value = nativeParse(text); } catch {}
        if (value?.stageId === 'scope' && Object.hasOwn(value, 'linkedDependencies') && Object.hasOwn(value, 'delegatedDefinition'))
          evaluated.set(value.intentDigest, (evaluated.get(value.intentDigest) ?? 0) + 1);
      }
      return update.call(this, text, ...rest);
    };
    return hash;
  };
  syncBuiltinESMExports();
  let inputs;
  try {
    inputs = await loadWorkflowDependencyInputs(a.root, context.record, context.snapshot, ['scope'], { context });
    assert.deepEqual(inputs.issues, []);
    for (const owner of [b, c, d]) assert.equal(parsed.get(owner.workId), 1, `${owner.workId}: input load excludes separate control-byte proofs`);
    assert.equal(evaluated.size, 3);
    assert.ok([...evaluated.values()].every(count => count === 1), `Each DAG node must be evaluated once: ${JSON.stringify([...evaluated])}`);
  } finally { JSON.parse = nativeParse; crypto.createHash = nativeHash; syncBuiltinESMExports(); }
  const output = `outputs/${d.workId}/scope-output.md`; const originalOutput = readFileSync(join(d.root, output), 'utf8');
  put(d.root, output, '# Changed shared ancestor\nChanged after the explicit input was returned.\n');
  await assert.rejects(assertWorkflowDependencyInputsCurrent(inputs));
  put(d.root, output, originalOutput);
  const run = JSON.parse(readFileSync(join(d.root, `.tiller/work/${d.workId}/verification-runs/${finished.evidenceRefs[0].runId}.json`), 'utf8'));
  const originalEvidence = readFileSync(join(d.root, run.results[0].evidence.path), 'utf8');
  put(d.root, run.results[0].evidence.path, '# Changed ancestor observations\nChanged after graph evaluation.\n');
  await assert.rejects(assertWorkflowDependencyInputsCurrent(inputs));
  put(d.root, run.results[0].evidence.path, originalEvidence);
  const configPath = '.tiller/verification/config.json';
  const config = JSON.parse(readFileSync(join(d.root, configPath), 'utf8'));
  put(d.root, configPath, JSON.stringify({ ...config, modules: ['changed-after-evaluation'] }));
  await assert.rejects(assertWorkflowDependencyInputsCurrent(inputs));
});

test('a stage DAG may return to an earlier owner stage with its own external dependency', async t => {
  const c = await createWorkflowFixture(t); await complete(c, 'scope');
  const a = await another(c, 'owner-a'); await link(a, [selector(c)]); await complete(a, 'scope');
  const b = await another(c, 'middle-b'); await link(b, [selector(a)]); await complete(b, 'scope');
  await link(a, [selector(c), selector(b, 'evidence', 'scope', 'via-b')]);
  const inspected = await inspectWorkflowDependencies(a.root, a.workId, 'evidence');
  assert.deepEqual(inspected.issues, []);
  assert.equal(inspected.facts[0].valid, true, 'A.evidence -> B.scope -> A.scope -> C.scope is acyclic.');
});

test('stage task projections reuse one explicit specification input and prove it once on return', { timeout: 1_800_000 }, async t => {
  const f = await setupTasks(t, { taskIds: ['task-a', 'task-b'] });
  await activateTaskPlan(f);
  const target = join(f.root, f.plan.tasks[0].specifications.standards[0].path);
  const nativeRead = fs.readFile; let reads = 0; let beforeProof = 0;
  fs.readFile = async function (path, ...args) {
    if (String(path) === target) reads++;
    return nativeRead.call(this, path, ...args);
  };
  syncBuiltinESMExports();
  try {
    await withWorkflowStageInputs(f.root, f.workId, async ({ evaluated }) => {
      // Count only the task input phase; planning/approval material loading is separate.
      await evaluated.loadDevelopment();
      const before = reads;
      const first = await evaluated.development(['task-a']);
      const second = await evaluated.development(['task-a', 'task-b']);
      const all = await evaluated.development();
      assert.equal(first.status.tasks.length, 1); assert.equal(second.status.tasks.length, 2); assert.equal(all.status.tasks.length, 2);
      assert.ok(reads - before <= 1, `A task input may be loaded once, never once per projection: ${reads - before}`);
      beforeProof = reads;
    });
    assert.equal(reads - beforeProof, 1, 'The owner independently proves the consumed specification once before return.');
    await assert.rejects(withWorkflowStageInputs(f.root, f.workId, async ({ evaluated }) => {
      await evaluated.development(['task-a']);
      put(f.root, f.plan.tasks[0].specifications.standards[0].path, '# Changed standard\nChanged before final proof.\n');
    }), { code: 'TASK_SPECIFICATIONS_CHANGED' });
  } finally { fs.readFile = nativeRead; syncBuiltinESMExports(); }
});

test('an earlier stage does not load later development controls, while task inspection still proves them', async t => {
  const f = await setupTasks(t, {taskIds: ['task-a']});
  await activateTaskPlan(f);
  const path = `.tiller/work/${f.workId}/tasks.json`;
  const target = join(f.root, path);
  const original = readFileSync(target, 'utf8');
  const nativeRead = fs.readFile; let reads = 0;
  fs.readFile = async function(file, ...args) {
    if (String(file) === target) reads++;
    return nativeRead.call(this, file, ...args);
  };
  syncBuiltinESMExports();
  try {
    await withWorkflowStageInputs(f.root, f.workId, async input => {
      const observed = await inspectWorkflowStagesInInput(input, 'requirements');
      assert.equal(observed.development, null);
      const {current} = input;
      assert.equal(current.tasksInput, undefined);
    });
    assert.equal(reads, 0, 'An independent earlier stage must not load later planning controls.');
    await assert.rejects(withWorkflowStageInputs(f.root, f.workId, async ({evaluated}) => {
      assert.ok(await evaluated.development(['task-a']));
      put(f.root, path, `${original}\n`);
    }), /控制记录.*变化|依据已变化/u);
    assert.ok(reads > 0);
  } finally { put(f.root, path, original); fs.readFile = nativeRead; syncBuiltinESMExports(); }
});
