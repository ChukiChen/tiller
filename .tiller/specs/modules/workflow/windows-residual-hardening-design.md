# Windows 孤立 CR 与 Maven 启动残余硬化设计

## 使用场景

本设计回应 #56 主流程通过后仍可复现的两个焦点残留。需求和验收条件见 [`windows-residual-hardening.md`](windows-residual-hardening.md)。当前实现在 `src/flow.ts` 多处使用 `split(/\r?\n/u)`，Windows `.cmd/.bat` 的启动集中在 `src/test-output.ts` 的 `platformProcessInvocation`。

## 方案

### 1. 任务记录逻辑行统一

在 `src/flow.ts` 增加一个只负责 Markdown 记录逻辑行的内部切分函数，使用 `/\r\n|\r|\n/u`。把读取任务所依赖的行扫描改为调用该函数，包括验收点、specs 引用、确认 sidecar、验证 sidecar、关闭/评审字段、需求/设计有效性和记录安全扫描。章节标题继续使用现有 Markdown 正则；不全局替换正文，也不改变 `sectionBody` 的职责。

保留 `normalizeLine`、`confirmationBody`、`requirementsSubject`、`designSubject` 与 `deliverySubject` 的现有算法。换行等价由“解析出相同的逻辑行 + 既有归一函数”保证，不新增摘要字段或版本。`resume` 只读取并展示当前事实，不把孤立 CR 写回为 LF；显式确认/验证写入继续使用既有 `renderTask` 流程。

测试采用同一任务的三份字节级变体：原文、全 CRLF、全孤立 CR。逐个执行 `resume` 与阶段检查，断言 AC、确认、验证和已验收阶段一致；再改变一条实质正文或验证提交，断言对应 subject/验收失效。另用最小记录覆盖确认和验证 sidecar 本身被孤立 CR 分隔时仍可读取。该测试设计登记为 `CASE-351`。

### 2. Windows 命令脚本封装

`platformProcessInvocation` 仍作为唯一平台入口，继续把逻辑 `mvn` 映射为 `mvn.cmd`。把当前“逐参数加引号后再给整条命令加引号”的构造拆成明确的两层契约：

1. 可执行文件与每个 argv 按 `.cmd/.bat`/`cmd.exe` 规则引用，禁止无法无损表达的 NUL、换行和危险元字符；
2. 仅在 `cmd.exe /d /s /c` 所需位置添加一层外层引用，使命令解释器剥离外层后仍保留可执行文件与参数的完整边界。

保持 `windowsVerbatimArguments: true`，避免 Node 再次改写已构造的命令行。`runProcess` 继续只消费 `{ executable, args, windowsVerbatimArguments }`，因此 cwd、环境、超时、捕获与退出码路径不变；Maven 的 `-Dsurefire.reportsDirectory=<private>`、`test`、`-Dtest=<Class#method>` 参数事实不变。

不会改用 `shell: true`、PowerShell、额外依赖或裸 `mvn` 回退。原因是这些方案扩大命令注入面、引入环境差异，且无法保证失败语义与现有私有报告链路一致。对于无法安全表示的值继续在 spawn 前抛 `VERIFY_COMMAND_UNSUPPORTED`。

测试分两层，分别登记为 `CASE-352`（平台无关契约与原生 argv fixture）和 `CASE-353`（真实 Maven 直接 verify）：

- 平台无关契约测试直接断言 Windows invocation 的可执行文件、参数数组、外层引用数量和 Maven 参数顺序；测试不只检查“字符串包含 mvn.cmd”。
- Windows 原生测试通过同一入口启动临时 `.cmd` fixture，由 fixture 记录实际 argv，覆盖带空格路径、`&`、`$` 与 `Class#method`；再在真实 Maven fixture 上运行 `tiller verify`，核对默认 `target/surefire-reports` 和通过/失败退出码。非 Windows CI 可执行契约层，Windows 验收必须补充原生层证据。

## 失败处理

- 解析修复只扩大可识别的合法换行边界；缺少章节、无效 sidecar、无效提交或摘要变化仍按现有规则失败或回退阶段，不放宽记录完整性。
- `resume` 读取失败保持原错误码和修复指引，不通过重写正文掩盖损坏记录。
- Windows 参数校验失败在 spawn 前返回 `VERIFY_COMMAND_UNSUPPORTED`；`cmd.exe`、Maven 或 JDK 缺失、超时和非零退出均保留真实失败，不生成通过记录。
- 默认 Surefire 报告缺失、损坏、匹配零个或多个、失败或跳过时继续判定不可核实；重试沿用 FLOW-05 的两次失败停止规则。
- Gradle 的已知 NEW-03 失败保持记录为范围外；共享封装测试只防止明显回归，不以 Gradle 绿灯替代 Maven 验收。

## 取舍

- 采用解析层兼容而非落盘归一：保留用户正文、减少无关 diff，并避免 `resume` 产生隐式写操作；代价是解析入口必须一致使用同一函数。
- 采用集中式 Windows 命令构造而非引入跨平台 shell：可测试、无新依赖、继续复用现有进程生命周期；代价是必须精确维护 `cmd.exe` 引用契约。
- 同时保留契约测试与 Windows 原生测试：前者可在普通 CI 防止 argv 漂移，后者才能证明真实命令解释器与 `mvn.cmd` 集成；不以字符串包含断言替代二者。

## 影响与风险

- 任务记录读取会覆盖所有依赖 Markdown 行的路径；误用“全局换行替换”可能改变正文或无关输出，因此只改记录解析入口并保持写入算法不变。
- 历史 LF/CRLF 任务无需迁移；孤立 CR 任务应恢复既有状态而不改变确认字段。确认/交付 subject 算法不变，避免历史确认整体失效。
- Windows 引用边界仍是最高风险点，尤其是空格、尾随反斜杠、引号与 `cmd` 元字符；以拒绝不可安全表达的输入和原生 fixture 断言控制风险。
- `.cmd/.bat` 适配器被 npm/npx 等其它工具共享；实现必须保持通用参数数组契约，但本规格只验收 Maven，Gradle 结果另案处理。
- 不改变版本号、报告格式、AC/CASE 编号或资源契约。

## 验证入口

- 记录解析：运行 `CASE-351`，覆盖三 EOL `resume`/subject、确认与验证 sidecar 读取以及实质内容变化。
- 命令封装：运行 `CASE-352` 的 invocation 契约与 Windows 临时 `.cmd` argv fixture。
- 真实 Maven：在 Windows 环境运行 `CASE-353` 的 `tiller verify --criterion AC-2 --case CASE-353`，分别核对通过、失败和缺失/损坏报告。
- 回归：运行 `test/windows-fresh-hygiene.test.mjs`、`test/java-runners.test.mjs`、`test/flow-cli.test.mjs` 与 package smoke；Gradle 结果单独报告，不计入 AC-2。
