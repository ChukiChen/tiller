# tiller 使用指引

先读取工程根目录的 `AGENTS.md`、[工程索引](index.md)和[规则索引](rules/index.md)。本文件说明如何使用已接入的 tiller；项目背景和具体工作由工程资料维护。

## 调用命令

需要 Node.js 22 或以上。在工程根目录运行：

```sh
node .tiller/run.cjs --help
node .tiller/run.cjs --version
node .tiller/run.cjs status
node .tiller/run.cjs runtime status
```

规则中的 `tiller ...` 可以替换为 `node .tiller/run.cjs ...`。全局命令不存在不表示无法工作，也不能据此绕过命令手写机器记录。从其他目录调用时使用启动器的实际路径，并按帮助用目标位置参数或 `--path` 指定工程；启动器保留调用者的当前目录。

启动器优先使用本工程 `.tiller/local/cli/` 中的安装、工程 `node_modules/tiller`，再查本机登记。Git worktree 可复用同一仓库已登记工作副本中的安装；业务仓库的本机安装不会因为属于某个管理工程而自动共享。每次执行重新检查候选，透传参数和退出结果，不自动下载软件。

## 安装缺失或失效

换机器、复制工程、移动或删除 CLI 后，原本机登记可能不可用。使用已取得且核对过版本的 tiller 安装包，在工程根目录安装：

```sh
npm install --prefix .tiller/local/cli --no-save --package-lock=false --ignore-scripts --no-audit --no-fund /path/to/tiller-VERSION.tgz
node .tiller/run.cjs --version
node .tiller/run.cjs runtime status
```

将包路径和 VERSION 替换为实际值；路径含空格时加引号。也可使用已安装的 CLI 执行 `tiller runtime bind --path <工程目录>`，重新登记当前运行的 CLI，然后验证固定入口。不要直接执行来源不明的路径，不要手写本机登记文件。不能假定公共 npm 注册表的同名包就是本工程使用的 tiller。

若明确提示 `runtime.json` 格式错误或属于其他工程，先核对 `.tiller/local/runtime.json`，将它移到本机目录内一个尚不存在的备份文件，再按上面的方式安装或使用已知 CLI 重新绑定。原记录不会被自动覆盖；仅重装包不能消除这类登记冲突。共享启动器内容发生变化时应协调原文或恢复已确认的受管版本，再检查入口，不能以重新绑定掩盖资源冲突。

本机登记位于 `.tiller/local/runtime.json`，安装和登记均不随仓库共享；缺少 Node.js 时须先安装适用运行环境。初始化接入成功、命令可用与实际工作流程符合要求分别验证。

## 开始和接续工作

先明确用户目标和现有依据，再按活动需要使用 `work create`、`work add` 或 `work resume`。从产品想法开始可选 `product-requirements` 模板；有已有规格时通过引用接入。标识推荐采用创建当天的 `YYYYMMDD-主题`，参数以 `--help` 为准。

`work.md` 记录过程，需求与设计分开；总体需求与设计确认后，形成并确认实施规划，再逐任务补足必要规格、实现和验证。骨架是普通任务，前置任务验证不满足时不进入依赖任务。规划确认目前在可读工作记录保存真实来源，没有专用 CLI 确认类型，不自行编造命令或机器记录。模板生成和文件存在不代表已获批准。详细流程及例外见[实施规划与任务拆分](rules/core.md#功能分块与实施安排)。

## 更新

CLI 更新与工程资源升级分开。取得新 CLI 后先用它运行 `upgrade --plan`，审阅差异再 `upgrade --apply <plan-id>`；成功后重新检查固定入口。升级保护已有内容，冲突须协调，不直接覆盖。项目专属说明放在独立资料中并通过索引链接，避免直接修改受管指引或启动器。
