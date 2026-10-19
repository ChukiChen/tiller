import { lstat, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requireReadyProject } from './core.js';
import { inspectConfirmations } from './confirmations.js';
import { assertSafePath, readTextIfExists } from './files.js';
import { parseWorkRecord, readWorkReference, validateWorkId } from './work.js';

interface WorkInspection {
  id: string;
  location: string;
  registration: 'registered' | 'unregistered' | 'unsupported' | 'invalid' | 'legacy-file';
  structureIssues: string[];
  artifactIssues: string[];
  confirmations: unknown;
  ready: boolean;
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

async function inspectOne(root: string, name: string, repositories: string[]): Promise<WorkInspection> {
  const location = `.tiller/work/${name}`;
  const result: WorkInspection = {
    id: name, location, registration: 'unregistered', structureIssues: [], artifactIssues: [],
    confirmations: { status: 'unknown', automaticTransition: false }, ready: false,
  };
  try {
    const target = await assertSafePath(root, location);
    let stat;
    try { stat = await lstat(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      result.structureIssues.push('工作目录不存在。');
      return result;
    }
    if (stat.isFile()) {
      result.registration = 'legacy-file';
      result.structureIssues.push('单文件资料尚未登记；请用 work create 新建工作并明确引用所需资料。');
      return result;
    }
    if (!stat.isDirectory()) throw new Error('工作位置不是普通目录。');
    validateWorkId(name);
    const notes = await readTextIfExists(root, `${location}/work.md`);
    if (notes === null) result.structureIssues.push('缺少 work.md；README.md 不能自动替代工作入口。');
    const text = await readTextIfExists(root, `${location}/record.json`);
    if (text === null) result.structureIssues.push('缺少 record.json，当前工作未登记。');
    else {
      const record = parseWorkRecord(text, name);
      result.registration = 'registered';
      for (const repository of record.scope.repositories) {
        if (repository !== '.' && !repositories.includes(repository)) result.structureIssues.push(`工作范围包含未登记仓库：${repository}`);
      }
      for (const [role, artifact] of Object.entries(record.artifacts)) {
        try {
          if (await readWorkReference(root, artifact.source) === null) result.artifactIssues.push(`已登记 ${role} 产物不存在：${artifact.source.path}`);
        } catch (error) { result.artifactIssues.push(`${role}：${message(error)}`); }
      }
    }
    if (notes !== null) {
      try {
        const confirmations = await inspectConfirmations(root, name);
        result.confirmations = { ...confirmations, status: confirmations.requests.length ? 'recorded' : 'unknown' };
      }
      catch (error) { result.confirmations = { status: 'unknown', issues: [message(error)], automaticTransition: false }; }
    }
  } catch (error) {
    result.registration = (error as { code?: string }).code === 'UNSUPPORTED_RECORD_VERSION' ? 'unsupported' : 'invalid';
    result.structureIssues.push(message(error));
  }
  result.ready = result.registration === 'registered' && !result.structureIssues.length && !result.artifactIssues.length;
  return result;
}

/** Read-only and deliberately independent of registration: no age or semantic inference. */
export async function inspectWork(rootInput: string, id?: string) {
  const root = resolve(rootInput);
  const metadata = await requireReadyProject(root, { write: false });
  const works: WorkInspection[] = [];
  if (id !== undefined) {
    validateWorkId(id);
    works.push(await inspectOne(root, id, metadata.repositories));
  } else {
    const directory = await assertSafePath(root, '.tiller/work');
    let names: string[] = [];
    try { names = await readdir(directory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    for (const name of names.sort()) works.push(await inspectOne(root, name, metadata.repositories));
  }
  return { root, ready: works.every(work => work.ready), works, issues: works.flatMap(work => [...work.structureIssues, ...work.artifactIssues].map(issue => `${work.id}: ${issue}`)), automaticTransition: false };
}
