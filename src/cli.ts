#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { bindRuntime, runtimeStatus } from './runtime.js';
import { initialize, inspectProject, recoverProject } from './core.js';
import { adoptManagedFiles, applyUpgrade, planUpgrade } from './upgrade.js';
import { addGlobalCase } from './cases.js';
import {
  acceptFlow, attachFlowTask, checkFlow, closeFlow, confirmFlow, inspectFlow, reopenFlow, releaseFlow, resumeFlow, reviewFlow, startFlow,
  verifyFlow,
} from './flow.js';
import { confirmPlan, startPlan, statusPlan } from './plans.js';
import { draftPullRequest } from './pr.js';

export const CLI_VERSION = '0.5.0';

const HELP = `tiller ${CLI_VERSION} — 默认工作流

用法：
  tiller init [path] [--mode project|workspace] [--platform github|gitlab|both] [--repo <repository-path> ...]
  tiller status [path]
  tiller plan start <YYYYMMDD-plan-id> --title <标题> --goal <目标> --spec <specs 引用> [--spec ...] --item "P-1=标题;size=small;deps=P-0;specs=<引用>;plan=<子规划>" [--item ...]
  tiller plan confirm <YYYYMMDD-plan-id> [--by <确认人>] [--quote "<可选原话>"] [--commit <oid>] [--path <root>]
  tiller plan status <YYYYMMDD-plan-id> [--path <root>]
  tiller plan attach <YYYYMMDD-task-id> --plan <YYYYMMDD-plan-id> --item <条目> [--path <root>]
  tiller start <YYYYMMDD-task-id> --title <标题> (--requirement <需求正文> | --requirement-file <工程相对路径>) --criterion "AC-1=<验收条件>" [--criterion ...] [--type feature] [--size small|standard] [--target <相对路径> ...] [--summary <中文摘要>] [--slug <英文描述>] [--plan <YYYYMMDD-plan-id> --item <条目>] [--skip-init-gate] [--path <root>]
  tiller resume [YYYYMMDD-task-id] [--path <root>]
  tiller confirm <YYYYMMDD-task-id> requirements|design|acceptance [--by <确认人>] [--quote "<可选原话>"] [--commit <oid>] [--path <root>]
  tiller case add <YYYYMMDD-task-id> --module <模块> --kind behavior|interface|performance|security --title <标题> --criterion AC-1 [--criterion ...] --expected "<预期结果>" [--precondition <条件> ...] [--step <步骤> ...] [--input <输入> ...] [--priority high|medium|low] [--spec <引用> ...] --source <源码路径> [--source ...] [--path <root>]
  tiller case add <YYYYMMDD-task-id> --scenario <场景名> --module <模块> [--module ...] --title <标题> --criterion AC-1 --expected "<预期结果>" [--spec <引用> ...] --source <源码路径> [--source ...]
  tiller verify <YYYYMMDD-task-id> --criterion AC-1 [--criterion ...] --test "<文件::测试名>" [--expect-fail] [--verbose] [--path <root>]
  tiller verify <YYYYMMDD-task-id> [--criterion AC-1 ...] --case CASE-NNN [--verbose] [--path <root>]
  tiller verify <YYYYMMDD-task-id> --criterion AC-1 --test "<文件::测试名>" --reported --command "<外部命令>" --result passed|failed|skipped --reason "<理由>" [--path <root>]
  tiller check <YYYYMMDD-task-id> [--allow-reported] [--path <root>]
  tiller review <YYYYMMDD-task-id> [--by <评审人>] [--finding <发现> ...] [--blocking <阻塞发现> ...] [--resolve REV-NNN ...] [--path <root>]
  tiller release <YYYYMMDD-task-id> [--path <root>]
  tiller pr <YYYYMMDD-task-id> [--summary <中文摘要>] [--slug <英文描述>] [--path <root>]
  tiller accept <YYYYMMDD-task-id> [--by <确认人>] [--quote "<可选原话>"] [--commit <oid>] [--allow-reported] [--path <root>]
  tiller close <YYYYMMDD-task-id> --reason "<原因>" [--abandon] [--path <root>]
  tiller reopen <YYYYMMDD-task-id> --reason "<原因>" [--path <root>]
  tiller recover [path]
  tiller runtime status|bind [--path <root>]
  tiller upgrade [path] --plan
  tiller upgrade [path] --apply <plan-id>
  tiller upgrade [path] --adopt <受管文件> [--adopt ...]

默认工作流：
- small：需求确认 → 实现 → 验证；standard：需求 → 设计 → 实现 → 验证。确认记录人、时间、摘要和提交，原话可选。
- 默认人工节点只有需求、设计和交付验收；规划、合入、发布按需确认，没有阶段或审计命令。
- 大功能可先写 .tiller/plans/<id>.md 并确认；start 挂到条目时默认继承粒度，依赖未验收会阻塞。
- task.md 是唯一任务记录：start 生成结构化需求，可从工程内需求文件接入；确认前校验正文，原话只作可选附注。verify 自主执行测试并从私有报告核实。
- review 记录独立评审发现；未解决阻塞项会阻断 check/accept。release 只做发布门禁，不发布包。check 汇总发布清单；已验收任务按验收提交读取代码树与测试，之后代码漂移不误报过期。
- 阶段由 task.md 事实推导；accept 须在 pr 前；合入后 close 只清本机，未验收终止用 --abandon，必要时 reopen。
- check 对过薄文档给出可定位提示：空白或占位的 standard 设计、无有效条目的 .tiller/specs/decisions.md、空壳模块设计 design.md；规格/背景未回写时列出路径与提纲。默认不单独阻断。verify 日志含显示命令、起止时间与退出码。当前分支未包含任务编号时 check 提示，分支名用“类型/任务编号[-描述]”。
- 同一 AC 或 CASE 连续两次 verify 失败且无成功核实时，verify/check 要求停止自动重试并按 FLOW-05 报告证据与可选方案；成功核实清零。
- case add 在测试之前登记测试设计（前置条件、步骤、输入、预期结果、类型、优先级、来源 AC），自动分配 CASE 编号；测试名引用 CASE 编号形成反查。check 分阶段核对 AC→用例→测试→当前验证，校验模块/场景结构并提示相关回归，同时检查范围、测试弱化、密钥和本机绝对路径。
- pr 从 task.md 和 Git 提交生成五段 PR/MR 草稿及建议分支名；提交用“类型(模块): 中文摘要”，分支用“类型/任务编号[-描述]”；check 只提示格式问题。
- 验证运行器支持 node-test、junit-maven、junit-gradle 与 pytest；pytest 从私有 JUnit XML 核实。upgrade 刷新未修改的受管文件，--adopt 保留用户当前内容并更新摘要；版本号只在正式发布时修改。
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
        path: { type: 'string' }, title: { type: 'string' }, requirement: { type: 'string' }, 'requirement-file': { type: 'string' },
        reason: { type: 'string' },
        slug: { type: 'string' }, summary: { type: 'string' }, platform: { type: 'string' },
        type: { type: 'string' }, size: { type: 'string' }, target: { type: 'string', multiple: true },
        quote: { type: 'string' }, by: { type: 'string' }, commit: { type: 'string' }, criterion: { type: 'string', multiple: true },
        test: { type: 'string' }, command: { type: 'string' }, run: { type: 'string' }, result: { type: 'string' },
        reported: { type: 'boolean' }, 'expect-fail': { type: 'boolean' }, 'allow-reported': { type: 'boolean' },
        verbose: { type: 'boolean' }, adopt: { type: 'string', multiple: true },
        plan: { type: 'string' }, item: { type: 'string', multiple: true }, goal: { type: 'string' },
        spec: { type: 'string', multiple: true }, module: { type: 'string', multiple: true },
        kind: { type: 'string' }, scenario: { type: 'string' }, source: { type: 'string', multiple: true },
        expected: { type: 'string' }, precondition: { type: 'string', multiple: true }, step: { type: 'string', multiple: true },
        input: { type: 'string', multiple: true }, priority: { type: 'string' }, case: { type: 'string' },
        finding: { type: 'string', multiple: true }, blocking: { type: 'string', multiple: true },
        resolve: { type: 'string', multiple: true }, apply: { type: 'string' }, abandon: { type: 'boolean' },
        'skip-init-gate': { type: 'boolean' },
      },
    });
    const seenOptions = new Set<string>();
    for (const token of tokens) {
      if (token.kind !== 'option' || ['repo', 'target', 'criterion', 'item', 'spec', 'module', 'source', 'precondition', 'step', 'input', 'finding', 'blocking', 'resolve', 'adopt'].includes(token.name)) continue;
      if (seenOptions.has(token.name)) usage(`选项 --${token.name} 不能重复。`);
      seenOptions.add(token.name);
    }
    if (values.help || rawArgs.length === 0) {
      if (wantsJson) output({ ok: true, help: HELP }); else process.stdout.write(HELP);
    } else if (values.version) {
      if (wantsJson) output({ ok: true, version: CLI_VERSION }); else process.stdout.write(`${CLI_VERSION}\n`);
    } else {
      const [command, second, third] = positionals;
      const flowCommand = ['start', 'resume', 'confirm', 'verify', 'check', 'accept', 'review', 'release', 'close', 'reopen'].includes(command ?? '');
      const planCommand = command === 'plan';
      const caseCommand = command === 'case';
      const prCommand = command === 'pr';
      const allowed = flowCommand
        ? command === 'start' ? ['path', 'title', 'requirement', 'requirement-file', 'type', 'size', 'target', 'criterion', 'plan', 'item', 'slug', 'summary', 'skip-init-gate']
          : command === 'resume' ? ['path']
            : command === 'confirm' ? ['path', 'quote', 'by', 'commit', 'allow-reported']
              : command === 'verify' ? ['path', 'criterion', 'test', 'case', 'command', 'run', 'result', 'reported', 'reason', 'expect-fail', 'verbose']
                : command === 'accept' ? ['path', 'quote', 'by', 'commit', 'allow-reported']
                  : command === 'review' ? ['path', 'by', 'finding', 'blocking', 'resolve']
                    : command === 'release' ? ['path']
                      : command === 'close' ? ['path', 'reason', 'abandon']
                        : command === 'reopen' ? ['path', 'reason'] : ['path', 'allow-reported']
        : planCommand ? (second === 'start' ? ['path', 'title', 'goal', 'spec', 'item']
          : second === 'confirm' ? ['path', 'quote', 'by', 'commit']
            : second === 'status' ? ['path']
              : second === 'attach' ? ['path', 'plan', 'item'] : [])
          : caseCommand ? second === 'add' ? ['path', 'module', 'kind', 'scenario', 'title', 'criterion', 'spec', 'source', 'expected', 'precondition', 'step', 'input', 'priority'] : []
            : prCommand ? ['path', 'slug', 'summary']
              : command === 'init' ? ['mode', 'repo', 'platform']
              : command === 'upgrade' ? ['plan', 'apply', 'adopt']
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
          if (!values.title || (!values.requirement === !values['requirement-file'])) {
            usage('start 需要 --title，以及 --requirement 或 --requirement-file 之一；验收条件使用可重复的 --criterion。');
          }
          if (!values.criterion?.length) usage('start 至少需要一个 --criterion，例如 --criterion "AC-1=命令正常退出"。');
          if ((values.plan === undefined) !== (values.item === undefined)) usage('start 的 --plan 和 --item 必须同时提供。');
          if (values.item && values.item.length !== 1) usage('start 的 --item 只能提供一个条目。');
          result = await startFlow(root, second!, { title: values.title,
            ...(values.requirement === undefined ? {} : { requirement: values.requirement }),
            ...(values['requirement-file'] === undefined ? {} : { requirementFile: values['requirement-file'] }),
            ...(values.type === undefined ? {} : { type: values.type }), ...(values.size === undefined ? {} : { size: values.size }),
            ...(values.target === undefined ? {} : { targets: values.target }), criteria: values.criterion,
            ...(values.slug === undefined ? {} : { slug: values.slug }),
            ...(values.summary === undefined ? {} : { summary: values.summary }),
            ...(values['skip-init-gate'] === undefined ? {} : { skipInitGate: values['skip-init-gate'] }),
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
            ...(values['allow-reported'] === undefined ? {} : { allowReported: values['allow-reported'] }),
          });
        } else if (command === 'verify') {
          if (positionals.length !== 2) usage('verify 需要一个任务标识。');
          if (!values.test && !values.case) usage('verify 需要 --test "文件::测试名" 或 --case CASE-xxx。');
          if (!values.criterion?.length && !values.case) usage('verify 未指定 --case 时至少需要一个 --criterion。');
          if (values.test && values.case) usage('--test 与 --case 只能选一个。');
          if (values.run !== undefined) usage('verify 不再接受 --run；使用 --test "文件::测试名" 或 --case CASE-xxx，由 tiller 自主执行测试。');
          if (values.reported) {
            if (!values.test) usage('--reported 需要 --test；--case 必须由 tiller 执行。');
            if (!values.command || !values.result || !values.reason) usage('--reported 需要 --command、--result 和 --reason。');
          } else if (values.command !== undefined || values.result !== undefined || values.reason !== undefined) {
            usage('外部报告需要 --reported；普通验证只需 --test 或 --case。');
          }
          result = await verifyFlow(root, second!, { criteria: values.criterion ?? [],
            ...(values.test === undefined ? {} : { test: values.test }),
            ...(values.case === undefined ? {} : { case: values.case }),
            ...(values.command === undefined ? {} : { command: values.command }),
            ...(values.result === undefined ? {} : { result: values.result }),
            ...(values.reported === undefined ? {} : { reported: values.reported }),
            ...(values.reason === undefined ? {} : { reason: values.reason }),
            ...(values['expect-fail'] === undefined ? {} : { expectFail: values['expect-fail'] }),
            ...(values.verbose === undefined ? {} : { verbose: values.verbose }) });
          ready = (result as { ready?: boolean }).ready !== false;
        } else if (command === 'check') {
          if (positionals.length !== 2) usage('check 需要一个任务标识。');
          const checked = await checkFlow(root, second!, { allowReported: values['allow-reported'] === true }); result = checked; ready = checked.ready;
        } else if (command === 'accept') {
          if (positionals.length !== 2) usage('accept 需要一个任务标识。');
          result = await acceptFlow(root, second!, {
            ...(values.quote === undefined ? {} : { quote: values.quote }),
            ...(values.by === undefined ? {} : { by: values.by }),
            ...(values.commit === undefined ? {} : { commit: values.commit }),
            ...(values['allow-reported'] === undefined ? {} : { allowReported: values['allow-reported'] }),
          });
        } else if (command === 'review') {
          if (positionals.length !== 2) usage('review 需要一个任务标识。');
          result = await reviewFlow(root, second!, {
            ...(values.by === undefined ? {} : { by: values.by }),
            ...(values.finding === undefined ? {} : { findings: values.finding }),
            ...(values.blocking === undefined ? {} : { blocking: values.blocking }),
            ...(values.resolve === undefined ? {} : { resolve: values.resolve }),
          });
          ready = (result as { ready?: boolean }).ready !== false;
        } else if (command === 'release') {
          if (positionals.length !== 2) usage('release 需要一个任务标识。');
          result = await releaseFlow(root, second!);
          ready = (result as { ready?: boolean }).ready !== false;
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
        } else if (second === 'attach') {
          if (positionals.length !== 3 || !values.plan || !values.item?.length) {
            usage('plan attach 需要任务标识、--plan <规划标识> 和 --item <条目>。');
          }
          if (values.item.length !== 1) usage('plan attach 的 --item 只能提供一个条目。');
          result = await attachFlowTask(root, third!, values.plan, values.item[0]!);
        } else usage('plan 支持 start、confirm、status 或 attach。');
      } else if (caseCommand) {
        if (second !== 'add' || positionals.length !== 3) usage('case 支持 add <task-id>。');
        if (!values.title || !values.criterion?.length || !values.module?.length || !values.expected) {
          usage('case add 需要 --module、--title、--criterion 和 --expected（预期结果）。');
        }
        if (!values.scenario && !values.kind) usage('case add 需要 --kind，或使用 --scenario 登记端到端场景。');
        if (!values.scenario && values.module.length !== 1) usage('模块用例只能指定一个 --module；场景可重复 --module 声明经过模块。');
        if (values.scenario && values.kind) usage('--scenario 与 --kind 不能同时使用。');
        const root = resolve(values.path ?? process.cwd());
        result = await addGlobalCase(root, {
          task: third!, title: values.title, criteria: values.criterion,
          requirements: values.spec ?? [], source: values.source ?? [], modules: values.module,
          preconditions: values.precondition ?? [], steps: values.step ?? [], inputs: values.input ?? [],
          expected: values.expected,
          ...(values.priority === undefined ? {} : { priority: values.priority }),
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
        const modes = [Boolean(values.plan), Boolean(values.apply), Boolean(values.adopt?.length)].filter(Boolean).length;
        if (positionals.length > 2 || modes !== 1) usage('upgrade 需要 --plan、--apply <plan-id> 或 --adopt <受管文件>，三者只能选一个。');
        if (values.plan && values.plan !== 'preview') usage('--plan 只需作为预览开关使用，不接收值。');
        const root = second ?? process.cwd();
        if (values.adopt?.length) {
          result = await adoptManagedFiles(root, values.adopt);
        } else if (values.apply) {
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
