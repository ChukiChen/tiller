# tiller 使用指引

在工程根目录运行：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs status
node .tiller/run.cjs resume
```

## 默认工作流

```sh
node .tiller/run.cjs start 20261021-fix --title "修复退出码" --requirement "失败时返回非零" \
  --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm 20261021-fix requirements --quote "确认"
node .tiller/run.cjs case add 20261021-fix --module cli --kind interface --title "失败退出码" \
  --test test/cli.test.mjs::失败退出 --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify 20261021-fix --criterion AC-1 --test test/cli.test.mjs::失败退出 \
  --command "npm test" --run "npm test"
node .tiller/run.cjs check 20261021-fix
node .tiller/run.cjs accept 20261021-fix --quote "验收通过"
```

`start` 先把目标和验收条件写进 `task.md`；标准任务用 `--size standard`，补写 `## 设计` 后再确认。原话只作凭证，不替代正文。

## 规划与全局用例

大功能先规划确认：

```sh
node .tiller/run.cjs plan start batch --title "第一批" --goal "完成接入" \
  --spec .tiller/specs/requirements.md#3-默认工作流 \
  --item "P-1=接入;size=small;deps=-;specs=.tiller/specs/requirements.md#7-初始化与受管升级;plan=module-plan"
node .tiller/run.cjs plan confirm batch --quote "确认规划"
node .tiller/run.cjs plan status batch
node .tiller/run.cjs start 20261021-fix --plan batch --item P-1 --title "接入" \
  --requirement "完成最小接入" --criterion "AC-1=接入可用"
```

依赖未验收阻塞；`plan=` 可指向子规划。`.tiller/cases/modules/<模块>/{behavior,interface,performance,security}.json` 保存模块回归，`.tiller/cases/scenarios/` 保存端到端路径；模块名须与 specs 一致。`task.md` 只记录本次任务。

确认需求后先把每条 AC 转为用例，再写测试和实现。`case add` 自动分配编号；`verify` 记录命中的用例；`check` 阻塞缺失、错配或过期的映射。

## 规则

- `confirm` 只接受真实原话；正文须已写清并绑定当前对象。
- `verify` 记录用例、测试、命令、结果、提交和代码树摘要；`--run` 实际执行。
- `check` 检查 AC→用例→测试→当前验证、规划/用例结构、范围、测试弱化、密钥和本机路径。
- `accept` 只在 `check` 通过后保存交付验收。
- 任务记录位于 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读。不保存全文快照和日志。

## 新项目与升级

`init` 补齐 specs、context、cases、plans、入口和规则，不覆盖已有文件。`upgrade --plan` 预览受管资源刷新；`upgrade --apply <plan-id>` 应用。只刷新未修改文件，用户修改列为冲突。只核对当前及直接兼容的上一资源契约，不迁移历史版本；版本号只在正式发布时修改。

入口不可用运行 `runtime bind`；不下载未知来源包。
