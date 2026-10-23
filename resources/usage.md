# tiller 使用指引

运行 `node .tiller/run.cjs --help` 查看命令；恢复用 `node .tiller/run.cjs resume`。

## 默认工作流

```sh
node .tiller/run.cjs start <task-id> --title "修复退出码" --summary "失败命令返回非零" \
  --requirement "失败时返回非零" --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm <task-id> requirements [--by "确认人"]
node .tiller/run.cjs case add <task-id> --module cli --kind interface --title "失败退出码" \
  --precondition "命令可用" --step "运行失败命令" --input "退出码 2" \
  --expected "返回退出码 2" --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify <task-id> --case CASE-001
node .tiller/run.cjs verify <task-id> --criterion AC-1 --test "test/cli.test.mjs::CASE-001 失败退出码"
node .tiller/run.cjs review <task-id> [--finding <发现> ...] [--blocking <阻塞发现> ...] [--resolve REV-NNN ...]
node .tiller/run.cjs release <task-id>
node .tiller/run.cjs check <task-id>
node .tiller/run.cjs accept <task-id> [--by "验收人"]
node .tiller/run.cjs close <task-id> --reason "交付完成"
node .tiller/run.cjs pr <task-id> [--summary <中文摘要>] [--slug <英文描述>] [--json]
```

`start` 生成目标、范围、编号 AC；standard 另生成方案、取舍、影响与风险。`--requirement` 与 `--requirement-file <工程内相对路径>` 二选一，文件须非空。确认前校验必填段；`--summary`/`--slug` 记录标题摘要和建议分支描述。

`confirm`/`accept`/`plan confirm` 的 `--quote` 可选；`--by` 默认取 `git config user.name`。记录确认部分、确认人、时间、提交和正文摘要；需求与设计独立失效。旧记录兼容。

`review` 记录独立评审清单与发现；`--blocking` 项用 `--resolve` 清除前，`check`/`accept` 失败。`release` 只读检查验收提交、项目元数据、受管资源、README/包版本和任务范围未提交改动；`check` 同时返回发布清单，但不据此阻断日常自检。

阶段由事实推导：需求已确认 → 设计已确认（small 可略）→ 已验证 → 已验收 → 已关闭/放弃，失效时回退说明。已验收任务钉在验收提交读取树与测试，后续代码变化不误报验证过期；未验收或验收失效时仍核对工作区/HEAD。specs/context 未回写时 `check` 只提示。已验收 `close`，未验收 `--abandon`，终态 `reopen`。

## 验证

`verify` 只声明测试，由 tiller 构造并执行精确匹配的 node:test 命令；结果只读私有临时报告，stdout/stderr 不参与判定。报告缺失或损坏、匹配 0 个或多个测试、失败或跳过都不能核实；仅引用文件时要求整个文件通过。旧 `--run` 已删除。`start --size standard` 必须声明 `--target`；small 缺省 `.`。

默认只输出摘要；完整输出写入 `.tiller/local/logs/<任务编号>/run-<序号>.log`，`--verbose` 时同时显示。`project.json` 的 `verify.prepare`（如 `["npm","run","build"]`）失败即验证失败；`verify.runner` 当前支持 `node-test`，新框架在 `src/test-output.ts` 实现并注册 `TestRunner` 适配器。

无法本机执行时使用 `--reported --command ... --result ... --reason "<理由>"`，理由必填。`check`/`accept` 默认阻断外部报告，仅在 `--allow-reported` 时放行；`pr` 标明“未执行（外部报告）”。

bugfix 用 `--expect-fail --test` 在基线工作树留失败证据，并保留当前通过；`check` 缺任一侧即阻断。

`pr` 从本地任务与 Git 输出标题、五段说明、建议分支或 JSON。标题摘要优先取 `pr --summary`，其次取任务元数据、基线后最早规范 feat/fix 提交摘要和任务标题；类型按任务映射，模块取范围首个。提交主题 `类型(模块): 中文摘要`，标题加 `[任务编号]`；变更内容按提交时间正序，关联任务用纯文本，验证按 AC 列全部记录。分支为 `类型/任务编号[-描述]`。`check` 只提示格式问题，`pr` 不联网。

## 规划与用例

```sh
node .tiller/run.cjs plan start batch --title "第一批" --goal "完成接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-;specs=.tiller/specs/requirements.md#7-初始化与受管升级"
node .tiller/run.cjs start <task-id> --plan batch --item P-1 --title "接入" \
  --requirement "完成最小接入" --criterion "AC-1=接入可用"
```

`plan confirm/status` 查看并确认拆分；依赖未验收阻塞。模块用例写 `.tiller/cases/modules/<模块>/`，场景写 `scenarios/`，模块名与 specs 一致；长期结论完成后回写 specs。

确认后先把 AC 转为用例，再写测试和实现。`case add` 不要求测试文件；写清前置条件、步骤、输入、预期结果、类型、优先级和来源 AC。测试名或紧邻注释引用 `CASE-NNN`，tiller 扫描反查；无引用显示待实现，未知编号报错。`verify --case CASE-NNN` 执行覆盖测试，`--test` 验证单个测试。

## 规则

- `verify` 记录用例、测试、命令、结果、核实状态、提交、代码树摘要和日志路径；原始输出只写 `.tiller/local/logs/`，不提交全文快照或日志。
- 外部报告须写明理由并 `--allow-reported`；`check` 核对 AC→用例→测试→当前验证、范围、测试弱化和记录安全；`accept` 只在其通过后保存。
- 单任务只有 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读。超大设计先用 plan 拆任务。

## 接入与升级

`init [--platform github|gitlab|both]` 只补缺失骨架且不覆盖已有文件，并按平台生成 PR/MR 模板。平台在初始化时选定；之后不能通过 CLI 切换，需手动修改 `.tiller/project.json` 并补齐对应模板。`upgrade --plan` 预览，`--apply <plan-id>` 应用；只刷新未修改文件并补齐当前平台模板，冲突保留。兼容当前及上一资源契约；版本号只在正式发布时修改。
