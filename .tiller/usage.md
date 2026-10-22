# tiller 使用指引

运行 `node .tiller/run.cjs --help` 查看命令；恢复用 `node .tiller/run.cjs resume`。

## 默认工作流

```sh
node .tiller/run.cjs start <task-id> --title "修复退出码" --summary "失败命令返回非零" \
  --requirement "失败时返回非零" --criterion "AC-1=失败命令返回非零" --size small --target src --target test
node .tiller/run.cjs confirm <task-id> requirements [--by "确认人"]
node .tiller/run.cjs case add <task-id> --module cli --kind interface --title "失败退出码" \
  --test test/cli.test.mjs::失败退出 --criterion AC-1 --source src/cli.ts
node .tiller/run.cjs verify <task-id> --criterion AC-1 --test test/cli.test.mjs::失败退出 \
  --run "node test/cli.test.mjs"
node .tiller/run.cjs check <task-id>
node .tiller/run.cjs accept <task-id> [--by "验收人"]
node .tiller/run.cjs close <task-id> --reason "交付完成"
node .tiller/run.cjs pr <task-id> [--summary <中文摘要>] [--slug <英文描述>] [--json]
```

`start` 生成目标、范围、编号 AC；standard 另生成方案、取舍、影响与风险。确认前校验必填段。`--summary` 可选，用于记录 PR/MR 标题使用的中文摘要；`--slug` 可选，用于记录建议分支的英文描述。

`confirm`/`accept`/`plan confirm` 的 `--quote` 可选；`--by` 默认取 `git config user.name`。记录确认部分、确认人、时间、提交和正文摘要；需求与设计独立失效。旧记录兼容。

阶段由事实推导：需求已确认 → 设计已确认（small 可略）→ 已验证 → 已验收 → 已关闭/放弃，失效时回退说明。已验收 `close`，未验收 `--abandon`，终态 `reopen`。

## 验证

`verify` 只接受 `--run "<命令>"`，记录即执行；输出会转发并解析 node:test TAP/spec，确认 `文件::测试名` 出现且通过，仅写文件时要求测试存在且失败数为 0。无法核实会写入记录并由 `check` 阻断；其它框架可在 `src/test-output.ts` 的解析器注册表中扩展。

引用具名测试时，命令输出必须包含 `ok N - <测试名>` 或 `✔ <测试名>`。可直接运行 `node test/<文件>.mjs`，或使用 `node --test-name-pattern=<名称> test/<文件>.mjs`；部分 Node 版本下 `node --test <文件>` 只输出文件级结果，不能证明具体具名测试已通过。

无法本机执行时使用 `--reported --command ... --result ... --reason "<理由>"`，理由必填。`check`/`accept` 默认阻断外部报告，确认事实后仅在 `--allow-reported` 时放行；`pr` 标明“未执行（外部报告）”。

bugfix 任务先用 `verify --expect-fail --run "<命令>"` 在任务基线的临时 Git 工作树运行失败，再记录当前通过；缺少任一侧证据时 `check` 阻断。

`start --size standard` 必须至少提供一个 `--target`；small 缺省为 `.`。

`pr` 读取本地任务记录与 Git，输出 PR/MR 标题、五段说明、建议分支或 JSON。标题摘要优先取 `pr --summary`，其次取 `start --summary` 写入的任务元数据，再取任务基线后最早的 `feat`/`fix` 规范提交摘要，最后退回任务标题；标题类型按任务类型映射。提交主题使用 `类型(模块): 中文摘要`，标题末尾加 `[任务编号]`，模块取任务范围中首个声明的主模块，无法推导时省略括号。变更内容按提交时间正序排列；关联任务使用纯文本路径，验证结果按 AC 列出全部记录。分支为 `类型/任务编号[-描述]`，描述依次取 `pr --slug`、任务元数据或当前分支中的匹配描述。`check` 对提交和分支格式问题只提示，不阻塞；`pr` 不调用托管平台，也不联网。

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

- `verify` 记录用例、测试、命令、结果、核实状态、提交和代码树摘要；命令只从 `--run` 获取并实际执行。
- 外部报告必须写明理由并由 `--allow-reported` 显式放行；失败、未执行和未核实不能写成通过。
- `check` 检查 AC→用例→测试→当前验证、范围、测试弱化、密钥和本机路径。
- `accept` 只在 `check` 通过后保存；超大设计先用 plan 拆任务。
- 单任务只有 `.tiller/task/<id>/task.md`；历史 `.tiller/work/` 只读。不保存全文快照和日志。

## 接入与升级

`init [--platform github|gitlab|both]` 只补缺失骨架且不覆盖已有文件，并按平台生成 PR/MR 模板。平台在初始化时选定；之后不能通过 CLI 切换，需手动修改 `.tiller/project.json` 并补齐对应模板。`upgrade --plan` 预览，`--apply <plan-id>` 应用；只刷新未修改文件并补齐当前平台模板，冲突保留。兼容当前及上一资源契约；版本号只在正式发布时修改。
