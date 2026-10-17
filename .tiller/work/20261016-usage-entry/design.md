# 使用入口与命令定位设计

工程共享 .tiller/usage.md 和 .tiller/run.cjs，使用 node .tiller/run.cjs 调用；指引由 AGENTS.md 和工程索引链接。机器安装路径只记入 .tiller/local/runtime.json。CLI init、upgrade 应用及显式 runtime bind 记录当前实际 CLI，runtime status 只读核对。

启动器优先查工程 .tiller/local/cli/node_modules/tiller，再查工程 node_modules/tiller 及本机登记的 CLI。Git worktree 根据 Git 注册清单核对身份并查同仓库主工程安装；不从任意父目录、不执行字符串命令、不隐式联网安装。透传参数、输入输出和退出码，保留调用者当前目录及显式目标参数。缺少或无效安装时报告恢复命令。

版本为0.3.2；旧版本仍按原文件集合解析，显式升级新增受管入口，已有不同内容作为冲突保留。复制工程不得把旧本机路径当共享事实。产品说明不包含特定测试背景。single 的人工安装说明先核对再移到 local 备份，正式通用入口由升级生成；不创建业务工作。

Git 可在检出时转换文本换行。受管区段与分发的明确文本资源（规则、使用指引、启动器）在内容及摘要核对时接受 LF/CRLF 等价，保留实际文件字节；正文变化仍视为冲突。该等价不适用于工作产物、确认来源或其他证据摘要。

验证新初始化、旧升级及冲突、路径含空格、shell元字符参数、过期登记、无CLI提示、Git worktree定位和可执行包。此文为按明确实现指令所作技术细化，不记录为用户逐字批准。
