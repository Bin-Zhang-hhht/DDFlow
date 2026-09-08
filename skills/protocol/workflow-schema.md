# ddflow Workflow Schema

> 协议标识：`ddflow/v1`
> 状态：首次 ddflow 命名空间的协议草案；不是旧执行器已经兼容的声明。

## 1. 基础约定

少量稳定 YAML 只保存机器必须理解的信息，任务语义保留为 raw Markdown。工作流唯一持久状态在这些文档中，不建设第二份 JSON / 数据库状态。

最小结构：

```text
workflow-root/
├── workflow.md
└── nodes/
    ├── 01-profile.md
    ├── 02-rules.md
    └── 03-normalize.md
```

扫描 `nodes/*.md` 得到节点集合；不递归扫描产物目录，不维护第二份 Registry。节点 ID 必须等于文件名去除 `.md` 后的 stem。ID 是安全的单一文件名段：字母 / 数字开头，后接字母、数字、连字符或下划线；推荐使用小写短名称。禁止路径分隔符、`.` / `..`、空白及路径穿越。

编号仅为可读性，不代表执行顺序；Re-plan 不批量重编号。

## 2. workflow.md

```markdown
---
schema: ddflow/v1
name: clean-catalog
---

# Goal

统一指定目录中的资料条目，交付可追溯的标准表和异常说明。

# Description

先明确清洗规则，再使用合适模型和工具执行。

# Execution Notes

原始输入只读。具体模型与宿主能力在运行前核对；未知时不宣称混合模型执行已就绪。
```

| 字段 | 类型 | 约束 |
|---|---|---|
| `schema` | string | 必填，当前固定为 `ddflow/v1` |
| `name` | string | 必填，非空 |

正文 `Goal` 必须存在且非空；`Description / Execution Notes` 可选。业务目标、工作区根目录、全局约束、质量门槛、模型分工依据与预算偏好写正文；没有独立的预算 / Provider / 模型角色 DSL。

不存全局执行状态、节点表、依赖图、Run ID、审批模式、队列、锁或 heartbeat。模式切换由用户显式 Skill 调用构成，不在 YAML 新增 `mode`。

## 3. Node Document

```markdown
---
id: 03-normalize
title: 依据固定规则统一表格格式
depends_on:
  - 02-rules
execution:
  status: pending
---

# Goal

按已确认规则生成标准化候选表，并保留来源记录。

# Prompt

读取上游规则，用现有表格工具完成批量转换。不推断缺失的业务含义；将规则允许的歧义写入待复核表。

# Inputs

上游规则、输入文件清单和工作区原始数据。

# Outputs

新的标准化候选表、来源映射和待复核表；不覆盖原始数据。

# Completion Criteria

运行既定校验，证明输出格式、记录覆盖和来源映射满足规则；所有未处理记录均有原因。

# Result

# Error
```

这是不指定模型的合法最小格式，表示接受宿主默认模型。示例未绑定真实输入。

## 4. Node YAML 字段

| 字段 | 类型 | 必填 | 所有权与语义 |
|---|---|---|---|
| `id` | string | 是 | Planner；稳定唯一 ID，等于 filename stem |
| `title` | string | 是 | Planner；非空标题 |
| `depends_on` | string[] | 是 | Planner；唯一机器依赖来源，根节点使用 `[]` |
| `model` | string | 否 | Planner；已指定则必须遵守的宿主模型引用 |
| `reasoning_effort` | string | 否 | Planner；已指定则必须遵守的模型思考强度设置 |
| `agent.recommended` | string | 否 | Planner；已知的预定义 Agent 推荐名 |
| `agent.profile` | string | 否 | Planner；已知配置提示，不定义通用 Profile Registry |
| `skills` | string[] | 否 | Planner；本节点必须可获取并加载的 Skill，省略等同 `[]` |
| `execution.status` | enum | 是 | Executor；pending / running / completed / failed |
| `execution.started_at` | string | 否 | Executor；真实开始时间 |
| `execution.updated_at` | string | 否 | Executor；最近一次真实事实更新 |
| `execution.finished_at` | string | 否 | Executor；真实结束时间 |
| `execution.model_used` | string | 否 | Executor；宿主实际报告的 worker 模型，未知则省略 |
| `execution.reasoning_effort_used` | string | 否 | Executor；宿主有证据确认生效的 worker 思考强度设置，未知则省略 |

已有 `agent` 必须是 mapping，`execution` 必须是 mapping，数组元素不得为空或重复。模型和 Skill 字符串不可留占位符来假装已经配置；具体供应商语法不属于 Core。

时间使用带时区的 RFC 3339 文本，建议 YAML 中加引号。不要在规划时伪造时间或模型事实。任务尚未启动时只初始化 `execution.status: pending`。

`execution.model_used` 只描述业务 worker，不自动覆盖主协调者、规划或独立复核调用。相应模型证据及其适用范围写入 Result；不得仅从 `model` 推导 `model_used`。

### 思考强度

`reasoning_effort` 与 `execution.reasoning_effort_used` 均为可选非空字符串。Core 不维护固定枚举、模型能力表或跨宿主强度映射；例如 `medium` 仅在目标宿主及模型支持时才能用于执行。不同模型的同名强度不表示相同计算量。

```yaml
model: gpt-5.6-luna
reasoning_effort: medium
execution:
  status: pending
```

以上演示请求配置，不证明目标环境支持。Planner 在宿主支持且取值可核实时应明确填写强度；省略表示接受已披露的宿主默认值，不自动补成 medium。允许只指定强度而省略 model，此时必须核对宿主默认模型是否支持该强度。

显式强度与 model 同属 Contract，不得忽略、映射成另一强度或在重试时自动提高。值不受支持、无法传入或已知被覆盖时，按执行协议停止。只缺少生效证据时披露未知，不把已接受可观察性限制的低风险任务自动判为失败。

`execution.reasoning_effort_used` 表示宿主确认的、覆盖解析后的 worker 生效设置，不是内部思考量或 reasoning tokens。主 Harness 在 Result 说明证据来源；请求参数、父会话设置或 worker 自述不足以直接填入。即使请求字段省略，仍可记录有证据的默认生效值；实际模型未知时也不由该设置反推 model_used。未知时省略，不用请求值补齐。

## 5. model、agent、skills 的区别

`model` 设置后是任务约束；不可用或被覆盖时必须停止启动，不能静默继承默认模型。缺省 model 仍允许使用已披露的宿主默认模型，不表示自动最低价选择。

`agent.recommended / agent.profile` 是提示。退化为 Generic Agent 只有在所需模型、Skill、工具和权限仍得到满足时才成立；必须在预检 / 结果说明中披露实际执行方式。

`skills` 是知识 / 方法依赖，不是新的执行节点，也不是安全授权。名称必须来自用户指定或本地真实目录；不能为满足字段而创建虚构名称。缺失时停止预检或交由用户显式 Re-plan 调整；不自动联网安装。

Prompt 可引用已有的规则文档、脚本或术语表而不配置 Skill。不要把任何一段参考资料都包装成 Skill。

## 6. 固定 Markdown Section

节点必须各出现一次以下 H1 Section：

```text
Goal
Prompt
Inputs
Outputs
Completion Criteria
Result
Error
```

Goal、Prompt、Completion Criteria 必须非空。其他四个可为空，便于创建 pending 文档；执行协议对成功 / 失败证据有更严格要求。小节使用 H2 或更低层级。

内容保留 raw Markdown，包括表格、链接和 fenced code block。解析 H1 时必须识别代码围栏，不能把代码示例中的 `# Goal` 当正文 Section。重复标准 H1 无法明确解释，应报 Error。

额外 Section 允许存在，但不会创造新的执行能力。Node Prompt 只写业务任务，不重复整套状态协议；工具要求和写入范围可用普通小节表达，不增加并行的任务定义层。

## 7. Inputs / Outputs 与依赖

`depends_on` 是唯一机器依赖来源。Inputs / Outputs 是人和 Agent 理解的路径与语义 Contract；Parser 不从文件名或链接自动增加边。

如果 B 实际需要 A 的产物，Planner 必须使 A 成为 B 的前置（直接或通过真实链路）。为确保 worker 能找到资料，可在 Inputs 明确上游节点 ID 和对应文件路径。依赖不应仅为“相关”而添加，也不能漏掉实际前置。

业务路径以 workflow 的 Execution Notes 约定工作区为基准。Parser / Viewer 不把任意产物路径暴露为不限范围的文件读取接口。

## 8. 写入所有权

Planner 创建节点并初始化 pending，之后拥有非 execution 字段及 Goal / Prompt / Inputs / Outputs / Completion Criteria。

Executor 拥有 execution 字段及 Result / Error。主 Harness 默认是单一写入者，worker 只返回结果与业务文件。可靠 handoff 可以委托单一写入权，但不能同时写同一节点。

未知字段与额外 Section 保留原文；更新 execution 时不得格式化重写整个 Contract 导致信息丢失。

## 9. 状态与派生数据

合法持久状态：pending、running、completed、failed。没有 skipped。合法业务转换为 pending → running → completed / failed。

```text
ready(node) = node.status == pending
              AND all direct dependencies.status == completed

blocked(node) = node.status == pending
                AND any transitive dependency.status == failed
```

blocked 只用于展示，不写文件。pending 等待 pending / running 不是 blocked。ready 不代表可以违反预检、用户阶段边界、single-writer 或 Global Fail-Fast 而启动。

无关分支因 Global Fail-Fast 没有启动时，持久状态与显示状态仍是 pending。Viewer 不能仅从“四种状态”推断当前是否有一个活跃 Executor；不提供伪造的全局运行灯。

## 10. Validation

### Error：当前结构不可作为执行依据

缺少 workflow；不支持 schema；name 为空；YAML 无法安全解析 / 重复键 / 已知字段类型错误；节点必填字段缺失；重复 / 非法 ID；filename 不一致；不存在 / 自依赖 / 重复依赖；DAG 有环；非法状态；缺少或重复标准 Section；Goal / Prompt / Completion Criteria 为空。

未知 YAML 字段本身不是 Error。安全解析禁止执行 YAML 自定义对象构造；资源使用应有合理大小限制，具体限值由实现与测试决定。

### Warning：仍可解释，但需要提示

completed 的 Result 为空；failed 的 Error 为空；running 无 started_at；终态无 finished_at；Inputs / Outputs 为空；存在未知 YAML 字段；执行事实不完整，例如实际模型未知。

解析级 Warning 不自动阻止所有任务，但不豁免执行协议要求。例如“实际模型未知”可以被读取，不能据此填写实际模型事实。

节点已非 pending、显式指定 reasoning_effort 而没有 reasoning_effort_used 时，产生 `unknown-reasoning-effort` Warning。节点没有请求强度时不新增这项 Warning。两字段的取值是否受宿主支持、生效设置是否符合契约属于 Harness 核验；inspect 保留不一致的请求与事实，不静默修正或用结构合法证明执行正确。

### 不属于 Schema Validator 的预检

模型是否可用、Skill 是否安装、文件权限是否真实生效、用户是否完成必要确认、输出语义是否正确，都不是仅靠静态文档能证明的事实，需由 Harness 预检 / 业务验收。

## 11. 只读结果结构

inspect 输出包含：valid、diagnostics、workflow、nodes、edges、ready_node_ids、blocked_node_ids。Viewer 使用相同节点信息，增加由服务维护的文档诊断外壳。

节点 Read Model 应同时保留 requestedModel 与 execution.modelUsed，不能用一个 `model` 标签掩盖两者差异。没有实际证据时 modelUsed 缺省。

思考强度对应 requestedReasoningEffort 与 execution.reasoningEffortUsed；未知或未指定的字段缺省，不从请求推导事实。原始 YAML 字段仍保留在 metadata。

Snapshot / ready / blocked 仅存在于内存或本次命令输出，可以随时从 Markdown 重建；不写 state.json。CLI 不根据正文自动执行命令。
