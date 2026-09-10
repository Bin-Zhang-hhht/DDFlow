---
name: ddflow-planner
license: MIT
metadata:
  version: 0.0.1
description: Plan or revise a document-driven workflow only when the user explicitly invokes ddflow-planner or explicitly requests its planning phase. Prepare a minimal, verifiable DAG, bounded worker contracts and reusable rules, scripts or validators without processing business data. Stop after planning; never start execution automatically.
---

# ddflow Planner

把用户的长期任务转为可审核、可验收的文档计划。

## 显式入口与职责

只有用户明确调用本 Skill，或明确要求以本 Skill 进入规划 / Re-plan 阶段时才使用。
普通业务任务、发现工作流文件或上一个 Skill 的建议，不等于用户已授权切换阶段。

你负责 Contract 和执行准备材料。完成后报告并停止，不自动调用 `ddflow-executor`。
可以读取工作区、做已授权的只读检查，并在用户指定的业务工作区准备规则、执行脚本和固定校验器；按[规划阶段的执行准备](../protocol/planning-guide.md#规划阶段的执行准备)记录来源、用途与验证范围。不要处理真实业务数据、运行节点、试跑所准备的业务程序或安装依赖。
规划内部子 Agent 也必须遵守相同边界。

## 按需读取参考

开始写文档前读取 [workflow-schema.md](../protocol/workflow-schema.md)。
首次规划或评估任务分工时读取 [planning-guide.md](../protocol/planning-guide.md)。
Re-plan 或涉及失败 / 交接时读取 [execution-protocol.md](../protocol/execution-protocol.md)。

打包时参考资料会放入本 Skill 的 references；安装后不依赖源码仓库。
规范冲突时停止并报告，不自行创造第三种协议。

## 规划步骤

1. 确认目标工作流目录，读取已有 workflow.md、nodes/*.md 和必要工作区资料。
2. 记录交付物、质量要求、外部输入、写入范围、数据访问边界及已知模型 / 工具。
3. 已知信息不重复询问。缺少实际模型或数据但仍可规划结构时，明确标为待绑定，不冒充可执行计划。
4. 先判断是否一个现成工具 / 脚本已经足够；不要为简单任务强行生成多节点流程。
5. 按独立验收、模型能力差异、稳定产物、风险边界与安全并行拆最小充分 DAG。
6. 提前解决已知业务决策，复用或准备必要规则、脚本与固定校验器；按[Contract 编写示例](../protocol/planning-guide.md#contract-编写示例)写清 Goal、Prompt、Inputs、Outputs、Completion Criteria，绑定材料路径、调用方式、执行前提与验收证据，初始化空 Result / Error。
7. 校验文档与依赖，按下方只读 Viewer 流程检查 CLI、启动或复用服务并尝试打开页面，便于用户检查计划。
8. 报告模型 / 子 Agent 安排、准备材料及实际检查范围、未知项、执行前提和实际 Viewer 地址，然后停止。

## 默认只读 Viewer

完成计划写入与校验后、最终报告前，按[只读 Viewer 规则](../protocol/execution-protocol.md#只读-viewer)实际检查 CLI，启动或复用 `ddflow view "<工作流目录绝对路径>"`，确认地址后用宿主原生浏览器打开能力展示页面；不要只建议用户自行运行命令。已有工作流可提前复用 Viewer，收尾确认仍可访问即可，不重复开页。
CLI 未安装时静默跳过，不安装、不询问、不阻塞规划；用户要求不启动时跳过。无法自动开页时返回可点击的实际地址。Viewer 只展示文档，不启动 Executor 或业务节点。

## 模型与上下文

规划优先使用擅长规则设计和复杂推理的较强模型，尽量让执行者无需重新推导已确定的决策。当前 Planner 模型由用户或宿主原生配置选择；提示词不能切换当前模型，不自动改设置或把规划模型写成 worker 的执行事实。用户已指定模型时遵守其安排，能力或配置未知时如实说明。

按任务的不确定性、错误后果、可验证性、上下文需求和工具能力分配模型。
规则设计与复杂歧义可用更有能力的模型；确定性批处理优先现有程序；有限语义判断按任务能力选择模型。
这只是分配方法，仍须按任务要求验收实际产物。

只把用户指定或可核实的原生模型引用写进 `model`。填写后就是不可静默替换的 Contract。
无法确定真实引用时省略该字段，在正文说明待绑定；不能填虚构的 cheap / strong 模型 ID。
省略 model 表示接受已披露的所选子 Agent 配置或宿主默认，不等于系统已完成多模型路由。

宿主支持且取值可核实时，主动填写 `reasoning_effort`；显式值与 model 同为绑定，省略则接受已披露的默认强度。只指定强度时也核对默认模型，不编造枚举或跨模型映射。使用新字段需配套支持它的 Executor；具体证据与兼容规则见 Schema。

预定义 Agent 只能引用真实存在的名字。`agent.recommended / agent.profile` 是提示，不豁免模型要求。
ZCode 不支持在派发时设置子 Agent 模型和思考强度：按[ZCode 预定义子 Agent](../protocol/planning-guide.md#zcode-预定义子-agent)让用户手动配置，再引用其真实名称；不填写无法落实的调用参数。
`skills` 只列真正需要且可核实的 Skill。不要为任务发明 Skill，也不自动安装第三方内容。

主协调者不承担业务内容复核，只核对交付与验收证据；按[验收分工](../protocol/planning-guide.md#验收分工)把确定性检查交程序、语义复核交既定节点。长产物用文件交接，只提供相关约束、路径和简短摘要。
同质小动作可以批量处理；不要一条记录一个 Agent，也不要把整个聊天和大表逐节点重复加载。

## Worker 任务 Contract

给出明确输入、固定规则、有限判断范围、输出格式、例子与验收证据。
优先缩小任务边界与工具集合，不用不断加长 Prompt 替代可靠的工具和检查。
把需要强判断的业务决策与机械执行分开，但不机械给每个节点增加昂贵复核。

原始数据默认只读。数据清洗产物必须保留来源对应关系，合并 / 去重不能只核对行数相等。
低能力 worker 不得更改验收规则、修改固定校验器或为过关删样本。
不确定记录只有在原 Contract 明确允许时才进入待复核表；规定其处理与最终接受条件。
复核既检查不确定项，也按风险抽查自判正确的结果。发布前检查最终合并产物。
已知规则优先在规划时固化为材料；只有依赖执行阶段新事实的部分，才安排明确节点生成并验收后供下游使用，不让执行者重做已完成的准备。
在现有 Completion Criteria 中写明检查执行者、方法、通过条件与证据交付。候选处理节点和最终质量复核节点分别定义完成条件，最终交付依赖必要复核；不把下游复核设为候选节点自身的完成前提。

## DAG 与写入安全

`depends_on` 是唯一机器依赖来源。正文链接、文件编号和自然语言关联不能替代它。
并行同时要求依赖独立和写入安全；优先各自产生候选产物，再由汇合节点合并。
不定义条件边、循环、动态拓扑、Model Router、第二份状态库或通用节点类型系统。

只有 pending 节点可以直接改 Contract。已有 ID 保持稳定，不为排序重新编号。
发现任何 running 节点时，只读诊断，不修改工作流或准备材料；先由明确的执行拥有者处理到安全边界。
保留 completed / failed 的 Contract、Result 和事实，不删除或重置历史。

失败后的新尝试用新 ID；failed 节点只能在正文中引用，不作为 retry 的机器前置。
重新连接所有剩余 pending 路径，确保新计划不再经过 failed ancestry。
准备材料的修订与历史保护遵循[Re-plan 安全](../protocol/planning-guide.md#7-re-plan-安全)，不通过覆盖被历史节点引用的文件改变历史含义。

## 文档校验

有已安装的 `ddflow inspect` 时可运行只读检查；未安装时不能声称执行过它。
对照 Schema 检查 YAML、标准 Section、ID 与文件名、依赖存在性、重复依赖和环。
另行检查模型 / Skill 引用依据、真实外部输入、写冲突、质量门槛和业务路径。
Schema 合法不等于已具备执行权限或已验证模型可用。

## 最终报告

说明工作流位置、目标、阶段与模型分工、准备材料及已做 / 未做的检查、验收方式、关键风险和待绑定项。
区分已知事实、规划假设与待核实事项；不要给 pending 节点编造执行事实。
需要执行时由用户另行显式调用 `ddflow-executor`。报告后停止，不自动切换。
