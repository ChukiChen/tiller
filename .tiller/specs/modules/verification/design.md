# 验证与反馈设计

> 依据：[验证与反馈需求](requirements.md)。
> 状态：实施依据；此文不表示所有设计已实现或所有平台已经验证。

## 1. 组织与职责

验证定义、测试实现、执行事实分开维护。配置登记结构化引用和执行入口，用例描述预期行为，项目测试代码负责实际断言，工作记录保留本次结果。索引从配置和用例汇总，不另写一份详细用例。

```text
.tiller/verification/
  config.json
  index.md
  modules/<module-id>/<category>.yaml
  cross-module/<scenario>.yaml
  system/<topic>.yaml
.tiller/rules/testing.md                 # 项目按需维护，不是受管资源
.tiller/work/<work-id>/verification.md    # 本次可读结论及证据引用
```

模块标识沿用稳定设计职责，使用 `modules` 配置关联对应设计；不按函数、技术分层或一次任务重建模块体系。模块文件名使用九类之一，每条用例包含文件名对应的类别标签，允许同时带其他类别。跨模块用例至少关联两个不同模块，系统用例按全局质量主题维护。同一用例只保留一个标识及正文，通过索引从模块和类别两个角度查阅。具体测试目录由项目决定，独立管理通过仓库标识定位实际位置，不猜测路径。

文件按需建立。工程初始化不生成业务用例；验证初始化建立最小配置和入口，九类适用性初始为待明确，不预填通过或假设所有项目都适用。已有项目配置和用例不能被覆盖，资源升级也不把项目验证资料当作模板更新对象。

## 2. 配置与引用

`config.json` 使用 `schemaVersion: 1`，主要字段如下：

| 字段 | 内容 |
|---|---|
| `modules` | `{id, design: {repository, path}}` 列表，设计职责的稳定入口 |
| `requirements` | `{id, source: {repository, path}}` 列表，本次覆盖统计的明确需求集合 |
| `categories` | 九个类别的适用性及理由；适用目标、方法、环境与完成条件由关联需求、设计及项目测试约定说明 |
| `suites` | `{id, repository, command, args, cwd, timeoutMs, inputs}`，命令使用程序名和参数列表，`inputs` 为显式文件引用列表 |

类别固定为 `unit`、`interface`、`integration`、`scenario`、`performance`、`security`、`reliability`、`compatibility`、`usability`。每类包含 `applicability: applicable | not-applicable | pending` 和 `reason`。它们是可交叉的覆盖标签，不构成互斥层级；接口安全场景可以同时使用 `interface` 和 `security`。

所有引用采用 `{repository, path}`，`.` 表示管理工程或当前工程，业务仓库使用工程登记的稳定标识；路径使用仓库内相对文件位置。模块与仓库分别表达。检查真实路径、文件存在及共享范围，不接受越界或通过链接绕出边界；同一引用在不同系统上仍表示同一管理对象。

覆盖统计的分母是 `requirements` 中登记的需求，报告明确这一范围；未登记需求不能被自动视为已覆盖。技术方法、命名和报告方式写入已有项目规范或按需创建的 `.tiller/rules/testing.md`，从项目规则引用；不新增另一个受管通用规则文件。

## 3. 用例格式

采用可读 YAML 的声明式子集，固定 `schema_version: 1` 和 `cases` 列表。不添加循环、条件执行或脚本表达式，不运行标签或任意对象构造；不支持的 YAML 语法必须明确报错，不能静默误读。引用已有其他格式时通过稳定标识和实现引用接入，不要求转换全部存量测试。

```yaml
schema_version: 1
cases:
  - id: TC-INIT-001
    title: 初始化保留已有用户文件
    modules: [initialization]
    categories: [integration, reliability]
    requirements: [INIT-01]
    given:
      - 工程中已有用户文件
    when:
      - 执行当前工程接入
    then:
      - 原文件内容保持不变
      - 接入产物可被正常读取
    automation:
      suite: initialization
      test_ref: TC-INIT-001
      source:
        repository: .
        path: test/core.test.mjs
```

示例的需求、模块、套件及仓库标识须替换为项目实际登记值，不从示例推导已有授权。每项用例有 `id`、`title`、`modules`、`categories`、`requirements`、`given`、`when`、`then`；自动化关联 `automation` 为可选。`criteria` 可保存类别特有的声明性条件，例如性能目标或安全边界，不由通用执行器求值。人工用例不配置自动化，操作与证据要求仍须明确。

测试目的和关键预期以用例为源，具体准备和断言以代码为源，不能同时手写一份内容相同的 Markdown。稳定 `test_ref` 可引用测试名称、标签或项目映射，检查源码存在不表示能够解析所有语言或证明标识对应的断言充分。内部单元测试可通过套件关联，不要求全部登记独立验收用例；用例定义不保存永久 `passed` 属性。

## 4. 创建与检查

`tiller verification init [--path <工程>]` 创建验证入口及最小配置，保留已有文件；不生成全套空模块目录、业务预期或历史结果。

`tiller verification check [--path <工程>]` 读取配置、用例及引用，检查格式、标识唯一、目录归属、未知模块/需求/类别、缺失自动化套件和引用。模块目录只容纳该模块用例；跨模块文件至少关联两个模块。检查返回登记范围的需求覆盖与各类别缺口，结构有效不表示全部条件完成。

## 5. 执行与证据

### 5.1 先计划再执行

```text
tiller verification run <work-id> --suite <suite> --input <selection.json> --plan
tiller verification run <work-id> --suite <suite> --input <selection.json> --apply <digest>
```

计划绑定所选工作、套件配置、调用位置、当前进程环境摘要及明确采集的文件摘要，展示命令、参数、目录、时间限制和检查范围。执行前重新比较摘要，变化后重新计划，不以旧摘要批准新参数。采用参数数组运行，避免把文档自然语言或拼接 Shell 命令当作可执行内容。

项目执行入口自身是可执行代码，可能有副作用；计划摘要不认证授权。执行者须核对真实用户授权、目标及环境，受控命令不能保证被调用进程无网络访问或无文件修改。外部扫描、压力测试、部署或破坏性操作需要明确目标与授权。

实际执行记录退出结果、时间、命令、日志及输入快照，区分失败、超时和启动错误。退出零不为关联用例批量生成通过；显式 execution 检查可消费当前真实套件执行结果，人工 record 不能代填。执行前后均核对输入，运行期间变化保留 staleAfterExecution，不因文件后来恢复而变成有效通过。套件 inputs 登记共享文本源码及配置；普通文本每文件最多 4 MiB，选定输入合计最多 64 MiB。显式 VerificationInput 支持 binary:true 和共享 provenance，读取可重建二进制实际字节；被忽略输出仅在该声明下允许，控制资料、恢复目录、链接仍拒绝。源码摘要不等于编译产物摘要。stdout/stderr 合计最多 64 KiB，超限终止直接子进程并记录失败；环境仅保存摘要。未声明依赖、数据库及远端状态仍需人工核对。

### 5.2 人工与外部结果

人工/外部观察前使用 verification capture，输入 `{selection,environment}`；程序保存当时的配置、定义和输入绑定并返回记录 ID。实际观察后，verification record 输入 `{captureId,environment,results}`，results 按 caseId 或 checkId 明确身份、状态、独立 evidence 和 note；captureId 也可引用真实 run 记录。环境须对应，旧的 suite 顶层输入拒绝。缺少此前采集不能在 record 时偷偷捕获当前版本来追认过去观察。登记保留人工/外部来源，不提升为身份认证。

当前接入明确逐用例或 manual 检查结果，不是通用报告解析器；原生报告以独立证据保留。结果追加保存并比较配置、定义、证据和输入摘要。按最新相关尝试判断，旧 runId、改检查别名或更早通过不能掩盖最新失败；执行失败也不能被后续人工 passed 覆盖。跨工作复用须明确工作/记录/检查/环境且范围一致；当前工作与外部都有尝试时不猜测先后。数据库、远端及未捕获环境变化仍由执行者核对。

证据必须是可共享的独立报告，不能引用配置、用例定义、工作入口、机器维护的结果或被验证输入来证明自己通过。该检查只约束引用位置及关联，仍不能识别所有伪造内容，也不认证报告作者。

### 5.3 报告

verification report 可用 `--input` 传入 `{selection}`；不提供时采用全局登记范围。明确选择包含 caseIds、requirements、modules、九类 categories、reason、scenarioReason 和 checks。checks 使用 case/manual/execution，绑定 artifactIds、inputs、requirements、categories、reason，case 另给 caseId，execution 另给 suite。空选择、未知检查或缺少必要适用依据拒绝；纯文档可用明确 manual 检查，不伪造自动化用例。报告呈现所选范围和范围外警告，失败、跳过、未执行、不适用与 stale 分开。

任务回归、自动化全量回归和完整交付验证由规划明确。任务/整体门禁调用同一 evaluator 并传入完整当前 artifactSnapshots，核对每个必要 check 对所选产物的覆盖；没有传快照的普通 report 明确 not-supplied，不能冒充完整产物覆盖。报告不自动写任务事件、调度下游或授予验收/发布权限；task verify 是另一个明确操作。

## 6. 与工作流程衔接

需求阶段形成验收条件；总体设计明确全局范围与项目测试约定，随具体内容确认；规划把场景、环境准备、回归范围和必要检查分配到任务。当前任务设计细化用例，设计确认后编写测试代码和实现，必要检查实际运行后才判断依赖任务可否继续。已有充分规格与确认可以引用，不重复审批每个内部测试。

骨架任务实际跑通最小测试入口，跨模块和系统场景在需求/设计明确时规划、依赖具备时实现执行，不能留到最后才发现环境和指标缺失。已有项目先识别原测试与结果，保留失败基线，只补当前范围必要缺口。

AI 流程专项使用真实交互和操作轨迹检查确认、任务次序和接续。规则字符串检查只证明分发文本，业务测试只证明所覆盖行为；两者均不能代替真实 AI 行为评测。用户验收及真实场景结论单独记录。

## 7. 验证安排与能力边界

按 V-AC-01 至 V-AC-14 验证九类状态、用例归属、显式选择、观察前采集、输入/定义/证据漂移、运行失败及期间变化、最新尝试和检查别名、完整产物集合、二进制来源及控制目录拒绝。测试使用临时工程，实际业务和外部系统另核授权。命令组装示例统一引用[使用指引](../../../../resources/usage.md#规划任务与整体交付)。

机器运行记录当前 schemaVersion 2；未知字段、版本或旧格式拒绝，保留原件，不在读取时补捕获 ID 或重写为当前通过。配置及 YAML 用例保持版本 1。任务/整体消费分别保存其技术摘要和过程事实，明确例外不会把失败测试改为 passed。

本设计不承诺解析全部 YAML、自动评审全部测试语义、执行所有语言测试生成器、认证操作者身份或拦截宿主直接写入。声明覆盖与真实行为均需证据，工程结构检查或报告生成不构成整体验收。
