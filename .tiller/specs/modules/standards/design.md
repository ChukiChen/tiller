# 开发规范设计

## 1. 资源分层

- `resources/entry.md`：宿主入口，目标、默认流程、执行纪律、交付边界。
- `resources/usage.md`：命令示例、规划/用例/恢复和升级用法。
- `resources/rules/index.md`：按活动查找细则。
- `resources/rules/core.md`：流程、确认、记录、范围、卡住、context 和版本边界。
- `resources/rules/activities/` 与 `quality/`：需求、设计、实现、交付和文档/验证细节。
- `resources/pull_request_template.md`：固定五段 PR 说明，初始化时复制为受管 `.github/pull_request_template.md`。

不内置重阶段模板或全量规格副本。入口和核心规则保持短句、表格和明确动词。

## 2. 接入与同步

`init` 把入口写入 `AGENTS.md` 固定区段，将规则、usage 和启动器复制到 `.tiller/`，并按摘要管理 PR 模板。`upgrade` 只刷新未修改文件。项目自有规则、已有 PR 模板和区段外入口正文保持原样。

## 3. 检查方式

规则由三层保障：

1. CLI 在受控写入时校验输入、路径、用例和记录；
2. `check` 读取当前树，报告确认、映射、范围和安全问题；
3. `rules.test.mjs` 校验入口、核心规则、必读预算、链接和文档一致性。

CLI 不能认证用户身份或阻止宿主绕过直接写入；规则文档必须如实说明该边界。

## 4. 场景覆盖

standards 没有独立的端到端产品路径；其入口、规则和 usage 由规则/资源行为测试及“新项目接入全流程”场景共同覆盖。该场景经过 standards、initialization、workflow 和 verification，验证初始化后的入口、规则和默认流程可用。
