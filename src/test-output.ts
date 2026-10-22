export type TestOutcome = 'passed' | 'failed' | 'skipped';

export interface ObservedTest {
  name: string;
  outcome: TestOutcome;
}

export interface TestOutputObservation {
  framework: string;
  tests: ObservedTest[];
  /** Failure count reported by the runner summary (e.g. TAP `# fail N`), when present. */
  summaryFailures?: number;
}

export interface TestOutputParser {
  name: string;
  parse(output: string): TestOutputObservation | null;
}

export interface TestReference {
  path: string;
  name?: string;
}

export interface TestEvidence {
  verified: boolean;
  outcome?: 'passed' | 'failed';
  framework?: string;
  reason: string;
  /** Failed tests seen anywhere in the output (parsed results or runner summary). */
  failures: number;
}

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/gu;

function cleanOutput(output: string): string {
  return output.replace(ANSI, '');
}

function unescapeTap(value: string): string {
  return value.replace(/\\([\\#])/gu, '$1');
}

function tapParser(): TestOutputParser {
  return {
    name: 'node:test-tap',
    parse(value) {
      const tests: ObservedTest[] = [];
      let summaryFailures: number | undefined;
      for (const line of cleanOutput(value).split(/\r?\n/u)) {
        const summary = /^#\s+fail\s+(\d+)\s*$/u.exec(line);
        if (summary) summaryFailures = Math.max(summaryFailures ?? 0, Number(summary[1]));
        const match = /^\s*(not ok|ok)\s+\d+\s+-\s+(.*)$/u.exec(line);
        if (!match) continue;
        const directive = /\s+#\s*(SKIP|TODO)\b.*$/iu.exec(match[2]!);
        const rawName = (directive ? match[2]!.slice(0, directive.index) : match[2]!).trimEnd();
        if (!rawName) continue;
        tests.push({
          name: unescapeTap(rawName),
          outcome: directive ? 'skipped' : match[1] === 'not ok' ? 'failed' : 'passed',
        });
      }
      return tests.length ? { framework: 'node:test-tap', tests, ...(summaryFailures === undefined ? {} : { summaryFailures }) } : null;
    },
  };
}

function specParser(): TestOutputParser {
  return {
    name: 'node:test-spec',
    parse(value) {
      const tests: ObservedTest[] = [];
      let summaryFailures: number | undefined;
      for (const line of cleanOutput(value).split(/\r?\n/u)) {
        const summary = /^\s*ℹ\s+fail\s+(\d+)\s*$/u.exec(line);
        if (summary) summaryFailures = Math.max(summaryFailures ?? 0, Number(summary[1]));
        const match = /^\s*([✔✖﹣])\s+(.+?)(?:\s+\(\d+(?:\.\d+)?(?:ms|s)\))?\s*$/u.exec(line);
        if (!match) continue;
        tests.push({
          name: match[2]!.trim(),
          outcome: match[1] === '✔' ? 'passed' : match[1] === '✖' ? 'failed' : 'skipped',
        });
      }
      return tests.length ? { framework: 'node:test-spec', tests, ...(summaryFailures === undefined ? {} : { summaryFailures }) } : null;
    },
  };
}

// Register another framework here and return the same observation shape. The
// first parser that recognizes the output supplies the evidence for verify.
export const TEST_OUTPUT_PARSERS: TestOutputParser[] = [tapParser(), specParser()];

export function inspectTestOutput(output: string, reference: TestReference): TestEvidence {
  const observations = TEST_OUTPUT_PARSERS.map(parser => {
    try { return parser.parse(output); }
    catch { return null; }
  }).filter((item): item is TestOutputObservation => item !== null);
  if (!observations.length) return { verified: false, reason: '无法解析 node:test TAP 或 spec 输出。', failures: 0 };
  const tests = observations.flatMap(item => item.tests);
  const failures = Math.max(tests.filter(item => item.outcome === 'failed').length,
    ...observations.map(item => item.summaryFailures ?? 0));
  const framework = observations[0]!.framework;
  if (reference.name) {
    const matched = tests.filter(item => item.name === reference.name || unescapeTap(item.name) === reference.name);
    if (!matched.length) {
      return { verified: false, framework, reason: `测试输出中未找到具名测试：${reference.name}。`, failures };
    }
    if (matched.some(item => item.outcome === 'failed')) return { verified: true, outcome: 'failed', framework, reason: '具名测试结果为失败。', failures };
    if (matched.some(item => item.outcome === 'passed')) return { verified: true, outcome: 'passed', framework, reason: '具名测试结果为通过。', failures };
    return { verified: false, framework, reason: `具名测试未执行或被跳过：${reference.name}。`, failures };
  }
  if (tests.some(item => item.outcome === 'failed')) return { verified: true, outcome: 'failed', framework, reason: '文件测试存在失败项。', failures };
  if (tests.some(item => item.outcome === 'passed')) return { verified: true, outcome: 'passed', framework, reason: '文件测试全部通过。', failures };
  return { verified: false, framework, reason: '测试输出中没有可用的通过测试。', failures };
}
