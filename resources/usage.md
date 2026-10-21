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

将包路径替换为实际已取得的 0.5.0 包，VERSION 填 0.5.0；路径含空格时加引号。也可使用已安装的 CLI 执行 `tiller runtime bind --path <工程目录>`，重新登记当前运行的 CLI，然后验证固定入口。不要直接执行来源不明的路径，不要手写本机登记文件。不能假定公共 npm 注册表的同名包就是本工程使用的 tiller。

若明确提示 `runtime.json` 格式错误或属于其他工程，先核对 `.tiller/local/runtime.json`，将它移到本机目录内一个尚不存在的备份文件，再按上面的方式安装或使用已知 CLI 重新绑定。原记录不会被自动覆盖；仅重装包不能消除这类登记冲突。共享启动器内容发生变化时应协调原文或恢复已确认的受管版本，再检查入口，不能以重新绑定掩盖资源冲突。

本机登记位于 `.tiller/local/runtime.json`，安装和登记均不随仓库共享；缺少 Node.js 时须先安装适用运行环境。初始化接入成功、命令可用与实际工作流程符合要求分别验证。

## 开始和接续工作

先按交付目标选择流程，说明理由、影响、范围、已有依据、动作来源和结束条件。`work create` 必须显式选择 `--workflow` 并提供当前意图输入；模板只提供产物骨架，不决定流程。标识推荐采用创建当天的 `YYYYMMDD-主题`，接续保留原名。当前工作用 `work resume` 接续，产物按固定图通过 `work output add` 登记。

`work.md` 记录过程；按所选流程建立必要产物，不为分析或审查编造需求、设计和开发任务。功能开发及适用的变更阶段仍须有效需求、设计和 planning 确认，再激活规划并逐任务推进；骨架是普通任务。明确例外只覆盖列明条件，不改写技术事实。详细适用边界见[共同动作](rules/core.md#按目标选择流程)，开发委托见[实施规划与任务拆分](rules/core.md#功能分块与实施安排)。

## 独立分析示例

以下输入展示当前接口，所有占位值须替换为实际来源和返回值；示例本身不产生用户授权或通过证据。

### 选择流程并创建工作

先读取工程入口、规则及已有工作。以下示例假定工程已按当前契约初始化，用户确实要求一次只读问题分析，并已明确允许在所示范围保存调查报告。示例不会执行修复、实验、生产访问、发布或数据修改。实际范围不同，应重新选择流程并填写影响事实，不能为了通过检查把未知影响写成 false。

```sh
node .tiller/run.cjs workflow list --json
node .tiller/run.cjs workflow show analysis --json
node .tiller/run.cjs workflow check --json
```

内置流程为 `requirements`、`analysis`、`research`、`feature`、`bugfix`、`improvement`、`review`、`validation`、`documentation`、`migration`、`operations`。项目流程校验通过只表示候选有效，不代表批准或启用；项目流程登记使用单独的 `workflow register --input ... --plan|--apply ...`。

本例选择 `analysis`：其阶段为 `scope → evidence → hypotheses → report`，产物依次为 `scope-output`、`evidence-output`、`hypotheses-output`、`report-output`。命令保存固定流程快照；模板只影响文档骨架，不决定流程。

先准备实际请求来源 `docs/response-analysis/request-source.md` 和已有现象材料 `docs/response-analysis/symptoms.md`。来源须保留真实请求内容、范围和出处；下例 quote 必须替换成该真实文件中逐字存在的授权文字。不能将示例文本、代理自述或自动生成的“批准”写入来源冒充用户决定。

`create.json`：

```json
{
  "operationId": "create-analysis",
  "expectedRevision": 0,
  "workflow": "analysis",
  "goal": "查明已报告响应异常的原因，并说明证据和未排除的解释。",
  "reason": "本次仅调查现象并提交结论，不实施修复。",
  "scope": {
    "repositories": ["."],
    "targets": ["docs/response-analysis"]
  },
  "impact": {
    "modifiesCode": false,
    "changesBehavior": false,
    "production": false,
    "writesData": false,
    "credentials": false,
    "irreversible": false,
    "externalService": false,
    "semanticChange": false,
    "experimentSideEffects": false,
    "release": false
  },
  "basis": [
    {
      "reference": {
        "repository": ".",
        "path": "docs/response-analysis/symptoms.md"
      },
      "purpose": "已报告现象和成功标准的实际来源。"
    }
  ],
  "actionSources": [
    {
      "actions": ["read", "write-report"],
      "reference": {
        "repository": ".",
        "path": "docs/response-analysis/request-source.md"
      },
      "quote": "<替换为真实来源中的原文，不可直接运行此占位示例>",
      "scope": {
        "repositories": ["."],
        "targets": ["docs/response-analysis"]
      }
    }
  ],
  "expectedOutputs": [
    "scope-output",
    "evidence-output",
    "hypotheses-output",
    "report-output"
  ],
  "completionCriteria": [
    "结论可定位到真实证据，明确调查边界和仍未知的事项。"
  ]
}
```

上述 false 只适用于前述已核实的示例边界；不确定的字段填写 `"unknown"`。缺省事实同样保持未知，不会自动变成 false。`basis` 说明事实依据，`actionSources` 说明动作来源，二者不能互相替代。

```sh
node .tiller/run.cjs work create 20261021-response-analysis --title "响应异常分析" --workflow analysis --input create.json --json
node .tiller/run.cjs work workflow inspect 20261021-response-analysis --json
node .tiller/run.cjs work stage status 20261021-response-analysis --json
```

`--workflow` 必须与输入中的 workflow 相同。标识日期取实际创建日。输入文件相对 `--path` 指定目录；省略 `--path` 时相对当前目录。活动资料和业务仓库按该工作绑定定位。

### 启动阶段、登记产物并保存真实观察

下例完整展示 scope 阶段；随后按相同顺序完成 evidence、hypotheses、report。先读 `stage status` 返回的当前 revision，再填写 `expectedStageRevision`。这是阶段状态修订，不能用工作记录 revision 或任务状态 revision 替代。

工程须具备当前 `.tiller/verification/config.json`；按工程实际情况维护类别适用性和用例，再执行 `verification check`。以下 selection 是仅核对文档调查结果的场景示例，不可用来代替本次实际涉及的性能、安全或其他检查。已有 config 不应被示例覆盖。

为避免在多份输入中复制整段结构，以下 JavaScript 仅用于说明 JSON 组装方式；写成输入文件时，使用 `JSON.stringify(对象, null, 2)`，不能把 JavaScript 变量名当 JSON 内容。

```js
const categories = {
  unit: { applicability: 'not-applicable', reason: '本例未修改或验证可执行代码单元。' },
  interface: { applicability: 'not-applicable', reason: '本例不调用或变更接口。' },
  integration: { applicability: 'not-applicable', reason: '本例不执行组件集成。' },
  scenario: { applicability: 'applicable', reason: '按本次问题情境逐项核查文档调查结论。' },
  performance: { applicability: 'not-applicable', reason: '本例只核对已有材料，不开展性能测量或提出已验证性能结论。' },
  security: { applicability: 'not-applicable', reason: '本例无安全结论、凭据访问或安全控制变更。' },
  reliability: { applicability: 'not-applicable', reason: '本例未提出经过可靠性测试的交付声明。' },
  compatibility: { applicability: 'not-applicable', reason: '本例未改变或声明兼容性。' },
  usability: { applicability: 'not-applicable', reason: '本例未改变用户交互。' }
};
const scopeSelection = {
  caseIds: [], requirements: [], modules: [], categories,
  reason: '核查调查范围文档与实际请求和现象是否一致。',
  scenarioReason: '此步骤只验证本次范围文档，不宣称已完成后续原因分析。',
  checks: [{
    id: 'check-scope', kind: 'manual',
    artifactIds: ['scope-output'],
    inputs: [{ repository: '.', path: 'docs/response-analysis/scope.md' }],
    requirements: [], categories: ['scenario'],
    reason: '逐项检查现象、授权边界和成功标准，并记录差异。'
  }]
};
const scopeStart = {
  operationId: 'start-scope',
  expectedStageRevision: actualStageRevision,
  verification: scopeSelection,
  checkMappings: [{
    index: 0,
    text: '记录实际现象、授权的调查边界和成功标准。',
    checkIds: ['check-scope']
  }],
  confirmationRefs: []
};
```

`actualStageRevision` 取刚读取的 stage status 顶层 revision；全新阶段状态通常为 0，示例不应硬编码后续值。analysis 当前定义没有人工确认门槛，故此处 confirmationRefs 为空；这不免除实际动作来源或其他流程中的必要确认。

把 scopeStart 保存为 `scope-start.json`，预览后使用该次返回的真实 planId：

```sh
node .tiller/run.cjs verification check --json
node .tiller/run.cjs work stage start 20261021-response-analysis --stage scope --input scope-start.json --plan --json
node .tiller/run.cjs work stage start 20261021-response-analysis --stage scope --input scope-start.json --apply <实际-start-planId> --json
```

保存 start 返回的 attemptId。实际执行获准的调查并形成 `docs/response-analysis/scope.md` 后，读取工作当前 revision，登记该输出。`output-scope.json` 的形状是：

```js
const outputScope = {
  operationId: 'register-scope',
  expectedRevision: actualWorkRevision,
  outputId: 'scope-output',
  source: { repository: '.', path: 'docs/response-analysis/scope.md' }
};
```

```sh
node .tiller/run.cjs work inspect 20261021-response-analysis --json
node .tiller/run.cjs work output add 20261021-response-analysis --input output-scope.json --json
```

`work add` 与 `work output add` 同义。输入 source、content、template 三选一；登记只保存产物事实，不完成阶段，也不产生后续动作许可。

在核查产物之前，保存 `scope-capture.json`：

```js
const scopeCapture = {
  selection: scopeSelection,
  environment: 'actual-local-document-observer',
  workflow: { stageId: 'scope', actions: ['read', 'write-report'], confirmationRefs: [] }
};
```

```sh
node .tiller/run.cjs verification capture 20261021-response-analysis --input scope-capture.json --json
```

然后实际阅读 capture 所绑定的产物、核对请求和现象，并保存独立观察证据，例如 `docs/response-analysis/observations/scope.md`。该文件应记录观察对象、步骤、差异和结果，不能与受检输入、配置或控制记录共用文件。环境名称应描述实际环境，record 时必须保持一致。

观察后才创建 `scope-results.json`：

```js
const scopeResults = {
  captureId: actualCaptureId,
  environment: scopeCapture.environment,
  results: [{
    checkId: 'check-scope',
    status: actualObservedStatus,
    evidence: { repository: '.', path: 'docs/response-analysis/observations/scope.md' },
    note: actualObservationSummary
  }]
};
```

`actualCaptureId` 取 capture 返回值；status 按实际结果填写 `passed`、`failed`、`skipped` 或 `not-run`，不能为继续流程预填通过。没有观察则不能登记通过，发现问题应保留真实结果并修正后重新采集。

```sh
node .tiller/run.cjs verification record 20261021-response-analysis --input scope-results.json --json
node .tiller/run.cjs work stage status 20261021-response-analysis --stage scope --json
```

record 返回的记录 ID 是下面 evidenceRef 的 runId，不是 captureId。保存 `scope-verify.json`：

```js
const scopeEvidenceRef = {
  workId: '20261021-response-analysis',
  runId: actualRecordedRunId,
  checkId: 'check-scope',
  environment: scopeCapture.environment
};
const scopeVerify = {
  operationId: 'verify-scope',
  expectedStageRevision: latestStageRevision,
  attemptId: actualScopeStartAttemptId,
  evidenceRefs: [scopeEvidenceRef],
  confirmationRefs: []
};
```

```sh
node .tiller/run.cjs work stage verify 20261021-response-analysis --stage scope --input scope-verify.json --plan --json
node .tiller/run.cjs work stage verify 20261021-response-analysis --stage scope --input scope-verify.json --apply <实际-verify-planId> --json
```

start、verify 只核对和保存受控状态，不代替调查或测试。中断后先读 status；需要 resume 时，使用当前依据、新 operationId 和 expectedStageRevision 重新预览、应用，并使用新 attemptId，不复用历史许可。

按顺序对下列阶段重复“status → start 预览/应用 → 实际产出及 output add → capture → 实际观察 → record → verify 预览/应用”。每次更新 stageId、operationId、检查 ID、路径和实际返回的版本/记录 ID：

| 阶段 | 输出及建议文件 | stage checkMappings 的原文（index 均为 0） |
| --- | --- | --- |
| evidence | evidence-output / evidence.md | 只读取得可定位的事实，区分事实与推测。 |
| hypotheses | hypotheses-output / hypotheses.md | 对照证据验证候选原因，保留不能排除的解释。 |
| report | report-output / report.md | 报告原因、证据、不确定性及建议，不自动实施修复。 |

以上文件均位于 `docs/response-analysis/`。以实际固定流程定义为准；检查映射须保留原文和下标，不可改写为更容易通过的条件。

report 的 selection 使用 `check-report`，artifactIds 必须覆盖四项输出，inputs 列出四份实际文件。实际观察同时逐项核查 report 阶段条件及下一节的整体完成条件，独立报告证据应记录两者的核查结论。这样同一次真实观察可以供 report verify 和整体完成检查使用；只检查了 report.md 的证据不能直接充当全部输出已核查的证明。

```js
const reportSelection = {
  caseIds: [], requirements: [], modules: [], categories,
  reason: '核查分析报告及其范围、证据、假设文档的完整一致性。',
  scenarioReason: '逐项核对本次实际现象、结论、未知影响和未覆盖范围。',
  checks: [{
    id: 'check-report', kind: 'manual',
    artifactIds: ['scope-output', 'evidence-output', 'hypotheses-output', 'report-output'],
    inputs: ['scope', 'evidence', 'hypotheses', 'report'].map(name => ({
      repository: '.', path: `docs/response-analysis/${name}.md`
    })),
    requirements: [], categories: ['scenario'],
    reason: '同时逐项核查 report 阶段检查和流程整体完成条件，保存独立观察记录。'
  }]
};
// report start/checkMappings 引用 check-report；
// report capture 使用此 selection 和 stageId: 'report'；
// record 后按 scopeEvidenceRef 的相同形状保存真实 reportEvidenceRef。
```

### 独立流程的整体检查与回执

本例无需开发任务委托、规划或 tasks.json。四个阶段有效完成后，整体检查仍须绑定完成条件、全部产物和真实证据。

```js
const deliveryReferences = {
  verification: reportSelection,
  checkMappings: [{
    index: 0,
    text: '产物与实际证据一致；未知影响和未覆盖范围如实记录；交付不自动表示用户接受或操作授权。',
    checkIds: ['check-report']
  }],
  evidenceRefs: [reportEvidenceRef],
  planningEvidenceRefs: [],
  checkpointRefs: [],
  exceptionRefs: []
};
```

reportSelection 是前一步实际用于 capture/record/verify 的四产物选择；reportEvidenceRef 引用对应真实 record ID。把此对象保存为 `delivery-references.json`：

```sh
node .tiller/run.cjs work delivery-check 20261021-response-analysis --input delivery-references.json --json
node .tiller/run.cjs work stage status 20261021-response-analysis --json
```

存在阻碍时根据实际原因处理，不能把返回失败解释为成功。技术条件、操作许可、过程证据和用户验收分别判断。

从最新 stage status 返回中原样取 controlSnapshot 作为 expected，保存 `ready.json`：

```js
const ready = {
  operationId: 'ready-analysis',
  expected: actualControlSnapshot,
  ...deliveryReferences
};
// actualControlSnapshot 的结构：
// { work: {revision, sha256}, stages: {revision, sha256}, tasks: null }
// 本例没有任务状态；真实快照由命令取得，不手工编造摘要或状态。
```

```sh
node .tiller/run.cjs work delivery-ready 20261021-response-analysis --input ready.json --plan --json
node .tiller/run.cjs work delivery-ready 20261021-response-analysis --input ready.json --apply <实际-ready-planId> --json
```

回执保存当前交付事实，不自动表示用户验收、允许修复、合入或发布。内容变化后重核当前事实；原回执只证明历史对象。

如需执行配置套件，`verification run --input` 使用 `{workflow, selection?}`，workflow 包含实际 stageId、actions、confirmationRefs；`verification report --input` 使用 `{selection}`。不要把 report 的输入直接交给 run，也不能把一次程序退出成功当成所有用例通过。

开发类工作另按其适用阶段完成真实需求、设计及规划门槛；规划批准并激活后，外层阶段以 `{kind:"development-tasks", planningRevision, taskIds}` 显式委托任务。task verify 不自动完成外层阶段。不得向本例填造开发历史以满足不适用的任务链。

## 更新

当前程序与工程资源运行契约均为 0.5.0；元信息 schema 与各类机器记录另行版本化，不凭版本号较大推断兼容。正式发布前只支持当前契约：旧/未知工程资源、运行安装和机器记录明确拒绝，保留原件，不转换或补写历史。`upgrade --plan` / `--apply <plan-id>` 仅保留当前资源无变更检查，不提供历史升级或强制覆盖；预览后内容变化须重新检查。需要使用当前流程时，在独立的当前工程/工作中明确引用仍适用的正文，不能修改旧版本号伪造接续。项目说明放在独立资料中并通过索引链接。

## 测试与验证

测试定义与本次执行结果分开维护。按[验证依据](rules/quality/verification.md)识别类别适用性，在 `.tiller/verification/` 登记模块、需求、项目执行套件及长期 YAML 用例；模块沿用总体设计，跨模块场景和系统质量单独组织，具体代码遵循原技术栈。

```sh
node .tiller/run.cjs verification init
node .tiller/run.cjs verification check
node .tiller/run.cjs verification run <work-id> --suite <suite> --input <run.json> --plan
node .tiller/run.cjs verification run <work-id> --suite <suite> --input <run.json> --apply <digest>
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

人工/外部观察前先执行 verification capture，输入为 `{selection, environment, workflow}`；workflow 绑定当前 stageId、实际 actions 和 confirmationRefs，开发任务观察另含 taskId。完整阶段示例见上文，任务选择见下节。实际观察绑定对象后保存独立证据，再调用 record。已有真实套件运行时可引用该 run 的 ID。以下 results.json 的 captureId 须替换成实际返回的记录 ID：

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

本节仅适用于固定图中实际委托开发任务的阶段。先完成该流程的真实前置阶段和适用确认；独立分析、审查和验证不因此必须创建 planning 或 tasks.json。以下以已批准开发交付中的操作说明任务为例，不表示纯文档编辑一律需要开发门禁。

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
    reason: name === 'usability' ? '核对说明能否指导实际操作。' : '本任务仅核查开发交付中的说明产物；真实项目须分别核对。',
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
const workflow = { stageId: 'implementation', taskId: task.id, actions: ['read', 'test', 'write-report'],
  confirmationRefs: [basis.requirements, basis.design, activation.confirmation] };
// 本例 selection 仅用于人工 capture 和 report，不用于 verification run。
const observationInput = { selection, environment: 'actual-observation-environment', workflow };
const resultsInput = { captureId: 'actual-capture-id', environment: observationInput.environment,
  results: [{ checkId: 'guide-review', status: 'not-run',
    evidence: ref('.tiller/work/example-work/evidence/guide-review.md'), note: '示例尚未观察；执行后按真实结果填写。' }] };
// 以下 actual* 来自当前整体检查选择及真实阶段证据；不能用 task 证据代替 stage 证据。
const deliveryReferences = { verification: actualWorkflowSelection, checkMappings: actualWorkflowCheckMappings,
  evidenceRefs: actualWorkflowEvidenceRefs, planningEvidenceRefs: verify.evidenceRefs, checkpointRefs: [], exceptionRefs: [] };
const readyInput = { operationId: 'ready-one', expected: actualControlSnapshot, ...deliveryReferences };
```

任务状态无事件时 revision 为 0；示例数字仅说明注册、激活、任务事件各增加一次 tasks revision。工作记录 revision、阶段 expectedStageRevision 和 tasks revision 各自独立，写入前读取对应当前状态。整体 ready 的 expected 使用真实控制快照，不能用单个 expectedRevision 替代；ready 写独立回执，不增加 tasks revision。同工作 operationId 不能跨规划、任务或整体回执重用。重复相同成功输入只返回历史回执，不证明当前依据有效。

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

planning start/resume 在规划编写前按当前图预览、应用；形成并登记规划输出、取得有效确认并激活后，以实际证据 verify planning 阶段。随后实际 start/resume 开发阶段，delegation 使用 kind: development-tasks、当前 planningRevision 和明确 taskIds。只有当前规划下唯一有效委托的任务可以执行；多个开发阶段分别核对自己的任务与前置。上面的 task 命令依赖这些真实阶段事实，不能只按列表省略。task verify 后还须以该阶段自己的证据 verify 外层阶段；阶段完成不由任务完成自动写入。

request-confirmation 后必须先展示返回的 presentation 和实际正文，取得真实决定并用 record-decision 保存来源，再激活或开始；命令列表不替代这一步。开始后实际产出文件，capture 在观察之前，record 在观察之后。本链 results.json 取 resultsInput，不能复用上一节 TC-INIT-001 的结果；captureId、runId 均替换为相应命令真实返回 ID，not-run 在实际观察后按事实填写，未通过不会放行后续验证。本例仅用 observationInput 进行 capture、selectionInput 进行 report。执行套件须另选实际匹配的 execution/case 检查并绑定真实 workflow，不能把本例 manual selection 直接交给 run；execution 检查声明已配置 suite，case 检查声明 caseId；artifactIds 把必要检查绑定到完整当前产物快照。task verify、delivery-check 不执行测试。

产物支持 document、source（files/directories）、generated（output/inputs/evidence）和 reference（taskId/artifactId）。generated evidence 是共享 JSON 来源清单：`{schemaVersion:1,output:{repository,path,sha256},inputs:[{repository,path,sha256}],command,observer,observedAt,environment}`，摘要来自实际字节，时间为实际 UTC。目录包含自身控制资料时明确拒绝，请缩小真实内容范围，不能静默过滤后声称覆盖整个目录。

required:false 必须有明确 optionalReason，可用 checks:[] 表示没有必要检查；显式声明的必要 check 仍须满足。可选项缺失可保留警告，但纳入成功快照后发生变化仍使历史结果失效。相同任务、受测字节及当前范围/权限仍有效时可跨规划修订保留证据，当前执行仍需新规划下有效阶段委托和开始依据；撤销授权、流程代际变化或移到其他阶段不能沿用旧任务授权。任务定义、前置和证据有效时可保留结果；开始依据变化须 task resume 创建新 attempt。自身输出从无到有不改变开始依据。移除任务保留 cancelled 历史，单独查询它不会得到技术就绪。

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

delivery-check 只读核对适用阶段、全部必要输出，以及存在开发委托时的必要任务、实际交付物、组合验证、检查点和遗留项，未满足时返回非零码。delivery-ready 保存不可变回执。scope、technicalReady、processEvidence、issues、exceptions、operationAllowed、basisDigest 分别表达范围、技术条件、过程证据及授权；明确例外可允许操作，但不自动产生技术通过或验收。历史回执标明 historical 与 currentValidity:not-evaluated。

整体验收用 gate acceptance 和 `deliveryBinding:{deliveryCheckId:'实际ready回执ID',deliveryBasisDigest:'该回执basisDigest'}`，subjects 包含实际回执，upstream 按当前流程及验收语义核对；不能为无开发阶段的流程补造设计确认。普通文档验收可不带此绑定，但不能替代整体验收；技术未就绪而获有限验收时显示 accepted-with-exceptions。release 必须携带同一 deliveryBinding、同对象 acceptance 上游及新的真实发布决定，不能引用同工作内另一对象的验收。

merge 请求在 mergeBinding 内保存 deliveryBinding，并绑定 documentsVersion、各仓库 review、sourceOid、targetOid、targetBranch、dependencies、checks。技术未就绪时 merge/release 还需独立操作例外：merge 的 deliveryExceptionRefs 位于 mergeBinding，release 的在请求顶层；exceptionBinding.operation/allowedAction 分别为 merge 或 release，basisDigest 为当前整体技术摘要，并覆盖该操作要求的全部条件。ready 例外、验收不能自动授予这些权限。对象、决定或 Git 绑定变化后重核。

进行中的 commit/push/review 可在既有有效授权内执行，并呈现 deliveryReadiness，不等于可合入/发布。实际合入另受平台能力限制；当前内置适配仍拒绝不具备原子校验保证的自动合入。

### 严格记录格式与接续

工作 record.json 与 confirmations.json 为 schemaVersion 4，verification-runs 与 Git delivery.json 为版本 2，整体 delivery-checks 就绪回执为版本 2；规划定义/tasks.json、阶段状态、config.json 与 YAML 用例各自使用版本 1。工程元信息 schemaVersion 为 1、resourceVersion 为 0.5.0；这些数字表示不同契约，不能互换。未知版本和字段拒绝，旧文件保留原位，不迁移、补事件或补批准；不支持旧 work bind、work complete、work adopt 或迁移确认入口。已有正文可在新的当前工作中明确引用，仍须核对当前角色、范围和真实授权。

## 请求与记录人工确认

以下以 feature 的 requirements 阶段为例，须先完成该阶段所要求的实际内容与产物登记。摘要从 `work stage status` 返回的 `context.snapshot.digest` 和 `context.intentDigest` 取得；stageId 必须属于该工作的固定流程，不按示例硬套。复杂输入保存在工程内 JSON 文件中，使用 `--input` 读取。下例是需求确认请求，可保存为 `.tiller/work/20261015-product-outline/request.json`：

```json
{
  "requestId": "requirements-1",
  "gate": "requirements",
  "workflowBinding": {
    "workflowDigest": "<当前固定流程的真实摘要>",
    "intentDigest": "<当前工作意图的真实摘要>",
    "stageId": "requirements"
  },
  "scope": { "repositories": ["."], "targets": ["20261015-product-outline"] },
  "subjects": [{ "repository": ".", "path": ".tiller/work/20261015-product-outline/requirements.md" }],
  "upstream": [],
  "reviewSummary": "请确认本次产品目标、范围、核心行为和验收条件。",
  "openIssues": [],
  "nextAction": "形成对应的总体设计"
}
```

```sh
tiller work request-confirmation 20261015-product-outline --input .tiller/work/20261015-product-outline/request.json
tiller work check-gate 20261015-product-outline --request requirements-1
```

请求保存内容快照并返回 `presentation` 审阅文件。展示该文件及其对应正文后等待用户决定；存在关键未决项时应先解决，不为了通过而把 `openIssues` 填为空。节点包括 `requirements`、`design`、`planning`、`checkpoint`、`exception`、`acceptance`、`merge`、`release`、`scope`、`operation`。适用上游按当前固定图及门禁语义核对；开发流程中设计引用需求、planning 引用设计，checkpoint 引用 planning，exception 引用设计。报告型工作不因此补造设计批准；发布须引用同一整体交付对象的验收。`upstream` 填请求标识，任务/规划中的确认引用则包含 `workId/requestId/decisionId`。独立管理的业务文件使用稳定仓库标识，不能借管理根身份绕过共享检查。

用户实际作出决定后，保存必要的原话和展示依据，再记录决定。以下字段示意须用真实内容填写，不能直接作为批准依据：

```json
{
  "decisionId": "requirements-decision-1",
  "requestId": "requirements-1",
  "outcome": "approved",
  "conditions": [],
  "source": {
    "kind": "conversation",
    "reference": { "repository": ".", "path": ".tiller/work/20261015-product-outline/user-decision.md" },
    "quote": "这里填写用户实际作出的决定原话",
    "presentation": { "repository": ".", "path": ".tiller/work/20261015-product-outline/reviews/request-requirements-1/presentation.md" }
  },
  "sourceReview": {
    "reviewer": "实际核对者",
    "rationale": "说明如何核对真实用户输入与本次展示内容及范围",
    "reviewedAt": "2026-10-15T00:00:00.000Z"
  }
}
```

```sh
tiller work record-decision 20261015-product-outline --input .tiller/work/20261015-product-outline/decision.json
tiller work check-gate 20261015-product-outline --request requirements-1
```

时间同样填写实际 UTC 时间。支持批准、拒绝、有条件决定和撤销：`approved`、`rejected`、`conditional`、`revoked`。有条件决定保留条件并等待核对；不能自动把条件字符串视为已满足。缺少实际来源复核时可以保存待核对记录，但节点不会通过。源文件、展示内容、产物或上游发生变化后重新检查，保留原请求与决定，不覆盖历史。

文档验收另建 acceptance 请求，使用 documentBinding 绑定实际文档和独立证据，并展示对应正文。整体交付使用[整体回执、验收、合入和发布](#整体回执验收合入和发布)说明的 deliveryBinding；二者不能替代。当前不提供旧 work complete 入口，登记输出和阶段 verify 也不自动代表验收。接受草稿交付不等于确认需求内容，需求批准不代替交付验收。

scope 请求把 scopeBinding 绑定到归属工作、具体变更种类和预览的 changeDigest；普通只读请求来源不伪装成 scope 批准。operation 请求使用 operationBinding 绑定阶段、动作、实际仓库/目标/环境/版本、恢复依据及结束条件，不能替代独立 merge/release 确认。详情以当前命令和审阅对象为准。

确认记录标明 `reported-review` 和来源未独立认证，`automaticTransition` 始终为 `false`。CLI 能检查记录、内容与引用，并拒绝自身入口中缺少前置条件的操作；它不能证明记录者是人，也不能阻止 AI 绕过 CLI 直接写代码。跨工具接续仍需核对真实用户来源。

## 隔离开发与评审交付

代码交付使用 `work prepare`、`commit`、`push`、`review`、`merge`、`reconcile`、`cleanup` 和 `delivery-status`。写操作先生成计划，再携带相同输入应用计划；计划过期或范围、授权发生变化时拒绝执行。需求与设计须先有对应有效确认，不能用创建环境替代确认。

单仓库的活动目录是 `.tiller/local/worktrees/<work-id>/`，资料和代码随本仓库分支维护。独立管理在同一工作目录下分别使用 `management/` 与 `repositories/<repository-id>/`，共同记录只维护一份，各业务仓库分别提交和评审；没有 Git 的管理根继续保存共同资料并以内容摘要标识版本。独立管理只涉及一个业务仓库时也不切换模式。

例如，在已确认设计且存在 `main` 基线的工程中保存准备输入：

```json
{
  "schemaVersion": 1,
  "designRequest": "design-1",
  "repositories": [
    {
      "id": ".",
      "base": "main",
      "branch": "codex/20261015-student-service",
      "target": "main",
      "remote": "origin",
      "transfers": []
    }
  ]
}
```

`base` 和 `target` 必须实际存在并符合本次范围。未提交的必要资料逐文件加入 `transfers`，条目为 `{"path":"相对路径","operation":"add|modify|delete"}`，重命名用删除及新增表达；不自动复制全部未跟踪文件。尚无基线提交时须先明确基线，不自动提交。独立管理的 Git 管理仓库使用 `id: "."`，业务仓库使用初始化登记的名字，分别列出自己的基线与分支。

```sh
tiller work prepare 20261015-student-service --input .tiller/local/prepare.json --plan
tiller work prepare 20261015-student-service --input .tiller/local/prepare.json --apply <plan-id>
tiller work delivery-status 20261015-student-service
```

从主目录或活动 checkout 接续时，命令按工作绑定定位共同记录。`--input` 相对 `--path`，未指定时相对当前目录；不要把本机绑定或凭据提交到仓库。状态返回活动位置、仓库状态和当前资料摘要，不代表用户已验收。

提交输入包含精确文件清单和授权来源，例如：

```json
{
  "schemaVersion": 1,
  "repository": ".",
  "files": ["src/student.ts"],
  "message": "Keep student identifiers unique\n\nTested: student service checks",
  "authorization": {
    "actions": ["commit"],
    "repository": ".",
    "branch": "codex/20261015-student-service",
    "target": "main",
    "source": {
      "path": ".tiller/work/20261015-student-service/git-authorization.md",
      "quote": "用户实际授权的原话"
    },
    "sourceReview": {
      "reviewer": "实际复核者",
      "rationale": "原话与当前仓库、分支和动作范围的对应依据",
      "reviewedAt": "2026-10-15T00:00:00.000Z"
    }
  }
}
```

该例仅说明输入格式，不能作为授权。来源需由执行者根据真实决定记录；CLI 只检查记录和内容，不认证人类身份。推送另需 `remote`、完整 `oid` 及匹配远端的授权；不默认强推。各动作共用 `--input --plan` / `--input --apply <plan-id>` 调用方式。

评审输入包含 `operation`（create/update/attach）、`remote`、`provider`、当前 `documentsVersion`；创建时还需 `title`、`body`，更新或接入时需 `reviewId`。`documentsVersion` 使用 delivery-status 返回的 `documents.version`。平台配置示例为 `{"kind":"github","apiUrl":"https://api.github.com","project":"owner/repository","tokenEnv":"GITHUB_TOKEN"}`；GitLab 使用对应 API 地址及项目路径。令牌从指定环境变量读取，不写入共享资料或输入 JSON。

合入请求使用 `gate: "merge"`，引用有效设计并提供 `mergeBinding`，逐仓库绑定评审对象、源和目标 OID、目标分支、依赖、检查证据及资料版本。`merge` 与验收、发布分别判断；平台创建 MR 或测试通过不表示合入获准。内置 GitHub/GitLab 适配当前不提供源与目标双重原子校验，因此自动合入明确拒绝；按平台保护及实际人工确认完成后，通过 `reconcile` 核对事实，不能把查询成功冒充获授权合入。

结果未知时保留操作标识，使用 reconcile 先核对；不要重新创建评审或重放推送。清理须先归档共享资料、核对未保存成果并分别授权移除副本和删除分支；本地清理不默认删除远端对象。

## 扩展、关联与显式转换

workflow list/show/check 查看当前内置和项目定义；项目扩展使用 project.<name> 标识，在 .tiller/workflows/ 保存声明式 JSON，不能嵌入脚本。通过校验不等于启用；登记预览展示政策差异，扩大动作、减少确认或改变完成语义须绑定真实 scope 批准，不能以类型名称取得权限。当前工作使用创建时固定快照，目录更新不会静默改变它。

组合请求按实际独立目标建立关联工作，例如分析完成后再登记获授权的修复工作；不会自动创建或执行后续工作。当前阶段内已有授权的排错、测试与修复继续原工作，不重复建立完整流程。

```sh
node .tiller/run.cjs work workflow inspect <work-id> --json
node .tiller/run.cjs work workflow links <work-id> --input links.json --plan --json
node .tiller/run.cjs work workflow links <work-id> --input links.json --apply <实际-planId> --json
node .tiller/run.cjs work workflow dependencies <work-id> --stage <consumer-stage-id> --json
node .tiller/run.cjs work workflow change <work-id> --input change.json --plan --json
node .tiller/run.cjs work workflow change <work-id> --input change.json --apply <实际-planId> --json
```

links 输入包含 operationId、真实 expected 控制快照及完整 links 列表。每项明确 id、consumerStageId 和 producer 的 workId/stageId/outputId，绑定实际生产阶段及产物，不手填已完成事实。生产结果变化使相关消费者依据失效；其他阶段不因此被任意重置，循环依赖明确拒绝。

change 输入包含 operationId、真实 expected、next、outputMappings、evidenceMappings、confirmationRefs。next 使用新建意图的字段但不含 operationId/expectedRevision；产物映射逐项 from/to，证据映射明确 reference/sourceStageId/targetStageId/checkIndex，不复用时显式填空列表。先审阅新旧目标、图、权限、产物及证据影响；改变目标、范围或政策须核对精确 changeDigest 的真实批准。应用保留旧代际和转换回执，旧阶段/任务事实不自动成为新代际开始事实，关联需按当前目标重新登记。显式转换只用于当前契约工作，不是旧机器记录迁移，也不能把分析改名开发后直接修改代码。
