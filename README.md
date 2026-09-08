# ddflow

![ddflow：Planner 规划任务，用户确认后由 Executor 编排多种模型执行并验收产物](docs/readme-banner.png)

**把长任务拆成可检查的计划，用明确的模型分工执行，以实际产物验收。**

Document-Driven Flow 是一套依托 Agent 宿主运行的工作流 Skill，优先面向多来源数据清洗与整理。计划、依赖、执行结果都保存在 Markdown 中，便于检查和交接。

[开始使用](#快速开始) · [电商案例](docs/online-retail.md) · [产品](docs/product.md) · [架构](docs/architecture.md) · [使用手册](docs/usage.md)

## 适合什么任务

当任务需要多个步骤、不同模型分工，以及明确的交付标准时，可以使用 ddflow。例如：把多份来源不同的交易表统一字段和格式，复核异常，再交付标准表、来源映射和质量报告。

- **先看计划，再执行**：Planner 写清目标、输入、输出、依赖和验收标准，用户检查后另行启动 Executor。
- **明确模型与任务的对应关系**：按任务需要安排模型和 Skill，由宿主原生派发；指定模型不静默替换。
- **保留可检查的执行事实**：产物验收通过才标记完成，结果和失败原因写回节点文档。
- **按需查看进展**：可选 CLI 检查工作流，Viewer 展示依赖图、节点正文和诊断。

极短任务或尚无验收标准的开放探索通常不需要拆成工作流。具体定位和边界见[产品文档](docs/product.md)。

## 如何工作

```mermaid
flowchart LR
    A[目标、输入与验收要求] --> B[显式调用 Planner]
    B --> C[检查 Markdown 计划]
    C --> D[另行显式调用 Executor]
    D --> E[宿主分派任务并验收产物]
    E --> F[记录结果与证据]
```

两个 Skill 配套安装，由用户分别调用。Planner 完成规划后停止；Executor 按静态依赖图推进任务。节点失败后停止启动新任务，已启动任务真实收敛；继续需要显式重新规划，保留失败历史。

工作流本身只需要这些文件，业务数据和产物放在约定的工作区中：

```text
workflow/
├── workflow.md       # 总体目标与全局约束
└── nodes/
    ├── 01-profile.md # 每个节点记录任务、依赖、状态和结果
    ├── 02-clean.md
    └── 03-review.md
```

节点编号用于阅读，执行顺序由 `depends_on` 决定。实际业务执行依赖宿主的 Agent、模型和工具能力。

## 快速开始

### 1. 安装两个 Skill

当前尚未正式发布，使用[本地构建的分发包](docs/architecture.md#构建与打包)。取得 `ddflow-skills-<版本>.tgz` 后，核对随包校验值，按[安装步骤](docs/usage.md#安装两个-skill)解压到宿主技能目录，保留两个完整 Skill 目录。

Skill 包自带三份运行协议，无需源码、Node.js 或 CLI。目标宿主为 Codex 和 ZCode；Codex 已有部分发现与执行验证，ZCode 原生安装发现和执行尚未验证。详细配置与限制见[宿主兼容说明](docs/usage.md#宿主差异与已知限制)。

### 2. 生成计划

在宿主中打开一个仓库外的业务工作区，将下面占位符替换为实际路径和可用模型，然后显式调用 Planner：

```text
$ddflow-planner
请在 <工作区绝对路径> 规划一次交易数据整理任务。
输入：<原始数据目录>，所有原始文件只读。
交付：标准交易表、来源映射、异常清单和质量报告。
验收：每条输入记录都有去向，合并或排除有依据，金额汇总可核对。
可用模型：<宿主实际支持的模型>。
请先澄清缺少的业务规则，只生成计划，完成后停止。
```

预期得到 `workflow.md` 和 `nodes/*.md`。检查任务范围、模型安排、产物路径和验收标准。

### 3. 执行并检查结果

确认计划后，另行发送：

```text
$ddflow-executor
请执行 <工作流目录绝对路径> 中的计划，验收实际产物并记录结果。
```

查看节点的 `Result` 获取产物位置和验收证据；失败原因记录在 `Error`。需要完整数据来源和逐步提示词时，使用[电商交易案例](docs/online-retail.md)。该案例是教程，业务执行尚未验证。

### 可选：安装 CLI 和 Viewer

CLI 需要 Node.js 22.13+（22 系列）或 24+。在本地 CLI 包所在目录运行，版本和工作流路径按实际替换：

```powershell
npm install -g --omit=dev --ignore-scripts .\ddflow-0.1.0-private.1.tgz
ddflow inspect C:\workflows\example --json
ddflow view C:\workflows\example
```

Viewer 地址由终端输出，按 Ctrl+C 停止服务。两个命令都只读；结构检查不能代替业务验收。局部安装、更新卸载、退出码和 Viewer 行为见[使用手册](docs/usage.md)。

## 文档与维护

| 文档 | 内容 |
|---|---|
| [产品](docs/product.md) | 定位、用户流程、能力与边界 |
| [架构](docs/architecture.md) | 组件职责、源码结构、构建、打包与检查 |
| [使用](docs/usage.md) | 安装卸载、宿主兼容、执行与只读工具 |
| [电商案例](docs/online-retail.md) | 数据来源、规划与执行提示词、预期产物 |

维护协议时阅读 `skills/protocol/` 下的 [Schema](skills/protocol/workflow-schema.md)、[执行协议](skills/protocol/execution-protocol.md)和[规划指南](skills/protocol/planning-guide.md)。打包时，它们复制到每个 Skill 的 `references/`，不需要维护两套副本。参与修改前阅读[仓库规则](AGENTS.md)。

## 许可证

代码与文档采用 [MIT 许可证](LICENSE)。业务数据和专用成果不属于许可证授权范围，也不随软件分发。
