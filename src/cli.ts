#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindRuntime, runtimeStatus } from './runtime.js';
import { initialize, inspectProject, recoverProject } from './core.js';
import { addWork, bindWork, checkWork, completeWork, createWork, resumeWork, templateTypes, validateWorkId } from './work.js';
import { applyWorkAdoption, inspectWork, planWorkAdoption } from './work-history.js';
import { applyConfirmationMigration, checkGate, checkMergeGate, planConfirmationMigration, recordDecision, requestConfirmation } from './confirmations.js';
import { applyDeliveryPreparation, deliveryStatus, planDeliveryPreparation } from './delivery-environment.js';
import { resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { applyDeliveryAction, deliveryDocumentsVersion, planDeliveryAction } from './delivery-actions.js';
import { applyUpgrade, planUpgrade } from './upgrade.js';
import { readTextIfExists } from './files.js';

const HELP = `tiller 0.3.5 — 工程使用入口与命令定位\n\n用法：
  tiller init [path] [--mode project|workspace] [--repo <repository-path> ...]
  tiller status [path]
  tiller recover [path]
  tiller runtime status|bind [--path <root>]
  tiller upgrade [path] --plan
  tiller upgrade [path] --apply <plan-id>
  tiller work create <id> --title <title> [--type <template>] [--path <root>]
  tiller work create <id> --title <title> --input <relative.json> [--path <root>]
  tiller work add <id> --type <template> [--requirements-request <request-id>] [--path <root>]
  tiller work add <id> --input <relative.json> [--path <root>]
  tiller work bind <id> --artifact design --requirements-work <work-id> --requirements-request <request-id> [--path <root>]
  tiller work inspect <id> [--path <root>]
  tiller work inspect --all [--path <root>]
  tiller work adopt <id> --input <relative.json> --plan [--path <root>]
  tiller work adopt <id> --input <relative.json> --apply <plan-id> [--path <root>]
  tiller work resume <id> [--path <root>]
  tiller work check <id> [--path <root>]
  tiller work request-confirmation <id> --input <relative.json> [--path <root>]
  tiller work record-decision <id> --input <relative.json> [--path <root>]
  tiller work check-gate <id> --request <request-id> [--input <current-merge-binding.json>] [--path <root>]
  tiller work migrate-confirmations <id> --plan|--apply <plan-id> [--path <root>]
  tiller work prepare <id> --input <relative.json> --plan|--apply <plan-id> [--path <root>]
  tiller work commit|push|review|merge|reconcile|cleanup <id> --input <relative.json> --plan|--apply <plan-id> [--path <root>]
  tiller work delivery-status <id> [--path <root>]
  tiller work complete <id> [--artifact requirements|design] --evidence <relative.md> --acceptance <request-id> [--path <root>]

创建设计模板还需 --requirements-work <work-id> --requirements-request <request-id>。
同一工作 add 设计时 requirements-work 默认当前工作；输入方式与 --type/需求依据参数互斥。
work.md 是过程入口，requirements.md/design.md 按需生成；record.json 由命令维护。
--input 可提供 type、scope；省略 source 生成文档，提供 source 引用现有规格。
inspect 只读；adopt 明确映射后预览再应用，不自动拆分文档或批准历史材料。
新工作推荐 YYYYMMDD-主题，如 20261015-student-service；日期取创建日，接续不改名。
id 按输入原样使用，不自动补日期；已有无日期标识仍兼容。

模板：${templateTypes.join(', ')}
所有命令支持 --json；--help / --version 显示帮助或版本。
workspace 推荐 --repo repositories/<标识>；登记标识与路径分开，兼容已有直接子目录，不移动或克隆。
status 检查文件接入，实际宿主读取需另行验证；recover 不覆盖后续修改。
确认输入格式及示例见 README.md；input 使用工程相对路径，不执行其中的命令。
work complete 需人工验收与来源复核记录；来源未独立认证，不自动发布或阻止宿主直接写入。
交付写操作先计划再应用；设计批准不代替提交、推送或评审授权，合入另须对应人工确认。
输入文件相对 --path（未指定时相对当前目录）；活动资料和业务仓库按工作绑定定位。
`;

function usage(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' });
}

async function readInput(root: string, path: string): Promise<unknown> {
  const content = await readTextIfExists(resolve(root), path);
  if (content === null) usage('输入文件不存在。');
  try { return JSON.parse(content); } catch { usage('输入文件不是有效 JSON。'); }
}

async function bindAfterSetup(root: string) {
  try { return await bindRuntime(root, fileURLToPath(import.meta.url)); }
  catch (error) {
    return { ready: false, issues: [`工程资源操作已完成，但本机 CLI 绑定失败：${(error as Error).message}。请核对本机资料后执行 runtime bind。`] };
  }
}

const rawArgs = process.argv.slice(2);
const wantsJson = rawArgs.includes('--json');
function output(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, wantsJson ? undefined : 2) + '\n');
}

try {
  const { values, positionals } = parseArgs({
    args: rawArgs, allowPositionals: true, strict: true,
    options: {
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      json: { type: 'boolean' }, mode: { type: 'string' }, repo: { type: 'string', multiple: true },
      path: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, evidence: { type: 'string' },
      input: { type: 'string' }, request: { type: 'string' }, acceptance: { type: 'string' },
      'requirements-work': { type: 'string' }, 'requirements-request': { type: 'string' },
      plan: { type: 'boolean' }, apply: { type: 'string' },
      all: { type: 'boolean' }, artifact: { type: 'string' },
    },
  });
  if (values.help || rawArgs.length === 0) {
    if (wantsJson) output({ ok: true, help: HELP }); else process.stdout.write(HELP);
  } else if (values.version) {
    if (wantsJson) output({ ok: true, version: '0.3.5' }); else process.stdout.write('0.3.5\n');
  } else {
    const [command, second, id] = positionals;
    const allowed = command === 'init' ? ['mode', 'repo']
      : command === 'upgrade' ? ['plan', 'apply']
      : command === 'runtime' ? ['path']
      : command === 'work' ? second === 'create' || second === 'add' ? ['path', ...(second === 'create' ? ['title'] : []), 'type', 'input', 'requirements-work', 'requirements-request']
        : second === 'bind' ? ['path', 'artifact', 'requirements-work', 'requirements-request']
          : second === 'inspect' ? ['path', 'all']
            : ['adopt', 'prepare', 'commit', 'push', 'review', 'merge', 'reconcile', 'cleanup'].includes(second ?? '') ? ['path', 'input', 'plan', 'apply']
              : second === 'migrate-confirmations' ? ['path', 'plan', 'apply']
        : second === 'complete' ? ['path', 'evidence', 'acceptance', 'artifact']
          : second === 'request-confirmation' || second === 'record-decision' ? ['path', 'input']
            : second === 'check-gate' ? ['path', 'request', 'input'] : ['path'] : [];
    for (const name of Object.keys(values)) {
      if (!['json', ...allowed].includes(name)) usage(`选项 --${name} 不适用于该命令。`);
    }
    let result: unknown;
    let ready = true;
    if (command === 'init' || command === 'status' || command === 'recover') {
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
        result = status;
        ready = status.ready;
      } else result = await recoverProject(root);
    } else if (command === 'upgrade') {
      if (positionals.length > 2 || Boolean(values.plan) === Boolean(values.apply)) usage('upgrade 需要 --plan 或 --apply <plan-id>，两者不能同时使用。');
      const root = second ?? process.cwd();
      if (values.apply) {
        const upgraded = await applyUpgrade(root, values.apply);
        const runtime = await bindAfterSetup(root);
        ready = upgraded.ready && runtime.ready;
        result = { ...upgraded, runtime, entry: runtime.ready ? 'node .tiller/run.cjs' : null, entryRoot: resolve(root) };
      }
      else {
        const plan = await planUpgrade(root);
        result = { ...plan, issues: plan.conflicts };
        ready = plan.ready;
      }
    } else if (command === 'runtime') {
      if (positionals.length !== 2 || !['status', 'bind'].includes(second ?? '')) usage('runtime 需要 status 或 bind，可指定 --path <工程根目录>。');
      const root = values.path ?? process.cwd();
      const runtime = second === 'bind' ? await bindRuntime(root, fileURLToPath(import.meta.url)) : await runtimeStatus(root);
      ready = runtime.ready;
      result = { runtime, entry: runtime.ready ? 'node .tiller/run.cjs' : null, entryRoot: resolve(root) };
    } else if (command === 'work') {
      const inspectAll = second === 'inspect' && values.all;
      if (inspectAll ? positionals.length !== 2 : !id || positionals.length !== 3) usage('work 命令需要一个工作标识；inspect --all 不接受工作标识。');
      if (id) validateWorkId(id);
      const requestedRoot = values.path ?? process.cwd();
      const runWork = async () => {
      const root = id ? await resolveWorkRoot(requestedRoot, id) : requestedRoot;
      if (second === 'create' || second === 'add') {
        if (values.input && (values.type || values['requirements-work'] || values['requirements-request'])) usage('--input 与 --type/需求依据参数不能同时使用。');
        if (values['requirements-work'] && !values['requirements-request']) usage('需求工作须同时提供需求请求标识。');
        if (second === 'create' && values['requirements-request'] && !values['requirements-work']) usage('直接创建设计须明确需求工作与请求。');
        const basis = values['requirements-request']
          ? { workId: values['requirements-work'] ?? id!, requestId: values['requirements-request'] } : undefined;
        if (second === 'create') {
          if (!values.title) usage('创建工作需要 --title。');
          result = await createWork(root, id!, values.title, values.input ? await readInput(requestedRoot, values.input) : values.type, basis);
        } else {
          if (!values.input && !values.type) usage('补充产物需要 --type 或 --input。');
          result = await addWork(root, id!, values.input ? await readInput(requestedRoot, values.input) : values.type!, basis);
        }
      } else if (second === 'bind') {
        if (values.artifact !== 'design' || !values['requirements-work'] || !values['requirements-request']) usage('bind 需要 --artifact design 和明确的需求工作、请求。');
        result = await bindWork(root, id!, values.artifact, { workId: values['requirements-work'], requestId: values['requirements-request'] });
      } else if (second === 'inspect') {
        const inspected = await inspectWork(root, inspectAll ? undefined : id);
        result = inspected;
        ready = inspected.ready;
      } else if (second === 'adopt') {
        if (!values.input || Boolean(values.plan) === Boolean(values.apply)) usage('adopt 需要 --input 以及互斥的 --plan 或 --apply <plan-id>。');
        const input = await readInput(requestedRoot, values.input);
        if (values.apply) result = await applyWorkAdoption(root, id!, input, values.apply, values.input);
        else {
          const plan = await planWorkAdoption(root, id!, input, values.input);
          result = { ...plan, issues: plan.conflicts };
          ready = plan.ready;
        }
      } else if (second === 'resume') result = await resumeWork(root, id!);
      else if (second === 'check') {
        const check = await checkWork(root, id!);
        result = check;
        ready = check.ready;
      } else if (second === 'complete') {
        if (!values.evidence) usage('完成工作需要 --evidence。');
        result = await completeWork(root, id!, values.evidence, values.acceptance, values.artifact);
      } else if (second === 'request-confirmation' || second === 'record-decision') {
        if (!values.input) usage('需要 --input <工程相对 JSON 文件>。');
        const input = await readInput(requestedRoot, values.input);
        result = second === 'request-confirmation'
          ? await requestConfirmation(root, id!, input) : await recordDecision(root, id!, input);
      } else if (second === 'check-gate') {
        if (!values.request) usage('检查节点需要 --request。');
        const check = values.input
          ? await checkMergeGate(root, id!, values.request, await readInput(requestedRoot, values.input))
          : await checkGate(root, id!, values.request);
        result = check;
        ready = check.confirmed;
      } else if (second === 'migrate-confirmations') {
        if (Boolean(values.plan) === Boolean(values.apply)) usage('确认格式迁移需要互斥的 --plan 或 --apply。');
        result = values.apply ? await applyConfirmationMigration(root, id!, values.apply) : await planConfirmationMigration(root, id!);
      } else if (second === 'delivery-status') {
        result = { ...await deliveryStatus(requestedRoot, id!), documents: await deliveryDocumentsVersion(requestedRoot, id!) };
      } else if (second === 'prepare' || second === 'commit' || second === 'push' || second === 'review' || second === 'merge' || second === 'reconcile' || second === 'cleanup') {
        if (!values.input || Boolean(values.plan) === Boolean(values.apply)) usage('交付操作需要 --input 以及互斥的 --plan 或 --apply <plan-id>。');
        const input = await readInput(requestedRoot, values.input);
        result = second === 'prepare'
          ? values.apply ? await applyDeliveryPreparation(requestedRoot, id!, input, values.apply) : await planDeliveryPreparation(requestedRoot, id!, input)
          : values.apply ? await applyDeliveryAction(requestedRoot, id!, second, input, values.apply) : await planDeliveryAction(requestedRoot, id!, second, input);
        if (result && typeof result === 'object' && 'ready' in result) ready = result.ready === true;
      } else usage(`未知 work 操作：${second ?? ''}`);
      };
      if (id) await withDeliveryLocation(requestedRoot, id, runWork); else await runWork();
    } else usage(`未知命令：${command ?? ''}`);
    output({ ok: ready, ...result as object });
    if (!ready) process.exitCode = 1;
  }
} catch (error) {
  const item = error as { code?: string; message?: string };
  const code = item.code ?? 'OPERATION_FAILED';
  const message = item.message ?? String(error);
  if (wantsJson) output({ ok: false, error: { code, message } });
  else process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = code === 'INVALID_ARGUMENT' || code.startsWith('ERR_PARSE_ARGS') ? 2 : 1;
}
