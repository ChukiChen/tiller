import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const issues = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (/\.(ts|mjs|cjs|md)$/.test(file)) {
      const content = await readFile(file, 'utf8');
      if (/^(<<<<<<< |=======\r?$|>>>>>>> )/m.test(content)) issues.push(`${file}: unresolved merge marker`);
      if (/[\t ]+\r?$/m.test(content)) issues.push(`${file}: trailing whitespace`);
      if (!content.endsWith('\n')) issues.push(`${file}: missing final newline`);
    }
  }
}
for (const directory of ['src', 'resources', 'test', 'scripts']) await visit(directory);
if (issues.length) {
  process.stderr.write(issues.join('\n') + '\n');
  process.exitCode = 1;
} else process.stdout.write('Source and resource lint passed.\n');
