import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addWorkflowOutput } from '../dist/workflow-work.js';
import { inspectWorkflowTransition, planWorkflowTransition, applyWorkflowTransition } from '../dist/workflow-transitions.js';
import { createWorkflowFixture, completeStage } from './workflow-fixtures.mjs';
import { put } from './helpers.mjs';

test('workflow transition checks mapped output, sources and selected history only when writing', async t => {
  const f = await createWorkflowFixture(t);
  const completed = await completeStage(f, 'scope');
  put(f.root, 'conclusion.md', '# Conclusion\nActual mapped output.\n');
  const beforeOutput = await inspectWorkflowTransition(f.root, f.workId);
  await addWorkflowOutput(f.root, f.workId, { operationId: 'report', expectedRevision: beforeOutput.record.revision,
    outputId: 'report-output', source: { repository: '.', path: 'conclusion.md' } });
  const current = await inspectWorkflowTransition(f.root, f.workId);
  const value = current.record;
  const input = { operationId: 'change-shared', expected: current.controlSnapshot,
    next: { workflow: value.workflow.id, workflowVersion: value.workflow.version, goal: value.goal, reason: value.selectionReason,
      scope: value.scope, impact: value.impact, basis: value.basis.map(({ sha256, ...entry }) => entry),
      actionSources: value.actionSources.map(({ sha256, ...entry }) => entry), expectedOutputs: value.expectedOutputs,
      completionCriteria: value.completionCriteria, level: value.level },
    outputMappings: [{ from: 'report-output', to: 'report-output' }],
    evidenceMappings: [{ reference: completed.evidenceRefs[0], sourceStageId: 'scope', targetStageId: 'scope', checkIndex: 0 }], confirmationRefs: [] };
  const runPath = `.tiller/work/${f.workId}/verification-runs/${completed.evidenceRefs[0].runId}.json`;
  const run = JSON.parse(readFileSync(join(f.root, runPath), 'utf8'));
  const originalRecord = readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8');
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const ignore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  const plan = await planWorkflowTransition(f.root, f.workId, input);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  for (const path of ['instruction.md', 'conclusion.md', value.workflow.path, `.tiller/work/${f.workId}/stages/state.json`,
    runPath, `.tiller/work/${f.workId}/verification-runs/${run.captureId}.json`, run.results[0].evidence.path]) {
    put(f.root, '.gitignore', `${ignore}\n/${path}\n`);
    try {
      assert.equal((await planWorkflowTransition(f.root, f.workId, input)).operationAllowed, true);
      await assert.rejects(applyWorkflowTransition(f.root, f.workId, input, plan.planId), error => error.message.includes(path));
      assert.equal(readFileSync(join(f.root, `.tiller/work/${f.workId}/record.json`), 'utf8'), originalRecord);
      assert.equal(existsSync(join(f.root, `.tiller/work/${f.workId}/transitions/change-shared/receipt.json`)), false);
    } finally { put(f.root, '.gitignore', ignore); }
  }
  assert.equal((await applyWorkflowTransition(f.root, f.workId, input, plan.planId)).changed, true);
});
