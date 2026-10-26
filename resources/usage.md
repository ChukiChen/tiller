# tiller 使用指引

运行 `node .tiller/run.cjs --help`；恢复 `node .tiller/run.cjs resume`。编号用 `YYYYMMDD-` 前缀（如 `20261023-fix`），缺少时只提示。

## 默认工作流

```sh
node .tiller/run.cjs start <id> --title "修复退出码" --summary "失败命令返回非零" \
  --requirement "失败时返回非零" --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm <id> requirements
node .tiller/run.cjs case add <id> --module cli --kind interface --title "失败退出码" --expected "返回退出码 2" --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify <id> --case CASE-001
node .tiller/run.cjs verify <id> --criterion AC-1 --test "test/cli.test.mjs::CASE-001 失败退出码"
node .tiller/run.cjs review <id> [--blocking <发现> ...] [--resolve REV-NNN ...]
node .tiller/run.cjs release <id>
node .tiller/run.cjs check <id>
node .tiller/run.cjs accept <id> [--by "验收人"]
# 提交任务记录（含 acceptance）
node .tiller/run.cjs pr <id>
node .tiller/run.cjs merge <id>
# 网页合入后只清理本机
node .tiller/run.cjs close <id> --reason "已合入"
```

`start` 生成需求/worktree（standard 另生成设计）；`.tiller/local/<id>/`：project 用 `worktrees/`，workspace 含 `management`/登记路径。`--requirement`/`--requirement-file <路径>` 二选一；`--quote` 可选，`--by` 默认取 `git config user.name`。首次 `init` → 初始化 PR/MR → 人工合入 → `start`；未合入默认阻断，`--skip-init-gate` 例外；`specs` 在任务 worktree 修改并随分支合入。

`review` 阻塞 `check`/`accept`；`release` 与已验收任务钉在验收提交。未验收终止用 `close --abandon` 并写放弃；再次交付先 `reopen` 重新推导阶段。

standard 设计确认前 verify 或确认后业务改动未提交时，`check` 阻断 `accept`；`verify` 本身不要求设计确认。

accept 须在 pr 前；回写后先提交验证记录，再 `accept` 并提交任务记录（含 acceptance），最后 `pr`。`PR_NOT_ACCEPTED` 与 `PR_TASK_RECORDS_DIRTY` 分别阻断；合入即交付完成。`merge <id>` 通过 GitHub/GitLab REST API 以 squash 合入，成功后自动 `close`；合入后 `close` 只清 local（兼容清理旧布局）、不改 `task.md`，失败不清理，网页合入仍需手动 `close`。

`check` 对过薄设计、空壳 decisions/模块设计、分支未包含任务编号；规格/背景未回写列路径与提纲。`verify` 日志含命令、起止、退出码。

## 验证

`verify` 只声明测试，由 tiller 构造并执行；只读私有临时报告，stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过不核实；`--run` 已删除。standard 必须声明 `--target`，small 缺省 `.`。

日志写 `.tiller/local/<任务编号>/logs/run-<序号>.log`（`--verbose`）；`task.md` 留摘要，证据进旁路。`verify.prepare` 失败即止；`verify.runner` 支持 `node-test`、`junit-maven`、`junit-gradle`、`pytest`，pytest 用私有 JUnit XML；`case add` 骨架按 runner 生成。

同一 AC/CASE 连续两次失败且无成功核实，`verify`/`check` 按 FLOW-05 停止重试，报告现象、尝试、证据和 2～3 个方案。

无法执行时用 `--reported --command ... --result ... --reason "<理由>"`；`check`/`accept` 默认阻断外部报告，仅 `--allow-reported` 放行，`pr` 标明未执行。bugfix 用 `--expect-fail --test` 在基线工作树留失败证据并保留当前通过。

`pr` 要求验收有效、记录已提交，再生成五段说明和分支。标题摘要优先取 `pr --summary`，再取任务元数据或 feat/fix 标题；模块取范围首个。标题为 `类型(模块): 中文摘要 [任务编号]`，变更内容按提交时间正序，分支 `类型/任务编号[-描述]`，不联网。

## 规划与用例

规划用 `plan start/confirm/status`；已有任务用 `plan attach` 补挂。参数见 `node .tiller/run.cjs --help`。用例写 `.tiller/cases/modules/<模块>/`，场景写 `scenarios/`。

`case add` 写清前置、步骤、输入、预期、类型、优先级与来源；测试名或紧邻注释引用 `CASE-NNN`，无引用待实现，`verify --case` 执行覆盖。单任务只有 `.tiller/task/<id>/task.md`；外部仓 `.tiller/work/` 只读遗留；输出写 local logs，不提交全文快照或日志。

## 接入与升级

`init [--platform github|gitlab|both]` 有 HEAD 时另建 `chore/tiller-init` worktree，经平台 API 与 token 推送并创建 PR/MR，创建走 REST API；失败保留本机与 token/API 下一步。Token 读自 `GITHUB_TOKEN`/`GH_TOKEN` 或 `GITLAB_TOKEN`/`GL_TOKEN`，不写记录。`initBaseline` 判定合入；`merge <init-id>` 成功后标记 merged 并清理该 local，网页合入则需手动 `close <init-id>`。平台在初始化时选定，之后不能通过 CLI 切换，需手动修改 `.tiller/project.json` 并补齐对应模板。`upgrade` 只刷新未改项，`--adopt` 更新摘要；兼容当前及上一资源契约。
