# 使用

从 [v0.0.0 Release](https://github.com/Bin-Zhang-hhht/DDFlow/releases/tag/v0.0.0) 获取安装包与 `SHA256SUMS`。默认安装两个 Skill 和同版本 CLI（包含 Viewer）：先按下文安装两个 Skill，再完成 [CLI 安装](#安装-cli)。也可将 [README 中的安装提示词](../README.md#1-安装两个-skill-和-cli)复制给 AI 代为操作。两个 Skill 仍可脱离 CLI 独立使用；需要从源码打包时见[架构说明](architecture.md)。

## 安装两个 Skill

准备 `ddflow-skills-0.0.0.tgz`，与随包 `SHA256SUMS` 核对后，在包所在目录运行。版本变化时替换文件名。

```powershell
$skillRoot = Join-Path $env:USERPROFILE '.agents/skills'
# ZCode 将 '.agents/skills' 换成 '.zcode/skills'
foreach ($name in 'ddflow-planner', 'ddflow-executor') {
    if (Test-Path -LiteralPath (Join-Path $skillRoot $name)) {
        throw "Skill 已存在：$name；请先处理已有安装"
    }
}
New-Item -ItemType Directory -Force -Path $skillRoot | Out-Null
tar -xzf .\ddflow-skills-0.0.0.tgz -C $skillRoot
if ($LASTEXITCODE -ne 0) { throw '解压失败，请检查安装目录' }
```

保留两个 Skill 目录的完整内容。Skill 不需要 Node.js 或 CLI；源码入口引用仓库协议，不能直接复制源码 Skill 目录代替安装包。

Codex 未出现入口时重启；ZCode 在“设置 → 技能”刷新。先显式调用 `$ddflow-planner`，检查计划后另行调用 `$ddflow-executor`。完整示例见[电商交易教程](online-retail.md)。

## 规划、执行与继续

在用户指定的仓库外目录开展业务任务，工作流、数据、产物和日志都保存在该目录。向 Planner 提供目标、输入路径、输出要求、验收标准和可用模型，例如：

```text
$ddflow-planner
请在 <工作区绝对路径> 规划任务：<目标>。
输入：<文件或目录>；输出：<交付物>；验收：<可检查的标准>。
可用模型：<宿主实际支持的模型>。原始输入只读，结果写入新位置。
只生成计划，完成后停止。
```

检查生成的 `workflow.md` 和 `nodes/*.md`，确认任务、模型、写入范围及验收要求，再显式执行：

```text
$ddflow-executor
请执行 <工作流目录绝对路径> 中的计划，验收实际产物并记录结果。
```

节点的 `Result` 记录交付和验收证据，`Error` 记录失败原因。节点失败后不会启动新任务；需要重试或改变计划时，先显式调用 Planner 重新规划，再调用 Executor。保留 completed / failed 历史，新尝试使用新节点；存在 running 时先由原执行者处理，不手动改回 pending。完整示例见[电商案例](online-retail.md)。

## 安装 CLI

需要 Node.js 22.13+（22 系列）或 24+ 以及 npm：

```powershell
npm install -g --omit=dev --ignore-scripts .\ddflow-0.0.0.tgz
ddflow --help
ddflow inspect C:\workflows\example --json
ddflow view C:\workflows\example
```

替换工作流路径，npm 全局可执行目录须在 PATH 中。npm 从配置的 registry 或缓存安装运行依赖，包不是离线依赖全集。当前没有公开 npm 包，不使用 `npm install -g ddflow` 查找同名包。

也可通过 `npm install --prefix <工具目录> --omit=dev --ignore-scripts <包路径>` 局部安装，再调用该目录下的 `node_modules/.bin/ddflow`（Windows 为 `ddflow.cmd`）。查看页面、退出码和限制见[下文工具说明](#检查工作流)。

## 宿主差异与已知限制

| 项目 | Codex | ZCode |
|---|---|---|
| 用户级 Skill 目录 | `~/.agents/skills` | `~/.zcode/skills` |
| 手动调用入口 | `$` 或技能菜单 | `$` 或 `/` 技能菜单 |
| 显式调用约束 | 包内配置 `policy.allow_implicit_invocation: false`，强制性尚未专项实测 | 依赖 Skill 描述和正文约束，尚无已核对的等价开关 |
| 实测范围 | 原有完整 Skill 目录发现和部分执行案例已验证；当前双 Skill 包原生发现未重测 | 安装发现和实际执行尚未验证 |

宿主目录及配置依据沿用已核对的 [Codex 说明](https://learn.chatgpt.com/zh-Hans/docs/build-skills)和 [ZCode 说明](https://zcode.z.ai/cn/docs/skill)，不代表本次重新验证。ZCode 不应假定会读取 `openai.yaml`。

当前 Codex 试验使用约定写入范围和主 Harness 验收的软约束，不提供文件系统硬隔离保证。模型请求可原生派发，但实际响应模型身份仍可能未知；思考强度预检与派发未专项验证。安装成功不证明这些执行能力，实际运行仍按[执行协议](../skills/protocol/execution-protocol.md)核验。

## 重装与卸载

先结束执行阶段并关闭 Viewer。重装 Skill 时，核对安装路径，只移除 `ddflow-planner` 和 `ddflow-executor` 两个目录，再解压新包；不删除宿主整个技能目录或用户工作流。新阶段用新会话加载。

全局 CLI 用 `npm uninstall -g --ignore-scripts ddflow` 卸载；局部安装使用原 `--prefix`。卸载 Skill 只移除上述两个目录，再检查宿主入口消失。

## 检查工作流

```powershell
ddflow inspect C:\workflows\example
ddflow inspect C:\workflows\example --json
```

省略目录时检查当前目录。检查内容包括 YAML、字段类型、节点 ID、标准正文、依赖存在性和依赖环。退出码：`0` 结构合法（可含 Warning），`1` 结构非法，`2` 参数或读取错误。

JSON 返回诊断、工作流、节点、依赖边和 ready / blocked 节点列表，结构见 [Schema](../skills/protocol/workflow-schema.md)。存在 Error 时 ready / blocked 列表均为空，已解析出的部分节点不能用于执行。

`ready` 仅表示 pending 节点的直接依赖已完成，不是执行许可；出现节点失败时仍须按[执行协议](../skills/protocol/execution-protocol.md)停止启动新节点。`blocked` 表示存在失败的传递前置，仅派生展示。

结构合法不代表输入存在、模型可用、Skill 已加载或业务质量合格。模型及思考强度的请求与实际记录分别展示，缺少实际证据时不从请求值补齐。

## 查看工作流

调用 Planner 或 Executor 后，目标目录明确且 workflow.md 与 nodes/ 已存在时，Skill 默认尝试启动已安装的 Viewer；新计划先写好文档。CLI 未安装则静默跳过，不安装、不询问，也不阻塞任务。用户明确要求不启动时跳过。

主 Harness 优先复用当前会话中已确认属于同一目录且仍可访问的 Viewer，否则通过宿主可保留的原生终端会话尝试启动一次。成功后返回实际输出并确认可访问的本机地址；启动失败或未能确认时简短说明并继续。宿主无法保留进程时跳过，不另建后台服务。报告后可保留 Viewer 供查看，在对应终端按 Ctrl+C 或通过宿主会话停止；Viewer 不执行节点，也不影响 Planner / Executor 的显式调用边界。

这项行为由 Skill 指令交给宿主执行，当前自动启动与复用流程尚未完成宿主实测。也可单独请 AI 启动 Viewer，或手动运行：

```powershell
ddflow view C:\workflows\example
# 可选：指定固定端口
ddflow view C:\workflows\example --port 43821
```

打开终端打印的本地地址，保持进程运行，按 Ctrl+C 停止。默认选择空闲端口；固定端口被占用时直接报错。

点击节点查看正文和元数据，点击空白画布或返回按钮查看工作流目标。图可缩放和平移，不能编辑；节点支持 Tab 聚焦和 Enter 选择。正文支持 Markdown，图片和链接只显示说明或文字，不加载产物。

| 情况 | 页面行为 |
|---|---|
| 文档合法更新 | 自动更新图、详情和诊断 |
| 文档非法或读取失败 | 显示错误，保留最后合法视图；首次读取即非法则显示空视图 |
| 服务断连 | 保留内容，提示数据可能过期；同址恢复后自动重连 |
| 同步暂时失败 | 保留内容，连接可用时重试 |
| 文件监听报错 | 保留视图并显示诊断，需要重启 Viewer |

连接状态与文档状态独立。最后合法读取时间不是业务完成时间。刷新页面或重启服务会丢失各自内存中的快照。

## 范围与限制

只读取 `workflow.md` 和直接位于 `nodes/` 的 Markdown 文件，不读取业务产物。每文档上限 1 MiB、整图 16 MiB、最多 1000 个节点；拒绝无效 UTF-8、非法 YAML 和解析后越出工作流目录的路径。

读取不保证跨文件原子快照，也不提供文件权限隔离。Viewer 仅在本机 loopback 提供只读接口，不应代理到公共网络。

Viewer 已有 Windows / Edge 限定验证；Markdown 阅读视图通过组件检查但尚未重做浏览器视觉验收。其他系统、浏览器、网络文件系统和最大规模性能尚未验证。
