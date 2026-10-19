#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { inspectTaskStatus, planTaskOperation, applyTaskOperation } from './tasks.js';
import { inspectWorkDelivery, planWorkDeliveryReady, applyWorkDeliveryReady } from './overall-delivery.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindRuntime, runtimeStatus } from './runtime.js';
import { initialize, inspectProject, recoverProject } from './core.js';
import { addWork, bindWork, checkWork, completeWork, createWork, resumeWork, templateTypes, validateWorkId } from './work.js';
import { inspectWork } from './work-history.js';
import { checkGate, checkMergeGate, recordDecision, requestConfirmation, inspectDeliveryAcceptance } from './confirmations.js';
import { applyDeliveryPreparation, deliveryStatus, planDeliveryPreparation } from './delivery-environment.js';
import { resolveWorkRoot, withDeliveryLocation } from './delivery-location.js';
import { applyDeliveryAction, deliveryDocumentsVersion, planDeliveryAction } from './delivery-actions.js';
import { applyUpgrade, planUpgrade } from './upgrade.js';
import { readTextIfExists } from './files.js';
import { inspectVerification, scaffoldVerification } from './verification-cases.js';
import { applyVerificationRun, captureVerificationObservation, planVerificationRun, recordVerificationEvidence, reportVerification } from './verification-runs.js';
import { applyPlanningActivation, applyPlanningRegistration, planPlanningActivation, planPlanningRegistration } from './planning.js';

const HELP = `tiller 0.4.0 — 工程使用入口与命令定位\n\n用法：
  tiller init [path] [--mode project|workspace] [--repo <repository-path> ...]
  tiller status [path]
  tiller recover [path]
  tiller runtime status|bind [--path <root>]
  tiller verification init|check [--path <root>]
  tiller verification run <work-id> --suite <id> [--input <selection.json>] --plan|--apply <plan-id> [--path <root>]
  tiller verification capture <work-id> --input <observation.json> [--path <root>]
  tiller verification record <work-id> --input <relative.json> [--path <root>]
  tiller verification report <work-id> [--input <selection.json>] [--path <root>]
  tiller upgrade [path] --plan
  tiller upgrade [path] --apply <plan-id>
  tiller work create <id> --title <title> [--type <template>] [--path <root>]
  tiller work create <id> --title <title> --input <relative.json> [--path <root>]
  tiller work add <id> --type <template> [--requirements-request <request-id>] [--path <root>]
  tiller work add <id> --input <relative.json> [--path <root>]
  tiller work bind <id> --artifact design --requirements-work <work-id> --requirements-request <request-id> [--path <root>]
  tiller work inspect <id> [--path <root>]
  tiller work inspect --all [--path <root>]
  tiller work resume <id> [--path <root>]
  tiller work check <id> [--path <root>]
  tiller work plan register <id> --input <registration.json> --plan|--apply <plan-id> [--path <root>]
  tiller work plan activate <id> --input <activation.json> [--revision <revision>] [--request <request-id>] --plan|--apply <plan-id> [--path <root>]
  tiller work task status <id> [--task <task-id>] [--path <root>]
  tiller work task start|verify|resume <id> --task <task-id> --input <operation.json> --plan|--apply <plan-id> [--path <root>]
  tiller work delivery-check <id> [--input <references.json>] [--path <root>]
  tiller work delivery-ready <id> --input <operation.json> --plan|--apply <plan-id> [--path <root>]
  tiller work request-confirmation <id> --input <relative.json> [--path <root>]
  tiller work record-decision <id> --input <relative.json> [--path <root>]
  tiller work check-gate <id> --request <request-id> [--input <current-merge-binding.json>] [--path <root>]
  tiller work prepare <id> --input <relative.json> --plan|--apply <plan-id> [--path <root>]
  tiller work commit|push|review|merge|reconcile|cleanup <id> --input <relative.json> --plan|--apply <plan-id> [--path <root>]
  tiller work delivery-status <id> [--path <root>]
  tiller work complete <id> [--artifact requirements|design] --evidence <relative.md> --acceptance <request-id> [--path <root>]

创建设计模板还需 --requirements-work <work-id> --requirements-request <request-id>。
同一工作 add 设计时 requirements-work 默认当前工作；输入方式与 --type/需求依据参数互斥。
work.md 是过程入口，requirements.md/design.md 按需生成；record.json 由命令维护。
--input 可提供 type、scope；省略 source 生成文档，提供 source 引用现有规格。
inspect 只读；旧记录不支持推进，请用 create 新建工作并明确引用所需资料。
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
verification check 仅检查声明与关联；run 执行明确配置的程序，不是沙箱，套件退出成功不自动判定用例通过。
verification record 保存已核对的人工或外部结果；report 检查证据适用性，不替代验收或认证来源。
run/report 的 --input 格式为 {selection}；capture 在观察前绑定 {selection, environment}，record 需引用该 captureId 或实际执行记录 ID。
规划输入须含 operationId、expectedRevision 及 plan 或激活对象；activate 的 --revision/--request 如提供须与输入一致。登记不是规划批准或激活。
任务写操作须含 operationId、expectedRevision；verify 必须引用当前 attemptId。开始不执行代码，验证不执行测试；重复成功回执只证明历史操作。
delivery-check 只读重算当前对象，必要引用通过 --input 提供；delivery-ready 保存回执但不自动验收。技术就绪、明确例外与人工验收分别判断。
当前工作/确认/验证运行/交付记录版本分别为 3/3/2/2；旧记录保留但拒绝推进，不提供自动转换或继承批准。
`;

function usage(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' });
}

async function readInput(root: string, path: string): Promise<unknown> {
  const content = await readTextIfExists(resolve(root), path);
  if (content === null) usage('输入文件不存在。');
  try { return JSON.parse(content); } catch { usage('输入文件不是有效 JSON。'); }
}

async function readSelection(root: string, path: string): Promise<unknown> {
  const input = await readInput(root, path);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 1 || !Object.hasOwn(input, 'selection')) usage('验证选择输入必须仅包含 selection 字段。');
  return (input as { selection: unknown }).selection;
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
      suite: { type: 'string' }, revision: { type: 'string' }, task: { type: 'string' },
    },
  });
  if (values.help || rawArgs.length === 0) {
    if (wantsJson) output({ ok: true, help: HELP }); else process.stdout.write(HELP);
  } else if (values.version) {
    if (wantsJson) output({ ok: true, version: '0.4.0' }); else process.stdout.write('0.4.0\n');
  } else {
    const [command, second, third, fourth] = positionals;
    const planning = command === 'work' && second === 'plan';
    const taskOperation = command === 'work' && second === 'task';
    const id = planning || taskOperation ? fourth : third;
    const allowed = command === 'init' ? ['mode', 'repo']
      : command === 'upgrade' ? ['plan', 'apply']
      : command === 'runtime' ? ['path']
      : command === 'verification' ? second === 'run' ? ['path', 'suite', 'plan', 'apply', 'input']
        : ['record', 'capture', 'report'].includes(second ?? '') ? ['path', 'input'] : ['path']
      : command === 'work' ? second === 'create' || second === 'add' ? ['path', ...(second === 'create' ? ['title'] : []), 'type', 'input', 'requirements-work', 'requirements-request']
        : second === 'plan' ? ['path', 'input', 'plan', 'apply', ...(third === 'activate' ? ['revision', 'request'] : [])]
        : second === 'task' ? ['path', 'task', ...(third === 'status' ? [] : ['input', 'plan', 'apply'])]
        : second === 'delivery-check' ? ['path', 'input']
        : second === 'delivery-ready' ? ['path', 'input', 'plan', 'apply']
        : second === 'bind' ? ['path', 'artifact', 'requirements-work', 'requirements-request']
          : second === 'inspect' ? ['path', 'all']
            : ['prepare', 'commit', 'push', 'review', 'merge', 'reconcile', 'cleanup'].includes(second ?? '') ? ['path', 'input', 'plan', 'apply']
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
    } else if (command === 'verification') {
      const requestedRoot = values.path ?? process.cwd();
      if (second === 'init' || second === 'check') {
        if (positionals.length !== 2) usage('verification init/check 不接受位置参数，请使用 --path。');
        const checked = second === 'init' ? await scaffoldVerification(requestedRoot) : await inspectVerification(requestedRoot);
        // Snapshot file contents are internal evidence, not terminal output.
        const { files: _files, ...view } = checked as typeof checked & { files?: unknown };
        result = view;
        if ('config' in checked && checked.config) {
          result = { ...view, coverage: {
            requirements: checked.config.requirements.map(requirement => ({
              id: requirement.id, cases: checked.cases.filter(item => item.requirements.includes(requirement.id)).map(item => item.id),
            })),
            categories: Object.entries(checked.config.categories).map(([category, definition]) => ({
              category, ...definition, cases: checked.cases.filter(item => item.categories.some(value => value === category)).map(item => item.id),
            })),
            limitation: '仅汇总已登记需求与用例的关联；空关联为待补缺口，结构有效不代表语义覆盖或执行通过。',
          } };
        }
        ready = checked.ready;
      } else {
        if (!id || positionals.length !== 3 || !['run', 'record', 'capture', 'report'].includes(second ?? '')) usage('verification 需要有效操作及工作标识。');
        validateWorkId(id);
        await withDeliveryLocation(requestedRoot, id, async () => {
          const root = await resolveWorkRoot(requestedRoot, id);
          if (second === 'run') {
            if (!values.suite || Boolean(values.plan) === Boolean(values.apply)) usage('verification run 需要 --suite 及互斥的 --plan 或 --apply。');
            const selection = values.input !== undefined ? await readSelection(requestedRoot, values.input) : undefined;
            result = values.apply
              ? await applyVerificationRun(root, id, values.suite, values.apply, selection)
              : await planVerificationRun(root, id, values.suite, selection);
          } else if (second === 'record' || second === 'capture') {
            if (!values.input) usage(`verification ${second} 需要 --input。`);
            const input = await readInput(requestedRoot, values.input);
            result = second === 'capture'
              ? await captureVerificationObservation(root, id, input)
              : await recordVerificationEvidence(root, id, input);
          } else result = await reportVerification(root, id, values.input !== undefined ? await readSelection(requestedRoot, values.input) : undefined);
          if (result && typeof result === 'object' && 'ready' in result) ready = result.ready === true;
        });
      }
    } else if (command === 'work') {
      const inspectAll = second === 'inspect' && values.all;
      if (planning) {
        if (!['register', 'activate'].includes(third ?? '') || !id || positionals.length !== 4) usage('work plan 需要 register 或 activate 及一个工作标识。');
        if (!values.input || Boolean(values.plan) === Boolean(values.apply)) usage('work plan 需要 --input 及互斥的 --plan 或 --apply。');
      } else if (taskOperation) {
        if (!['status', 'start', 'verify', 'resume'].includes(third ?? '') || !id || positionals.length !== 4) usage('work task 需要 status/start/verify/resume 及一个工作标识。');
        if (third !== 'status' && (!values.task || !values.input || Boolean(values.plan) === Boolean(values.apply))) usage('任务写操作需要 --task、--input 及互斥的 --plan 或 --apply。');
      } else if (inspectAll ? positionals.length !== 2 : !id || positionals.length !== 3) usage('work 命令需要一个工作标识；inspect --all 不接受工作标识。');
      if (id) validateWorkId(id);
      const requestedRoot = values.path ?? process.cwd();
      const runWork = async () => {
      const root = id ? await resolveWorkRoot(requestedRoot, id) : requestedRoot;
      if (second === 'delivery-check' || second === 'delivery-ready') {
        if (second === 'delivery-check') {
          const checked = await inspectWorkDelivery(root, id!, values.input ? await readInput(requestedRoot, values.input) : {});
          result = { ...checked, acceptance: await inspectDeliveryAcceptance(root, id!, checked.basisDigest) };
          ready = checked.operationAllowed;
        } else {
          if (!values.input || Boolean(values.plan) === Boolean(values.apply)) usage('delivery-ready 需要 --input 及互斥的 --plan 或 --apply。');
          const input = await readInput(requestedRoot, values.input);
          result = values.apply ? await applyWorkDeliveryReady(root, id!, input, values.apply) : await planWorkDeliveryReady(root, id!, input);
          ready = (result as { operationAllowed: boolean }).operationAllowed;
        }
      } else if (taskOperation) {
        if (third === 'status') {
          result = await inspectTaskStatus(root, id!, values.task);
        } else {
          const input = await readInput(requestedRoot, values.input!);
          const operation = third as 'start' | 'verify' | 'resume';
          result = values.apply ? await applyTaskOperation(root, id!, values.task!, operation, input, values.apply)
            : await planTaskOperation(root, id!, values.task!, operation, input);
        }
        ready = Boolean(result && typeof result === 'object' && ('operationAllowed' in result ? result.operationAllowed === true : 'ready' in result && result.ready === true));
        if (!ready && result && typeof result === 'object') {
          const status = result as { blockingReasons?: { message: string }[]; tasks?: { taskId: string; technicalReady: boolean; nextAction: string }[] };
          const issues = status.blockingReasons?.map(issue => issue.message) ?? [];
          if (!issues.length) issues.push(...(status.tasks ?? []).filter(task => !task.technicalReady).map(task => `${task.taskId}：${task.nextAction}`));
          result = { ...result, issues };
        }
      } else if (planning) {
        const input = await readInput(requestedRoot, values.input!);
        if (third === 'activate') {
          const activation = input as { revision?: unknown; confirmation?: { requestId?: unknown } } | null;
          if (values.revision !== undefined && activation?.revision !== values.revision) usage('--revision 与激活输入不一致。');
          if (values.request !== undefined && activation?.confirmation?.requestId !== values.request) usage('--request 与激活输入不一致。');
          result = values.apply
            ? await applyPlanningActivation(root, id!, input, values.apply)
            : await planPlanningActivation(root, id!, input);
        } else result = values.apply
          ? await applyPlanningRegistration(root, id!, input, values.apply)
          : await planPlanningRegistration(root, id!, input);
        ready = Boolean(result && typeof result === 'object' && 'operationAllowed' in result && result.operationAllowed === true);
      } else if (second === 'create' || second === 'add') {
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
  const item = error as { code?: string; message?: string; blockingReasons?: unknown[] };
  const code = item.code ?? 'OPERATION_FAILED';
  const message = item.message ?? String(error);
  if (wantsJson) output({ ok: false, error: { code, message }, ...(Array.isArray(item.blockingReasons) ? { blockingReasons: item.blockingReasons } : {}) });
  else process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = code === 'INVALID_ARGUMENT' || code.startsWith('ERR_PARSE_ARGS') ? 2 : 1;
}
