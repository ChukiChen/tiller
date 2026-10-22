# 第8轮：任务阶段、关闭与清理规格归档

<!-- tiller-task:v1 {"version":1,"id":"20261022-round8","type":"feature","size":"standard","created":"2026-10-22T03:54:14.861Z","base":"7de723d9ff68ed03e0e46c4f1f4e9dea6c5f01d8","scope":["src","test","resources","scripts","README.md","AGENTS.md",".tiller"],"preExisting":{".tiller/specs/archive/decisions-2026-10-22.md":"32ffa85174135888d101550b44f7a88788e3bf8f33f7c05bf4b1cd2e8698c93d",".tiller/specs/archive/design-2026-10-22.md":"059550cd80c180fb37b300c45ca7feb679225c39503e685d6b2b42c06c9838c9",".tiller/specs/archive/modules-initialization-design-2026-10-22.md":"f0e78cdd9a66577076b5e748d8a71461a1988567e758b3e26084a8d334ca985f",".tiller/specs/archive/modules-initialization-requirements-2026-10-22.md":"a705eca3c3abf374737573b3efc98a286f1cc200accc628a9b7e13a8242ce055",".tiller/specs/archive/modules-standards-design-2026-10-22.md":"f8dfc9a2c35f51dab4cda2f1c480e1ab22abd39196c30873c31f14f43e028098",".tiller/specs/archive/modules-standards-requirements-2026-10-22.md":"df275a2819d76764b12ff0545b271493ee5608c48f5d3da330d817c520408183",".tiller/specs/archive/modules-verification-design-2026-10-22.md":"3ac73935b60dab3560fea7bc3d5117cb786cf5d1accdb0339891da45d8f5ae7b",".tiller/specs/archive/modules-verification-requirements-2026-10-22.md":"9c1eb0ed0fcc613b861fa68e6ff861618184ae8be7044388e00e5198f029f1dd",".tiller/specs/archive/modules-workflow-design-2026-10-22.md":"78ebb78516f51c31f939aa18477297648839b372c7d511ee8332a188700307d3",".tiller/specs/archive/modules-workflow-requirements-2026-10-22.md":"313b6bb40e66314bf58d9338b1c9c04540daf287d49b96161e06a95220fd7dd2",".tiller/specs/archive/requirements-2026-10-22.md":"ce4c58b2483855ffd4bc2586e85f4872a866be2fda97d3602a6cef598aa67563"}} -->

## 需求

为默认流程补齐可推导任务阶段、关闭/放弃/重开语义，并彻底删除 specs 归档及所有引导引用，保持轻量与版本不变。

## 验收条件

- AC-1: specs/archive 目录及全部归档引用被删除，现行文档和用例不指向归档
- AC-2: task 阶段由 task.md 事实推导，确认或验证失效时回退并说明原因，resume 与 plan status 显示阶段
- AC-3: 已验收任务可 close，关闭后 confirm/verify/accept 被阻塞，reopen 后可继续
- AC-4: 未验收任务可 close --abandon，plan 条目不把放弃任务算作进行中或已验收
- AC-5: 文档、帮助、全局用例与具名测试同步，必读资料不超过约 5000 字符且版本号不变

## 确认

尚无确认。

## 验证

尚无验证。

## 自检

交付前运行 check；验收后运行 accept。
