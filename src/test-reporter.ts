function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function outcome(data: Record<string, unknown>, type: string): 'passed' | 'failed' | 'skipped' {
  const details = record(data.details);
  if (details?.skipped === true || details?.todo === true || details?.cancelled === true) return 'skipped';
  return type === 'test:fail' ? 'failed' : 'passed';
}

/** Minimal JSONL reporter: stdout/stderr never participate in verification. */
export default async function* report(source: AsyncIterable<unknown>): AsyncGenerator<string> {
  const stack: string[] = [];
  for await (const value of source) {
    const event = record(value);
    const data = record(event?.data);
    const type = stringValue(event?.type);
    if (!data || !type) continue;
    const name = stringValue(data.name);
    const nesting = numberValue(data.nesting, name ? stack.length : 0);
    if (type === 'test:start' && name) {
      stack[nesting] = name;
      stack.length = nesting + 1;
      continue;
    }
    if ((type === 'test:pass' || type === 'test:fail') && name) {
      const path = [...stack.slice(0, nesting), name].filter(Boolean).join(' > ');
      yield `${JSON.stringify({
        type: outcome(data, type) === 'passed' ? 'pass' : outcome(data, type) === 'failed' ? 'fail' : 'skip',
        name,
        path,
        outcome: outcome(data, type),
        file: stringValue(data.file) ?? null,
      })}\n`;
      continue;
    }
    if (type === 'test:summary') {
      yield `${JSON.stringify({ type: 'summary', success: data.success === true, counts: data.counts ?? null })}\n`;
    }
  }
}
