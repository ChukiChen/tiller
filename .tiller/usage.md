# tiller 使用指引

运行 `node .tiller/run.cjs --help`；恢复用 `node .tiller/run.cjs resume`。编号用 `YYYYMMDD-` 前缀，缺少时 `start`/`plan start` 提示但不改写。

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
# 提交含 acceptance 的任务记录
node .tiller/run.cjs pr <id>
# 合入后只清理本机
node .tiller/run.cjs close <id> --reason "已合入"
```

`start` 生成需求与 worktree（standard 另生成设计）；`.tiller/local/<id>/`：project 用 `worktrees/`，workspace 含 `management`/登记路径。`--requirement`/`--requirement-file <路径>` 二选一；`--quote` 可选，`--by` 默认取 `git config user.name`。

`review` 阻塞 `check`/`accept`；`release` 与已验收任务钉在验收提交。未验收终止用 `close --abandon` 并写共享放弃记录；再次交付需 `reopen`，追加重开事件、重新推导阶段。

standard 设计确认前 verify 或确认后业务改动未提交时，`check` 阻断 `accept`；`verify` 本身不要求设计确认。

accept 必须在 pr 前。`verify`/`check` 或 cases/specs 回写后，先提交验证记录，再 `accept` 并提交任务记录（含 acceptance），最后 `pr`。无有效验收以 `PR_NOT_ACCEPTED` 阻断；记录未提交以 `PR_TASK_RECORDS_DIRTY` 阻断。合入即交付完成；合入后 `close` 只清 local（兼容清理旧布局）、不改共享 `task.md`，不再补 `accept` 或收尾提交。

`check` 对过薄设计、空壳 decisions/模块设计、分支未包含任务编号；规格/背景未回写列路径与提纲 warning。`verify` 日志含命令、起止和退出码。

## 验证

`verify` 只声明测试，由 tiller 构造并执行；只读私有临时报告，stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过不核实；引用文件须全通过。`--run` 已删除。standard 必须声明 `--target`，small 缺省 `.`。

日志在 `.tiller/local/<任务编号>/logs/run-<序号>.log`，支持 `--verbose`；`task.md` 留摘要，证据进旁路。`verify.prepare` 失败即失败；`verify.runner` 支持 `node-test`、`junit-maven`、`junit-gradle`、`pytest`。pytest 从私有 JUnit XML 核实；`case add` 骨架随当前 runner 生成。

同一 AC/CASE 连续两次失败且无成功核实，`verify`/`check` 按 FLOW-05 停止重试，报告现象、尝试、证据和 2～3 个方案；成功核实清零。

无法执行时用 `--reported --command ... --result ... --reason "<理由>"`；`check`/`accept` 默认阻断外部报告，仅 `--allow-reported` 放行，`pr` 标明未执行。bugfix 用 `--expect-fail --test` 在基线工作树留失败证据并保留当前通过。

`pr` 要求验收有效、记录已提交，再生成五段说明和分支。标题摘要优先取 `pr --summary`，再取任务元数据或最早规范 feat/fix 提交摘要；模块取范围首个。标题用 `类型(模块): 中文摘要` 加 `[任务编号]`，变更内容按提交时间正序，分支 `类型/任务编号[-描述]`，不联网。

## 规划与用例

```sh
node .tiller/run.cjs plan start 20261023-batch --title "第一批" --goal "接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-"
node .tiller/run.cjs start 20261023-onboarding --plan 20261023-batch --item P-1 --title "接入" --requirement "完成最小接入" --criterion "AC-1=接入可用"
node .tiller/run.cjs plan attach 20261023-closed-task --plan 20261023-batch --item P-1
```

`plan confirm/status` 确认拆分，依赖未验收阻塞；`plan attach` 补挂任务，不改确认。用例写 `.tiller/cases/modules/<模块>/`，场景写 `scenarios/`。

`case add` 写清前置条件、步骤、输入、预期、类型、优先级、来源。测试名/紧邻注释引用 `CASE-NNN`，自动扫描反查；无引用待实现。`verify --case CASE-NNN` 执行覆盖。单任务只有 `.tiller/task/<id>/task.md`；外部仓 `.tiller/work/` 只读遗留。原始输出写 `.tiller/local/<id>/logs/`，不提交全文快照或日志。

## 接入与升级

`init [--platform github|gitlab|both]` 只补缺失骨架，不覆盖文件，按平台生成 PR/MR 模板；检测 pytest 配置或布局时选用。平台在初始化时选定，之后不能通过 CLI 切换，需手动修改 `.tiller/project.json` 并补齐对应模板。`upgrade` 只刷新未修改文件；`--adopt <受管文件>` 保留内容并更新摘要。兼容当前及上一资源契约，版本号仅正式发布修改。受管入口未入 Git 时，`check` 警告，`release` 阻断。
