# tiller 使用指引

需要 Node.js 22 或以上。在工程根目录运行：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs status
node .tiller/run.cjs resume
```

## 默认工作流

```sh
# 小改动
node .tiller/run.cjs start 20261021-fix --title "修复退出码" --requirement "失败时返回非零" \
  --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm 20261021-fix requirements --quote "确认"
node .tiller/run.cjs verify 20261021-fix --criterion AC-1 --test test/cli.test.mjs \
  --command "npm test" --run "npm test"
node .tiller/run.cjs check 20261021-fix
node .tiller/run.cjs accept 20261021-fix --quote "验收通过"
```

`start` 写入 `task.md` 的 `## 需求`，确认前补全正文。标准任务用 `--size standard`，先写 `## 设计` 再执行 `confirm <id> design`。用户原话只作确认凭证，不替代正文。

## 全局用例

`.tiller/cases/*.json` 是产品级回归事实源，保存 id、标题、需求/模块、test_ref 和源码路径；`task.md` 只记录本次任务，不存执行日志或快照。`verify --test` 优先引用用例的 `test_ref`；`check` 校验用例引用，并对未命中的本次测试给出提示。

## 规则

- `start` 记录结构化需求、类型、规模、范围与验收条件；不生成文档套件。
- `confirm` 只接受真实原话；原话只作凭证，需求和设计正文须已写清并绑定当前对象。
- `verify` 记录测试引用、命令、结果、提交和代码树摘要。`--run` 实际执行，否则用 `--result` 记录外部结果。
- `check` 检查验收条件覆盖、验证过期、范围越界、测试删除或弱化、全局用例、密钥和本机路径；技术通过不等于验收。
- `accept` 只在 `check` 通过后保存交付验收。
- 任务记录位于 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读保留。细节从 Git 取回或重跑，不保存全文快照和日志。

## 安装与恢复

固定入口优先使用本机已登记 CLI。入口不可用时，使用已核对版本的本地安装包，或执行 `runtime bind --path <工程目录>` 重新登记；不要下载来源不明的包。

工程元信息版本不匹配时运行 `upgrade --plan` 核对。升级只检查当前资源契约，不改写文件、不迁移历史版本或历史批准；版本号只在正式发布时修改。
