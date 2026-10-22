# tiller

tiller 是一套面向 AI 开发的标准工作流程与 CLI。它用较少的人工节点、可重复的检查和可追溯的 Git 记录，帮助开发者明确目标、控制范围、验证交付，并在中断后继续工作。

## 默认工作流

先明确交付目标、范围、任务大小和已有授权，再选择流程：

- 小改动：需求确认 → 实现 → 验证。
- 标准或大功能：需求确认 → 设计确认 → 实现 → 验证。
- 默认人工节点只有需求、设计（标准任务）和交付验收；规划、合入、发布按需确认。

默认入口提供六个命令：

```sh
tiller start <work-id> --title <标题> --goal <目标> \
  --criterion "AC-1=<验收条件>" --size small --target src --target test
tiller resume [work-id]
tiller confirm <work-id> requirements --quote "<用户原话>"
tiller verify <work-id> --criterion AC-1 --test test/example.test.mjs \
  --command "npm test" --run "npm test"
tiller check <work-id>
tiller accept <work-id> --quote "<用户原话>"
```

单次任务记录只维护 `.tiller/work/<id>/work.md`。确认保存用户原话、提交和对象摘要；验证保存验收条件、测试引用、命令、结果、提交和代码树摘要。需要细节时从 Git 取回或重跑，不保存全文快照、原始日志、自举工程或安装包。

跨任务回归事实集中维护在 `.tiller/cases/*.json`：每条用例保存稳定编号、标题、需求/模块引用、自动化 `test_ref` 和源码路径。`work.md` 只服务本次任务；用例库只存声明，不存执行日志或证据包。`verify --test` 优先引用用例的 `test_ref`，`check` 会校验全局用例并提示未命中的本次测试。

`check` 还会核对验收条件覆盖、验证是否过期、范围越界、未提交改动、测试删除或弱化、密钥和本机绝对路径。`accept` 只在技术自检通过后记录真实验收原话。

旧类型流程、阶段、规划、任务、交付审计和全文快照路径已删除；单次任务以 `work.md` 与 Git 追溯，跨任务回归以 `.tiller/cases/` 声明为准。

## 安装与接入

需要 Node.js 22 或以上。管理已有 Git 仓库时还需要本机 Git。

```sh
npm ci
npm run check
node dist/cli.js --help
npm pack
npm install -g ./tiller-0.5.0.tgz
```

当前包尚未发布到 npm 注册表；上面的安装来自本地打包结果。`npm run test:package` 会执行打包、隔离安装、命令入口和中文路径验证。

```sh
tiller init .
tiller status .
node .tiller/run.cjs --help
```

初始化提供 `.tiller/usage.md`、`.tiller/run.cjs`、通用规则和资料索引，并在 `AGENTS.md` 中维护固定的 tiller 区段。已有入口、规格、项目规则和区段外正文保持原样；冲突时拒绝覆盖。

独立管理工程可登记已有业务仓库：

```sh
tiller init ./management-project --mode workspace \
  --repo repositories/service-a --repo repositories/service-b
```

命令不会克隆、移动或修改业务仓库。仓库标识与存放路径分开，工作范围和资料引用使用稳定标识。

## 目录与资料

```text
src/          TypeScript CLI
resources/    随工程安装的入口、规则、使用指引和启动器
test/         规则、契约、集成和端到端测试
.tiller/      当前工程的需求、设计、决定、背景、全局用例和工作记录
```

项目背景和长期决定分别维护在 `.tiller/context/` 与 `.tiller/specs/`。目录、关键模块职责、构建/启动/测试入口、主要接口或数据流、外部依赖变化时更新背景；普通实现细节不重复记录。

## 验证

```sh
npm run build
npm run lint
npm run typecheck
npm test
npm run test:package
```

`npm test` 一次构建后运行全部测试，文件级并发为 2。`test/suites.json` 要求每个测试文件恰好归属一个套件。局部测试通过不代表完整交付通过；失败、跳过和未执行分别报告。

## 升级与权限

当前程序与资源契约为 0.5.0。版本号只在正式发布正式包时修改，本功能迭代不触发资源版本升级。升级命令只核对当前契约，不改写受管文件、不迁移历史版本或历史工作记录，也不继承旧批准。

```sh
tiller upgrade --plan
tiller upgrade --apply <plan-id>
```

提交、推送、合入和发布分别依据实际授权。CLI 检查受控文件和记录，不认证用户身份，也不能阻止宿主绕过 CLI 直接修改。

## 工程文档

- [总体需求](.tiller/specs/requirements.md)
- [总体设计](.tiller/specs/design.md)
- [决策记录](.tiller/specs/decisions.md)
- [全局用例说明](.tiller/cases/index.md)
- [默认工作流模块命名工作记录](.tiller/work/20261022-flow-naming/work.md)
- [本轮默认工作流工作记录](.tiller/work/20261022-lightweight-flow/work.md)
