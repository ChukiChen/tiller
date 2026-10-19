# tiller 使用指引

先读取工程根目录的 `AGENTS.md`、[工程索引](index.md)和[规则索引](rules/index.md)。本文件说明如何使用已接入的 tiller；项目背景和具体工作由工程资料维护。

## 调用命令

需要 Node.js 22 或以上。在工程根目录运行：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs --version
node .tiller/run.cjs status
node .tiller/run.cjs runtime status
```

规则中的 `tiller ...` 可以替换为 `node .tiller/run.cjs ...`。全局命令不存在不表示无法工作，也不能据此绕过命令手写机器记录。从其他目录调用时使用启动器的实际路径，并按帮助用目标位置参数或 `--path` 指定工程；启动器保留调用者的当前目录。

启动器优先使用本工程 `.tiller/local/cli/` 中的安装、工程 `node_modules/tiller`，再查本机登记。Git worktree 可复用同一仓库已登记工作副本中的安装；业务仓库的本机安装不会因为属于某个管理工程而自动共享。每次执行重新检查候选，透传参数和退出结果，不自动下载软件。

## 安装缺失或失效

换机器、复制工程、移动或删除 CLI 后，原本机登记可能不可用。使用已取得且核对过版本的 tiller 安装包，在工程根目录安装：

```sh
npm install --prefix .tiller/local/cli --no-save --package-lock=false --ignore-scripts --no-audit --no-fund /path/to/tiller-VERSION.tgz
node .tiller/run.cjs --version
node .tiller/run.cjs runtime status
```

将包路径和 VERSION 替换为实际值；路径含空格时加引号。也可使用已安装的 CLI 执行 `tiller runtime bind --path <工程目录>`，重新登记当前运行的 CLI，然后验证固定入口。不要直接执行来源不明的路径，不要手写本机登记文件。不能假定公共 npm 注册表的同名包就是本工程使用的 tiller。

若明确提示 `runtime.json` 格式错误或属于其他工程，先核对 `.tiller/local/runtime.json`，将它移到本机目录内一个尚不存在的备份文件，再按上面的方式安装或使用已知 CLI 重新绑定。原记录不会被自动覆盖；仅重装包不能消除这类登记冲突。共享启动器内容发生变化时应协调原文或恢复已确认的受管版本，再检查入口，不能以重新绑定掩盖资源冲突。

本机登记位于 `.tiller/local/runtime.json`，安装和登记均不随仓库共享；缺少 Node.js 时须先安装适用运行环境。初始化接入成功、命令可用与实际工作流程符合要求分别验证。

## 开始和接续工作

先明确用户目标和现有依据，再按活动需要使用 `work create`、`work add` 或 `work resume`。从产品想法开始可选 `product-requirements` 模板；有已有规格时通过引用接入。标识推荐采用创建当天的 `YYYYMMDD-主题`，参数以 `--help` 为准。

`work.md` 记录过程，需求与设计分开；总体需求与设计确认后，登记并确认实施规划，再逐任务开始、实现和验证。骨架是普通任务，前置未有效验证时阻断依赖任务；明确例外只能覆盖已列条件，不改写技术结论。登记不是批准，planning 确认有效后才能激活。详细流程见[实施规划与任务拆分](rules/core.md#功能分块与实施安排)，命令输入见下文。

## 更新

CLI 更新与工程资源升级分开。取得新 CLI 后先用它运行 `upgrade --plan`，审阅差异再 `upgrade --apply <plan-id>`；成功后重新检查固定入口。升级保护已有内容，冲突须协调，不直接覆盖。项目专属说明放在独立资料中并通过索引链接，避免直接修改受管指引或启动器。

## 测试与验证

测试定义与本次执行结果分开维护。按[验证依据](rules/quality/verification.md)识别类别适用性，在 `.tiller/verification/` 登记模块、需求、项目执行套件及长期 YAML 用例；模块沿用总体设计，跨模块场景和系统质量单独组织，具体代码遵循原技术栈。

```sh
node .tiller/run.cjs verification init
node .tiller/run.cjs verification check
node .tiller/run.cjs verification run <work-id> --suite <suite> --plan
node .tiller/run.cjs verification run <work-id> --suite <suite> --apply <digest>
node .tiller/run.cjs verification capture <work-id> --input <observation.json>
node .tiller/run.cjs verification record <work-id> --input <json>
node .tiller/run.cjs verification report <work-id>
```

替换占位值并核对实际帮助。初始化仅提供最小入口，类别保持待明确，业务用例按需求和任务设计逐步形成。执行前审阅命令、目标和显式输入，按实际授权应用计划；输入快照不覆盖全部环境。执行的 stdout/stderr 会限量保存到共享工作记录，合计上限 64 KiB，超限会终止直接子进程并记录失败；命令应输出适合共享的验证信息。执行环境保存摘要，不保存环境变量原值；命令本身是受信任程序，可能修改文件或访问网络。正常退出不自动等于逐用例通过，外部结果登记保留声明来源，不替代独立核验或用户批准。报告按登记范围说明覆盖、结果及缺口，本次判断写入 work 的 verification.md；长期用例不保存永久通过状态。

### 配置和用例示例

以下以当前工程的 initialization 模块为例。先创建实际设计、需求、测试文件和工作记录，再将示例标识与路径替换成项目值；不要为了消除检查问题创建空的需求或伪造证据。`.` 表示管理工程或当前工程，独立管理中的业务仓库使用已登记稳定标识。

`.tiller/verification/config.json` 示例：

```json
{
  "schemaVersion": 1,
  "modules": [
    {"id": "initialization", "design": {"repository": ".", "path": ".tiller/specs/modules/initialization/design.md"}}
  ],
  "requirements": [
    {"id": "INIT-01", "source": {"repository": ".", "path": ".tiller/specs/modules/initialization/requirements.md"}}
  ],
  "categories": {
    "unit": {"applicability": "pending", "reason": "待核对核心逻辑覆盖"},
    "interface": {"applicability": "pending", "reason": "待核对接口契约"},
    "integration": {"applicability": "applicable", "reason": "验证初始化与已有文件共存"},
    "scenario": {"applicability": "pending", "reason": "待明确完整流程"},
    "performance": {"applicability": "pending", "reason": "待明确规模和指标"},
    "security": {"applicability": "pending", "reason": "待明确路径和访问边界"},
    "reliability": {"applicability": "applicable", "reason": "验证原有数据保护"},
    "compatibility": {"applicability": "pending", "reason": "待明确支持环境"},
    "usability": {"applicability": "pending", "reason": "待明确用户操作要求"}
  },
  "suites": [
    {
      "id": "initialization",
      "repository": ".",
      "command": "node",
      "args": ["--test", "test/core.test.mjs"],
      "cwd": ".",
      "timeoutMs": 60000,
      "inputs": [
        {"repository": ".", "path": "test/core.test.mjs"},
        {"repository": ".", "path": "src/core.ts"}
      ]
    }
  ]
}
```

示例中的两个文件不是完整依赖清单。套件 inputs 须补齐共享文本源码及必要配置；普通文本每文件最多 4 MiB，选定输入合计最多 64 MiB。显式选择中的可重建二进制使用 `{repository, path, binary:true, provenance:{repository,path}}`，读取实际字节，允许如 dist/output.bin 的被忽略输出，provenance 必须为共享来源。不能使用 `.tiller/local`、控制记录、符号链接或硬链接。完整生成产物还须核对来源清单中的输出和全部输入摘要。源码摘要不能冒充编译产物摘要；测试沿用项目框架，类别目标、方法、环境和完成条件引用相关规格，pending 不能计为通过。

模块用例文件名使用九类之一，且每条用例的 categories 包含文件名对应类别；同一用例可带多个类别，不复制正文。cross-module 和 system 文件按场景或主题命名。

`.tiller/verification/modules/initialization/integration.yaml` 示例：

```yaml
schema_version: 1
cases:
  - id: TC-INIT-001
    title: 初始化保留已有用户文件
    modules: [initialization]
    categories: [integration, reliability]
    requirements: [INIT-01]
    given:
      - 工程内已有用户文件
    when:
      - 执行当前工程接入
    then:
      - 原文件内容保持不变
      - 接入入口可以使用
    automation:
      suite: initialization
      test_ref: TC-INIT-001
      source:
        repository: .
        path: test/core.test.mjs
```

用例标识与代码中的名称、标签或项目映射关联；仅找到文件不表示已经解析并核验该测试。人工用例可以省略 automation，仍须明确步骤及预期。`criteria` 可补充性能阈值等声明性条件，通用执行器不会自动求值。跨模块用例写入 `cross-module/<场景>.yaml` 并关联至少两个不同模块；系统质量用例写入 `system/<主题>.yaml`，同一正文不复制到多个目录。

支持的 YAML 是声明式子集：空格缩进的映射和列表、字符串、布尔值、有限整数或小数，以及简单行内列表；字符串可加引号。含冒号加空格的字符串必须加引号。不要使用 JSON 对象代替 YAML、行内映射、锚点及别名、标签、合并键、多文档、块字符串或脚本表达式；不支持语法会报错。需复杂测试数据时放入项目测试代码或数据文件，通过引用接入。

### 接入实际用例结果

人工/外部观察前先执行 verification capture，输入为 `{selection, environment}`；完整 selection 见下节。实际观察绑定对象后保存独立证据，再调用 record。已有真实套件运行时可引用该 run 的 ID。以下 results.json 的 captureId 须替换成实际返回的记录 ID：

```json
{
  "environment": "local Windows",
  "captureId": "actual-capture-id",
  "results": [
    {
      "caseId": "TC-INIT-001",
      "status": "passed",
      "evidence": {"repository": ".", "path": ".tiller/work/<work-id>/evidence.md"},
      "note": "实际逐项核对原有文件内容保持不变"
    }
  ]
}
```

这里的 passed 仅展示格式。status 可为 passed、failed、skipped、not-run；以 caseId 或 checkId 明确一个对象，不填旧版 suite 字段。环境须对应采集/执行记录。capture 必须先于观察；输入、定义或证据变化后复验，最新失败不能被较早通过替代。execution 检查只能消费真实执行事实，不能人工 record 通过。证据独立于受检输入和控制记录，说明实际方法、版本、时间与来源；登记不认证作者身份或断言充分性。

## 规划、任务与整体交付

下面的 JavaScript 只组装输入，不调用写操作、不产生确认。标识、路径、revision、attemptId 和确认引用均为形状示例；换成当前工程真实值后，将所需对象用 `JSON.stringify(value, null, 2)` 保存为输入 JSON。未知字段拒绝，不要给每个命令输入统一添加 schemaVersion。源码检出可用 parsePlanningDefinition 校验 plan 结构，实际文件、范围和批准仍由命令重新核对。

```js
// example: task-plan-inputs
const workId = 'example-work';
const scope = { repositories: ['.'], targets: [workId] };
const ref = path => ({ repository: '.', path });
const requirements = ref('.tiller/specs/requirements.md');
const design = ref('.tiller/specs/design.md');
const standards = ref('.tiller/rules/project.md');
const output = ref('docs/guide.md');
const basis = {
  requirements: { workId, requestId: 'requirements-request', decisionId: 'requirements-decision' },
  design: { workId, requestId: 'design-request', decisionId: 'design-decision' },
};
const categoryNames = ['unit', 'interface', 'integration', 'scenario', 'performance', 'security', 'reliability', 'compatibility', 'usability'];
const selection = {
  caseIds: [], requirements: ['REQ-1'], modules: [],
  categories: Object.fromEntries(categoryNames.map(name => [name, {
    applicability: name === 'usability' ? 'applicable' : 'not-applicable',
    reason: name === 'usability' ? '核对说明能否指导实际操作。' : '本示例为独立说明文档；真实项目须分别核对。',
  }])),
  reason: '本次核对操作说明。', scenarioReason: '本示例不改变跨模块行为；真实项目按范围选择场景。',
  checks: [{ id: 'guide-review', kind: 'manual', artifactIds: ['guide'], inputs: [output],
    requirements: ['REQ-1'], categories: ['usability'], reason: '检查实际操作和异常说明。' }],
};
const checkpoint = { id: 'begin-review', operation: 'start', purpose: '核对开始范围及已展示设计。', subjects: [design] };
const task = {
  id: 'write-guide', title: '完成操作说明', outcome: '读者能完成约定操作。', scope,
  modules: [], relatedWorks: [], requirementIds: ['REQ-1'], basis,
  specifications: { requirements: [requirements], design: [design], standards: [standards] },
  pendingDetails: [], dependencies: [], humanCheckpoints: [checkpoint],
  artifacts: [{ id: 'guide', type: 'document', purpose: '交付操作说明。', required: true, checks: ['guide-review'], source: output }],
  verification: selection,
};
const plan = {
  schemaVersion: 1, ownerWorkId: workId, revision: 'v-one', scope, basis,
  requirements: [{ id: 'REQ-1', source: requirements }], tasks: [task],
  delivery: { requiredTasks: [task.id],
    artifacts: [{ id: 'guide', type: 'reference', taskId: task.id, artifactId: 'guide', purpose: '交付已核对说明。', required: true, checks: ['guide-review'] }],
    verification: selection, humanCheckpoints: [], openIssues: [] },
  changeReason: '首次展示任务、需求覆盖和完成条件。',
};
const registration = { operationId: 'register-one', expectedRevision: 0, plan };
const activation = { operationId: 'activate-one', expectedRevision: 1, revision: 'v-one',
  confirmation: { workId, requestId: 'planning-request', decisionId: 'planning-decision' } };
const checkpointRef = { workId, requestId: 'begin-request', decisionId: 'begin-decision' };
const start = { operationId: 'start-guide', expectedRevision: 2, checkpointRefs: [checkpointRef] };
const verify = { operationId: 'verify-guide', expectedRevision: 3, attemptId: 'attempt-from-start',
  evidenceRefs: [{ workId, runId: 'actual-run-id', checkId: 'guide-review', environment: 'actual-observation-environment' }] };
const resume = { operationId: 'resume-guide', expectedRevision: 4, checkpointRefs: [checkpointRef] };
const selectionInput = { selection };
const observationInput = { selection, environment: 'actual-observation-environment' };
const resultsInput = { captureId: 'actual-capture-id', environment: observationInput.environment,
  results: [{ checkId: 'guide-review', status: 'not-run',
    evidence: ref('.tiller/work/example-work/evidence/guide-review.md'), note: '示例尚未观察；执行后按真实结果填写。' }] };
const deliveryReferences = { checkpointRefs: [], evidenceRefs: verify.evidenceRefs, exceptionRefs: [] };
const readyInput = { operationId: 'ready-one', expectedRevision: 4, ...deliveryReferences };
```

新工作无事件时 revision 为 0；示例数字仅说明注册、激活、任务事件各增加一次 revision。写入前读取当前 status。整体 ready 写独立回执，不增加 tasks revision。同工作 operationId 不能跨规划、任务或整体回执重用。重复相同成功输入只返回历史回执，不证明当前依据有效。

```sh
node .tiller/run.cjs work plan register example-work --input registration.json --plan
node .tiller/run.cjs work plan register example-work --input registration.json --apply <plan-id>
node .tiller/run.cjs work request-confirmation example-work --input planning-request.json
node .tiller/run.cjs work plan activate example-work --input activation.json --plan
node .tiller/run.cjs work plan activate example-work --input activation.json --apply <plan-id>
node .tiller/run.cjs work task status example-work --task write-guide
node .tiller/run.cjs work task start example-work --task write-guide --input start.json --plan
node .tiller/run.cjs work task start example-work --task write-guide --input start.json --apply <plan-id>
node .tiller/run.cjs verification capture example-work --input observation.json
node .tiller/run.cjs verification record example-work --input results.json
node .tiller/run.cjs work task verify example-work --task write-guide --input verify.json --plan
node .tiller/run.cjs work task verify example-work --task write-guide --input verify.json --apply <plan-id>
node .tiller/run.cjs work delivery-check example-work --input references.json
node .tiller/run.cjs work delivery-ready example-work --input ready.json --plan
node .tiller/run.cjs work delivery-ready example-work --input ready.json --apply <plan-id>
```

request-confirmation 后必须先展示返回的 presentation 和实际正文，取得真实决定并用 record-decision 保存来源，再激活或开始；命令列表不替代这一步。开始后实际产出文件，capture 在观察之前，record 在观察之后。本链 results.json 取 resultsInput，不能复用上一节 TC-INIT-001 的结果；captureId、runId 均替换为相应命令真实返回 ID，not-run 在实际观察后按事实填写，未通过不会放行后续验证。run/report 的 --input 使用 selectionInput。execution 检查声明已配置 suite，case 检查声明 caseId；artifactIds 把必要检查绑定到完整当前产物快照。task verify、delivery-check 不执行测试。

产物支持 document、source（files/directories）、generated（output/inputs/evidence）和 reference（taskId/artifactId）。generated evidence 是共享 JSON 来源清单：`{schemaVersion:1,output:{repository,path,sha256},inputs:[{repository,path,sha256}],command,observer,observedAt,environment}`，摘要来自实际字节，时间为实际 UTC。目录包含自身控制资料时明确拒绝，请缩小真实内容范围，不能静默过滤后声称覆盖整个目录。

required:false 必须有明确 optionalReason，可用 checks:[] 表示没有必要检查；显式声明的必要 check 仍须满足。可选项缺失可保留警告，但纳入成功快照后发生变化仍使历史结果失效。任务定义、前置和证据有效时可跨规划修订保留结果；开始依据变化须 task resume 创建新 attempt。自身输出从无到有不改变开始依据。移除任务保留 cancelled 历史，单独查询它不会得到技术就绪。

### 人工检查点与有限例外

planning 请求使用 gate planning、upstream 为实际设计请求，subjects 须包含 `planning/<revision>/definition.json`、`review.md` 和所有实际规格文件；源码 helper planningConfirmationSubjects(workId, registration) 返回完整列表。确认引用须指向真实当前决定，登记和激活不会自行批准。

checkpoint 请求的通用字段与其他确认相同，gate 为 checkpoint、upstream 为实际 planning 请求、subjects 与规划检查点一致。额外绑定如下（JavaScript 接续上例；源码检出可从 dist/gate-conditions.js 导入 helper）：

```js
// example: checkpoint-binding
// import { checkpointDefinitionDigest } from './dist/gate-conditions.js';
const checkpointBinding = { ownerWorkId: workId, taskId: task.id, checkpointId: checkpoint.id,
  operation: checkpoint.operation, definitionDigest: checkpointDefinitionDigest(checkpoint) };
```

definitionDigest 绑定 id、operation、purpose 和排序后的 subjects；任意摘要或同名检查点都不能替代当前定义。resume 重核 start 检查点，verify 核对 verify 检查点；整体检查点 operation 为 delivery-ready，省略 taskId。目的、对象或决定变化后旧引用失效。

例外先取不含 exceptionRefs 的预览：任务用 technicalBasisDigest，整体用 basisDigest。只选择 exceptionAllowed 为 true 的明确 conditionId，展示绑定和真实缺口后登记独立 gate exception 请求；upstream 为覆盖范围的设计请求，nextAction 等于 allowedAction。

```js
// example: exception-binding
// preview 是实际 task verify 预览；示例不表示已获授权。
const exceptionBinding = { ownerWorkId: workId, taskId: task.id, operation: 'verify',
  conditionIds: preview.technicalIssues.filter(issue => issue.exceptionAllowed).map(issue => issue.conditionId),
  basisDigest: preview.technicalBasisDigest, reason: '填写真实用户明确同意承担的具体缺口和理由。',
  allowedAction: 'verify', endCondition: 'basis-change-or-revocation' };
```

自动消费仅支持 allowedAction 精确等于操作、endCondition 精确为 basis-change-or-revocation。其他文本可登记展示，但返回 INVALID_EXCEPTION，不推断无限授权。真实批准引用通过 exceptionRefs 加入原输入并重新预览；技术摘要排除例外决定自身，apply 计划另绑定决定指纹。非法路径、未知结构、身份/来源无效、没有开始事实、attempt 不符或开始依据漂移不能豁免。verify 例外写 task-verification-excepted，技术仍未通过；补足完成条件后可在同一有效 attempt 正常 verify。依赖不自动继承上游例外。

### 整体回执、验收、合入和发布

delivery-check 只读核对必要任务、实际交付物、组合验证、检查点和遗留项，未满足时返回非零码。delivery-ready 保存不可变回执。scope、technicalReady、processEvidence、issues、exceptions、operationAllowed、basisDigest 分别表达范围、技术条件、过程证据及授权；明确例外可允许操作，但不自动产生技术通过或验收。历史回执标明 historical 与 currentValidity:not-evaluated。

整体验收用 gate acceptance 和 `deliveryBinding:{deliveryCheckId:'实际ready回执ID',deliveryBasisDigest:'该回执basisDigest'}`，subjects 包含实际回执，upstream 覆盖设计。普通文档验收可不带此绑定，但不能替代整体验收；技术未就绪而获有限验收时显示 accepted-with-exceptions。release 必须携带同一 deliveryBinding、同对象 acceptance 上游及新的真实发布决定，不能引用同工作内另一对象的验收。

merge 请求在 mergeBinding 内保存 deliveryBinding，并绑定 documentsVersion、各仓库 review、sourceOid、targetOid、targetBranch、dependencies、checks。技术未就绪时 merge/release 还需独立操作例外：merge 的 deliveryExceptionRefs 位于 mergeBinding，release 的在请求顶层；exceptionBinding.operation/allowedAction 分别为 merge 或 release，basisDigest 为当前整体技术摘要，并覆盖该操作要求的全部条件。ready 例外、验收不能自动授予这些权限。对象、决定或 Git 绑定变化后重核。

进行中的 commit/push/review 可在既有有效授权内执行，并呈现 deliveryReadiness，不等于可合入/发布。实际合入另受平台能力限制；当前内置适配仍拒绝不具备原子校验保证的自动合入。

### 严格记录格式与接续

工作 record.json 与 confirmations.json 为 schemaVersion 3，verification-runs 与 Git delivery.json 为版本 2，规划定义/tasks.json/delivery-checks 回执为版本 1；config.json 与 YAML 用例仍为版本 1。未知版本和字段拒绝，旧文件保留原位，不迁移、填补事件或补造批准。当前没有 work adopt / migrate-confirmations；接续旧资料须新建工作并通过 source 明确引用，再核对必要确认。work bind 仍可为当前格式设计关联真实有效需求依据。资源 upgrade 不迁移工作事实。
