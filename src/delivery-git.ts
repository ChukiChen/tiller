import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

function gitOptions(root: string, args: string[]) {
  if (args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Git 参数无效。');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|SSH.*|ASKPASS|EXTERNAL_DIFF)$/u.test(key)) delete env[key];
  }
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_OPTIONAL_LOCKS = '0';
  env.LC_ALL = 'C';
  return { cwd: root, env, windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024 };
}

/** Explicit cwd and argument arrays; inherited Git redirection/config cannot change the repository. */
export async function git(root: string, args: string[]): Promise<string> {
  const result = await execute('git', ['-c', 'core.quotepath=false', ...args], {
    ...gitOptions(root, args), encoding: 'utf8',
  });
  return result.stdout;
}

/** Read ordinary files from one fixed commit, never a mutable working-tree cache. */
export async function readGitFiles<T = Buffer>(root: string, commit: string, paths: readonly string[],
  consume: (content: Buffer) => T = content => Buffer.from(content) as unknown as T, ordinaryOnly = true): Promise<Map<string, T>> {
  if (!/^[a-f0-9]{40,64}$/u.test(commit)) throw new Error('批量提交文件读取需要固定提交摘要。');
  const entries = new Map<string, { oid: string; size: number }>();
  let batch: string[] = []; let length = 0;
  const inspect = async () => {
    if (!batch.length) return;
    const expected = new Set(batch);
    const output = await git(root, ['--literal-pathspecs', 'ls-tree', '-z', '-l', commit, '--', ...batch]);
    for (const line of output.split('\0').filter(Boolean)) {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\s+(\d+|-)\t(.+)$/u.exec(line);
      if (!match || !expected.has(match[5]!)) throw new Error('提交文件树输出无效。');
      if (match[2] !== 'blob' || (ordinaryOnly && match[1] !== '100644')) throw new Error(`交接不支持目录、子模块、链接或执行位变化：${match[5]}`);
      const size = Number(match[4]);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('提交文件容量无效。');
      entries.set(match[5]!, { oid: match[3]!, size });
    }
    batch = []; length = 0;
  };
  for (const filename of new Set(paths)) {
    if (typeof filename !== 'string' || !filename || /[\x00-\x1f]/u.test(filename)) throw new Error('提交文件路径无效。');
    const cost = filename.length * 2 + 3;
    if (batch.length && length + cost > 6000) await inspect();
    batch.push(filename); length += cost;
  }
  await inspect();
  const blobs = new Map<string, { size: number; value?: T }>();
  for (const entry of entries.values()) blobs.set(entry.oid, { size: entry.size });
  let objects: string[] = []; let bytes = 0;
  const readBatch = async () => {
    if (!objects.length) return;
    const args = ['cat-file', '--batch'];
    const pending = execute('git', ['-c', 'core.quotepath=false', ...args], { ...gitOptions(root, args), encoding: 'buffer' });
    pending.child.stdin!.on('error', () => { /* A failed Git process is reported by its completion. */ });
    pending.child.stdin!.end(objects.join('\n') + '\n');
    const output = (await pending).stdout;
    let offset = 0;
    for (const oid of objects) {
      const newline = output.indexOf(10, offset);
      if (newline < 0) throw new Error('提交对象批量输出不完整。');
      const header = output.subarray(offset, newline).toString('ascii');
      const expected = blobs.get(oid)!;
      if (header !== `${oid} blob ${expected.size}`) throw new Error('提交对象批量身份或容量不一致。');
      offset = newline + 1;
      const end = offset + expected.size;
      if (end >= output.length || output[end] !== 10) throw new Error('提交对象内容不完整。');
      expected.value = consume(output.subarray(offset, end));
      offset = end + 1;
    }
    if (offset !== output.length) throw new Error('提交对象批量输出含额外内容。');
    objects = []; bytes = 0;
  };
  for (const [oid, entry] of blobs) {
    if (entry.size > 16 * 1024 * 1024) {
      await readBatch();
      const args = ['cat-file', 'blob', oid];
      const content = (await execute('git', ['-c', 'core.quotepath=false', ...args], { ...gitOptions(root, args), encoding: 'buffer' })).stdout;
      if (content.length !== entry.size) throw new Error('提交对象容量不一致。');
      entry.value = consume(content);
    } else {
      if (objects.length && bytes + entry.size > 16 * 1024 * 1024) await readBatch();
      objects.push(oid); bytes += entry.size;
    }
  }
  await readBatch();
  return new Map([...entries].map(([filename, entry]) => [filename, blobs.get(entry.oid)!.value!]));
}
