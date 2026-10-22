import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const child = spawn(process.execPath, ['node_modules/typescript/bin/tsc'], {
  cwd: new URL('../', import.meta.url), stdio: 'inherit', windowsHide: true,
});
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (value, signal) => resolve(signal ? 1 : value ?? 1));
});
process.exitCode = code;
