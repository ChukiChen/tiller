import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function git(cwd, args, options = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 20_000, ...options });
  assert.ifError(result.error && result.error.code !== 'EPERM' ? result.error : null);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function empty(response, status = 204) {
  response.writeHead(status);
  response.end();
}

function markMerged(state, gitRepo, branch) {
  if (!branch) return;
  const sha = state.refs.get(`refs/heads/${branch}`);
  if (!sha) return;
  state.mergedBranches.add(branch);
  state.mergedHeads.set(branch, [...(state.mergedHeads.get(branch) ?? []), sha]);
  state.refs.set('refs/heads/main', sha);
  git(gitRepo, ['update-ref', 'refs/heads/main', sha]);
}

export async function startPlatformMock(t, options = {}) {
  const platform = options.platform ?? 'github';
  const objectStore = mkdtempSync(join(tmpdir(), 'tiller-api-objects-'));
  const httpRoot = mkdtempSync(join(tmpdir(), 'tiller-git-http-'));
  git(objectStore, ['init', '--quiet']);
  const gitRepo = join(httpRoot, platform === 'github' ? 'owner/repo.git' : 'group/project.git');
  mkdirSync(dirname(gitRepo), { recursive: true });
  git(httpRoot, ['init', '--bare', '--quiet', gitRepo]);
  git(gitRepo, ['config', 'http.receivepack', 'true']);
  const state = {
    platform,
    mode: options.mode ?? 'success',
    openDefault: options.openDefault === true,
    requests: [],
    errors: [],
    remoteCommits: new Set(options.remoteHead ? [options.remoteHead] : []),
    refs: new Map(),
    mergedBranches: new Set(options.mergedBranches ?? []),
    mergedHeads: new Map(),
    openIntegrations: new Map(),
    branchDeletes: [],
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock.invalid');
    const body = await readBody(request);
    state.requests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      search: url.search,
      body: body.toString('utf8'),
      hasAuthorization: Boolean(request.headers.authorization),
      hasPrivateToken: Boolean(request.headers['private-token']),
    });
    try {
      const gitService = options.git !== false
        && /\.git\/(?:info\/refs|git-receive-pack|git-upload-pack)$/u.test(url.pathname);
      if (gitService) {
        const result = spawnSync('git', ['http-backend'], {
          input: body,
          encoding: 'buffer',
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_PROJECT_ROOT: httpRoot,
            GIT_HTTP_EXPORT_ALL: '1',
            PATH_INFO: url.pathname,
            QUERY_STRING: url.search.slice(1),
            REQUEST_METHOD: request.method ?? 'GET',
            CONTENT_TYPE: request.headers['content-type'] ?? '',
            CONTENT_LENGTH: String(body.length),
            REMOTE_ADDR: '127.0.0.1',
            SERVER_PROTOCOL: 'HTTP/1.1',
          },
        });
        if (result.status !== 0) return json(response, 500, { message: result.stderr.toString('utf8') });
        const output = result.stdout;
        const separator = output.indexOf('\r\n\r\n');
        const headerEnd = separator >= 0 ? separator : output.indexOf('\n\n');
        assert.ok(headerEnd >= 0, 'git http-backend returned headers');
        const headerText = output.subarray(0, headerEnd).toString('utf8');
        const payload = output.subarray(headerEnd + (separator >= 0 ? 4 : 2));
        const headers = {};
        let status = 200;
        for (const line of headerText.split(/\r?\n/u)) {
          const colon = line.indexOf(':');
          if (colon <= 0) continue;
          const name = line.slice(0, colon).trim();
          const value = line.slice(colon + 1).trim();
          if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
          else headers[name] = value;
        }
        response.writeHead(status, headers);
        response.end(payload);
        const refs = spawnSync('git', ['--git-dir', gitRepo, 'show-ref'], { encoding: 'utf8' });
        if (refs.status === 0) {
          for (const line of refs.stdout.split(/\r?\n/u).filter(Boolean)) {
            const [sha, ref] = line.trim().split(/\s+/u);
            if (sha && ref) state.refs.set(ref, sha);
          }
        }
        return;
      }
      if (platform === 'github') {
        const repo = /^\/api\/v3\/repos\/owner\/repo(?:\/(.*))?$/u.exec(url.pathname);
        assert.ok(repo, `unexpected GitHub path: ${request.method} ${url.pathname}`);
        const rest = repo[1] ?? '';
        if (request.method === 'GET' && rest === '') return json(response, 200, { default_branch: 'main' });
        if (request.method === 'POST' && rest === 'pulls') {
          if (state.mode === 'pr-exists') {
            return json(response, 422, { message: 'A pull request already exists for this branch' });
          }
          if (state.mode === 'pr-failure') {
            return json(response, 500, { message: `PR create rejected ${request.headers.authorization ?? ''}` });
          }
          const value = JSON.parse(body.toString('utf8'));
          const branch = value.head;
          const sha = state.refs.get(`refs/heads/${branch}`);
          const pull = { number: 1, url: 'https://example.invalid/tiller/pr/1', base: 'main', sha, title: value.title };
          state.openIntegrations.set(branch, [...(state.openIntegrations.get(branch) ?? []), pull]);
          if (state.mode === 'pr-created-lost') {
            return json(response, 500, { message: 'PR create response lost after the pull request was stored' });
          }
          return json(response, 201, { number: pull.number, html_url: pull.url });
        }
        if (request.method === 'GET' && rest === 'pulls') {
          if (state.mode === 'query-failure' && url.searchParams.get('state') === 'all') {
            return json(response, 500, { message: `query rejected ${request.headers.authorization ?? ''}` });
          }
          if (url.searchParams.get('state') === 'all') {
            const head = url.searchParams.get('head') ?? '';
            const branch = head.includes(':') ? head.slice(head.indexOf(':') + 1) : head;
            if (!state.mergedBranches.has(branch)) return json(response, 200, []);
            const tip = state.refs.get(`refs/heads/${branch}`);
            const heads = state.mergedHeads.get(branch) ?? (tip ? [tip] : []);
            return json(response, 200, heads.map((sha, index) => ({
              number: index + 1, state: 'closed', merged: true, merged_at: '2026-10-26T00:00:00Z',
              title: 'chore(tiller): 完成工程初始化 [20261028-tiller-init]',
              head: { ref: branch, ...(sha ? { sha } : {}) },
            })));
          }
          const head = url.searchParams.get('head') ?? '';
          const branch = head.includes(':') ? head.slice(head.indexOf(':') + 1) : head;
          const pulls = (state.openIntegrations.get(branch) ?? [])
            .filter(item => item.sha)
            .map(item => ({
              number: item.number, html_url: item.url, title: item.title, base: { ref: item.base },
              head: { ref: branch, sha: item.sha },
            }));
          if (!pulls.length && state.openDefault) {
            const sha = state.refs.get(`refs/heads/${branch}`) ?? '0'.repeat(40);
            pulls.push({ number: 1, html_url: 'https://example.invalid/tiller/pr/1', base: { ref: 'main' }, head: { ref: branch, sha } });
          }
          return json(response, 200, pulls);
        }
        if (request.method === 'PUT' && /^pulls\/\d+\/merge$/u.test(rest)) {
          if (state.mode === 'failure') {
            return json(response, 405, { message: `merge rejected ${request.headers.authorization ?? ''}` });
          }
          const branch = [...state.openIntegrations.entries()]
            .find(([, items]) => items.some(item => `pulls/${item.number}/merge` === rest))?.[0];
          markMerged(state, gitRepo, branch);
          return json(response, 200, { merged: true, message: 'Pull Request successfully merged' });
        }
        if (request.method === 'GET' && rest.startsWith('git/commits/')) {
          const sha = rest.slice('git/commits/'.length);
          return state.remoteCommits.has(sha) ? json(response, 200, { sha }) : json(response, 404, { message: 'Not Found' });
        }
        if (request.method === 'POST' && rest === 'git/blobs') {
          const input = Buffer.from(JSON.parse(body.toString('utf8')).content, 'base64');
          const sha = git(objectStore, ['hash-object', '-w', '--stdin'], { input }).trim();
          state.remoteCommits.add(sha);
          return json(response, 201, { sha });
        }
        if (request.method === 'POST' && rest === 'git/trees') {
          const entries = JSON.parse(body.toString('utf8')).tree;
          const input = entries.map(entry => `${entry.mode} ${entry.type} ${entry.sha}\t${entry.path}`).join('\n') + '\n';
          const sha = git(objectStore, ['mktree'], { input }).trim();
          state.remoteCommits.add(sha);
          return json(response, 201, { sha });
        }
        if (request.method === 'POST' && rest === 'git/commits') {
          const value = JSON.parse(body.toString('utf8'));
          const date = input => {
            const timestamp = Math.floor(Date.parse(input) / 1000);
            const zone = /([+-])(\d\d):(\d\d)$/u.exec(input);
            return `${timestamp} ${zone ? `${zone[1]}${zone[2]}${zone[3]}` : '+0000'}`;
          };
          const object = [
            `tree ${value.tree}`,
            ...value.parents.map(parent => `parent ${parent}`),
            `author ${value.author.name} <${value.author.email}> ${date(value.author.date)}`,
            `committer ${value.committer.name} <${value.committer.email}> ${date(value.committer.date)}`,
            '',
            value.message,
          ].join('\n');
          const sha = git(objectStore, ['hash-object', '-t', 'commit', '-w', '--stdin'], { input: object }).trim();
          state.remoteCommits.add(sha);
          return json(response, 201, { sha });
        }
        if (request.method === 'GET' && rest.startsWith('git/ref/heads/')) {
          const ref = `refs/heads/${rest.slice('git/ref/heads/'.length)}`;
          const sha = state.refs.get(ref);
          return sha ? json(response, 200, { object: { sha } }) : json(response, 404, { message: 'Not Found' });
        }
        if (request.method === 'POST' && rest === 'git/refs') {
          const value = JSON.parse(body.toString('utf8'));
          state.refs.set(value.ref, value.sha);
          return json(response, 201, { ref: value.ref, object: { sha: value.sha } });
        }
        if (request.method === 'PATCH' && rest.startsWith('git/refs/heads/')) {
          const ref = `refs/heads/${rest.slice('git/refs/heads/'.length)}`;
          const value = JSON.parse(body.toString('utf8'));
          state.refs.set(ref, value.sha);
          return json(response, 200, { ref, object: { sha: value.sha } });
        }
        if (request.method === 'DELETE' && rest.startsWith('git/refs/heads/')) {
          if (state.mode === 'branch-delete-missing') {
            return json(response, 422, { message: 'Reference does not exist' });
          }
          if (state.mode === 'branch-delete-not-found') {
            return json(response, 404, { message: 'Not Found' });
          }
          if (state.mode === 'branch-delete-failure') {
            return json(response, 500, { message: `branch delete rejected ${request.headers.authorization ?? ''}` });
          }
          const branch = decodeURIComponent(rest.slice('git/refs/heads/'.length));
          state.refs.delete(`refs/heads/${branch}`);
          spawnSync('git', ['--git-dir', gitRepo, 'update-ref', '-d', `refs/heads/${branch}`], { encoding: 'utf8' });
          state.branchDeletes.push(branch);
          return empty(response);
        }
      } else {
        const project = /^\/api\/v4\/projects\/group%2Fproject(?:\/(.*))?$/u.exec(url.pathname);
        assert.ok(project, `unexpected GitLab path: ${request.method} ${url.pathname}`);
        const rest = project[1] ?? '';
        if (request.method === 'GET' && rest === '') return json(response, 200, { default_branch: 'main' });
        if (request.method === 'POST' && rest === 'merge_requests') {
          if (state.mode === 'pr-exists') {
            return json(response, 422, { message: 'Another open merge request already exists for this source branch' });
          }
          if (state.mode === 'pr-failure') {
            return json(response, 500, { message: `MR create rejected ${request.headers['private-token'] ?? ''}` });
          }
          const value = JSON.parse(body.toString('utf8'));
          const branch = value.source_branch;
          const sha = state.refs.get(`refs/heads/${branch}`);
          const mergeRequest = { number: 7, url: 'https://example.invalid/tiller/mr/7', base: 'main', sha, title: value.title };
          state.openIntegrations.set(branch, [...(state.openIntegrations.get(branch) ?? []), mergeRequest]);
          if (state.mode === 'pr-created-lost') {
            return json(response, 500, { message: 'MR create response lost after the merge request was stored' });
          }
          return json(response, 201, { iid: mergeRequest.number, web_url: mergeRequest.url });
        }
        if (request.method === 'GET' && rest === 'merge_requests') {
          if (state.mode === 'query-failure' && url.searchParams.get('state') === 'all') {
            return json(response, 500, { message: `query rejected ${request.headers['private-token'] ?? ''}` });
          }
          if (url.searchParams.get('state') === 'all') {
            const branch = url.searchParams.get('source_branch') ?? '';
            if (!state.mergedBranches.has(branch)) return json(response, 200, []);
            const tip = state.refs.get(`refs/heads/${branch}`);
            const heads = state.mergedHeads.get(branch) ?? (tip ? [tip] : []);
            return json(response, 200, heads.map((sha, index) => ({
              iid: index + 1, state: 'merged', merged_at: '2026-10-26T00:00:00Z', source_branch: branch,
              title: 'chore(tiller): 完成工程初始化 [20261028-tiller-init]',
              ...(sha ? { sha } : {}),
            })));
          }
          const branch = url.searchParams.get('source_branch') ?? '';
          const mergeRequests = (state.openIntegrations.get(branch) ?? [])
            .filter(item => item.sha)
            .map(item => ({
              iid: item.number, web_url: item.url, title: item.title, source_branch: branch, target_branch: item.base,
              sha: item.sha, diff_refs: { head_sha: item.sha },
            }));
          if (!mergeRequests.length && state.openDefault) {
            const sha = state.refs.get(`refs/heads/${branch}`) ?? '0'.repeat(40);
            mergeRequests.push({
              iid: 7, web_url: 'https://example.invalid/tiller/mr/7', source_branch: branch, target_branch: 'main',
              sha, diff_refs: { head_sha: sha },
            });
          }
          return json(response, 200, mergeRequests);
        }
        if (request.method === 'PUT' && rest === 'merge_requests/7/merge') {
          if (state.mode === 'failure') {
            return json(response, 406, { message: `merge rejected ${request.headers['private-token'] ?? ''}` });
          }
          const branch = [...state.openIntegrations.keys()].find(key => (state.openIntegrations.get(key) ?? []).some(item => item.number === 7));
          markMerged(state, gitRepo, branch);
          return json(response, 200, { state: 'merged' });
        }
        if (request.method === 'DELETE' && rest.startsWith('repository/branches/')) {
          if (state.mode === 'branch-delete-missing') {
            return json(response, 422, { message: 'Branch does not exist' });
          }
          if (state.mode === 'branch-delete-not-found') {
            return json(response, 404, { message: 'Not Found' });
          }
          if (state.mode === 'branch-delete-failure') {
            return json(response, 500, { message: `branch delete rejected ${request.headers['private-token'] ?? ''}` });
          }
          const branch = decodeURIComponent(rest.slice('repository/branches/'.length));
          state.refs.delete(`refs/heads/${branch}`);
          spawnSync('git', ['--git-dir', gitRepo, 'update-ref', '-d', `refs/heads/${branch}`], { encoding: 'utf8' });
          state.branchDeletes.push(branch);
          return empty(response);
        }
      }
      return json(response, 404, { message: `Unhandled ${request.method} ${url.pathname}` });
    } catch (error) {
      state.errors.push(error.message);
      return json(response, 500, { message: error.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(objectStore, { recursive: true, force: true });
    rmSync(httpRoot, { recursive: true, force: true });
  });
  return {
    origin,
    gitRepo,
    state,
    addRemoteCommit(sha) { state.remoteCommits.add(sha); },
    setMergedHeads(branch, heads) {
      state.mergedBranches.add(branch);
      state.mergedHeads.set(branch, [...heads]);
    },
    setMode(mode) { state.mode = mode; },
    resetRequests() { state.requests.length = 0; },
  };
}
