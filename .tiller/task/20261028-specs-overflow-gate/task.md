# 任务溢出回写与跨语言CASE适配器标准

<!-- tiller-task:v1 {"version":1,"id":"20261028-specs-overflow-gate","type":"feature","size":"standard","created":"2026-10-28T14:39:43.922Z","base":"7c2816e4b164366564f2c7a98d5a0d43f3d816d7","scope":["src","test",".tiller/specs",".tiller/rules",".tiller/cases",".tiller/usage.md","resources"],"format":"structured","slug":"specs-overflow-gate","summary":"任务溢出须回写specs；跨语言CASE适配器成标准"} -->

## 需求

### 使用场景

- 任务需求/设计写出了稳定全局 specs（及必要 rules/cases）尚未覆盖的行为时，不能只留在 `task.md`「私货」里继续做；须先确认并回写全局文档，再实现/验收。
- 业务测试在 Java（或其它非 Node 扫描语言）时，tiller 0.5.0 用例发现不扫 `src/test/java`，但 verify 仍要求测试名/注释挂 `CASE-NNN`。实践上用 **可扫描语言的适配器**（如 `test/**/*.mjs` 里 `test('… CASE-001', …)`，内部 `spawn` 调 `junit-maven`/Maven Surefire 选择器）桥接；要把该模式升为标准，后续一律按此执行，而不是每仓临时发明。

### 目标

1. 任务相对其引用的稳定 specs 溢出时，`confirm`/`check`/`accept` 机械阻断并指引回写全局后经确认人再继续。
2. 将「跨语言 CASE 适配器」定为标准路径：可被 tiller 扫描的测试入口挂 CASE，内部转调真实语言 runner；受管 specs/rules/usage/CASE/模板同步；可选生成骨架。

### 业务范围

- 做：
  - 溢出门禁：对照任务引用的 specs 路径与 AC-n；任务验收点必须可挂载；溢出时失败信息写明改哪类全局文件、如何再确认。
  - 适配器标准：文档化并固化约定（扫描目录/扩展名、测试名含 CASE-NNN、转调命令与选择器约定、单文件多 CASE、与 `verify --case`/`--test-name-pattern` 的关系）；`case add`/模板可产出适配器骨架（含转调占位），不要求 CLI 自动写出完整 Maven 映射。
  - 稳定执行：门禁进主路径；CASE + 测试锁定；版本 0.5.0。
- 不做：
  - 本包不实现完整 Java AST 用例扫描替代方案（可作为后续可选增强，不阻断适配器标准）。
  - 不改 PATH 单 tiller、不合入证明、不恢复 task#AC 新写入、不改用户 `core.autocrlf`。
- 假设与待确认：机制由 boon yu 确认（溢出须回写；适配器方案定为标准）；确认人 ChukiChen。

### 关键行为

- AC-1：任务需求或设计相对引用 specs 出现未覆盖新增行为/约束时，confirm requirements/design 与 check/accept 阻断，提示先更新全局 specs（及同步 cases/rules），经确认人确认后方可继续。
- AC-2：对照范围明确：真相源为任务引用的 specs 路径与 AC-n；不得引入不存在的 AC 或无法挂载的验收点；溢出指引可执行。
- AC-3：检查稳定：覆盖 confirm、check、accept；mock/单元与 CASE 锁定；历史已确认任务的收紧/兼容策略写清，避免无谓误伤。
- AC-4：受管 specs/rules/usage/CASE/测试同步；版本保持 0.5.0；不改变 PATH 单 tiller、合入证明、task#AC 新写入禁令。
- AC-5：跨语言 CASE 适配器成为标准：受管文档规定「可扫描入口挂 CASE + 内部转调真实 runner」；给出 Node↔junit-maven（Surefire `Class#method`）参考形态；`case add` 或文档模板可生成适配器骨架；verify 仍经现有扫描与 CASE 引用路径工作，不强制每仓手搓无文档方案。

### 异常与边界

- specs 缺失、AC 不存在、任务正文悬挂无法挂载的验收点：确认/检查失败，不静默通过。
- 适配器转调失败（Maven 不在 PATH、测试失败）：按真实 runner 结果记 verify，不得因「有适配器文件」假绿。
- 纯 Node/已扫描语言工程：可不建适配器；标准仍适用「测试名挂 CASE」。
- 输入无效时明确错误，不静默降级。

### 验收条件

- AC-1: 任务需求或设计相对引用specs出现未覆盖新增时，confirm/check/accept阻断并提示回写全局后经确认再继续
- AC-2: 以引用specs路径与AC-n为真相源；禁止不存在AC或无法挂载验收点；溢出指引可执行
- AC-3: 门禁覆盖confirm/check/accept并用CASE/测试锁定；历史任务兼容策略写清
- AC-4: 受管文案与测试同步；版本0.5.0；不改PATH单tiller/合入证明/不恢复task#AC新写入
- AC-5: 跨语言CASE适配器写入受管标准（扫描入口+转调runner+CASE名约定+骨架/模板）；verify经该路径关联CASE；不把无文档的仓内私货当唯一做法

## 设计

### 方案

1. **溢出检测**：在 confirm requirements/design 与 check/accept 增加「任务正文 AC / 引用 vs 已加载 specs AC」一致性校验（及无法挂载的新增验收表述检测）；失败码稳定、文案含回写步骤。优先复用已有 specs 引用与 AC 解析，避免第二套语义。
2. **回写闭环**：阻断后用户改 `.tiller/specs`（必要时 cases/rules）→ 再 confirm；不自动改全局文件。
3. **适配器标准**：在 verification/workflow specs + usage + CASE 写明：
   - 发现仍走现有 `test/`/`tests/` 可扫描扩展名；
   - 适配器测试名（或紧邻注释）含 `CASE-NNN`；
   - 体内转调 `verify.runner` 支持的执行器（如 junit-maven）或等价 spawn；Surefire 选择器用 `Class#method`；
   - 一文件多 CASE、按名筛选；
   - `case add`/模板输出带转调 TODO 的骨架，完整映射由工程补齐。
4. **实现落点**：校验进 flow/confirm/check；文档与 resources 模板；必要时小 CLI 提示。不在本包做 Java 目录扫描大改。

### 失败处理

- 溢出：非零退出 + 指引；不写半套确认。
- 适配器文档缺失：以受管文件是否包含标准条款为验收；实现侧缺骨架生成时至少文档+CASE 绿。
- 转调失败：透传 runner 失败，不吞错。

### 取舍

- 选适配器标准，而非本包扩展 Java 扫描：改动面小、立刻覆盖多语言、与现有 node-test 发现一致；Java 扫描可作为后续增强且不互斥。
- 溢出用机械门禁而非口头规范：与「dogfood 先写 CASE」一致。

### 影响与风险

- 收紧 confirm/check 可能挡住「任务先写、specs 后补」的旧习惯——指引写清顺序；兼容策略：已验收历史按 acceptance 树，不追溯改写旧确认。
- 适配器增加一层进程：文档标明适用「扫描不到的语言」；纯 Node 不必用。

### 验证入口

- 单元/mock：溢出任务 confirm/check 失败；回写 specs 后通过。
- CASE：适配器命名与文档条款；可选骨架生成冒烟。
- 全量 test + verify AC-1..5。

## 确认

| 部分 | 确认人 | 时间 | 短提交 | 原话 |
| --- | --- | --- | --- | --- |
| 需求 | ChukiChen | 2026-10-28T14:45:45.504Z | 7c2816e4b164 | 溢出回写+跨语言CASE适配器标准 |
| 设计 | ChukiChen | 2026-10-28T14:45:48.427Z | 87a65400d12e | 门禁对照specs；适配器为标准路径 |

<!-- tiller-confirm:v1 {"gate":"requirements","object":"需求正文（目标、范围与验收条件）","subject":"c068e956e5c31239a71642687b2b8a3d792e3fe014e2d15b3eb0d10fc28a0f4e","commit":"7c2816e4b164366564f2c7a98d5a0d43f3d816d7","by":"ChukiChen","quote":"溢出回写+跨语言CASE适配器标准","at":"2026-10-28T14:45:45.504Z"} -->
<!-- tiller-confirm:v1 {"gate":"design","object":"设计正文","subject":"0cfc0c309b3307ae90792d666c4e70664b7d9c3daa090df107cde75556a2ec26","commit":"87a65400d12e82bf86dfd1fc162e2814c819945c","by":"ChukiChen","quote":"门禁对照specs；适配器为标准路径","at":"2026-10-28T14:45:48.427Z"} -->

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
