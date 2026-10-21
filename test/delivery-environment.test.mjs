import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { requestConfirmation, checkGate } from '../dist/confirmations.js';
import { planDeliveryPreparation, applyDeliveryPreparation, loadDeliveryContext, saveDeliveryRecord, deliveryStatus, withDeliveryLock } from '../dist/delivery-environment.js';
import { resolveWorkRoot, resolveRepositoryRoot, withDeliveryLocation } from '../dist/delivery-location.js';
import { git } from '../dist/delivery-git.js';
import { resumeWork, readWorkReference } from '../dist/work.js';
import { fixture, put, gitRepository, snapshot } from './helpers.mjs';

import { seedApprovedDevelopment } from './planning-helpers.mjs';

const seeded = new Map();
const id = '20261015-isolation';
const directory = `.tiller/work/${id}`;
async function commit(root, message = 'test baseline') {
  await git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', '-c', 'core.autocrlf=false', 'add', '--all']);
  await git(root, ['-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', '-c', 'core.autocrlf=false', 'commit', '-m', message]);
  return (await git(root, ['rev-parse', 'HEAD'])).trim();
}
async function initGit(root) {
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'core.autocrlf', 'false']);
}
async function approve(root, repositories) {
  const result = await seedApprovedDevelopment(root, id, {
    scope: { repositories, targets: [id] }, title: 'Delivery fixture',
    requirementsRequestId: 'approve-requirements', designRequestId: 'approve-design',
    requirementsDecisionId: 'yes-requirements', designDecisionId: 'yes-design',
  });
  seeded.set(root, result); return result;
}
function preparation(repositories) {
  return { schemaVersion: 1, designRequest: 'approve-design', repositories: repositories.map(repository => ({ id: repository, base: 'HEAD', branch: `codex/${id}`, target: 'main' })) };
}
async function project(t) {
  const root = fixture(t);
  await initGit(root);
  await initialize({ root });
  await approve(root, ['.']);
  put(root, 'code.txt', 'base\n');
  await commit(root);
  return root;
}

test('project prepares a worktree, preserves source bytes, redirects records and supports normal commits', async t => {
  const root = await project(t);
  const original = readFileSync(join(root, `${directory}/work.md`), 'utf8');
  put(root, 'unrelated.txt', 'keep in original\n');
  const input = preparation(['.']);
  const workBytes = readFileSync(join(root, `${directory}/record.json`), 'utf8');
  const oldWork = JSON.stringify({ ...JSON.parse(workBytes), schemaVersion: 2 });
  put(root, `${directory}/record.json`, oldWork);
  await assert.rejects(planDeliveryPreparation(root, id, input), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  assert.equal(readFileSync(join(root, `${directory}/record.json`), 'utf8'), oldWork);
  put(root, `${directory}/record.json`, workBytes);
  const plan = await planDeliveryPreparation(root, id, input);
  const result = await applyDeliveryPreparation(root, id, input, plan.planId);
  assert.equal(result.recordRoot, join(root, '.tiller/local/worktrees', id));
  assert.equal(await resolveWorkRoot(root, id), result.recordRoot);
  assert.equal(await resolveWorkRoot(result.recordRoot, id), result.recordRoot);
  assert.equal(readFileSync(join(root, `${directory}/work.md`), 'utf8'), original);
  assert.equal(existsSync(join(result.recordRoot, 'unrelated.txt')), false);
  assert.equal((await checkGate(result.recordRoot, id, 'approve-design')).confirmed, true);
  assert.equal((await applyDeliveryPreparation(root, id, input, plan.planId)).changed, false);
  await withDeliveryLock(result.recordRoot, id, async context => assert.equal(context.anchorRoot, root));
  const originalRegistry = readFileSync(join(root, `${directory}/confirmations.json`), 'utf8');
  const acceptanceEvidence = { repository: '.', path: `${directory}/acceptance-evidence.md` };
  put(result.recordRoot, acceptanceEvidence.path, '# Actual fixture check\nReviewed the isolated design document after handoff.\n');
  await requestConfirmation(root, id, { workflowBinding: await seeded.get(root).binding(), documentBinding: { document: { repository: '.', path: `${directory}/design.md` }, evidence: acceptanceEvidence }, requestId: 'accept-isolated', gate: 'acceptance', scope: { repositories: ['.'], targets: [id] }, subjects: [{ repository: '.', path: `${directory}/design.md` }, acceptanceEvidence], upstream: ['approve-design'], reviewSummary: 'Synthetic post-handoff check.', openIssues: [], nextAction: 'Await fixture approval.' });
  assert.equal(readFileSync(join(root, `${directory}/confirmations.json`), 'utf8'), originalRegistry);
  assert.match(readFileSync(join(result.recordRoot, `${directory}/confirmations.json`), 'utf8'), /accept-isolated/u);
  put(result.recordRoot, 'code.txt', 'implemented\n');
  await commit(result.recordRoot, 'Fixture code delivery');
  assert.equal(readFileSync(join(root, 'code.txt'), 'utf8'), 'base\n');
  assert.notEqual((await deliveryStatus(root, id)).repositories[0].head, result.record.repositories[0].base);
  assert.equal((await loadDeliveryContext(root, id)).record.events[0].state, 'succeeded');
  const deliveryPath = `${directory}/delivery.json`;
  const deliveryBytes = readFileSync(join(result.recordRoot, deliveryPath), 'utf8');
  assert.equal(JSON.parse(deliveryBytes).schemaVersion, 2);
  const oldDelivery = JSON.stringify({ ...JSON.parse(deliveryBytes), schemaVersion: 1 });
  const previouslyLoaded = await loadDeliveryContext(root, id);
  put(result.recordRoot, deliveryPath, oldDelivery);
  await assert.rejects(loadDeliveryContext(root, id), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  await assert.rejects(saveDeliveryRecord(previouslyLoaded, previouslyLoaded.record), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  assert.equal(readFileSync(join(result.recordRoot, deliveryPath), 'utf8'), oldDelivery);
  put(result.recordRoot, deliveryPath, deliveryBytes);
  put(result.recordRoot, `${directory}/record.json`, oldWork);
  await assert.rejects(loadDeliveryContext(root, id), error => error.code === 'UNSUPPORTED_RECORD_VERSION');
  assert.equal(readFileSync(join(result.recordRoot, `${directory}/record.json`), 'utf8'), oldWork);
  put(result.recordRoot, `${directory}/record.json`, workBytes);
  const changedDelivery = deliveryBytes + '\n';
  put(result.recordRoot, deliveryPath, changedDelivery);
  await assert.rejects(saveDeliveryRecord(previouslyLoaded, previouslyLoaded.record), error => error.code === 'CONTENT_CHANGED');
  assert.equal(readFileSync(join(result.recordRoot, deliveryPath), 'utf8'), changedDelivery);
  put(result.recordRoot, deliveryPath, deliveryBytes);
  const bindingName = `.tiller/local/delivery/${id}/binding.json`;
  const bindingText = readFileSync(join(root, bindingName), 'utf8');
  const binding = JSON.parse(bindingText);
  binding.recordRoot = root;
  put(root, bindingName, JSON.stringify(binding));
  await assert.rejects(resolveWorkRoot(root, id), /共同资料位置/u);
  put(root, bindingName, bindingText);
  await git(result.recordRoot, ['checkout', '-b', 'codex/wrong-work']);
  await assert.rejects(resolveWorkRoot(root, id), /分支已变化/u);
  await git(result.recordRoot, ['checkout', `codex/${id}`]);
});

test('explicit additions, modifications and deletions preserve a rename without altering the source', async t => {
  const root = await project(t);
  put(root, 'old.txt', 'rename me\n');
  await commit(root);
  unlinkSync(join(root, 'old.txt'));
  put(root, 'new.txt', 'rename me\n');
  put(root, 'code.txt', 'edited\n');
  const input = preparation(['.']);
  input.repositories[0].transfers = [{ path: 'old.txt', operation: 'delete' }, { path: 'new.txt', operation: 'add' }, { path: 'code.txt', operation: 'modify' }];
  const plan = await planDeliveryPreparation(root, id, input);
  const result = await applyDeliveryPreparation(root, id, input, plan.planId);
  assert.equal(existsSync(join(result.recordRoot, 'old.txt')), false);
  assert.equal(readFileSync(join(result.recordRoot, 'new.txt'), 'utf8'), 'rename me\n');
  assert.equal(readFileSync(join(result.recordRoot, 'code.txt'), 'utf8'), 'edited\n');
  assert.equal(existsSync(join(root, 'old.txt')), false);
  assert.equal((await git(root, ['branch', '--show-current'])).trim(), 'main');
});

test('changed source contents invalidate the plan before any worktree exists', async t => {
  const root = await project(t);
  put(root, 'new.txt', 'one\n');
  const input = preparation(['.']);
  input.repositories[0].transfers = [{ path: 'new.txt', operation: 'add' }];
  const plan = await planDeliveryPreparation(root, id, input);
  put(root, 'new.txt', 'two\n');
  await assert.rejects(applyDeliveryPreparation(root, id, input, plan.planId), /已变化/u);
  assert.equal(existsSync(join(root, '.tiller/local/worktrees', id)), false);
});

test('untracked approval materials must be explicitly handed over', async t => {
  const root = fixture(t);
  await initGit(root);
  await initialize({ root });
  await commit(root);
  await approve(root, ['.']);
  const input = preparation(['.']);
  await assert.rejects(planDeliveryPreparation(root, id, input), /活动资料未包含/u);
  function files(dir, prefix) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name), `${prefix}/${entry.name}`) : [`${prefix}/${entry.name}`]);
  }
  input.repositories[0].transfers = [...files(join(root, directory), directory), 'instruction.md', '.tiller/verification/config.json'].map(path => ({ path, operation: 'add' }));
  const plan = await planDeliveryPreparation(root, id, input);
  const result = await applyDeliveryPreparation(root, id, input, plan.planId);
  assert.equal((await checkGate(result.recordRoot, id, 'approve-design')).confirmed, true);
});

test('design changes, credentials, ignored content and occupied branches are rejected', async t => {
  const root = await project(t);
  const input = preparation(['.']);
  input.repositories[0].transfers = [{ path: '.env', operation: 'add' }];
  await assert.rejects(planDeliveryPreparation(root, id, input), /凭据/u);
  delete input.repositories[0].transfers;
  input.repositories[0].branch = 'main';
  await assert.rejects(planDeliveryPreparation(root, id, input), /必须不同/u);
  input.repositories[0].branch = `codex/${id}`;
  const workBytes = readFileSync(join(root, `${directory}/record.json`), 'utf8');
  const otherScope = JSON.parse(workBytes);
  otherScope.scope.targets = ['another-goal'];
  put(root, `${directory}/record.json`, JSON.stringify(otherScope));
  const changedScope = snapshot(root);
  await assert.rejects(planDeliveryPreparation(root, id, input), /动作来源范围超出工作/u);
  assert.deepEqual(snapshot(root), changedScope);
  assert.equal(existsSync(join(root, '.tiller/local/worktrees', id)), false);
  put(root, `${directory}/record.json`, workBytes);
  put(root, `${directory}/design.md`, '# Changed design\n');
  const changedDesign = snapshot(root);
  await assert.rejects(planDeliveryPreparation(root, id, input), /设计确认未满足/u);
  assert.deepEqual(snapshot(root), changedDesign);
  assert.equal(existsSync(join(root, '.tiller/local/worktrees', id)), false);
});

for (const grouped of [false, true]) for (const gitManager of [true, false]) {
  test(`workspace ${grouped ? 'grouped' : 'direct'} repositories retain mode and ${gitManager ? 'isolated Git' : 'non-Git'} management authority`, async t => {
    const root = fixture(t);
    const repositoryPath = grouped ? 'repositories/repository-a' : 'repository-a';
    const business = gitRepository(root, repositoryPath);
    if (grouped) gitRepository(root, 'repositories/repository-b');
    await git(business, ['checkout', '-b', 'main']);
    await git(business, ['config', 'core.autocrlf', 'false']);
    put(business, 'code.txt', 'business\n');
    put(business, 'reference.md', 'business\n');
    await commit(business);
    if (gitManager) await initGit(root);
    await initialize({ root, mode: 'workspace', repositories: grouped ? [repositoryPath, 'repositories/repository-b'] : ['repository-a'] });
    await approve(root, ['.', 'repository-a']);
    if (gitManager) await commit(root);
    const input = preparation(gitManager ? ['.', 'repository-a'] : ['repository-a']);
    const plan = await planDeliveryPreparation(root, id, input);
    const result = await applyDeliveryPreparation(root, id, input, plan.planId);
    assert.equal(result.record.mode, 'workspace');
    assert.equal(result.recordRoot, gitManager ? join(root, '.tiller/local/worktrees', id, 'management') : root);
    assert.equal(existsSync(join(result.recordRoot, repositoryPath)), !gitManager);
    await withDeliveryLocation(root, id, async () => {
      assert.equal(await resolveRepositoryRoot(result.recordRoot, 'repository-a'), result.bindings['repository-a'].root);
      assert.equal((await checkGate(result.recordRoot, id, 'approve-design')).confirmed, true);
      if (grouped) {
        assert.equal((await resumeWork(root, id)).root, result.recordRoot);
        assert.equal(await readWorkReference(result.recordRoot, { repository: 'repository-a', path: 'reference.md' }), 'business\n');
        put(root, 'repositories/repository-b/reference.md', 'Unchanged dependency reference');
        assert.equal(await readWorkReference(result.recordRoot, { repository: 'repository-b', path: 'reference.md' }), 'Unchanged dependency reference');
        assert.equal(await resolveRepositoryRoot(result.recordRoot, 'repository-b'), join(root, 'repositories/repository-b'));
        await assert.rejects(resolveRepositoryRoot(result.recordRoot, 'unknown'));
      }
    });
    assert.equal((await loadDeliveryContext(result.bindings['repository-a'].root, id)).recordRoot, result.recordRoot);
    if (grouped) {
      const metadataPath = '.tiller/project.json';
      const metadataText = readFileSync(join(root, metadataPath), 'utf8');
      const metadata = JSON.parse(metadataText);
      metadata.repositoryPaths['repository-a'] = 'repository-a';
      gitRepository(root, 'repository-a');
      put(root, metadataPath, JSON.stringify(metadata));
      await assert.rejects(resolveWorkRoot(root, id), /活动源目录/u);
      put(root, metadataPath, metadataText);
      if (gitManager) {
        const activeMetadataText = readFileSync(join(result.recordRoot, metadataPath), 'utf8');
        const activeMetadata = JSON.parse(activeMetadataText);
        activeMetadata.repositoryPaths['repository-a'] = 'repository-a';
        put(result.recordRoot, metadataPath, JSON.stringify(activeMetadata));
        await assert.rejects(resolveWorkRoot(result.recordRoot, id), /映射不一致/u);
        put(result.recordRoot, metadataPath, activeMetadataText);
      }
      const bindingPath = `.tiller/local/delivery/${id}/binding.json`;
      const bindingText = readFileSync(join(root, bindingPath), 'utf8');
      const binding = JSON.parse(bindingText);
      binding.bindings['repository-a'].sourceRoot = join(root, 'repository-a');
      put(root, bindingPath, JSON.stringify(binding));
      await assert.rejects(resolveWorkRoot(root, id), /活动源目录/u);
      put(root, bindingPath, bindingText);
      const fake = join(root, 'copied-checkout');
      put(fake, '.git', readFileSync(join(result.bindings['repository-a'].root, '.git'), 'utf8'));
      await assert.rejects(resolveWorkRoot(fake, id), /登记|身份/u);
    }
  });
}
