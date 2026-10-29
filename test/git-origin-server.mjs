import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'tiller-git-origin-'));
const gitRoot = join(root, 'owner');
const repository = join(gitRoot, 'repo.git');
mkdirSync(repository, { recursive: true });
const initialized = spawnSync('git', ['init', '--bare', '--quiet', repository], { encoding: 'utf8', timeout: 20_000 });
assert.equal(initialized.status, 0, initialized.stderr);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://mock.invalid');
  if (url.searchParams.get('service') === 'git-receive-pack' || url.pathname.endsWith('/git-receive-pack')) {
    response.writeHead(403);
    response.end('read-only test origin');
    return;
  }
  if (!/\/info\/refs$|\/git-upload-pack$/u.test(url.pathname)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const result = spawnSync('git', ['http-backend'], {
    input: body,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: root,
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
  if (result.status !== 0) {
    response.writeHead(500);
    response.end(result.stderr.toString('utf8'));
    return;
  }
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
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  process.stdout.write(`${JSON.stringify({ origin: `http://127.0.0.1:${address.port}` })}\n`);
});

function close() {
  server.close();
  rmSync(root, { recursive: true, force: true });
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
process.once('exit', close);
