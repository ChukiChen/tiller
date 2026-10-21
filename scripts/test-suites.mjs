import {readFile, readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = JSON.parse(await readFile(new URL('../test/suites.json', import.meta.url), 'utf8'));
const actual = (await readdir(new URL('../test/', import.meta.url))).filter(file => file.endsWith('.test.mjs')).sort();
const declared = Object.values(suites).flat();
if (new Set(declared).size !== declared.length || JSON.stringify([...declared].sort()) !== JSON.stringify(actual))
  throw new Error('Every test file must belong to exactly one suite; update test/suites.json for new or removed files.');
const requested = process.argv[2] ?? 'all';
if (process.argv.length > 3 || requested !== 'all' && !Object.hasOwn(suites, requested))
  throw new Error(`Expected all or one of: ${Object.keys(suites).join(', ')}`);
const files = requested === 'all' ? actual : suites[requested];
const concurrency = 2;
// Build exactly once, run each declared file once, and propagate native failures.
async function run(args) {
  const child = spawn(process.execPath, args, {cwd: root, windowsHide: true, stdio: 'inherit'});
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  if (code) process.exit(code);
}
await run(['scripts/build.mjs']);
process.stdout.write(`Running ${files.length} test files with concurrency ${concurrency}.\n`);
await run(['--test', `--test-concurrency=${concurrency}`, ...files.map(file => `test/${file}`)]);
