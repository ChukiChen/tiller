import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { readProjectMetadata } from './core.js';
import { assertSafePath, assertSafePaths } from './files.js';
import { resolveRepositoryRoot, resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { repositoryPath } from './repository-paths.js';
import { loadWorkRecord, contentIssues } from './work.js';
import { planningDigest } from './planning.js';
import { assertVerificationInput } from './verification-selection.js';
import type { VerificationArtifactSnapshots } from './verification-selection.js';
import type { FileRef, Scope } from './confirmations.js';
import type { PlanningArtifact } from './planning-types.js';
import { gateIssue } from './gate-conditions.js';
import type { GateIssue } from './gate-conditions.js';

const key = (ref: FileRef): string => `${ref.repository}::${ref.path}`;
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
export interface GeneratedArtifactManifest {
  schemaVersion: 1;
  output: FileRef & { sha256: string };
  inputs: (FileRef & { sha256: string })[];
  command: string; observer: string; observedAt: string; environment: string;
}
function manifest(value: unknown): GeneratedArtifactManifest {
  function object(raw: unknown, keys: string[]): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !keys.includes(key))) throw new Error('生成产物来源清单包含未知结构。');
    return raw as Record<string, unknown>;
  }
  function text(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 20000 || raw.includes('\0')) throw new Error('生成来源必须提供有界的真实观察说明。');
    return raw;
  }
  function bound(raw: unknown): FileRef & { sha256: string } {
    const item = object(raw, ['repository', 'path', 'sha256']);
    const ref = { repository: text(item.repository), path: text(item.path) }; assertVerificationInput(ref);
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(item.sha256)) throw new Error('生成来源缺少实际内容摘要。');
    return { ...ref, sha256: item.sha256 };
  }
  const item = object(value, ['schemaVersion', 'output', 'inputs', 'command', 'observer', 'observedAt', 'environment']);
  if (item.schemaVersion !== 1 || !Array.isArray(item.inputs) || !item.inputs.length || item.inputs.length > 1000) throw new Error('生成来源仅支持版本 1 及非空有限输入。');
  const inputs = item.inputs.map(bound);
  if (new Set(inputs.map(ref => key(ref).toLowerCase())).size !== inputs.length) throw new Error('生成来源输入重复。');
  const observedAt = text(item.observedAt);
  if (!Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt) throw new Error('生成来源观察时间无效。');
  return { schemaVersion: 1, output: bound(item.output), inputs, command: text(item.command), observer: text(item.observer), observedAt, environment: text(item.environment) };
}

/** Snapshots cover every selected member. Control files are rejected, never silently filtered. */
export async function inspectTaskArtifacts(rootInput: string, workId: string, artifacts: PlanningArtifact[], scope: Scope,
  referenceSnapshots: VerificationArtifactSnapshots = {}) {
  const root = await resolveWorkRoot(rootInput, workId);
  return withDeliveryLocation(root, workId, async () => {
    const work = await loadWorkRecord(root, workId);
    const metadata = await readProjectMetadata(root);
    if (!scope.repositories.every(repo => work.record.scope.repositories.includes(repo))
      || !scope.targets.every(target => work.record.scope.targets.includes(target))) throw new Error('产物检查范围超出当前工作。');
    const roots = new Map<string, string>();
    const shared = new Map<string, Set<string>>();
    const snapshots: VerificationArtifactSnapshots = {};
    const issues: GateIssue[] = []; const warnings: GateIssue[] = [];
    let bytes = 0; let members = 0; let directories = 0;
    async function pathFor(ref: FileRef): Promise<{ repositoryRoot: string; path: string }> {
      assertVerificationInput(ref);
      if (!scope.repositories.includes(ref.repository) || (ref.repository !== '.' && !metadata.repositories.includes(ref.repository))) throw new Error('产物引用超出已登记仓库范围。');
      if (ref.repository === '.' && metadata.mode === 'workspace') {
        const boundaries = ['repositories', ...metadata.repositories.map(repository => repositoryPath(metadata, repository))];
        if (boundaries.some(boundary => ref.path.toLowerCase() === boundary.toLowerCase() || ref.path.toLowerCase().startsWith(`${boundary.toLowerCase()}/`))) throw new Error('业务产物须使用稳定仓库标识，不能通过管理根绕过。');
      }
      let repositoryRoot = roots.get(ref.repository);
      if (!repositoryRoot) { repositoryRoot = await resolveRepositoryRoot(root, ref.repository); roots.set(ref.repository, repositoryRoot); }
      return { repositoryRoot, path: await assertSafePath(repositoryRoot, ref.path) };
    }
    async function capture(ref: FileRef, selected: Record<string, string>, localBinary = false): Promise<Buffer> {
      const located = await pathFor(ref); const stat = await lstat(located.path);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 64 * 1024 * 1024) throw new Error('产物须为最多 64 MiB 的普通独立文件。');
      const isNew = !Object.hasOwn(selected, key(ref));
      if (isNew) {
        members++; bytes += stat.size;
        if (members > 1000 || bytes > 64 * 1024 * 1024) throw new Error('产物集合超过 1000 文件或 64 MiB 上限，请明确缩小交付集合。');
      }
      const content = await readFile(located.path);
      if (isNew) bytes += content.byteLength - stat.size;
      if (content.byteLength > 64 * 1024 * 1024 || bytes > 64 * 1024 * 1024) throw new Error('读取期间产物超过容量限制。');
      selected[key(ref)] = hash(content);
      if (!localBinary) { const paths = shared.get(ref.repository) ?? new Set<string>(); paths.add(ref.path); shared.set(ref.repository, paths); }
      return content;
    }
    async function directory(ref: FileRef, selected: Record<string, string>, depth = 0): Promise<void> {
      if (depth > 64 || ++directories > 1000) throw new Error('产物目录超过 64 层或 1000 目录限制。');
      const located = await pathFor(ref); const stat = await lstat(located.path);
      if (!stat.isDirectory()) throw new Error('已声明产物目录不是普通目录。');
      const entries = await readdir(located.path, { withFileTypes: true });
      if (entries.length > 1000) throw new Error('产物目录成员超过容量限制。');
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const child = { repository: ref.repository, path: `${ref.path}/${entry.name}` };
        if (entry.isDirectory()) await directory(child, selected, depth + 1);
        else await capture(child, selected);
      }
    }
    for (const artifact of artifacts) {
      const selected: Record<string, string> = {};
      try {
        if (artifact.type === 'reference') {
          const previous = referenceSnapshots[`${artifact.taskId}::${artifact.artifactId}`];
          if (!previous || !Object.keys(previous).length) throw Object.assign(new Error('缺少来源任务的有效产物快照。'), { code: 'ENOENT' });
          for (const [name, sha256] of Object.entries(previous)) {
            const separator = name.indexOf('::');
            if (separator < 1 || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error('引用产物快照格式无效。');
            const ref = { repository: name.slice(0, separator), path: name.slice(separator + 2) };
            await capture(ref, selected, true);
            if (selected[key(ref)] !== sha256) throw Object.assign(new Error('来源任务产物在核对期间发生变化。'), { code: 'STALE_REFERENCED_ARTIFACT' });
          }
        } else if (artifact.type === 'document') {
          const content = await capture(artifact.source, selected);
          const decoded = content.toString('utf8');
          if (!Buffer.from(decoded, 'utf8').equals(content)) throw new Error('文档不是有效 UTF-8 文本。');
          const problems = contentIssues(decoded, artifact.id);
          if (problems.length) throw Object.assign(new Error(problems.join('；')), { code: 'INCOMPLETE_ARTIFACT' });
        } else if (artifact.type === 'source') {
          for (const ref of artifact.files) await capture(ref, selected);
          for (const ref of artifact.directories) await directory(ref, selected);
          if (!Object.keys(selected).length) throw Object.assign(new Error('源码集合为空。'), { code: 'INCOMPLETE_ARTIFACT' });
        } else {
          const identities = [artifact.output, artifact.evidence, ...artifact.inputs].map(ref => key(ref).toLowerCase());
          if (new Set(identities).size !== identities.length) throw new Error('生成来源、输出及输入不能互相自证或使用大小写别名。');
          await capture(artifact.output, selected, true);
          for (const input of artifact.inputs) await capture(input, selected);
          const evidence = await capture(artifact.evidence, selected);
          const decoded = evidence.toString('utf8');
          if (!Buffer.from(decoded, 'utf8').equals(evidence)) throw new Error('生成来源清单不是有效 UTF-8 文本。');
          const source = manifest(JSON.parse(decoded));
          if (key(source.output) !== key(artifact.output) || source.output.sha256 !== selected[key(artifact.output)]
            || source.inputs.length !== artifact.inputs.length || artifact.inputs.some(ref => !source.inputs.some(input => key(input) === key(ref) && input.sha256 === selected[key(ref)]))) {
            throw Object.assign(new Error('生成来源没有绑定当前输出及完整输入版本。'), { code: 'STALE_GENERATED_ARTIFACT' });
          }
        }
        snapshots[artifact.id] = selected;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const missing = code === 'ENOENT';
        const recoverable = missing || code === 'INCOMPLETE_ARTIFACT' || code === 'STALE_GENERATED_ARTIFACT' || code === 'STALE_REFERENCED_ARTIFACT';
        const issue = gateIssue(missing ? 'ARTIFACT_MISSING' : recoverable ? code! : 'INVALID_ARTIFACT',
          missing ? `产物 ${artifact.id} 缺少声明文件或依赖产物。` : `产物 ${artifact.id}：${(error as Error).message}`,
          { artifactId: artifact.id, exceptionAllowed: recoverable });
        (artifact.required || !recoverable ? issues : warnings).push(issue);
      }
    }
    for (const [repository, files] of shared) {
      try { await assertSafePaths(roots.get(repository)!, [...files]); }
      catch { issues.push(gateIssue('UNSHARED_ARTIFACT', `仓库 ${repository} 中必要的共享产物或来源被忽略或不可安全读取。`)); }
    }
    return { snapshots, issues, warnings, basisDigest: planningDigest({ artifacts, snapshots, issues, warnings }) };
  });
}
