# tiller

tiller 是一套面向 AI 开发的标准工作流程与 CLI。它用较少的人工节点、可重复的检查和可追溯的 Git 记录，帮助开发者明确目标、控制范围、验证交付，并在中断后继续工作。

## 默认工作流

先明确交付目标、范围、任务大小和已有授权，再选择流程：

- 小改动：需求确认 → 实现 → 验证。
- 标准或大功能：需求确认 → 设计确认 → 实现 → 验证。
- 默认人工节点只有需求、设计（standard 任务）和交付验收；规划、合入、发布按需确认。

默认入口：

```sh
tiller start <task-id> --title <标题> --requirement <需求正文> \
  --criterion "AC-1=<验收条件>" --size small --target src --target test
tiller resume [task-id]
tiller confirm <task-id> requirements [--by "<确认人>"]
tiller verify <task-id> --criterion AC-1 --test "test/example.test.mjs::用例名" \
  --command "npm test" --run "npm test"
tiller check <task-id>
tiller accept <task-id> [--by "<验收人>"]
tiller close <task-id> --reason "交付完成"
```

单次任务以 `task.md` 与 Git 追溯。`start` 在需求中生成目标、范围和编号 AC；standard 任务同时生成方案、取舍、影响与风险。确认前校验必填段，自动保存确认部分、确认人、时间、提交和正文摘要；需求与设计独立失效。原话只是可选凭证，不能替代正文。

验证保存 AC、用例编号、测试引用、命令、结果、提交和代码树摘要。单个任务只保留一份 `task.md`；完成后把长期有效结论同步到 `.tiller/specs/`，超大设计先用 plan 拆成多个任务。不保存全文快照、原始日志、自举工程或安装包。

任务阶段由记录事实推导：已开始 → 需求已确认 → 设计已确认（small 可跳过）→ 已验证 → 已验收 → 已关闭/已放弃。确认失效或验证过期时，`resume` 显示回退后的真实阶段和原因。`close` 只收尾已验收任务；未验收终止使用 `close --abandon`；两者都可通过 `reopen --reason` 显式恢复，之后才能继续确认、验证或验收。

## 提交与 PR/MR

提交主题使用 `类型(模块): 中文摘要`，类型限 `feat`、`fix`、`docs`、`refactor`、`test`、`chore`；模块取 `.tiller/specs/modules/` 名称，可省略括号部分。PR/MR 标题沿用该格式并在末尾加 `[任务编号]`；主模块按任务范围声明顺序取首个，无法推导时省略括号。说明固定为关联任务、变更内容、验收条件、验证结果、影响与风险五段，关联任务使用纯文本路径。

分支名为 `类型/任务编号`，可加 `-简短描述`，只使用小写字母、数字、连字符和一个斜杠。`tiller pr <task-id>` 从 `task.md` 与 Git 生成标题、五段说明和建议分支，验证结果列出每条 AC 的全部记录；`--json` 返回结构化草稿。描述依次取 `pr --slug`、`start --slug` 写入的任务元数据、当前分支中的匹配描述。它不调用 GitHub/GitLab、不联网，提交内容和结论仍需人工复核。

`init` 默认安装 `.github/pull_request_template.md`；`init --platform gitlab` 安装 `.gitlab/merge_request_templates/Default.md`，`both` 同时安装。已有模板不覆盖，`upgrade` 只补齐当前平台缺失的模板。

## 规划与全局用例

大功能可先建立 `.tiller/plans/<id>.md`：

```sh
tiller plan start batch --title "第一批" --goal "完成接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-;specs=.tiller/specs/requirements.md#7-初始化与受管升级"
tiller plan confirm batch [--by "<确认人>"]
tiller plan status batch
tiller start <task-id> --plan batch --item P-1 --title "接入" \
  --requirement "完成最小接入" --criterion "AC-1=接入可用"
```

条目依赖未验收时阻塞开工；规划正文或条目变化后确认失效。规划不是默认人工节点，小改动可以不建。

跨任务回归事实按模块维护在 `.tiller/cases/modules/<模块>/{behavior,interface,performance,security}.json`，跨模块端到端路径放在 `.tiller/cases/scenarios/`。模块名与 `.tiller/specs/modules/` 一致。每条用例保存稳定编号、需求/模块引用、源码路径、具名 `test_ref` 和来源 AC。

需求确认后先为每条 AC 新增或修改全局用例，再写测试、实现和验证：

```sh
tiller case add <task-id> --module workflow --kind behavior --title "流程行为" \
  --test "test/example.test.mjs::用例名" --criterion AC-1 --source src/flow.ts
```

`case add` 自动分配下一个 `CASE-NNN`，模块不存在时提示先建规格，缺测试文件时返回骨架。`verify` 自动记录命中的用例；`check` 阻塞缺失、错配、过期或未回指当前 AC 的映射，并汇总模块数量、场景和回归提示。

## 安装与接入

需要 Node.js 22 或以上。管理已有 Git 仓库时还需要本机 Git。

```sh
npm ci
npm run check
node dist/cli.js --help
npm pack
npm install -g ./tiller-0.5.0.tgz
```

当前包尚未发布到 npm 注册表；上面的安装来自本地打包结果。`npm run test:package` 会执行打包、隔离安装、命令入口和中文路径验证。

```sh
tiller init .
tiller status .
node .tiller/run.cjs --help
```

初始化生成最小骨架：总体需求/设计/决定、`modules/README.md`、项目背景、全局用例目录、规划目录、入口规则和使用指引。可用 `--platform github|gitlab|both` 选择合并请求模板，缺省 GitHub。已有文件不覆盖；重复执行只补缺失项。`AGENTS.md` 使用固定区段接入，区段外正文保留。

独立管理工程可登记已有业务仓库：

```sh
tiller init ./management-project --mode workspace \
  --repo repositories/service-a --repo repositories/service-b
```

命令不会克隆、移动或修改业务仓库。仓库标识与存放路径分开，工作范围和资料引用使用稳定标识。

## 目录与资料

```text
src/          TypeScript CLI
resources/    随工程安装的入口、规则、使用指引和启动器
test/         规则、契约、集成和端到端测试
.tiller/      specs、context、cases、plans、task 与历史 work
```

项目背景和长期决定分别维护在 `.tiller/context/` 与 `.tiller/specs/`。目录、关键模块职责、构建/启动/测试入口、主要接口或数据流、外部依赖变化时更新背景；普通实现细节不重复记录。

## 验证

```sh
npm run build
npm run lint
npm run typecheck
npm test
npm run test:package
```

`npm test` 一次构建后运行全部测试，文件级并发为 2。`test/suites.json` 要求每个测试文件恰好归属一个套件。局部测试通过不代表完整交付通过；失败、跳过和未执行分别报告。

## 升级与权限

包与分发资源当前为 0.5.0。版本号只在正式发布正式包时修改，功能迭代不 bump 包或资源版本。

```sh
tiller upgrade --plan
tiller upgrade --apply <plan-id>
```

升级支持当前及直接兼容的上一资源契约。预览不写文件；应用时只刷新摘要一致且用户未修改的受管文件，用户修改、缺失或区段异常列为冲突并保留原文。成功后更新 `project.json` 的摘要和 `resourceVersion`，不迁移业务资料、历史任务或旧批准。

提交、推送、合入和发布分别依据实际授权。CLI 检查受控文件和记录，不认证用户身份，也不能阻止宿主绕过 CLI 直接修改。

## 工程文档

- [总体需求](.tiller/specs/requirements.md)
- [总体设计](.tiller/specs/design.md)
- [决策记录](.tiller/specs/decisions.md)
- [全局用例说明](.tiller/cases/index.md)
- [确认去原话化与结构化任务正文](.tiller/task/20261022-round9/task.md)
- [确认语义与 task 重命名任务记录](.tiller/task/20261022-confirm-task/task.md)
- [模块用例与用例先行任务记录](.tiller/task/20261022-case-first/task.md)
