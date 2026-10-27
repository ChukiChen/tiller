# 工作推进设计

## 1. 任务模型

唯一任务文件为 `.tiller/task/<id>/task.md`，包含标题、一行 `tiller-task:v1` 元信息和可读区段。元信息保存 id、类型、规模、创建时间、Git 基线、范围、可选规划归属、分支描述、标题摘要、需求文件来源和结构化格式标记；新任务不把开工前改动摘要写入标记，而写入已被忽略的 `.tiller/local/<id>/pre-existing.json`。读取先找新路径，再回退旧 `.tiller/local/tasks/<id>/pre-existing.json`；合并旧标记字段与本机旁路，写回只序列化共享元信息。需求、AC、设计、确认、验证、评审、自检从 Markdown 区段读取；元信息与区段都受格式校验。

## 2. 状态与确认

`confirm` 计算对象摘要：

- requirements：类型、规模、范围、需求正文和 AC；
- design：需求摘要和设计正文；
- acceptance：需求、设计、AC 验证结果、提交和代码树。

正文变化导致对应摘要变化，`check` 将需求或设计确认独立标为失效。确认记录保存确认部分、确认人、时间、提交、摘要和可选原话；人读段渲染为部分、确认人、时间、短提交、原话表，完整对象字段放入单行 `tiller-confirm:v1` 旁路。解析优先旁路，缺失或损坏时回退旧 bullet。确认人优先用 `--by`，否则读取 Git `user.name`。验收前必须已通过技术自检。

新任务把结构化需求写在 `### 使用场景`、`### 目标`、`### 业务范围`、`### 关键行为`、`### 异常与边界`、`### 验收条件`；业务范围不列交付路径，路径只保存在元信息范围中。standard 设计写在 `### 方案`、`### 失败处理`、`### 取舍`、`### 影响与风险`、`### 验证入口`。章节注释强调业务约束与关键方案，不复制规格全文、不展开长命令菜谱。确认按可读行过滤空标题、注释和占位；旧任务没有格式标记时使用旧正文和顶层 AC，仅有 `### 范围` 的任务继续按旧章节确认。旧 quote 确认继续解析，再次写入时转为紧凑表并由旁路保留旧字段。

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
- standard 设计字段、decisions 有效条目和本任务涉及模块设计是否过薄，分支名是否包含任务编号，需求“业务范围·做”是否混入交付路径；
- 记录中的密钥和本机路径。

结果分为阻塞项、提示、逐项覆盖和可写入 `task.md` 的自检清单。`accept` 复用同一检查，防止技术未就绪时写入验收。终态任务写回自检时只保留短复核指引，不复制回归和回写提示；`check` 返回值仍保留完整提示。已验收 close 不写共享记录，因此不重写自检。

## 5. 关闭与恢复

`close --reason` 只接受当前阶段为已验收的任务；它按任务默认 worktree 清理流程删除本机检出与 `.tiller/local/<id>/`，再默认删除本地与远端任务分支；`--keep-branch` 保留分支，删除失败只记 warning。它不调用 `writeTask`，也不把任务树 materialize 到 primary 或写入 `.tiller/local/closed/`；已合入的共享 `task.md` 内容、摘要和修改时间保持不变，返回阶段仍为已验收并标明本机清理完成。未验收任务必须显式 `close --reason ... --abandon`；放弃事件写入 `task.md` 的“关闭”区段，保存状态、原因和时间，放弃任务保持终态。`reopen --reason` 对已放弃或历史已关闭任务追加恢复事件，也允许从已验收任务显式重开；验收、确认和验证仍按原摘要判断，阶段从最后一次恢复之后的事实重新计算。终态任务上的 `confirm`、`verify`、`accept` 直接阻塞。

## 6. 交付草稿与真实 PR/MR

`commitTypeForTaskType` 将任务类型映射到限定提交类型；`taskCommits` 读取 `base..HEAD` 的非合并主题。`branchNameIssue` 校验 `类型/任务编号[-描述]` 及任务编号前缀；`currentBranch` 在 main/master、detached HEAD 或无 Git 时跳过。`suggestedBranchNameFor` 在规范化 slug 已是任务编号本身或 `-<slug>` 后缀时不再追加。

提交主题固定为 `类型(模块): 中文摘要`，类型限 `feat/fix/docs/refactor/test/chore`，模块取规格模块名；PR/MR 标题沿用该格式并在末尾加 `[任务编号]`。格式问题只提示，不阻断技术自检。

`draftPullRequest` 复用 `inspectFlow` 的 AC 覆盖状态，从任务范围的模块路径、“涉及模块”声明以及用例需求/测试引用按声明顺序推导模块，标题取首个主模块，无模块时省略括号。标题摘要依次取 `pr --summary`、任务元数据 `summary`、任务基线后最早的规范 feat/fix 提交摘要和任务标题。提交读取保持正序，正文生成器只接受五个固定二级标题；关联任务输出纯文本路径，验证结果以每条 AC 的摘要行加普通嵌套记录呈现，不使用编号圆点。Markdown 在标题后单列建议分支，JSON 同时返回 `body`、`branch` 和提交列表。分支描述依次读取 `pr --slug`、任务元数据 `slug`、当前分支匹配描述，并统一规范化为小写字母、数字和连字符。草稿生成本身保持本地、文案对 PR/MR 中性。

`draftPullRequest` 在生成草稿前先复用 `inspectFlow` 的 acceptance 状态；没有有效交付验收时以 `PR_NOT_ACCEPTED` 失败，并提示先 `accept`、提交任务记录再 `pr`。随后读取相对 HEAD 的 tracked 与 untracked 路径，命中本任务 `.tiller/task/<id>/` 或任务 scope 覆盖的 `.tiller/cases/`、`.tiller/specs/` 时以 `PR_TASK_RECORDS_DIRTY` 失败并列出工程相对路径；其他任务目录不在门禁范围，tiller 不自动提交。无 Git 或 Git 工作树不可读时跳过记录门禁，并在草稿 warnings 中保留提示；验收门禁仍生效。

`pullRequestFlow` 默认在草稿后解析项目元信息与平台 token，调用既有 `pushBranch` 和 `createPullRequest`/`createMergeRequest` 创建真实 PR/MR，JSON 返回 `url`、`number`、`platform` 与推送结果；缺 token 以中文 `PR_TOKEN_MISSING` 失败，创建接口返回 422 时以 `PR_ALREADY_EXISTS` 提示核对既有 PR/MR。`--draft-only` 在草稿处返回，不解析远端、不联网。`pr`/`merge` 从任务 worktree 进入时由 `resolveTaskCheckout` 同时解析主仓与任务读取根：任务记录、阶段、验收门禁与未提交记录检查优先使用当前任务检出，提交摘要与记录门禁使用该检出的 Git 状态；推送、平台 API 和元信息仍用主仓。任务 worktree 缺少记录时保持 `TASK_NOT_FOUND`，不静默回退 primary 副本。

推送传输与平台能力分开：`pushBranch` 对 GitHub/GitLab 都先执行 tokenized HTTPS `git push`，GitHub 只在 git 失败时回退 Git Data API；PR/MR 创建、合并状态读取和 squash merge 仍走 REST API。初始化在 `src/`、`test/` 缺失或为空时都写入对应 `.gitkeep`。`check` 对以稳定 specs 的 `--requirement-file` 为实现来源且未改 specs/context 的代码任务不输出泛化回写提示；PR 记录门禁同时检查当前任务检出与 primary 的残留副本。重复 `accept` 忽略旧验收提交的评估上下文，按当前工作区重新核实。

## 7. 范围与恢复

范围是工程相对路径集合；默认 `.`。排除任务自己的记录、`.tiller/local/`、`.git/` 和依赖目录。无 Git 时跳过依赖提交差分的检查，但保留文件级代码树摘要。写入使用统一事务，失败可用 `recover`。

## 8. 评审与发布

评审段由 `reviewFlow` 读写：固定 checklist 保存评审人和时间，每个 `REV-NNN` 保存发现文本、阻塞标记、记录人、状态及解决人/时间。`checkFlow` 把未解决阻塞项加入阻塞列表；`acceptFlow` 复用同一检查，故不会在阻塞未清除时写入验收。`--resolve` 只改变发现状态，不删除历史。

`releaseChecklist` 与 `flow` 解耦，只接收任务 id、验收状态、验收提交和范围，返回 `pass|fail|na` 项与失败摘要。`releaseFlow` 从任务阶段和最新 acceptance 组装输入；`checkFlow` 也调用该函数返回清单，但不并入 `issues`。发布项读取 `inspectProject`、`planUpgrade`、README、`package.json` 和任务范围内的 Git 工作树。

## 9. 验收提交检查

`evaluationContext` 查找最后一次 reopen 之后、对象摘要仍有效的最新 acceptance：提交可读时，用 `git ls-tree`/`git show` 重建范围内树摘要，并把该提交传给测试存在性、范围 diff 和测试弱化检查；不可读时回退当前工作区并给出提示。未验收或验收对象失效的任务不设置端点，继续使用工作区/HEAD 和未提交改动检查。钉住提交只改变检查时点，不跳过已记录的核实状态、外部报告理由或 bugfix 证据判断。

## 10. 任务 worktree

`src/task-worktrees.ts` 统一生成任务分支与布局。每个任务使用 `.tiller/local/<id>/` 作为本机根，检出容器为 `worktrees/`；project 的检出就是该容器，workspace 先建 `management`，再按 `project.json.repositories[].path` 建 `repositories/<id>`。每个源仓必须是自身 Git 工作副本根且有提交，分支复用 `commitTypeForTaskType`、`suggestedBranchNameFor`，任务编号已含同一描述时不双拼；已有同名分支时直接检出，否则从该仓 HEAD 新建。worktree 路径始终只使用任务编号。

建树前先校验任务容器、全部源仓和目标路径，任何一步失败都强制移除本次已建树，并清理本次产生的 worktree 容器、清单和开工前旁路；未知的本机文件保留，空任务目录一并移除，task.md 不落盘。成功后把相对路径与本机清单 `.tiller/local/<id>/worktrees.json` 写入；读取先新后旧，清单缺失或损坏时 close 回退 project/workspace 的新旧约定布局。所有目标都经安全路径校验并限制在新旧任务 worktree 容器内。

已验收 close 不写共享关闭事实，也不把 `.tiller/task/<id>/` materialize 到 primary；直接按清单或约定布局执行 `git worktree remove --force` 与 prune。abandon 只在当前任务检出写关闭段，若 primary 已有该任务记录则刷新已有副本，**不**新建未跟踪种子。路径已缺失记入 `missingWorktrees` 并继续。Git 移除失败时仅对该受管目录强制删除并返回 warning；随后删除整棵 `.tiller/local/<id>/`（含 logs 与旁路），并 best-effort 清理旧 `.tiller/local/worktrees|logs|tasks/<id>/`。`closeFlow` 经 `resolveTaskCheckout` 从任务 worktree 取得主仓与任务读取根：任务记录和 abandon 写回使用当前任务检出，worktree 清理与 `cleanupTaskBranches` 继续使用主仓，在管理仓与各业务仓删除同名本地分支并优先通过平台 API 删除远端；远端 404/422/已不存在视为已清理且不产生 warning，无 token、平台解析失败、其它远端 API 失败或当前分支无法安全切换只汇总 warning，不回滚本机清理。`--keep-branch` 跳过整段分支删除。不再写入或读取 `.tiller/local/closed/<id>.json`；合入后的历史靠默认分支快进/pull 取得已跟踪记录。重复 close 对缺失 worktree、local 与分支保持幂等。清理失败不阻断本机清理结果或放弃记录，其他任务路径不动。所有本机路径保持工程相对形式，不写入共享 task.md。

`project-root.ts` 的 `resolveTaskCheckout(input, id)` 是任务根、`--path` 与 cwd 的唯一解析入口。它先由 `resolveProjectRoot` 找主仓，再识别输入是否落在本任务新旧 worktree 容器或清单登记的任务检出；命中时以该检出的管理根为 `taskRoot`，即使主仓也有同名 `task.md`。`case add`、`confirm`、`verify`、`check`、`accept`、`review`、`release`、`reopen`、`resume <id>`、`attach` 与 `pr` 读任务侧均使用该入口，不再各自 `path.resolve(rootInput)` 猜任务根。任务 worktree 缺少记录时仍返回该任务根，由 `readTask` 报 `TASK_NOT_FOUND`；显式 `--path primary` 才读取主仓副本。任务记录写入只更新当前检出及其它已存在的任务 worktree，不在 `taskRoot` 非 primary 时写回 primary；start 首次写入目标是管理/sole 任务 worktree，再按需同步到兄弟 worktree，不在 primary 留种子。`confirm`/`accept` 写入确认后自动提交本任务 `.tiller/task/<id>/`。

## 11. 初始化基线门禁

`startFlow` 在读任务记录前调用 `assertInitBaselineReady`。无 `initBaseline` 视为存量工程并放行；`status=merged` 直接放行；其余状态先执行 `git merge-base --is-ancestor <commit> HEAD`。祖先失败后解析平台与 token，按 `branch` 查询已合入 GitHub PR/GitLab MR；命中则调用 `markInitBaselineMerged` 写回并放行，覆盖网页 squash 导致提交非祖先的情形。无 token、平台解析/API 失败或无已合入记录仍返回 `INIT_BASELINE_PENDING` 并提示合入或 `--skip-init-gate`；跳过选项只属于 `start`，进入时写入 warning。

`initBaselineId` 识别 `<YYYYMMDD>-tiller-init`。`closeFlow` 对此类 id 不读取任务记录、不要求验收，也不允许 `--abandon`；复用 `cleanupTaskWorktrees` 清理该 id 的 worktree、日志与 local，再删除本地与远端 `chore/tiller-init`（`--keep-branch` 保留），保持其他任务目录不变。

## 12. 过程卫生自检

`src/doctor.ts` 的 `doctorFlow` 先解析主工程根，再返回 `ready`、分支、逐项 `checks`、issues/warnings 与汇总。`init-baseline` 按祖先或 merged 状态检查初始化基线；`default-specs` 在当前为 main/master 时检查 `.tiller/specs` 的工作区脏改与相对 `origin/<branch>` 的未合入改动；`task-branches` 找出未挂载 worktree 的残留任务分支；`ac-coverage` 复用任务阶段与 `inspectFlow` 提示进行中任务缺口；`data-model` 扫描历史 `LIB-*` 与“验收条件（稳定）”标题。fail 项使 CLI 退出码为 1，warn 项只报告。

## 13. 狗粮路径卫生

`startFlow` 在 applyChanges 写主树任务记录后调用 `syncTaskRecordsToWorktrees`，递归同步 `.tiller/task/<id>/`，拒绝符号链接；同步失败先拆本次 worktree，再删除主树本次任务目录并保留原始错误。`writeTask` 只在其他检出原本已有该记录时传播更新，避免为旧“仅 worktree 记录”场景重新制造主树副本。

`init-baseline.ts` 提供 `proveInitBaselineMerged`，统一祖先、status=merged 与平台已合入 PR/MR 三种证明；start、doctor 与 close init-id 共用。init 基线成功写入 worktree 并提交后，`createInitBaseline` 对本次 changes 中除 `.tiller/project.json` 外、主树仍未跟踪且字节匹配 after 的受管路径精确删除，不用 `git clean`；内容被用户改写或已跟踪时保留。`skeletonChanges` 在 `src/`、`test/` 已存在且为空时向同一事务追加对应 `.gitkeep`，文件事务仅额外放行这两个固定目录标记。

`deleteRemoteBranch` 对 404、422 与 does not exist/not found 语义返回 `deleted: true`，`branch-cleanup` 因而计入 `remoteDeleted` 且不生成 warning。`cli.ts` 的 `prOutputFormat` 选择输出形态：显式 `--json` 或 stdout 非 TTY 使用稳定 JSON，TTY 保持 Markdown；draft-only 从工程元信息返回 platform，不解析远端或联网。

## 14. 合入后不变式、短目标骨架与 PATH 入口

`closeFlow` 与 `mergeFlow` 的自动 close 只清理任务 worktree、本机目录和任务分支，不向 primary 复制 `.tiller/task/<id>/`。合入后的共享记录由远端默认分支的已跟踪提交快进获得。回归测试同时验证 primary 无任务残留、`git status` 工作区干净，以及 `git merge --ff-only` 可完成；平台 API 合入与手动 close 两条收尾路径共用这一不变式。

无 `--requirement-file` 时，`renderStructuredRequirement` 用短目标生成可确认骨架：使用场景记录目标，目标写明短目标，业务范围写本次做/不做/假设，关键行为逐条列出 AC，异常与边界写失败和未完成边界。`--requirement-file` 的结构化正文仍优先，不注入短目标骨架。`init` 不再自动执行 `runtime bind`；主路径文档和 package smoke 直接调用 PATH、`npx` 或安装包的 tiller。`commitSubjectIssue` 对 `specs`、`workflow`、`standards`、`initialization`、`verification` 等约定 scope 跳过模块存在性提示，其它未知模块仍报错。
