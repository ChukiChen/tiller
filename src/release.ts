import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { inspectProject } from './core.js';
import { readTextIfExists } from './files.js';
import { planUpgrade } from './upgrade.js';

const execFileAsync = promisify(execFile);

export type ReleaseItemStatus = 'pass' | 'fail' | 'na';

export interface ReleaseItem {
  id: string;
  title: string;
  status: ReleaseItemStatus;
  detail: string;
}

export interface ReleaseChecklist {
  ready: boolean;
  items: ReleaseItem[];
  failures: string[];
}

export interface ReleaseChecklistInput {
  id: string;
  accepted: boolean;
  acceptanceCommit?: string;
  scope: string[];
}

async function git(root: string, args: string[]): Promise<{ ok: boolean; stdout: string }> {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' },
    });
    return { ok: true, stdout: result.stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
}

function inScope(relative: string, scope: string[]): boolean {
  return scope.includes('.') || scope.some(root => relative === root || relative.startsWith(`${root}/`));
}

function ignored(relative: string, id: string): boolean {
  return relative === `.tiller/task/${id}` || relative.startsWith(`.tiller/task/${id}/`)
    || relative.startsWith('.tiller/local/') || relative.includes('/node_modules/');
}

async function dirtyTaskScope(root: string, input: ReleaseChecklistInput): Promise<string[] | null> {
  const repository = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!repository.ok) return null;
  const tracked = await git(root, ['diff', '--name-only', '-z', 'HEAD', '--']);
  const untracked = await git(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', ...input.scope]);
  if (!tracked.ok || !untracked.ok) return null;
  return [...new Set([...tracked.stdout.split('\0'), ...untracked.stdout.split('\0')].filter(Boolean))]
    .filter(relative => !ignored(relative, input.id) && inScope(relative, input.scope)).sort();
}

/** Read-only release gate. It never publishes or mutates project files. */
export async function releaseChecklist(rootInput: string, input: ReleaseChecklistInput): Promise<ReleaseChecklist> {
  const root = path.resolve(rootInput);
  const items: ReleaseItem[] = [];
  const add = (id: string, title: string, status: ReleaseItemStatus, detail: string): void => {
    items.push({ id, title, status, detail });
  };

  add('accepted', '任务已验收', input.accepted ? 'pass' : 'fail',
    input.accepted ? '任务处于已验收或已关闭阶段。' : '任务尚未通过交付验收。');

  const commit = input.acceptanceCommit;
  if (!commit || commit === 'no-git') {
    add('acceptance-commit', '验收提交可追溯', 'fail', '未记录可用 Git 验收提交。');
  } else {
    const exists = await git(root, ['cat-file', '-e', `${commit}^{commit}`]);
    add('acceptance-commit', '验收提交可追溯', exists.ok ? 'pass' : 'fail',
      exists.ok ? `验收提交 ${commit} 可读取。` : `验收提交 ${commit} 不可读取。`);
  }

  try {
    const inspection = await inspectProject(root);
    add('project-metadata', '项目元数据有效', inspection.ready ? 'pass' : 'fail',
      inspection.ready ? '.tiller/project.json 与受管结构可读取。' : inspection.issues.join('；') || '项目元数据未就绪。');
  } catch (error) {
    add('project-metadata', '项目元数据有效', 'fail', (error as Error).message);
  }

  try {
    const upgrade = await planUpgrade(root);
    add('managed-resources', '受管资源无冲突', upgrade.ready ? 'pass' : 'fail',
      upgrade.ready ? '受管文件摘要一致，无待解决冲突。' : upgrade.conflicts.join('；') || '受管资源预览未通过。');
  } catch (error) {
    add('managed-resources', '受管资源无冲突', 'fail', (error as Error).message);
  }

  const readme = await readTextIfExists(root, 'README.md');
  add('readme', 'README 可交付', readme?.trim() ? 'pass' : 'fail',
    readme?.trim() ? 'README.md 存在且有内容。' : '缺少非空 README.md。');

  const packageText = await readTextIfExists(root, 'package.json');
  if (packageText === null) {
    add('package-metadata', '包元数据有效', 'na', '未发现 package.json；按非 npm 项目跳过包元数据。');
    add('version-doc', '版本与文档一致', 'na', '未发现包版本；跳过版本与 README 一致性检查。');
  } else {
    let packageValue: { name?: unknown; version?: unknown } | null = null;
    try { packageValue = JSON.parse(packageText) as { name?: unknown; version?: unknown }; }
    catch { packageValue = null; }
    const valid = typeof packageValue?.name === 'string' && packageValue.name.trim()
      && typeof packageValue.version === 'string' && packageValue.version.trim();
    add('package-metadata', '包元数据有效', valid ? 'pass' : 'fail',
      valid ? `包 ${packageValue!.name}@${packageValue!.version} 元数据完整。` : 'package.json 缺少有效的 name 或 version。');
    if (!valid || !readme) {
      add('version-doc', '版本与文档一致', 'fail', '无法在有效包元数据和非空 README 之间核对版本。');
    } else {
      const version = String(packageValue!.version);
      add('version-doc', '版本与文档一致', readme.includes(version) ? 'pass' : 'fail',
        readme.includes(version) ? `README 包含当前版本 ${version}。` : `README 未包含当前版本 ${version}。`);
    }
  }

  const dirty = await dirtyTaskScope(root, input);
  if (dirty === null) add('scope-clean', '任务范围已提交', 'fail', '无法读取 Git 工作树状态。');
  else add('scope-clean', '任务范围已提交', dirty.length ? 'fail' : 'pass',
    dirty.length ? `仍有未提交改动：${dirty.join('、')}` : '任务范围内没有未提交改动。');

  const failures = items.filter(item => item.status === 'fail').map(item => `${item.title}：${item.detail}`);
  return { ready: failures.length === 0, items, failures };
}
