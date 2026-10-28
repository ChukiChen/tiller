import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { RESOURCE_VERSION } from '../dist/core.js';
import { cli, fixture, spawnCaptured, success } from './helpers.mjs';

const repository = new URL('../', import.meta.url);

test('CASE-021 importing the complete CLI performs no command or output', () => {
  const result = spawnCaptured(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(new URL('../dist/cli.js', import.meta.url).href)}); process.stdout.write('imported');`],
  { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'imported');
  assert.equal(result.stderr, '');
});

test('CASE-022 importing the CLI from stdin does not require a file entry or run a command', () => {
  const result = spawnCaptured(process.execPath, ['--input-type=module', '-'], {
    encoding: 'utf8', windowsHide: true,
    input: `await import(${JSON.stringify(new URL('../dist/cli.js', import.meta.url).href)}); process.stdout.write('imported');`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'imported');
  assert.equal(result.stderr, '');
});

test('CASE-319 initialization and package expose the current 0.5.0 contract without run.cjs', async t => {
  const root = fixture(t);
  const initialized = success(cli(root, 'init'));
  const pkg = JSON.parse(readFileSync(new URL('package.json', repository), 'utf8'));

  assert.equal(pkg.version, '0.5.0');
  assert.equal(RESOURCE_VERSION, '0.5.0');
  assert.equal(initialized.metadata.resourceVersion, '0.5.0');
  assert.equal(Object.hasOwn(initialized.metadata.managedFiles, '.tiller/run.cjs'), false);
  assert.equal(existsSync(join(root, '.tiller/run.cjs')), false);
  assert.equal(existsSync(new URL('../resources/run.cjs', import.meta.url)), false);
});
