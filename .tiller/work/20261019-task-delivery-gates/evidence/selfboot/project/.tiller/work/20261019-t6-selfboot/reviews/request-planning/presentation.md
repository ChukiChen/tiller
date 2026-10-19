# 确认请求 planning

请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。

```json
{
  "requestId": "planning",
  "gate": "planning",
  "scope": {
    "repositories": [
      "."
    ],
    "targets": [
      "T6 安装与顺序自举"
    ]
  },
  "reviewSummary": "细化真实已确认 T6 的受控安装、失败恢复与上下文交接验证。新机器展示晚于既有批准；authority/plan.md 是范围及条件不变的进度快照，不是原批准时的相同字节。",
  "openIssues": [],
  "nextAction": "只执行既有T6范围内的安装、失败恢复和接续验证。",
  "subjects": [
    {
      "repository": ".",
      "path": ".tiller/work/20261019-t6-selfboot/planning/t6-one/definition.json",
      "sha256": "932396ee214168f63ca117cf8c8dba9e7d6f1c5c51037b8827eb74ec650930c0",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-planning/0.json"
    },
    {
      "repository": ".",
      "path": ".tiller/work/20261019-t6-selfboot/planning/t6-one/review.md",
      "sha256": "e9b8525be1ca428be2ebf4a30787ef6d884d7e894ecc0bb93fa0449a215dfb70",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-planning/1.json"
    },
    {
      "repository": ".",
      "path": "authority/design.md",
      "sha256": "efb54cdb3b1499815e6af5c12960b1142c3bbc36dffd32486083450099717928",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-planning/2.json"
    },
    {
      "repository": ".",
      "path": "authority/requirements.md",
      "sha256": "5738ea2a287fa888ba6e1e28f7b29c1c5472669b9592edbe10d78c730d5a4be8",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-planning/3.json"
    },
    {
      "repository": ".",
      "path": "authority/selfboot-scope.md",
      "sha256": "64994e4b643ce636cbb2fec34f95b33c4cca4ea45d63a771f65f49ef94f4f687",
      "snapshot": ".tiller/work/20261019-t6-selfboot/reviews/request-planning/4.json"
    }
  ],
  "upstream": [
    {
      "requestId": "design",
      "fingerprint": "54e8342d176fe3c44eb423261b4eb315a1ddd21fb50ac69c7282c4ca29473a56",
      "decisionId": "existing-t6-design"
    }
  ],
  "exception": null
}
```
