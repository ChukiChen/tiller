# 第一批功能补齐：规划、接入、用例绑定与受管升级

<!-- tiller-task:v1 {"version":1,"id":"20261022-first-batch","type":"feature","size":"standard","created":"2026-10-22T03:16:23.080Z","base":"8f56212effb97e1a5a9cef881118473bdd140c51","scope":["src","test","resources","scripts","README.md",".tiller/specs",".tiller/cases",".tiller/context",".tiller/rules",".tiller/usage.md",".tiller/run.cjs",".tiller/index.md",".tiller/project.json","AGENTS.md"],"preExisting":{".tiller/cases/index.md":"37c25f66d392bdb71d8a48ca8cb4d2cd5214c7f9df4adbbdf39ddda9221f3875",".tiller/specs/decisions.md":"75e6fe15719dfb72106e3dbe9fdcd8d97ce5d7ad27d8bed4f791c08fb6a2ecab",".tiller/specs/design.md":"a39e4492dc0a35e3504164f82c40d7f2b9ea4613e139cb31614810ea5fa73d53",".tiller/specs/modules/initialization/design.md":"39786d00349ac241159f2369086c3726d745a408f0954e45e02c9521542b5c4c",".tiller/specs/modules/initialization/requirements.md":"eb4fb3464491d71eb002b28065ed83628dfdb6d64b1f8867b061d7b3d1410b15",".tiller/specs/modules/standards/design.md":"22eec78d4cebbd71094b2c7560cb6865d21885c64999db3bc050f15e729b7be0",".tiller/specs/modules/standards/requirements.md":"5fb94bc5211c377158712d17ef9dbd0c82d59328a16e0d1a96922df3d7573a32",".tiller/specs/modules/verification/design.md":"23e112caf2ba53753ba17927dbced69cdbd47bd34f24f421cc677a32586001d0",".tiller/specs/modules/verification/requirements.md":"5ced65975d672cf73d6c04def1db0cf5a5b22d69953f2ba21960d574923aa5cd",".tiller/specs/modules/workflow/design.md":"6932723b3a29071cc1d334b6cc10d1677d07931f951f2acb457b2220cfd785cc",".tiller/specs/modules/workflow/requirements.md":"a0e8da62efdcafdfea1728a9e0c87d4d29bc5d3f63f971971531f2a49914c69d",".tiller/specs/requirements.md":"b826d7d09d31a876a0e6c034c45a1ebdd6dacbd4130d088727867ee4f9a45b9c","README.md":"4c71a3835bce88bc88f7fd675b6f02861822e76225943a31b47e1ce84cf42d91","resources/entry.md":"0830a81d2b0203d9dc4cc82da3683644f2cb53aa502c6d7bab2dc6b75e6cfe0b","resources/rules/activities/delivery.md":"7932e2ba606da366e1616a8ed1881f44de8c2994b50446f58570a966f2dd7131","resources/rules/activities/design.md":"5056858f1759a303b28d2ac7ca36826a1be6c5d46672cddef773ae4c82d773f7","resources/rules/activities/requirements.md":"8b75d241a4fcc4abe36eca26932100a0fe0d1fcb08efc4a4bfdd66d7226b00f4","resources/rules/core.md":"c3fe50715ee36bc0458fef63f765ac2f196986031144d771fa1c56c8147be49f","resources/rules/index.md":"d22dca8e8f3456905d69b60de3a6a7bed62c226f33799ddfad22bc4f3eefe0c5","resources/rules/quality/verification.md":"63ecd35bdd7133ec7fcf2ca2ed296a07d5b3c8300aa5d4f36cfb87c58aa18bc4","resources/run.cjs":"241714a501d059d5cb5869a5bd4a8129b7d1b684aeb5efd11506d19e998a48e7","resources/usage.md":"2a55a1e6571f41a347ac78b7e4794a565cad067bac3ff86c81f4095e082b1b24","scripts/package-smoke.mjs":"97a56cbeb0be00c1565553072c24baf7cc86dcbd8a49be01ab5802d965d995eb","src/cases.ts":"99a741ff4f6aebda63538f18f3928e3bd7f721cda1d043fdc6974fdaaed1b513","src/cli.ts":"4f1f1db5f983d08e7957d6dff10fcba66b838096c1f37989c0bf8fa4680fb0ef","src/core.ts":"57ac4f637593e81f7341ccb6b478ea194822a53a77783dc4e18df7390b60b9a2","src/flow.ts":"212e026e364b44abf743dfe003f2b516cc2f0898a2c7d3643648d9cf9214589f","src/project-metadata.ts":"dcd1f8ba304caec154723e657faadfb404c26a7d72d49127f452361ba6b26ca3","src/repository-paths.ts":"4ff58d8177affb197d32e530a73cc50bf7f5e371dd656a30c2ca8a49544b01f7","src/types.ts":"ab332d517f2edb38145749b2ac094cdd6006fadb32eef5698f8e558498422c2e","src/upgrade.ts":"97e9cdb2463848047ff648c82cc42e3d7df85f7aae47223342d6dac809825eea","test/core.test.mjs":"7e19576b69c32d4136990cc5b0a5c2ff2b1ddce03320bee69968f8e16ddc390f","test/flow-cli.test.mjs":"2b4422dfce73110dc2009242d54baf20fa9b3052b1867552c47d0d8ddea7af50","test/helpers.mjs":"54fd251056d27389a97b7744b0c8f7f7a8da6bec79a760910e81ef723b0b2334","test/launcher-performance.test.mjs":"c4c8b52ab87ba46bd27409e9f1c16a023bcc0230e3865f0d754ebb108b61492c","test/repository-paths.test.mjs":"64f0307a776546111112d1c78c2951784c0a08f51915409b91eabce13f856462","test/runtime.test.mjs":"489b6c5bdc7e8e4743057e6dc40f231343db03db616d8561892b8917307b5bf2","test/suites.json":"ff751222438bf162e83bf925546dafd2b661c64c4116456c301af4246bbc551f","test/upgrade.test.mjs":"dd049fd96e86b0b8c916320e6ee5b93c02c1c9de6f649e6332b5c3fd116cb332","test/usage-resources.test.mjs":"0f2f398f71bb934ff600fba0dbaae5e135f7ea8fdc4d118b0948e13e704ad098",".tiller/specs/archive/decisions-2026-10-22.md":"32ffa85174135888d101550b44f7a88788e3bf8f33f7c05bf4b1cd2e8698c93d",".tiller/specs/archive/design-2026-10-22.md":"059550cd80c180fb37b300c45ca7feb679225c39503e685d6b2b42c06c9838c9",".tiller/specs/archive/modules-initialization-design-2026-10-22.md":"f0e78cdd9a66577076b5e748d8a71461a1988567e758b3e26084a8d334ca985f",".tiller/specs/archive/modules-initialization-requirements-2026-10-22.md":"a705eca3c3abf374737573b3efc98a286f1cc200accc628a9b7e13a8242ce055",".tiller/specs/archive/modules-standards-design-2026-10-22.md":"f8dfc9a2c35f51dab4cda2f1c480e1ab22abd39196c30873c31f14f43e028098",".tiller/specs/archive/modules-standards-requirements-2026-10-22.md":"df275a2819d76764b12ff0545b271493ee5608c48f5d3da330d817c520408183",".tiller/specs/archive/modules-verification-design-2026-10-22.md":"3ac73935b60dab3560fea7bc3d5117cb786cf5d1accdb0339891da45d8f5ae7b",".tiller/specs/archive/modules-verification-requirements-2026-10-22.md":"9c1eb0ed0fcc613b861fa68e6ff861618184ae8be7044388e00e5198f029f1dd",".tiller/specs/archive/modules-workflow-design-2026-10-22.md":"78ebb78516f51c31f939aa18477297648839b372c7d511ee8332a188700307d3",".tiller/specs/archive/modules-workflow-requirements-2026-10-22.md":"313b6bb40e66314bf58d9338b1c9c04540daf287d49b96161e06a95220fd7dd2",".tiller/specs/archive/requirements-2026-10-22.md":"ce4c58b2483855ffd4bc2586e85f4872a866be2fda97d3602a6cef598aa67563","src/plans.ts":"310c1ba6a63def02b3fde90974148f2498055ce7cc53e8c67e660540eac10c85","test/first-batch.test.mjs":"bdc661aab5c54ab5805391bf1737d01545c5611283f2fd6ef7c5600bdf6520af"}} -->

## 需求

在不恢复重审计的前提下补齐第一批产品能力：新增可确认的实施规划与条目依赖；空项目 init 生成最小骨架；case add 自动登记模块/场景用例并绑定来源 AC；check 双向校验 AC 与用例；upgrade 在兼容资源契约下刷新未修改的受管文件并保留用户修改；重写当前 specs 并将失效内容归档。所有能力保持轻量、以 task.md、cases 和 Git 为事实源，版本号不在本轮变更。

## 验收条件

- AC-1: 空仓库可走通 init、可选 plan、start、confirm、case add、写测试、verify、check、accept
- AC-2: 规划支持条目粒度与依赖、确认绑定正文、status 报告状态/未覆盖需求，依赖未验收时阻塞开工
- AC-3: case add 自动分配唯一编号，支持模块类型与场景，校验模块、AC 和具名测试引用
- AC-4: check 强制 AC 引用的用例存在、criteria 回指当前任务 AC、测试存在且本次验证通过且未过期
- AC-5: upgrade 支持兼容版本预览和应用，只刷新未修改受管文件，用户修改列为冲突并保留
- AC-6: 当前 specs 重写并控制篇幅，旧内容归档，入口/usage/rules/cases 与实际命令一致

## 设计

- 规划：新增 .tiller/plans/<id>.md，正文包含目标、specs 引用和条目；元信息保存粒度、依赖、覆盖需求、可选子规划指向与确认摘要。可见正文与元信息不一致时确认失效；start --plan/--item 继承粒度并检查依赖，未验收直接阻塞。plan status 从 task.md 验收记录推导条目状态。
- 初始化：init 只补缺失骨架，包含 specs、modules/README、context/project.md、cases 模块/场景目录和 plans；管理区段与已有文件不覆盖。
- 用例：全局用例按模块/类型和场景组织；case add 在工程锁内分配 CASE 编号，校验模块、类型、来源 AC 和 test_ref，缺测试文件返回骨架。新用例写 criteria，历史空值仅提示。
- 双向校验：verify 按具名测试命中用例并写入 task.md；check 要求 AC 有当前通过且未过期的验证、用例 test_ref 一致，并要求 criteria 回指当前 AC 或该用例在本任务新增/修改。
- 升级：upgrade 只接受当前和直接兼容的上一资源契约；按 project.json 摘要识别未修改受管文件，刷新时保留区段外内容与换行差异；用户修改、缺失和异常区段作为冲突。--plan 只预览，应用时锁内重核并原子更新摘要与 resourceVersion。
- 文档与规格：重写总体与四个模块规格，旧全文迁入 specs/archive；入口、usage、rules、README、cases/index 与命令保持一致，必读资料不超过约 5000 字符。
- 版本策略：本轮只更新自举工程的资源摘要与兼容 resourceVersion；package.json、CLI_VERSION 和 RESOURCE_VERSION 保持 0.5.0，不把功能改动绑定成资源升版。

## 确认

尚无确认。

## 验证

尚无验证。

## 自检

- [ ] 需求确认有效
- [ ] 设计确认有效
- [ ] 验收条件均有当前通过且绑定全局用例的测试引用
- [ ] 每条验收条件均映射到本次验证引用的全局用例
- [x] 验收条件与用例来源 criteria 相互指向或由本任务新增/修改
- [x] 全局用例结构与引用有效
- [x] 改动未超出范围
- [x] 未弱化仍存在的测试
- [x] 记录不含密钥或本机绝对路径

阻塞项：
- 缺少需求确认。
- 缺少设计确认。
- AC-1 尚无验证。
- AC-2 尚无验证。
- AC-3 尚无验证。
- AC-4 尚无验证。
- AC-5 尚无验证。
- AC-6 尚无验证。
- 交付范围存在未提交改动：.tiller/cases/index.md、.tiller/cases/modules/initialization/behavior.json、.tiller/cases/modules/verification/behavior.json、.tiller/cases/modules/verification/interface.json、.tiller/cases/modules/workflow/behavior.json、.tiller/cases/scenarios/new-project-onboarding.json、.tiller/context/project.md、.tiller/index.md、.tiller/project.json、.tiller/rules/activities/delivery.md、.tiller/rules/activities/design.md、.tiller/rules/activities/requirements.md、.tiller/rules/core.md、.tiller/rules/index.md、.tiller/rules/quality/verification.md、.tiller/run.cjs、.tiller/specs/archive/decisions-2026-10-22.md、.tiller/specs/archive/design-2026-10-22.md、.tiller/specs/archive/modules-initialization-design-2026-10-22.md、.tiller/specs/archive/modules-initialization-requirements-2026-10-22.md、.tiller/specs/archive/modules-standards-design-2026-10-22.md、.tiller/specs/archive/modules-standards-requirements-2026-10-22.md、.tiller/specs/archive/modules-verification-design-2026-10-22.md、.tiller/specs/archive/modules-verification-requirements-2026-10-22.md、.tiller/specs/archive/modules-workflow-design-2026-10-22.md、.tiller/specs/archive/modules-workflow-requirements-2026-10-22.md、.tiller/specs/archive/requirements-2026-10-22.md、.tiller/specs/decisions.md、.tiller/specs/design.md、.tiller/specs/modules/README.md、.tiller/specs/modules/initialization/design.md、.tiller/specs/modules/initialization/requirements.md、.tiller/specs/modules/standards/design.md、.tiller/specs/modules/standards/requirements.md、.tiller/specs/modules/verification/design.md、.tiller/specs/modules/verification/requirements.md、.tiller/specs/modules/workflow/design.md、.tiller/specs/modules/workflow/requirements.md、.tiller/specs/requirements.md、.tiller/usage.md、AGENTS.md、README.md、resources/entry.md、resources/rules/activities/delivery.md、resources/rules/activities/design.md、resources/rules/activities/requirements.md、resources/rules/core.md、resources/rules/index.md、resources/rules/quality/verification.md、resources/run.cjs、resources/usage.md、scripts/package-smoke.mjs、src/cases.ts、src/cli.ts、src/core.ts、src/flow.ts、src/plans.ts、src/project-metadata.ts、src/repository-paths.ts、src/types.ts、src/upgrade.ts、test/core.test.mjs、test/first-batch.test.mjs、test/flow-cli.test.mjs、test/helpers.mjs、test/launcher-performance.test.mjs、test/repository-paths.test.mjs、test/rules.test.mjs、test/runtime.test.mjs、test/suites.json、test/upgrade.test.mjs、test/usage-resources.test.mjs

提示：
- 49 条历史用例未绑定来源 AC；新用例请用 case add 写入 criteria，check 对已有 criteria 的用例执行反向校验。
- 本次改动涉及模块 initialization：建议回归该模块 14 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 standards：建议回归该模块 1 条用例及经过它的场景 CASE-055。
- 本次改动涉及模块 verification：建议回归该模块 24 条用例及经过它的场景 CASE-055, CASE-001。
- 本次改动涉及模块 workflow：建议回归该模块 14 条用例及经过它的场景 CASE-055, CASE-001。
