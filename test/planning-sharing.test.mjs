import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planPlanningRegistration, applyPlanningRegistration, planPlanningActivation, applyPlanningActivation, loadPlanningState } from '../dist/planning.js';
import { setupPlanning } from './planning-helpers.mjs';
import { put } from './helpers.mjs';

test('planning registration checks sharing of adopted specifications at commit', async t => {
  const f = await setupPlanning(t, { reuseSeed: true });
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const preview = await planPlanningRegistration(f.root, f.workId, f.registration);
  const ignore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  put(f.root, '.gitignore', `${ignore}\n/${f.requirements.path}\n`);
  await assert.rejects(applyPlanningRegistration(f.root, f.workId, f.registration, preview.planId), /共享资料被 Git 忽略/u);
  assert.equal(existsSync(join(f.root, `.tiller/work/${f.workId}/planning/v-one/definition.json`)), false);
  assert.equal(existsSync(join(f.root, '.tiller/local/transaction.json')), false);
});

test('planning activation checks sharing again after a valid preview', async t => {
  const f = await setupPlanning(t, { reuseSeed: true });
  execFileSync('git', ['init', '--quiet', f.root], { windowsHide: true });
  const registration = await planPlanningRegistration(f.root, f.workId, f.registration);
  await applyPlanningRegistration(f.root, f.workId, f.registration, registration.planId);
  const confirmation = await f.approvePlanning('v-one', 'planning-one');
  const input = { operationId: 'activate-sharing', expectedRevision: 1, revision: 'v-one', confirmation };
  const preview = await planPlanningActivation(f.root, f.workId, input);
  const before = readFileSync(join(f.root, `.tiller/work/${f.workId}/tasks.json`), 'utf8');
  const ignore = readFileSync(join(f.root, '.gitignore'), 'utf8');
  put(f.root, '.gitignore', `${ignore}\n/${f.requirements.path}\n`);
  await assert.rejects(applyPlanningActivation(f.root, f.workId, input, preview.planId), /共享资料被 Git 忽略/u);
  assert.equal(readFileSync(join(f.root, `.tiller/work/${f.workId}/tasks.json`), 'utf8'), before);
  assert.equal((await loadPlanningState(f.root, f.workId)).state.activePlanning, null);
});
