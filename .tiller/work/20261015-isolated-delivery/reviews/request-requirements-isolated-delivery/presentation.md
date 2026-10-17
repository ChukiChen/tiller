# 确认请求 requirements-isolated-delivery

请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。

```json
{
  "requestId": "requirements-isolated-delivery",
  "gate": "requirements",
  "scope": {
    "repositories": [
      "."
    ],
    "targets": [
      "20261015-isolated-delivery"
    ]
  },
  "reviewSummary": "请确认隔离开发与评审合入需求增量：总体R2/R3，FLOW-17至19与配套合入节点及AC-40至49，RULE-11及AC-23至25，初始化管理方式边界及AC-19。当前工程资料随本仓库交付；独立管理工程集中共同记录并分别关联业务仓库；仅涉及一个业务仓库不切换管理模式。",
  "openIssues": [],
  "nextAction": "确认需求后分别设计两种模式的目录、基线、资料版本化、分支与MR、恢复及清理；默认提交推送授权策略仍需在设计中明确。本请求不授权当前仓库提交、推送、创建MR、合并或发布。",
  "subjects": [
    {
      "repository": ".",
      "path": ".tiller/specs/requirements.md",
      "sha256": "da8003f33831407e9995c0936dab226e4ff285399d7e92ee670ad5ccdb41ee3d",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-requirements-isolated-delivery/0.json"
    },
    {
      "repository": ".",
      "path": ".tiller/specs/modules/workflow/requirements.md",
      "sha256": "65f7d4aa26175bc053bf5797cd4bfae7d51973967256481d69febaecad6c3efd",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-requirements-isolated-delivery/1.json"
    },
    {
      "repository": ".",
      "path": ".tiller/specs/modules/standards/requirements.md",
      "sha256": "788ca864006ee99db9f0ee72b32445c10207e69ca5548e3b217bd2b52e478ecc",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-requirements-isolated-delivery/2.json"
    },
    {
      "repository": ".",
      "path": ".tiller/specs/modules/initialization/requirements.md",
      "sha256": "58e495bf5d0565183288683034e7931e7965ba9af3d0f397589863b6035777b6",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-requirements-isolated-delivery/3.json"
    }
  ],
  "upstream": [],
  "exception": null
}
```
