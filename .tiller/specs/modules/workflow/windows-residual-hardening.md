# Windows 孤立 CR 与 Maven 启动残余硬化

## 使用场景

Windows 编辑器、旧工具或跨平台同步可能在 `task.md` 中留下孤立 `CR`。开发者随后执行 `resume`、确认或验收时，tiller 仍应识别已经写入的需求、验收点、确认与验证事实，而不是把任务误判为尚未开始。Java 工程配置 `junit-maven` 时，开发者也需要由 `tiller verify` 直接启动真实 Maven，并以 Maven 生成的私有报告作为唯一通过依据。

本规格承接 #56 已合入后的两个焦点残留：NEW-01 的孤立 CR 记录解析，以及 NEW-02 的 Windows `junit-maven` 直接验证。NEW-03 的 Gradle 启动问题不在本规格范围内。

## 目标

- 让同一任务记录在 LF、CRLF 与孤立 CR 下得到等价的解析、确认摘要和交付阶段，且不静默改写用户正文。
- 让 Windows 上的 `tiller verify` 通过正确的命令解释器封装启动真实 `mvn.cmd`，把精确测试选择器、默认 Surefire 报告与退出码原样带入既有验证链路。
- 用可重复的命令封装契约测试和 Windows 原生集成证据锁定上述行为。

## 业务范围

- 做：统一任务正文、确认标记、验证/关闭/评审字段与相关记录安全扫描的行解析；保持现有确认摘要和验收判定语义；修正 Windows 命令脚本启动封装；补充对应的长期规格、CASE 与回归测试。
- 不做：修复 `gradle.bat` 的 APP_HOME 或 NEW-03；自动安装 Maven、JDK 或 `cmd.exe`；改变确认字段、subject/hash 算法、验证私有报告格式或 AC/CASE 编号语义；在 `resume` 中自动归一并写回用户正文；恢复 POSIX shell 依赖。
- 假设：孤立 CR 缺陷可由同一已确认/已验收任务的换行变体稳定复现；Windows 或等价 CI 环境可运行 `cmd.exe` 与 Maven 集成测试；真实 Maven 工程把本次 XML 写到默认 `target/surefire-reports` 并与现有解析契约兼容。

## 关键行为

### D-01 三种换行的任务记录读取

- 任务记录中所有面向行的读取使用同一换行边界：`CRLF`、孤立 `CR`、`LF` 都产生相同逻辑行。覆盖标题/章节识别、验收点、需求来源、确认 sidecar、验证 sidecar、关闭/评审字段与记录安全检查；不把无关的 Git、XML 或测试报告输出强行套入该入口。
- 含孤立 CR 的合格任务经过 `resume` 后保持原阶段；已写确认仍匹配当前 subject，验收点、确认与验证事实不再被清空或回退为“已开始”。
- 需求、设计、交付 subject/hash 对仅换行不同的同一正文保持等价；正文、范围、AC、验证事实或提交变化仍使对应确认或验收失效。
- 读取与 `resume` 不修改用户正文的字节内容。只有既有显式写入流程可以重写任务记录；本规格不引入读取时归一写回。

### D-02 Windows `junit-maven` 命令脚本启动

- Windows 上 `junit-maven` 的逻辑入口继续映射为 `mvn.cmd`；实际启动使用 `ComSpec`/`cmd.exe`，POSIX 继续直接使用 `mvn`。
- 命令解释器封装必须把可执行文件与每个参数作为完整 argv 边界传递，只生成命令解释器所需的唯一外层引用；不得对已引用参数再次包裹整条命令，也不得让 `&`、空格、括号等字符被解释为额外命令。
- 精确 `Class#method` 选择器、默认 `target/surefire-reports`、cwd、环境、超时、stdout/stderr 捕获和退出码继续沿用现有 runner 契约。Maven 非零退出码原样传播；报告缺失、损坏、匹配不唯一、失败或跳过仍不可核实。
- 无法无损表示或明显危险的命令参数在启动前返回稳定的 `VERIFY_COMMAND_UNSUPPORTED`，错误包含可操作说明且不伪造 runner 结果；工具或命令解释器缺失必须有明确失败证据。
- 本规格只把 Maven 直接验证列为验收对象。共享封装若同时服务 `gradle.bat`，实现不得主动破坏既有构造，但 Gradle 跑通不属于本规格 AC。

## 异常与边界

- 只有换行不同的任务正文视为同一确认对象；任意其他字符、范围、AC 或验证事实变化都不视为等价。
- 损坏或字段不完整的确认/验证 sidecar 继续按既有保守规则不可信，不因兼容孤立 CR 而放宽格式校验。
- Windows `.cmd/.bat` 输入中的 NUL、换行与无法安全表达的 `cmd` 元字符在 spawn 前拒绝；拒绝与 Maven 自身失败必须可区分。
- Maven、JDK、`cmd.exe` 缺失或超时视为环境/运行失败，不回退到 Gradle、裸 `mvn`、外部报告或跳过测试。
- 非 Windows 平台的直接 executable 行为与 POSIX runner 不变。

## 验收条件

- AC-1: task.md 正文与确认/验证 sidecar 的行解析统一识别 LF、CRLF 与孤立 CR；resume 保留验收点、阶段、确认与验证事实，需求/设计/交付 subject 在三种 EOL 间等价，实质内容变化仍使对应确认或验收失效，且不静默改写用户正文
- AC-2: Windows 上 tiller verify 对 junit-maven 通过正确的命令解释器封装启动真实 mvn.cmd，传递精确测试选择器并从默认 Surefire 报告核实结果，正确传播退出码；命令封装契约有可重复回归测试，且不以 gradle 跑通作为本任务验收
