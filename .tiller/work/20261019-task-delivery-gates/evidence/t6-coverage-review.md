# T6 交付覆盖只读复核

复核对象：已确认 requirements.md 的 G-AC-01～14、plan.md 放行条件、当前测试实际断言及 T1～T5 当场日志。只读检查，没有重跑测试或修改产品。此记录形成时 T6 全量回归、安装及真实自举仍在进行；不将中间输出、合成夹具或准备好的输入称为最终通过或用户验收。

## 验收矩阵

下列测试文件均位于项目 test/；日志均位于本 evidence/。阶段通过仅对应其当时摘要，最终候选还须以冻结全量结果核对。

| 需求/行为 | 实际测试与既有证据 | 剩余缺口或边界 |
|---|---|---|
| G-AC-01 图、覆盖及登记不产生批准 | planning.test.mjs：`planning validates graph...` 的重复、未知、自依赖、循环、漏覆盖变异；`registration is immutable...` 断言 activePlanning=null；t2-planning.log | 未发现必要断言缺口；最终版本全量待结束。 |
| G-AC-02 精确规划确认、变化重核、有效批准复用 | planning.test.mjs：精确展示、撤销、plan.md 漂移、修订旧批准拒绝；tasks.test.mjs：修订保留 foundation/independent、下游失效；t2-planning.log、t4-tasks.log | 测试组合覆盖确认有效性与任务门禁；不把规划批准当具体规格批准。 |
| G-AC-03 无运行证据阻断下游，独立任务可行 | tasks.test.mjs 首条：manual-only 后 verify 拒绝、downstream start 拒绝、independent start/verify 成功，实际 runtime 后放行；t4-tasks.log | 合成夹具已验证；真实 AI 顺序另见 G-AC-14。 |
| G-AC-04 缺产物、占位、生成证据拒绝 | task-artifacts.test.mjs：缺失、TODO、目录新增/删除、生成输出/来源漂移、可选缺项；tasks.test.mjs 对 verify 的缺项/占位/缺 runtime 拒绝；t4-artifacts-final.log、t4-tasks.log、t4-optional-final.log | 正文检查不证明语义正确；生成来源声明不认证观察者身份。 |
| G-AC-05 套件与用例区别、人工证据版本 | verification-runs.test.mjs：`suite exit zero...`、失败/超时/溢出；verification-selection.test.mjs：manual inputs、latest attempt、execution/manual 分离、多检查聚合；t3-verification.log、t3-verification-final.log | 实际输入需显式声明，不自动发现遗漏依赖。 |
| G-AC-06 局部范围、跨模块选择、禁止空集 | verification-selection.test.mjs：`scoped evaluation ignores unrelated gaps...` 保留 REQ-B/security 警告、空 checks 拒绝；verification-cases.test.mjs 跨模块/系统结构校验；planning.test.mjs 空必要集合拒绝；t3-verification.log、t3-verification-final.log、t2-planning.log | 场景选择是否充分仍需评审，不能把允许局部检查解释为可随意排除相关场景。 |
| G-AC-07 实际事件顺序、不补造历史 | tasks.test.mjs 断言 predecessor.sequence < dependent.sequence 且 dependencies 精确指向事件；task-records.test.mjs 拒绝未开始 attempt、错误序号；t4-tasks.log、t4-task-records-final.log | 合成事件测试不能替代实际 AI 推进证据。 |
| G-AC-08 上游漂移使下游重核、历史保留 | tasks.test.mjs：foundation/downstream stale、independent verified、resume 新 attempt、旧证据拒绝、旧事件仍在；overall-delivery.test.mjs：旧回执内容不改且 matches=false；t4-tasks.log、t5-overall.log | 不保证拦截宿主在检查后继续改文件。 |
| G-AC-09 恢复、幂等、并发与未知结果 | tasks.test.mjs：重放 changed=false、operation 冲突、并发 revision 拒绝；task-records.test.mjs：写后失败只还原自身字节，保留外部并发修改；delivery-actions.test.mjs：`unknown external operation blocks replay...`；t4-task-records-final.log、t4-tasks.log、t5-bindings-git.log | 本地事务和守卫测试，不是跨仓库/远端分布式原子事务保证。 |
| G-AC-10 必要组合验证、检查点、就绪非验收 | overall-delivery.test.mjs：任务完成后仍缺组合验证、缺 checkpoint、只读/ready/receipt 稳定；delivery-gate-bindings.test.mjs：同对象验收/发布及漂移；t5-overall.log、t5-bindings-git.log | 首轮绑定组 36/37，有一次夹具清理失败；修后例外单测 t5-bindings-exception-retry.log 已过。两条共享基线连续执行仍待 T6 全量。 |
| G-AC-11 文档与增量 Git 独立、合入当前门禁 | delivery-gate-bindings.test.mjs：`document acceptance remains independent`；delivery-actions.test.mjs：显式 commit/push 成功、缺整体绑定 merge 拒绝；merge-confirmations.test.mjs：OID/检查/文档漂移失效；t5-bindings-git.log | 当前适配不支持源/目标双 OID 原子保护，实际自动 merge 仍拒绝；没有真实远端成功合入验证，不能声称支持。 |
| G-AC-12 有界例外、失败保留、旧记录拒绝保留 | task-exceptions.test.mjs：跨任务/操作/摘要拒绝、撤销、excepted 不传递技术通过；delivery-gate-bindings.test.mjs 发布独立例外；work/confirmation/verification/delivery 旧版负例；t1-work.log、t1-confirm.log、t1-verification.log、t1-delivery-regression.log、t5-task-exceptions.log、t5-bindings-exception-retry.log | 旧格式拒绝不是旧格式兼容；fixtureDecision 明确是合成来源，不代表真实用户授权。 |
| G-AC-13 两种模式与多业务仓库缺口 | tasks.test.mjs、overall-delivery.test.mjs 的 workspace 链；task-artifacts.test.mjs 身份/管理根绕过；verification-runs.test.mjs 注册路径；t4-tasks.log、t5-overall.log | **直接覆盖缺口：现有门禁 workspace 夹具仅管理根 + 一个业务仓库。尚缺两个必要业务仓库同时在范围内，一仓通过而另一仓缺项/漂移时整体拒绝的断言。已报告主代理，拟独立补齐。** |
| G-AC-14 真实 AI 失败→拒绝→补足→重试→接续 | 已批准 T6 自举范围、selfboot/ 已保存执行步骤；来源/范围独立只读复核完成 | **仍在进行，当前不能标通过。** 必须取得实际失败、拒绝、修复、依赖启动、另一执行者接续和整体检查顺序，明确宿主可直接写入与受控拒绝之别。 |

## 规划放行条件核对

T1 新格式基础、严格解析和文件保护有分组证据；T2 登记/激活/不可变修订有 9 项首轮及 2 项最终解析补验；T3 首轮 38 项、最终受影响 29 项（不是合计 67 个独立用例）；T4 两条完整链及最终产物/CLI/可选/状态定向证据；T5 整体两种模式、任务例外及确认/Git 有当场记录。历史修前失败和修后验证均保留，不把后续结果倒填先前事件。

T6 尚有三项硬性收尾：冻结版本完整回归（含修后的绑定共享基线连续运行）、最终安装包固定入口/新格式/旧记录拒绝、真实自举完整事件链。另须补齐 G-AC-13 直接负例。规则资源更新和静态文案检查不能替代这些行为验证。

## 九类适用性及最终报告边界

| 类别 | 本增量实际适用性与证据 | 可报告范围/限制 |
|---|---|---|
| 单元 | 适用：规划图、状态、摘要、例外、产物集合和解析变异 | T2～T5 定向已验证，候选全量待结束。 |
| 接口 | 适用：strict schema、未知字段、CLI flags/退出、revision、幂等 | gates-cli、records、confirmation 测试；最终安装入口仍待完成。 |
| 集成 | 适用：确认→规划→任务→验证→交付、两种模式 | 已有完整链；两必要业务仓库缺口须补。 |
| 场景 | 适用：失败阻断、修复、独立任务和接续 | 自动夹具已过；真实 AI 自举未完成。 |
| 性能 | 适用为容量/耗时基线 | 实测 Windows 长链：T2 806.06 秒；T4 两链 1563.43 秒；T5 overall 两链 1198.65 秒、绑定例外单项 1373.09 秒。产物总集合上限 1000 文件/64 MiB、目录 64 层/1000 个；1001 文件引用溢出负例已覆盖。没有响应阈值或大规模吞吐基准，不宣称性能达标。 |
| 安全 | 适用：路径/链接/仓库越权、控制资料、证据自证、例外扩大、恶意记录 | 自动负例验证受控边界；不认证用户身份/人工观察真实性，不阻止宿主直接写文件或 Git。 |
| 可靠性 | 适用：漂移、事务失败、幂等、未知外部结果、历史与当前分离 | 本地/模拟适配场景；无跨仓库原子合入保证。 |
| 兼容性 | 适用：当前格式与 Windows 实际入口 | Windows 有阶段实测；macOS/Linux 未实际验证。旧格式拒绝不等于兼容支持；不自动迁移或继承批准。 |
| 易用性 | 适用：定位阻断与下一动作、四维状态、文档/整体区分 | CLI、资源文本和示例检查；没有独立用户可用性研究，真实接续尚在进行。 |

自举小样例中的 not-applicable 仅限其局部选择，不能沿用为本产品增量的九类排除。以上为覆盖审查结论，不是整体技术就绪、用户验收或发布许可。

## 后续证据：补齐 G-AC-13 与 G-AC-14

保留前文在审查时发现的缺口及当时进行中状态；以下为后来取得并独立只读核对的结果，不倒填原审查结论。

- **G-AC-13 直接负例已补齐。** `test/overall-multi-repository.test.mjs` 的 `one required business repository cannot mask another missing or stale output in overall delivery` 追加定向回归 1/1 通过，0 失败、0 跳过，退出 0，总耗时 1398.843 秒。见 [日志](t6-multi-repository.log)、[结果与来源](t6-multi-repository-result.json)、[测试摘要](t6-multi-repository-content.json)。实际断言：两个业务仓库均属必要交付，A 完成但 B 未完成时整体拒绝；A/B 和组合检查通过后就绪；B 漂移使旧回执失效，A 仍有效；B 文件删除后 ready 应用拒绝，旧回执及任务状态原字节保留。这是追加定向执行，不包含在原全量启动时的文件集合中，不能混称一次完整全量的通过数量。
- **G-AC-14 真实自举链已完成。** [独立过程复核](selfboot/process-review.md)核对原始观察及实际持久事实，覆盖真实探针失败 20、预览拒绝 21/22、修复重跑 24、前置验证 26、下游开始 28、真实执行者交接及接续 29～33、下游技术观察/验证 34～37、独立组合检查 38/39，以及整体 check/ready/recheck 40～43。41～43 均退出 0；ready 记账后 revision=7、basisDigest 不变、任务状态字节不变，技术和过程检查仍通过；验收仍 not-requested/confirmed=false。没有把执行前环境拒绝 17 充当探针失败，也没有把执行者交接冒称崩溃恢复。

本次追加关闭上述两项特定覆盖缺口。全量会话 97284 和最终 package 验证仍待完成；其他操作系统、性能阈值、真实远端合入和最终用户验收边界保持不变。此补充未运行 CLI 或重跑测试，结果来自保存的实际日志、原始观察及持久对象复核。
