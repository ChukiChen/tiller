# 第8轮：任务阶段、关闭与重开，删除规格归档

<!-- tiller-task:v1 {"version":1,"id":"20261022-round8","type":"feature","size":"standard","created":"2026-10-22T03:54:14.861Z","base":"7de723d9ff68ed03e0e46c4f1f4e9dea6c5f01d8","scope":["src","test","resources","scripts","README.md","AGENTS.md",".tiller/cases",".tiller/context",".tiller/index.md",".tiller/project.json",".tiller/rules",".tiller/specs",".tiller/usage.md"],"preExisting":{".tiller/specs/archive/decisions-2026-10-22.md":"32ffa85174135888d101550b44f7a88788e3bf8f33f7c05bf4b1cd2e8698c93d",".tiller/specs/archive/design-2026-10-22.md":"059550cd80c180fb37b300c45ca7feb679225c39503e685d6b2b42c06c9838c9",".tiller/specs/archive/modules-initialization-design-2026-10-22.md":"f0e78cdd9a66577076b5e748d8a71461a1988567e758b3e26084a8d334ca985f",".tiller/specs/archive/modules-initialization-requirements-2026-10-22.md":"a705eca3c3abf374737573b3efc98a286f1cc200accc628a9b7e13a8242ce055",".tiller/specs/archive/modules-standards-design-2026-10-22.md":"f8dfc9a2c35f51dab4cda2f1c480e1ab22abd39196c30873c31f14f43e028098",".tiller/specs/archive/modules-standards-requirements-2026-10-22.md":"df275a2819d76764b12ff0545b271493ee5608c48f5d3da330d817c520408183",".tiller/specs/archive/modules-verification-design-2026-10-22.md":"3ac73935b60dab3560fea7bc3d5117cb786cf5d1accdb0339891da45d8f5ae7b",".tiller/specs/archive/modules-verification-requirements-2026-10-22.md":"9c1eb0ed0fcc613b861fa68e6ff861618184ae8be7044388e00e5198f029f1dd",".tiller/specs/archive/modules-workflow-design-2026-10-22.md":"78ebb78516f51c31f939aa18477297648839b372c7d511ee8332a188700307d3",".tiller/specs/archive/modules-workflow-requirements-2026-10-22.md":"313b6bb40e66314bf58d9338b1c9c04540daf287d49b96161e06a95220fd7dd2",".tiller/specs/archive/requirements-2026-10-22.md":"ce4c58b2483855ffd4bc2586e85f4872a866be2fda97d3602a6cef598aa67563"}} -->

## 需求

为默认流程补齐可推导任务阶段、关闭/放弃/重开语义，并彻底删除 specs 归档及所有引导引用，保持轻量与版本不变。

## 验收条件

- AC-1: specs/archive 目录及全部归档引用被删除，现行文档和用例不指向归档
- AC-2: task 阶段由 task.md 事实推导，确认或验证失效时回退并说明原因，resume 与 plan status 显示阶段
- AC-3: 已验收任务可 close，关闭后 confirm/verify/accept 被阻塞，reopen 后可继续
- AC-4: 未验收任务可 close --abandon，plan 条目不把放弃任务算作进行中或已验收
- AC-5: 文档、帮助、全局用例与具名测试同步，必读资料不超过约 5000 字符且版本号不变

## 设计

### 方案

- 阶段推导：读取 task.md 中的需求/设计确认、验证、验收及关闭事实，推导“已开始 → 需求已确认 → 设计已确认（small 跳过）→ 已验证 → 已验收 → 已关闭/已放弃”，不新增可漂移的状态字段。需求或设计摘要失效、验证代码树过期时回退阶段并说明原因。
- 关闭与重开：`close` 只收尾已验收任务，`close --abandon` 终止未验收任务；两者都必须填写原因并记录时间，终态阻塞 confirm、verify 和 accept。`reopen` 必须填写原因，恢复后按 task.md 事实重新推导阶段；`plan status` 不把放弃项计为进行中或已验收。
- 规格清理：物理删除 `.tiller/specs/archive/` 及全部归档引用，现行 specs、README、AGENTS、usage、rules 和 cases 只指向有效章节，资源与包版本保持不变。

### 取舍

阶段保留为推导值而非额外存储字段，避免状态与记录漂移；不增加批量归档命令，历史直接由 git 保存。已验收关闭与未验收放弃分开表达，避免把终止任务误算为交付完成。保留显式 `reopen` 基础命令，使重新开工留下原因与时间，而不是要求手工编辑任务记录。

### 影响与风险

- 受影响：`src/flow.ts`、`src/plans.ts`、`src/cli.ts`、任务记录解析与帮助、工作流规格和全局用例。
- 需回归：阶段推导与失效回退、close/close --abandon/reopen 的终态限制、plan status 统计、归档引用检查及必读资料预算。
- 风险：历史任务格式差异较大，阶段推导需兼容旧记录，且不能把缺失事实误判为已完成。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 对象摘要：9ed008ef0294656c18ad1e6ea0c2b87cd320fcad6eaa1a45712234d674a2422d
- 时间：2026-10-22T07:38:57.053Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 对象摘要：e65b85d6a872dd5c7aa46bcb557afb42b49cc92b09d2260baba00aefd6b17f8d
- 时间：2026-10-22T07:38:57.125Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 对象摘要：b58ecf4153f403d6ec2452e21071c6602a00cacc352f09bcbcaa5df9607e2d66
- 时间：2026-10-22T07:39:18.506Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/first-batch.test.mjs::specs archive is removed and active guidance has no archival references
- 用例：CASE-059
- 命令：node --test --test-name-pattern="specs archive is removed and active guidance has no archival references" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：5ea4e321b63e917f6554a9ef06b89c1feb9a155cf7679711a0520d3985dd5ad2
- 来源：executed
- 时间：2026-10-22T07:37:18.543Z

### run-2
- 条件：AC-5
- 测试：test/first-batch.test.mjs::specs archive is removed and active guidance has no archival references
- 用例：CASE-059
- 命令：node --test --test-name-pattern="specs archive is removed and active guidance has no archival references" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：5ea4e321b63e917f6554a9ef06b89c1feb9a155cf7679711a0520d3985dd5ad2
- 来源：executed
- 时间：2026-10-22T07:37:18.543Z

### run-3
- 条件：AC-2
- 测试：test/first-batch.test.mjs::task stages derive from task facts and fall back on invalid confirmation or stale verification
- 用例：CASE-056
- 命令：node --test --test-name-pattern="task stages derive from task facts and fall back on invalid confirmation or stale verification" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：5ea4e321b63e917f6554a9ef06b89c1feb9a155cf7679711a0520d3985dd5ad2
- 来源：executed
- 时间：2026-10-22T07:37:22.713Z

### run-4
- 条件：AC-3
- 测试：test/first-batch.test.mjs::accepted tasks close, block further confirm verify and accept, and reopen for another delivery
- 用例：CASE-057
- 命令：node --test --test-name-pattern="accepted tasks close, block further confirm verify and accept, and reopen for another delivery" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：5ea4e321b63e917f6554a9ef06b89c1feb9a155cf7679711a0520d3985dd5ad2
- 来源：executed
- 时间：2026-10-22T07:37:26.918Z

### run-5
- 条件：AC-4
- 测试：test/first-batch.test.mjs::abandoned tasks are terminal, reopenable, and not counted as active or accepted plan work
- 用例：CASE-058
- 命令：node --test --test-name-pattern="abandoned tasks are terminal, reopenable, and not counted as active or accepted plan work" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：5ea4e321b63e917f6554a9ef06b89c1feb9a155cf7679711a0520d3985dd5ad2
- 来源：executed
- 时间：2026-10-22T07:37:30.536Z

### run-6
- 条件：AC-1
- 测试：test/first-batch.test.mjs::specs archive is removed and active guidance has no archival references
- 用例：CASE-059
- 命令：node --test --test-name-pattern="specs archive is removed and active guidance has no archival references" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:00.142Z

### run-7
- 条件：AC-5
- 测试：test/first-batch.test.mjs::specs archive is removed and active guidance has no archival references
- 用例：CASE-059
- 命令：node --test --test-name-pattern="specs archive is removed and active guidance has no archival references" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:00.142Z

### run-8
- 条件：AC-2
- 测试：test/first-batch.test.mjs::task stages derive from task facts and fall back on invalid confirmation or stale verification
- 用例：CASE-056
- 命令：node --test --test-name-pattern="task stages derive from task facts and fall back on invalid confirmation or stale verification" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:04.563Z

### run-9
- 条件：AC-3
- 测试：test/first-batch.test.mjs::accepted tasks close, block further confirm verify and accept, and reopen for another delivery
- 用例：CASE-057
- 命令：node --test --test-name-pattern="accepted tasks close, block further confirm verify and accept, and reopen for another delivery" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:09.133Z

### run-10
- 条件：AC-4
- 测试：test/first-batch.test.mjs::abandoned tasks are terminal, reopenable, and not counted as active or accepted plan work
- 用例：CASE-058
- 命令：node --test --test-name-pattern="abandoned tasks are terminal, reopenable, and not counted as active or accepted plan work" test/first-batch.test.mjs
- 结果：passed
- 退出码：0
- 提交：b6a9179b3ea691ffa2fce9e528d3bb81969bdd23
- 代码树摘要：821bd771bc27c7587be2a3835b929d17aed9295ef55bc8ec2a371b29e3421d29
- 来源：executed
- 时间：2026-10-22T07:39:13.510Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。
- 本次改动涉及模块 initialization：建议回归该模块 14 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 3 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
