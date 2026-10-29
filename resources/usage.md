# tiller 使用指引

用 PATH 中的 `tiller --help` 或 `tiller resume`；编号用 `YYYYMMDD-` 前缀（如 `20261023-fix`），缺日期提示。

## 默认工作流

```sh
tiller start <id> --title "修复退出码" --summary "失败命令返回非零" \
  --requirement "失败时返回非零" --criterion "AC-1=失败命令返回非零" --size small --target src
tiller confirm <id> requirements
tiller case add <id> --module cli --kind interface --title "失败" --expected "返回 2" --spec <specs.md>
tiller verify <id> --criterion AC-1 --case CASE-001
tiller review <id> [--blocking ...] [--resolve REV-NNN ...]
tiller release <id>
tiller check <id>
tiller accept <id> [--by "验收人"]
tiller pr <id>
tiller merge <id>
tiller close <id> --reason "已合入"
tiller doctor
```

`start` 生成需求，standard 另生成设计；记录只写 `.tiller/local/<id>/worktrees/`。完整需求/AC-n 用 `--requirement-file`（限 `.tiller/specs/`）。有 AC 可省略 `--criterion`，无则必填；验收条件按路径作用域用 AC-n。验收点变更先回写 specs，否则阻断。`--quote` 可选，`--by` 默认取 `git config user.name`。`init` → 初始化 PR/MR → 人工合入 → `start`；pending 基线须匹配 expected tip 与 merged PR/MR（`--skip-init-gate` 例外）。`specs` 经任务 worktree，随任务 PR/MR 合入；禁止默认分支直改/直推。

`review` 阻塞 `check`/`accept`；`release` 与已验收任务钉在验收提交。未合入任务终止用 `close --abandon`，只清本机、不留共享记录，再重新 `start`；历史记录仍可 `reopen`。cwd 在任务树内时先失败，并在 `.tiller/local/<id>/recovery/` 留记录；`cd` 到 primary 后重试。清理中失败不得假成功或丢记录，也不写 primary `task.md` 或产生 abandon 提交。

`standard` 须先设计确认再 `verify`（过早 verify 以 `VERIFY_BEFORE_DESIGN` 拒绝）；历史错序段用 `verify --clear-premature` 清除。确认后有未提交业务改动时，`check` 仍阻断 `accept`。

accept 须在 pr 前；`confirm`/`accept` 后自动提交本任务记录（含 acceptance）。`PR_NOT_ACCEPTED`/`PR_TASK_RECORDS_DIRTY` 阻断未验收或未提交记录；重复 accept 重查当前树，改码先 verify。`pr <id>` 默认 tokenized push，经平台 API 建真实 PR/MR；`--draft-only` 仅草稿。审阅后 `merge <id>` 经 GitHub/GitLab REST API squash 后 close；合入即交付完成。merge/close 默认删本地与远端分支，`--keep-branch` 保留；不存在/422 已清理，其它失败 warning。网页合入手动 close，失败不清理；收尾不改 `task.md`、不 materialize 未跟踪 task，只清 `.tiller/local/<id>/` 与分支。

`doctor [path]` 查基线、默认分支 specs 脏改、残留任务分支与 AC 缺口；严重失败。

`check` 只读：不改 `task.md`、不弄脏工作区，结果只走输出；提示过薄设计、空壳 decisions/模块设计、分支未包含任务编号，业务范围·做交付路径 warning。

## 验证

`verify` 只声明测试，由 tiller 构造并执行并读私有临时报告；stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过均不核实。

日志含命令、起止、退出码，写 `.tiller/local/<任务编号>/logs/run-<序号>.log`（`--verbose`）；`task.md` 只留摘要。`verify.prepare` 失败即止；`verify.runner` 支持 `node-test`/`junit-maven`/`junit-gradle`/`pytest`；Maven 读默认 Surefire，Gradle/pytest 用私有报告。`case add` 对 junit 生成 Node 适配器骨架，转调真实 runner。

同一 AC/CASE 连续两次失败且无成功核实，按 FLOW-05 停止并报告现象与方案。新验证段按已有 `run-N` 最大值递增；`pr` 只列当前有效，历史 failed 或旧提交不混入。

无法执行时用 `--reported --command ... --result ... --reason "<理由>"`；`check`/`accept` 默认阻断，仅 `--allow-reported` 放行；`pr` 标明未执行。bugfix 用 `--expect-fail --test` 在基线工作树留失败证据。

`pr` 要求验收有效且记录已提交。标题摘要优先取 `pr --summary`，再取元数据或提交标题；标题 `类型(模块): 中文摘要 [任务编号]`，变更内容按提交时间正序，分支 `类型/任务编号[-描述]`。specs/cases-only 默认模块 `specs`，`--module` 可覆盖；默认推送并创建真实 PR/MR，`--draft-only` 仅草稿。

## 规划与用例

规划用 `plan start/confirm/status`，已有任务 `plan attach`；用例写 `.tiller/cases/modules/<模块>/` 或 `scenarios/`。`task → 需求`：任务挂 specs 复用 AC-n；`用例 → 需求`：`case add --criterion AC-n`（可重复）登记 specs 验收条件，不写任务锚；历史“无”与 `task#AC` 只读。测试名或紧邻注释引用 `CASE-NNN`；`verify --criterion <AC-N> --case CASE-NNN` 覆盖，AC 覆盖只认 AC→测试→CASE。`case add --input-file <工程内文件>` 可重复读取 UTF-8，保留字面双引号；缺失报 `CASE_INPUT_FILE_NOT_FOUND`。单任务只有 `.tiller/task/<id>/task.md`；外部仓 `.tiller/work/` 只读遗留；不提交全文快照或日志。

## 接入与升级

`init [--platform github|gitlab|both]` 创建目标前预检 Git、`user.name`/`user.email`、origin 与 token；失败给指引且不写盘，`--apply` 同路径。`start` 也在建树前预检身份，缺失提示 `git config --global user.name/user.email`。成功只写 init worktree/PR/MR，primary 无 `.tiller/` 残留。`.tiller/local/<init-id>/` 记 expected tip；`initBaseline` 由祖先或平台 API 按同 head 确认，effective 经 local marker 与 CLI 输出；`merge <init-id>` 写 marker 并清理，网页合入用 `close <init-id>`。平台在初始化时选定，之后不能通过 CLI 切换；需手动修改 `.tiller/project.json` 并补齐对应模板；主路径用 PATH 中的 `tiller`。`upgrade --adopt` 刷新未改项；兼容当前及上一资源契约。
