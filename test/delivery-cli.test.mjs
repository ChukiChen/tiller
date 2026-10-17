import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWork, addWork } from '../dist/work.js';
import { requestConfirmation, recordDecision } from '../dist/confirmations.js';
import { git } from '../dist/delivery-git.js';
import { fixture, put, cli, success, failure } from './helpers.mjs';

const id = '20261015-cli-delivery';
const base = `.tiller/work/${id}`;

async function approve(root, gate) {
  const request = await requestConfirmation(root, id, {
    requestId: gate, gate, scope: { repositories: ['.'], targets: [id] },
    subjects: [{ repository: '.', path: `${base}/${gate}.md` }],
    upstream: gate === 'design' ? ['requirements'] : [],
    reviewSummary: 'Synthetic CLI fixture only', openIssues: [], nextAction: 'Exercise this test',
  });
  put(root, `${base}/${gate}-source.md`, 'Synthetic fixture approval.\n');
  await recordDecision(root, id, {
    decisionId: `yes-${gate}`, requestId: gate, outcome: 'approved', conditions: [],
    source: { kind: 'conversation', reference: { repository: '.', path: `${base}/${gate}-source.md` }, quote: 'Synthetic fixture approval.', presentation: { repository: '.', path: request.presentation } },
    sourceReview: { reviewer: 'synthetic', rationale: 'Synthetic input for this exact fixture', reviewedAt: new Date().toISOString() },
  });
}

test('packaged command routes prepared work, uses caller input and commits only an authorized file', async t => {
  const root = fixture(t);
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'core.autocrlf', 'false']);
  await git(root, ['config', 'user.name', 'Synthetic']);
  await git(root, ['config', 'user.email', 'test@example.invalid']);
  await initialize({ root });
  await createWork(root, id, 'CLI delivery fixture', 'module-requirements');
  put(root, `${base}/requirements.md`, '# Requirement\nUnique student ID.\n');
  await approve(root, 'requirements');
  await addWork(root, id, { type: 'module-design', requirementsBasis: { workId: id, requestId: 'requirements' } });
  put(root, `${base}/design.md`, '# Design\nMap keyed by ID.\n');
  await approve(root, 'design');
  await git(root, ['add', '--all']);
  await git(root, ['commit', '-m', 'Establish synthetic baseline']);
  const input = { schemaVersion: 1, designRequest: 'design', repositories: [{ id: '.', base: 'main', target: 'main', branch: `codex/${id}` }] };
  put(root, '.tiller/local/prepare.json', JSON.stringify(input));
  const plan = success(cli(root, 'work', 'prepare', id, '--input', '.tiller/local/prepare.json', '--plan'));
  const applied = success(cli(root, 'work', 'prepare', id, '--input', '.tiller/local/prepare.json', '--apply', plan.planId));
  assert.notEqual(applied.recordRoot, root);
  const status = success(cli(root, 'work', 'delivery-status', id));
  assert.match(status.documents.version, /^sha256:[0-9a-f]{64}$/u);
  const resumed = success(cli(root, 'work', 'resume', id));
  assert.equal(resumed.root, applied.recordRoot);
  put(applied.recordRoot, 'student.txt', 'unique\n');
  put(applied.recordRoot, 'unrelated.txt', 'do not commit\n');
  put(applied.recordRoot, `${base}/git-source.md`, 'Synthetic commit authorization.\n');
  const commitInput = {
    schemaVersion: 1, repository: '.', files: ['student.txt'], message: 'Preserve unique student IDs\n\nTested: synthetic CLI fixture',
    authorization: { actions: ['commit'], repository: '.', branch: `codex/${id}`, target: 'main',
      source: { path: `${base}/git-source.md`, quote: 'Synthetic commit authorization.' },
      sourceReview: { reviewer: 'synthetic', rationale: 'This fixture authorizes only the commit', reviewedAt: new Date().toISOString() } },
  };
  put(root, '.tiller/local/commit.json', JSON.stringify(commitInput));
  const commitPlan = success(cli(root, 'work', 'commit', id, '--input', '.tiller/local/commit.json', '--plan'));
  const committed = success(cli(root, 'work', 'commit', id, '--input', '.tiller/local/commit.json', '--apply', commitPlan.planId));
  assert.equal(committed.state, 'succeeded');
  assert.equal((await git(applied.recordRoot, ['show', 'HEAD:student.txt'])).trim(), 'unique');
  await assert.rejects(git(applied.recordRoot, ['show', 'HEAD:unrelated.txt']));
  assert.equal(existsSync(join(root, 'student.txt')), false);
  assert.equal(readFileSync(join(applied.recordRoot, 'unrelated.txt'), 'utf8'), 'do not commit\n');
});

test('delivery CLI rejects ambiguous action flags before creating a working environment', t => {
  const root = fixture(t);
  const invalid = failure(cli(root, 'work', 'prepare', id, '--plan', '--apply', 'unknown'));
  assert.equal(invalid.error.code, 'INVALID_ARGUMENT');
  assert.equal(existsSync(join(root, '.tiller/local/worktrees')), false);
  failure(cli(root, 'work', 'delivery-status', id, '--input', 'unused.json'));
});
