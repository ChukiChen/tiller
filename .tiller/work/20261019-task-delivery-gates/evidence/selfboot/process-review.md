# T6 真实自举过程独立复核

复核范围截至观察 40（2026-10-19 14:44:20.499 UTC）。读取 gates-selfboot-state 指向的临时工程原始 observations、实际 tasks/confirmations/verification-runs 关联数据、技术观察正文、范围及真实确认来源，并与共享观察核对。复核者没有运行 CLI、测试或修改临时工程、产品；仅创建本报告。

结论：现有记录支持“实际探针失败 → 两项受控预览拒绝 → 执行者修复 → 实际重跑通过 → 前置验证 → 下游开始 → 执行者交接与新 attempt 接续 → 下游验证 → 独立组合观察 → 整体 check”的顺序。未发现这一范围内的越权批准、倒填成功事件或人工结果绑定错位。**截至本报告，ready 回执及写入后的再次 check 尚未核验，不宣称整个 T6 完成；整体技术通过不等于用户验收。**

## 原始时间顺序及拒绝性质

01～39 原始观察均具有 startedAt/finishedAt，逐条调用开始晚于上一条结束；00 初始化的共享观察早于 01。关键顺序如下（UTC）：

| 观察 | 实际时间与事实 | 复核判断 |
|---|---|---|
| 17 执行计划应用 | 14:13:12.634～14:13:19.566，退出 1，OPERATION_FAILED：测试执行计划已变化 | **执行前拒绝**，没有执行记录，不能充当探针失败。 |
| 20 探针真实失败 | CLI 14:15:44.748～14:16:00.637；子进程 14:15:51.675～14:15:52.920，exitCode=1、suitePassed=false | 真实运行 `node probe.cjs`，断言实际 0.4.0 与故意预期 0.0.0 不同；run e495e907-7873-4392-bf7d-163cc951f560、sequence=1 留存。 |
| 21/22 门禁拒绝 | 21 14:16:37.137～14:17:37.404：VERIFICATION_REQUIRED；22 14:17:46.372～14:18:25.968：DEPENDENCY_NOT_VERIFIED | 均是 `--plan`，exitCode=1、changed=false、operationAllowed=false、revision=3；没有尝试被拒的 apply，不宣称验证了该路径。 |
| 修复及 24 重跑 | probe-correction 14:18:44.540，晚于两项拒绝；24 子进程 14:19:23.758～14:19:25.019，退出 0 | 只改实际探针预期；新 run 84d743c5-5e92-4dc0-8bca-812d7a156adc、sequence=2，旧失败保留。 |
| 26/28 | 26 完成 14:22:38.589；28 开始 14:23:45.763、完成 14:25:35.504 | 前置验证完成后才开始下游受控应用。 |
| 交接、29/30 | handoff 14:26:37.462；29 work resume 14:27:30.805；30 task status 完成 14:29:33.473 | 前置 verified、下游 active、revision=5；30 返回 exitCode=1 是尚未整体就绪，不能写成查询失败或全部通过。 |
| 31、32/33 | 31 位置参数错误退出 2；改为 `--task` 后 32 预览、33 应用完成 14:33:23.036 | 参数错误是独立拒绝；后续成功接续产生新 attempt。 |
| 34/35 | capture 完成 14:35:02.726；人工观察结束 14:35:54.236；record 开始 14:35:54.487 | 结果晚于 capture 和记录中的实际阅读核对。 |
| 37/38/39 | 下游验证应用完成 14:40:26.592；组合 capture 完成 14:40:48.787；组合探针 14:41:17.513～14:41:18.589；record 14:41:46.246～14:41:58.988 | 任务完成后另做组合观察，没有拿任务结果自动替代组合结果。 |
| 40 整体 check | 14:42:31.132～14:44:20.499，退出 0 | technicalReady=true、operationAllowed=true、processEvidence=complete、issues=[]；acceptance=not-requested、confirmed=false。 |

拒绝前状态摘要于 14:16:21.623 保存为 `1833e8a9617c665c4124f877b8beb927adbdb4ca6ca77e71ddb843c2958aedbe`；rejections-state-check 在两次拒绝后记录同一摘要及 revision=3。当前 operations 中也没有 verify-foundation-failed 或 start-downstream-blocked 成功事实。此证据覆盖两次只读预览不写状态，不扩大为宿主不能直接改文件。

## 事件和接续

实际 tasks.json 为 revision=7；本次读取 SHA-256 为 `63b454acb8671eb3e596e761f81992c7ac045de05d9af8074fb71bf2fe7f775a`。

| 事件 | 时间 UTC | 身份及依赖 |
|---|---|---|
| 1 planning-activated | 14:08:04.515 | t6-one |
| 2 foundation task-started | 14:11:09.450 | attempt-4652445baafba54321c25bf7 |
| 3 foundation task-verified | 14:21:32.732 | 同一 attempt，startEventSequence=2，引用实际通过运行 |
| 4 downstream task-started | 14:24:21.327 | attempt-9743e5fa47b928eab421a051，依赖 foundation eventSequence=3 |
| 5 downstream task-resumed | 14:32:04.097 | 新 attempt-20a2f8fff93b0a0e5a135d3f，仍依赖事件 3 |
| 6 downstream task-verified | 14:38:50.494 | 新 attempt、startEventSequence=5，仍依赖事件 3 |

事件 4/5/6 引用相同前置产物摘要 `7ee386a5bfd1ac76af0661c78108152aa3c3a51e9316253ec04d2cf31c70febd`。handoff 保存下游尚未验证、说明尚不存在、未执行 resume 的时点；后继实际读取持久资料并执行 29/30，然后形成 5/6。旧开始事件和 attempt 保留。可称真实执行者/上下文交接与接续，**不能称程序崩溃、强杀或故障注入恢复**。

## 人工技术观察、对象及授权

- recovery-review：capture e40eebdf-2922-4eb7-86cc-41c08a46e0ad → reported 0b2c6dd1-a485-4a94-8e54-a4af44c42607；combined-review：capture d93a807e-ab5a-4de4-ba13-bc20bdafc8b4 → reported 1013bf2e-d03d-4130-a1c2-b4c12957f054。两对 captureId 正确，完整 bindings 相同；当前受检输入与独立证据正文摘要逐项复算一致。
- recovery 观察限说明、探针及先前真实操作事实；combined 观察明确另运行探针、读说明并核对六项输入：探针、说明、固定入口、包来源、candidate.tgz、需求来源。combined-probe.json 的实际运行处于 capture 之后、record 之前，退出 0。上述人工检查属于执行者技术判断，不是新的用户批准，也不声称机器可认证阅读行为或来源身份。
- 当前 confirmations 仅 requirements/design/planning 三项既有 T6 决定，未出现 acceptance/release。sourceReview 时间分别为 13:54:42.768、14:01:55.697、14:05:44.487，均晚于对应新 request 完成且早于 record。来源明确机器展示晚于原用户决定，只复核既有授权适用性；scope 仅为“ T6 安装与顺序自举”。
- selfboot-scope 和 planning sourceReview 已明确原批准规划摘要与后续进度快照不同；没有把当前 plan.md 冒称批准时原字节。register 的理由已收紧为“不新增业务要求或用户批准节点”，与 manual 技术观察一致。
- 故意失败及修复、依赖任务和交接均在原 T6 验证范围内，没有新业务产品、外部仓库变更或 Git/发布操作。机器 approval 字段不得在最终报告中描述为新一轮用户确认。

## 环境、共享证据及仍待核验项

environment-drift 记录两个独立宿主调用只发现 CODEX_TOOL_CALL_ID 改变，保存变量名与前后摘要而非值。当前单命令 helper 继承 process.env，仅固定这个宿主传输标识；每次只执行显式选择的一条 CLI 命令并独占新证据标签，没有自动串接批准或忽略失败的逻辑。17 的守卫拒绝与 20 的探针失败分别报告是正确的。此处只证明所记录的环境比较与 helper 行为，不宣称穷尽所有运行环境变化。

共享观察部分本机路径已规范化，较早的嵌套 stdout 仍可能含转义的临时路径；原始 local 观察保留。共享文本因此不必与原始字节相等，机器输入/证据对象摘要以临时工程实际记录为准。报告未复制这些本机路径或环境原值。

40 的整体摘要为 `823653aa79b81bae50d319c707cf9f7a169e4b8ca16d37887fe408586b64fcd9`。后续须另核对 ready 预览/应用及再次 check，确认回执记账没有使证据自身失效；该结果未包含于本次复核。此单仓库自举也不替代产品全量、两必要业务仓库负例、最终打包烟测、其他操作系统或性能指标验证。用户验收明确未请求，不能以此报告登记或推断验收。

## 后续复核：41～43 已完成

保留上文截至观察 40 的当时判断。后续独立读取临时工程原始 41-ready-preview、42-ready-apply、43-delivery-recheck，以及实际回执和 tasks.json；未重新执行任何命令或测试。

- 41 于 14:44:36.204～14:46:00.056 UTC 完成，退出 0，changed=false。42 在其结束后于 14:46:30.339 开始，14:51:48.373 结束，退出 0，耗时 318032 ms，changed=true、historical=false；应用使用的 planId 与 41 完全相同。
- 实际保存 `delivery-checks/ready-after-actual-handoff.json`，其全部持久字段逐项与 42 输出相同；回执 SHA-256 为 `f46c4770d8aa895a608c81c524fe12c723f99d31f45f0aadb7e0230347b550e2`。回执 scope 仍为本次 T6 单仓库自举，输入仍引用独立组合结果 1013bf2e-d03d-4130-a1c2-b4c12957f054，exceptionRefs 为空，disposition=ready。
- 43 于 14:52:41.693～14:54:30.811 完成，退出 0。40、41、42 回执及 43 的 basisDigest 均为 `823653aa79b81bae50d319c707cf9f7a169e4b8ca16d37887fe408586b64fcd9`，revision 均为 7；43 仍 technicalReady=true、operationAllowed=true、processEvidence=complete、issues=[]。当前 tasks.json 摘要仍是上文的 `63b454acb8671eb3e596e761f81992c7ac045de05d9af8074fb71bf2fe7f775a`，证明本次 ready 记账未改变任务状态或使其自身依据失效。
- 43 的验收仍为 not-requested、confirmed=false。41/42 的 not-evaluated 是技术内核未自动评估验收，不是验收通过。

至此，本次 G-AC-14 要求的真实 AI 失败、受控拒绝、补足重试、执行者接续和整体检查链已形成，并额外完成就绪回执及再次核对。结论仅限本次受控样例，仍保留只读预览拒绝、无崩溃、无用户验收、无实际 Git/发布的边界；全量回归及最终打包验证尚待各自结果，不能据本报告宣称整个 T6 已完成。
