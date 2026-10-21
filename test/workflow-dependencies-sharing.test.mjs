import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planWorkflowLinks, applyWorkflowLinks } from '../dist/workflow-dependencies.js';
import { createWorkflowFixture } from './workflow-fixtures.mjs';
import { another, complete, selector, source, input, record, recordPath } from './workflow-dependency-fixtures.mjs';
import { put } from './helpers.mjs';

test('link registration checks actual consumer and producer sharing only when writing', async t => {
  const producer = await createWorkflowFixture(t);
  const finished = await complete(producer, 'scope');
  await complete(producer, 'evidence');
  const consumer = await another(producer, 'consumer');
  const value = await input(consumer, [selector(producer)]);
  const preview = await planWorkflowLinks(consumer.root, consumer.workId, value);
  assert.equal(preview.operationAllowed, true, preview.blockingReasons.join(';'));
  const before = readFileSync(recordPath(consumer), 'utf8');
  const runPath = `.tiller/work/${producer.workId}/verification-runs/${finished.evidenceRefs[0].runId}.json`;
  const run = JSON.parse(readFileSync(join(producer.root, runPath), 'utf8'));
  execFileSync('git', ['init', '--quiet', producer.root], { windowsHide: true });
  const ignore = readFileSync(join(producer.root, '.gitignore'), 'utf8');
  for (const path of ['instruction.md', record(consumer).workflow.path, record(producer).workflow.path,
    `.tiller/work/${producer.workId}/record.json`, `.tiller/work/${producer.workId}/stages/state.json`,
    source(producer, 'scope-output').path, runPath, run.results[0].evidence.path]) {
    put(producer.root, '.gitignore', `${ignore}\n/${path}\n`);
    try {
      assert.equal((await planWorkflowLinks(consumer.root, consumer.workId, value)).operationAllowed, true);
      await assert.rejects(applyWorkflowLinks(consumer.root, consumer.workId, value, preview.planId), error => error.message.includes(path));
      assert.equal(readFileSync(recordPath(consumer), 'utf8'), before);
      assert.equal(existsSync(join(consumer.root, `.tiller/work/${consumer.workId}/workflow/links/${value.operationId}.json`)), false);
    } finally { put(producer.root, '.gitignore', ignore); }
  }
  put(producer.root, '.gitignore', `${ignore}\n/${source(producer, 'evidence-output').path}\n/.tiller/work/unrelated/\n`);
  assert.equal((await applyWorkflowLinks(consumer.root, consumer.workId, value, preview.planId)).changed, true);

  const removal = await input(consumer, []);
  const removalPlan = await planWorkflowLinks(consumer.root, consumer.workId, removal);
  put(producer.root, '.gitignore', `${ignore}\n/${source(producer, 'scope-output').path}\n`);
  assert.equal((await applyWorkflowLinks(consumer.root, consumer.workId, removal, removalPlan.planId)).changed, true,
    'Removing a link does not consume the detached producer output.');
});
