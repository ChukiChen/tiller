# 安装后失败恢复与执行者接续

本说明记录已确认 T6 范围内的受控临时工程验证，不代表最终用户验收或业务产品交付。

## 对象与安装

已安装候选版本为 0.4.0，通过本工程 `.tiller/run.cjs` 调用。包来源见 `authority/package.json`；归档 `candidate.tgz` 的 SHA-256 为 a3877f6936ad4c7ff0a62e7796e83f736f2693c74110c268be6c1fa45c498110。规划为 t6-one，foundation 提供实际入口探针，downstream 依赖该探针并交付本说明。

## 已观察的失败、拒绝和修复

1. 初始探针故意期待 0.0.0，真实执行返回 0.4.0。运行 e495e907-7873-4392-bf7d-163cc951f560 退出 1，suitePassed=false，受检输入未在运行中漂移。
2. 使用该失败证据验证 foundation 时被 VERIFICATION_REQUIRED 拒绝；随后启动 downstream 被 DEPENDENCY_NOT_VERIFIED 拒绝。两次都是只读预览拒绝，没有写入成功事件，任务 revision 仍为 3。
3. 读取上述结果后才将预期改为实际候选版本 0.4.0。运行 84d743c5-5e92-4dc0-8bca-812d7a156adc 退出 0、suitePassed=true；foundation 随后在事件 3 验证，revision 为 4。
4. 下游开始预览及应用随后成功，事件 4 明确引用 foundation 验证事件 3 及产物摘要。原执行者保存进展并停止，下游仍未验证，本说明当时尚不存在。

## 实际接续

后继执行者读取持久 work.md、范围、任务状态和逐条观察后，实际执行 work resume 与 task status。状态确认 foundation 仍有效、downstream 为 active、revision 5；读操作没有把它变成完成。

一次将任务标识误作位置参数的 resume 调用被 INVALID_ARGUMENT 拒绝。按已安装入口语法改为 `work task resume <work-id> --task downstream --input <json>` 后，预览允许并应用成功，产生 task-resumed 事件 5、revision 6 和新的 attempt-20a2f8fff93b0a0e5a135d3f。它仍引用 foundation 的事件 3；旧开始事件与旧 attempt 保留。本说明在新尝试建立后才编写。

这是实际执行者/上下文交接，未制造程序崩溃。形成本文时，downstream 尚未验证、整体就绪尚未登记；接下来先采集当前说明与探针，再作独立技术观察、登记并验证，最后另做组合检查。不能仅凭本文或任务通过宣称整体交付已就绪。

## 环境与边界

首次执行计划应用曾因独立宿主调用的 CODEX_TOOL_CALL_ID 变化而拒绝，发生在探针执行前，与探针的预期失败分开记录。辅助调用只固定该宿主标识为本次会话标签，其余环境不变；没有保存环境变量原值或改变产品实现。

受控 task 命令会检查前置条件，但不能阻止宿主直接编辑文件。修复探针由执行者在授权范围内实际编辑，CLI 没有自动修复，也没有自动调度后续任务。真实决定来源仅复用已有 T6 执行授权，没有新增用户批准、最终验收或提交、推送、合入、发布。

原始逐条观察保留在 `.tiller/local/observations/`，机器事实保留在本工作目录；本说明是交付文档，不取代独立验证证据。
