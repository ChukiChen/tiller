# 开发规范设计

## 1. 资源分层

- `resources/entry.md`：宿主入口，目标、默认流程、执行纪律、交付边界。
- `resources/usage.md`：命令示例、规划/用例/恢复和升级用法。
- `resources/rules/index.md`：按活动查找细则。
- `resources/rules/core.md`：流程、确认、记录、范围、卡住、context 和版本边界。
- `resources/rules/activities/` 与 `quality/`：需求、设计、实现、交付和文档/验证细节。
- `resources/pull_request_template.md` 与 `resources/merge_request_template.md`：内容相同的五段 PR/MR 说明，按平台复制为受管模板。

不内置重阶段模板或全量规格副本。入口和核心规则保持短句、表格和明确动词；`AGENTS.md` 入口、`.tiller/usage.md`、`.tiller/rules/index.md` 和 `.tiller/rules/core.md` 的必读总量上限约 7000 字符，以清晰完整为先。

## 2. 接入与同步

`init` 把入口写入 `AGENTS.md` 固定区段，将规则、usage 和启动器复制到 `.tiller/`，并按摘要管理当前平台 PR/MR 模板。`upgrade` 只刷新未修改文件并补齐当前平台模板。项目自有规则、已有模板和区段外入口正文保持原样。usage 说明 `review`、`release`、`--requirement-file`、`--target`、`--allow-reported` 和已验收任务按 acceptance 提交复查；规则索引和交付/验证细则分担操作细节，入口与核心规则只保留底线。提交主题为 `类型(模块): 中文摘要`，PR/MR 标题尾加 `[任务编号]`，分支为 `类型/任务编号[-描述]`；`confirm --by` 指定确认人，`--quote` 可选。

## 3. 检查方式

规则由三层保障：

1. CLI 在受控写入时校验输入、路径、用例和记录；
2. `check` 读取当前树或已验收端点，报告确认、映射、范围、安全、评审阻塞项和 specs 回写提示；
3. `rules.test.mjs` 校验入口、核心规则、必读预算、链接和文档一致性。

测试设计关联使用 `CASE-NNN`：测试名或紧邻注释引用稳定编号，扫描器建立 case→tests 反查；无引用为待实现，未知编号报错。新增测试运行方式通过 `src/test-output.ts` 的适配器扩展，已注册 `node-test`、`junit-maven` 和 `junit-gradle`。缺陷修复使用 `--expect-fail` 保留基线失败证据。

CLI 不能认证用户身份或阻止宿主绕过直接写入；规则文档必须如实说明该边界。

## 4. 场景覆盖

standards 没有独立的端到端产品路径；其入口、规则和 usage 由规则/资源行为测试及“新项目接入全流程”场景共同覆盖。该场景经过 standards、initialization、workflow 和 verification，验证初始化后的入口、规则和默认流程可用。
