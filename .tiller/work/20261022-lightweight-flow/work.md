# 精简 tiller 为轻量标准流程并删除旧审计

<!-- tiller-flow:v1 {"version":1,"id":"20261022-lightweight-flow","type":"improvement","size":"standard","created":"2026-10-21T22:52:56.736Z","base":"4185c63e1d1e8e407242048664fcacae1db07ad2","scope":["AGENTS.md",".gitattributes","package.json","README.md","resources","scripts","src","test",".tiller"],"preExisting":{".tiller/project.json":"9f3566cc15130fd02518c44a72172bfb4ccf591d6322c1a66dbd9b8167455145",".tiller/rules/activities/delivery.md":"0243db712003718b569b93d733048da237acf7b323d79e95cfc83eab9bf61c33",".tiller/rules/activities/design.md":"b6985cdd2c9b57556a5cbee580805cf239562519ee0b5a1806ff51aacd8ea7bc",".tiller/rules/activities/implementation.md":"8932252fb4fb77d0f3ab06e6dd47a10db4a78b4783b6632407273824a3f38569",".tiller/rules/activities/requirements.md":"9d8fa727d67fe5cd2bd83540777f6ace42e82eb555e0a53739fcc39febd36793",".tiller/rules/core.md":"1bf0c2163577266b792ba7070ff73aa3587d1c8564dd376dcf137d4cb5b31c4c",".tiller/rules/index.md":"2cb9f561ece51f98741c2fa7686cde9359886181ab1cf45e8153f9171e4db758",".tiller/rules/project.md":"973ee367a764c438dcab54a0e60c9cecd0ff992dd0d6f0575785a347d2a426e6",".tiller/rules/quality/documents.md":"7c4117eb7f42751aa9e0f1099cedc70a1ad8b4c697ce231f9a0c0bad05aeb655",".tiller/rules/quality/verification.md":"d1e6d3b01777951b80d3ffa9bd6df9e164bb10e2218716a03f1ea9a89de21a2c",".tiller/run.cjs":"b23dcd61e31128a0ab8655617e0804bcf24b8d8617b6a8756ad25df3231400db",".tiller/usage.md":"72153799ffbd118c180e3a562a8ec7741ed360eac7267540b68d8a98c6cb0824","AGENTS.md":"4c520363779597d8c3eb717b4f14e0dbdf28b8870a6679cf1442d310953b011d","README.md":"bab20c82fe633c9063fe87bef57646921f594e034e229543e7da41e32848a982","resources/entry.md":"ee9aa8b87f81bd544f5a60d6ebfeb318e652a4137b06f4a49459d5617bedb81e","resources/rules/activities/delivery.md":"0243db712003718b569b93d733048da237acf7b323d79e95cfc83eab9bf61c33","resources/rules/activities/design.md":"b6985cdd2c9b57556a5cbee580805cf239562519ee0b5a1806ff51aacd8ea7bc","resources/rules/activities/implementation.md":"8932252fb4fb77d0f3ab06e6dd47a10db4a78b4783b6632407273824a3f38569","resources/rules/activities/requirements.md":"9d8fa727d67fe5cd2bd83540777f6ace42e82eb555e0a53739fcc39febd36793","resources/rules/core.md":"1bf0c2163577266b792ba7070ff73aa3587d1c8564dd376dcf137d4cb5b31c4c","resources/rules/index.md":"2cb9f561ece51f98741c2fa7686cde9359886181ab1cf45e8153f9171e4db758","resources/rules/quality/documents.md":"7c4117eb7f42751aa9e0f1099cedc70a1ad8b4c697ce231f9a0c0bad05aeb655","resources/rules/quality/verification.md":"d1e6d3b01777951b80d3ffa9bd6df9e164bb10e2218716a03f1ea9a89de21a2c","resources/usage.md":"72153799ffbd118c180e3a562a8ec7741ed360eac7267540b68d8a98c6cb0824","src/cli.ts":"040021dcee32a576754176d3b53d3a0d789a60e27bd8026131a0c998e9fa5636","src/files.ts":"89bd332e00f22f7a1c31473d2087fb8ae199f367a452ada984b20344345bbb6a","src/upgrade.ts":"e21a9942b8c023a8f374c8a12f40689dc57e6480fc2ff754335a82b6fb4f9194","test/core.test.mjs":"464614ace08643d9e6d63367724fe80be0a298d6c02a28009636c9423b6df5f0","test/helpers.mjs":"4e293760f469dc5fed4d45164062b1ec71df7a0f560af9113e84cad9fe733308","test/rules.test.mjs":"81c9e325662bb9165c33ebb0800c7fdc1fa504cde920c24084faf6ac43f97729","test/shared-path-round-performance.test.mjs":"65c32a41ca172748781e1ad8849acff8d8be7eb1f17b01aba2cbfb00e9f253c1","test/suites.json":"6ed9a1f073d5162c7a8462d6866c0e9a96c34fd9ac8ba9c993335cb9ef63ced9","test/upgrade.test.mjs":"85bc434a46d7df52e7feb4f96227350ad63169914abbcffdeb61fd0415233814","test/usage-resources.test.mjs":"516d799a6c003638ec3a05ab83b43b551c344872d3075f3356d3288578e29a9e","src/lite.ts":"fe7f05afe6940a031fdb238cafa1d9cacbb9e6df3fdd1bd02f59fad2845b0ba3","test/lightweight-cli.test.mjs":"aea97d9d4a4185036e007386f696c83c1c355bf97f7b444603596d4ffbe265bf"}} -->

## 目标

按“标准流程 + 轻量 + 快 + 保质量”收敛 tiller：默认只保留需求、设计和交付验收三类人工节点，工作记录只维护 `work.md` 与 Git，并彻底删除旧审计路径。版本号保持当前契约，不在本轮功能迭代中提升，只在最终发布正式包时修改。

## 验收条件

- AC-1: AI 开工必读的 AGENTS、核心规则、使用指引和规则索引不超过约 5000 字且链接有效
- AC-2: 小改动只生成 `work.md`，标准任务受设计确认约束，`check` 覆盖验收条件、范围、测试删除或弱化、未提交改动和记录安全
- AC-3: `reviews/*.json`、全文确认快照、证据包、`.tiller/verification/`、旧多文件工作与 workflow 审计命令、资源、源码和测试均已删除，`work.md` 与 Git 是唯一记录来源
- AC-4: `package.json`、`CLI_VERSION`、`RESOURCE_VERSION` 保持当前契约 0.5.0；自举工程 `.tiller/project.json` 的 `resourceVersion` 保持基线 0.4.0，只刷新受管摘要；升级只核对当前契约，不提供历史迁移，也不把本轮功能改动绑定为资源版本升级
- AC-5: `build`、`lint`、`typecheck`、完整 `npm test` 和本地包冒烟全部通过
- AC-6: README、使用指引、规则和帮助不再引导 `advanced` 或旧审计路径

## 设计

默认 CLI 只保留 `init/status/start/resume/confirm/verify/check/accept/recover/runtime/upgrade`，由 `src/flow.ts` 实现确认、验证与交付自检。工作记录采用单份 `work.md`，确认绑定用户原话、提交和对象摘要，验证绑定验收条件、测试引用、命令结果、提交和范围代码树摘要。验证随范围内代码或测试变化而失效；`check` 同时核对未提交改动、范围、测试删除或弱化、密钥和本机绝对路径。

旧确认、交付、规划、任务、验证和 workflow 业务模块以及全部旧测试、workflow 资源、模板和旧包门禁脚本已删除；CLI 不再暴露 `advanced`，安装包只包含轻量运行所需模块。受管资源更新后只重算当前资源版本下的文件摘要，不改变资源版本。

版本策略恢复为当前契约安全检查：`upgrade` 不产生文件变更，也不提供 0.4.0 → 0.5.0 迁移故事。`package.json`、`CLI_VERSION`、`RESOURCE_VERSION` 保持当前契约 0.5.0；自举工程元信息保持原有 `resourceVersion` 0.4.0，只刷新受管摘要。版本号只在最终发布正式包时修改。

## 确认

尚无确认。

## 验证

### run-1
- 条件：AC-1
- 测试：test/rules.test.mjs
- 命令：npm run test:rules
- 结果：passed
- 退出码：0
- 提交：291a176e48ad706eecbba6c8df7a1c36b83ff5b5
- 代码树摘要：e1a6da5bf424ca09158a2b00beccee2bdf66eb2e867f0809e35fe254cb6d6837
- 来源：executed
- 时间：2026-10-22T00:02:59.454Z

### run-2
- 条件：AC-6
- 测试：test/rules.test.mjs
- 命令：npm run test:rules
- 结果：passed
- 退出码：0
- 提交：291a176e48ad706eecbba6c8df7a1c36b83ff5b5
- 代码树摘要：e1a6da5bf424ca09158a2b00beccee2bdf66eb2e867f0809e35fe254cb6d6837
- 来源：executed
- 时间：2026-10-22T00:02:59.454Z

### run-3
- 条件：AC-2
- 测试：test/flow-cli.test.mjs
- 命令：npm run test:e2e && npm run test:package
- 结果：passed
- 退出码：0
- 提交：291a176e48ad706eecbba6c8df7a1c36b83ff5b5
- 代码树摘要：e1a6da5bf424ca09158a2b00beccee2bdf66eb2e867f0809e35fe254cb6d6837
- 来源：executed
- 时间：2026-10-22T00:03:06.545Z

### run-4
- 条件：AC-3
- 测试：test/flow-cli.test.mjs
- 命令：npm run test:e2e && npm run test:package
- 结果：passed
- 退出码：0
- 提交：291a176e48ad706eecbba6c8df7a1c36b83ff5b5
- 代码树摘要：e1a6da5bf424ca09158a2b00beccee2bdf66eb2e867f0809e35fe254cb6d6837
- 来源：executed
- 时间：2026-10-22T00:03:06.545Z

### run-5
- 条件：AC-4
- 测试：test/upgrade.test.mjs
- 命令：npm run test:integration
- 结果：passed
- 退出码：0
- 提交：291a176e48ad706eecbba6c8df7a1c36b83ff5b5
- 代码树摘要：e1a6da5bf424ca09158a2b00beccee2bdf66eb2e867f0809e35fe254cb6d6837
- 来源：executed
- 时间：2026-10-22T00:03:10.676Z

### run-6
- 条件：AC-5
- 测试：test/suites.json
- 命令：npm run build && npm run lint && npm run typecheck && npm test && npm run test:package
- 结果：passed
- 退出码：0
- 提交：291a176e48ad706eecbba6c8df7a1c36b83ff5b5
- 代码树摘要：e1a6da5bf424ca09158a2b00beccee2bdf66eb2e867f0809e35fe254cb6d6837
- 来源：executed
- 时间：2026-10-22T00:03:20.232Z

## 自检

- [ ] 需求确认有效
- [ ] 设计确认有效
- [x] 验收条件均有当前通过的测试引用
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 缺少需求确认。
- 缺少设计确认。

提示：
- 删除 75 个测试文件（请确认对应功能已删除；详情见 Git diff）。
- 修改的测试文件移除了 11 个测试用例（请确认对应功能已删除；详情见 Git diff）。
