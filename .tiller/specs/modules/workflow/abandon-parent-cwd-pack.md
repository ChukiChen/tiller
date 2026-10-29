# 父 shell cwd 下的 abandon 可重试与流程卫生

## 使用场景

- 开发者在任务 worktree 或其子目录中启动 shell，随后试图用 `tiller close <id> --abandon` 取消任务。子进程无法释放调用方父 shell 持有的目录句柄，破坏性清理不能假装成功。
- Windows 上的 `cmd /c` 启动 Maven/Gradle 等批处理命令时，引号和外层命令层必须保持参数边界，不能把 `$HOME`、`&` 或含空格参数拆成残片。
- 测试夹具需要从 worktree 子目录真实执行 CLI，以便区分产品 cwd 行为与夹具覆盖 cwd 造成的假绿或 EBUSY。
- 只读检查与 PR 生成应呈现稳定、可复核的结果，不应反向弄脏任务记录或把历史失败混作当前证据。
- 初始化、任务创建和规格类任务需要在缺少 Git 身份、模块推断或含引号输入时给出可执行错误。

## 目标

1. `close --abandon` 在调用方 cwd 占用待删任务路径时先明确拒绝，保留任务记录和清理状态；解除占用后可从 primary 重试并完成清理。
2. 修复 Windows `cmd /c` 命令封装，保持可执行文件与每个参数的真实边界。
3. 修正测试 helper 的 cwd 覆盖，并让 CASE-317/322 在真实子目录语义下可重复通过或明确暴露产品缺陷。
4. `check` 保持只读；验证编号按已有最大值递增；PR 描述只把当前有效验证标为当前。
5. specs 范围任务的 PR 标题不误推业务模块；`case add` 支持含字面双引号输入；`init`/`start` 在需要提交前预检 Git 身份。

## 业务范围

- 做：父 cwd 预检、可恢复清理状态、失败后重试、Windows 命令封装、测试 helper/cwd、check 只读、verify 编号、PR 验证呈现、specs 模块推断、case 输入文件、Git 身份预检，以及对应 specs/CASE/测试/使用说明。
- 不做：忽略 EBUSY 并继续宣称成功；重新引入 `persistAbandonedTask` 或把 abandon 记录写入 primary `task.md`；修改 Gradle 启动（NEW-03）；合入本任务 PR。
- 假设与待确认：调用方 cwd 由启动 CLI 的进程 `process.cwd()` 可观测；父 shell 自身持有的句柄只能由调用方先切出目录解除。

## 关键行为

### AC-PACK-1 父 cwd 预检与可重试清理

- 删除 worktree、`.tiller/local/<id>/` 或任务分支前，若当前进程 cwd 位于待删 worktree 或任务本机树内，`close --abandon` 不得开始半删；返回非零、`ok:false` 和明确错误，指引先切到 primary/主仓再重试，保留任务记录。
- 清理已开始后任一 worktree、本机目录或任务分支步骤失败时，失败结果不得删除唯一的任务记录；恢复记录保存在 `.tiller/local/<id>/` 的明确本机恢复路径中，供再次 `close --abandon` 读取。
- 从 primary 再次执行 `close --abandon` 能继续幂等清理；成功时 worktree、任务本机树与任务分支均消失，仍不写 primary `task.md`/CASE，也不产生 abandon 提交。
- 成功路径不保留恢复目录、任务记录或 `persistAbandonedTask` 式持久化痕迹。

### AC-PACK-2 Windows cmd 引号

- `.cmd`/`.bat` 通过 `ComSpec /d /s /c` 启动时，外层命令只保留一层，可执行文件与每个参数使用可被 cmd 还原的引用/元字符转义。
- 含空格、`&`、`$HOME` 或字面双引号的参数不得在命令串中形成未闭合引号或 `'b" "$HOME""'` 一类残片。
- Linux/macOS 非 Windows 路径保持原 argv，不引入 shell 依赖。

### AC-PACK-3 helper cwd 与 CASE-317/322

- `test/helpers.mjs` 的 `cli(cwd, ...)` 必须在传入 cwd 执行；带任务 id 时只能镜像夹具文件或查找任务记录，不得静默把 cwd 改成 worktree 根。
- CASE-317/322 在修正后的 helper 下从真实 nested cwd 验证：占用目录先明确拒绝，切回 primary 后可成功清理；不得以夹具覆盖 cwd 制造假绿。
- 若 nested 复跑仍暴露产品删除 EBUSY，修复产品删除路径；不得靠吞掉错误或延长无限重试通过。

### AC-PACK-4 check 只读

- `tiller check` 不得修改 `task.md`，也不得使工作区出现本任务记录或 specs/CASE 的额外脏改。
- 检查结果只通过命令输出返回；临时锁或报告只可写入已声明的本机非跟踪路径，并在输出说明其性质。

### AC-PACK-5 verify 编号与 PR 当前有效

- 新增验证段编号按 task.md 已有 `run-N` 最大序号递增；不得复用已存在的 `run-N` 标题绑定不同提交。
- PR 描述只把当前有效验证标为「当前有效」；历史 failed、旧提交或失效结果须省略或放入明确的历史小节，不得全部混在「当前有效」下。

### AC-PACK-6 specs 标题、case 输入与 Git 身份

- 任务范围仅指向 `.tiller/specs`/`.tiller/cases` 等规格资料时，PR 模块/标题倾向 `specs`；显式模块仍可覆盖。不得因正文提到某业务模块而误推 `feat(greeting)`。
- `case add` 支持含字面双引号的文本，至少可通过 `--input-file` 读取；解析/校验错误不得把后续参数误报成子命令。
- `init`/`start` 在可能自动提交前预检 `user.name` 与 `user.email`；缺失时返回明确错误并给出 `git config --global user.name/user.email` 设置命令。

## 异常与边界

- 父 cwd 位于待删路径时，唯一正确恢复动作是调用方先 `cd` 到 primary 再重试；产品不得尝试强行删除父进程占用的目录。
- 恢复记录仅存在于本机 `.tiller/local/<id>/`，不是共享事实源，不提交、不写 primary 任务种子；成功清理后一起删除。
- 清理失败后不得返回 `stage` 已放弃或成功结果；错误码继续使用 `TASK_CLEANUP_FAILED`，错误文案列出仍占用路径与重试命令。
- Windows 不支持的控制字符或无法安全表达的参数继续明确拒绝；不得静默降级为 POSIX shell。
- Git 身份缺失时不得创建 worktree、分支、提交或初始化受管文件；不得用 tiller 假身份掩盖用户配置错误。
- `check` 的只读不改变已有验证/确认判定；显式 `verify`、`confirm`、`accept` 等写命令仍按原契约更新记录。

## 验收条件

- AC-1: 父 shell/调用方 cwd 位于待删 worktree 或 `.tiller/local/<id>` 树内时，`close --abandon` 在破坏性清理前非零失败并明确提示先切到 primary；任务记录仍在。清理已开始后失败的 worktree/本机目录/分支任一环节保留可读恢复记录与状态，再次从 primary 执行可继续清理；成功路径完整删除 worktree、任务本机树与任务分支，不写 primary task.md/CASE、不产生 abandon 提交
- AC-2: Windows `.cmd`/`.bat` 的 `cmd /c` 外层拼接与引号转义保持可执行文件及每个参数的精确边界，含空格、`&`、`$HOME` 和字面双引号的参数不产生 `'b" "$HOME""'` 等残片；Linux 回归不破
- AC-3: `test/helpers.mjs` 的 `cli(cwd, ...)` 尊重传入 cwd（含 nested），带任务 id 时不得静默改回 worktree 根；CASE-317/322 在真实 nested 语义下复跑，夹具问题修夹具，仍暴露的 EBUSY 产品缺陷一并修复，不得以假绿通过
- AC-4: `tiller check` 不修改 `task.md`，不弄脏工作区；结果通过输出返回，本机临时状态（如有）位于非跟踪路径并明确说明
- AC-5: 新增验证段 `run-N` 按 task.md 已有最大序号递增且不重复；PR 描述只把当前有效验证标为「当前有效」，历史 failed/旧结果省略或单列历史，不混作当前
- AC-6: 范围仅指向 specs/cases 的任务 PR 模块/标题倾向 `specs` 且不因正文误推业务模块；`case add` 支持含字面双引号文本（含 `--input-file`）且错误不误导为子命令；`init`/`start` 在自动提交前预检 Git `user.name`/`user.email`，缺失时给出设置命令
