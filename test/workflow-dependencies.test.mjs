import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { readWorkflowControlSnapshot } from '../dist/workflow-stages.js';
import { planWorkflowLinks, applyWorkflowLinks, inspectWorkflowDependencies, parseWorkflowLinksInput, withWorkflowDependencyTraversal } from '../dist/workflow-dependencies.js';
import {
  createWorkflowFixture, workflowRef, stageSelection, startStage, completeStage, stageStatus,
} from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

import { recordPath, record, source, another, complete, selector, input, link } from './workflow-dependency-fixtures.mjs';

test('linked stages bind current verified producer output and invalidate only affected stages', async t => {
  const producer = await createWorkflowFixture(t); const consumer = await another(producer, 'consumer');
  await complete(producer, 'scope'); await complete(producer, 'evidence');
  await complete(consumer, 'scope');
  const generation = record(consumer).workflowRevision;
  const linked = await link(consumer, [selector(producer, 'evidence')]);
  assert.equal(record(consumer).workflowRevision, generation, 'Link changes do not invalidate unrelated intent approvals.');
  assert.equal(linked.plan.links[0].binding.attemptId, (await stageStatus(producer, 'scope')).attemptId);
  assert.equal((await stageStatus(consumer, 'scope')).effectiveStatus, 'verified');
  await complete(consumer, 'evidence');
  assert.equal((await stageStatus(consumer, 'evidence')).effectiveStatus, 'verified');
  put(producer.root, source(producer, 'evidence-output').path, '# Changed independent output\nObserved fixture output.\n');
  assert.equal((await stageStatus(consumer, 'evidence')).effectiveStatus, 'verified', 'Unconsumed producer stages do not invalidate the consumer.');
  put(producer.root, source(producer, 'scope-output').path, '# Changed consumed output\nObserved fixture output.\n');
  assert.equal((await stageStatus(consumer, 'scope')).effectiveStatus, 'verified');
  assert.equal((await stageStatus(consumer, 'evidence')).effectiveStatus, 'stale');
  assert.equal((await inspectWorkflowDependencies(consumer.root, consumer.workId, 'evidence')).facts[0].valid, false);
  const before = readFileSync(recordPath(consumer), 'utf8');
  const replay = await applyWorkflowLinks(consumer.root, consumer.workId, linked.value, linked.plan.planId);
  assert.equal(replay.historical, true); assert.equal(replay.currentValidity, 'not-evaluated');
  assert.equal(readFileSync(recordPath(consumer), 'utf8'), before);
});

test('links reject missing or mismatched producers, self links, duplicate edges, and stale preview snapshots', async t => {
  const producer = await createWorkflowFixture(t); const consumer = await another(producer, 'consumer');
  const pending = await planWorkflowLinks(consumer.root, consumer.workId, await input(consumer, [selector(producer)]));
  assert.equal(pending.operationAllowed, false);
  await complete(producer, 'scope');
  for (const edge of [
    selector(consumer),
    { ...selector(producer), consumerStageId: 'absent' },
    { ...selector(producer), producer: { workId: producer.workId, stageId: 'evidence', outputId: 'scope-output' } },
  ]) {
    const plan = await planWorkflowLinks(consumer.root, consumer.workId, await input(consumer, [edge]));
    assert.equal(plan.operationAllowed, false);
  }
  const value = await input(consumer, [selector(producer)]);
  assert.throws(() => parseWorkflowLinksInput({ ...value, links: [selector(producer), selector(producer, 'scope', 'scope', 'duplicate')] }), /重复/);
  assert.throws(() => parseWorkflowLinksInput({ ...value, unrelated: true }), /字段/);
  const plan = await planWorkflowLinks(consumer.root, consumer.workId, value);
  const before = readFileSync(recordPath(consumer), 'utf8');
  put(producer.root, source(producer, 'scope-output').path, '# Changed after preview\nObserved fixture output.\n');
  await assert.rejects(applyWorkflowLinks(consumer.root, consumer.workId, value, plan.planId), { code: 'CONTENT_CHANGED' });
  assert.equal(readFileSync(recordPath(consumer), 'utf8'), before);
  await complete(consumer, 'scope');
  await assert.rejects(planWorkflowLinks(consumer.root, consumer.workId, value), { code: 'REVISION_CONFLICT' });
});
