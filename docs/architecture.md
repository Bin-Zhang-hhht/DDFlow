# 架构设计

## 组件与事实来源

用户显式调用 Planner 编写 workflow.md 和 nodes/*.md；另行调用 Executor 后，由外部 Harness 承担派发、验收与事实写回。inspect 和 Viewer 只读这些文件。

Markdown 是唯一持久化工作流状态，节点文件即集合，depends_on 是唯一机器依赖。字段见 [Schema](../skills/protocol/workflow-schema.md)，执行行为见 [执行协议](../skills/protocol/execution-protocol.md)，任务粒度与上下文裁剪见 [规划指南](../skills/protocol/planning-guide.md)。

| 组件 | 职责 |
|---|---|
| Planner | 写 Contract、静态 DAG 和模型安排；只直接编辑 pending，发现 running 时只读 |
| Executor / 主 Harness | 原生派发、Completion Gate、默认唯一节点文档写入者；每波重读、重校验 |
| Worker | 在独立上下文内执行节点，只写约定产物，不修改工作流、规则或验收器 |
| Parser / Validator / Graph | 解析 YAML / Markdown，校验结构与 DAG，派生 ready / blocked |
| inspect | 输出诊断和节点摘要，不执行正文命令或调用模型 |
| Viewer | 复用解析器，展示文档和诊断，不写工作流或启动任务 |

模型引用对 Core 不透明，不做供应商映射。model_used 和 reasoning_effort_used 仅由宿主证据填写。安装、权限与派发差异通过原生能力和说明处理，不增加统一运行时 Adapter。

## 只读工具

保持单 Package：Node.js / TypeScript；前端 React / Vite；图展示使用 React Flow 与 Dagre；文件监听使用 Chokidar。依赖版本由 package.json 和锁文件记录。

Viewer 是 loopback 前台服务，只提供快照 GET、SSE 通知和内置静态资源。SSE 只发失效通知，快照由 GET 获取。文档有效性与连接状态独立；非法文档保留 Last-Known-Good，断连提示数据可能过期。快照仅保存在内存。

监听去抖、稳定读取并全量重验，不能保证跨文件事务。限制读取目录、方法、来源与资源大小；正文通过 react-markdown 与 remark-gfm 渲染，原始 HTML 转义，不加载图片或激活链接。完整接口和异常行为见 [Viewer](usage.md#查看工作流)。

## 源码与打包

| 位置 | 内容 |
|---|---|
| skills/protocol/ | 协议的唯一维护源 |
| skills/ddflow-planner/、skills/ddflow-executor/ | SKILL.md 和 agents/openai.yaml |
| scripts/skills.mjs | 生成可安装 Skill，改写引用并复制协议和 LICENSE |
| scripts/pack.mjs | 使用 npm pack 和 tar 生成两个包 |
| src/workflow/ | 解析、校验与依赖计算 |
| src/viewer/ | 本地服务与前端 |
| src/cli.ts | inspect / view 入口 |
| tests/ | 必要产品与分发检查 |

源码 Skill 通过 `../protocol/` 引用共享协议。打包时从 `skills/protocol/` 复制三份协议到每个 Skill 的 `references/`，将入口引用改为包内路径，不提交生成副本。双 Skill 包以两个技能目录为顶层，一次解压安装；每个 Skill 都可以脱离源码和另一个 Skill 读取完整协议。

CLI 在临时目录使用运行文件、精简包元数据、使用说明与 MIT 许可证执行 npm pack；不夹带 Skill、项目文档、案例教程或仓库规则。Vite 生成前端第三方许可，运行依赖由 npm 安装。

## 构建与打包

需要 Node.js 22.13+（22 系列）或 24+、`package.json` 指定的 pnpm、npm 和 tar。

```powershell
pnpm install --frozen-lockfile
pnpm build
# 输出目录须尚不存在，父目录须存在
npm run pack:local -- C:\packages\ddflow-build
```

打包生成双 Skill 包、独立 CLI 包、`SHA256SUMS` 和 `INSTALL.md`，不发布或安装。安装方式见[使用说明](usage.md)。

## 修改后检查

按修改范围选择检查，不把历史测试当作当前验收：

```powershell
pnpm lint
pnpm format:check
pnpm test
pnpm check:skills
# 先完成构建，再检查分发包
npm run check:package
```

`test` 包含构建及产品测试；`check:skills` 检查组装后的元数据、许可证和包内协议引用；`check:package` 在仓库外临时目录检查包内容、CLI 安装运行与卸载。包检查不能替代宿主原生发现或实际业务验收。源码运行工具可用 `pnpm inspect "<工作流目录>" --json` 和 `pnpm run view "<工作流目录>"`。

## 第三方许可

依赖版本以 `package.json` 和 `pnpm-lock.yaml` 为准。YAML 解析库 `yaml` 使用 ISC；React、React Flow、Dagre、Chokidar、react-markdown、remark-gfm 及 Vite 核心使用 MIT。保留依赖许可和 React Flow 署名；Vite 构建生成前端 `THIRD-PARTY-LICENSES.md`，运行依赖由 npm 安装并保留许可。新增或复制代码前核对具体文件许可，分发时检查产物中的许可材料。
