# Windows 与 fresh clone 初始化卫生设计

## 使用场景

本设计回应 Windows 提交与检出、fresh clone 初始化证明、Windows runner 启动和不可达 origin 预检四个稳定缺陷。需求见 [`windows-fresh-hygiene.md`](windows-fresh-hygiene.md)。

## 方案

### 1. 确认摘要统一换行

在 `flow.ts` 增加单一正文归一函数，只执行 `\r\n?` → `\n` 和首尾 `trim()`。`designSubject` 使用该函数；`deliverySubject` 复用同一设计摘要，而不是再次读取原始正文。需求摘要现有的空白归一和 AC 文本归一保持不变。

所有确认入口继续比较 subject，不新增确认字段或版本。测试覆盖 LF、CRLF、孤立 CR 得到同一 subject，同时覆盖内容变化仍改变 subject；端到端用例在 `core.autocrlf` 下完成确认、合入模拟与 primary close/resume。

### 2. fresh clone 的提交绑定证明

`project.json` 继续只含 `initBaseline.id/branch/commit`。`proveInitBaselineMerged` 增加一个平台证明分支，并由 `src/platform-api.ts` 暴露“按初始化基线查找唯一 merged PR/MR”的查询：

1. 仍先判 `baseline.commit` 是否为当前 HEAD 祖先，并读取与 commit 绑定的 local merged marker。
2. 有本机 expected head 时沿用现有精确 `head.sha` 查询。
3. 无本机 expected head 时，按 `baseline.branch` 查询所有 merged PR/MR；逐个读取其提交列表，只保留包含 `baseline.commit` 的候选。
4. 候选恰为一个时，记录其 head SHA 并写 local merged marker；零个、多个、API 失败或提交列表不完整时返回 pending。
5. `start`、`status`、`doctor`、`close <init-id>` 继续调用同一函数，禁止在调用方各自补兜底。

GitHub 使用 PR commits 列表，GitLab 使用 MR commits 列表。提交列表只用于绑定本次 init 的基线提交，不按标题、分支名或初始化编号单独放行。该方案避免把自身最终提交 SHA 写进同一个 tracked 文件，也避免合入后为回写 head 再生成额外提交；代价是 fresh clone 证明需要一次 token 认证的平台查询，离线 fresh clone 仍保持 pending，除非 ancestor 已成立。

### 3. Windows 命令启动适配

`src/test-output.ts` 的 `TestRunCommand` 描述逻辑工具与参数；实际执行统一经一个平台适配器。Windows 对 `.cmd`/`.bat` 入口使用 `ComSpec` 命令解释器，POSIX 直接执行。适配器集中处理参数引用，不把可执行与参数拼成任意 shell 字符串。Maven 映射到 `mvn.cmd`，Gradle 映射到 `gradle.bat`，pytest 映射到 `pytest.exe`；node-test 继续直接使用当前 Node。

`flow.ts` 的 `runProcess`、prepare 命令和适配器执行都走同一启动函数，保留 cwd、环境、超时、stdout/stderr 捕获与退出码语义。`caseSkeleton` 生成带 `process.platform === 'win32'` 分支的骨架，并提示真实选择器仍由工程补齐。`.tiller/run.cjs`、`scripts/package-smoke.mjs` 与 `test/helpers.mjs` 改用 Node 的文件描述符或内存捕获，不依赖 `/bin/sh`。

工具缺失仍是明确失败；Windows 启动分支只改变解析与调用方式，不改变私有报告匹配、失败或跳过判定。

### 4. origin 活性预检与失败边界

在 `assertInitEnvironment` 完成 origin 解析和 token 读取后、`initialize` 创建任何目标产物前，增加 `assertOriginReachable`：

- 使用只读 `git ls-remote --heads <remote>`，设置有限超时、`GIT_TERMINAL_PROMPT=0`，错误重定向而不回显 token。
- HTTPS 复用 tokenized extra-header 方式；SSH 使用 `BatchMode=yes` 与连接超时。
- 失败统一映射为 `INIT_PREFLIGHT_REMOTE_UNREACHABLE`，给出 origin、网络、认证与 `git ls-remote` 自检指引。
- `init` 与 `init --apply` 在进入默认 init 之前都经过该路径；没有 Git HEAD 的本地降级路径不要求远活性。

预检失败发生在 `mkdir`、锁、worktree、分支和文件事务之前，因此无需回滚；写入后的远端失败仍按既有初始化清理与事务恢复处理。测试用 `example.invalid` 和关闭端口验证无目标目录、`.tiller/local/<init-id>`、初始化分支、提交及 primary 受管文件。

## 取舍

- 不把 PR head SHA 回写 `project.json`：tracked 元信息不能在同一提交中记录自身最终 SHA，额外回写提交又会在网页合入时丢失；提交列表绑定更接近不可变事实。
- 不允许仅按 branch/id/title 兜底：同日 re-init 会产生同名分支和历史 merged 记录，必须用 `baseline.commit` 唯一绑定。
- 不新增跨平台 shell 依赖：只在 Windows 对命令脚本使用系统命令解释器，其他进程继续直接启动。
- 不为预检引入平台 CLI 或自动安装依赖：keep Git/Token/API 现有边界。

## 影响与风险

- `flow.ts` 的确认摘要变化会使历史 CRLF 确认重新匹配；这是修复目标。已有 LF 行为和确认字段不变。
- `platform-api.ts` 新增查询可能增加 fresh clone 首次 `status/start` 的 API 调用；仅在 ancestor 与 local marker 不足时发生，并对失败、多个候选保守阻断。
- Windows 命令引用是本包最高风险点，需要覆盖空格、`&`、`$`、引号与工具缺失；任何不确定转义都应以拒绝或失败呈现，不能放宽为假通过。
- 预检增加网络等待，必须使用有限超时；正常本地无 HEAD 初始化和既有离线单元测试不得被迫联网。
- 跟踪字段契约、确认编号、资源版本和现有 runner 报告格式保持不变。

## 验证入口

- 摘要：小单元测试比较 LF/CRLF/CR subject；`I01` 固定 CRLF 任务经确认、合入模拟和 primary close/resume。
- fresh clone：平台 mock 返回同分支多个 merged 候选，仅一个提交列表包含 `baseline.commit`；核对 `status` 与 `start` 一致，以及零/多候选、无 token、查询失败的 pending。
- Windows：注入平台探测而非真实 Windows 主机，断言 `mvn.cmd`/`gradle.bat`/`pytest.exe` 构造、命令解释器参数和真实退出码；扫描辅助脚本不含 `/bin/sh`，并运行 PowerShell 或 Windows CI 的端到端 smoke。
- origin：`example.invalid` 与关闭端口下运行 `init`、`init --apply`，比较写入前后快照并核对稳定错误码。
- 回归：现有 `test/init-baseline.test.mjs`、`test/java-runners.test.mjs`、`test/flow-*`、`test/gap-closure.test.mjs`、`npm run test:package`；下一轮在实现前先补 CASE 与失败先行。
