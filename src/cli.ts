#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { bindRuntime, runtimeStatus } from './runtime.js';
import { initialize, inspectProject, recoverProject } from './core.js';
import { applyUpgrade, planUpgrade } from './upgrade.js';
import { addGlobalCase } from './cases.js';
import { acceptFlow, checkFlow, closeFlow, confirmFlow, inspectFlow, reopenFlow, resumeFlow, startFlow, verifyFlow } from './flow.js';
import { confirmPlan, startPlan, statusPlan } from './plans.js';
import { draftPullRequest } from './pr.js';

export const CLI_VERSION = '0.5.0';

const HELP = `tiller ${CLI_VERSION} — 默认工作流

用法：
  tiller init [path] [--mode project|workspace] [--platform github|gitlab|both] [--repo <repository-path> ...]
  tiller status [path]
  tiller plan start <plan-id> --title <标题> --goal <目标> --spec <specs 引用> [--spec ...] --item "P-1=标题;size=small;deps=P-0;specs=<引用>;plan=<子规划>" [--item ...]
  tiller plan confirm <plan-id> [--by <确认人>] [--quote "<可选原话>"] [--commit <oid>] [--path <root>]
  tiller plan status <plan-id> [--path <root>]
  tiller start <task-id> --title <标题> --requirement <需求正文> --criterion "AC-1=<验收条件>" [--criterion ...] [--type feature] [--size small|standard] [--target <相对路径> ...] [--summary <中文摘要>] [--slug <英文描述>] [--plan <plan-id> --item <条目>] [--path <root>]
  tiller resume [task-id] [--path <root>]
  tiller confirm <task-id> requirements|design|acceptance [--by <确认人>] [--quote "<可选原话>"] [--commit <oid>] [--path <root>]
  tiller case add <task-id> --module <模块> --kind behavior|interface|performance|security --title <标题> --test "<文件::测试名>" --criterion AC-1 [--criterion ...] [--spec <引用> ...] --source <源码路径> [--source ...] [--path <root>]
  tiller case add <task-id> --scenario <场景名> --module <模块> [--module ...] --title <标题> --test "<文件::测试名>" --criterion AC-1 [--spec <引用> ...] --source <源码路径> [--source ...]
  tiller verify <task-id> --criterion AC-1 [--criterion ...] --test <测试文件或用例引用> --command "<验证命令>" [--run "<同一命令>"] [--result passed|failed|skipped] [--path <root>]
  tiller check <task-id> [--path <root>]
  tiller pr <task-id> [--summary <中文摘要>] [--slug <英文描述>] [--path <root>]
  tiller accept <task-id> [--by <确认人>] [--quote "<可选原话>"] [--commit <oid>] [--path <root>]
  tiller close <task-id> --reason "<原因>" [--abandon] [--path <root>]
  tiller reopen <task-id> --reason "<原因>" [--path <root>]
  tiller recover [path]
  tiller runtime status|bind [--path <root>]
  tiller upgrade [path] --plan
  tiller upgrade [path] --apply <plan-id>

默认工作流：
- small：需求确认 → 实现 → 验证；standard：需求 → 设计 → 实现 → 验证。确认记录人、时间、摘要和提交，原话可选。
- 默认人工节点只有需求、设计和交付验收；规划、合入、发布按需确认，没有阶段或审计命令。
- 大功能可先写 .tiller/plans/<id>.md 并确认；start 挂到条目时默认继承粒度，依赖未验收会阻塞。
- task.md 是唯一任务记录：start 生成结构化需求，standard 另有设计与影响；确认前校验正文，原话只作可选附注。验证保存命令、结果、提交和代码树摘要。
- 阶段由 task.md 事实推导；close 收尾已验收任务，未验收终止用 --abandon，必要时 reopen。
- case add 自动分配 CASE 编号并写入来源 AC；check 会核对 AC→全局用例→测试→当前验证，校验模块/场景结构并提示相关回归，同时检查范围、测试弱化、密钥和本机绝对路径。
- pr 从 task.md 和 Git 提交生成五段 PR/MR 草稿及建议分支名；提交用“类型(模块): 中文摘要”，分支用“类型/任务编号[-描述]”；check 只提示格式问题。
- upgrade 刷新未修改的受管文件，保留并报告用户修改；版本号只在正式发布时修改。
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
  const commandIndex = rawArgs.findIndex(value => !value.startsWith('-'));
  const normalizedArgs = [...rawArgs];
  if (commandIndex >= 0 && rawArgs[commandIndex] === 'upgrade') {
    const planIndex = normalizedArgs.findIndex((value, index) => index > commandIndex && value === '--plan');
    if (planIndex >= 0 && (normalizedArgs[planIndex + 1] === undefined || normalizedArgs[planIndex + 1]!.startsWith('-'))) {
      normalizedArgs[planIndex] = '--plan=preview';
    }
  }
  function output(value: unknown): void {
    process.stdout.write(JSON.stringify(value, null, wantsJson ? undefined : 2) + '\n');
  }

  try {
    const { values, positionals, tokens } = parseArgs({
      args: normalizedArgs, allowPositionals: true, strict: true, tokens: true,
      options: {
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
        json: { type: 'boolean' }, mode: { type: 'string' }, repo: { type: 'string', multiple: true },
        path: { type: 'string' }, title: { type: 'string' }, requirement: { type: 'string' }, reason: { type: 'string' },
        slug: { type: 'string' }, summary: { type: 'string' }, platform: { type: 'string' },
        type: { type: 'string' }, size: { type: 'string' }, target: { type: 'string', multiple: true },
        quote: { type: 'string' }, by: { type: 'string' }, commit: { type: 'string' }, criterion: { type: 'string', multiple: true },
        test: { type: 'string' }, command: { type: 'string' }, run: { type: 'string' }, result: { type: 'string' },
        plan: { type: 'string' }, item: { type: 'string', multiple: true }, goal: { type: 'string' },
        spec: { type: 'string', multiple: true }, module: { type: 'string', multiple: true },
        kind: { type: 'string' }, scenario: { type: 'string' }, source: { type: 'string', multiple: true },
        apply: { type: 'string' }, abandon: { type: 'boolean' },
      },
    });
    const seenOptions = new Set<string>();
    for (const token of tokens) {
      if (token.kind !== 'option' || ['repo', 'target', 'criterion', 'item', 'spec', 'module', 'source'].includes(token.name)) continue;
      if (seenOptions.has(token.name)) usage(`选项 --${token.name} 不能重复。`);
      seenOptions.add(token.name);
    }
    if (values.help || rawArgs.length === 0) {
      if (wantsJson) output({ ok: true, help: HELP }); else process.stdout.write(HELP);
    } else if (values.version) {
      if (wantsJson) output({ ok: true, version: CLI_VERSION }); else process.stdout.write(`${CLI_VERSION}\n`);
    } else {
      const [command, second, third] = positionals;
      const flowCommand = ['start', 'resume', 'confirm', 'verify', 'check', 'accept', 'close', 'reopen'].includes(command ?? '');
      const planCommand = command === 'plan';
      const caseCommand = command === 'case';
      const prCommand = command === 'pr';
      const allowed = flowCommand
        ? command === 'start' ? ['path', 'title', 'requirement', 'type', 'size', 'target', 'criterion', 'plan', 'item', 'slug', 'summary']
          : command === 'resume' ? ['path']
            : command === 'confirm' ? ['path', 'quote', 'by', 'commit']
              : command === 'verify' ? ['path', 'criterion', 'test', 'command', 'run', 'result']
                : command === 'accept' ? ['path', 'quote', 'by', 'commit']
                  : command === 'close' ? ['path', 'reason', 'abandon']
                    : command === 'reopen' ? ['path', 'reason'] : ['path']
        : planCommand ? second === 'start' ? ['path', 'title', 'goal', 'spec', 'item']
          : second === 'confirm' ? ['path', 'quote', 'by', 'commit']
            : second === 'status' ? ['path'] : []
          : caseCommand ? second === 'add' ? ['path', 'module', 'kind', 'scenario', 'title', 'test', 'criterion', 'spec', 'source'] : []
            : prCommand ? ['path', 'slug', 'summary']
              : command === 'init' ? ['mode', 'repo', 'platform']
              : command === 'upgrade' ? ['plan', 'apply']
                : command === 'runtime' ? ['path'] : [];
      for (const name of Object.keys(values)) {
        if (!['json', ...allowed].includes(name)) usage(`选项 --${name} 不适用于该命令。`);
      }
      let result: unknown;
      let ready = true;
      let markdownOutput: string | null = null;
      if (flowCommand) {
        const root = resolve(values.path ?? process.cwd());
        if (command === 'start') {
          if (positionals.length !== 2) usage('start 需要一个任务标识。');
          if (!values.title || !values.requirement) usage('start 需要 --title 和 --requirement；需求正文必须先写清，验收条件使用可重复的 --criterion。');
          if (!values.criterion?.length) usage('start 至少需要一个 --criterion，例如 --criterion "AC-1=命令正常退出"。');
          if ((values.plan === undefined) !== (values.item === undefined)) usage('start 的 --plan 和 --item 必须同时提供。');
          if (values.item && values.item.length !== 1) usage('start 的 --item 只能提供一个条目。');
          result = await startFlow(root, second!, { title: values.title, requirement: values.requirement,
            ...(values.type === undefined ? {} : { type: values.type }), ...(values.size === undefined ? {} : { size: values.size }),
            ...(values.target === undefined ? {} : { targets: values.target }), criteria: values.criterion,
            ...(values.slug === undefined ? {} : { slug: values.slug }),
            ...(values.summary === undefined ? {} : { summary: values.summary }),
            ...(values.plan !== undefined && values.item ? { plan: values.plan, item: values.item[0]! } : {}) });
        } else if (command === 'resume') {
          if (positionals.length > 2) usage('resume 最多接受一个任务标识。');
          if (second) result = { ...await resumeFlow(root, second), check: await inspectFlow(root, second) };
          else result = await resumeFlow(root);
        } else if (command === 'confirm') {
          if (positionals.length !== 3) usage('confirm 需要任务标识和确认节点：requirements、design 或 acceptance。');
          result = await confirmFlow(root, second!, third!, {
            ...(values.quote === undefined ? {} : { quote: values.quote }),
            ...(values.by === undefined ? {} : { by: values.by }),
            ...(values.commit === undefined ? {} : { commit: values.commit }),
          });
        } else if (command === 'verify') {
          if (positionals.length !== 2) usage('verify 需要一个任务标识。');
          if (!values.criterion?.length || !values.test || !values.command) usage('verify 需要 --criterion、--test 和 --command；执行命令时同时给出相同的 --run。');
          result = await verifyFlow(root, second!, { criteria: values.criterion, test: values.test, command: values.command,
            ...(values.result === undefined ? {} : { result: values.result }), ...(values.run === undefined ? {} : { run: values.run }) });
          ready = (result as { result?: string }).result === 'passed';
        } else if (command === 'check') {
          if (positionals.length !== 2) usage('check 需要一个任务标识。');
          const checked = await checkFlow(root, second!); result = checked; ready = checked.ready;
        } else if (command === 'accept') {
          if (positionals.length !== 2) usage('accept 需要一个任务标识。');
          result = await acceptFlow(root, second!, {
            ...(values.quote === undefined ? {} : { quote: values.quote }),
            ...(values.by === undefined ? {} : { by: values.by }),
            ...(values.commit === undefined ? {} : { commit: values.commit }),
          });
        } else if (command === 'close') {
          if (positionals.length !== 2) usage('close 需要一个任务标识。');
          if (!values.reason) usage('close 需要 --reason "<关闭原因>"；未验收终止请同时使用 --abandon。');
          result = await closeFlow(root, second!, values.reason, values.abandon === true);
        } else {
          if (positionals.length !== 2) usage('reopen 需要一个任务标识。');
          if (!values.reason) usage('reopen 需要 --reason "<重开原因>"。');
          result = await reopenFlow(root, second!, values.reason);
        }
      } else if (planCommand) {
        const root = resolve(values.path ?? process.cwd());
        if (second === 'start') {
          if (positionals.length !== 3) usage('plan start 需要一个规划标识。');
          if (!values.title || !values.goal || !values.spec?.length || !values.item?.length) usage('plan start 需要 --title、--goal、--spec 和至少一个 --item。');
          result = await startPlan(root, third!, { title: values.title, goal: values.goal, requirements: values.spec, items: values.item });
        } else if (second === 'confirm') {
          if (positionals.length !== 3) usage('plan confirm 需要一个规划标识。');
          result = await confirmPlan(root, third!, {
            ...(values.quote === undefined ? {} : { quote: values.quote }),
            ...(values.by === undefined ? {} : { by: values.by }),
            ...(values.commit === undefined ? {} : { commit: values.commit }),
          });
        } else if (second === 'status') {
          if (positionals.length !== 3) usage('plan status 需要一个规划标识。');
          result = await statusPlan(root, third!);
        } else usage('plan 支持 start、confirm 或 status。');
      } else if (caseCommand) {
        if (second !== 'add' || positionals.length !== 3) usage('case 支持 add <task-id>。');
        if (!values.title || !values.test || !values.criterion?.length || !values.module?.length) {
          usage('case add 需要 --module、--title、--test 和至少一个 --criterion。');
        }
        if (!values.scenario && !values.kind) usage('case add 需要 --kind，或使用 --scenario 登记端到端场景。');
        if (!values.scenario && values.module.length !== 1) usage('模块用例只能指定一个 --module；场景可重复 --module 声明经过模块。');
        if (values.scenario && values.kind) usage('--scenario 与 --kind 不能同时使用。');
        const root = resolve(values.path ?? process.cwd());
        result = await addGlobalCase(root, {
          task: third!, title: values.title, test: values.test, criteria: values.criterion,
          requirements: values.spec ?? [], source: values.source ?? [], modules: values.module,
          ...(values.module[0] === undefined ? {} : { module: values.module[0] }),
          ...(values.kind === undefined ? {} : { kind: values.kind }),
          ...(values.scenario === undefined ? {} : { scenario: values.scenario }),
        });
      } else if (prCommand) {
        if (positionals.length !== 2) usage('pr 需要一个任务标识。');
        const draft = await draftPullRequest(resolve(values.path ?? process.cwd()), second!,
          { ...(values.slug === undefined ? {} : { slug: values.slug }),
            ...(values.summary === undefined ? {} : { summary: values.summary }) });
        result = draft;
        markdownOutput = draft.markdown;
      } else if (command === 'init' || command === 'status' || command === 'recover') {
        if (positionals.length > 2) usage('位置参数过多。');
        const root = second ?? process.cwd();
        if (command === 'init') {
          const mode = values.mode ?? 'project';
          if (mode !== 'project' && mode !== 'workspace') usage('--mode 必须为 project 或 workspace。');
          if (values.platform !== undefined && !['github', 'gitlab', 'both'].includes(values.platform)) {
            usage('--platform 必须为 github、gitlab 或 both。');
          }
          if (mode === 'project' && values.repo) usage('--repo 仅适用于 workspace 模式。');
          const initialized = await initialize({ root, mode, ...(values.repo ? { repositories: values.repo } : {}),
            ...(values.platform === undefined ? {} : { platform: values.platform as 'github' | 'gitlab' | 'both' }) });
          const runtime = await bindAfterSetup(root);
          ready = initialized.ready && runtime.ready;
          result = { ...initialized, runtime, entry: runtime.ready ? 'node .tiller/run.cjs' : null, entryRoot: resolve(root) };
        } else if (command === 'status') {
          const status = await inspectProject(root);
          result = status; ready = status.ready;
        } else result = await recoverProject(root);
      } else if (command === 'upgrade') {
        if (positionals.length > 2 || Boolean(values.plan) === Boolean(values.apply)) usage('upgrade 需要 --plan 或 --apply <plan-id>，两者不能同时使用。');
        if (values.plan && values.plan !== 'preview') usage('--plan 只需作为预览开关使用，不接收值。');
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
      if (markdownOutput !== null && !wantsJson) process.stdout.write(markdownOutput);
      else output({ ok: ready, ...result as object });
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
