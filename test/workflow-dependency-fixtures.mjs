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

export const recordPath = f => join(f.root, `.tiller/work/${f.workId}/record.json`);
export const record = f => JSON.parse(readFileSync(recordPath(f), 'utf8'));
export const source = (f, outputId) => workflowRef(`outputs/${f.workId}/${outputId}.md`);
let workSequence = 0;
export async function another(f, workId) {
  const original = record(f); const scope = { repositories: ['.'], targets: [workId] };
  await createWorkflowWork(f.root, workId, `Consumer ${workId}`, {
    operationId: 'create', expectedRevision: 0, workflow: 'analysis', goal: 'Observe linked facts', reason: 'Bounded linking test', scope,
    impact: original.impact, basis: [], actionSources: original.actionSources.map(({ sha256, ...entry }) => ({ ...entry, scope })),
    expectedOutputs: f.snapshot.definition.completion.requiredOutputs, completionCriteria: ['Observe the actual fixture files'],
  });
  return { ...f, workId, scope, counter: ++workSequence * 10000, completed: new Map(), confirmationRefs: [] };
}
export async function complete(f, stageId, kind = 'start') {
  const verification = stageSelection(f, stageId);
  verification.checks = verification.checks.map(check => ({ ...check, inputs: check.artifactIds.map(outputId => source(f, outputId)) }));
  const started = await startStage(f, stageId, { verification }, kind);
  for (const outputId of f.snapshot.definition.stages.find(stage => stage.id === stageId).produces) {
    if (record(f).artifacts[outputId]) continue;
    const reference = source(f, outputId); put(f.root, reference.path, `# ${f.workId}/${outputId}\nObserved fixture output for ${stageId}.\n`);
    await addWorkflowOutput(f.root, f.workId, { operationId: `output-${outputId}`, expectedRevision: record(f).revision, outputId, source: reference });
  }
  return completeStage(f, stageId, started);
}
export const selector = (producer, consumerStageId = 'scope', producerStageId = 'scope', name = 'upstream') => ({
  id: name, consumerStageId, producer: { workId: producer.workId, stageId: producerStageId, outputId: `${producerStageId}-output` },
});
export async function input(f, links) {
  return { operationId: `links-${++f.counter}`, expected: await readWorkflowControlSnapshot(f.root, f.workId), links };
}
export async function link(f, links) {
  const value = await input(f, links); const plan = await planWorkflowLinks(f.root, f.workId, value);
  assert.equal(plan.operationAllowed, true, plan.blockingReasons.join(';'));
  const receipt = await applyWorkflowLinks(f.root, f.workId, value, plan.planId);
  return { value, plan, receipt };
}
