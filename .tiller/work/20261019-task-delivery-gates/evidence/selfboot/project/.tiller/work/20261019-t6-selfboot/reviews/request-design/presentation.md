# 确认请求 design

请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。

```json
{
  "requestId": "design",
  "gate": "design",
  "scope": {
    "repositories": [
      "."
    ],
    "targets": [
      "T6 安装与顺序自举"
    ]
  },
  "reviewSummary": "登记既有T6受控验证授权所覆盖的原规格；当前机器展示晚于原决定，不声称用户看过本次新展示。",
  "openIssues": [],
  "nextAction": "只执行既有T6范围内的安装、失败恢复和接续验证。",
  "subjects": [
    {
      "repository": ".",
      "path": "authority/design.md",
      "sha256": "efb54cdb3b1499815e6af5c12960b1142c3bbc36dffd32486083450099717928",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-design/0.json"
    },
    {
      "repository": ".",
      "path": "authority/selfboot-scope.md",
      "sha256": "64994e4b643ce636cbb2fec34f95b33c4cca4ea45d63a771f65f49ef94f4f687",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-design/1.json"
    }
  ],
  "upstream": [
    {
      "requestId": "requirements",
      "fingerprint": "798f1876479541972da764c7e0a28174ba5262ae46258591f9c29f6fff9754da",
      "decisionId": "existing-t6-requirements"
    }
  ],
  "exception": null
}
```
