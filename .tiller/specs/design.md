# tiller 总体设计

## 1. 设计原则

文件是事实源，Git 是历史；CLI 只做可重复检查，不承担身份认证。默认路径短、参数少，复杂能力按需启用。任何确认都绑定已写明的对象摘要，任何验证都绑定可重跑命令与代码树。

## 2. 主要构成

| 部分 | 职责 |
|---|---|
| `src/core.ts` | 工程初始化、元信息、受管区段、状态检查 |
| `src/init-baseline.ts` | 初始化 worktree、基线元信息、PR/MR 尝试与本地降级 |
| `src/flow.ts` | task 的 start/resume/confirm/verify/review/check/accept/release/close/reopen 与阶段推导 |
| `src/release.ts` | 只读发布门禁：验收提交、元数据、受管资源、README/版本和范围清洁度 |
| `src/test-output.ts` | 测试运行适配器注册、node:test 命令构造与私有报告核实 |
| `src/test-reporter.ts` | 只输出测试事件与总结的私有 JSONL 报告器 |
| `src/plans.ts` | 规划、条目依赖、确认和状态 |
| `src/cases.ts` | 全局用例读取、校验、`case add`、回归提示 |
| `src/commit-conventions.ts` | 提交主题与 PR/MR 类型约定、任务基线后的提交读取 |
| `src/branch-conventions.ts` | 分支名建议、格式与任务编号校验 |
| `src/branch-cleanup.ts` | 合入或关闭后的本地与远端任务分支清理 |
| `src/pr.ts` | 从 `task.md` 与 Git 生成五段 PR/MR 草稿和建议分支 |
| `src/upgrade.ts` | 受管文件预览、冲突判断、原子刷新 |
| `src/cli.ts` | 命令解析、帮助、JSON 输出和退出码 |
| `resources/` | 分发的入口、使用指引、规则和启动器 |

## 3. 默认工作流

唯一任务记录是 `.tiller/task/<id>/task.md`，元信息与 `## 需求`、`## 设计`、`## 确认`、`## 验证`、`## 自检` 等区段共同构成事实源。`start` 写入使用场景、目标、业务范围、关键行为、异常与边界和验收条件；可用 `--requirement-file` 读取工程内非空 specs，其“验收条件”中的 `- AC-n: ...` 导入任务并以文件为准，有 AC 时可省略重复 `--criterion`，无 AC 时仍须声明。任务只引用同一 specs 路径与 `AC-n`，不写模块前缀或“对照”平行列表；交付路径只进元信息范围。standard 必须声明 `--target` 并另写方案、失败处理、取舍、影响与风险、验证入口，同时记录类型、规模、范围、基线和开工前已有改动；开工前摘要保存到本机旁路，标记只保留共享元信息。small 缺省范围为 `.`。`confirm` 先按可读行校验必填段不是空标题或占位，再保存确认部分、确认人、时间、对象摘要和提交；确认人优先取 `--by`，原话可选。需求与设计分别摘要，因此改设计不会使需求确认失效。`verify` 只声明 `--test` 或 `--case`，由适配器构造精确匹配的 node:test 命令，在私有临时目录生成报告并读取；stdout/stderr 只写日志，不参与判定。任务正文展示人读摘要，完整命令、结果、证据、当前代码树与全量提交保存在机器旁路和日志中；报告缺失/损坏或匹配不唯一均为未核实。外部报告以 `--reported --command --result --reason` 登记，理由必填。`check` 汇总确认、AC 映射、执行/报告证据、范围、测试弱化、安全和未提交改动；`accept` 与此一致，外部报告仅在 `--allow-reported` 时放行。bugfix 的 `--expect-fail` 在基线临时工作树复用同一适配器和报告路径，要求具名测试失败，并要求当前代码有同一测试的已核实通过记录。`accept` 在 `pr` 前完成并随任务记录提交；`pr` 对无有效 acceptance 或记录未提交分别以 `PR_NOT_ACCEPTED`、`PR_TASK_RECORDS_DIRTY` 阻断。已验收任务合入后 `close` 只清理本机 worktree 与 `.tiller/local/<id>/`，不写共享记录；未验收终止必须 `--abandon` 并写共享放弃事实。`reopen` 可从已验收或终止任务追加恢复事实并重新推导阶段。

已验收任务由 `evaluationContext` 固定到 acceptance 确认中的提交：树摘要、测试存在性、范围 diff 和测试弱化检查都读取该提交；未验收或验收对象已失效的任务仍读取工作区/HEAD。已验收任务若当时的核实状态、外部报告理由或测试引用不完整，仍按原记录失败。任务基线后没有 specs/context 回写时，`check` 只增加提示。

阶段不存独立状态字段，而是按需求确认、设计确认、当前验证和最新验收依次推导；需求变化、验证过期或验收对象变化时回退到最近有效阶段并给出原因。`resume` 和 `plan status` 都读取同一推导结果。

旧任务没有 `format: structured` 标记时沿用纯文本需求与顶层验收条件；旧确认记录仍按 quote、原话用途和旧对象文本解析。重写 task.md 时保留旧格式，避免迁移正文使既有批准失效。

## 4. 规划

规划文件由可读正文和一行规划元信息组成。条目粒度、依赖、覆盖需求、可选子规划引用和确认摘要保存在元信息中；可见正文必须与元信息一致，否则确认失效。规划确认采用与任务确认相同的可选原话和确认人记录。子规划仅作条目指向，不递归调度。`start --plan <id> --item <item>` 读取已确认条目、继承粒度并检查依赖是否已验收；未完成直接阻塞。任务元信息保存规划归属。`plan status` 从任务阶段推导条目状态：已验收或已关闭任务计入完成，只有放弃任务时标为已放弃，其余未完成工作为进行中；同时列出每个任务阶段、未覆盖需求和阻塞依赖。

## 5. 全局用例

目录：

```text
.tiller/cases/
  index.md
  modules/<模块>/{behavior,interface,performance,security}.md
  scenarios/<场景>.md
```

每个 Markdown 用例以二级标题中的 `CASE-NNN` 为稳定编号，段内字段声明类型、优先级、模块、来源 AC 与需求，三级段声明前置条件、步骤、输入和预期结果。场景额外声明经过的 `modules`。用例不保存源码路径；读取时校验需求路径、模块、类型白名单、编号唯一、必备设计字段和场景模块存在。

`case add`：在工程锁内只扫描用例标题分配下一个未占用编号，不把正文示例编号当作占用；写入前校验任务 AC、模块和类型，不要求测试文件，也不接收源码字段或旧参数，返回待实现状态与测试骨架。测试扫描 `test/**/*.test.*` 和 `*.spec.*`，从测试名或紧邻注释提取 `CASE-NNN`，建立 case→tests 反查；未知编号进入错误列表。

## 6. 用例先行与检查

`verify --test` 从测试引用反查用例，`verify --case` 执行覆盖该用例的全部测试；两者都走私有报告核实。`check` 分阶段要求：

1. AC 有带完整测试设计的用例；缺失用例编号为阻塞项；
2. 验证或验收阶段每个用例至少一个引用测试；无测试显示待实现并阻塞；
3. 用例 `criteria` 回指当前任务 AC，或该用例在本任务新增/修改；
4. 最新验证通过、命令由 tiller 实际执行且私有报告已核实，代码树未变化；
5. 外部报告有理由并仅经 `--allow-reported` 放行，bugfix 有基线失败先行与当前通过；
6. 用例库结构有效，并报告模块数量、场景覆盖和回归提示。

无 Git 时范围检查降级为提示；有 Git 时同时检查越界、未提交改动、删除/跳过/弱化测试。node:test 之外的框架通过 `src/test-output.ts` 的 `TestRunner` 适配器扩展；`project.json` 的 `verify.runner` 选择适配器，`verify.prepare` 在测试前运行准备命令且失败即验证失败。工作区按测试路径所属仓库选择 runner，仓库上的 `verify` 按字段覆盖根配置，准备命令的工作目录是该仓库根；不能唯一匹配时失败，不回退到根配置。当前工程没有仓库清单时使用根配置。`junit-maven` 与 `junit-gradle` 分别构造 Maven `-Dtest` 和 Gradle `--tests`，解析私有目录中的 JUnit XML，命中规则与 node-test 相同。`pytest` 构造 `--junitxml=<私有报告>` 并解析 XML；模块由测试路径推导，类方法使用 `类名::方法名`。不内嵌 JVM/Python，也不按扩展名猜测语言。验证记录按 AC 与 CASE 分别识别连续失败；成功核实清零，连续两次后要求停止自动重试。

## 7. 提交、分支与 PR/MR

提交类型限定 `feat/fix/docs/refactor/test/chore`，主题格式为 `类型(模块): 中文摘要`；模块名必须来自 `.tiller/specs/modules/`，任务类型到提交类型由固定映射推导。检查范围是任务 `base` 到 `HEAD` 的非合并提交，只产生提示。

分支建议为 `类型/任务编号[-简短描述]`；描述依次取 `--slug`、任务元数据、当前分支，且必须匹配当前任务编号。main/master 与 detached HEAD 跳过检查。PR/MR 标题为提交格式加 `[任务编号]`，摘要依次取 `pr --summary`、任务元数据、最早规范 feat/fix 提交摘要和任务标题，主模块取范围首个；正文固定五段，关联任务为纯文本，变更内容按提交时间正序，验证按 AC 用普通嵌套列表保留全部记录。`pr` 默认用 tokenized HTTPS git push 推送任务分支，并经平台 API 创建真实 PR/MR，返回 URL 与编号；GitHub Git Data API 只在 git 推送失败时可选回退；`--draft-only` 才只输出本地草稿。`merge` 继续经 REST API squash，合入后自动 close；文档与 CLI 主路径为 `accept → pr → merge`，不提供手搓 API 的第二通道。

## 8. 初始化与升级

`init` 只补缺失骨架，维护 `AGENTS.md` 区段、`.gitignore` 本机排除、`.tiller/index.md` 导航和平台对应的合并请求模板；已存在且冲突的入口拒绝覆盖。空工程骨架至少包含 `.tiller/specs/requirements.md`、`design.md`、`decisions.md`、`modules/README.md`、`.tiller/context/project.md`、`.tiller/cases/index.md`、`cases/modules/`、`cases/scenarios/`、`plans/` 和入口规则。`--platform github|gitlab|both` 选择模板，缺省 github；GitHub 使用 `.github/pull_request_template.md`，GitLab 使用 `.gitlab/merge_request_templates/Default.md`，both 同时生成。检测到 pytest 配置或 Python 测试布局时写入 `verify.runner=pytest`。`project.json` 保存模式、可选平台、仓库映射和各受管文件的规范化摘要；平台切换需手动修改元信息并补齐模板。

`upgrade --plan` 只读预览，`upgrade --apply <plan-id>` 应用；读取当前或兼容上一资源契约，按记录摘要判断受管文件是否被用户修改。未修改文件按分发资源或固定区段重建；修改、缺失和异常区段只报告冲突，并给出首个差异位置。`upgrade --adopt <受管文件>` 不重写文件，只把当前受管内容摘要写回元信息，供有意保留本地修改的工程消除漂移。`plan attach <task> --plan <id> --item <id>` 为已有任务补充规划归属；它只校验已确认规划与条目存在，不依赖条目的完成状态，也不改任务确认。预览摘要绑定输入、期望结果和元信息；应用时在锁内重新预览并原子写入，成功后更新摘要与 `resourceVersion`，保留 `verify` 等用户配置。事务失败保留恢复依据，可由 `recover` 恢复。

有 Git HEAD 时，`init` 在受管文件落盘后调用 `src/init-baseline.ts`，从当时 HEAD 建 `chore/tiller-init` 和 `.tiller/local/<YYYYMMDD-tiller-init>/worktrees`。第一笔同标题提交承载受管改动并成为 `initBaseline.commit`，第二笔把引用该提交的元信息写入分支，避免自引用；随后由 `src/platform-api.ts` 推送并创建 PR/MR：GitHub 与 GitLab 都优先 tokenized HTTPS `git push`，GitHub 仅在其失败时回退 Git Data API，PR/MR 与 merge 操作均走 REST API。远端失败只告警并返回 token/API 下一步，保留 worktree 与提交；本地建树或提交失败则回滚元信息并清理由本次创建的本机目录与分支。`start` 在初始化提交未成为 HEAD 祖先且未标记 merged 时阻断，`--skip-init-gate` 可显式跳过；存量工程没有标记时放行。init-id 的 `close` 只复用本机清理路径。

## 9. 错误与恢复

输入错误返回参数错误；未初始化、版本不支持、冲突、依赖阻塞、未确认、未验证、范围越界等使用稳定错误码并说明下一步。写操作使用事务与恢复日志，失败后可用 `recover` 恢复；不得凭摘要重建缺失文件或覆盖用户修改。

## 10. 评审与发布

`review` 在 `task.md` 写入评审人、检查清单和 `REV-NNN` 发现；一般发现与阻塞发现分开，`--resolve` 记录解决人、时间并恢复可验收状态。`check`/`accept` 将未解决阻塞发现作为阻塞项。`releaseChecklist` 是只读函数，逐项检查已验收、验收提交、项目元数据、受管资源、README、npm 包名/版本与 README 版本、任务范围未提交改动；非 npm 项目跳过包项。`check` 返回同一清单，但 `release` 才是显式发布门禁。

## 11. 验证入口

`npm run build`、`lint`、`typecheck`、`npm test`、`npm run test:package`。构建必须实际编译 TypeScript；局部规则检查不能替代完整测试。
