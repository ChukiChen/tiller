import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { createWorkflowWork, addWorkflowOutput } from '../dist/workflow-work.js';
import { readWorkflowControlSnapshot } from '../dist/workflow-stages.js';
import { planWorkflowLinks, applyWorkflowLinks, inspectWorkflowDependencies, parseWorkflowLinksInput, withWorkflowDependencyTraversal } from '../dist/workflow-dependencies.js';
import {
  createWorkflowFixture, workflowRef, stageSelection, startStage, completeStage, stageStatus,
} from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

import { recordPath, record, source, another, complete, selector, input, link } from './workflow-dependency-fixtures.mjs';

test('candidate cycles are rejected before mutation and shared dependency diamonds remain valid', async t => {
  const base = await createWorkflowFixture(t); await complete(base, 'scope');
  const left = await another(base, 'left'); const right = await another(base, 'right'); const top = await another(base, 'top');
  await link(left, [selector(base)]); await complete(left, 'scope');
  await link(right, [selector(base)]); await complete(right, 'scope');
  await link(top, [selector(left, 'scope', 'scope', 'left-link'), selector(right, 'scope', 'scope', 'right-link')]);
  await complete(top, 'scope');
  assert.equal((await stageStatus(top, 'scope')).effectiveStatus, 'verified');
  const before = readFileSync(recordPath(base), 'utf8'); const value = await input(base, [selector(top)]);
  const plan = await planWorkflowLinks(base.root, base.workId, value);
  assert.equal(plan.operationAllowed, false); assert.match(plan.blockingReasons.join(';'), /循环/);
  await assert.rejects(applyWorkflowLinks(base.root, base.workId, value, plan.planId), /循环/);
  assert.equal(readFileSync(recordPath(base), 'utf8'), before);
});

test('failed link postcheck preserves an externally changed record and its receipt', async t => {
  const producer = await createWorkflowFixture(t); const consumer = await another(producer, 'consumer');
  await complete(producer, 'scope');
  const value = await input(consumer, [selector(producer)]); const plan = await planWorkflowLinks(consumer.root, consumer.workId, value);
  const originalRename = fsPromises.rename; let injected = false;
  fsPromises.rename = async function (from, to) {
    const result = await originalRename.call(this, from, to);
    if (!injected && String(to) === recordPath(consumer)) {
      injected = true;
      const externallyChanged = record(consumer); externallyChanged.title = 'External writer content';
      await fsPromises.writeFile(to, JSON.stringify(externallyChanged, null, 2) + '\n');
    }
    return result;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(applyWorkflowLinks(consumer.root, consumer.workId, value, plan.planId), { code: 'CONTENT_CHANGED' });
  } finally { fsPromises.rename = originalRename; syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(record(consumer).title, 'External writer content');
  const receipt = JSON.parse(readFileSync(join(consumer.root, `.tiller/work/${consumer.workId}/workflow/links/${value.operationId}.json`), 'utf8'));
  assert.equal(receipt.planId, plan.planId, 'Preserved external record keeps the receipt for its recorded operation.');
});
