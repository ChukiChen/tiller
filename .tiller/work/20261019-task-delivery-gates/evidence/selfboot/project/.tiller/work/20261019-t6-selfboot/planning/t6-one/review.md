# 实施规划 t6-one

本规划登记不表示已确认；任务规格缺口仍须补足，候选保留不代表当前证据有效。

## 修订与保留核对

```json
{
  "reason": "细化已确认T6验证顺序，不新增业务要求或用户批准节点，不复制历史任务状态。",
  "changes": {
    "added": [
      "foundation",
      "downstream"
    ],
    "changed": [],
    "retainedCandidates": [],
    "removed": [],
    "removedRequirements": []
  }
}
```

## 任务、交付与待细化事项

```json
{
  "schemaVersion": 1,
  "ownerWorkId": "20261019-t6-selfboot",
  "revision": "t6-one",
  "scope": {
    "repositories": [
      "."
    ],
    "targets": [
      "T6 安装与顺序自举"
    ]
  },
  "requirements": [
    {
      "id": "GATE-03",
      "source": {
        "repository": ".",
        "path": "authority/requirements.md"
      }
    },
    {
      "id": "GATE-06",
      "source": {
        "repository": ".",
        "path": "authority/requirements.md"
      }
    },
    {
      "id": "GATE-08",
      "source": {
        "repository": ".",
        "path": "authority/requirements.md"
      }
    }
  ],
  "basis": {
    "requirements": {
      "workId": "20261019-t6-selfboot",
      "requestId": "requirements",
      "decisionId": "existing-t6-requirements"
    },
    "design": {
      "workId": "20261019-t6-selfboot",
      "requestId": "design",
      "decisionId": "existing-t6-design"
    }
  },
  "tasks": [
    {
      "id": "foundation",
      "title": "安装后入口探针",
      "outcome": "先观察实际失败，再修正并运行通过；只在证据有效后验证完成。",
      "scope": {
        "repositories": [
          "."
        ],
        "targets": [
          "T6 安装与顺序自举"
        ]
      },
      "modules": [],
      "relatedWorks": [],
      "requirementIds": [
        "GATE-03",
        "GATE-06",
        "GATE-08"
      ],
      "basis": {
        "requirements": {
          "workId": "20261019-t6-selfboot",
          "requestId": "requirements",
          "decisionId": "existing-t6-requirements"
        },
        "design": {
          "workId": "20261019-t6-selfboot",
          "requestId": "design",
          "decisionId": "existing-t6-design"
        }
      },
      "specifications": {
        "requirements": [
          {
            "repository": ".",
            "path": "authority/requirements.md"
          }
        ],
        "design": [
          {
            "repository": ".",
            "path": "authority/design.md"
          }
        ],
        "standards": [
          {
            "repository": ".",
            "path": "authority/selfboot-scope.md"
          }
        ]
      },
      "pendingDetails": [],
      "dependencies": [],
      "artifacts": [
        {
          "id": "probe",
          "purpose": "重复执行安装后入口版本检查。",
          "required": true,
          "checks": [
            "probe-exec"
          ],
          "type": "source",
          "files": [
            {
              "repository": ".",
              "path": "probe.cjs"
            }
          ],
          "directories": []
        }
      ],
      "verification": {
        "caseIds": [],
        "requirements": [
          "GATE-03",
          "GATE-06",
          "GATE-08"
        ],
        "modules": [],
        "categories": {
          "unit": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "interface": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "integration": {
            "applicability": "applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "scenario": {
            "applicability": "applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "performance": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "security": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "reliability": {
            "applicability": "applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "compatibility": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "usability": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          }
        },
        "checks": [
          {
            "id": "probe-exec",
            "kind": "execution",
            "suite": "installed-probe",
            "artifactIds": [
              "probe"
            ],
            "inputs": [
              {
                "repository": ".",
                "path": "probe.cjs"
              },
              {
                "repository": ".",
                "path": ".tiller/run.cjs"
              },
              {
                "repository": ".",
                "path": "authority/package.json"
              },
              {
                "repository": ".",
                "path": "candidate.tgz",
                "binary": true,
                "provenance": {
                  "repository": ".",
                  "path": "authority/package.json"
                }
              }
            ],
            "requirements": [
              "GATE-03",
              "GATE-06",
              "GATE-08"
            ],
            "categories": [
              "integration",
              "scenario",
              "reliability"
            ],
            "reason": "实际运行安装包固定入口并断言候选版本，保留失败及修复输出。"
          }
        ],
        "reason": "验证既有T6授权内的安装、顺序及恢复。",
        "scenarioReason": "实际单仓库临时工程，不含业务模块；跨模式产品行为由独立集成证据覆盖。"
      },
      "humanCheckpoints": []
    },
    {
      "id": "downstream",
      "title": "依赖及接续说明",
      "outcome": "前置有效验证后开始，保存继续点，由后继执行者读取持久状态并接续，完成准确说明。",
      "scope": {
        "repositories": [
          "."
        ],
        "targets": [
          "T6 安装与顺序自举"
        ]
      },
      "modules": [],
      "relatedWorks": [],
      "requirementIds": [
        "GATE-03",
        "GATE-06",
        "GATE-08"
      ],
      "basis": {
        "requirements": {
          "workId": "20261019-t6-selfboot",
          "requestId": "requirements",
          "decisionId": "existing-t6-requirements"
        },
        "design": {
          "workId": "20261019-t6-selfboot",
          "requestId": "design",
          "decisionId": "existing-t6-design"
        }
      },
      "specifications": {
        "requirements": [
          {
            "repository": ".",
            "path": "authority/requirements.md"
          }
        ],
        "design": [
          {
            "repository": ".",
            "path": "authority/design.md"
          }
        ],
        "standards": [
          {
            "repository": ".",
            "path": "authority/selfboot-scope.md"
          }
        ]
      },
      "pendingDetails": [],
      "dependencies": [
        {
          "taskId": "foundation",
          "artifacts": [
            "probe"
          ]
        }
      ],
      "artifacts": [
        {
          "id": "notes",
          "purpose": "说明实际依赖拒绝、修复和接续操作。",
          "required": true,
          "checks": [
            "recovery-review"
          ],
          "type": "document",
          "source": {
            "repository": ".",
            "path": "docs/recovery.md"
          }
        }
      ],
      "verification": {
        "caseIds": [],
        "requirements": [
          "GATE-03",
          "GATE-06",
          "GATE-08"
        ],
        "modules": [],
        "categories": {
          "unit": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "interface": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "integration": {
            "applicability": "applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "scenario": {
            "applicability": "applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "performance": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "security": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "reliability": {
            "applicability": "applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "compatibility": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          },
          "usability": {
            "applicability": "not-applicable",
            "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
          }
        },
        "checks": [
          {
            "id": "recovery-review",
            "kind": "manual",
            "artifactIds": [
              "notes"
            ],
            "inputs": [
              {
                "repository": ".",
                "path": "docs/recovery.md"
              },
              {
                "repository": ".",
                "path": "probe.cjs"
              }
            ],
            "requirements": [
              "GATE-03",
              "GATE-06",
              "GATE-08"
            ],
            "categories": [
              "integration",
              "scenario",
              "reliability"
            ],
            "reason": "执行者逐项核对说明与实际失败、拒绝、修复和接续事实。"
          }
        ],
        "reason": "验证既有T6授权内的安装、顺序及恢复。",
        "scenarioReason": "实际单仓库临时工程，不含业务模块；跨模式产品行为由独立集成证据覆盖。"
      },
      "humanCheckpoints": []
    }
  ],
  "delivery": {
    "requiredTasks": [
      "foundation",
      "downstream"
    ],
    "artifacts": [
      {
        "id": "delivered-probe",
        "purpose": "交付已验证探针。",
        "required": true,
        "checks": [
          "combined-review"
        ],
        "type": "reference",
        "taskId": "foundation",
        "artifactId": "probe"
      },
      {
        "id": "delivered-notes",
        "purpose": "交付实际接续说明。",
        "required": true,
        "checks": [
          "combined-review"
        ],
        "type": "reference",
        "taskId": "downstream",
        "artifactId": "notes"
      }
    ],
    "verification": {
      "caseIds": [],
      "requirements": [
        "GATE-03",
        "GATE-06",
        "GATE-08"
      ],
      "modules": [],
      "categories": {
        "unit": {
          "applicability": "not-applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "interface": {
          "applicability": "not-applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "integration": {
          "applicability": "applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "scenario": {
          "applicability": "applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "performance": {
          "applicability": "not-applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "security": {
          "applicability": "not-applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "reliability": {
          "applicability": "applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "compatibility": {
          "applicability": "not-applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        },
        "usability": {
          "applicability": "not-applicable",
          "reason": "本工作只核对已确认T6的安装后入口与依赖、失败恢复及接续顺序；其他类别不作为本样例完成条件。"
        }
      },
      "checks": [
        {
          "id": "combined-review",
          "kind": "manual",
          "artifactIds": [
            "delivered-probe",
            "delivered-notes"
          ],
          "inputs": [
            {
              "repository": ".",
              "path": "probe.cjs"
            },
            {
              "repository": ".",
              "path": "docs/recovery.md"
            },
            {
              "repository": ".",
              "path": ".tiller/run.cjs"
            },
            {
              "repository": ".",
              "path": "authority/package.json"
            },
            {
              "repository": ".",
              "path": "candidate.tgz",
              "binary": true,
              "provenance": {
                "repository": ".",
                "path": "authority/package.json"
              }
            }
          ],
          "requirements": [
            "GATE-03",
            "GATE-06",
            "GATE-08"
          ],
          "categories": [
            "integration",
            "scenario",
            "reliability"
          ],
          "reason": "整体核对两项交付及实际操作顺序；任务通过不能代替此检查。"
        }
      ],
      "reason": "验证既有T6授权内的安装、顺序及恢复。",
      "scenarioReason": "实际单仓库临时工程，不含业务模块；跨模式产品行为由独立集成证据覆盖。"
    },
    "humanCheckpoints": [],
    "openIssues": []
  },
  "changeReason": "细化已确认T6验证顺序，不新增业务要求或用户批准节点，不复制历史任务状态。"
}
```

## 内容依据

```json
{
  "definitionDigest": "6f308a3d816038a1cb052bcbb8e5e9de384120f89564fb040b26cf916ed55b1a",
  "taskDigests": {
    "foundation": "f88d55d56bae8d31ff9fc16e170796f27995dd5d72a9734c0b1a0f9a58c985a7",
    "downstream": "b51f5f6e5d9c317d3796f2c2e3581a05f80f0f7c98d418e5c6707d96b84c4216"
  },
  "specificationFiles": [
    {
      "repository": ".",
      "path": "authority/design.md",
      "sha256": "efb54cdb3b1499815e6af5c12960b1142c3bbc36dffd32486083450099717928"
    },
    {
      "repository": ".",
      "path": "authority/requirements.md",
      "sha256": "5738ea2a287fa888ba6e1e28f7b29c1c5472669b9592edbe10d78c730d5a4be8"
    },
    {
      "repository": ".",
      "path": "authority/selfboot-scope.md",
      "sha256": "64994e4b643ce636cbb2fec34f95b33c4cca4ea45d63a771f65f49ef94f4f687"
    }
  ],
  "confirmationBindings": [
    {
      "reference": {
        "workId": "20261019-t6-selfboot",
        "requestId": "design",
        "decisionId": "existing-t6-design"
      },
      "requestFingerprint": "54e8342d176fe3c44eb423261b4eb315a1ddd21fb50ac69c7282c4ca29473a56",
      "decisionFingerprint": "17e667022203052f136749baea3745cd832f496d53e0e44346c4f11ecb0b71d9"
    },
    {
      "reference": {
        "workId": "20261019-t6-selfboot",
        "requestId": "requirements",
        "decisionId": "existing-t6-requirements"
      },
      "requestFingerprint": "798f1876479541972da764c7e0a28174ba5262ae46258591f9c29f6fff9754da",
      "decisionFingerprint": "471b19169566fd6f32e83723b9f2d4c756d24a5a2749d8c9497f7d123b3d230d"
    }
  ]
}
```
