# tiller 使用指引

运行 `node .tiller/run.cjs --help`；恢复用 `node .tiller/run.cjs resume`。

## 默认工作流

```sh
node .tiller/run.cjs start <task-id> --title "修复退出码" --requirement "失败时返回非零" \
  --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm <task-id> requirements --quote "确认"
node .tiller/run.cjs case add <task-id> --module cli --kind interface --title "失败退出码" \
  --test test/cli.test.mjs::失败退出 --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify <task-id> --criterion AC-1 --test test/cli.test.mjs::失败退出 \
  --command "npm test" --run "npm test"
node .tiller/run.cjs check <task-id>
node .tiller/run.cjs accept <task-id> --quote "验收通过"
node .tiller/run.cjs close <task-id> --reason "交付完成"
```

`start` 先写目标与 AC。标准任务用 `--size standard`，补写 `## 设计` 后再确认。原话只作凭证，不替代正文。

阶段由事实推导：已开始 → 需求已确认 → 设计已确认（small 可略）→ 已验证 → 已验收 → 已关闭/放弃；失效时回退说明原因。已验收 `close`，未验收 `--abandon`，终态用 `node .tiller/run.cjs reopen` 继续。

## 规划与用例

```sh
node .tiller/run.cjs plan start batch --title "第一批" --goal "完成接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-;specs=.tiller/specs/requirements.md#7-初始化与受管升级"
node .tiller/run.cjs start <task-id> --plan batch --item P-1 --title "接入" \
  --requirement "完成最小接入" --criterion "AC-1=接入可用"
```

`plan confirm/status` 确认并查看拆分；依赖未验收阻塞，子规划用 `plan=`。`.tiller/cases/modules/<模块>/{behavior,interface,performance,security}.json` 存模块回归，`.tiller/cases/scenarios/` 存端到端路径；模块须与 specs 一致。`task.md` 只记录本次任务。

确认后先把 AC 转为用例，再写测试并实现。`case add` 分配编号；`verify` 记录命中用例；`check` 阻塞缺失、错配或过期映射。

## 规则

- `confirm` 只接受真实原话，正文须绑定当前对象。
- `verify` 记录用例、测试、命令、结果、提交和代码树摘要；`--run` 实际执行。
- `check` 检查 AC→用例→测试→当前验证、范围、测试弱化、密钥和本机路径。
- `accept` 只在 `check` 通过后保存交付验收；终态由 `close`/`reopen` 管理。
- 任务记录位于 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读。不保存全文快照和日志。

## 接入与升级

`init` 补 specs、context、cases、plans 和规则，不覆盖已有文件。`upgrade --plan` 预览，`upgrade --apply <plan-id>` 应用；只刷新未修改文件，冲突保留。只核对当前及直接兼容的上一资源契约；版本号只在正式发布时修改。
