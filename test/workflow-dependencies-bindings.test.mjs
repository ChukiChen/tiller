import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { readWorkflowControlSnapshot } from '../dist/workflow-stages.js';
import { planWorkflowLinks, applyWorkflowLinks, inspectWorkflowDependencies, parseWorkflowLinksInput, withWorkflowDependencyTraversal, loadWorkflowDependencyInputs, evaluateWorkflowDependencyInputs, assertWorkflowDependencyInputsCurrent } from '../dist/workflow-dependencies.js';
import {
  createWorkflowFixture, workflowRef, stageSelection, startStage, completeStage, stageStatus,
} from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';
import { loadWorkflowPolicyContext } from '../dist/workflow-policy.js';

import { recordPath, record, source, another, complete, selector, input, link } from './workflow-dependency-fixtures.mjs';

test('producer resume requires explicit rebinding even when output bytes are unchanged', async t => {
  const producer = await createWorkflowFixture(t); const consumer = await another(producer, 'consumer');
  await complete(producer, 'scope'); await link(consumer, [selector(producer)]); await complete(consumer, 'scope');
  const originalBytes = readFileSync(join(producer.root, source(producer, 'scope-output').path), 'utf8');
  await withWorkflowDependencyTraversal(async () => {
    assert.equal((await inspectWorkflowDependencies(consumer.root, consumer.workId, 'scope')).facts[0].valid, true);
    await complete(producer, 'scope', 'resume');
    assert.equal(readFileSync(join(producer.root, source(producer, 'scope-output').path), 'utf8'), originalBytes);
    const stale = await inspectWorkflowDependencies(consumer.root, consumer.workId, 'scope');
    assert.equal(stale.facts[0].valid, false); assert.match(stale.issues.join(';'), /重新关联/);
  });
  assert.equal((await stageStatus(consumer, 'scope')).effectiveStatus, 'stale');
  await link(consumer, [selector(producer)]);
  assert.equal((await inspectWorkflowDependencies(consumer.root, consumer.workId, 'scope')).facts[0].valid, true);
  assert.equal((await stageStatus(consumer, 'scope')).effectiveStatus, 'stale', 'Rebinding does not fabricate a new consumer execution.');
  await complete(consumer, 'scope', 'resume');
  assert.equal((await stageStatus(consumer, 'scope')).effectiveStatus, 'verified');
});

test('removing a link invalidates its consumer basis without changing prior completed stages', async t => {
  const producer = await createWorkflowFixture(t); const consumer = await another(producer, 'consumer');
  await complete(producer, 'scope'); await complete(consumer, 'scope');
  await link(consumer, [selector(producer, 'evidence')]); await complete(consumer, 'evidence');
  await link(consumer, []);
  assert.deepEqual(record(consumer).links, []);
  assert.equal((await stageStatus(consumer, 'scope')).effectiveStatus, 'verified');
  assert.equal((await stageStatus(consumer, 'evidence')).effectiveStatus, 'stale');
});


test('explicit dependency inputs group producer stages and pure comparisons perform no reads', async t => {
  const producer = await createWorkflowFixture(t); const consumer = await another(producer, 'consumer');
  await complete(producer, 'scope');
  await link(consumer, [selector(producer, 'scope', 'scope', 'scope-link'), selector(producer, 'evidence', 'scope', 'evidence-link')]);
  const context = await loadWorkflowPolicyContext(consumer.root, consumer.workId);
  const inputs = await loadWorkflowDependencyInputs(consumer.root, context.record, context.snapshot, ['scope', 'evidence'], { context });
  assert.equal(inputs.producers.length, 1, 'Both links are explicit inputs from one producer work.');
  assert.equal(inputs.producers[0].stages.length, 1, 'The shared producer stage is evaluated once.');
  assert.throws(() => { inputs.producers[0].context.record.revision++; }, TypeError);
  const nativeRead = fsPromises.readFile; const nativeOpen = fsPromises.open; let reads = 0;
  fsPromises.readFile = async function (...args) { reads++; return nativeRead.apply(this, args); };
  fsPromises.open = async function (...args) { reads++; return nativeOpen.apply(this, args); };
  syncBuiltinESMExports();
  try {
    for (const stageId of ['scope', 'evidence']) assert.equal(evaluateWorkflowDependencyInputs(consumer.root, context.record, context.snapshot, stageId, inputs).facts[0].valid, true);
    assert.equal(reads, 0, 'Fact comparisons consume only explicit input data.');
  } finally { fsPromises.readFile = nativeRead; fsPromises.open = nativeOpen; syncBuiltinESMExports(); }
  put(producer.root, source(producer, 'scope-output').path, '# Changed after loading dependency inputs\n');
  await assert.rejects(assertWorkflowDependencyInputsCurrent(inputs), error =>
    error.code === 'CONTENT_CHANGED' || error.message === '验证求值依据在读取期间变化，请重新检查。');
  assert.equal((await inspectWorkflowDependencies(consumer.root, consumer.workId, 'scope')).facts[0].valid, false);
});
