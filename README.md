# tiller

tiller 是一套 AI 软件工程方法论与工具集，帮助开发者与 AI 一起明确需求、推进开发、验证交付，并持续维护软件。它的目标是让从需求到运维的工作有清楚的依据、可接续的记录和可检查的结果。

tiller 面向使用 AI 编程工具的开发者，适用于个人开发和多人协作，项目可以采用不同的编程语言和框架。tiller 自身也使用这套方法开展开发，通过实际使用发现问题并改进。

## 为什么需要 tiller

AI 能够快速生成代码，但软件开发还需要解决三个问题：

- **目标是否清楚**：想法需要逐步明确为需求、范围和验收条件，未决问题不能被当作已确认要求。
- **工作能否延续**：背景、决定和进度需要持续保存，让中断后的继续或人员交接有据可查。
- **交付是否可信**：结果需要对应需求和实际验证，已完成、未满足与未验证的内容应清楚区分。

## 如何开展工作

先明确本次交付目标、影响和授权，选择对应流程并说明理由、必要阶段和完成条件。分析可以结束于有证据的结论，审查可以结束于报告，不强制产生代码、PR 或发布。功能开发及适用的变更阶段仍须有效需求、设计和规划确认，再逐任务实际开始、实现和验证；前置未验证时不能进入依赖任务。类型名称、文件数和“简单任务”都不自动减免确认或授予权限。交付事实、用户验收和发布授权分别判断。

tiller 用工程文件保存这些依据：总体与模块规格持续维护，单次工作记录保存本次变化和过程。规则说明如何推进和检查，模板帮助组织产物，CLI 执行接入、记录和检查等确定性操作。

这套方法面向从想法形成总体需求与设计、增加功能、修复缺陷、接手已有项目，以及根据使用反馈持续改进等场景。工程既可以单独管理，也可以在独立管理工程中协调多个仓库。

## 当前进展

当前支持十一类内置流程、项目声明式扩展、固定流程快照、阶段开始/验证/接续、通用输出登记、跨工作依赖及显式转换。开发阶段复用规划与任务机制，其他流程按自身条件交付。确认、验证、隔离交付和恢复继续核对实际对象及来源。

CLI 保存和检查受控事实，不自动猜测类型、认证用户身份、执行后续阶段或阻止宿主直接修改。命令成功不代表实际内容充分、全部测试通过或用户验收。完整类型、输入和只读分析链见[使用指引](resources/usage.md#独立分析示例)。

## 本地运行与安装

需要 Node.js 22 或以上。管理已有 Git 仓库时还需要本机 Git；Git 工程中的共享资料检查同样使用 Git。

```sh
npm ci
npm run check
node dist/cli.js --help
npm pack
npm install -g ./tiller-0.5.0.tgz
```

当前包尚未发布到 npm 注册表。上面的安装来自本地打包结果，不依赖注册表中同名软件。`npm run test:package` 会执行打包、隔离安装、命令入口和中文路径验证。

## 接入工程

```sh
tiller init .
tiller status .
```

初始化自动提供 `.tiller/usage.md` 使用指引和 `.tiller/run.cjs` 固定入口，`AGENTS.md` 与资料索引会引导读取。在工程根目录可直接调用：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs runtime status
node .tiller/run.cjs status
```

启动器使用本工程安装或本机登记，并在已验证的 Git worktree 中复用同仓库的可用安装。CLI 初始化和升级应用后登记当前实际 CLI；更换安装后可用已知 CLI 执行 `runtime bind --path <工程目录>`。安装路径只保存在 `.tiller/local/runtime.json`；指引与启动器随仓库共享，换机器后按指引恢复安装，不隐式联网下载。当前仅接受明确的 0.5.0 程序与资源运行契约；旧工程保留原件，不自动升级或改版本号接续。

独立管理工程中的业务仓库须已存在，推荐集中放在 `repositories/` 下：

```text
management-project/
  .tiller/
  repositories/
    service-a/.git/
    service-b/.git/
```

```sh
tiller init ./management-project --mode workspace --repo repositories/service-a --repo repositories/service-b
```

命令接入通用 `AGENTS.md` 区段、规则、资料索引及版本信息，保留既有入口、规格和项目规则；不会克隆、移动或修改业务仓库。缺少实际内容的资料目录按需创建。重复接入须使用同一模式与仓库范围。

仓库标识与存放路径分开：上述工程登记 `service-a`、`service-b`，其 `repositoryPaths` 分别指向 `repositories/service-a`、`repositories/service-b`。工作范围、文档引用与交付输入继续使用标识 `service-a`，不要填整个目录路径。管理仓库忽略 `/repositories/`，业务仓库各自独立提交。

当前契约支持明确登记的直接子目录和分组目录两种布局。简写 `--repo service-a` 在两处同时存在时须明确选择 `repositories/service-a` 或 `./service-a`；已初始化工程不静默改映射或移动仓库。不支持任意多层路径或越界定位。

通用入口的维护来源是 `resources/entry.md`；tiller 自身和新工程均安装这份内容。目标工程已有 `AGENTS.md` 时保留自定义正文，按当前契约接入 tiller 标记区段，冲突时保留原文并拒绝覆盖。详细资料维护规则通过入口链接到 `.tiller/rules/`，不另外维护一份通用正文。

索引的固定导航区段、入口中的 tiller 区段以及通用规则有内容依据；区段外的项目资料与索引链接可正常维护。修改受管内容或遇到不支持的版本时，CLI 保留现状并报告冲突，不自动升级。项目专属规则放在 `.tiller/rules/project.md` 等独立文件中。

写入中断后执行 `tiller recover <path>`，命令先核对全部文件，再恢复尚未发生后续编辑的事务。存在冲突时保留文件和本机恢复记录；本机记录不替代共享工作进展。

当前程序与资源契约为 0.5.0，正式发布前不提供旧版成功解析、接续或自动迁移。旧/未知格式明确拒绝，用户文件原样保留。upgrade 仅提供当前资源无变更检查；不修复冲突或改写历史。具体安装恢复及版本边界见[使用指引](resources/usage.md#更新)。

## 工作、阶段与产物

新工作明确选择 workflow，登记目标、理由、范围、影响、依据、动作来源、预期输出和完成条件；未知影响不自动当作低风险。work.md 保存过程，产物按固定图创建或引用；六类需求/设计模板只影响文档骨架。现有工作先检查当前事实再接续，不补造批准或开始事件。

[使用指引](resources/usage.md#独立分析示例)集中维护完整 JSON 和命令示例，展示 analysis 从 scope 到 report 的真实观察及整体回执链。其他流程先读取其定义与适用规则，不为满足不适用门槛制造需求、设计或 tasks.json。单纯登记产物不能完成阶段。

项目扩展和工作转换须预览实际差异，必要时取得精确范围/政策变更批准；跨工作关联绑定生产者的当前阶段与产物。分析完成不授权修复，审查报告不等于验收，流程转换不继承旧代际的执行许可。详见[扩展、关联与显式转换](resources/usage.md#扩展关联与显式转换)。

## 确认、开发任务与交付

确认必须对应真实用户决定、当前内容和范围，包含当前流程/意图绑定及适用阶段；来源文件和复核记录不能认证身份。需求、设计、planning、scope、operation、checkpoint、exception、acceptance、merge、release 各有具体语义，不能互相代替。展示内容之后再记录实际决定，不能用沉默、AI 自述或历史文件存在代替批准。详见[人工确认](resources/usage.md#请求与记录人工确认)。

开发阶段在真实前置阶段及规划确认/激活后，明确委托当前规划中的任务。task start/resume 建立实际开始依据；验证 capture/run 绑定 stageId 和 taskId，任务证据不能冒充阶段证据。task verify 不自动完成外层阶段。无依赖且仍有效的任务证据可按当前范围和权限核对后保留；授权撤销、代际变化和任务移阶段须重新核对。完整边界见[规划、任务与整体交付](resources/usage.md#规划任务与整体交付)。

工作 revision、阶段 expectedStageRevision、任务 revision 各自独立；delivery-ready 与流程转换使用真实控制快照 expected。预览不产生许可，应用使用同一输入及实际 planId，变化后重新预览；历史回执只证明当时操作。分别报告 technicalReady、operationAllowed、processEvidence 和 acceptance；明确例外不改写技术失败，也不传递为合入或发布许可。

代码交付保留仓库身份、隔离目录、精确文件清单、真实授权、源/目标 OID、资料版本和恢复保护。commit/push/review 可在具体持续授权内用于进行中工作；实际合入与发布各需具体对象的确认。当前适配缺少源与目标双重原子校验，自动合入仍明确拒绝。结果未知先 reconcile，多仓库部分成功不自动回滚；清理前保存唯一成果和记录，分别核对副本及分支删除授权。输入和限制集中见[隔离开发与评审交付](resources/usage.md#隔离开发与评审交付)。

交付预览按动作声明读取范围：commit 核对明确选中文件的正文，push/review/merge 核对不可变提交与实际批准资料；仓库身份、完整索引和工作目录状态均参与检查。cleanup 与 reconcile 保留完整文件正文核验，以检查需要保全的本地成果。

## 实现与验证范围

源码在 src，资源在 resources，测试在 test。没有第三方运行时库，不调用模型、不自动发布。当前实测平台为 Windows；macOS、Linux 尚未实测。远程仓库获取、工程管理模式切换和自动业务任务调度不属于当前能力。程序/资源 0.5.0、工作/确认 schema 4、整体就绪回执 2 等协议分别判断，详见[严格记录格式](resources/usage.md#严格记录格式与接续)。

开发时按改动边界选择验证入口：`npm run test:rules` 验证纯规则，`npm run test:contracts` 验证真实读取与提交边界，`npm run test:integration` 验证模块接通，`npm run test:e2e` 验证完整流程与 CLI。`npm test` 构建一次后运行全部测试，保持文件级并发 2，并输出实际并发度，性能对照不增加并发；每个测试文件使用独立进程和临时资料。`test/suites.json` 要求每个测试文件恰好归属一层，新增或遗漏文件会使入口失败。完整回归包含所有层，不用局部结果代替整体检查；发布包另执行 `npm run test:package`。

长期验证按模块、跨模块场景和系统质量组织，测试代码沿用项目框架。九类适用性须有实际依据；执行命令须核对环境和副作用授权。run 输入绑定当前 workflow，人工观察先 capture 再实际检查及 record；程序退出成功不自动表示逐用例通过。证据变化后重核，不能用最终组合测试补造历史放行。配置、选择和命令格式见[测试与验证](resources/usage.md#测试与验证)。

## 工程文档

工程文档位于 `.tiller/specs/`：

- [总体需求](.tiller/specs/requirements.md)
- [总体设计](.tiller/specs/design.md)
- [决策记录](.tiller/specs/decisions.md)
- [工程初始化需求](.tiller/specs/modules/initialization/requirements.md)
- [工程初始化设计](.tiller/specs/modules/initialization/design.md)
- [工作推进需求](.tiller/specs/modules/workflow/requirements.md)
- [工作推进设计](.tiller/specs/modules/workflow/design.md)
- [开发规范需求](.tiller/specs/modules/standards/requirements.md)
- [开发规范设计](.tiller/specs/modules/standards/design.md)
- [首个交付工作及验证](.tiller/work/initial-delivery/work.md)
