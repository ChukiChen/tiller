import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { initialize } from '../dist/core.js';
import { planDeliveryPreparation, applyDeliveryPreparation } from '../dist/delivery-environment.js';
import { planDeliveryAction, applyDeliveryAction } from '../dist/delivery-actions.js';
import { git } from '../dist/delivery-git.js';
import { seedApprovedDevelopment } from './planning-helpers.mjs';
import { fixture, put } from './helpers.mjs';

const id = 'delivery-sharing';
const directory = `.tiller/work/${id}`;
const baselineRoot = fixture({ after });
let baseline;
async function seed() {
  await initialize({ root: baselineRoot });
  const context = await seedApprovedDevelopment(baselineRoot, id, { scope: { repositories: ['.'], targets: [id] } });
  put(baselineRoot, `${directory}/authorization.md`, '# Fixture authorization\nAllow this exact fixture commit.\n');
  put(baselineRoot, 'code.txt', 'baseline\n');
  await git(baselineRoot, ['init', '-b', 'main']);
  await git(baselineRoot, ['config', 'user.name', 'Synthetic']);
  await git(baselineRoot, ['config', 'user.email', 'synthetic@example.invalid']);
  await git(baselineRoot, ['config', 'core.autocrlf', 'false']);
  await git(baselineRoot, ['add', '--all']);
  await git(baselineRoot, ['commit', '-m', 'Keep synthetic delivery evidence together']);
  return context;
}
async function setup(t) {
  baseline ??= seed();
  const source = await baseline;
  const root = fixture(t);
  cpSync(baselineRoot, root, { recursive: true });
  const input = { schemaVersion: 1, designRequest: source.basis.design.requestId,
    repositories: [{ id: '.', base: 'HEAD', branch: `codex/${id}`, target: 'main' }] };
  return { root, input, designSource: `${directory}/source-${source.basis.design.decisionId}.md` };
}
function commitInput() {
  return { schemaVersion: 1, repository: '.', files: ['code.txt'], message: 'Keep fixture changes bounded',
    authorization: { actions: ['commit'], repository: '.', branch: `codex/${id}`, target: 'main',
      source: { path: `${directory}/authorization.md`, quote: 'Allow this exact fixture commit.' },
      sourceReview: { reviewer: 'Synthetic reviewer', rationale: 'This approval covers the exact fixture.', reviewedAt: '2026-10-19T00:00:00.000Z' } } };
}

for (const material of ['authorization', 'design-approval']) test(`delivery apply rejects newly ignored ${material} before staging or committing`, async t => {
  const { root, input, designSource } = await setup(t);
  const preparation = await planDeliveryPreparation(root, id, input);
  const context = await applyDeliveryPreparation(root, id, input, preparation.planId);
  const checkout = context.recordRoot;
  put(checkout, 'code.txt', 'modified\n');
  const value = commitInput();
  const plan = await planDeliveryAction(root, id, 'commit', value);
  const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
  const before = readFileSync(join(checkout, `${directory}/delivery.json`), 'utf8');
  put(root, '.git/info/exclude', `/${material === 'authorization' ? value.authorization.source.path : designSource}\n`);
  // Preview still evaluates facts without a shared-write eligibility check.
  await planDeliveryAction(root, id, 'commit', value);
  await assert.rejects(applyDeliveryAction(root, id, 'commit', value, plan.planId), /共享资料被 Git 忽略/u);
  assert.equal((await git(checkout, ['rev-parse', 'HEAD'])).trim(), head);
  assert.equal((await git(checkout, ['diff', '--cached', '--name-only'])).trim(), '');
  assert.equal(readFileSync(join(checkout, `${directory}/delivery.json`), 'utf8'), before);
  put(root, '.git/info/exclude', '');
  assert.equal((await applyDeliveryAction(root, id, 'commit', value, plan.planId)).state, 'succeeded');
  assert.notEqual((await git(checkout, ['rev-parse', 'HEAD'])).trim(), head);
});

test('delivery preparation rechecks design approval sharing before creating a worktree', async t => {
  const { root, input, designSource } = await setup(t);
  const plan = await planDeliveryPreparation(root, id, input);
  put(root, '.git/info/exclude', `/${designSource}\n`);
  await assert.rejects(applyDeliveryPreparation(root, id, input, plan.planId), /共享资料被 Git 忽略/u);
  assert.equal(existsSync(plan.recordRoot), false);
  assert.equal(existsSync(join(root, `.tiller/local/delivery/${id}/binding.json`)), false);
  put(root, '.git/info/exclude', '');
  assert.equal((await applyDeliveryPreparation(root, id, input, plan.planId)).changed, true);
});

test('delivery preparation checks actual transfer destination before overwriting its baseline', async t => {
  const { root, input } = await setup(t);
  put(root, 'code.txt', 'transfer contents\n');
  input.repositories[0].transfers = [{ path: 'code.txt', operation: 'modify' }];
  const plan = await planDeliveryPreparation(root, id, input);
  const nativeExec = childProcess.execFile;
  let destinationChecked = false;
  childProcess.execFile = function(file, args, options, callback) {
    if (file === 'git' && args[0] === 'check-ignore' && resolve(options.cwd) === resolve(plan.recordRoot)) {
      destinationChecked = true;
      put(root, '.git/info/exclude', '/code.txt\n');
    }
    return nativeExec.call(this, file, args, options, callback);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(applyDeliveryPreparation(root, id, input, plan.planId), /共享资料被 Git 忽略/u);
    assert.equal(destinationChecked, true);
    assert.equal(readFileSync(join(plan.recordRoot, 'code.txt'), 'utf8'), 'baseline\n');
    assert.equal(readFileSync(join(root, 'code.txt'), 'utf8'), 'transfer contents\n');
    assert.equal(existsSync(join(plan.recordRoot, `${directory}/delivery.json`)), false);
    assert.equal(existsSync(join(root, `.tiller/local/delivery/${id}/binding.json`)), false);
  } finally { childProcess.execFile = nativeExec; syncBuiltinESMExports(); }
  put(root, '.git/info/exclude', '');
  const recovered = await applyDeliveryPreparation(root, id, input, plan.planId);
  assert.equal(recovered.changed, true);
  assert.equal(readFileSync(join(recovered.recordRoot, 'code.txt'), 'utf8'), 'transfer contents\n');
});
