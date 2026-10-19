# T6 安装与顺序自举

## 目标与授权

建立文档工作；登记或草稿不代表内容已确认或获准实现。按实际用户授权补充范围。

## 依据与产物

- [项目规则索引](../../rules/index.md)
- [requirements](<../../../authority/requirements.md>)

## 进展

已建立工作入口。登记保存在 record.json；逐步补充需求与设计，保留实际用户决定。

## 下一步

读取项目依据并补充必要信息，完成后记录针对实际产物的独立评审证据。

## 2026-10-19 实际执行与上下文交接

以下补充接续初始入口，原始登记说明保留。本工程只执行 authority/selfboot-scope.md 所述既有 T6 受控验证，不包含新业务开发、最终用户验收或 Git/发布写操作。

需求、设计及规划使用 authority 中真实既有确认来源，由本次执行者核对适用范围后登记。当前机器展示晚于原批准；authority/plan.md 是任务范围及条件不变的进度快照，不声称与原规划批准时的字节摘要相同。新规划 t6-one 将既有 T6 细化为 foundation 探针与依赖它的 downstream 接续说明，没有新增人工批准。

逐条实际命令的原始观察保存在 .tiller/local/observations，标签不是任务事件：

- 07 至 15：登记既有设计/规划授权，规划登记及激活，开始 foundation。任务状态 revision 3，开始事件 2。
- 16、17、18：第一次运行预览与应用之间，宿主 CODEX_TOOL_CALL_ID 变化使环境摘要改变，17 在执行探针前拒绝。此项不是探针失败。两次预览仅 planId/environmentHash 不同；诊断只记录变量名和摘要。命令辅助入口此后将该宿主调用标识固定为同一个受控会话标签，其余环境保持不变，符合验证计划绑定当前进程环境的设计。
- 19、20：稳定环境后重新预览并实际运行探针。运行 e495e907-7873-4392-bf7d-163cc951f560，sequence 1，断言实际 0.4.0 不等于初始期望 0.0.0，退出 1，suitePassed=false，staleAfterExecution=false。
- 21：引用上述失败证据的 foundation verify 预览被拒绝，VERIFICATION_REQUIRED，未写成功事件。
- 22：downstream start 预览被 DEPENDENCY_NOT_VERIFIED 拒绝；foundation 当时仍 active。21/22 前后 tasks.json 字节摘要相同，revision 保持 3。没有应用这些被拒绝的预览。
- 2026-10-19T14:18:44.540Z：在读取真实失败和两项门禁拒绝之后，才将 probe.cjs 的版本期望从 0.0.0 修正到 0.4.0。
- 23、24：重新预览、实际执行通过。运行 84d743c5-5e92-4dc0-8bca-812d7a156adc，sequence 2，退出 0，suitePassed=true，staleAfterExecution=false。
- 25、26：foundation verify 预览及应用成功；revision 4，验证事件 3，technicalReady=true，无例外。
- 27、28：重新核对 foundation 当前有效验证后，downstream start 预览及应用成功；revision 5，开始事件 4。事件引用 foundation 验证事件 3 及其产物摘要。

### 此刻的持久接续点

本次执行者在 28 返回成功并读取 tasks.json 后停止推进。规划 t6-one；任务状态 revision 5；foundation 已验证，attempt-4652445baafba54321c25bf7；downstream 已开始但未验证，attempt-9743e5fa47b928eab421a051。docs/recovery.md 尚不存在，没有 downstream resume/verify、整体 ready 或验收记录。

这是执行者/上下文交接，不是程序崩溃，不声称后继接续已经发生。后继执行者应先读取本入口、authority/selfboot-scope.md、任务状态与原始观察，实际调用 work resume 和 task status；核对当前事实后，对 downstream 选择新的 operationId、当前 expectedRevision，逐条 preview/apply task resume。开始或接续不会自动完成交付。

随后由后继执行者编写 docs/recovery.md，准确记录失败、拒绝、修复和实际接续事实，按 inputs/downstream-selection.json 先 capture、再实际技术观察并 record，引用当前 evidence 验证 downstream。最后依据 inputs/delivery-selection.json 完成独立组合检查与整体门禁；技术观察不等于新增用户批准，不登记最终用户验收。每步继续单命令执行、读结果、再决定下一步。复用命令辅助入口以保持验证运行的环境一致；不要重跑准备脚本或覆盖原始观察。

此刻 tasks.json SHA256：d38cc44d36ed404d33f74890704608f7aa0cfddc4c631b5aef093c6087bceaa2。
当前 probe.cjs SHA256：a55552ce78f33310c5c7890f769bee390109eb5b7b509e083a3f6dd15737fbf3。

## 后继执行者完成记录

已实际执行29 work resume与30 task status，核对前置仍有效及下游active。31参数误用被拒绝，32/33按--task语法接续成功，产生事件5与新attempt。随后创建docs/recovery.md；34先采集，实际读取与核对后35登记独立观察；36/37验证下游成功，产生事件6，revision7。

38另行采集组合范围，实际重跑入口探针并核对接续说明、六项输入摘要和事件顺序后，39登记组合证据。40整体检查通过；41/42保存ready-after-actual-handoff回执；43再次检查仍technicalReady=true、operationAllowed=true、processEvidence=complete、issues=[]，交付摘要823653aa79b81bae50d319c707cf9f7a169e4b8ca16d37887fe408586b64fcd9和revision7均不变。

本受控T6自举的技术验证已完成。用户验收仍not-requested/confirmed=false，未执行项目提交、推送、合入或发布。该结果不代替tiller产品的完整回归及安装包冒烟，相关结果由原门禁工作统一维护。临时工程和真实观察保留；共享归档只保存事实，不自动迁移或创建新的批准。
