# tiller 使用指引

需要 Node.js 22 或以上。在工程根目录运行：

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
node .tiller/run.cjs verify 20261021-fix --criterion AC-1 --test test/cli.test.mjs::失败退出 \
  --command "npm test" --run "npm test"
node .tiller/run.cjs check 20261021-fix
node .tiller/run.cjs accept 20261021-fix --quote "验收通过"
```

`start` 先把目标和验收条件写进 `task.md`；标准任务用 `--size standard`，补写 `## 设计` 后再确认。原话只作凭证，不替代正文。

## 全局用例

`.tiller/cases/modules/<模块>/{behavior,interface,performance,security}.json` 保存模块回归事实，`.tiller/cases/scenarios/` 保存端到端路径；模块名须与 `.tiller/specs/modules/` 一致。`task.md` 只记录本次任务。

确认需求后先把每条 AC 转为用例，再按 `test_ref` 写测试并实现。`verify` 自动记录命中的用例编号；`check` 阻塞缺失、失效、错配或过期的映射。

## 规则

- `start` 记录需求、类型、规模、范围与验收条件，不生成文档套件。
- `confirm` 只接受真实原话；正文须已写清并绑定当前对象。
- `verify` 记录用例、测试、命令、结果、提交和代码树摘要；`--run` 实际执行，否则用 `--result` 记录外部结果。
- `check` 检查 AC→用例→测试→当前验证、用例目录/类型/场景、模块统计与回归提示，以及范围、测试弱化、密钥和本机路径。
- `accept` 只在 `check` 通过后保存交付验收。
- 任务记录位于 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读。细节从 Git 取回或重跑，不保存全文快照和日志。

## 安装与恢复

优先使用本机已登记 CLI。入口不可用时使用已核对的本地安装包，或执行 `runtime bind --path <工程目录>`；不要下载来源不明的包。

版本不匹配时运行 `upgrade --plan`。升级只核对当前资源契约，不迁移历史版本；版本号只在正式发布时修改。
