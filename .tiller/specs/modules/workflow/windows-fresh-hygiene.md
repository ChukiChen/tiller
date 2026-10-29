# Windows 与 fresh clone 初始化卫生

## 使用场景

Windows 开发者以 `core.autocrlf=true` 检出工程，在确认需求或设计、合入任务后从 primary 继续收尾；新机器或 CI 从默认分支 fresh clone 后，需要直接识别初始化基线已经合入并开始任务。Java、Gradle 与 Python 工程需要由 `tiller verify` 调用真实工具；网络不可用或 origin 配置错误时，初始化必须在写盘前失败。

## 目标

- 消除 LF/CRLF 差异导致的确认摘要漂移和合入后失效。
- 让 fresh clone 在没有本机初始化标记时，能从已合入 PR/MR 重建唯一、可审计的初始化合入证明。
- 让 Windows 上的 Maven、Gradle 与 pytest 验证和 CASE 适配器调用真实工具，不因缺少 POSIX shell 或可执行后缀失败。
- 让不可达 origin 在 `init` 与 `init --apply` 的写入前被拒绝，失败不留初始化半成品。

## 业务范围

- 做：确认摘要的换行归一；初始化合入证明；Windows runner 与适配器启动；origin 活性和失败回滚；对应长期 specs、CASE 与回归测试。
- 不做：改变 `project.json` 的 `initBaseline.id/branch/commit` 字段契约；按 PR/MR 标题或仅凭同分支猜测合入；自动安装 Git、Maven、Gradle 或 pytest；引入第二套 AC 编号或升版本。
- 假设：启用 `core.autocrlf` 的缺陷场景可复现为同一正文的 CRLF/LF 变体；平台 token 与 PR/MR API 可用于合入证明；无 Git HEAD 的本地降级初始化不要求远端。

## 关键行为

### D-01 换行无关的确认摘要

- 设计确认与交付确认使用同一设计正文摘要；计算前只把 `CRLF` 和孤立 `CR` 归一为 `LF`，再按既有规则去掉首尾空白，不合并正文中的其他空白。
- 同一设计正文从 CRLF 变为 LF（或反向）时，既有需求/设计/交付确认仍有效；正文实质内容变化仍使对应确认失效。
- 需求正文与 AC 继续使用既有空白归一规则；Windows `autocrlf` 合入、primary 收尾和 `resume` 不得因换行重新要求确认。

### D-02 fresh clone 的初始化合入证明

- tracked `project.json` 的 `initBaseline` 仍只保存 `id`、`branch`、`commit`，不写 `head`、`status` 或 `headRef`，也不需要合入后再改 tracked 元信息。
- 合入证明按固定顺序进行：当前历史包含 `commit` → 与本机 expected head 绑定的 merged marker → 平台已合入记录。前三者都不成立时保持 pending。
- 平台查询先按 `baseline.branch` 缩小范围，只考虑 merged PR/MR。存在本机 expected head 时仍要求 `head.sha` 精确一致；没有本机 head 时，只接受提交列表包含 `baseline.commit` 的候选，并要求候选恰好一个。候选的 `head.sha` 作为本次发现的 expected head 写入 local marker。
- 同分支、同初始化编号或同标题本身不构成证明。无 token、API 失败、提交列表不可读、候选为零或多个时均返回 pending，不回退到标题匹配。
- `start`、`status`、`doctor` 与 `close <init-id>` 复用同一证明函数；fresh clone 中 `status` 显示 merged 与 `start` 放行必须一致。

### D-03 Windows 的真实工具启动

- Java runner 在 Windows 使用 `mvn.cmd`、`gradle.bat`（或等价的命令解释器入口），在 POSIX 保持 `mvn`、`gradle`；报告目录、测试选择器等参数继续原样传递，失败退出码原样传播。
- `pytest` 在 Windows 解析 `pytest.exe` 或可执行的 Python 模块入口，在 POSIX 保持 `pytest`；私有 JUnit XML 核实规则不变。
- `case add` 为 junit runner 生成的 Node 适配器骨架必须包含 Windows 启动分支，不得只生成裸 `spawnSync('mvn', ...)` 或 `spawnSync('gradle', ...)`；pytest 骨架仍由真实 pytest runner 执行。
- 仓库辅助脚本、打包 smoke 与测试 helper 不得写死 `/bin/sh`；捕获输出使用跨平台 Node 进程/文件能力。
- 工具缺失返回清晰的 runner 失败证据，不把适配器文件存在或占位断言当作通过。

### D-04 origin 预检验活

- 有 Git HEAD 的 `init` 在创建目标目录、锁、初始化 worktree、分支、提交或受管文件之前，先校验 Git 可执行、origin 可解析、token 存在，并对 origin 执行有超时的只读活性检查。
- 活性检查禁止交互提示；HTTPS 使用不落日志的 token 认证，SSH 使用批处理与连接超时。失败、超时或认证不通过返回稳定预检错误和修复指引，不写本次任何初始化产物。
- `init --apply` 复用同一预检路径；预检失败不得先执行默认 init、合入、close 或主分支快进。
- 写入后的其他失败继续使用事务回滚与初始化清理；错误和日志不得包含 token。

## 异常与边界

- 两段正文仅换行不同视为同一确认对象；其他字符差异不视为等价。
- fresh clone 的候选 PR/MR 无法唯一绑定到 `baseline.commit` 时保持 pending，并说明缺失证据；显式 `--skip-init-gate` 仍是唯一人工旁路。
- Windows 上不存在 `cmd.exe`、Maven/Gradle/pytest 或相应启动脚本时，验证失败并给出工具名，不静默改用其他 runner。
- origin 指向 `example.invalid`、拒绝连接或超时均视为不可达；不能因已解析出主机名而通过。
- 无 Git HEAD 的本地降级路径仍允许无 remote 初始化，但 Git 可执行校验不可绕过。

## 验收条件

- AC-1: 设计确认与交付确认摘要对 LF/CRLF/孤立 CR 等价；Windows `core.autocrlf=true` 下需求确认、设计确认、合入后 primary close 与 resume 不因换行失效，实质正文变化仍使确认失效
- AC-2: fresh clone 没有 local marker、`project.json` 的 `initBaseline` 仅含 `id/branch/commit` 时，`status` 能从唯一绑定 `baseline.commit` 的已合入 PR/MR 重建 merged 证明并允许 `start`；零个或多个候选、无 token 或 API 失败时 `status` 与 `start` 都保持 pending
- AC-3: Windows 上 `tiller verify` 对 junit-maven、junit-gradle 与 pytest 调用真实工具并核实各自默认或私有报告；junit CASE 适配器骨架包含 Windows 启动分支，辅助脚本不再依赖 `/bin/sh`
- AC-4: 有 Git HEAD 的 `init` 与 `init --apply` 在 origin 不可达（含 `example.invalid`）时于写盘前失败，不创建目标目录、本机初始化目录、分支、提交或 primary 受管文件，也不留下半成品
