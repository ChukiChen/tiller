# tiller 使用指引

安装后直接运行 PATH 中的 `tiller --help`；恢复 `tiller resume`。主路径只使用同一个 PATH CLI，不依赖 runtime bind。编号用 `YYYYMMDD-` 前缀（如 `20261023-fix`），缺则提示。

## 默认工作流

```sh
tiller start <id> --title "修复退出码" --summary "失败命令返回非零" \
  --requirement "失败时返回非零" --criterion "AC-1=失败命令返回非零" --size small --target src
tiller confirm <id> requirements
tiller case add <id> --module cli --kind interface --title "失败退出码" --expected "返回退出码 2" --spec .tiller/specs/modules/cli/requirements.md
tiller verify <id> --criterion AC-1 --case CASE-001
tiller review <id> [--blocking <发现> ...] [--resolve REV-NNN ...]
tiller release <id>
tiller check <id>
tiller accept <id> [--by "验收人"]
tiller pr <id>
tiller merge <id>
tiller close <id> --reason "已合入"
tiller doctor
```

`start` 生成需求，standard 另生成设计；worktree 在 `.tiller/local/<id>/worktrees/`，任务记录只写入该 worktree（primary 不留种子）。`--requirement` 仅短目标单行，并生成含使用场景、目标、业务范围、关键行为、异常与边界的可确认骨架；完整需求与 AC-n 用 `--requirement-file`（限 `.tiller/specs/`）且以文件为准。“验收条件”的 `- AC-n: …` 会自动导入；有 AC 可省略 `--criterion`，无 AC 仍须提供。验收条件按路径作用域用 AC-n，不写模块前缀/对照列表。`--quote` 可选，`--by` 默认取 `git config user.name`。首次 `init` → 初始化 PR/MR → 人工合入 → `start`；pending 基线须 API 证明合入，`--skip-init-gate` 例外。`specs` 经任务 worktree，随任务 PR/MR 合入；禁止默认分支直改/直推。

`review` 阻塞 `check`/`accept`；`release` 与已验收任务钉在验收提交。已验收 close 须有跟踪记录、默认历史或平台 API 的合入证明；未验收终止用 `close --abandon`，且 primary 必须已有清理后仍可读取的任务记录。只有记录仍可读取时结果才提示 `reopen`。

`standard` 须先设计确认再 `verify`（过早 verify 以 `VERIFY_BEFORE_DESIGN` 拒绝）；历史错序段用 `verify --clear-premature` 清除。确认后有未提交业务改动时，`check` 仍阻断 `accept`。

accept 须在 pr 前；`confirm`/`accept` 写入确认后自动提交本任务记录（含 acceptance），一般无需再手搓一轮；`PR_NOT_ACCEPTED`/`PR_TASK_RECORDS_DIRTY` 仍阻断未验收或未提交记录。重复 accept 重查当前树，改码先 verify。`pr <id>` 默认 tokenized git push 并经平台 API 创建真实 PR/MR；Git Data API 仅失败回退。返回 URL/编号；`--draft-only` 仅五段草稿。审阅后 `merge <id>` 经 GitHub/GitLab REST API squash 后 close；合入即交付完成。merge/close 默认删本地与远端分支，`--keep-branch` 保留；不存在/422 已清理，其它失败 warning；worktree 根先拆树并删分支。网页合入手动 close 也须先取得合入证明，证明不足时保留 worktree 与本机任务事实；abandon 无法把放弃事件持久化到 primary 时同样拒绝清理。收尾不改 `task.md`、不 materialize 未跟踪 task、不写 `.tiller/local/closed/`，仍兼容清理旧三棵树布局；合入后靠快进/pull 读已跟踪记录。

`doctor [path]` 查基线、默认分支 specs 脏改、残留任务分支，并从 active worktree 读取进行中任务检查 AC 缺口；active 分支找不到任务记录或检查失败按严重项处理。

`check` 提示过薄设计、空壳 decisions/模块设计及分支未包含任务编号；业务范围·做交付路径 warning；规格/背景未回写列路径与提纲。

## 验证

`verify` 只声明测试，由 tiller 构造并执行并读私有临时报告；stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过均不核实；`--run` 已删除。standard 必须 `--target`，small 缺省 `.`。

日志含命令、起止与退出码，写 `.tiller/local/<任务编号>/logs/run-<序号>.log`（`--verbose`）；`task.md` 留摘要，证据进旁路。`verify.prepare` 失败即止；`verify.runner` 支持 `node-test`/`junit-maven`/`junit-gradle`/`pytest`（pytest 用私有 JUnit XML）；`case add` 骨架按 runner 生成。

同一 AC/CASE 连续两次失败且无成功核实，按 FLOW-05 停止并报告现象与方案。

无法执行时用 `--reported --command ... --result ... --reason "<理由>"`；`check`/`accept` 默认阻断，仅 `--allow-reported` 放行；`pr` 标明未执行。bugfix 用 `--expect-fail --test` 在基线工作树留失败证据。

`pr` 要求验收有效且记录已提交，再生成五段说明和分支。标题摘要优先取 `pr --summary`，再取任务元数据或 feat/fix 标题；标题 `类型(模块): 中文摘要 [任务编号]`，变更内容按提交时间正序，分支 `类型/任务编号[-描述]`。默认推送并创建真实 PR/MR；`--draft-only` 才只输出草稿。

## 规划与用例

规划用 `plan start/confirm/status`，已有任务 `plan attach`；用例写 `.tiller/cases/modules/<模块>/` 或 `scenarios/`。`task → 需求`：任务挂 specs，复用同一套 AC-n，不写模块前缀或“对照”列表；`用例 → 需求`：用例挂 specs，关联 AC 固定写“无”，不写 `<任务>#AC-n`。用例写测试设计；测试名或紧邻注释引用 `CASE-NNN`。`verify --criterion <AC-N> --case CASE-NNN` 覆盖；AC 覆盖只认 verify 的 AC→测试→CASE。单任务只有 `.tiller/task/<id>/task.md`；外部仓 `.tiller/work/` 只读遗留；不提交全文快照或日志。

## 接入与升级

`init [--platform github|gitlab|both]` 只在 init worktree 写入受管产物并推送 PR/MR，primary 不预建未跟踪 `.tiller/` 种子；失败保留本机 worktree。`initBaseline` 由祖先或平台 API 确认合入，merged 记在 `.tiller/local/`（不脏跟踪的 `project.json`）；`merge <init-id>` 标记并清理，网页合入可 `close <init-id>`。平台在初始化时选定，之后不能通过 CLI 切换；需手动修改 `.tiller/project.json` 并补齐对应模板。主路径不需要自动或手动 `runtime bind`。`upgrade --adopt` 刷新未改项；兼容当前及上一资源契约。
