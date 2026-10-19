# 本次原生测试与接入证据

环境：Windows；Node.js v22.23.2；Python 3.11.2；Git 2.55.0.windows.4。版本为 0.3.6，基于 fa79fae 的未提交增量。

## 代码与安装验证

- [整库原生输出](full-regression.log)：228/228 通过，无跳过；这是具体结果文件预检及执行追溯最后补充之前的整库结果。
- [最终受影响原生输出](runner-regression.log)：重建后运行记录 12 项、CLI 2 项，14/14 通过，无跳过。覆盖最后两次补充；未将其冒称另一次完整整库执行。
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
