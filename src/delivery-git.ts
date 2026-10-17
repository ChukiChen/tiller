import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Explicit cwd and argument arrays; inherited Git redirection/config cannot change the repository. */
export async function git(root: string, args: string[]): Promise<string> {
  if (args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Git 参数无效。');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG.*|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|SSH.*|ASKPASS|EXTERNAL_DIFF)$/u.test(key)) delete env[key];
  }
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_OPTIONAL_LOCKS = '0';
  env.LC_ALL = 'C';
  const result = await execute('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}
