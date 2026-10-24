# 工作推进设计

## 1. 任务模型

唯一任务文件为 `.tiller/task/<id>/task.md`，包含标题、一行 `tiller-task:v1` 元信息和可读区段。元信息保存 id、类型、规模、创建时间、Git 基线、范围、可选规划归属、分支描述、标题摘要、需求文件来源和结构化格式标记；新任务不把开工前改动摘要写入标记，而写入已被忽略的 `.tiller/local/tasks/<id>/pre-existing.json`。读取时合并旧标记字段与本机旁路，写回只序列化共享元信息。需求、AC、设计、确认、验证、评审、自检从 Markdown 区段读取；元信息与区段都受格式校验。

## 2. 状态与确认

`confirm` 计算对象摘要：

- requirements：类型、规模、范围、需求正文和 AC；
- design：需求摘要和设计正文；
- acceptance：需求、设计、AC 验证结果、提交和代码树。

正文变化导致对应摘要变化，`check` 将需求或设计确认独立标为失效。确认记录保存确认部分、确认人、时间、提交、摘要和可选原话；人读段渲染为部分、确认人、时间、短提交、原话表，完整对象字段放入单行 `tiller-confirm:v1` 旁路。解析优先旁路，缺失或损坏时回退旧 bullet。确认人优先用 `--by`，否则读取 Git `user.name`。验收前必须已通过技术自检。

新任务把结构化需求写在 `### 面向谁与问题`、`### 目标`、`### 业务范围`、`### 关键行为`、`### 异常与边界`、`### 验收条件`；业务范围不列交付路径，路径只保存在元信息范围中。standard 设计写在 `### 方案`、`### 失败处理`、`### 取舍`、`### 影响与风险`、`### 验证入口`。章节注释强调业务约束与关键方案，不复制规格全文、不展开长命令菜谱。确认按可读行过滤空标题、注释和占位；旧任务没有格式标记时使用旧正文和顶层 AC，仅有 `### 范围` 的任务继续按旧章节确认。旧 quote 确认继续解析，再次写入时转为紧凑表并由旁路保留旧字段。

任务阶段在读取时按事实重新推导，优先级为最近关闭/放弃、有效需求确认、有效设计确认（standard）、当前验证、最后一次重开后的有效验收。回退时返回当前阶段与原因；`resume` 列表和 `plan status` 复用同一函数，避免多处状态漂移。

## 3. 验证

`start <task-id>` 必须带 `--title`、目标正文和至少一个 `--criterion "AC-N=<验收条件>"`；需求正文来自 `--requirement` 或工程内相对路径 `--requirement-file`。standard 任务必须至少声明一个 `--target`，small 缺省范围为 `.`。`confirm` 的确认人优先取 `--by`，原话 `--quote` 可选。`verify` 接受 `--test` 或 `--case`；`--case` 先扫描覆盖该用例的全部测试，再逐个通过 `src/test-output.ts` 的适配器构造精确匹配的 node:test 命令，并将自带报告器写入私有临时目录。退出码与私有报告共同决定 passed/failed，stdout/stderr 只进日志。报告按文件与完整名称路径精确匹配恰好一个测试，且结果为通过、无失败事件才标记 verified；仅引用文件时要求全部通过。报告缺失/损坏、0/多个匹配、失败或跳过均为 unverified，由 `check` 阻断。`verify.prepare` 先于测试执行，失败即验证失败；`verify.runner` 选择已注册适配器。测试路径先匹配已登记仓库，命中仓库的 `verify` 按字段覆盖根配置，准备命令和测试进程的工作目录都是该仓库根。工作区里不能唯一匹配时直接失败；当前工程没有仓库时使用根配置。`junit-maven` 使用 `mvn -Dsurefire.reportsDirectory=<私有目录> -Dtest=<类名[#方法]> test`，`junit-gradle` 使用 `gradle -Dtiller.junit.reports=<私有目录> --init-script <私有目录>/junit-gradle.init.gradle test --tests <类名[.方法]>`。两者都只解析私有目录里的 JUnit XML，不内嵌 JVM，也不按扩展名选择运行器。`task.md` 的每条 run 只写条件、测试、用例、结果、来源、核实、理由/失败先行、日志、短提交和时间；完整 command、exitCode、tree 与全量 commit 放入紧邻标题的单行 `<!-- tiller-verify:v1 {...} -->`。解析优先读旁路，缺旁路时兼容旧版命令、退出码和代码树摘要子弹；旁路损坏且无旧字段的 run 跳过。日志保留完整显示命令、起止和退出码；check/accept 继续使用解析后的原字段。历史记录没有核实字段时保持旧解析路径，不施加新证据检查。

外部报告使用 `--reported --command --result --reason`，理由必填并标记 `not-run`；`check`/`accept` 默认阻断，只有 `--allow-reported` 放行，`pr` 在验证结果中标明未执行及理由。bugfix 的 `--expect-fail` 在任务基线提交的临时 Git 工作树运行当前测试文件，要求具名测试失败并记录基线提交；`check` 还要求当前代码存在同一测试的已核实通过记录。工作树在成功或异常时都清理。

## 4. 检查

`check` 从任务记录和文件系统重建状态：

- 需求/设计确认是否仍绑定当前对象；
- 每条 AC 是否有最新通过、存在且未过期的测试；
- 执行记录是否已核实，外部报告是否有理由并经显式放行，bugfix 是否具备失败先行和当前通过；
- AC 是否映射到带完整测试设计的用例，验证阶段每个用例是否至少有一个引用它的当前通过测试；
- 用例 `criteria` 是否回指当前 AC 或在本任务修改，用例库结构与模块/场景引用是否有效；
- Git 范围内的越界、未提交改动、删除/跳过/弱化测试；
- standard 设计字段、decisions 有效条目和本任务涉及模块设计是否过薄，分支名是否包含任务编号；
- 记录中的密钥和本机路径。

结果分为阻塞项、提示、逐项覆盖和可写入 `task.md` 的自检清单。`accept` 复用同一检查，防止技术未就绪时写入验收。终态任务写回自检时只保留短复核指引，不复制回归和回写提示；`check` 返回值仍保留完整提示。

## 5. 关闭与恢复

`close --reason` 只接受当前阶段为已验收的任务；未验收任务必须显式 `close --reason ... --abandon`。关闭事件写入 `task.md` 的“关闭”区段，保存状态、原因和时间。`reopen --reason` 追加恢复事件；验收、确认和验证仍按原摘要判断，阶段从最后一次恢复之后的事实重新计算。终态任务上的 `confirm`、`verify`、`accept` 直接阻塞。

## 6. 交付草稿

`commitTypeForTaskType` 将任务类型映射到限定提交类型；`taskCommits` 读取 `base..HEAD` 的非合并主题。`branchNameIssue` 校验 `类型/任务编号[-描述]` 及任务编号前缀；`currentBranch` 在 main/master、detached HEAD 或无 Git 时跳过。`suggestedBranchNameFor` 在规范化 slug 已是任务编号本身或 `-<slug>` 后缀时不再追加。

提交主题固定为 `类型(模块): 中文摘要`，类型限 `feat/fix/docs/refactor/test/chore`，模块取规格模块名；PR/MR 标题沿用该格式并在末尾加 `[任务编号]`。格式问题只提示，不阻断技术自检。

`draftPullRequest` 复用 `inspectFlow` 的 AC 覆盖状态，从任务范围的模块路径、“涉及模块”声明和全局用例来源按声明顺序推导模块，标题取首个主模块，无模块时省略括号。标题摘要依次取 `pr --summary`、任务元数据 `summary`、任务基线后最早的规范 feat/fix 提交摘要和任务标题。提交读取保持正序，正文生成器只接受五个固定二级标题；关联任务输出纯文本路径，验证结果以每条 AC 的摘要行加普通嵌套记录呈现，不使用编号圆点。Markdown 在标题后单列建议分支，JSON 同时返回 `body`、`branch` 和提交列表。分支描述依次读取 `pr --slug`、任务元数据 `slug`、当前分支匹配描述，并统一规范化为小写字母、数字和连字符。该模块没有网络依赖，文案对 PR/MR 中性。

## 7. 范围与恢复

范围是工程相对路径集合；默认 `.`。排除任务自己的记录、`.tiller/local/`、`.git/` 和依赖目录。无 Git 时跳过依赖提交差分的检查，但保留文件级代码树摘要。写入使用统一事务，失败可用 `recover`。

## 8. 评审与发布

评审段由 `reviewFlow` 读写：固定 checklist 保存评审人和时间，每个 `REV-NNN` 保存发现文本、阻塞标记、记录人、状态及解决人/时间。`checkFlow` 把未解决阻塞项加入阻塞列表；`acceptFlow` 复用同一检查，故不会在阻塞未清除时写入验收。`--resolve` 只改变发现状态，不删除历史。

`releaseChecklist` 与 `flow` 解耦，只接收任务 id、验收状态、验收提交和范围，返回 `pass|fail|na` 项与失败摘要。`releaseFlow` 从任务阶段和最新 acceptance 组装输入；`checkFlow` 也调用该函数返回清单，但不并入 `issues`。发布项读取 `inspectProject`、`planUpgrade`、README、`package.json` 和任务范围内的 Git 工作树。

## 9. 验收提交检查

`evaluationContext` 查找最后一次 reopen 之后、对象摘要仍有效的最新 acceptance：提交可读时，用 `git ls-tree`/`git show` 重建范围内树摘要，并把该提交传给测试存在性、范围 diff 和测试弱化检查；不可读时回退当前工作区并给出提示。未验收或验收对象失效的任务不设置端点，继续使用工作区/HEAD 和未提交改动检查。钉住提交只改变检查时点，不跳过已记录的核实状态、外部报告理由或 bugfix 证据判断。

## 10. 任务 worktree

`src/task-worktrees.ts` 统一生成任务分支与布局。project 的检出就是 `.tiller/local/worktrees/<id>/`；workspace 先建 `management`，再按 `project.json.repositories[].path` 建 `repositories/<id>`。每个源仓必须是自身 Git 工作副本根且有提交，分支复用 `commitTypeForTaskType`、`suggestedBranchNameFor`，任务编号已含同一描述时不双拼；已有同名分支时直接检出，否则从该仓 HEAD 新建。worktree 路径始终只使用任务编号。

建树前先校验任务容器、全部源仓和目标路径，任何一步失败都强制移除本次已建树并清理容器，task.md 不落盘。成功后把相对路径与本机清单 `.tiller/local/tasks/<id>/worktrees.json` 写入；清单缺失或损坏时 close 回退 project/workspace 约定布局。所有目标都经安全路径校验并限制在 `.tiller/local/worktrees/<id>/` 下。

close 在写入关闭事实后按清单或约定布局执行 `git worktree remove --force` 与 prune；路径已缺失记入 `missingWorktrees` 并继续。Git 移除失败时仅对该受管目录强制删除并返回 warning，随后删除本任务日志；清理失败不阻断关闭记录。所有本机路径保持工程相对形式，不写入共享 task.md。
