import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planWorkflowStageOperation, applyWorkflowStageOperation } from '../dist/workflow-stages.js';
import { createWorkflowFixture, completeStage, stageStartInput } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';
import { another, complete, link, selector, source } from './workflow-dependency-fixtures.mjs';

test('stage writes check only the current stage and its actual predecessor inputs', async t => {
  const f = await createWorkflowFixture(t);
  const scope = await completeStage(f, 'scope');
  const input = stageStartInput(f, 'evidence');
  const preview = await planWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', input);
  assert.equal(preview.operationAllowed, true, JSON.stringify(preview.blockingReasons));
  const statePath = `.tiller/work/${f.workId}/stages/state.json`;
  const state = readFileSync(join(f.root, statePath), 'utf8');
  const record = JSON.parse(readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8'));
  const runPath = `.tiller/work/${f.workId}/verification-runs/${scope.evidenceRefs[0].runId}.json`;
  const run = JSON.parse(readFileSync(join(f.root, runPath), 'utf8'));
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const ignore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  for (const path of ['instruction.md', record.workflow.path, 'outputs/scope-output.md', runPath, run.results[0].evidence.path]) {
    put(f.root, '.gitignore', `${ignore}\n/${path}\n`);
    try {
      assert.equal((await planWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', input)).operationAllowed, true);
      await assert.rejects(applyWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', input, preview.planId), error => error.message.includes(path));
      assert.equal(readFileSync(join(f.root, statePath), 'utf8'), state);
    } finally { put(f.root, '.gitignore', ignore); }
  }
  put(f.root, '.gitignore', `${ignore}\n/outputs/report-output.md\n/.tiller/work/unrelated/\n`);
  assert.equal((await applyWorkflowStageOperation(f.root, f.workId, 'evidence', 'start', input, preview.planId)).changed, true);
});

test('stage writes include the producer actually consumed by a cross-work link', async t => {
  const producer = await createWorkflowFixture(t);
  await complete(producer, 'scope');
  const consumer = await another(producer, 'consumer');
  await link(consumer, [selector(producer)]);
  const input = stageStartInput(consumer, 'scope');
  const preview = await planWorkflowStageOperation(consumer.root, consumer.workId, 'scope', 'start', input);
  assert.equal(preview.operationAllowed, true, JSON.stringify(preview.blockingReasons));
  execFileSync('git', ['init', '--quiet', producer.root], { windowsHide: true });
  const ignore = readFileSync(join(producer.root, '.gitignore'), 'utf8');
  const path = source(producer, 'scope-output').path;
  put(producer.root, '.gitignore', `${ignore}\n/${path}\n`);
  try {
    assert.equal((await planWorkflowStageOperation(consumer.root, consumer.workId, 'scope', 'start', input)).operationAllowed, true);
    await assert.rejects(applyWorkflowStageOperation(consumer.root, consumer.workId, 'scope', 'start', input, preview.planId), error => error.message.includes(path));
  } finally { put(producer.root, '.gitignore', ignore); }
  assert.equal((await applyWorkflowStageOperation(consumer.root, consumer.workId, 'scope', 'start', input, preview.planId)).changed, true);
});
