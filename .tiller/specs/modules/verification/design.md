# 验证与反馈设计

## 1. 用例文件

模块文件：

```json
{"schemaVersion":1,"module":"workflow","kind":"behavior","cases":[{
  "id":"CASE-050","title":"...","requirements":[".tiller/specs/..."],
  "modules":["workflow"],"test_ref":"test/example.test.mjs::name",
  "source":["src/flow.ts"],"criteria":["20261022-task#AC-1"]
}]}
```

场景文件使用 `schemaVersion` 与 `scenarios` 数组；每条场景必须有 `modules` 和具名 `test_ref`。读取器缓存测试文件内容，按文件实际内容确认具名测试存在。

## 2. 编号与写入

`case add` 在工程锁内遍历 `cases/`，取最大 `CASE-NNN` 加一。编号跨模块和场景全局唯一，不复用。写入前校验任务存在且 AC 属于该任务，模块在 specs 中存在，类型合法，`test_ref` 为 `文件::测试名`，来源路径非空。场景模块取重复 `--module`。

## 3. 回归提示

按模块统计行为、接口、性能和安全用例数。比较本次 Git 变更与模块 specs、模块用例文件、用例源码和测试路径；命中时提示该模块用例数及经过它的场景。未被任何场景覆盖的模块只提示，不阻塞。

## 4. 检查算法

对每条 AC：

1. 读取最新验证；
2. 按 `test_ref` 找匹配用例；
3. 校验结果是 passed、代码树等于当前树、测试文件仍存在；
4. 校验用例 `criteria` 包含 `<task>#<AC>`，除非用例相对任务基线新增或修改；
5. 把覆盖状态写入结果和 task 自检。

结构错误、缺失测试和错配是阻塞项；历史空 criteria、无 Git、未覆盖场景是提示。

## 5. 边界

该模块不生成或保存原始输出、自举工程、安装包和全文文件快照；`verify --run` 的子进程输出只作即时反馈。需要审计时查看 task.md 的命令记录并从 Git/重新执行取得事实。
