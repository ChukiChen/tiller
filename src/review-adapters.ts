/** Minimal built-in REST adapters. Tokens are read only at request time and never returned. */
export interface ReviewProvider {
  kind: 'github' | 'gitlab'; apiUrl: string; project: string; tokenEnv?: string;
}
export interface ReviewObject {
  provider: 'github' | 'gitlab'; id: string; url: string; project: string;
  source: string; target: string; sourceOid: string; targetOid: string;
  state: 'open' | 'closed' | 'merged'; mergeOid: string | null;
  title: string; body: string; observedAt: string;
}
export interface ReviewWrite { source: string; target: string; title: string; body: string }

export function validateProvider(value: unknown): ReviewProvider {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('评审平台配置必须为对象。');
  const p = value as ReviewProvider;
  if (!['github', 'gitlab'].includes(p.kind) || typeof p.project !== 'string' ||
      !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u.test(p.project) || p.project.split('/').some(v => v === '.' || v === '..')) {
    throw new Error('评审平台及 project 必须明确提供。');
  }
  const url = new URL(p.apiUrl);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) {
    throw new Error('API 地址须使用 HTTPS 且不含凭据、查询或片段；仅本机测试允许 HTTP。');
  }
  if (p.tokenEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(p.tokenEnv)) throw new Error('tokenEnv 必须为环境变量名。');
  if (Object.keys(p).some(k => !['kind', 'apiUrl', 'project', 'tokenEnv'].includes(k))) throw new Error('平台配置含不支持字段；不能传入明文 token。');
  return { kind: p.kind, apiUrl: url.href.replace(/\/$/u, ''), project: p.project, ...(p.tokenEnv ? { tokenEnv: p.tokenEnv } : {}) };
}

export function assertProviderRemote(provider: ReviewProvider, remote: string): void {
  const api = new URL(provider.apiUrl);
  const expectedHost = api.hostname === 'api.github.com' ? 'github.com' : api.hostname;
  let host: string; let project: string;
  if (/^[^@/]+@[^:]+:/u.test(remote)) {
    const match = /^[^@/]+@([^:]+):(.+)$/u.exec(remote)!;
    host = match[1]!; project = match[2]!;
  } else {
    const url = new URL(remote);
    if (url.password || url.search || url.hash) throw new Error('Git 远端 URL 不得携带秘密或查询参数。');
    host = url.hostname; project = url.pathname.replace(/^\//u, '');
  }
  if (host !== expectedHost || project.replace(/\.git$/u, '').replace(/\/$/u, '') !== provider.project) {
    throw new Error('评审平台项目与登记 Git 远端不匹配。');
  }
}

type Json = Record<string, unknown>;
function obj(v: unknown): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('平台响应格式无效。');
  return v as Json;
}
function str(v: unknown): string { if (typeof v !== 'string') throw new Error('平台响应缺少文本字段。'); return v; }
function oid(v: unknown): string { const s = str(v); if (!/^[0-9a-f]{40,64}$/u.test(s)) throw new Error('平台响应缺少有效提交。'); return s; }
function reviewId(id: string): string { if (!/^[1-9][0-9]*$/u.test(id)) throw new Error('评审标识须为正整数。'); return id; }

export class ReviewAdapter {
  readonly provider: ReviewProvider;
  readonly capabilities = { create: true, update: true, query: true, atomicSourceAndTargetMerge: false };
  constructor(provider: ReviewProvider) { this.provider = validateProvider(provider); }
  private get prefix(): string {
    const p = this.provider;
    return p.kind === 'github' ? `/repos/${p.project.split('/').map(encodeURIComponent).join('/')}` : `/projects/${encodeURIComponent(p.project)}`;
  }
  private get collection(): string { return this.prefix + (this.provider.kind === 'github' ? '/pulls' : '/merge_requests'); }
  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const token = this.provider.tokenEnv ? process.env[this.provider.tokenEnv] : undefined;
    if (method !== 'GET' && !token) throw new Error('评审写操作缺少配置的认证凭据。');
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (token) headers[this.provider.kind === 'github' ? 'Authorization' : 'PRIVATE-TOKEN'] = this.provider.kind === 'github' ? `Bearer ${token}` : token;
    let response: Response;
    try {
      response = await fetch(this.provider.apiUrl + endpoint, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error('平台请求结果未知；须先查询核对，禁止盲目重放写操作。'); }
    // Never include remote response bodies: providers may echo authentication data.
    if (!response.ok) throw new Error(`平台返回 HTTP ${response.status}；未确认操作完成。`);
    try { return await response.json(); }
    catch { throw new Error('平台响应不是有效 JSON；未确认操作结果。'); }
  }
  async get(id: string): Promise<ReviewObject> {
    const raw = obj(await this.request('GET', `${this.collection}/${reviewId(id)}`));
    const p = this.provider;
    if (p.kind === 'github') {
      const head = obj(raw.head); const base = obj(raw.base);
      if (obj(head.repo).full_name !== p.project || obj(base.repo).full_name !== p.project || String(raw.number) !== id) {
        throw new Error('PR 仓库或标识不匹配；跨 fork 评审尚不支持。');
      }
      return {
        provider: p.kind, id, url: this.safeUrl(raw.html_url), project: p.project,
        source: str(head.ref), target: str(base.ref), sourceOid: oid(head.sha), targetOid: oid(base.sha),
        state: raw.merged === true ? 'merged' : raw.state === 'open' ? 'open' : 'closed',
        mergeOid: raw.merged === true ? oid(raw.merge_commit_sha) : null,
        title: typeof raw.title === 'string' ? raw.title : '', body: typeof raw.body === 'string' ? raw.body : '', observedAt: new Date().toISOString(),
      };
    }
    const project = obj(await this.request('GET', this.prefix));
    if (project.path_with_namespace !== p.project || raw.source_project_id !== project.id || raw.target_project_id !== project.id || String(raw.iid) !== id) {
      throw new Error('MR 仓库或标识不匹配；跨 fork 评审尚不支持。');
    }
    const branch = obj(await this.request('GET', `${this.prefix}/repository/branches/${encodeURIComponent(str(raw.target_branch))}`));
    return {
      provider: p.kind, id, url: this.safeUrl(raw.web_url), project: p.project,
      source: str(raw.source_branch), target: str(raw.target_branch), sourceOid: oid(raw.sha), targetOid: oid(obj(branch.commit).id),
      state: raw.state === 'merged' ? 'merged' : raw.state === 'opened' ? 'open' : 'closed',
      mergeOid: raw.state === 'merged' ? oid(raw.merge_commit_sha ?? raw.squash_commit_sha) : null,
      title: typeof raw.title === 'string' ? raw.title : '', body: typeof raw.description === 'string' ? raw.description : '', observedAt: new Date().toISOString(),
    };
  }
  private safeUrl(value: unknown): string {
    const url = new URL(str(value)); const api = new URL(this.provider.apiUrl);
    const host = api.hostname === 'api.github.com' ? 'github.com' : api.hostname;
    if (url.hostname !== host || url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('评审 URL 不可信。');
    return url.href;
  }
  async find(source: string, target: string): Promise<ReviewObject[]> {
    const p = this.provider;
    const query = p.kind === 'github' ? { state: 'all', head: `${p.project.split('/')[0]}:${source}`, base: target } : { state: 'all', source_branch: source, target_branch: target };
    const output: ReviewObject[] = [];
    for (let page = 1; page <= 100; page++) {
      const raw = await this.request('GET', `${this.collection}?${new URLSearchParams({ ...query, per_page: '100', page: String(page) })}`);
      if (!Array.isArray(raw)) throw new Error('评审查询结果无效。');
      for (let start = 0; start < raw.length; start += 4) {
        const ids = raw.slice(start, start + 4).map(item => {
          const row = obj(item);
          return reviewId(String(p.kind === 'github' ? row.number : row.iid));
        });
        const reviews = await Promise.allSettled(ids.map(id => this.get(id)));
        for (const result of reviews) {
          if (result.status === 'rejected') throw result.reason;
          if (result.value.source === source && result.value.target === target) output.push(result.value);
        }
      }
      if (raw.length < 100) return output;
    }
    throw new Error('评审查询超出分页上限，无法排除重复对象。');
  }
  async create(input: ReviewWrite): Promise<ReviewObject> {
    const body = this.provider.kind === 'github'
      ? { head: input.source, base: input.target, title: input.title, body: input.body }
      : { source_branch: input.source, target_branch: input.target, title: input.title, description: input.body, remove_source_branch: false };
    const result = obj(await this.request('POST', this.collection, body));
    return this.get(String(this.provider.kind === 'github' ? result.number : result.iid));
  }
  async update(id: string, input: ReviewWrite): Promise<ReviewObject> {
    const before = await this.get(id);
    if (before.source !== input.source || before.target !== input.target || before.state !== 'open') throw new Error('评审分支或状态不匹配。');
    await this.request(this.provider.kind === 'github' ? 'PATCH' : 'PUT', `${this.collection}/${reviewId(id)}`,
      this.provider.kind === 'github' ? { title: input.title, body: input.body } : { title: input.title, description: input.body });
    return this.get(id);
  }
  async merge(): Promise<never> {
    throw new Error('平台 REST 适配不能原子保护已确认的源和目标 OID；请使用具备保护的平台人工流程，再 reconcile 核对结果。');
  }
}
