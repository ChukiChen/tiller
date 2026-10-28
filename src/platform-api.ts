import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TOKEN_ENV = {
  github: ['GITHUB_TOKEN', 'GH_TOKEN'],
  gitlab: ['GITLAB_TOKEN', 'GL_TOKEN'],
} as const;

export type PlatformName = 'github' | 'gitlab';
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PlatformToken {
  platform: PlatformName;
  name: string;
  value: string;
}

export interface PlatformRepository {
  platform: PlatformName;
  host: string;
  apiBase: string;
  webBase: string;
  owner: string | null;
  repo: string | null;
  projectPath: string;
  remoteUrl: string;
}

export interface PullRequestResult {
  url: string;
  number: number;
  command: string;
  base: string;
}

export interface MergeRequestResult extends PullRequestResult {
  iid: number;
}

export interface MergeResult {
  number: number;
  command: string;
}

export interface PushResult {
  method: 'github-api' | 'tokenized-git';
  command: string;
  warnings: string[];
}

export interface MergedIntegration {
  number: number;
  command: string;
}

export interface OpenIntegration {
  url: string;
  number: number;
  base: string;
  head: string;
  command: string;
}

export interface BranchDeleteResult {
  deleted: boolean;
  command: string;
  method: 'platform-api' | 'tokenized-git';
}

interface GitTreeEntry { path: string; mode: string; type: string; sha: string | null }
interface GitCommitMetadata {
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  parents: string[];
  message: string;
}

function fail(code: string, message: string, status?: number): never {
  throw Object.assign(new Error(message), { code, ...(status === undefined ? {} : { status }) });
}

function platformLabel(platform: PlatformName): string {
  return platform === 'github' ? 'GitHub' : 'GitLab';
}

function safeProtocol(protocol: string, hostName: string): 'http:' | 'https:' {
  const loopback = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';
  return protocol === 'http:' && loopback ? 'http:' : 'https:';
}

function redactRemoteCredentials(value: string): string {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+@)/iu, '$1[REDACTED]@');
}

export function platformToken(platform: PlatformName, environment: NodeJS.ProcessEnv = process.env): PlatformToken | null {
  for (const name of TOKEN_ENV[platform]) {
    const value = environment[name]?.trim();
    if (value) return { platform, name, value };
  }
  return null;
}

export function tokenGuidance(platform: PlatformName, apiBase?: string): string {
  if (platform === 'github') {
    return [
      '缺少 GitHub token。请设置 GITHUB_TOKEN（或 GH_TOKEN）后重试；tiller 使用 GitHub REST API，不依赖平台 CLI。',
      `API 地址：${apiBase ?? 'https://api.github.com'}；设置后重新运行当前 tiller 命令。`,
    ].join('\n');
  }
  return [
    '缺少 GitLab token。请设置 GITLAB_TOKEN（或 GL_TOKEN）后重试；tiller 使用 GitLab REST API，不依赖平台 CLI。',
    `API 地址：${apiBase ?? 'https://gitlab.com/api/v4'}；设置后重新运行当前 tiller 命令。`,
  ].join('\n');
}

function remoteParts(remoteUrl: string): { host: string; path: string; protocol: string } {
  const value = remoteUrl.trim();
  const display = redactRemoteCredentials(value);
  if (!value) fail('PLATFORM_REMOTE_INVALID', 'origin 为空，无法解析 GitHub/GitLab 仓库。');
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    let parsed: URL;
    try { parsed = new URL(value); }
    catch { fail('PLATFORM_REMOTE_INVALID', `无法解析 origin：${display}`); }
    const host = parsed.host;
    const path = parsed.pathname.replace(/^\/+/u, '').replace(/\.git\/?$/iu, '').replace(/\/+$/u, '');
    if (!host || !path) fail('PLATFORM_REMOTE_INVALID', `origin 缺少主机或仓库路径：${display}`);
    return { host, path, protocol: parsed.protocol };
  }
  const scp = /^(?:[^@\s/]+@)?([^:\s/]+):(.+)$/u.exec(value);
  if (!scp) fail('PLATFORM_REMOTE_INVALID', `无法解析 origin：${display}`);
  const host = scp[1]!;
  const path = scp[2]!.replace(/^\/+/u, '').replace(/\.git\/?$/iu, '').replace(/\/+$/u, '');
  if (!path) fail('PLATFORM_REMOTE_INVALID', `origin 缺少仓库路径：${display}`);
  return { host, path, protocol: 'ssh:' };
}

export function parsePlatformRemote(remoteUrl: string, platform: PlatformName): PlatformRepository {
  const remote = remoteParts(remoteUrl);
  const display = redactRemoteCredentials(remoteUrl.trim());
  const hostName = remote.host.replace(/:\d+$/u, '').toLowerCase();
  const pathParts = remote.path.split('/').filter(Boolean);
  if (pathParts.length < 2) fail('PLATFORM_REMOTE_INVALID', `origin 仓库路径不完整：${display}`);
  const baseProtocol = safeProtocol(remote.protocol, hostName);
  const urlHost = remote.protocol === 'ssh:' ? remote.host.replace(/:\d+$/u, '') : remote.host;

  if (platform === 'github') {
    if (pathParts.length !== 2) {
      fail('PLATFORM_REMOTE_INVALID', `GitHub origin 应为 owner/repo：${display}`);
    }
    const apiBase = hostName === 'github.com' && baseProtocol === 'https:'
      ? 'https://api.github.com'
      : `${baseProtocol}//${urlHost}/api/v3`;
    return {
      platform, host: remote.host, apiBase, webBase: `${baseProtocol}//${urlHost}`,
      owner: pathParts[0]!, repo: pathParts[1]!, projectPath: remote.path, remoteUrl: display,
    };
  }

  return {
    platform, host: remote.host, apiBase: `${baseProtocol}//${urlHost}/api/v4`,
    webBase: `${baseProtocol}//${urlHost}`, owner: null, repo: null,
    projectPath: remote.path, remoteUrl: display,
  };
}

async function git(root: string, args: string[], encoding: 'utf8' | 'buffer' = 'utf8'): Promise<string | Buffer> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' },
    });
    return result.stdout as string | Buffer;
  } catch (error) {
    const item = error as { stderr?: string | Buffer; stdout?: string | Buffer };
    const detail = Buffer.isBuffer(item.stderr) ? item.stderr.toString('utf8') : item.stderr ?? '';
    fail('PLATFORM_PUSH_FAILED', `本地 git 读取失败：${detail.trim() || (error as Error).message}`);
  }
}

async function gitText(root: string, args: string[]): Promise<string> {
  return (await git(root, args, 'utf8') as string).trim();
}

export async function resolvePlatformRepository(root: string, configured: 'github' | 'gitlab' | 'both'): Promise<PlatformRepository> {
  let remoteUrl: string;
  try { remoteUrl = await gitText(root, ['remote', 'get-url', 'origin']); }
  catch { fail('PLATFORM_REMOTE_INVALID', '无法读取 origin；请先配置 GitHub/GitLab 远端。'); }
  let platform: PlatformName;
  if (configured === 'github' || configured === 'gitlab') platform = configured;
  else if (/gitlab/iu.test(remoteUrl)) platform = 'gitlab';
  else if (/github/iu.test(remoteUrl)) platform = 'github';
  else fail('PLATFORM_REMOTE_INVALID', `工程平台配置为 both，但无法从 origin 判断平台：${redactRemoteCredentials(remoteUrl)}；请把 project.json 的 platform 改为 github 或 gitlab。`);
  return parsePlatformRemote(remoteUrl, platform);
}

function redact(text: string, token: string): string {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  const oauth = Buffer.from(`oauth2:${token}`).toString('base64');
  return text
    .replaceAll(token, '[REDACTED]')
    .replaceAll(basic, '[REDACTED]')
    .replaceAll(oauth, '[REDACTED]')
    .replace(/Authorization:\s*\S+/giu, 'Authorization: [REDACTED]');
}

function truncated(value: string): string {
  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length > 600 ? `${compact.slice(0, 600)}…` : compact;
}

async function api<T>(
  repository: PlatformRepository,
  token: PlatformToken,
  fetchImpl: FetchLike,
  method: string,
  endpoint: string,
  body?: unknown,
  allow404 = false,
): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: repository.platform === 'github' ? 'application/vnd.github+json' : 'application/json',
    'User-Agent': 'tiller/0.5.0',
  };
  if (repository.platform === 'github') headers.Authorization = `Bearer ${token.value}`;
  else headers['PRIVATE-TOKEN'] = token.value;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetchImpl(`${repository.apiBase}${endpoint}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    fail('PLATFORM_API_UNREACHABLE', `${platformLabel(repository.platform)} API 请求失败（${method} ${endpoint}）：${redact((error as Error).message, token.value)}`);
  }
  const text = await response.text();
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    fail('PLATFORM_API_FAILED',
      `${platformLabel(repository.platform)} API ${method} ${endpoint} 返回 ${response.status}：${truncated(redact(text, token.value))}`,
      response.status);
  }
  if (!text.trim()) return {} as T;
  try { return JSON.parse(text) as T; }
  catch { fail('PLATFORM_API_INVALID', `${platformLabel(repository.platform)} API ${method} ${endpoint} 返回了无效 JSON。`); }
}

function githubRepoPath(repository: PlatformRepository): string {
  return `/repos/${encodeURIComponent(repository.owner!)}/${encodeURIComponent(repository.repo!)}`;
}

function gitlabProjectPath(repository: PlatformRepository): string {
  return encodeURIComponent(repository.projectPath);
}

async function defaultBranch(repository: PlatformRepository, token: PlatformToken, fetchImpl: FetchLike): Promise<string> {
  const endpoint = repository.platform === 'github' ? githubRepoPath(repository) : `/projects/${gitlabProjectPath(repository)}`;
  const value = await api<{ default_branch?: string }>(repository, token, fetchImpl, 'GET', endpoint);
  if (!value?.default_branch) fail('PLATFORM_API_INVALID', `${platformLabel(repository.platform)} 仓库信息缺少 default_branch。`);
  return value.default_branch;
}

export async function createPullRequest(
  repository: PlatformRepository,
  token: PlatformToken,
  input: { branch: string; title: string; body: string; base?: string },
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PullRequestResult> {
  if (repository.platform !== 'github') fail('PLATFORM_INVALID', 'createPullRequest 只接受 GitHub 仓库。');
  const base = input.base ?? await defaultBranch(repository, token, fetchImpl);
  const endpoint = `${githubRepoPath(repository)}/pulls`;
  const created = await api<{ number?: number; html_url?: string }>(repository, token, fetchImpl, 'POST', endpoint, {
    title: input.title, head: input.branch, base, body: input.body,
  });
  if (!created?.html_url || typeof created.number !== 'number') {
    fail('PLATFORM_API_INVALID', 'GitHub PR 创建响应缺少 number 或 html_url。');
  }
  return { url: created.html_url, number: created.number, base, command: `github-api POST ${endpoint}` };
}

export async function createMergeRequest(
  repository: PlatformRepository,
  token: PlatformToken,
  input: { branch: string; title: string; body: string; base?: string },
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<MergeRequestResult> {
  if (repository.platform !== 'gitlab') fail('PLATFORM_INVALID', 'createMergeRequest 只接受 GitLab 仓库。');
  const base = input.base ?? await defaultBranch(repository, token, fetchImpl);
  const endpoint = `/projects/${gitlabProjectPath(repository)}/merge_requests`;
  const created = await api<{ iid?: number; web_url?: string }>(repository, token, fetchImpl, 'POST', endpoint, {
    source_branch: input.branch, target_branch: base, title: input.title, description: input.body,
  });
  if (!created?.web_url || typeof created.iid !== 'number') {
    fail('PLATFORM_API_INVALID', 'GitLab MR 创建响应缺少 iid 或 web_url。');
  }
  return { url: created.web_url, number: created.iid, iid: created.iid, base, command: `gitlab-api POST ${endpoint}` };
}

export async function findOpenIntegration(
  repository: PlatformRepository,
  token: PlatformToken,
  branch: string,
  tip: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<OpenIntegration | null> {
  const expectedTip = commitTip(tip);
  if (!expectedTip) fail('PLATFORM_INVALID', '开放 PR/MR 查询需要完整 head SHA。');
  if (repository.platform === 'github') {
    const endpoint = `${githubRepoPath(repository)}/pulls?state=open&head=${encodeURIComponent(`${repository.owner}:${branch}`)}`;
    const pulls = await api<Array<{
      number?: number; html_url?: string; title?: string; base?: { ref?: string };
      head?: { ref?: string; sha?: string };
    }>>(repository, token, fetchImpl, 'GET', endpoint);
    const found = pulls?.find(item => typeof item.number === 'number'
      && typeof item.html_url === 'string' && item.head?.ref === branch
      && commitTip(item.head?.sha) === expectedTip);
    return found ? {
      url: found.html_url!, number: found.number!, head: expectedTip,
      base: found.base?.ref ?? 'main', command: `github-api GET ${endpoint}`,
    } : null;
  }

  const endpoint = `/projects/${gitlabProjectPath(repository)}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`;
  const mergeRequests = await api<Array<{
    iid?: number; web_url?: string; source_branch?: string; target_branch?: string;
    sha?: string; diff_refs?: { head_sha?: string };
  }>>(repository, token, fetchImpl, 'GET', endpoint);
  const found = mergeRequests?.find(item => typeof item.iid === 'number' && typeof item.web_url === 'string'
    && item.source_branch === branch && commitTip(item.sha ?? item.diff_refs?.head_sha) === expectedTip);
  return found ? {
    url: found.web_url!, number: found.iid!, head: expectedTip,
    base: found.target_branch ?? 'main', command: `gitlab-api GET ${endpoint}`,
  } : null;
}

export async function mergePullRequest(
  repository: PlatformRepository,
  token: PlatformToken,
  branch: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<MergeResult> {
  if (repository.platform !== 'github') fail('PLATFORM_INVALID', 'mergePullRequest 只接受 GitHub 仓库。');
  const owner = repository.owner!;
  const pulls = await api<Array<{ number?: number }>>(repository, token, fetchImpl, 'GET',
    `${githubRepoPath(repository)}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
  const number = pulls?.find(item => typeof item.number === 'number')?.number;
  if (!number) fail('MERGE_REQUEST_NOT_FOUND', `没有找到分支 ${branch} 的开放 GitHub PR；请确认 PR 已创建且状态为 open。`);
  const endpoint = `${githubRepoPath(repository)}/pulls/${number}/merge`;
  const merged = await api<{ merged?: boolean; message?: string }>(repository, token, fetchImpl, 'PUT', endpoint, { merge_method: 'squash' });
  if (!merged?.merged) fail('MERGE_REJECTED', `${platformLabel(repository.platform)} 未合入 PR #${number}：${merged?.message ?? '平台返回 merged=false'}`);
  return { number, command: `github-api PUT ${endpoint} (squash)` };
}

export async function mergeMergeRequest(
  repository: PlatformRepository,
  token: PlatformToken,
  branch: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<MergeResult> {
  if (repository.platform !== 'gitlab') fail('PLATFORM_INVALID', 'mergeMergeRequest 只接受 GitLab 仓库。');
  const project = gitlabProjectPath(repository);
  const mergeRequests = await api<Array<{ iid?: number }>>(repository, token, fetchImpl, 'GET',
    `/projects/${project}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`);
  const iid = mergeRequests?.find(item => typeof item.iid === 'number')?.iid;
  if (!iid) fail('MERGE_REQUEST_NOT_FOUND', `没有找到分支 ${branch} 的开放 GitLab MR；请确认 MR 已创建且状态为 opened。`);
  const endpoint = `/projects/${project}/merge_requests/${iid}/merge`;
  const merged = await api<{ state?: string }>(repository, token, fetchImpl, 'PUT', endpoint, { squash: true });
  if (merged?.state !== 'merged') fail('MERGE_REJECTED', `GitLab 未合入 MR !${iid}：state=${merged?.state ?? '空'}`);
  return { number: iid, command: `gitlab-api PUT ${endpoint} (squash)` };
}

export async function findMergedIntegration(
  repository: PlatformRepository,
  token: PlatformToken,
  branch: string,
  tip: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<MergedIntegration | null> {
  const expectedTip = commitTip(tip);
  if (!expectedTip) return null;
  if (repository.platform === 'github') {
    const endpoint = `${githubRepoPath(repository)}/pulls?state=all&head=${encodeURIComponent(`${repository.owner}:${branch}`)}`;
    const pulls = await api<Array<{
      number?: number; state?: string; merged?: boolean; merged_at?: string | null; head?: { ref?: string; sha?: string };
    }>>(repository, token, fetchImpl, 'GET', endpoint);
    const merged = pulls?.find(item => typeof item.number === 'number'
      && (item.merged === true || (item.state === 'closed' && Boolean(item.merged_at)))
      && commitTip(item.head?.sha) === expectedTip);
    return merged ? { number: merged.number!, command: `github-api GET ${endpoint}` } : null;
  }

  const endpoint = `/projects/${gitlabProjectPath(repository)}/merge_requests?state=all&source_branch=${encodeURIComponent(branch)}`;
  const mergeRequests = await api<Array<{
    iid?: number; state?: string; merged_at?: string | null; sha?: string; diff_refs?: { head_sha?: string };
  }>>(
    repository, token, fetchImpl, 'GET', endpoint);
  const merged = mergeRequests?.find(item => typeof item.iid === 'number'
    && (item.state === 'merged' || Boolean(item.merged_at))
    && commitTip(item.sha ?? item.diff_refs?.head_sha) === expectedTip);
  return merged ? { number: merged.iid!, command: `gitlab-api GET ${endpoint}` } : null;
}

function commitTip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(normalized) ? normalized : null;
}

function tokenizedGitEnvironment(repository: PlatformRepository, token: PlatformToken): NodeJS.ProcessEnv {
  const username = repository.platform === 'github' ? 'x-access-token' : 'oauth2';
  const authorization = `Basic ${Buffer.from(`${username}:${token.value}`).toString('base64')}`;
  const environment: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' };
  const count = Number.parseInt(environment.GIT_CONFIG_COUNT ?? '0', 10) || 0;
  environment.GIT_CONFIG_COUNT = String(count + 1);
  environment[`GIT_CONFIG_KEY_${count}`] = 'http.extraHeader';
  environment[`GIT_CONFIG_VALUE_${count}`] = `Authorization: ${authorization}`;
  return environment;
}

export async function deleteRemoteBranch(
  root: string,
  repository: PlatformRepository,
  token: PlatformToken,
  branch: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BranchDeleteResult> {
  const endpoint = repository.platform === 'github'
    ? `${githubRepoPath(repository)}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`
    : `/projects/${gitlabProjectPath(repository)}/repository/branches/${encodeURIComponent(branch)}`;
  const command = `${repository.platform === 'github' ? 'github-api' : 'gitlab-api'} DELETE ${endpoint}`;
  const missing = (error: unknown): boolean => {
    const item = error as { status?: number; message?: string };
    return item.status === 404 || item.status === 422
      || /(?:does not exist|not found|不存在|reference.*missing|branch.*missing)/iu.test(item.message ?? '');
  };
  try {
    await api<unknown>(repository, token, fetchImpl, 'DELETE', endpoint, undefined, true);
    return {
      deleted: true,
      command,
      method: 'platform-api',
    };
  } catch (error) {
    if (missing(error)) return { deleted: true, command, method: 'platform-api' };
    if ((error as { code?: string }).code !== 'PLATFORM_API_UNREACHABLE') throw error;
    const remote = `${repository.webBase}/${repository.projectPath}.git`;
    try {
      await execFileAsync('git', ['push', '--porcelain', remote, '--delete', branch], {
        cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: tokenizedGitEnvironment(repository, token),
      });
    } catch (pushError) {
      const item = pushError as { stdout?: string; stderr?: string };
      const detail = item.stderr?.trim() || item.stdout?.trim() || (pushError as Error).message;
      if (missing(pushError) || /remote ref does not exist/iu.test(detail)) {
        return { deleted: true, command: `git push ${remote} --delete ${branch}`, method: 'tokenized-git' };
      }
      fail('PLATFORM_BRANCH_DELETE_FAILED', `tokenized HTTPS git push 删除分支失败：${redact(detail, token.value)}`);
    }
    return { deleted: true, command: `git push ${remote} --delete ${branch}`, method: 'tokenized-git' };
  }
}

function parseTreeEntries(output: string): Array<{ mode: string; type: string; sha: string; name: string }> {
  return output.split('\0').filter(Boolean).map(item => {
    const tab = item.indexOf('\t');
    if (tab < 0) fail('PLATFORM_PUSH_FAILED', 'git ls-tree 输出无效。');
    const [mode, type, sha] = item.slice(0, tab).split(' ');
    if (!mode || !type || !sha) fail('PLATFORM_PUSH_FAILED', 'git ls-tree 输出缺少对象信息。');
    return { mode, type, sha, name: item.slice(tab + 1) };
  });
}

async function commitMetadata(root: string, commit: string): Promise<GitCommitMetadata> {
  const fields = (await gitText(root, ['show', '-s', '--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%P', commit])).split('\0');
  if (fields.length < 7) fail('PLATFORM_PUSH_FAILED', `无法读取提交信息 ${commit}。`);
  const message = await gitText(root, ['show', '-s', '--format=%B', commit]);
  return {
    author: { name: fields[0]!, email: fields[1]!, date: fields[2]! },
    committer: { name: fields[3]!, email: fields[4]!, date: fields[5]! },
    parents: fields[6]!.split(' ').filter(Boolean),
    message: `${message}\n`,
  };
}

async function createGitHubBlob(root: string, token: PlatformToken, fetchImpl: FetchLike,
  repository: PlatformRepository, sha: string): Promise<string> {
  const content = await git(root, ['cat-file', 'blob', sha], 'buffer') as Buffer;
  const created = await api<{ sha?: string }>(repository, token, fetchImpl, 'POST', `${githubRepoPath(repository)}/git/blobs`, {
    content: content.toString('base64'), encoding: 'base64',
  });
  if (created?.sha !== sha) fail('PLATFORM_PUSH_FALLBACK', `GitHub blob 校验失败：期望 ${sha}，返回 ${created?.sha ?? '空'}。`);
  return sha;
}

async function createGitHubTree(root: string, token: PlatformToken, fetchImpl: FetchLike,
  repository: PlatformRepository, commit: string, treePath: string | null, expected: string): Promise<string> {
  const revision = treePath === null ? commit : `${commit}:${treePath}`;
  const listing = await gitText(root, ['ls-tree', '-z', revision]);
  const entries: GitTreeEntry[] = [];
  for (const item of parseTreeEntries(listing)) {
    if (item.type === 'blob') await createGitHubBlob(root, token, fetchImpl, repository, item.sha);
    entries.push({
      path: item.name,
      mode: item.mode,
      type: item.type,
      sha: item.type === 'tree'
        ? await createGitHubTree(root, token, fetchImpl, repository, commit,
          treePath === null ? item.name : `${treePath}/${item.name}`, item.sha)
        : item.sha,
    });
  }
  const created = await api<{ sha?: string }>(repository, token, fetchImpl, 'POST', `${githubRepoPath(repository)}/git/trees`, { tree: entries });
  if (created?.sha !== expected) fail('PLATFORM_PUSH_FALLBACK', `GitHub tree 校验失败：期望 ${expected}，返回 ${created?.sha ?? '空'}。`);
  return expected;
}

async function pushGitHubApi(root: string, repository: PlatformRepository, token: PlatformToken,
  branch: string, fetchImpl: FetchLike): Promise<PushResult> {
  const head = await gitText(root, ['rev-parse', `${branch}^{commit}`]);
  const pending: string[] = [];
  let cursor = head;
  let remoteBase: string | null = null;
  for (let depth = 0; depth < 10_000; depth += 1) {
    const remote = await api<{ sha?: string }>(repository, token, fetchImpl, 'GET',
      `${githubRepoPath(repository)}/git/commits/${cursor}`, undefined, true);
    if (remote) { remoteBase = cursor; break; }
    const meta = await commitMetadata(root, cursor);
    if (meta.parents.length !== 1) {
      fail('PLATFORM_PUSH_FALLBACK', `提交 ${cursor} 不在远端且不是单父线性历史，无法用 Git Data API 安全补齐。`);
    }
    pending.unshift(cursor);
    cursor = meta.parents[0]!;
  }
  if (remoteBase === null) fail('PLATFORM_PUSH_FALLBACK', '找不到已存在于远端的父提交，无法用 Git Data API 增量推送。');

  for (const commit of pending) {
    const meta = await commitMetadata(root, commit);
    const tree = await createGitHubTree(root, token, fetchImpl, repository, commit, null,
      await gitText(root, ['rev-parse', `${commit}^{tree}`]));
    const created = await api<{ sha?: string }>(repository, token, fetchImpl, 'POST', `${githubRepoPath(repository)}/git/commits`, {
      message: meta.message, tree, parents: meta.parents, author: meta.author, committer: meta.committer,
    });
    if (created?.sha !== commit) {
      fail('PLATFORM_PUSH_FALLBACK', `GitHub API 生成的提交 ${created?.sha ?? '空'} 与本地 ${commit} 不一致。`);
    }
  }

  const refEndpoint = `${githubRepoPath(repository)}/git/ref/heads/${branch}`;
  const existing = await api<{ object?: { sha?: string } }>(repository, token, fetchImpl, 'GET', refEndpoint, undefined, true);
  if (existing) {
    await api(repository, token, fetchImpl, 'PATCH', `/repos/${encodeURIComponent(repository.owner!)}/${encodeURIComponent(repository.repo!)}/git/refs/heads/${branch}`,
      { sha: head, force: false });
  } else {
    await api(repository, token, fetchImpl, 'POST', `${githubRepoPath(repository)}/git/refs`,
      { ref: `refs/heads/${branch}`, sha: head });
  }
  return { method: 'github-api', command: `github-api refs/heads/${branch} -> ${head}`, warnings: [] };
}

async function tokenizedPush(root: string, repository: PlatformRepository, token: PlatformToken, branch: string,
  warnings: string[]): Promise<PushResult> {
  return tokenizedPushRef(root, repository, token,
    `refs/heads/${branch}:refs/heads/${branch}`, warnings);
}

async function tokenizedPushRef(root: string, repository: PlatformRepository, token: PlatformToken,
  ref: string, warnings: string[]): Promise<PushResult> {
  const username = repository.platform === 'github' ? 'x-access-token' : 'oauth2';
  const authorization = `Basic ${Buffer.from(`${username}:${token.value}`).toString('base64')}`;
  const environment: NodeJS.ProcessEnv = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' };
  const count = Number.parseInt(environment.GIT_CONFIG_COUNT ?? '0', 10) || 0;
  environment.GIT_CONFIG_COUNT = String(count + 1);
  environment[`GIT_CONFIG_KEY_${count}`] = 'http.extraHeader';
  environment[`GIT_CONFIG_VALUE_${count}`] = `Authorization: ${authorization}`;
  const remote = `${repository.webBase}/${repository.projectPath}.git`;
  try {
    await execFileAsync('git', ['push', '--porcelain', remote, ref], {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: environment,
    });
  } catch (error) {
    const item = error as { stdout?: string; stderr?: string };
    const detail = item.stderr?.trim() || item.stdout?.trim() || (error as Error).message;
    fail('PLATFORM_PUSH_FAILED', `tokenized HTTPS git push 失败：${redact(detail, token.value)}`);
  }
  return { method: 'tokenized-git', command: `git push ${remote} ${ref}`, warnings };
}

export async function pushTag(
  root: string,
  repository: PlatformRepository,
  token: PlatformToken,
  tag: string,
): Promise<PushResult> {
  return tokenizedPushRef(root, repository, token, `${tag}:${tag}`, []);
}

export async function pushBranch(
  root: string,
  repository: PlatformRepository,
  token: PlatformToken,
  branch: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PushResult> {
  if (repository.platform === 'gitlab') {
    return tokenizedPush(root, repository, token, branch, [
      'GitLab 公共 REST 不提供原始 Git 对象导入；推送使用 tokenized HTTPS git 传输，PR/MR 与合入仍走 REST API。',
    ]);
  }
  try {
    return await tokenizedPush(root, repository, token, branch, []);
  } catch (error) {
    if ((error as { code?: string }).code !== 'PLATFORM_PUSH_FAILED') throw error;
    const tokenizedDetail = truncated(redact((error as Error).message, token.value));
    try {
      const pushed = await pushGitHubApi(root, repository, token, branch, fetchImpl);
      return {
        ...pushed,
        warnings: [...pushed.warnings,
          `GitHub tokenized HTTPS git push 失败，已回退到 Git Data API：${tokenizedDetail}`],
      };
    } catch (fallbackError) {
      const fallbackDetail = truncated(redact((fallbackError as Error).message, token.value));
      fail('PLATFORM_PUSH_FAILED', `tokenized HTTPS git push 失败：${tokenizedDetail}；GitHub Git Data API 回退也失败：${fallbackDetail}`);
    }
  }
}
