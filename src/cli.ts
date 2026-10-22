#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { bindRuntime, runtimeStatus } from './runtime.js';
import { initialize, inspectProject, recoverProject } from './core.js';
import { applyUpgrade, planUpgrade } from './upgrade.js';
import { acceptFlow, checkFlow, confirmFlow, inspectFlow, resumeFlow, startFlow, verifyFlow } from './flow.js';

export const CLI_VERSION = '0.5.0';

const HELP = `tiller ${CLI_VERSION} — 默认工作流

用法：
  tiller init [path] [--mode project|workspace] [--repo <repository-path> ...]
  tiller status [path]
  tiller start <task-id> --title <标题> --requirement <需求正文> --criterion "AC-1=<验收条件>" [--criterion ...] [--type feature] [--size small|standard] [--target <相对路径> ...] [--path <root>]
  tiller resume [task-id] [--path <root>]
  tiller confirm <task-id> requirements|design|acceptance --quote "<用户原话>" [--commit <oid>] [--path <root>]
  tiller verify <task-id> --criterion AC-1 [--criterion ...] --test <测试文件或用例引用> --command "<验证命令>" [--run "<同一命令>"] [--result passed|failed|skipped] [--path <root>]
  tiller check <task-id> [--path <root>]
  tiller accept <task-id> --quote "<用户原话>" [--commit <oid>] [--path <root>]
  tiller recover [path]
  tiller runtime status|bind [--path <root>]
  tiller upgrade [path] --plan
  tiller upgrade [path] --apply <plan-id>

默认工作流：
- small：需求确认 → 实现 → 验证；standard：需求 → 设计 → 实现 → 验证。验收始终需要真实用户原话。
- 默认人工节点只有需求、设计和交付验收；没有规划、任务、阶段或合入审计命令。
- task.md 是唯一任务记录：需求和设计正文必须先写清；用户原话只作确认凭证，不替代正文。验证保存命令、结果、提交和代码树摘要。
- check 会核对全局用例引用、验收条件→测试引用、范围越界、测试删除或弱化、密钥和本机绝对路径；accept 只接受 check 通过的当前对象。
- upgrade 只核对当前资源契约，不改写文件或版本；版本号只在正式发布时修改。
`;

function usage(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' });
}

async function bindAfterSetup(root: string) {
  try { return await bindRuntime(root, fileURLToPath(import.meta.url)); }
  catch (error) {
    return { ready: false, issues: [`工程资源操作已完成，但本机 CLI 绑定失败：${(error as Error).message}。请核对本机资料后执行 runtime bind。`] };
  }
}

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
  const wantsJson = rawArgs.includes('--json');
  function output(value: unknown): void {
    process.stdout.write(JSON.stringify(value, null, wantsJson ? undefined : 2) + '\n');
  }

  try {
    const { values, positionals, tokens } = parseArgs({
      args: rawArgs, allowPositionals: true, strict: true, tokens: true,
      options: {
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
        json: { type: 'boolean' }, mode: { type: 'string' }, repo: { type: 'string', multiple: true },
        path: { type: 'string' }, title: { type: 'string' }, requirement: { type: 'string' },
        type: { type: 'string' }, size: { type: 'string' }, target: { type: 'string', multiple: true },
        quote: { type: 'string' }, commit: { type: 'string' }, criterion: { type: 'string', multiple: true },
        test: { type: 'string' }, command: { type: 'string' }, run: { type: 'string' }, result: { type: 'string' },
        plan: { type: 'boolean' }, apply: { type: 'string' },
      },
    });
    const seenOptions = new Set<string>();
    for (const token of tokens) {
      if (token.kind !== 'option' || ['repo', 'target', 'criterion'].includes(token.name)) continue;
      if (seenOptions.has(token.name)) usage(`选项 --${token.name} 不能重复。`);
      seenOptions.add(token.name);
    }
    if (values.help || rawArgs.length === 0) {
      if (wantsJson) output({ ok: true, help: HELP }); else process.stdout.write(HELP);
    } else if (values.version) {
      if (wantsJson) output({ ok: true, version: CLI_VERSION }); else process.stdout.write(`${CLI_VERSION}\n`);
    } else {
      const [command, second, third] = positionals;
      const flowCommand = ['start', 'resume', 'confirm', 'verify', 'check', 'accept'].includes(command ?? '');
      const allowed = flowCommand
        ? command === 'start' ? ['path', 'title', 'requirement', 'type', 'size', 'target', 'criterion']
          : command === 'resume' ? ['path']
            : command === 'confirm' ? ['path', 'quote', 'commit']
              : command === 'verify' ? ['path', 'criterion', 'test', 'command', 'run', 'result']
                : command === 'accept' ? ['path', 'quote', 'commit'] : ['path']
        : command === 'init' ? ['mode', 'repo']
          : command === 'upgrade' ? ['plan', 'apply']
            : command === 'runtime' ? ['path'] : [];
      for (const name of Object.keys(values)) {
        if (!['json', ...allowed].includes(name)) usage(`选项 --${name} 不适用于该命令。`);
      }
      let result: unknown;
      let ready = true;
      if (flowCommand) {
        const root = resolve(values.path ?? process.cwd());
        if (command === 'start') {
          if (positionals.length !== 2) usage('start 需要一个任务标识。');
          if (!values.title || !values.requirement) usage('start 需要 --title 和 --requirement；需求正文必须先写清，验收条件使用可重复的 --criterion。');
          if (!values.criterion?.length) usage('start 至少需要一个 --criterion，例如 --criterion "AC-1=命令正常退出"。');
          result = await startFlow(root, second!, { title: values.title, requirement: values.requirement,
            ...(values.type === undefined ? {} : { type: values.type }), ...(values.size === undefined ? {} : { size: values.size }),
            ...(values.target === undefined ? {} : { targets: values.target }), criteria: values.criterion });
        } else if (command === 'resume') {
          if (positionals.length > 2) usage('resume 最多接受一个任务标识。');
          if (second) result = { ...await resumeFlow(root, second), check: await inspectFlow(root, second) };
          else result = await resumeFlow(root);
        } else if (command === 'confirm') {
          if (positionals.length !== 3) usage('confirm 需要任务标识和确认节点：requirements、design 或 acceptance。');
          if (!values.quote) usage('confirm 需要 --quote "<用户原话>"；原话只作凭证，需求正文和设计正文必须先写入任务记录。');
          result = await confirmFlow(root, second!, third!, values.quote, values.commit);
        } else if (command === 'verify') {
          if (positionals.length !== 2) usage('verify 需要一个任务标识。');
          if (!values.criterion?.length || !values.test || !values.command) usage('verify 需要 --criterion、--test 和 --command；执行命令时同时给出相同的 --run。');
          result = await verifyFlow(root, second!, { criteria: values.criterion, test: values.test, command: values.command,
            ...(values.result === undefined ? {} : { result: values.result }), ...(values.run === undefined ? {} : { run: values.run }) });
          ready = (result as { result?: string }).result === 'passed';
        } else if (command === 'check') {
          if (positionals.length !== 2) usage('check 需要一个任务标识。');
          const checked = await checkFlow(root, second!); result = checked; ready = checked.ready;
        } else {
          if (positionals.length !== 2) usage('accept 需要一个任务标识。');
          if (!values.quote) usage('accept 需要 --quote "<用户原话>"。');
          result = await acceptFlow(root, second!, values.quote, values.commit);
        }
      } else if (command === 'init' || command === 'status' || command === 'recover') {
        if (positionals.length > 2) usage('位置参数过多。');
        const root = second ?? process.cwd();
        if (command === 'init') {
          const mode = values.mode ?? 'project';
          if (mode !== 'project' && mode !== 'workspace') usage('--mode 必须为 project 或 workspace。');
          if (mode === 'project' && values.repo) usage('--repo 仅适用于 workspace 模式。');
          const initialized = await initialize({ root, mode, ...(values.repo ? { repositories: values.repo } : {}) });
          const runtime = await bindAfterSetup(root);
          ready = initialized.ready && runtime.ready;
          result = { ...initialized, runtime, entry: runtime.ready ? 'node .tiller/run.cjs' : null, entryRoot: resolve(root) };
        } else if (command === 'status') {
          const status = await inspectProject(root);
          result = status; ready = status.ready;
        } else result = await recoverProject(root);
      } else if (command === 'upgrade') {
        if (positionals.length > 2 || Boolean(values.plan) === Boolean(values.apply)) usage('upgrade 需要 --plan 或 --apply <plan-id>，两者不能同时使用。');
        const root = second ?? process.cwd();
        if (values.apply) {
          const upgraded = await applyUpgrade(root, values.apply);
          ready = upgraded.ready;
          result = upgraded;
        } else {
          const plan = await planUpgrade(root);
          result = { ...plan, issues: plan.conflicts }; ready = plan.ready;
        }
      } else if (command === 'runtime') {
        if (positionals.length !== 2 || !['status', 'bind'].includes(second ?? '')) usage('runtime 需要 status 或 bind，可指定 --path <工程根目录>。');
        const root = values.path ?? process.cwd();
        const runtime = second === 'bind' ? await bindRuntime(root, fileURLToPath(import.meta.url)) : await runtimeStatus(root);
        ready = runtime.ready;
        result = { runtime, entry: runtime.ready ? 'node .tiller/run.cjs' : null, entryRoot: resolve(root) };
      } else usage(`未知命令：${command ?? ''}`);
      output({ ok: ready, ...result as object });
      if (!ready) process.exitCode = 1;
    }
  } catch (error) {
    const item = error as { code?: string; message?: string; blockingReasons?: unknown[] };
    const rawCode = item.code ?? 'OPERATION_FAILED';
    const code = rawCode.startsWith('ERR_PARSE_ARGS') ? 'INVALID_ARGUMENT' : rawCode;
    const message = item.message ?? String(error);
    if (wantsJson) output({ ok: false, error: { code, message }, ...(Array.isArray(item.blockingReasons) ? { blockingReasons: item.blockingReasons } : {}) });
    else process.stderr.write(`${code}: ${message}\n`);
    process.exitCode = code === 'INVALID_ARGUMENT' || code.startsWith('ERR_PARSE_ARGS') ? 2 : 1;
  }
}

function isDirectEntry(): boolean {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
if (isDirectEntry()) await runCli();
