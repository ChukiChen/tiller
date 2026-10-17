# tiller

tiller 是一套 AI 软件工程方法论与工具集，帮助开发者与 AI 一起明确需求、推进开发、验证交付，并持续维护软件。它的目标是让从需求到运维的工作有清楚的依据、可接续的记录和可检查的结果。

tiller 面向使用 AI 编程工具的开发者，适用于个人开发和多人协作，项目可以采用不同的编程语言和框架。tiller 自身也使用这套方法开展开发，通过实际使用发现问题并改进。

## 为什么需要 tiller

AI 能够快速生成代码，但软件开发还需要解决三个问题：

- **目标是否清楚**：想法需要逐步明确为需求、范围和验收条件，未决问题不能被当作已确认要求。
- **工作能否延续**：背景、决定和进度需要持续保存，让中断后的继续或人员交接有据可查。
- **交付是否可信**：结果需要对应需求和实际验证，已完成、未满足与未验证的内容应清楚区分。

## 如何开展工作

开发者提出目标和使用场景，与 AI 逐步形成需求和设计。默认先确认具体需求，再形成设计；设计确认后，AI 在相应范围内自主编码、测试和修复。交付由用户验收，发布另行确认。不同任务可精简文档和复用有效确认，但 AI 不能因为任务简单就跳过确认。文档可以独立交付，工作也可以中断后继续。

tiller 用工程文件保存这些依据：总体与模块规格持续维护，单次工作记录保存本次变化和过程。规则说明如何推进和检查，模板帮助组织产物，CLI 执行接入、记录和检查等确定性操作。

这套方法面向从想法形成总体需求与设计、增加功能、修复缺陷、接手已有项目，以及根据使用反馈持续改进等场景。工程既可以单独管理，也可以在独立管理工程中协调多个仓库。

## 当前进展

当前已实现工程接入、通用规则与资料索引、六类文档模板、同一工作逐步补充需求与设计、已有规格引用及历史资料显式接入，以及确认请求、来源复核记录、内容和上游失效检查。0.3.0 新增单仓库与独立管理的隔离开发、授权提交与推送、MR/PR 适配、合入确认及恢复清理；自动合入的能力限制见下文。文档交付记录须关联人工验收；0.1.0、0.2.0、0.2.1、0.2.2、0.3.0、0.3.1、0.3.2、0.3.3 工程可显式升级到 0.3.4。功能分块、骨架优先和逐块验证由规则指引，计划由人与 AI 维护。

0.3.4 补齐已有项目接手和项目开发规范的流程：已有项目先调查现状与验证基线，复用或补足总体规格及规范，再进入增量开发；新项目在总体设计阶段明确项目规范，骨架阶段落实必要检查。局部任务明确范围并保留必要确认。实际调查、规范编写和项目检查由执行者完成，CLI 不自动逆向业务或运行质量检查。完整开发调度、身份认证和宿主直接写入拦截尚未实现。

## 本地运行与安装

需要 Node.js 22 或以上。管理已有 Git 仓库时还需要本机 Git；Git 工程中的共享资料检查同样使用 Git。

```sh
npm ci
npm run check
node dist/cli.js --help
npm pack
npm install -g ./tiller-0.3.4.tgz
```

当前包尚未发布到 npm 注册表。上面的安装来自本地打包结果，不依赖注册表中同名软件。`npm run test:package` 会执行打包、隔离安装、命令入口和中文路径验证。

## 接入工程

```sh
tiller init .
tiller status .
```

初始化自动提供 `.tiller/usage.md` 使用指引和 `.tiller/run.cjs` 固定入口，`AGENTS.md` 与资料索引会引导读取。0.3.2 开始，在工程根目录可直接调用：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs runtime status
node .tiller/run.cjs status
```

启动器使用本工程安装或本机登记，并在已验证的 Git worktree 中复用同仓库的可用安装。CLI 初始化和升级应用后登记当前实际 CLI；更换安装后可用已知 CLI 执行 `runtime bind --path <工程目录>`。安装路径只保存在 `.tiller/local/runtime.json`；指引与启动器随仓库共享，换机器后按指引恢复安装，不隐式联网下载。旧工程须使用新 CLI 显式升级才能取得固定入口。

独立管理工程中的业务仓库须已存在，推荐集中放在 `repositories/` 下：

```text
management-project/
  .tiller/
  repositories/
    service-a/.git/
    service-b/.git/
```

```sh
tiller init ./management-project --mode workspace --repo repositories/service-a --repo repositories/service-b
```

命令接入通用 `AGENTS.md` 区段、规则、资料索引及版本信息，保留既有入口、规格和项目规则；不会克隆、移动或修改业务仓库。缺少实际内容的资料目录按需创建。重复接入须使用同一模式与仓库范围。

0.3.1 将仓库标识与存放路径分开：上述工程登记 `service-a`、`service-b`，其 `repositoryPaths` 分别指向 `repositories/service-a`、`repositories/service-b`。工作范围、文档引用与交付输入继续使用标识 `service-a`，不要填整个目录路径。管理仓库忽略 `/repositories/`，业务仓库各自独立提交。

简写 `--repo service-a` 支持约定分组目录，只有旧直接子目录存在时兼容该位置；两处同时存在时须明确选择 `repositories/service-a` 或 `./service-a`。旧工程通过 `upgrade --plan` / `--apply` 升级时保留原路径，不自动移动仓库或改写历史引用。不支持任意多层路径或越界定位。

通用入口的维护来源是 `resources/entry.md`；tiller 自身和新工程均安装这份内容。目标工程已有 `AGENTS.md` 时保留自定义正文，只追加或显式升级 tiller 标记区段。详细资料维护规则通过入口链接到 `.tiller/rules/`，不另外维护一份通用正文。

索引的固定导航区段、入口中的 tiller 区段以及通用规则有内容依据；区段外的项目资料与索引链接可正常维护。修改受管内容或遇到不支持的版本时，CLI 保留现状并报告冲突，不自动升级。项目专属规则放在 `.tiller/rules/project.md` 等独立文件中。

写入中断后执行 `tiller recover <path>`，命令先核对全部文件，再恢复尚未发生后续编辑的事务。存在冲突时保留文件和本机恢复记录；本机记录不替代共享工作进展。

上述已支持的旧版工程保持只读兼容，重复 `init` 不会升级。使用目标版本的 CLI 先预览资源差异，处理冲突后，用返回的计划标识执行：

```sh
tiller upgrade . --plan
tiller upgrade . --apply <plan-id>
```

计划绑定预览时的实际内容，内容变化后必须重新预览。用户修改过的受管资源保留并报告冲突，区段外内容、自定义规则、历史工作和业务源码不会被升级覆盖。旧的完成记录不转换为人工批准。

## 文档工作

新工作目录推荐 `YYYYMMDD-主题`，日期取创建日，例如 `20261015-student-service`。主题使用简短的小写英文和连字符；同日多个工作用不同主题或后缀区分。接续不更新日期，已有无日期目录继续兼容。CLI 按传入的完整标识创建，不自动补日期或重命名。

```sh
tiller work create 20261015-product-outline --title "产品总体需求" --type product-requirements
tiller work resume 20261015-product-outline
tiller work check 20261015-product-outline
```

先编写草稿、更新 `work.md` 并保存实际评审依据，再展示给用户。支持总体、模块和变更三级的需求及设计，共六类模板；准确类型见 `tiller --help`。可用 `--path <root>` 指定工程，各命令支持 `--json`。创建设计模板还需 `--requirements-work <id> --requirements-request <request-id>` 指向有效需求确认；需求变化后该设计工作会提示复核。

工作目录内 `work.md` 是过程入口，`requirements.md`、`design.md` 按需生成，`record.json` 由命令维护。`README.md` 可作辅助说明，不能替代这些文件；简单工作可以合并计划、进度和检查摘要，需求与设计仍分别维护。每项工作管理一个主需求和一个主设计，涉及多个模块时通过主文档引用模块规格。

需求确认后，在原工作补充设计，无需再次 create：

```sh
tiller work add 20261015-product-outline --type product-design --requirements-request requirements-1
```

已有需求或设计可通过 `create --input` 或 `add --input` 登记引用，保留源文件。输入示例：

```json
{
  "type": "product-requirements",
  "scope": { "repositories": ["."], "targets": ["20261015-product-outline"] },
  "source": { "repository": ".", "path": ".tiller/specs/requirements.md" }
}
```

省略 `source` 则按模板生成文档，可用此方式指定非默认范围；`--input` 与 `--type` 及命令行需求依据参数互斥。设计输入还需 `requirementsBasis: {workId, requestId}`。同一工作补充产物不能改变既定范围，也不能把同一混合文件登记为需求与设计。确认必须覆盖相应需求对象、当前内容及工作范围；范围标签匹配不替代业务语义复核。

草稿形成长期规格时仍需协调单一来源，没有自动提升或移动正文的命令。新会话从工程入口读取规则和记录，用 `resume` 核对全部已登记产物、缺口和确认状态。

`check` 的 `ready` 表示文档结构与相关记录检查结果，不表示用户批准。`resume` 同时呈现确认节点与失效原因；旧版完成标记带有 `legacy-document-completion` 和 `unknown-legacy`，不作为已验收依据。

## 检查与接入已有工作

```sh
tiller work inspect --all
tiller work inspect 20261015-product-outline
```

检查不要求先有机器登记；会区分缺少工作入口、未登记、旧格式待迁移和已登记文件丢失。额外 README 可以保留，尚未登记或要求的未来设计不会被当作缺失。检查只读，不自动重命名或推断历史批准。

手写资料或旧格式记录通过明确映射接入。以下示例将已有过程入口及需求登记为当前工作，文件须实际存在：

```json
{
  "title": "产品总体需求",
  "level": "product",
  "scope": { "repositories": ["."], "targets": ["20261015-product-outline"] },
  "entry": { "repository": ".", "path": ".tiller/work/20261015-product-outline/work.md" },
  "artifacts": {
    "requirements": {
      "type": "product-requirements",
      "source": { "repository": ".", "path": ".tiller/work/20261015-product-outline/requirements.md" }
    }
  }
}
```

将映射保存为工程内 JSON 后执行：

```sh
tiller work adopt 20261015-product-outline --input adoption.json --plan
tiller work adopt 20261015-product-outline --input adoption.json --apply <plan-id>
```

计划绑定输入及相关文件，变化后需重新预览。原文、确认与快照保留；旧 `record.json` 另存为工作目录下 `history/record-v1.json`，旧完成记录不会变为新批准。若同一旧文档混合了需求和设计，先整理独立产物再映射，命令不会自行拆文。资源 upgrade 不批量迁移历史工作。

接入的历史设计缺少当前有效需求依据时，先取得真实需求确认，再显式关联：

```sh
tiller work bind 20261015-product-outline --artifact design --requirements-work 20261015-product-outline --requirements-request requirements-1
```

关联保留历史，不改正文或倒推批准；采用该设计进入实现仍需对应设计确认。

## 请求与记录人工确认

复杂输入保存在工程内 JSON 文件中，使用 `--input` 读取。下例是需求确认请求，可保存为 `.tiller/work/20261015-product-outline/request.json`：

```json
{
  "requestId": "requirements-1",
  "gate": "requirements",
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

请求保存内容快照并返回 `presentation` 审阅文件。展示该文件及其对应正文后等待用户决定；存在关键未决项时应先解决，不为了通过而把 `openIssues` 填为空。节点包括 `requirements`、`design`、`acceptance`、`release`；设计需引用同一工作中覆盖其范围的需求确认，发布需引用对应验收。`upstream` 填这些请求标识。独立管理工程的业务文件使用已登记仓库名及仓库内相对路径，不能借管理根身份绕过该仓库的共享检查。

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

交付时另建 `acceptance` 请求，其审阅对象必须包含实际文档和评审依据。用户验收及来源复核完成后才能执行：

```sh
tiller work complete 20261015-product-outline --artifact requirements --evidence .tiller/work/20261015-product-outline/review.md --acceptance acceptance-1
```

多产物工作必须用 `--artifact requirements|design` 明确完成对象；单文档交付不表示整项开发完成。接受草稿交付不等于确认需求内容；需求批准也不能代替交付验收。确认记录标明 `reported-review` 和来源未独立认证，`automaticTransition` 始终为 `false`。CLI 能检查记录、内容与引用，并拒绝自身入口中缺少前置条件的操作；它不能证明记录者是人，也不能阻止 AI 绕过 CLI 直接写代码。跨工具接续仍需核对真实用户来源。

## 隔离开发与评审交付

0.3.0 增加 `work prepare`、`commit`、`push`、`review`、`merge`、`reconcile`、`cleanup` 和 `delivery-status`。写操作先生成计划，再携带相同输入应用计划；计划过期或范围、授权发生变化时拒绝执行。需求与设计须先有对应有效确认，不能用创建环境替代确认。

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

旧确认格式的迁移与工程规则升级分开：

```sh
tiller work migrate-confirmations 20261015-student-service --plan
tiller work migrate-confirmations 20261015-student-service --apply <plan-id>
```

迁移保留 `history/confirmations-v1.json` 原件和原有请求、决定，不把历史验收转为合入批准。

## 实现与验证范围

源码在 `src/`，通用规则及模板在 `resources/`，测试在 `test/`。没有第三方运行时库，不调用模型、不自动发布。当前实测平台为 Windows；macOS、Linux 尚未实测。工程升级仅支持已知 0.1.0、0.2.0、0.2.1、0.2.2、0.3.0、0.3.1、0.3.2、0.3.3 资源到 0.3.4，尚未实现任意历史版本迁移、远程仓库获取、模式切换或完整开发任务调度。

## 工程文档

工程文档位于 `.tiller/specs/`：

- [总体需求](.tiller/specs/requirements.md)
- [总体设计](.tiller/specs/design.md)
- [决策记录](.tiller/specs/decisions.md)
- [工程初始化需求](.tiller/specs/modules/initialization/requirements.md)
- [工程初始化设计](.tiller/specs/modules/initialization/design.md)
- [工作推进需求](.tiller/specs/modules/workflow/requirements.md)
- [工作推进设计](.tiller/specs/modules/workflow/design.md)
- [开发规范需求](.tiller/specs/modules/standards/requirements.md)
- [开发规范设计](.tiller/specs/modules/standards/design.md)
- [首个交付工作及验证](.tiller/work/initial-delivery/work.md)
