# 确认请求 acceptance-020

请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。

```json
{
  "requestId": "acceptance-020",
  "gate": "acceptance",
  "scope": {
    "repositories": [
      "."
    ],
    "targets": [
      "human-confirmation",
      "dated-work-names",
      "known-resource-upgrade"
    ]
  },
  "reviewSummary": "请验收0.2.0本次实现：四类确认记录与受控检查、人工验收后的文档完成、0.1.0显式升级、日期前缀工作标识及对应规则。63项自动测试与隔离安装通过，学生服务两次独立试用停在需求待确认。Windows已验证，其他平台未验证；来源依赖执行者核对，不能阻止宿主直接写入。",
  "openIssues": [],
  "nextAction": "仅将用户明确接受的本次交付范围记录为已验收，不提交、推送或发布。",
  "subjects": [
    {
      "repository": ".",
      "path": ".tiller/work/human-confirmation/host-evidence.json",
      "sha256": "cca4bef49b9b640c4c78c67035daf95f2df0065f66bdb274cb61344d9630f562",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/0.json"
    },
    {
      "repository": ".",
      "path": ".tiller/work/human-confirmation/implementation.md",
      "sha256": "3c1af29de2dae7d9328162396054ee92a8505fdbbbb5b7216d5f239f55034abc",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/1.json"
    },
    {
      "repository": ".",
      "path": ".tiller/work/human-confirmation/verification.md",
      "sha256": "49ecd90d40316e2e2705ecd920ea2318d8c90132fdf7b5ff7c681cc59b6e01ee",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/2.json"
    },
    {
      "repository": ".",
      "path": "package-lock.json",
      "sha256": "bca0b3ee02f1e0f5ceb251451e9e538fbce92bc2666b0610624596657af57e83",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/3.json"
    },
    {
      "repository": ".",
      "path": "package.json",
      "sha256": "1d797638cafef28d80219c251076b8d1153f0b1da589b3458b29c7757aac5285",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/4.json"
    },
    {
      "repository": ".",
      "path": "README.md",
      "sha256": "0e920422404189e1e9481fe10f4c72af9b524d5a9e0943103d5fc146926ed65b",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/5.json"
    },
    {
      "repository": ".",
      "path": "resources/baselines/0.1.0.json",
      "sha256": "f6c74f5ccbb14a5879f479f10e96e0dc260189b21e8366b0e9f4f4c80db3f27c",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/6.json"
    },
    {
      "repository": ".",
      "path": "resources/entry.md",
      "sha256": "63cbf4f1d5241319e129847f4d7e2766c027af28dcc0c235e2b33aae5ab32de6",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/7.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/delivery.md",
      "sha256": "f8a78932a8c98ec27ad09b1ab9b1b24618d9bb38874e67fdd060d0b85e7ba5b7",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/8.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/design.md",
      "sha256": "79fb050fb487b3c94fe02c8cecd48e4d1ed25c6c6717034b73b0223d7a36903a",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/9.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/implementation.md",
      "sha256": "20714827ebf52406a3fa5c7c68c2c8e488ae71cceb87d64ce886193abe8d94fc",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/10.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/requirements.md",
      "sha256": "0c19712edf071764990ca03cda693f970426fb003b0454f8bff3ce07194ff7b1",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/11.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/core.md",
      "sha256": "9995a91240f9954be75cab95a466901ae4bb8beb6a6013c1fc63cd2036c52b72",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/12.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/index.md",
      "sha256": "9a8c691b3621f617cf18c64e1cae4e5686d5d9c18af6b713e41fb4ad246b28b5",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/13.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/quality/documents.md",
      "sha256": "8c1c5df9ea823c91523d1e45e90ec74f8aac7841c7e56f8db818e237f053ba5b",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/14.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/quality/verification.md",
      "sha256": "fe3c0e7bde1e31b24ed857aff607f1cf711e231dc2c0bb05fa3572e82617df3b",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/15.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/change-design.md",
      "sha256": "485d554a6c679b650b40b5333077c2169c810ac723d3c2463c870271847c0b35",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/16.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/change-requirements.md",
      "sha256": "9ee607ac492c9ea7f2ddd79d618767552c8fa55600a729b7cfd832f0207c9997",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/17.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/module-design.md",
      "sha256": "95424fcc05bd2cbfd56f8f3d93b11aeacb1245debec3bcd3cdd34169dcdc5a61",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/18.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/module-requirements.md",
      "sha256": "c3a853a0eb0aadc7e4a2e115f4e30d37355b2ad62b71c4f08790b68b7f156cd4",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/19.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/product-design.md",
      "sha256": "44b351583437442114c87fef75df487fe15fb5649697a8634258aad45d480a20",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/20.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/product-requirements.md",
      "sha256": "24e68131c2aa4a259e7ba2b65dc3752dae969431eb46467f69482cdf896c0f07",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/21.json"
    },
    {
      "repository": ".",
      "path": "scripts/lint.mjs",
      "sha256": "4090ae522f6dbf34b9e026bfc5164e250aa0ef7cd99f6cdd506ef8751dafdee2",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/22.json"
    },
    {
      "repository": ".",
      "path": "scripts/package-smoke.mjs",
      "sha256": "d997cc75bd077f563380e082c68754bf0a6337edc54ad792f6ad2eb81697d9f7",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/23.json"
    },
    {
      "repository": ".",
      "path": "src/cli.ts",
      "sha256": "14ee886700c7e1e2ec7883ae27234bf12f711fed9677dfe7dd743eba6dc12b57",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/24.json"
    },
    {
      "repository": ".",
      "path": "src/confirmations.ts",
      "sha256": "d4a9d8913c07dbf09842539b041670d91be5bd1bb64ca3d3a1230e07faf1f40b",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/25.json"
    },
    {
      "repository": ".",
      "path": "src/core.ts",
      "sha256": "ed0173bf95e00e2a564cfe3e1261ddbbc2cac26c3ddeef6d3783a60df91128e4",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/26.json"
    },
    {
      "repository": ".",
      "path": "src/files.ts",
      "sha256": "ea2228ad181c6ee899e03e19c3f2b521572df7ec00d27eb420d12f0336aee22c",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/27.json"
    },
    {
      "repository": ".",
      "path": "src/types.ts",
      "sha256": "313931694edfc390139cf4436b9c9b1161a7d923967e8405c74a352a15251429",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/28.json"
    },
    {
      "repository": ".",
      "path": "src/upgrade.ts",
      "sha256": "397e7d8328b93879ec6dd1d9dc610c58d932aee304c343434a859dc9ba74b85a",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/29.json"
    },
    {
      "repository": ".",
      "path": "src/work.ts",
      "sha256": "64c5a2f145bfe3b0db9b85fb9e1bb7ea6b7da6e285e6cbdc19cba90beb0dc961",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/30.json"
    },
    {
      "repository": ".",
      "path": "test/cli.test.mjs",
      "sha256": "f314c0afa663ad95715e0ae7beb706ecafe1530d923cd2d29e7dc69379b0b2da",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/31.json"
    },
    {
      "repository": ".",
      "path": "test/confirmations.test.mjs",
      "sha256": "ca2dd95ff77cbe1fcd0c6732819fcca2615056486e6c1c0821955f0830a803c2",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/32.json"
    },
    {
      "repository": ".",
      "path": "test/core.test.mjs",
      "sha256": "271c9e9719f47c62da30402ed579a3d932343847747b669f3c86844b6079fc06",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/33.json"
    },
    {
      "repository": ".",
      "path": "test/helpers.mjs",
      "sha256": "ea2a4acb80026da2d0eef9ab206eaefcbe48d871a6f4540c31033390ac515dc4",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/34.json"
    },
    {
      "repository": ".",
      "path": "test/rules.test.mjs",
      "sha256": "622369ad4e9c681de26c5e65a4b1f364e5b46ca534cdefdfdd665cbd5a739b92",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/35.json"
    },
    {
      "repository": ".",
      "path": "test/upgrade.test.mjs",
      "sha256": "ece56838d9e938dd7040518db9f1e5bbcd14105299151a3c74fc34a6235ad345",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/36.json"
    },
    {
      "repository": ".",
      "path": "tsconfig.json",
      "sha256": "57c2904d10d6e50d9185a3c61f6bebc92d6f616b9c26f107da29e3055f1d961f",
      "snapshot": ".tiller/work/human-confirmation/reviews/request-acceptance-020/37.json"
    }
  ],
  "upstream": [],
  "exception": null
}
```
