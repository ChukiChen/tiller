# tiller 使用指引

需要 Node.js 22 或以上。在工程根目录运行：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs status
node .tiller/run.cjs resume
```

`--help` 展示默认工作流和参数。命令参数从当前工作记录推断，通常不需要手写大段 JSON。

## 默认工作流

```sh
# 小改动
node .tiller/run.cjs start 20261021-fix --title "修复退出码" --goal "失败时返回非零" \
  --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm 20261021-fix requirements --quote "确认"
node .tiller/run.cjs verify 20261021-fix --criterion AC-1 --test test/cli.test.mjs \
  --command "npm test" --run "npm test"
node .tiller/run.cjs check 20261021-fix
node .tiller/run.cjs accept 20261021-fix --quote "验收通过"
```

标准或大功能使用 `--size standard`，并在工作记录的 `## 设计` 中写明方案后再执行 `confirm <id> design --quote ...`。

## 规则

- `start` 记录类型、规模、范围和编号验收条件；不生成完整文档套件。
- `confirm` 只接受真实用户原话。`requirements` 绑定目标与验收条件，`design` 绑定设计正文，`acceptance` 绑定当前技术结果和提交。
- `verify` 同时记录测试引用、命令、结果、提交和代码树摘要。`--run` 会实际执行命令；未提供 `--run` 时使用 `--result` 记录外部结果。
- `check` 检查验收条件覆盖、验证是否过期、范围越界、测试删除或弱化、密钥和本机绝对路径。技术通过不等于用户验收。
- `accept` 只在 `check` 通过后保存交付验收。
- 工作记录位于 `.tiller/work/<id>/work.md`。需要历史细节时从 Git 取回或重跑验证，不保存全文快照和日志。

## 安装与恢复

固定入口优先使用本机已登记 CLI。入口不可用时，使用已核对版本的本地安装包，或执行 `runtime bind --path <工程目录>` 重新登记；不要下载来源不明的包。

工程元信息版本不匹配时运行 `upgrade --plan` 核对。升级只检查当前资源契约，不改写文件、不迁移历史版本或历史批准；版本号只在正式发布时修改。
