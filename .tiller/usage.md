# tiller 使用指引

入口 `node .tiller/run.cjs --help`；恢复 `run.cjs resume`。

## 默认工作流

```sh
node .tiller/run.cjs start <task-id> --title "修复退出码" --requirement "失败时返回非零" \
  --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm <task-id> requirements [--by "确认人"]
node .tiller/run.cjs case add <task-id> --module cli --kind interface --title "失败退出码" \
  --test test/cli.test.mjs::失败退出 --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify <task-id> --criterion AC-1 --test test/cli.test.mjs::失败退出 \
  --command "npm test" --run "npm test"
node .tiller/run.cjs check <task-id>
node .tiller/run.cjs accept <task-id> [--by "验收人"]
node .tiller/run.cjs close <task-id> --reason "交付完成"
node .tiller/run.cjs pr <task-id> [--slug <英文描述>] [--json]
```

`start` 生成目标、范围、编号 AC；standard 另生成方案、取舍、影响与风险。确认前校验必填段。

`confirm`/`accept`/`plan confirm` 的 `--quote` 可选；`--by` 默认取 `git config user.name`。记录确认部分、确认人、时间、提交和正文摘要；需求与设计独立失效。旧记录兼容。

阶段由事实推导：需求已确认 → 设计已确认（small 可略）→ 已验证 → 已验收 → 已关闭/放弃，失效时回退说明。已验收 `close`，未验收 `--abandon`，终态 `reopen`。

`pr` 输出 PR/MR 标题、五段、分支或 JSON。提交 `类型(模块): 中文摘要`；标题为首模块加 `[任务编号]`，任务纯文本、验证全列。分支 `类型/任务编号[-描述]`，描述取参数、任务或当前分支中的 slug；`check` 仅提示。

## 规划与用例

```sh
node .tiller/run.cjs plan start batch --title "第一批" --goal "完成接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-;specs=.tiller/specs/requirements.md#7-初始化与受管升级"
node .tiller/run.cjs start <task-id> --plan batch --item P-1 --title "接入" \
  --requirement "完成最小接入" --criterion "AC-1=接入可用"
```

`plan confirm/status` 查看并确认拆分；依赖未验收阻塞，子规划用 `plan=`。模块用例写 `.tiller/cases/modules/<模块>/`，端到端写 `scenarios/`；模块名与 specs 一致。长期结论完成后同步 specs。

确认后先把 AC 转为用例，再写测试并实现。`case add` 分配编号；`verify` 记录命中用例；`check` 阻塞缺失、错配或过期映射。

## 规则

- `verify` 记录用例、测试、命令、结果、提交和代码树摘要；`--run` 实际执行。
- `check` 检查 AC→用例→测试→当前验证、范围、测试弱化、密钥和本机路径。
- `accept` 只在 `check` 通过后保存；超大设计先用 plan 拆任务。
- 单任务只有 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读。不保存全文快照和日志。

## 接入与升级

`init [--platform github|gitlab|both]` 补骨架且不覆盖已有文件，按平台生成 PR/MR 模板。`upgrade --plan` 预览，`--apply <plan-id>` 应用；只刷新未修改文件并补齐当前平台模板，冲突保留。兼容当前及上一资源契约；版本号只在正式发布时修改。
