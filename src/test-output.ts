import path from 'node:path';

export interface TestReference {
  path: string;
  name?: string;
}

export interface TestEvidence {
  verified: boolean;
  outcome?: 'passed' | 'failed';
  reason: string;
}

export interface TestRunPaths {
  reporter: string;
  report: string;
}

export interface TestRunCommand {
  executable: string;
  args: string[];
  display: string;
}

export interface TestRunner {
  name: string;
  build(reference: TestReference, paths: TestRunPaths, pattern?: string): TestRunCommand;
  parse(report: string, reference: TestReference, expectedFile: string): TestEvidence;
}

interface ReportEvent {
  type?: string;
  name?: string;
  path?: string;
  outcome?: string;
  file?: string | null;
  success?: boolean;
}

function quote(value: string): string {
  return /^[A-Za-z0-9_./:=@%+-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function reportEvents(report: string): ReportEvent[] | null {
  const events: ReportEvent[] = [];
  for (const line of report.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let value: unknown;
    try { value = JSON.parse(line); }
    catch { return null; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (typeof item.type !== 'string') return null;
    events.push({
      type: item.type,
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
      ...(typeof item.path === 'string' ? { path: item.path } : {}),
      ...(typeof item.outcome === 'string' ? { outcome: item.outcome } : {}),
      ...(typeof item.file === 'string' || item.file === null ? { file: item.file } : {}),
      ...(typeof item.success === 'boolean' ? { success: item.success } : {}),
    });
  }
  return events;
}

function sameFile(left: string | null | undefined, right: string): boolean {
  if (!left) return false;
  return path.resolve(left) === path.resolve(right);
}

function matches(reference: TestReference, event: ReportEvent): boolean {
  if (!reference.name) return true;
  return event.path === reference.name;
}

function inspectEvents(events: ReportEvent[], reference: TestReference, expectedFile: string): TestEvidence {
  const tests = events.filter(event => (event.type === 'pass' || event.type === 'fail' || event.type === 'skip')
    && event.name && sameFile(event.file, expectedFile));
  const target = tests.filter(event => matches(reference, event));
  const failures = tests.filter(event => event.outcome === 'failed');
  if (!tests.length) return { verified: false, reason: '私有报告中没有可用的测试事件。' };
  if (target.length !== 1) {
    return { verified: false, reason: target.length ? `私有报告匹配到 ${target.length} 个测试。` : '私有报告未找到指定测试。' };
  }
  const found = target[0]!;
  if (found.outcome === 'skipped') return { verified: false, reason: `测试被跳过：${found.path ?? found.name}。` };
  if (reference.name && found.outcome === 'failed' && failures.length !== 1) {
    return { verified: false, reason: '私有报告包含额外的失败事件。' };
  }
  if (found.outcome === 'passed' && failures.length) return { verified: false, reason: '私有报告包含失败事件。' };
  if (events.some(event => event.type === 'summary' && event.success === false) && found.outcome !== 'failed') {
    return { verified: false, reason: '私有报告总结为失败。' };
  }
  if (!reference.name) {
    if (tests.some(event => event.outcome !== 'passed')) return { verified: false, reason: '文件内存在失败或跳过的测试。' };
    return { verified: true, outcome: 'passed', reason: '文件内测试全部通过。' };
  }
  return { verified: true, outcome: found.outcome === 'failed' ? 'failed' : 'passed', reason: '私有报告中的测试结果已核实。' };
}

const nodeTestRunner: TestRunner = {
  name: 'node-test',
  build(reference, paths, pattern) {
    const args = [
      ...(pattern ? [`--test-name-pattern=${pattern}`] : []),
      `--test-reporter=${paths.reporter}`,
      `--test-reporter-destination=${paths.report}`,
      reference.path,
    ];
    return { executable: process.execPath, args, display: ['node', ...args.map(quote)].join(' ') };
  },
  parse(report, reference, expectedFile) {
    const events = reportEvents(report);
    if (events === null) return { verified: false, reason: '私有报告损坏或无法解析。' };
    return inspectEvents(events, reference, expectedFile);
  },
};

export const TEST_RUNNERS: TestRunner[] = [nodeTestRunner];

export function runnerFor(name = 'node-test'): TestRunner {
  const runner = TEST_RUNNERS.find(item => item.name === name);
  if (!runner) throw Object.assign(new Error(`未知验证运行器：${name}。`), { code: 'UNKNOWN_VERIFY_RUNNER' });
  return runner;
}

export function namePattern(reference: TestReference): string | undefined {
  if (!reference.name) return undefined;
  const top = reference.name.split(' > ')[0]!.trim();
  return top ? `^${escapePattern(top)}$` : undefined;
}
