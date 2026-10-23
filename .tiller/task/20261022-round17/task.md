# 评审与发布环节，已验收任务按验收提交检查

<!-- tiller-task:v1 {"version":1,"id":"20261022-round17","type":"feature","size":"standard","created":"2026-10-22T23:43:03.505Z","base":"43b6cc13ce9053185325c6decbd2ddbe1f7428ba","scope":["src","test","resources","scripts","README.md","AGENTS.md",".github",".gitlab",".tiller/rules",".tiller/specs",".tiller/cases",".tiller/usage.md",".tiller/index.md",".tiller/project.json",".tiller/context"],"preExisting":{},"format":"structured","slug":"review-release","summary":"评审与发布环节，已验收任务按验收提交检查"} -->

## 需求

### 目标

补齐独立评审与发布 checklist，specs 未回写时 check 告警，支持从需求文件接入，并使已验收任务按验收时记录的提交做 check，避免后续代码漂移误报验证过期。

### 范围

- 做：独立评审 checklist（发现写入 task.md，阻塞项阻断 accept）、发布 checklist、specs 未回写时 check 告警、`--requirement-file`（或等价旗标）从需求文件接入、已验收任务按验收绑定提交做 check、规则/usage/README/specs/用例同步与历史回填。
- 不做：改写已验收任务的验收结论或提交历史、版本号变更、发布到 npm 的真实发包动作、新增冗余归档文档、实现本仓库 node:test 以外的测试框架适配。
- 涉及模块：workflow（review/release/check/accept/start 或等价接入）、verification、standards（规则、usage、必读预算）、specs 与 cases 目录。

### 验收条件

- AC-1: 评审 checklist 可用，发现写入 task.md；存在未清除的阻塞项时 accept 失败
- AC-2: 发布 checklist 可执行，并纳入 check 或明确阶段门禁
- AC-3: specs 未回写时 check 给出告警
- AC-4: 提供 --requirement-file 或文档约定的等价旗标，可从需求文件接入或关联
- AC-5: 已验收任务按验收绑定提交检查；抽测历史已验收任务不再因后续代码漂移误报验证过期（验收时本就不完整者可仍失败，原因须指向当时问题）
- AC-6: 规则/usage/README/specs/用例同步，版本 0.5.0，全量验证通过；历史任务不因本轮其它新规则出现无关新阻断类型

## 设计

### 方案

- 独立评审：在验收前提供可执行的评审 checklist（命令或明确阶段入口均可，需可 `check` 识别）。评审发现写入当前任务的 task.md（例如「评审」段或约定结构），每条标明是否阻塞。存在未清除的阻塞发现时，`accept` 必须失败；清除后才可验收。
- 发布 checklist：提供与项目发布准备对齐的可执行检查项（如 LICENSE/包名/CI/quickstart/版本与文档一致性等合理最小集合），纳入 `check` 或明确的发布阶段门禁；条目须可自动化或可明确判定通过/未通过。
- specs 回写告警：任务验收相关结论若尚未同步回 `.tiller/specs/`（或项目约定的回写痕迹缺失），`check` 给出告警（warn，不必然等同于阻断，除非现有规范已将未回写定为错误；本轮至少告警）。
- `--requirement-file`：为 `start`（或文档最终命名的等价命令/旗标）增加从需求文件读取/关联的最小能力，路径为工程相对路径；用法写入 usage/README；非法路径与空文件明确报错。
- 已验收任务按验收提交检查：对已验收任务，`check` 对照 acceptance 确认中记录的提交（而非当前工作区/HEAD）核实当时的验证绑定是否仍成立。实现可用 git show、临时 worktree 或记录的 tree 摘要。**当前未验收任务仍按工作区/HEAD 检查**，语义不得破坏。抽测若干历史已验收任务：实现后不应再仅因「代码后来变了」而误报验证过期；若验收当时验证本就不完整，仍可失败，但原因须指向当时问题。
- 文档与用例：规则、usage、README、specs、用例目录与本语义一致；版本保持 0.5.0；必读约 7000 字符，清晰优先可略超；过时内容直接删除不归档。新用例从 CASE-104 起（若仓库已更高则顺延）；被本轮行为改变的旧用例直接改。

### 取舍

- 已验收任务钉在验收提交，而非放宽「验证过期」规则：保留防伪与时效约束，同时消除历史任务被后续漂移误伤；代价是实现上要能安全读取历史树。
- 评审/发布用 checklist + task.md 记录，而非另建系统：与现有单一 task.md 事实源一致；发布项取可执行最小集，避免空泛清单。
- specs 未回写先告警：推动回写又不立刻阻断所有历史任务的 check。

### 影响与风险

- 受影响：`check`/`accept` 对已验收与未验收任务的分支逻辑、评审与发布 checklist 入口、`start`（或等价）新增需求文件旗标、task.md 结构（评审发现）、规则与文档、相关用例。
- 需回归：workflow 的 check/accept/start/pr，verification，standards 必读预算与文档一致性；对每个历史任务跑 `check` 并与基线对比阻断类型。
- 风险：误把当前任务也钉到旧提交；worktree/历史读取失败或权限问题；评审阻塞项状态机不清导致无法清除；发布 checklist 过宽拖垮日常 check。

## 确认

### requirements
- 确认部分：需求
- 对象：需求正文（目标、范围与验收条件）
- 确认人：ChukiChen
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 对象摘要：911f98c5a72b8810e7c5e8ec103d978b3ae18d6c39bff7b1baf82d9fc5d94c73
- 时间：2026-10-22T23:43:17.912Z

### design
- 确认部分：设计
- 对象：设计正文
- 确认人：ChukiChen
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 对象摘要：893022ca6ac69860d23720214b2478a5937fb463f85bb03aba8f46db3b85742a
- 时间：2026-10-22T23:43:18.001Z

### acceptance
- 确认部分：交付验收
- 对象：当前交付（需求、设计、验证与提交）
- 确认人：ChukiChen
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 对象摘要：746f36cc2be285122823409569fbf7d6a7ca85890197ab1c9cfb0d638c3e4ce6
- 时间：2026-10-23T01:46:24.519Z

## 验证

### run-1
- 条件：AC-1
- 测试：test/review-release.test.mjs::CASE-104 review findings persist and blocking findings stop acceptance
- 用例：CASE-104
- 命令：node '--test-name-pattern=^CASE-104 review findings persist and blocking findings stop acceptance$' --test-reporter=./.tiller/local/verify-TJrQ8j/reporter.mjs --test-reporter-destination=.tiller/local/verify-TJrQ8j/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-1.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:32.309Z

### run-2
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-105 release checklist is executable and exposed by check
- 用例：CASE-105
- 命令：node '--test-name-pattern=^CASE-105 release checklist is executable and exposed by check$' --test-reporter=./.tiller/local/verify-rMzhpz/reporter.mjs --test-reporter-destination=.tiller/local/verify-rMzhpz/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-2.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:34.185Z

### run-3
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-106 check warns when specs were not written back
- 用例：CASE-106
- 命令：node '--test-name-pattern=^CASE-106 check warns when specs were not written back$' --test-reporter=./.tiller/local/verify-n5JQlc/reporter.mjs --test-reporter-destination=.tiller/local/verify-n5JQlc/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-3.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:36.171Z

### run-4
- 条件：AC-4
- 测试：test/review-release.test.mjs::CASE-107 start loads requirement from a project-relative file
- 用例：CASE-107
- 命令：node '--test-name-pattern=^CASE-107 start loads requirement from a project-relative file$' --test-reporter=./.tiller/local/verify-FQhFRN/reporter.mjs --test-reporter-destination=.tiller/local/verify-FQhFRN/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-4.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:37.444Z

### run-5
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 accepted tasks verify against their acceptance commit
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 accepted tasks verify against their acceptance commit$' --test-reporter=./.tiller/local/verify-40celX/reporter.mjs --test-reporter-destination=.tiller/local/verify-40celX/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-5.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:38.542Z

### run-6
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 renamed tests after acceptance do not invalidate the accepted record
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 renamed tests after acceptance do not invalidate the accepted record$' --test-reporter=./.tiller/local/verify-IJwGJg/reporter.mjs --test-reporter-destination=.tiller/local/verify-IJwGJg/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-6.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:38.542Z

### run-7
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 accepted tasks still fail when acceptance evidence was not verified
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 accepted tasks still fail when acceptance evidence was not verified$' --test-reporter=./.tiller/local/verify-FjYaV3/reporter.mjs --test-reporter-destination=.tiller/local/verify-FjYaV3/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-7.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:38.542Z

### run-8
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 invalidated acceptance falls back to the current workspace
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 invalidated acceptance falls back to the current workspace$' --test-reporter=./.tiller/local/verify-SSdilq/reporter.mjs --test-reporter-destination=.tiller/local/verify-SSdilq/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-8.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:38.542Z

### run-9
- 条件：AC-6
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 命令：node '--test-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' --test-reporter=./.tiller/local/verify-3xXnmR/reporter.mjs --test-reporter-destination=.tiller/local/verify-3xXnmR/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-9.log
- 提交：43b6cc13ce9053185325c6decbd2ddbe1f7428ba
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:44.705Z

### run-10
- 条件：AC-1
- 测试：test/review-release.test.mjs::CASE-104 review findings persist and blocking findings stop acceptance
- 用例：CASE-104
- 命令：node '--test-name-pattern=^CASE-104 review findings persist and blocking findings stop acceptance$' --test-reporter=./.tiller/local/verify-bste07/reporter.mjs --test-reporter-destination=.tiller/local/verify-bste07/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-10.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:45:59.802Z

### run-11
- 条件：AC-2
- 测试：test/review-release.test.mjs::CASE-105 release checklist is executable and exposed by check
- 用例：CASE-105
- 命令：node '--test-name-pattern=^CASE-105 release checklist is executable and exposed by check$' --test-reporter=./.tiller/local/verify-ts2q3G/reporter.mjs --test-reporter-destination=.tiller/local/verify-ts2q3G/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-11.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:01.694Z

### run-12
- 条件：AC-3
- 测试：test/review-release.test.mjs::CASE-106 check warns when specs were not written back
- 用例：CASE-106
- 命令：node '--test-name-pattern=^CASE-106 check warns when specs were not written back$' --test-reporter=./.tiller/local/verify-qOb5sx/reporter.mjs --test-reporter-destination=.tiller/local/verify-qOb5sx/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-12.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:03.676Z

### run-13
- 条件：AC-4
- 测试：test/review-release.test.mjs::CASE-107 start loads requirement from a project-relative file
- 用例：CASE-107
- 命令：node '--test-name-pattern=^CASE-107 start loads requirement from a project-relative file$' --test-reporter=./.tiller/local/verify-cbFAwS/reporter.mjs --test-reporter-destination=.tiller/local/verify-cbFAwS/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-13.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:04.932Z

### run-14
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 accepted tasks verify against their acceptance commit
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 accepted tasks verify against their acceptance commit$' --test-reporter=./.tiller/local/verify-t1h19u/reporter.mjs --test-reporter-destination=.tiller/local/verify-t1h19u/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-14.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:06.039Z

### run-15
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 renamed tests after acceptance do not invalidate the accepted record
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 renamed tests after acceptance do not invalidate the accepted record$' --test-reporter=./.tiller/local/verify-eAP9cU/reporter.mjs --test-reporter-destination=.tiller/local/verify-eAP9cU/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-15.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:06.039Z

### run-16
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 accepted tasks still fail when acceptance evidence was not verified
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 accepted tasks still fail when acceptance evidence was not verified$' --test-reporter=./.tiller/local/verify-vCbxD8/reporter.mjs --test-reporter-destination=.tiller/local/verify-vCbxD8/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-16.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:06.039Z

### run-17
- 条件：AC-5
- 测试：test/review-release.test.mjs::CASE-108 invalidated acceptance falls back to the current workspace
- 用例：CASE-108
- 命令：node '--test-name-pattern=^CASE-108 invalidated acceptance falls back to the current workspace$' --test-reporter=./.tiller/local/verify-SszSHe/reporter.mjs --test-reporter-destination=.tiller/local/verify-SszSHe/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-17.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:06.039Z

### run-18
- 条件：AC-6
- 测试：test/review-release.test.mjs::CASE-109 repository docs and suite include review release and pinned checks
- 用例：CASE-109
- 命令：node '--test-name-pattern=^CASE-109 repository docs and suite include review release and pinned checks$' --test-reporter=./.tiller/local/verify-h5uAfH/reporter.mjs --test-reporter-destination=.tiller/local/verify-h5uAfH/report.jsonl test/review-release.test.mjs
- 结果：passed
- 退出码：0
- 来源：executed
- 核实：已核实
- 日志：.tiller/local/logs/20261022-round17/run-18.log
- 提交：8ae40a11fddf5f30370911d26f86525022cf6b4d
- 代码树摘要：43b788392f800d17537ad94e2ef91dd8926449c0c200af40157f71c50f9c35e4
- 时间：2026-10-23T01:46:12.586Z

## 自检

- [x] 需求确认有效
- [x] 设计确认有效
- [x] 验收条件均有当前通过且绑定全局用例的测试引用
- [x] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 验证命令已执行且测试输出已核实
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 评审无未清除阻塞项
- [x] 记录不含密钥或本机绝对路径

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria。
- 本次改动涉及模块 initialization：建议回归该模块 19 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 10 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 28 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 50 条用例及经过它的场景 CASE-055, CASE-001。
