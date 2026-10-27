import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

export async function startPlatformMock(t, options = {}) {
  const platform = options.platform ?? 'github';
  const objectStore = mkdtempSync(join(tmpdir(), 'tiller-api-objects-'));
  git(objectStore, ['init', '--quiet']);
  const state = {
    platform,
    mode: options.mode ?? 'success',
    requests: [],
    errors: [],
    remoteCommits: new Set(options.remoteHead ? [options.remoteHead] : []),
    refs: new Map(),
    mergedBranches: new Set(options.mergedBranches ?? []),
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
          return json(response, 201, { number: 1, html_url: 'https://example.invalid/tiller/pr/1' });
        }
        if (request.method === 'GET' && rest === 'pulls') {
          if (state.mode === 'query-failure' && url.searchParams.get('state') === 'all') {
            return json(response, 500, { message: `query rejected ${request.headers.authorization ?? ''}` });
          }
          if (url.searchParams.get('state') === 'all') {
            const head = url.searchParams.get('head') ?? '';
            const branch = head.includes(':') ? head.slice(head.indexOf(':') + 1) : head;
            return json(response, 200, state.mergedBranches.has(branch)
              ? [{ number: 1, state: 'closed', merged: true, merged_at: '2026-10-26T00:00:00Z', head: { ref: branch } }]
              : []);
          }
          return json(response, 200, [{ number: 1 }]);
        }
        if (request.method === 'PUT' && rest === 'pulls/1/merge') {
          if (state.mode === 'failure') {
            return json(response, 405, { message: `merge rejected ${request.headers.authorization ?? ''}` });
          }
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
          if (state.mode === 'branch-delete-failure') {
            return json(response, 500, { message: `branch delete rejected ${request.headers.authorization ?? ''}` });
          }
          const branch = decodeURIComponent(rest.slice('git/refs/heads/'.length));
          state.refs.delete(`refs/heads/${branch}`);
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
          return json(response, 201, { iid: 7, web_url: 'https://example.invalid/tiller/mr/7' });
        }
        if (request.method === 'GET' && rest === 'merge_requests') {
          if (state.mode === 'query-failure' && url.searchParams.get('state') === 'all') {
            return json(response, 500, { message: `query rejected ${request.headers['private-token'] ?? ''}` });
          }
          if (url.searchParams.get('state') === 'all') {
            const branch = url.searchParams.get('source_branch') ?? '';
            return json(response, 200, state.mergedBranches.has(branch)
              ? [{ iid: 7, state: 'merged', merged_at: '2026-10-26T00:00:00Z', source_branch: branch }]
              : []);
          }
          return json(response, 200, [{ iid: 7 }]);
        }
        if (request.method === 'PUT' && rest === 'merge_requests/7/merge') {
          if (state.mode === 'failure') {
            return json(response, 406, { message: `merge rejected ${request.headers['private-token'] ?? ''}` });
          }
          return json(response, 200, { state: 'merged' });
        }
        if (request.method === 'DELETE' && rest.startsWith('repository/branches/')) {
          if (state.mode === 'branch-delete-missing') {
            return json(response, 422, { message: 'Branch does not exist' });
          }
          if (state.mode === 'branch-delete-failure') {
            return json(response, 500, { message: `branch delete rejected ${request.headers['private-token'] ?? ''}` });
          }
          const branch = decodeURIComponent(rest.slice('repository/branches/'.length));
          state.refs.delete(`refs/heads/${branch}`);
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
  });
  return {
    origin,
    state,
    addRemoteCommit(sha) { state.remoteCommits.add(sha); },
    setMode(mode) { state.mode = mode; },
    resetRequests() { state.requests.length = 0; },
  };
}

function quote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function fakeGitForTokenizedPush(t, root, realGit) {
  if (process.platform === 'win32') {
    t.skip('The tokenized-push git wrapper uses a POSIX shell script.');
    return null;
  }
  const directory = join(root, 'fake-git-bin');
  mkdirSync(directory, { recursive: true });
  const log = join(root, 'git-push.log');
  const wrapper = join(directory, 'git');
  writeFileSync(wrapper, [
    '#!/bin/sh',
    'if [ "$1" = push ]; then',
    '  printf "%s\\n" "$*" >> "${TILLER_FAKE_GIT_PUSH_LOG:?}"',
    '  exit 0',
    'fi',
    `exec ${quote(realGit)} "$@"`,
    '',
  ].join('\n'));
  chmodSync(wrapper, 0o755);
  return { directory, log, environment: { PATH: `${directory}:${process.env.PATH ?? ''}`, TILLER_FAKE_GIT_PUSH_LOG: log } };
}

export function realGitPath() {
  const result = spawnSync('which', ['git'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
