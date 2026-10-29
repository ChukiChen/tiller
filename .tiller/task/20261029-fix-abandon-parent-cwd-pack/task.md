# 父 shell cwd 下的 abandon 可重试与流程卫生

<!-- tiller-task:v1 {"version":1,"id":"20261029-fix-abandon-parent-cwd-pack","type":"bugfix","size":"standard","created":"2026-10-29T14:19:35.072Z","base":"5117725a085f79a425c23dc568c256b2ec337002","scope":["src","test",".tiller/specs/modules/workflow",".tiller/cases/modules/workflow",".tiller/cases/modules/verification",".tiller/cases/modules/initialization",".tiller/usage.md","resources/usage.md",".tiller/context"],"format":"structured","slug":"abandon-parent-cwd-pack","summary":"父 cwd abandon 预检与可重试，并修复 Windows/验证/输入卫生","requirementFile":".tiller/specs/modules/workflow/abandon-parent-cwd-pack.md"} -->

## 需求

### 使用场景

- 开发者在任务 worktree 或其子目录中启动 shell，随后试图用 `tiller close <id> --abandon` 取消任务。子进程无法释放调用方父 shell 持有的目录句柄，破坏性清理不能假装成功。
- Windows 上的 `cmd /c` 启动 Maven/Gradle 等批处理命令时，引号和外层命令层必须保持参数边界，不能把 `$HOME`、`&` 或含空格参数拆成残片。
- 测试夹具需要从 worktree 子目录真实执行 CLI，以便区分产品 cwd 行为与夹具覆盖 cwd 造成的假绿或 EBUSY。
- 只读检查与 PR 生成应呈现稳定、可复核的结果，不应反向弄脏任务记录或把历史失败混作当前证据。
- 初始化、任务创建和规格类任务需要在缺少 Git 身份、模块推断或含引号输入时给出可执行错误。

### 目标

需求来源：`.tiller/specs/modules/workflow/abandon-parent-cwd-pack.md`

1. `close --abandon` 在调用方 cwd 占用待删任务路径时先明确拒绝，保留任务记录和清理状态；解除占用后可从 primary 重试并完成清理。
2. 修复 Windows `cmd /c` 命令封装，保持可执行文件与每个参数的真实边界。
3. 修正测试 helper 的 cwd 覆盖，并让 CASE-317/322 在真实子目录语义下可重复通过或明确暴露产品缺陷。
4. `check` 保持只读；验证编号按已有最大值递增；PR 描述只把当前有效验证标为当前。
5. specs 范围任务的 PR 标题不误推业务模块；`case add` 支持含字面双引号输入；`init`/`start` 在需要提交前预检 Git 身份。

### 业务范围

- 做：父 cwd 预检、可恢复清理状态、失败后重试、Windows 命令封装、测试 helper/cwd、check 只读、verify 编号、PR 验证呈现、specs 模块推断、case 输入文件、Git 身份预检，以及对应 specs/CASE/测试/使用说明。
- 不做：忽略 EBUSY 并继续宣称成功；重新引入 `persistAbandonedTask` 或把 abandon 记录写入 primary `task.md`；修改 Gradle 启动（NEW-03）；合入本任务 PR。
- 假设与待确认：调用方 cwd 由启动 CLI 的进程 `process.cwd()` 可观测；父 shell 自身持有的句柄只能由调用方先切出目录解除。

### 关键行为

#### AC-PACK-1 父 cwd 预检与可重试清理

- 删除 worktree、`.tiller/local/<id>/` 或任务分支前，若当前进程 cwd 位于待删 worktree 或任务本机树内，`close --abandon` 不得开始半删；返回非零、`ok:false` 和明确错误，指引先切到 primary/主仓再重试，保留任务记录。
- 清理已开始后任一 worktree、本机目录或任务分支步骤失败时，失败结果不得删除唯一的任务记录；恢复记录保存在 `.tiller/local/<id>/` 的明确本机恢复路径中，供再次 `close --abandon` 读取。
- 从 primary 再次执行 `close --abandon` 能继续幂等清理；成功时 worktree、任务本机树与任务分支均消失，仍不写 primary `task.md`/CASE，也不产生 abandon 提交。
- 成功路径不保留恢复目录、任务记录或 `persistAbandonedTask` 式持久化痕迹。

#### AC-PACK-2 Windows cmd 引号

- `.cmd`/`.bat` 通过 `ComSpec /d /s /c` 启动时，外层命令只保留一层，可执行文件与每个参数使用可被 cmd 还原的引用/元字符转义。
- 含空格、`&`、`$HOME` 或字面双引号的参数不得在命令串中形成未闭合引号或 `'b" "$HOME""'` 一类残片。
- Linux/macOS 非 Windows 路径保持原 argv，不引入 shell 依赖。

#### AC-PACK-3 helper cwd 与 CASE-317/322

- `test/helpers.mjs` 的 `cli(cwd, ...)` 必须在传入 cwd 执行；带任务 id 时只能镜像夹具文件或查找任务记录，不得静默把 cwd 改成 worktree 根。
- CASE-317/322 在修正后的 helper 下从真实 nested cwd 验证：占用目录先明确拒绝，切回 primary 后可成功清理；不得以夹具覆盖 cwd 制造假绿。
- 若 nested 复跑仍暴露产品删除 EBUSY，修复产品删除路径；不得靠吞掉错误或延长无限重试通过。

#### AC-PACK-4 check 只读

- `tiller check` 不得修改 `task.md`，也不得使工作区出现本任务记录或 specs/CASE 的额外脏改。
- 检查结果只通过命令输出返回；临时锁或报告只可写入已声明的本机非跟踪路径，并在输出说明其性质。

#### AC-PACK-5 verify 编号与 PR 当前有效

- 新增验证段编号按 task.md 已有 `run-N` 最大序号递增；不得复用已存在的 `run-N` 标题绑定不同提交。
- PR 描述只把当前有效验证标为「当前有效」；历史 failed、旧提交或失效结果须省略或放入明确的历史小节，不得全部混在「当前有效」下。

#### AC-PACK-6 specs 标题、case 输入与 Git 身份

- 任务范围仅指向 `.tiller/specs`/`.tiller/cases` 等规格资料时，PR 模块/标题倾向 `specs`；显式模块仍可覆盖。不得因正文提到某业务模块而误推 `feat(greeting)`。
- `case add` 支持含字面双引号的文本，至少可通过 `--input-file` 读取；解析/校验错误不得把后续参数误报成子命令。
- `init`/`start` 在可能自动提交前预检 `user.name` 与 `user.email`；缺失时返回明确错误并给出 `git config --global user.name/user.email` 设置命令。

### 异常与边界

- 父 cwd 位于待删路径时，唯一正确恢复动作是调用方先 `cd` 到 primary 再重试；产品不得尝试强行删除父进程占用的目录。
- 恢复记录仅存在于本机 `.tiller/local/<id>/`，不是共享事实源，不提交、不写 primary 任务种子；成功清理后一起删除。
- 清理失败后不得返回 `stage` 已放弃或成功结果；错误码继续使用 `TASK_CLEANUP_FAILED`，错误文案列出仍占用路径与重试命令。
- Windows 不支持的控制字符或无法安全表达的参数继续明确拒绝；不得静默降级为 POSIX shell。
- Git 身份缺失时不得创建 worktree、分支、提交或初始化受管文件；不得用 tiller 假身份掩盖用户配置错误。
- `check` 的只读不改变已有验证/确认判定；显式 `verify`、`confirm`、`accept` 等写命令仍按原契约更新记录。

### 验收条件

- AC-1: 父 shell/调用方 cwd 位于待删 worktree 或 `.tiller/local/<id>` 树内时，`close --abandon` 在破坏性清理前非零失败并明确提示先切到 primary；任务记录仍在。清理已开始后失败的 worktree/本机目录/分支任一环节保留可读恢复记录与状态，再次从 primary 执行可继续清理；成功路径完整删除 worktree、任务本机树与任务分支，不写 primary task.md/CASE、不产生 abandon 提交
- AC-2: Windows `.cmd`/`.bat` 的 `cmd /c` 外层拼接与引号转义保持可执行文件及每个参数的精确边界，含空格、`&`、`$HOME` 和字面双引号的参数不产生 `'b" "$HOME""'` 等残片；Linux 回归不破
- AC-3: `test/helpers.mjs` 的 `cli(cwd, ...)` 尊重传入 cwd（含 nested），带任务 id 时不得静默改回 worktree 根；CASE-317/322 在真实 nested 语义下复跑，夹具问题修夹具，仍暴露的 EBUSY 产品缺陷一并修复，不得以假绿通过
- AC-4: `tiller check` 不修改 `task.md`，不弄脏工作区；结果通过输出返回，本机临时状态（如有）位于非跟踪路径并明确说明
- AC-5: 新增验证段 `run-N` 按 task.md 已有最大序号递增且不重复；PR 描述只把当前有效验证标为「当前有效」，历史 failed/旧结果省略或单列历史，不混作当前
- AC-6: 范围仅指向 specs/cases 的任务 PR 模块/标题倾向 `specs` 且不因正文误推业务模块；`case add` 支持含字面双引号文本（含 `--input-file`）且错误不误导为子命令；`init`/`start` 在自动提交前预检 Git `user.name`/`user.email`，缺失时给出设置命令

## 设计

### 方案

设计来源：`.tiller/specs/modules/workflow/abandon-parent-cwd-pack-design.md`

- `task-worktrees` 将 abandon 的 cwd 检查改为破坏性清理前预检：命中待删 worktree 或 `.tiller/local/<id>` 时直接失败，不执行 `process.chdir`；错误包含当前 cwd、primary 与重试命令。普通 close 暂保留既有切出行为。
- 清理前把现存任务记录复制到 `.tiller/local/<id>/recovery/.tiller/task/<id>/`。`readTask` 在正常任务记录缺失时读取该本机恢复记录；恢复记录不进入 Git、不写 primary `.tiller/task/`。
- `cleanupTaskWorktrees` 拆成准备与收尾：准备阶段删除 worktree、日志及已知本机产物但保留恢复记录；分支清理成功后由 `finalizeTaskCleanup` 删除整个任务本机树。任一步失败都保留恢复记录，后续从 primary 重试。
- Windows `.cmd`/`.bat` 命令封装采用 cmd 元字符转义：可执行文件和参数分别转义，参数先加引号再对 `cmd` 元字符加 `^`，最后只包一层 `/d /s /c` 命令。
- `test/helpers.mjs` 只镜像夹具文件到任务检出，不覆盖调用方 cwd。CASE-317 改为 nested cwd 先失败、primary 重试成功；CASE-322 保留 accepted 未合入的仅本机清理回归。
- `checkFlow` 只求值并返回 selfCheck，不写 task.md。`run-N` 从已有最大值递增；PR 验证段只输出 inspectFlow 确认的当前测试摘要，历史运行省略。
- specs/cases-only 范围推为 `specs` 模块，PR 支持显式 `--module` 覆盖；`case add` 增加 `--input-file`；新增 Git 身份预检供 `init`/`start` 在写入或建树前使用。

### 失败处理

- cwd 预检、恢复记录复制、worktree/本机目录删除或分支删除失败时返回非零 `ok:false`，不返回放弃成功结果；恢复记录和分支保留供重试。
- 恢复记录复制失败时在任何删除前停止；清理成功后随 `.tiller/local/<id>/` 删除。用户手工删除恢复记录时产品不伪造共享记录。
- Windows 含 NUL、换行或无法安全表达的控制字符继续以 `VERIFY_COMMAND_UNSUPPORTED` 拒绝。
- Git 身份缺失时在创建目录、worktree、分支或提交前以 `GIT_IDENTITY_MISSING` 失败，并给出全局设置命令。

### 取舍

- 不尝试释放父 shell cwd，也不把 EBUSY 当成功；先拒绝、保留记录、再重试比半删后丢记录更可恢复。
- 恢复记录放本机任务目录，避免重新引入 primary abandon 种子或提交；成功即删除，不成为共享历史。
- PR 历史验证选择省略而不是逐条复杂标注时效，确保旧失败不会混作当前有效。
- 本包不处理 Gradle 启动（NEW-03），避免扩大范围。

### 影响与风险

- 影响 `src/task-worktrees.ts`、`src/project-root.ts`、`src/flow.ts`、`src/test-output.ts`、`src/pr.ts`、`src/cases.ts`、`src/cli.ts`、初始化/Git 身份入口及相关 CASE/测试。
- abandon 从 worktree 内自动切出收紧为调用方先切出再重试，旧 CASE-317 预期需同步更新；这是父进程句柄不能被子进程释放的契约修正。
- 恢复记录依赖 `.tiller/local/<id>/` 可写；若该目录本身不可写，失败在删除前停止，原任务记录仍在 worktree。

### 验证入口

- `test/task-worktrees.test.mjs` 的 CASE-317、CASE-322、CASE-355、CASE-356。
- `test/windows-fresh-hygiene.test.mjs` 的 CASE-352。
- `test/flow-cli.test.mjs`、`test/pr.test.mjs`、`test/review-release.test.mjs`、`test/init-baseline.test.mjs` 的 CASE-357 至 CASE-361。
- 最后执行 `npm test`、`npm run lint`、`npm run typecheck`。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-29T16:14:55.768Z | 116989034a42 | — |
| 设计 | ChukiChen | 2026-10-29T16:14:55.900Z | b37cd0ad3e95 | — |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"86352ab6dfd975f529c6fe576b058bff0d37e5b2de8e658250b846ec466c9be8","commit":"116989034a4281c54bb340638e4dda0aaf3e9225","by":"ChukiChen","quote":"","at":"2026-10-29T16:14:55.768Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"c2c661b04f4dfc4b918ff4a2fd162357bd08e9e94a2da90672b905b9b0c2a16d","commit":"b37cd0ad3e956adb9757a25e4c6ae2f140fa4615","by":"ChukiChen","quote":"","at":"2026-10-29T16:14:55.900Z"} -->

## 验证

### run-1
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-362 init and start reject missing Git identity before writes$' \u002d\u002dtest-reporter=./.tiller/local/verify-xZWtHv/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-xZWtHv/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"43f3032a49bc88eb7ddc31ff356329cf3c947f274c190e5c14d36e513ddfba90","commit":"a94ef2fd18cbeb4e5b7717397bb8757bfa53df58"} -->
- 条件：AC-6
- 测试：test/init-baseline.test.mjs::CASE-362 init and start reject missing Git identity before writes
- 用例：无
- 结果：passed
- 来源：executed
- 核实：未核实
- 预期：失败先行
- 基线提交：5117725a085f79a425c23dc568c256b2ec337002
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-3.log
- 提交：a94ef2fd18cb
- 时间：2026-10-29T14:28:04.087Z

### run-2
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-362 init and start reject missing Git identity before writes$' \u002d\u002dtest-reporter=./.tiller/local/verify-yjuqmo/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-yjuqmo/report.jsonl test/init-baseline.test.mjs","exitCode":1,"tree":"4641c421f6a6cd977e2fdc7d2558bdc5da842c6d8dca84d6fe71fb41ae674d41","commit":"a94ef2fd18cbeb4e5b7717397bb8757bfa53df58"} -->
- 条件：AC-6
- 测试：test/init-baseline.test.mjs::CASE-362 init and start reject missing Git identity before writes
- 用例：CASE-362
- 结果：failed
- 来源：executed
- 核实：已核实
- 预期：失败先行
- 基线提交：5117725a085f79a425c23dc568c256b2ec337002
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-4.log
- 提交：a94ef2fd18cb
- 时间：2026-10-29T14:32:32.471Z

### run-3
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-355 CASE-356 abandon 清理中途失败保留恢复记录并可重试$' \u002d\u002dtest-reporter=./.tiller/local/verify-EZe6tc/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-EZe6tc/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-355 CASE-356 abandon 清理中途失败保留恢复记录并可重试
- 用例：CASE-355, CASE-356
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-5.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:16.612Z

### run-4
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 CASE-356 accepted abandon from a worktree subdirectory rejects before cleanup and succeeds after retry from primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-6mabiT/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6mabiT/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-1
- 测试：test/task-worktrees.test.mjs::CASE-317 CASE-356 accepted abandon from a worktree subdirectory rejects before cleanup and succeeds after retry from primary
- 用例：CASE-317, CASE-356
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-6.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:19.433Z

### run-5
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-317 CASE-356 accepted abandon from a worktree subdirectory rejects before cleanup and succeeds after retry from primary$' \u002d\u002dtest-reporter=./.tiller/local/verify-6mabiT/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-6mabiT/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-317 CASE-356 accepted abandon from a worktree subdirectory rejects before cleanup and succeeds after retry from primary
- 用例：CASE-317, CASE-356
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-6.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:19.433Z

### run-6
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-322 accepted but unmerged task abandons from primary by cleaning only local facts$' \u002d\u002dtest-reporter=./.tiller/local/verify-usD9Hl/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-usD9Hl/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-3
- 测试：test/task-worktrees.test.mjs::CASE-322 accepted but unmerged task abandons from primary by cleaning only local facts
- 用例：CASE-322
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-7.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:22.188Z

### run-7
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-352 CASE-357 Windows cmd invocation keeps one outer command layer and exact Maven argv$' \u002d\u002dtest-reporter=./.tiller/local/verify-zNMl6u/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-zNMl6u/report.jsonl test/windows-fresh-hygiene.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-2
- 测试：test/windows-fresh-hygiene.test.mjs::CASE-352 CASE-357 Windows cmd invocation keeps one outer command layer and exact Maven argv
- 用例：CASE-352, CASE-357
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-8.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:24.671Z

### run-8
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-358 check is read-only for task\\.md and the working tree$' \u002d\u002dtest-reporter=./.tiller/local/verify-0f9fY3/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-0f9fY3/report.jsonl test/flow-cli.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-4
- 测试：test/flow-cli.test.mjs::CASE-358 check is read-only for task.md and the working tree
- 用例：CASE-358
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-9.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:25.491Z

### run-9
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-359 verify numbers after the maximum run and PR marks only the current result$' \u002d\u002dtest-reporter=./.tiller/local/verify-mwAe8S/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-mwAe8S/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-5
- 测试：test/pr.test.mjs::CASE-359 verify numbers after the maximum run and PR marks only the current result
- 用例：CASE-359
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-10.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:27.152Z

### run-10
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-360 specs-only scope prefers specs and allows an explicit module override$' \u002d\u002dtest-reporter=./.tiller/local/verify-ruMZdc/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ruMZdc/report.jsonl test/pr.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-6
- 测试：test/pr.test.mjs::CASE-360 specs-only scope prefers specs and allows an explicit module override
- 用例：CASE-360
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-11.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:29.795Z

### run-11
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-361 case add \u002d\u002dinput-file preserves literal double quotes without subcommand confusion$' \u002d\u002dtest-reporter=./.tiller/local/verify-P1mbOr/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-P1mbOr/report.jsonl test/task-worktrees.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-6
- 测试：test/task-worktrees.test.mjs::CASE-361 case add --input-file preserves literal double quotes without subcommand confusion
- 用例：CASE-361
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-12.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:32.460Z

### run-12
<!-- tiller-verify:v1 {"command":"node '\u002d\u002dtest-name-pattern=^CASE-362 init and start reject missing Git identity before writes$' \u002d\u002dtest-reporter=./.tiller/local/verify-ClSJmR/reporter.mjs \u002d\u002dtest-reporter-destination=.tiller/local/verify-ClSJmR/report.jsonl test/init-baseline.test.mjs","exitCode":0,"tree":"fab198e85bdc85bab4eb5da20a0e03dc91b70c06e256233a41517ad4e27c853c","commit":"116989034a4281c54bb340638e4dda0aaf3e9225"} -->
- 条件：AC-6
- 测试：test/init-baseline.test.mjs::CASE-362 init and start reject missing Git identity before writes
- 用例：CASE-362
- 结果：passed
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/20261029-fix-abandon-parent-cwd-pack/logs/run-13.log
- 提交：116989034a42
- 时间：2026-10-29T16:14:33.960Z

## 自检

交付前运行 check；验收后运行 accept。
