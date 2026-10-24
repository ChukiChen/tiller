# tiller 使用指引

运行 `node .tiller/run.cjs --help`；恢复用 `node .tiller/run.cjs resume`。任务/规划编号用 `YYYYMMDD-` 前缀，缺少时 `start`/`plan start` 提示但不改写。

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
node .tiller/run.cjs close <id> --reason "交付完成"
node .tiller/run.cjs pr <id>
```

`start` 生成需求/AC 与任务 worktree（standard 另生成设计）；project 用 `.tiller/local/worktrees/<id>/`，workspace 另有 `management` 与各仓库 `path`，分支为 `类型/任务编号[-描述]`。`--requirement` 与 `--requirement-file <工程内相对路径>` 二选一且非空；交付路径只进 `scope`。`--quote` 可选，`--by` 默认取 `git config user.name`；需求/设计确认独立失效。

`review` 阻塞阻断 `check`/`accept`；`release` 读验收提交与资源，已验收任务钉在验收提交。阶段由事实推导；未验收用 `--abandon`，终态先 `reopen`。close 含 abandon 时强拆任务 worktree 并删除该任务日志。

standard 设计确认前 verify 或确认后业务改动未提交时，`check` 阻断 `accept`；`verify` 本身不要求设计确认。

`check` 对过薄设计、空壳 decisions/模块设计和当前分支未包含任务编号；规格/背景未回写时列路径与提纲 warning。`verify` 日志含命令、起止和退出码。

## 验证

`verify` 只声明测试，由 tiller 构造并执行；结果只读私有临时报告，stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过不核实；引用文件须全通过。`--run` 已删除。standard 必须声明 `--target`，small 缺省 `.`。

日志位于 `.tiller/local/logs/<任务编号>/run-<序号>.log`，含完整命令与输出，支持 `--verbose`；`task.md` 留摘要，命令与证据进旁路。`verify.prepare` 失败即验证失败；`verify.runner` 支持 `node-test`、`junit-maven`、`junit-gradle`、`pytest`，仓库可覆盖，归属不明拒绝。pytest 通过私有 JUnit XML 核实，不内嵌 Python，也不自动安装依赖；`case add` 骨架随当前 runner 生成。

同一 AC/CASE 连续两次验证失败且无成功核实，`verify` 与 `check` 要求停止自动重试，按 FLOW-05 报告现象、已尝试方法、证据和 2～3 个可选方案；成功核实清零。

无法本机执行时用 `--reported --command ... --result ... --reason "<理由>"`，理由必填；`check`/`accept` 默认阻断外部报告，仅 `--allow-reported` 放行，`pr` 标明未执行。bugfix 用 `--expect-fail --test` 在基线工作树留失败证据并保留当前通过；`check` 缺任一侧阻断。

`pr` 生成标题、五段说明和分支。标题摘要优先取 `pr --summary`，其次任务元数据、基线后最早规范 feat/fix 提交摘要和标题；模块取范围首个。提交主题 `类型(模块): 中文摘要`，标题加 `[任务编号]`；变更内容按提交时间正序。分支为 `类型/任务编号[-描述]`；不联网。

## 规划与用例

```sh
node .tiller/run.cjs plan start 20261023-batch --title "第一批" --goal "接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-"
node .tiller/run.cjs start 20261023-onboarding --plan 20261023-batch --item P-1 --title "接入" --requirement "完成最小接入" --criterion "AC-1=接入可用"
node .tiller/run.cjs plan attach 20261023-closed-task --plan 20261023-batch --item P-1
```

`plan confirm/status` 确认拆分；依赖未验收阻塞。`plan attach` 把已有任务补挂到已确认条目，不改确认。用例写 `.tiller/cases/modules/<模块>/`，场景写 `scenarios/`。

`case add` 写清前置条件、步骤、输入、预期、类型、优先级和来源。测试名或紧邻注释引用 `CASE-NNN`，tiller 扫描反查；无引用待实现。`verify --case CASE-NNN` 执行覆盖。单任务只有 `.tiller/task/<id>/task.md`；外部仓 `.tiller/work/` 只读遗留。原始输出写 `.tiller/local/logs/`，不提交全文快照或日志。

## 接入与升级

`init [--platform github|gitlab|both]` 只补缺失骨架，不覆盖已有文件，按平台生成 PR/MR 模板；项目与模块规格含完整需求/设计章节和小提示；检测到 pytest 配置或常见 Python 测试布局时选用 pytest 验证。平台在初始化时选定；之后不能通过 CLI 切换，需手动修改 `.tiller/project.json` 并补齐对应模板。`upgrade` 只刷新未修改文件，冲突保留；`upgrade --adopt <受管文件>` 保留当前内容并只更新摘要。兼容当前及上一资源契约，版本号仅正式发布修改。受管入口未入 Git 时，`check` 警告，`release` 阻断。
