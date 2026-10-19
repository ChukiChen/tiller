const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['.tiller/run.cjs', '--version', '--json'], { encoding: 'utf8', windowsHide: true });
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(result.stdout).version, '0.4.0', 'T6 intentional initial failure: installed candidate must be 0.4.0');
console.log('T6 installed launcher version verified');
