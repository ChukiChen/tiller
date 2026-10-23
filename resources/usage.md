# tiller 使用指引

运行 `node .tiller/run.cjs --help`；恢复用 `node .tiller/run.cjs resume`。任务/规划编号用 `YYYYMMDD-` 前缀，缺少时 `start`/`plan start` 提示但不改写。

## 默认工作流

```sh
node .tiller/run.cjs start 20261023-fix-exit-code --title "修复退出码" --summary "失败命令返回非零" \
  --requirement "失败时返回非零" --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm 20261023-fix-exit-code requirements [--by "确认人"]
node .tiller/run.cjs case add 20261023-fix-exit-code --module cli --kind interface --title "失败退出码" \
  --expected "返回退出码 2" --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify 20261023-fix-exit-code --case CASE-001
node .tiller/run.cjs verify 20261023-fix-exit-code --criterion AC-1 --test "test/cli.test.mjs::CASE-001 失败退出码"
node .tiller/run.cjs review 20261023-fix-exit-code [--blocking <发现> ...] [--resolve REV-NNN ...]
node .tiller/run.cjs release 20261023-fix-exit-code
node .tiller/run.cjs check 20261023-fix-exit-code
node .tiller/run.cjs accept 20261023-fix-exit-code [--by "验收人"]
node .tiller/run.cjs close 20261023-fix-exit-code --reason "交付完成"
node .tiller/run.cjs pr 20261023-fix-exit-code
```

`start` 生成目标、范围和 AC；standard 另生成设计。`--requirement` 与 `--requirement-file <工程内相对路径>` 二选一且非空；`--summary` 记录标题摘要和建议分支。

`confirm`/`accept`/`plan confirm` 的 `--quote` 可选；`--by` 默认取 `git config user.name`。记录确认部分、确认人、时间、提交和正文摘要；需求与设计独立失效，旧记录兼容。

`review` 未清除阻塞项阻断 `check`/`accept`。`release` 检查验收提交、元数据、受管资源、README/包版本、范围与入口跟踪；`check` 返回同一清单但不阻断日常自检。

阶段由事实推导；已验收任务钉在验收提交，未验收或失效时核对工作区/HEAD。已验收 `close`，未验收 `--abandon`，终态 `reopen`。

standard 任务在设计确认前已有 verify，或确认提交后工作区仍有未提交业务改动，`check` 汇总过程卫生 issue 并阻断 `accept`；`verify` 本身不要求设计确认。

`check` 对过薄设计、空壳 decisions/模块设计和当前分支未包含任务编号提示补全；`verify` 日志含命令、起止和退出码。

## 验证

`verify` 只声明测试，由 tiller 构造并执行；结果只读私有临时报告，stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过不核实；仅引用文件时要求全通过。`--run` 已删除。standard 必须声明 `--target`，small 缺省 `.`。

日志位于 `.tiller/local/logs/<任务编号>/run-<序号>.log`，`--verbose` 显示详情。`verify.prepare` 失败即验证失败；`verify.runner` 支持 `node-test`、`junit-maven`、`junit-gradle`，仓库可覆盖，归属不明拒绝。`case add` 骨架随当前 runner 生成。

无法本机执行时用 `--reported --command ... --result ... --reason "<理由>"`，理由必填；`check`/`accept` 默认阻断外部报告，仅 `--allow-reported` 放行，`pr` 标明“未执行（外部报告）”。bugfix 用 `--expect-fail --test` 在基线工作树留失败证据并保留当前通过；`check` 缺任一侧即阻断。

`pr` 从任务与 Git 生成标题、说明、建议分支或 JSON。标题摘要优先取 `pr --summary`，其次任务元数据、基线后最早规范 feat/fix 提交摘要和标题；模块取范围首个。提交主题 `类型(模块): 中文摘要`，标题加 `[任务编号]`；变更内容按提交时间正序，关联任务纯文本。分支为 `类型/任务编号[-描述]`；不联网。

## 规划与用例

```sh
node .tiller/run.cjs plan start 20261023-batch --title "第一批" --goal "完成接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-"
node .tiller/run.cjs start 20261023-onboarding --plan 20261023-batch --item P-1 --title "接入" \
  --requirement "完成最小接入" --criterion "AC-1=接入可用"
```

`plan confirm/status` 确认拆分；依赖未验收阻塞。用例写 `.tiller/cases/modules/<模块>/`，场景写 `scenarios/`，模块名同 specs；结论回写。

用例先行：`case add` 写清前置条件、步骤、输入、预期结果、类型、优先级和来源 AC。测试名或紧邻注释引用 `CASE-NNN`，tiller 扫描反查；无引用待实现，未知编号报错。`verify --case CASE-NNN` 执行覆盖测试。

## 规则

- `verify` 记录用例、测试、命令、结果、核实状态、提交、代码树摘要和日志路径；原始输出只写 `.tiller/local/logs/`，不提交全文快照或日志。
- 外部报告须写明理由并 `--allow-reported`；`check` 核对 AC→用例→测试→当前验证、范围、测试弱化和记录安全；`accept` 只在其通过后保存。
- 单任务只有 `.tiller/task/<id>/task.md`；外部仓 `.tiller/work/` 只读遗留。超大设计用 plan 拆任务。

## 接入与升级

`init [--platform github|gitlab|both]` 只补缺失骨架，不覆盖已有文件，按平台生成 PR/MR 模板，列出建议首提入口。平台在初始化时选定；之后不能通过 CLI 切换，需手动修改 `.tiller/project.json` 并补齐对应模板。`upgrade` 只刷新未修改文件，冲突保留；兼容当前及上一资源契约，版本号仅正式发布时修改。受管入口未入 Git 时，`check` 警告，`release` 阻断。
