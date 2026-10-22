import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function validate(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\x00-\x1f]/u.test(normalized)) {
    throw Object.assign(new Error('确认人必须是非空单行文本，且不超过 200 字符。'), { code: 'INVALID_CONFIRMER' });
  }
  return normalized;
}

export async function resolveConfirmer(root: string, requested?: string): Promise<string> {
  if (requested !== undefined) return validate(requested);
  try {
    const result = await execFileAsync('git', ['config', 'user.name'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
    });
    if (result.stdout.trim()) return validate(result.stdout);
  } catch { /* Non-Git projects use the system user fallback below. */ }
  try { return validate(userInfo().username); }
  catch { return '未记录'; }
}
