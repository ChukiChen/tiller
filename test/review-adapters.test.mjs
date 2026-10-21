import test from 'node:test';
import assert from 'node:assert/strict';
import { ReviewAdapter, assertProviderRemote, validateProvider } from '../dist/review-adapters.js';

const github = { kind: 'github', apiUrl: 'https://api.github.com', project: 'example/project', tokenEnv: 'TILLER_ADAPTER_TEST_TOKEN' };
const oid = 'a'.repeat(40);
function pull(overrides = {}) {
  return { number: 7, html_url: 'https://github.com/example/project/pull/7',
    head: { ref: 'codex/work', sha: oid, repo: { full_name: 'example/project' } },
    base: { ref: 'main', sha: 'b'.repeat(40), repo: { full_name: 'example/project' } },
    state: 'open', merged: false, body: 'body', ...overrides };
}
function mockFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => new Response(JSON.stringify(await handler(url, options)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  t.after(() => { globalThis.fetch = original; });
}

test('GitHub adapter queries and creates actual review then verifies repository and branch identity', async t => {
  const calls = [];
  process.env.TILLER_ADAPTER_TEST_TOKEN = 'synthetic-test-token';
  t.after(() => { delete process.env.TILLER_ADAPTER_TEST_TOKEN; });
  mockFetch(t, (url, options) => { calls.push({ url, ...options }); return options.method === 'POST' ? { number: 7 } : pull(); });
  const adapter = new ReviewAdapter(github);
  const review = await adapter.create({ source: 'codex/work', target: 'main', title: 'Title', body: 'Review material' });
  assert.equal(review.id, '7');
  assert.equal(review.sourceOid, oid);
  assert.equal(calls[0].headers.Authorization, 'Bearer synthetic-test-token');
  assert.deepEqual(JSON.parse(calls[0].body), { head: 'codex/work', base: 'main', title: 'Title', body: 'Review material' });
  assert.equal(calls[0].redirect, 'error');
  assert.equal(JSON.stringify(review).includes('synthetic-test-token'), false);
  assert.equal(adapter.capabilities.atomicSourceAndTargetMerge, false);
  await assert.rejects(adapter.merge(), /原子保护/u);
});

test('GitLab adapter checks project identity and current target OID independently', async t => {
  const provider = { kind: 'gitlab', apiUrl: 'https://gitlab.example/api/v4', project: 'group/repo' };
  mockFetch(t, url => {
    if (url.endsWith('/merge_requests/3')) return { iid: 3, source_project_id: 1, target_project_id: 1, web_url: 'https://gitlab.example/group/repo/-/merge_requests/3', source_branch: 'topic', target_branch: 'main', sha: oid, state: 'merged', merge_commit_sha: 'c'.repeat(40), description: 'MR' };
    if (url.endsWith('/repository/branches/main')) return { commit: { id: 'b'.repeat(40) } };
    return { id: 1, path_with_namespace: 'group/repo' };
  });
  const review = await new ReviewAdapter(provider).get('3');
  assert.equal(review.targetOid, 'b'.repeat(40));
  assert.equal(review.mergeOid, 'c'.repeat(40));
  assert.equal(review.state, 'merged');
});

test('adapters reject fork substitution and untrusted review URLs', async t => {
  let result = pull({ head: { ref: 'codex/work', sha: oid, repo: { full_name: 'attacker/project' } } });
  mockFetch(t, () => result);
  await assert.rejects(new ReviewAdapter(github).get('7'), /仓库/u);
  result = pull({ html_url: 'https://evil.example/pull/7' });
  await assert.rejects(new ReviewAdapter(github).get('7'), /URL/u);
});

test('provider validation binds project and host and rejects embedded secrets', () => {
  assert.doesNotThrow(() => assertProviderRemote(github, 'git@github.com:example/project.git'));
  assert.throws(() => assertProviderRemote(github, 'https://github.com/example/other.git'), /不匹配/u);
  assert.throws(() => validateProvider({ ...github, apiUrl: 'https://token:secret@api.github.com' }), /凭据/u);
  assert.throws(() => validateProvider({ ...github, token: 'do-not-log' }), /明文/u);
  assert.throws(() => validateProvider({ ...github, tokenEnv: '' }), /环境变量/u);
});

test('platform error response and transport failures do not expose credentials or claim success', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('secret echoed by provider', { status: 401 });
  await assert.rejects(new ReviewAdapter(github).get('7'), error => /401/u.test(error.message) && !error.message.includes('secret'));
  globalThis.fetch = async () => { throw new Error('secret network details'); };
  await assert.rejects(new ReviewAdapter(github).get('7'), error => /结果未知/u.test(error.message) && !error.message.includes('secret'));
  globalThis.fetch = async () => new Response('secret invalid JSON body', { status: 200 });
  await assert.rejects(new ReviewAdapter(github).get('7'), error => /有效 JSON/u.test(error.message) && !error.message.includes('secret'));
});

test('review lookup bounds concurrent detail reads and preserves order and identity checks', async t => {
  let active = 0;
  let maximum = 0;
  let substituted = false;
  mockFetch(t, async url => {
    if (url.includes('?')) return Array.from({ length: 9 }, (_, index) => ({ number: index + 1 }));
    const number = Number(url.split('/').at(-1));
    active++;
    maximum = Math.max(maximum, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 5));
      return pull({ number, html_url: `https://github.com/example/project/pull/${number}`,
        ...(substituted && number === 3 ? { base: { ref: 'main', sha: oid, repo: { full_name: 'other/project' } } } : {}) });
    } finally { active--; }
  });
  const adapter = new ReviewAdapter(github);
  const reviews = await adapter.find('codex/work', 'main');
  assert.deepEqual(reviews.map(review => review.id), Array.from({ length: 9 }, (_, index) => String(index + 1)));
  assert.ok(maximum > 1 && maximum <= 4, `Expected bounded concurrent reads, got ${maximum}`);
  substituted = true;
  await assert.rejects(adapter.find('codex/work', 'main'), /仓库/u);
});

test('review lookup validates the whole next batch before starting its detail reads', async t => {
  let details = 0;
  mockFetch(t, url => {
    if (url.includes('?')) return [{ number: 1 }, null];
    details++;
    return pull({ number: 1, html_url: 'https://github.com/example/project/pull/1' });
  });
  await assert.rejects(new ReviewAdapter(github).find('codex/work', 'main'), /平台响应格式无效/u);
  assert.equal(details, 0);
});

test('a failed concurrent review batch waits for its other reads before returning', async t => {
  let finished = 0;
  mockFetch(t, async url => {
    if (url.includes('?')) return [{ number: 1 }, { number: 2 }, { number: 3 }];
    const number = Number(url.split('/').at(-1));
    if (number === 1) throw new Error('synthetic failure');
    await new Promise(resolve => setTimeout(resolve, 10));
    finished++;
    return pull({ number, html_url: `https://github.com/example/project/pull/${number}` });
  });
  await assert.rejects(new ReviewAdapter(github).find('codex/work', 'main'), /结果未知/u);
  assert.equal(finished, 2);
});
