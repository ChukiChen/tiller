import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWorkflowWork } from '../dist/workflow-work.js';
import { loadBuiltinWorkflows, WORKFLOW_FACTS, WORKFLOW_LIMITS } from '../dist/workflow-catalog.js';
import { loadWorkflowPolicyContext, planWorkflowRegistration, applyWorkflowRegistration } from '../dist/workflow-policy.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { readWorkflowControlSnapshot } from '../dist/workflow-stages.js';
import { WORKFLOW_DEPENDENCY_LIMITS, planWorkflowLinks, applyWorkflowLinks } from '../dist/workflow-dependencies.js';
import { fixture, put } from './helpers.mjs';

const ref = path => ({ repository: '.', path });
const scope = { repositories: ['.'], targets: ['bounded-graph'] };
const authorization = 'Read, report and register the exact synthetic graph in this fixture.';
const recordBytes = (root, workId) => readFileSync(join(root, `.tiller/work/${workId}/record.json`), 'utf8');

async function create(root, workId, workflow, expectedOutputs) {
  await createWorkflowWork(root, workId, 'Bounded graph inspection fixture', {
    operationId: 'create', expectedRevision: 0, workflow,
    goal: 'Inspect graph limits without claiming stage completion.', reason: 'Exercise the real bounded graph preflight.',
    scope, impact: Object.fromEntries(WORKFLOW_FACTS.map(fact => [fact, false])), basis: [],
    actionSources: [{ actions: ['read', 'write-report', 'edit-documents'], reference: ref('instruction.md'), quote: authorization, scope }],
    expectedOutputs, completionCriteria: ['Report explicit graph bounds and preserve rejected state.'],
  });
}

async function setup(t) {
  const root = fixture(t); await initialize({ root });
  put(root, 'instruction.md', `# Synthetic fixture instruction\n${authorization}\n`);
  await create(root, 'owner', 'analysis', ['report-output']);
  return root;
}

function stage(index, dependsOn) {
  return {
    id: `step-${index}`, title: `Bounded stage ${index}`, dependsOn, consumes: [], produces: [`output-${index}`],
    checks: ['Observe this stage output before claiming completion.'], confirmations: [], actions: ['read', 'write-report'],
  };
}

async function register(root, name, stages) {
  const baseline = (await loadBuiltinWorkflows()).find(snapshot => snapshot.id === 'analysis');
  const definition = {
    ...structuredClone(baseline.definition), id: `project.${name}`, title: 'Bounded synthetic graph', stages,
    outputs: stages.map((entry, index) => ({ id: `output-${index}`, role: 'report', title: `Graph output ${index}`, producer: entry.id })),
    completion: { ...baseline.definition.completion, requiredStages: [stages.at(-1).id], requiredOutputs: stages.map((_, index) => `output-${index}`) },
  };
  const definitionRef = ref(`.tiller/workflows/${definition.id}@${definition.version}.json`);
  put(root, definitionRef.path, JSON.stringify(definition));
  const registration = {
    operationId: `register-${name}`, expectedRevision: 0, ownerWorkId: 'owner',
    candidate: { id: definition.id, version: definition.version }, baseline: { id: baseline.id, version: baseline.version }, confirmationRefs: [],
  };
  const preview = await planWorkflowRegistration(root, registration);
  assert.equal(preview.difference.requiresApproval, true);
  const context = await loadWorkflowPolicyContext(root, 'owner');
  const requestId = `approve-${name}`;
  const request = await requestConfirmation(root, 'owner', {
    requestId, gate: 'scope', scope, subjects: [definitionRef], upstream: [],
    reviewSummary: 'Approve this explicit synthetic graph solely to test bounded dependency inspection.',
    openIssues: [], nextAction: 'Register this exact fixture definition.',
    workflowBinding: { workflowDigest: context.snapshot.digest, intentDigest: context.intentDigest },
    scopeBinding: { kind: 'workflow-extension', ownerWorkId: 'owner', changeDigest: preview.changeDigest },
  });
  const decisionQuote = 'Approve this exact synthetic graph definition for bounded inspection tests.';
  const decisionRef = ref(`${requestId}-decision.md`);
  put(root, decisionRef.path, `# Synthetic fixture decision\n${decisionQuote}\n`);
  await recordDecision(root, 'owner', {
    decisionId: `${requestId}-yes`, requestId, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: decisionRef, quote: decisionQuote, presentation: ref(request.presentation) },
    sourceReview: { reviewer: 'fixture-observer', rationale: 'The synthetic decision matches the actual presented fixture graph.', reviewedAt: new Date().toISOString() },
  });
  registration.confirmationRefs = [{ workId: 'owner', requestId, decisionId: `${requestId}-yes` }];
  const plan = await planWorkflowRegistration(root, registration);
  assert.equal(plan.operationAllowed, true, JSON.stringify(plan.blockingReasons));
  await applyWorkflowRegistration(root, registration, plan.planId);
  return definition;
}

const link = (id, consumerStageId, workId, stageId, outputId) => ({ id, consumerStageId, producer: { workId, stageId, outputId } });
async function plan(root, workId, operationId, links) {
  const input = { operationId, expected: await readWorkflowControlSnapshot(root, workId), links };
  return { input, result: await planWorkflowLinks(root, workId, input) };
}

test('dependency depth preflight accepts the boundary and rejects one extra local stage without fabricated completion', async t => {
  const root = await setup(t); const depth = WORKFLOW_DEPENDENCY_LIMITS.depth;
  assert.ok(depth + 1 <= WORKFLOW_LIMITS.stages);
  const definition = await register(root, 'depth-boundary', Array.from({ length: depth + 1 }, (_, index) =>
    stage(index, index === 0 ? [] : [`step-${index - 1}`])));
  await create(root, 'consumer', definition.id, definition.completion.requiredOutputs);
  const before = recordBytes(root, 'consumer');
  const boundary = await plan(root, 'consumer', 'at-depth-boundary', [
    link('producer', `step-${depth - 1}`, 'owner', 'scope', 'scope-output'),
  ]);
  assert.equal(boundary.result.operationAllowed, false);
  assert.match(boundary.result.blockingReasons.join(';'), /尚未登记/u, 'The graph reaches ordinary producer validation at the allowed depth.');
  assert.doesNotMatch(boundary.result.blockingReasons.join(';'), /上限/u);
  const excessive = await plan(root, 'consumer', 'over-depth-boundary', [
    link('producer', `step-${depth}`, 'owner', 'scope', 'scope-output'),
  ]);
  assert.equal(excessive.result.operationAllowed, false);
  assert.match(excessive.result.blockingReasons.join(';'), /深度或节点上限/u);
  await assert.rejects(applyWorkflowLinks(root, 'consumer', excessive.input, excessive.result.planId), /深度或节点上限/u);
  assert.equal(recordBytes(root, 'consumer'), before);
  assert.equal(existsSync(join(root, '.tiller/work/consumer/stages/state.json')), false);
});

test('dependency node preflight accepts exactly the node budget and rejects the next node using eight shallow producer works', async t => {
  const root = await setup(t); const size = WORKFLOW_LIMITS.stages;
  const nodes = WORKFLOW_DEPENDENCY_LIMITS.nodes;
  assert.equal(nodes % size, 0);
  const producerCount = nodes / size;
  // The penultimate stage covers size - 1 nodes; the final stage adds one.
  // Seven full producer graphs + one penultimate graph + the consumer = 1024.
  const stages = Array.from({ length: size }, (_, index) => stage(index,
    index === size - 2 ? Array.from({ length: size - 2 }, (_, predecessor) => `step-${predecessor}`)
      : index === size - 1 ? [`step-${size - 2}`] : []));
  const definition = await register(root, 'node-boundary', stages);
  const edges = [];
  for (let index = 0; index < producerCount; index++) {
    const workId = `producer-${index}`;
    await create(root, workId, definition.id, definition.completion.requiredOutputs);
    const endpoint = index === producerCount - 1 ? size - 2 : size - 1;
    edges.push(link(`link-${index}`, 'scope', workId, `step-${endpoint}`, `output-${endpoint}`));
  }
  const before = recordBytes(root, 'owner');
  const boundary = await plan(root, 'owner', 'at-node-boundary', edges);
  assert.equal(boundary.result.operationAllowed, false);
  assert.equal(boundary.result.blockingReasons.length, producerCount);
  assert.ok(boundary.result.blockingReasons.every(reason => /尚未登记/u.test(reason)),
    'Every producer reaches ordinary output validation at exactly the node budget.');
  assert.doesNotMatch(boundary.result.blockingReasons.join(';'), /上限/u);
  const additional = structuredClone(edges);
  additional.at(-1).producer.stageId = `step-${size - 1}`;
  additional.at(-1).producer.outputId = `output-${size - 1}`;
  const excessive = await plan(root, 'owner', 'over-node-boundary', additional);
  assert.equal(excessive.result.operationAllowed, false);
  assert.match(excessive.result.blockingReasons.join(';'), /深度或节点上限/u);
  await assert.rejects(applyWorkflowLinks(root, 'owner', excessive.input, excessive.result.planId), /深度或节点上限/u);
  assert.equal(recordBytes(root, 'owner'), before);
  for (let index = 0; index < producerCount; index++)
    assert.equal(existsSync(join(root, `.tiller/work/producer-${index}/stages/state.json`)), false);
});
