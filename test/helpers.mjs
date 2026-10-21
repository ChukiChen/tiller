import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { workflowIntentDigest } from '../dist/workflow-policy.js';

export const cliPath = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tiller-cli-'));
  t.after(() => {
    const resolved = resolve(root);
    assert.equal(dirname(resolved), resolve(tmpdir()));
    assert.ok(resolved.startsWith(join(resolve(tmpdir()), 'tiller-cli-')));
    rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}

export function put(root, path, content) {
  const target = resolve(root, path);
  const rel = relative(resolve(root), target);
  assert.ok(rel !== '..' && !rel.startsWith(`..${sep}`));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return target;
}

export function cli(root, ...args) {
  const result = spawnSync(process.execPath, [cliPath, ...args, '--json'], {
    // Git-backed delivery commands spawn several processes; allow bounded headroom
    // when the full suite runs concurrently on Windows.
    cwd: root, encoding: 'utf8', timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  let data;
  try { data = JSON.parse(result.stdout); }
  catch { assert.fail(`Expected JSON output: ${result.stdout}\n${result.stderr}`); }
  return { ...result, data };
}

export function success(result) {
  assert.equal(result.status, 0, JSON.stringify(result.data));
  assert.equal(result.data.ok, true);
  return result.data;
}

export function failure(result) {
  assert.notEqual(result.status, 0, JSON.stringify(result.data));
  assert.equal(result.data.ok, false);
  if (result.data.error) {
    assert.equal(typeof result.data.error.code, 'string');
    assert.ok(result.data.error.message);
  } else {
    assert.ok(Array.isArray(result.data.issues) && result.data.issues.length > 0,
      'a failed readiness check must explain its issues');
  }
  return result.data;
}

// Runtime transaction journals may change; shared project content must not.
export function snapshot(root) {
  const files = {};
  function visit(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (name === '.tiller/local' || item.isSymbolicLink()) continue;
      const path = join(dir, item.name);
      if (item.isDirectory()) visit(path, name);
      else files[name] = readFileSync(path).toString('base64');
    }
  }
  visit(root);
  return files;
}

export function gitRepository(root, name, separateGitDir) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  const args = ['init', '--quiet'];
  if (separateGitDir) args.push('--separate-git-dir', separateGitDir);
  args.push(path);
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 20_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return path;
}

// Synthetic user inputs for deterministic tests only; never used as real acceptance evidence.
export function confirmFixture(root, id, subjects, requestId = 'accept-1', gate = 'acceptance') {
  const base = `.tiller/work/${id}`;
  const record = JSON.parse(readFileSync(join(root, base, 'record.json'), 'utf8'));
  const definition = JSON.parse(readFileSync(join(root, record.workflow.path), 'utf8')).definition;
  const stage = definition.stages.find(item => item.confirmations.includes(gate));
  const references = subjects.map(path => ({ repository: '.', path }));
  let documentBinding;
  if (gate === 'acceptance') {
    const document = references[0];
    const contents = readFileSync(join(root, document.path), 'utf8');
    const evidence = { repository: '.', path: `${base}/${requestId}-observation.md` };
    put(root, evidence.path, `# Synthetic document observation\n\nRead ${document.path}: ${Buffer.byteLength(contents)} bytes.\n\n${contents}`);
    references.push(evidence);
    documentBinding = { document, evidence };
  }
  const inputPath = `${base}/${requestId}-input.json`;
  put(root, inputPath, JSON.stringify({
    requestId, gate, scope: { repositories: ['.'], targets: [id] },
    workflowBinding: { workflowDigest: record.workflow.digest, intentDigest: workflowIntentDigest(record), ...(stage ? { stageId: stage.id } : {}) },
    ...(documentBinding ? { documentBinding } : {}),
    subjects: references, upstream: [],
    reviewSummary: 'Synthetic review for automated tests', openIssues: [], nextAction: 'Record this scoped decision only',
  }));
  const request = success(cli(root, 'work', 'request-confirmation', id, '--input', inputPath));
  const sourcePath = `${base}/${requestId}-user.md`;
  put(root, sourcePath, '# Synthetic user input\nI accept this exact review for this test.\n');
  const decisionPath = `${base}/${requestId}-decision.json`;
  put(root, decisionPath, JSON.stringify({
    decisionId: `${requestId}-yes`, requestId, outcome: 'approved', conditions: [],
    source: {
      kind: 'conversation', reference: { repository: '.', path: sourcePath },
      quote: 'I accept this exact review for this test.', presentation: { repository: '.', path: request.presentation },
    },
    sourceReview: { reviewer: 'synthetic-test-reviewer', rationale: 'Matched the synthetic input to this exact request.', reviewedAt: new Date().toISOString() },
  }));
  success(cli(root, 'work', 'record-decision', id, '--input', decisionPath));
  return requestId;
}
