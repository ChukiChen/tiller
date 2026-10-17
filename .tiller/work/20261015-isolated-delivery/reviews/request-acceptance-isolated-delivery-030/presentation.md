# 确认请求 acceptance-isolated-delivery-030

请审阅以下具体范围、对象、未决事项和下一步。批准只适用于本请求。

```json
{
  "requestId": "acceptance-isolated-delivery-030",
  "gate": "acceptance",
  "scope": {
    "repositories": [
      "."
    ],
    "targets": [
      "20261015-isolated-delivery"
    ]
  },
  "reviewSummary": "审阅 tiller 0.3.0 隔离交付实现、规则、测试及验证证据。范围包括两种管理模式、授权动作、评审适配、合入绑定、恢复清理和兼容升级；平台缺少原子保护时拒绝自动合入。",
  "openIssues": [],
  "nextAction": "仅在真实用户接受本次具体交付后登记验收；真实平台写入、项目提交推送、合入和发布另按明确授权处理。Java 项目升级与实际使用验收为后续建议，不自动执行。",
  "subjects": [
    {
      "repository": ".",
      "path": "README.md",
      "sha256": "f9703b1b1c7b8b1d9621fe3dbfcc939c9594f5d54d3e648c9d33557b96edd28d",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/0.json"
    },
    {
      "repository": ".",
      "path": "AGENTS.md",
      "sha256": "6090ae57f2d736a0493ac40295a892eb9f6c0fcd452d4956f76daace79d0b562",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/1.json"
    },
    {
      "repository": ".",
      "path": "package.json",
      "sha256": "bdf6607bf7dd3630b7c642026738d6b8d170e3a5a25a4a476e5acdf155a5b22b",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/2.json"
    },
    {
      "repository": ".",
      "path": "package-lock.json",
      "sha256": "95d4430f3ea5623a9cbfe0e80da74194976d2989debbd493d702e68cfb555eed",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/3.json"
    },
    {
      "repository": ".",
      "path": "tsconfig.json",
      "sha256": "57c2904d10d6e50d9185a3c61f6bebc92d6f616b9c26f107da29e3055f1d961f",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/4.json"
    },
    {
      "repository": ".",
      "path": ".gitignore",
      "sha256": "090945ca3d38c9aa1f3b3b2426123dd660bfdb0f2dfb91a1979928e95027e0b6",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/5.json"
    },
    {
      "repository": ".",
      "path": ".tiller/work/20261015-isolated-delivery/implementation.md",
      "sha256": "d315bcf779970ee95995c5d1e1586650a77fbf8b761bd34bf083d8e2c20151cf",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/6.json"
    },
    {
      "repository": ".",
      "path": ".tiller/work/20261015-isolated-delivery/implementation-verification.md",
      "sha256": "fc6bd2e5b1f8859b8f0c5b49463b0960fbb1cf6451c6c3bbc377a9ff14302951",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/7.json"
    },
    {
      "repository": ".",
      "path": "src/cli.ts",
      "sha256": "cb7ece09f872ff17acf4110a2d87476e8e88d370762e6de7b2be7382f7f93d64",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/8.json"
    },
    {
      "repository": ".",
      "path": "src/confirmations.ts",
      "sha256": "d4acaa8da8a2fc968795e8776a3740047334e28a0638210253e3b3e9b1d65a94",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/9.json"
    },
    {
      "repository": ".",
      "path": "src/core.ts",
      "sha256": "3c13114bf7e0ff5e74c4474ea291a615725fa1e22a60074d264711ef65c19380",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/10.json"
    },
    {
      "repository": ".",
      "path": "src/delivery-actions.ts",
      "sha256": "918b5a9c72bc9231ef05d686f28e9a73c28329298504b65126ad73b38525a04e",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/11.json"
    },
    {
      "repository": ".",
      "path": "src/delivery-environment.ts",
      "sha256": "e32780123da5165460f0781521781fcaeaef16ab06a8112cb9b26b2ebf3f56c4",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/12.json"
    },
    {
      "repository": ".",
      "path": "src/delivery-git.ts",
      "sha256": "fc8af686ca2570efb85225c7ec4792973acdd21acbcbbe72fa044ef0cc352877",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/13.json"
    },
    {
      "repository": ".",
      "path": "src/delivery-location.ts",
      "sha256": "cfadde364843e358df3bde43ea8bfcd7eaaa3db4d266651b1db41dd05167b1d4",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/14.json"
    },
    {
      "repository": ".",
      "path": "src/delivery-types.ts",
      "sha256": "f2f884f5a21feb95abe9f2bf27e5e374982dbe94cc381d7ddd37244cdbdda336",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/15.json"
    },
    {
      "repository": ".",
      "path": "src/files.ts",
      "sha256": "ba8062083a840049c4c9159fd02918a48b16be71cf2f92363ace825324dc791a",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/16.json"
    },
    {
      "repository": ".",
      "path": "src/review-adapters.ts",
      "sha256": "b8ff0e24ba7e80581aa44417eda8e506b39d5ea30c571b8469a181207cb3cf41",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/17.json"
    },
    {
      "repository": ".",
      "path": "src/types.ts",
      "sha256": "ea8a360de990328d694e71363f7a7c2200ded57658f3df743c777fbaa2a7b136",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/18.json"
    },
    {
      "repository": ".",
      "path": "src/upgrade.ts",
      "sha256": "ed1720aebd8612c23ec82147cf45bcb7cc309579eb12fda49c281fcf56b535f3",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/19.json"
    },
    {
      "repository": ".",
      "path": "src/work-history.ts",
      "sha256": "0c2a8b1855a90a7a498caae7a226bd85a9483a06a30aececc4f6bf91377150d5",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/20.json"
    },
    {
      "repository": ".",
      "path": "src/work.ts",
      "sha256": "fac45f3aba8c99b4198147f43de15e5d902186a9337efba0358e572c24d6c8b8",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/21.json"
    },
    {
      "repository": ".",
      "path": "test/cli.test.mjs",
      "sha256": "8a9a16a3abbc96ed17b065f30ee6fe8b065b100305ef8bc94d09f2a6b643a633",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/22.json"
    },
    {
      "repository": ".",
      "path": "test/confirmations.test.mjs",
      "sha256": "ca2dd95ff77cbe1fcd0c6732819fcca2615056486e6c1c0821955f0830a803c2",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/23.json"
    },
    {
      "repository": ".",
      "path": "test/core.test.mjs",
      "sha256": "271c9e9719f47c62da30402ed579a3d932343847747b669f3c86844b6079fc06",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/24.json"
    },
    {
      "repository": ".",
      "path": "test/delivery-actions.test.mjs",
      "sha256": "9eef1279aafd92732780afe76769774de1c35f239687feec730d42583faaf1b3",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/25.json"
    },
    {
      "repository": ".",
      "path": "test/delivery-cli.test.mjs",
      "sha256": "6eaebf0f2b58c9bd9fadf1db66854e27eafd77fc0fa75ab9dd195e5b3a26ecf8",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/26.json"
    },
    {
      "repository": ".",
      "path": "test/delivery-environment.test.mjs",
      "sha256": "e78a93527debd5ec4cdd4241e99b00694a4f2289ac2c41e419020d9e22ce6715",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/27.json"
    },
    {
      "repository": ".",
      "path": "test/helpers.mjs",
      "sha256": "2af7d459c5844ca317760c43ea6d96e43b86bbd758a78826687d50ea6f2703d9",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/28.json"
    },
    {
      "repository": ".",
      "path": "test/merge-confirmations.test.mjs",
      "sha256": "485767b32fc73be4420fd4701382a3e95ad08fae362b04abdaaa3870ce350346",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/29.json"
    },
    {
      "repository": ".",
      "path": "test/review-adapters.test.mjs",
      "sha256": "e05d2e14e36757bcbfb751746371520b6558b5ced45bf87e490c6e8f0099e3d4",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/30.json"
    },
    {
      "repository": ".",
      "path": "test/rules.test.mjs",
      "sha256": "251d90408c33183645d773e36afd4742fc587ca7b96f728e3e7f1483757b88c0",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/31.json"
    },
    {
      "repository": ".",
      "path": "test/upgrade.test.mjs",
      "sha256": "cddbf764770a5a6376a2a469fad28ba4f86fd0a1cd0364d66e17abd9aeb2351d",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/32.json"
    },
    {
      "repository": ".",
      "path": "test/work-artifacts.test.mjs",
      "sha256": "73013a819a4f3b87b079711f61de61b3230a1b098f39a66154f5f970a2773f2d",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/33.json"
    },
    {
      "repository": ".",
      "path": "test/work-cli.test.mjs",
      "sha256": "f2718d1b17ff11b3bed704eca2c487f012009a674c96ecb3c52c64a26cfbed43",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/34.json"
    },
    {
      "repository": ".",
      "path": "test/work-history.test.mjs",
      "sha256": "623e002a7ef8021bf820fe52ac3f2614184837134a66ceb4180973cdafaa4e02",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/35.json"
    },
    {
      "repository": ".",
      "path": "scripts/lint.mjs",
      "sha256": "4090ae522f6dbf34b9e026bfc5164e250aa0ef7cd99f6cdd506ef8751dafdee2",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/36.json"
    },
    {
      "repository": ".",
      "path": "scripts/package-smoke.mjs",
      "sha256": "04982e4b125b4c814fd0352842274dfd2ee530689dbb4b5def9b5c4784efa2ca",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/37.json"
    },
    {
      "repository": ".",
      "path": "resources/baselines/0.1.0.json",
      "sha256": "f6c74f5ccbb14a5879f479f10e96e0dc260189b21e8366b0e9f4f4c80db3f27c",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/38.json"
    },
    {
      "repository": ".",
      "path": "resources/baselines/0.2.0.json",
      "sha256": "d2d2b406e9c31b5279de97990010f5f1df7006b4ae575c9f76f558495112b7ce",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/39.json"
    },
    {
      "repository": ".",
      "path": "resources/baselines/0.2.1.json",
      "sha256": "988d3bff4d2193f465b13be698e175a56115dd8f1def704a7f5d14484ae82143",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/40.json"
    },
    {
      "repository": ".",
      "path": "resources/baselines/0.2.2.json",
      "sha256": "612e55717f0b1a4c4aae0152967adc91da5d46c76c1bff22a45002b39146cdf9",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/41.json"
    },
    {
      "repository": ".",
      "path": "resources/entry.md",
      "sha256": "df9ce1321aef151dcfa793f844ed9489f0b4b197346796f77a07abe66f99a166",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/42.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/delivery.md",
      "sha256": "4e9a214d110c2497f5763f9fd8eacb07a836a0879c91c10f431636f0814c9520",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/43.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/design.md",
      "sha256": "f9df8d610c96997a3cd05decd07da880b559f943813b8a1b8d55159b17701835",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/44.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/implementation.md",
      "sha256": "e58dd895d221df3593ebedaa31792dea04ccc9a1dae10fae3847ca84646b01e7",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/45.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/activities/requirements.md",
      "sha256": "8291f133248d3a6c9ee15e42998527d860b675b0e508e702617bcc32cde6e7a9",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/46.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/core.md",
      "sha256": "f6f0f51c698f7251d40940d2d5d23b301961a5874e47fca0592ad7f05bec7667",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/47.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/index.md",
      "sha256": "840966bde678572968ab70586850d14894fdca4b3071864ccd0d1fa01b5e63de",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/48.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/quality/documents.md",
      "sha256": "1037963697399c1ecdfd9e3dfd8e1d52cb70f3d154f2688978853820a13a6d8a",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/49.json"
    },
    {
      "repository": ".",
      "path": "resources/rules/quality/verification.md",
      "sha256": "d61f9b8b9bc2e870b500c099de399af8276f787786fa44d9f5449c0c9120d336",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/50.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/change-design.md",
      "sha256": "485d554a6c679b650b40b5333077c2169c810ac723d3c2463c870271847c0b35",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/51.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/change-requirements.md",
      "sha256": "9ee607ac492c9ea7f2ddd79d618767552c8fa55600a729b7cfd832f0207c9997",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/52.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/module-design.md",
      "sha256": "95424fcc05bd2cbfd56f8f3d93b11aeacb1245debec3bcd3cdd34169dcdc5a61",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/53.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/module-requirements.md",
      "sha256": "c3a853a0eb0aadc7e4a2e115f4e30d37355b2ad62b71c4f08790b68b7f156cd4",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/54.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/product-design.md",
      "sha256": "44b351583437442114c87fef75df487fe15fb5649697a8634258aad45d480a20",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/55.json"
    },
    {
      "repository": ".",
      "path": "resources/templates/product-requirements.md",
      "sha256": "24e68131c2aa4a259e7ba2b65dc3752dae969431eb46467f69482cdf896c0f07",
      "snapshot": ".tiller/work/20261015-isolated-delivery/reviews/request-acceptance-isolated-delivery-030/56.json"
    }
  ],
  "upstream": [
    {
      "requestId": "design-isolated-delivery",
      "fingerprint": "80c6335626735616823a33819defadb21140f473b48cc0c7983d7e521de5f8a6",
      "decisionId": "design-approved-20261015"
    }
  ],
  "exception": null
}
```
