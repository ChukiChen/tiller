import test from 'node:test';
import assert from 'node:assert/strict';
import { initialize } from '../dist/core.js';
import { requestConfirmation, readConfirmation, readConfirmations } from '../dist/confirmations.js';
import { planDeliveryPreparation, applyDeliveryPreparation } from '../dist/delivery-environment.js';
import { resolveRepositoryRoot, withDeliveryLocation } from '../dist/delivery-location.js';
import { git } from '../dist/delivery-git.js';
import { fixture, put, gitRepository } from './helpers.mjs';
import { seedApprovedDevelopment, fixtureDecision } from './planning-helpers.mjs';

test('independent and batched confirmation reads isolate each work checkout and unbound work', async t => {
  const root = fixture(t);
  const source = gitRepository(root, 'business');
  await git(source, ['checkout', '-b', 'main']);
  await git(source, ['config', 'core.autocrlf', 'false']);
  put(source, 'shared.md', '# Original business subject\n');
  await git(source, ['add', '--all']);
  await git(source, ['-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'Business baseline']);
  await initialize({ root, mode: 'workspace', repositories: ['business'] });
  const references = new Map();
  const roots = new Map();
  for (const workId of ['context-a', 'context-b', 'context-unbound']) {
    const scope = { repositories: ['.', 'business'], targets: [workId] };
    // A shared, unchanged requirements source keeps the project verification configuration stable.
    const context = await seedApprovedDevelopment(root, workId, {
      scope, requirementsSource: { repository: '.', path: '.tiller/specs/context-requirements.md' },
    });
    await requestConfirmation(root, workId, {
      requestId: 'business-design', gate: 'design', scope,
      subjects: [context.design, context.standard, { repository: 'business', path: 'shared.md' }],
      upstream: ['requirements'], workflowBinding: await context.binding('design'),
      reviewSummary: 'Review the actual business file and this work design.',
      openIssues: [], nextAction: 'Prepare the specified business checkout.',
    });
    await fixtureDecision(root, workId, 'business-design', 'approve-business-design');
    references.set(workId, { workId, requestId: 'business-design', decisionId: 'approve-business-design' });
    if (workId !== 'context-unbound') {
      const input = { schemaVersion: 1, designRequest: 'business-design',
        repositories: [{ id: 'business', base: 'HEAD', target: 'main', branch: `codex/${workId}` }] };
      const plan = await planDeliveryPreparation(root, workId, input);
      const prepared = await applyDeliveryPreparation(root, workId, input, plan.planId);
      assert.equal(prepared.recordRoot, root);
      roots.set(workId, await withDeliveryLocation(root, workId, () => resolveRepositoryRoot(root, 'business')));
      assert.equal((await readConfirmation(root, references.get(workId))).check.confirmed, true);
    }
  }
  assert.notEqual(roots.get('context-a'), roots.get('context-b'));
  assert.notEqual(roots.get('context-a'), source);
  const read = async id => (await readConfirmation(root, references.get(id))).check.confirmed;
  put(roots.get('context-b'), 'shared.md', '# B changed independently\n');
  assert.equal(await read('context-b'), false);
  const readBatch = async ids => (await readConfirmations(root, ids.map(id => references.get(id))))
    .map(item => item.check.confirmed);
  assert.deepEqual(await readBatch(['context-a', 'context-b', 'context-unbound', 'context-a']),
    [true, false, true, true]);
  assert.deepEqual(await readBatch(['context-b', 'context-unbound', 'context-a']),
    [false, true, true], 'The first bound work must not determine another work\'s checkout.');
  await (async () => {
    assert.equal(await read('context-a'), true);
    assert.equal(await read('context-b'), false);
    assert.equal(await read('context-unbound'), true);
    assert.equal(await read('context-a'), true);
  })();
  put(roots.get('context-b'), 'shared.md', '# Original business subject\n');
  put(roots.get('context-a'), 'shared.md', '# A changed independently\n');
  assert.deepEqual(await readBatch(['context-b', 'context-unbound', 'context-a', 'context-b']),
    [true, true, false, true]);
  await (async () => {
    assert.equal(await read('context-a'), false);
    assert.equal(await read('context-b'), true);
    assert.equal(await read('context-unbound'), true);
    assert.equal(await read('context-a'), false);
  })();
  assert.equal(await read('context-unbound'), true);
});
