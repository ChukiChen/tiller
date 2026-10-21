import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspectWorkDelivery, planWorkDeliveryReady, applyWorkDeliveryReady } from '../dist/overall-delivery.js';
import { inspectWorkflowStages } from '../dist/workflow-stages.js';
import { createWorkflowFixture, completeWorkflow } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';
import { another, complete, link, selector, source } from './workflow-dependency-fixtures.mjs';

test('delivery checks sharing of the actual output, evidence and control files without changing ordinary reads', async t => {
  const f = await createWorkflowFixture(t);
  const finished = await completeWorkflow(f);
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const input = { verification: finished.verification, checkMappings: finished.checkMappings, evidenceRefs: finished.evidenceRefs };
  const checked = await inspectWorkDelivery(f.root, f.workId, input);
  assert.equal(checked.technicalReady, true, JSON.stringify(checked.issues));
  const ready = { ...input, operationId: 'shared-ready', expected: checked.controlSnapshot };
  const plan = await planWorkDeliveryReady(f.root, f.workId, ready);
  const run = JSON.parse(readFileSync(join(f.root, `.tiller/work/${f.workId}/verification-runs/${finished.evidenceRefs[0].runId}.json`), 'utf8'));
  const originalIgnore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  for (const relative of ['outputs/report-output.md', run.results[0].evidence.path,
    `.tiller/work/${f.workId}/stages/state.json`, 'instruction.md']) {
    await t.test(`ignored ${relative} blocks delivery`, async () => {
      put(f.root, '.gitignore', `${originalIgnore}\n/${relative}\n`);
      try {
        const ordinary = await inspectWorkflowStages(f.root, f.workId, 'report');
        assert.equal(ordinary.stages[0].effectiveStatus, 'verified', JSON.stringify(ordinary.issues));
        const rejected = await inspectWorkDelivery(f.root, f.workId, input);
        assert.equal(rejected.technicalReady, false);
        assert.equal(rejected.operationAllowed, false);
        assert.ok(rejected.issues.some(issue => issue.code === 'DELIVERY_SHARING_INVALID' && issue.message.includes(relative)));
        await assert.rejects(applyWorkDeliveryReady(f.root, f.workId, ready, plan.planId));
        assert.equal(existsSync(join(f.root, `.tiller/work/${f.workId}/delivery-checks/shared-ready.json`)), false);
      } finally { put(f.root, '.gitignore', originalIgnore); }
    });
  }
  assert.equal((await inspectWorkDelivery(f.root, f.workId, input)).technicalReady, true);
});

test('delivery sharing follows only the producer stage consumed by a workflow link', async t => {
  const producer = await createWorkflowFixture(t);
  await complete(producer, 'scope');
  const consumer = await another(producer, 'consumer');
  await link(consumer, [selector(producer)]);
  const finished = await completeWorkflow(consumer);
  execFileSync('git', ['init', '--quiet', producer.root], { windowsHide: true });
  const input = { verification: finished.verification, checkMappings: finished.checkMappings, evidenceRefs: finished.evidenceRefs };
  const originalIgnore = readFileSync(join(producer.root, '.gitignore'), 'utf8');
  const original = await inspectWorkDelivery(consumer.root, consumer.workId, input);
  assert.equal(original.technicalReady, true, JSON.stringify(original.issues));
  for (const relative of [source(producer, 'scope-output').path, `.tiller/work/${producer.workId}/stages/state.json`]) {
    put(producer.root, '.gitignore', `${originalIgnore}\n/${relative}\n`);
    try {
      const checked = await inspectWorkDelivery(consumer.root, consumer.workId, input);
      assert.equal(checked.operationAllowed, false);
      assert.ok(checked.issues.some(issue => issue.code === 'DELIVERY_SHARING_INVALID' && issue.message.includes(relative)));
    } finally { put(producer.root, '.gitignore', originalIgnore); }
  }
  put(producer.root, '.gitignore', `${originalIgnore}\n/.tiller/work/unrelated/\n`);
  assert.equal((await inspectWorkDelivery(consumer.root, consumer.workId, input)).technicalReady, true,
    'An unrelated ignored work directory does not enlarge this delivery scope.');
});
