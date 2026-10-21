# 测试管理实施验证

> 历史工作资料：已按用户要求直接精简且不备份，仅保留核心文档。原机器记录、审批快照、逐轮测试输出和过程文件已删除；以下结果保留当时范围，不作为当前候选的验证结论或可恢复的受控工作，也不是后续执行队列。

基线：fa79fae / 0.3.5。以下仅追加本次真实执行结果；尚未执行的任务不标记通过。

## T1/T2 验证

- T1 已形成验证模块需求设计和阶段规则，明确九类范围、模块归属、YAML 子集、配置引用和结果边界；规格引用及使用示例解析通过。
- T2 首轮 9/10 通过，剩余项是 Windows 文件符号链接创建缺少权限；改为目录 junction 验证同样的链接穿透拒绝，未放宽安全条件。
- 固定源码重建后 T2 10/10 通过、0 跳过，日志 catalog-tests.log。本阶段完成后才进入运行记录及 CLI 集成验证。

## T3 集成及修复验证

- 首轮运行记录与 CLI 测试 11/11 通过，日志 runs-tests.log。
- 交叉复核发现共享结果目录被忽略仍可保存、自引用机器记录可能充当通过证据、Windows 大小写可能绕过业务仓库执行边界；修复后重建，目录、执行与 CLI 合计 24/24 通过，0 跳过，日志 verification-final-tests.log。
- 测试包括零退出不生成用例通过、非零退出、超时、输出超限、执行前输入变化、运行中改写输入、人工声明、历史记录保留与摘要不匹配。结构和来源检查不认证报告内容真实性。
- 最后对齐模块文件名与类别标签约定，重建后单独复验目录测试，再进入 T4。此前 24 项不声称包含这项最后补充。

## T4 升级与整库回归

- 模块文件名契约补充后，目录检查 11/11 通过，日志 catalog-final-tests.log。
- 本工作树通过正式 upgrade 预览与应用从 0.3.5 升级到 0.3.6，ready=true、issues=[]；未手改资源摘要。主副本和外部测试工程不在此次升级范围。
- 静态检查、类型检查和构建通过。固定构建后，使用 `node --test --test-concurrency=2 test/*.test.mjs` 完成整库回归：228/228 通过，0 失败、0 跳过；原始输出见整库报告（原过程文件已清理）。包含两种模式的旧版本升级及项目验证资料保留。
- 整库检查结束后补充更精确的结果文件预检：当忽略规则仅匹配新结果 JSON 文件时，也必须在命令执行前拒绝；同时补充报告中的需求关联明细。该补充需要单独重建与受影响回归，不能声称已包含在此前 228 项中。
- 以上补充后运行记录与 CLI 14/14 通过，首个安装包 18 项检查通过。随后复核补齐原始命令、仓库相对目录、执行起止时间和时长，验证配置变化后历史仍可追溯。重新构建后最终受影响回归仍为 14/14，通过且无跳过，原始输出见最终运行记录与 CLI 回归（原过程文件已清理）。静态检查和构建通过，安装包按最终构建另行验证。
- 最终构建的安装包 18 项检查全部通过，版本 0.3.6；在此之后才开始 T5 的自身目录接入和两种语言临时工程验证。包摘要、原生输出及具体关联在 T5 证据中保留。

## T5 自身接入与实际证据

- 通过 verification init 建立入口，按设计登记 9 个用例、3 个项目原生套件和 54 个显式输入。用例结构与引用检查通过；未将其称为全部产品需求已经登记。
- 用固定入口预览并执行自身 cli 套件，实际两项测试通过，记录保留命令与时间。随后报告仍将未声明结果的 9 个用例全部保持 not-run，验证了零退出不自动生成用例通过。
- 分别在临时 Node.js 与 Python 工程接入，运行原生 node:test 与 unittest，各 1 项实际通过；原目录与框架复用，退出成功仍不自动生成逐用例通过。临时目录已清理。
- 根据原生输出逐项核对后，用 verification record 登记 8 个用例的明确结果；最终报告是 8 项 passed、1 项 not-run。未执行项是 TC-VERIFY-AI-FLOW，另有 performance 和 usability 待明确；ready=false 与这些缺口一致。没有把报告生成当作验收。
- 完整证据、构建与包摘要、命令输出及用例对应关系见[本次原生证据](verification.md#原生测试与接入摘要)。执行与声明机器记录位于本工作 verification-runs/，由命令维护，未手写或改造摘要。

## 交付核对

工程 status、工作结构检查均 ready=true、issues=[]；工作保持 draft，不表示用户验收。文档本地链接、锚点及 git diff --check 已检查。自身用例报告中的剩余项与技术检查结果分开呈现。主副本无工作区改动，所有新修改未提交、未推送。

## 原生测试与接入摘要

环境：Windows；Node.js v22.23.2；Python 3.11.2；Git 2.55.0.windows.4。版本为 0.3.6，基于 fa79fae 的未提交增量。

## 代码与安装验证

- 整库原生输出（原过程文件已清理）：228/228 通过，无跳过；这是具体结果文件预检及执行追溯最后补充之前的整库结果。
- 最终受影响原生输出（原过程文件已清理）：重建后运行记录 12 项、CLI 2 项，14/14 通过，无跳过。覆盖最后两次补充；未将其冒称另一次完整整库执行。
- 最终安装包实际执行 18 项检查，通过。包括隔离安装、中文空格路径、两种模式、历史升级和验证入口。没有发布到 npm。
- 安装包 SHA-256：0733279ced632adb4fad6582664efe9d115b28ff965608140949cc0d77913204。
- 编译后 CLI SHA-256：892406e7741f9ac02f3ca91f20b2ac2418a620584672b5630f7d9c700ebdd5f2；运行记录实现 SHA-256：27de5db7bb417beb82f4f1be749509b60fdc0b823fded7bf99c31aed8c56ae07。
- 编译产物不在共享输入引用内，以上摘要单独说明本次实际构建。源码输入不能证明未登记依赖或环境没有变化。

## Tiller 自身实际执行

用固定入口运行 verification check，检查 9 个登记用例。随后对 cli 套件预览并实际应用计划，时间 2026-10-19T04:16:23.145Z，机器记录编号 85d58a11-8757-404c-ba4f-394359101c84。套件成功后，报告仍将 9 个尚未明确登记结果的用例保持 not-run，未自动批量产生通过。

```text
TAP version 13
# Subtest: verification CLI creates no business cases and check stays read-only
ok 1 - verification CLI creates no business cases and check stays read-only
  ---
  duration_ms: 3039.5677
  type: 'test'
  ...
# Subtest: verification CLI binds explicit runs and distinguishes reported case evidence
ok 2 - verification CLI binds explicit runs and distinguishes reported case evidence
  ---
  duration_ms: 23531.9643
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 26751.8275
```

## 两种语言入口

为每种语言分别创建临时工程，先放入原生测试，再接入 tiller 并登记程序与参数；保留原测试目录，没有转换为 Node.js 测试。检查、预览、执行及“退出成功仍未生成逐用例通过”断言均实际完成。检查后清理本次临时目录，未修改外部 single/multi 测试仓库。

### Node.js

命令：`node --test test/native.test.mjs`；执行记录时间：2026-10-19T04:13:53.359Z。原生断言为加法函数 sum(2, 3) 等于 5。

```text
TAP version 13
# Subtest: native sum
ok 1 - native sum
  ---
  duration_ms: 1.4069
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 164.6451
```

### Python

命令：`python -m unittest discover -s tests -p test_native.py`；执行记录时间：2026-10-19T04:14:06.400Z。原生断言为加法函数 sum(2, 3) 等于 5。

```text
.
----------------------------------------------------------------------
Ran 1 test in 0.000s

OK
```

## 用例结果关联

| 用例 | 本次核对依据 |
|---|---|
| TC-VERIFY-YAML | 整库输出中的 restricted YAML 两项测试 |
| TC-VERIFY-ASSOCIATION | 整库输出中的 module membership、cross-module scope 及类别文件名检查 |
| TC-VERIFY-BOUNDARY | 整库输出中的 management suites cannot select repository container 检查 |
| TC-VERIFY-EXECUTION | 最终受影响输出中的 failed command、timeout、output overflow 检查 |
| TC-VERIFY-EVIDENCE | 最终受影响输出中的 reported outcomes、ignored result、independent evidence 检查 |
| TC-VERIFY-CLI | 最终受影响输出及本工程实际执行的完整 CLI 场景 |
| TC-VERIFY-LANGUAGES | 上述独立 Node.js/Python 临时工程的原生执行 |
| TC-VERIFY-UPGRADE | 整库输出中的 0.3.5 testing upgrade preserves existing verification assets，两种模式均通过 |

上述关联由本次执行 Agent 依据原生输出逐项核对后登记，来源类型为 reported；CLI 不认证声明人或自动解析通用报告。长期用例是本次接入的登记范围，不宣称旧测试执行时已经存在这些定义或确认。

TC-VERIFY-AI-FLOW 保持未执行，性能和易用性仍待明确。Windows 上的两种语言入口不能代替 macOS/Linux、全部框架或真实 AI 工作流程验证。技术结果不构成人工验收或发布授权。
