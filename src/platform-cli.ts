import { constants } from 'node:fs';
import { access, chmod, copyFile, mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type PlatformCliName = 'github' | 'gitlab';

export interface ResolvedPlatformCli {
  name: PlatformCliName;
  executable: string;
  official: boolean;
  cleanup: () => Promise<void>;
}

const OFFICIAL_NAME: Record<PlatformCliName, string> = { github: 'gh', gitlab: 'glab' };
const WINDOWS = process.platform === 'win32';

function executableNames(name: string): string[] {
  if (!WINDOWS) return [name];
  const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';').map(value => value.trim()).filter(Boolean);
  return [name, ...extensions.map(extension => `${name}${extension.toLowerCase()}`)];
}

async function executable(file: string): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    await access(file, WINDOWS ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findExecutable(name: string, environment: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const directories = (environment.PATH ?? environment.Path ?? '').split(path.delimiter);
  for (const directory of directories) {
    for (const candidateName of executableNames(name)) {
      const candidate = path.resolve(directory || '.', candidateName);
      if (await executable(candidate)) return candidate;
    }
  }
  return null;
}

async function createOfficialShim(name: PlatformCliName, target: string): Promise<{ executable: string; cleanup: () => Promise<void> }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'tiller-platform-cli-'));
  const shim = path.join(directory, WINDOWS ? `${name}.exe` : name);
  try {
    await symlink(target, shim);
  } catch {
    await copyFile(target, shim);
    if (!WINDOWS) await chmod(shim, 0o755);
  }
  return { executable: shim, cleanup: async () => { await rm(directory, { recursive: true, force: true }).catch(() => {}); } };
}

export async function resolvePlatformCli(name: PlatformCliName,
  environment: NodeJS.ProcessEnv = process.env): Promise<ResolvedPlatformCli | null> {
  const direct = await findExecutable(name, environment);
  if (direct) return { name, executable: direct, official: false, cleanup: async () => {} };
  const officialPath = await findExecutable(OFFICIAL_NAME[name], environment);
  if (!officialPath) return null;
  const shim = await createOfficialShim(name, officialPath);
  return { name, executable: shim.executable, official: true, cleanup: shim.cleanup };
}

export function platformCliUnavailable(name: PlatformCliName): string {
  const platform = name === 'github' ? 'GitHub' : 'GitLab';
  return `无法执行 ${name}；PATH 中没有 ${name}，也未找到可自动解析的 ${platform} CLI。请先安装并登录，再重试。`;
}
