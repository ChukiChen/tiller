import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { initialize } from '../dist/core.js';
import { createWork } from '../dist/work.js';
import { inspectTaskArtifacts } from '../dist/task-artifacts.js';
import { checkpointDefinitionDigest } from '../dist/gate-conditions.js';
import { fixture, put, snapshot, gitRepository } from './helpers.mjs';

const workId = 'artifact-checks';
const ref = path => ({ repository: '.', path });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const common = { id: 'output', purpose: 'Bounded artifact observation', required: true, checks: ['inspect-output'] };
test('checkpoint definitions bind review purpose while treating subject order as a set', () => {
  const checkpoint = { id: 'check', operation: 'verify', purpose: 'Review actual output', subjects: [ref('Z.md'), ref('a.md')] };
  assert.equal(checkpointDefinitionDigest(checkpoint), checkpointDefinitionDigest({ ...checkpoint, subjects: [...checkpoint.subjects].reverse() }));
  assert.notEqual(checkpointDefinitionDigest(checkpoint), checkpointDefinitionDigest({ ...checkpoint, purpose: 'Review a different condition' }));
});
async function setup(t, workspace = false) {
  const root = fixture(t);
  if (workspace) gitRepository(root, 'business');
  else gitRepository(root, '.');
  await initialize({ root, mode: workspace ? 'workspace' : 'project', ...(workspace ? { repositories: ['business'] } : {}) });
  const scope = { repositories: workspace ? ['.', 'business'] : ['.'], targets: [workId] };
  await createWork(root, workId, 'Artifact inspection', { type: 'change-requirements', scope });
  return { root, scope, inspect: (artifacts, references) => inspectTaskArtifacts(root, workId, artifacts, scope, references) };
}

test('artifact snapshots observe directory membership, document placeholders and optional omissions without writes', async t => {
  const { root, inspect } = await setup(t);
  const source = { ...common, type: 'source', files: [], directories: [ref('src')] };
  put(root, 'src/a.txt', 'first source\n');
  const before = snapshot(root);
  const first = await inspect([source]);
  assert.deepEqual(first.issues, []); assert.deepEqual(snapshot(root), before);
  put(root, 'src/b.txt', 'second source\n');
  const added = await inspect([source]);
  assert.notEqual(added.basisDigest, first.basisDigest);
  assert.equal(Object.keys(added.snapshots.output).length, 2);
  unlinkSync(join(root, 'src/a.txt'));
  const removed = await inspect([source]);
  assert.notEqual(removed.basisDigest, added.basisDigest);
  const document = { ...common, type: 'document', source: ref('docs/output.md') };
  assert.equal((await inspect([document])).issues[0].code, 'ARTIFACT_MISSING');
  put(root, document.source.path, '# Output\n\nTODO fill this later\n');
  assert.equal((await inspect([document])).issues[0].code, 'INCOMPLETE_ARTIFACT');
  put(root, document.source.path, '# Output\n\nConcrete behavior and actual instructions.\n');
  assert.deepEqual((await inspect([document])).issues, []);
  const optional = { ...document, required: false, optionalReason: 'Follow-up suggestion outside required delivery', checks: [], source: ref('optional.md') };
  const omitted = await inspect([optional]);
  assert.deepEqual(omitted.issues, []); assert.equal(omitted.warnings.length, 1);
  put(root, 'control/.tiller/work/nested/tasks.json', '{}');
  assert.equal((await inspect([{ ...source, directories: [ref('control')] }])).issues[0].code, 'INVALID_ARTIFACT');
  assert.equal((await inspect([{ ...source, files: [ref('control/.tiller/work/nested/tasks.json')], directories: [], required: false }])).issues[0].exceptionAllowed, false);
  put(root, 'nested/.tiller/local/cache.json', '{}');
  assert.equal((await inspect([{ ...source, directories: [ref('nested')] }])).issues[0].code, 'INVALID_ARTIFACT');
  put(root, 'metadata/.tiller/project.json', '{}');
  assert.equal((await inspect([{ ...source, directories: [ref('metadata')] }])).issues[0].code, 'INVALID_ARTIFACT');
});

test('generated artifacts bind ignored binary output, exact inputs and independent shared manifest', async t => {
  const { root, inspect } = await setup(t);
  put(root, '.gitignore', readFileSync(join(root, '.gitignore'), 'utf8') + '\ndist/\n');
  put(root, 'src/input.txt', 'observed input\n');
  put(root, 'dist/result.bin', Buffer.from([0, 1, 255, 3]));
  const artifact = { ...common, type: 'generated', output: ref('dist/result.bin'), inputs: [ref('src/input.txt')], evidence: ref('evidence/build.json') };
  const bound = source => ({ ...source, sha256: hash(readFileSync(join(root, source.path))) });
  const manifest = { schemaVersion: 1, output: bound(artifact.output), inputs: artifact.inputs.map(bound),
    command: 'synthetic fixture generation', observer: 'artifact test', observedAt: '2026-10-19T00:00:00.000Z', environment: 'isolated fixture' };
  put(root, artifact.evidence.path, JSON.stringify(manifest));
  const good = await inspect([artifact]);
  assert.deepEqual(good.issues, []);
  assert.equal(Object.keys(good.snapshots.output).length, 3);
  const reference = { ...common, type: 'reference', taskId: 'build', artifactId: 'output' };
  assert.deepEqual((await inspect([reference], { 'build::output': good.snapshots.output })).issues, []);
  put(root, 'dist/result.bin', Buffer.from([8, 9, 10]));
  assert.equal((await inspect([artifact])).issues[0].code, 'STALE_GENERATED_ARTIFACT');
  assert.equal((await inspect([reference], { 'build::output': good.snapshots.output })).issues[0].code, 'STALE_REFERENCED_ARTIFACT');
  put(root, artifact.evidence.path, JSON.stringify({ ...manifest, output: bound(artifact.output), trusted: true }));
  assert.equal((await inspect([artifact])).issues[0].code, 'INVALID_ARTIFACT');
  assert.equal((await inspect([{ ...artifact, evidence: artifact.output }])).issues[0].exceptionAllowed, false);
  assert.equal((await inspect([{ ...artifact, evidence: { ...artifact.output, path: artifact.output.path.toUpperCase() } }])).issues[0].exceptionAllowed, false);
  const first = {}; const second = {};
  for (let i = 0; i < 1001; i++) {
    const path = `many/${i}.txt`; put(root, path, 'member');
    (i < 600 ? first : second)[`.::${path}`] = hash('member');
  }
  const overflow = await inspect([reference, { ...reference, id: 'second', artifactId: 'another' }], { 'build::output': first, 'build::another': second });
  assert.equal(overflow.issues[0].code, 'INVALID_ARTIFACT');
  assert.match(overflow.issues[0].message, /1000/);
});

test('workspace artifacts use stable repository identity and cannot read business files via management root', async t => {
  const { root, inspect } = await setup(t, true);
  put(root, 'business/result.md', '# Business output\n\nChecked repository-specific result.\n');
  const artifact = { ...common, type: 'document', source: { repository: 'business', path: 'result.md' } };
  assert.deepEqual((await inspect([artifact])).issues, []);
  const before = snapshot(root);
  assert.equal((await inspect([{ ...artifact, source: ref('business/result.md') }])).issues[0].exceptionAllowed, false);
  assert.equal((await inspect([{ ...artifact, source: { repository: 'unknown', path: 'result.md' } }])).issues[0].exceptionAllowed, false);
  assert.deepEqual(snapshot(root), before);
});
