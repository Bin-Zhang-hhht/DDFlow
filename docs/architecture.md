# 架构设计

## 组件与事实来源

用户显式调用 Planner 编写 workflow.md 和 nodes/*.md；另行调用 Executor 后，由外部 Harness 承担派发、验收与事实写回。inspect 和 Viewer 只读这些文件。

Markdown 是唯一持久化工作流状态，节点文件即集合，depends_on 是唯一机器依赖。字段见 [Schema](../skills/protocol/workflow-schema.md)，执行行为见 [执行协议](../skills/protocol/execution-protocol.md)，任务粒度与上下文裁剪见 [规划指南](../skills/protocol/planning-guide.md)。

| 组件 | 职责 |
|---|---|
| Planner | 写 Contract、静态 DAG 和模型安排，准备规则、脚本与固定校验器；只直接编辑 pending，发现 running 时文档与材料均只读 |
| Executor / 主 Harness | 原生派发、最小交付与证据门槛、默认唯一节点文档写入者；每波重读、重校验，不承担业务内容复核 |
| Worker | 在独立上下文内执行处理或既定复核节点，调用固定程序并返回证据；只写约定产物，不修改工作流、固定规则或验收器 |
| Parser / Validator / Graph | 解析 YAML / Markdown，校验结构与 DAG，派生 ready / blocked |
| inspect | 输出诊断和节点摘要，不执行正文命令或调用模型 |
| Viewer | 复用解析器，展示文档和诊断，不写工作流或启动任务 |

模型引用对 Core 不透明，不做供应商映射。model_used 和 reasoning_effort_used 仅由宿主证据填写。安装、权限与派发差异通过原生能力和说明处理，不增加统一运行时 Adapter。

执行准备材料保存在用户指定的仓库外业务工作区，通过现有 Inputs / Prompt / Completion Criteria 引用，在 Execution Notes 记录来源、用途和实际检查范围。材料不是工作流状态，不为准备完成创建 completed 节点；Planner 不处理真实数据或试跑业务程序。执行时使用真实产物与检查证据验收，被历史节点引用的材料不能原地覆盖。节点内可以复用宿主程序化工具调用能力组合已知步骤，不新增 PTC Runtime 或跨节点调度器；具体行为见[规划指南](../skills/protocol/planning-guide.md#规划阶段的执行准备)与[执行协议](../skills/protocol/execution-protocol.md#使用规划准备材料)。

Completion Gate 核对返回归属、产物可访问性、证据与当前交付的对应关系及明确通过条件。确定性检查由程序执行，语义验收由计划内的 Agent Task 复核节点执行；主模型采纳其明确结果，不重复分析业务内容。证据齐全时不重复检查；出现缺失、矛盾或对象变化时按执行协议针对性处理。检查安排与证据要求使用现有 Contract 正文，执行事实仍记录在 Result / Error，不新增状态或调度组件。

ZCode 由用户手动配置子 Agent，Planner 通过现有 agent.recommended 和节点 Prompt 约定真实 Agent，Executor 按名派发并沿用配置，不在调用时覆盖模型或思考强度。Viewer 从现有元数据展示 Agent；模型 / 强度在请求与实际记录均缺省时隐藏，不增加 Schema 字段。

两个 Skill 在工作流文档就绪后，通过宿主原生终端会话默认尝试启动或复用已安装的 `ddflow view`。未安装时静默跳过，展示失败不阻塞任务；这由 Skill 指令约定，不新增 CLI 自动执行入口、daemon 或持久进程状态。会话、复用与地址证据见[只读 Viewer 规则](../skills/protocol/execution-protocol.md#只读-viewer)，宿主实测状态见[使用说明](usage.md#查看工作流)。

Planner 将 CLI 可用性检查与 Viewer 展示作为最终报告前的收尾步骤。地址确认后由宿主原生浏览器能力打开页面；缺少能力时返回实际链接。CLI 本身不自动开浏览器，Skill 不隐式下载 CLI，也不重复打开已展示的同一 Viewer。

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

## GitHub Actions 与版本晋升

[Verify and Package](../.github/workflows/verify.yml) 将日常验证与 tag 打包区分：

| 事件 | 行为 |
|---|---|
| 推送 `develop` / `main` | 安装锁定依赖、Lint、格式、构建与测试，不生成或上传分发压缩包 |
| PR 目标为 `develop` / `main` | 同上，只验证 |
| 手动运行（包括选择 tag） | 同上，只验证 |
| 显式推送 `v*` tag | 校验 tag 与版本、main 归属，执行全部验证后验收分发安装、打包并上传附件；两平台均通过后创建 GitHub Release |

tag 名须与 `package.json` 对应，例如包版本 `0.0.1` 对应 `v0.0.1`；双 Skill 版本一致性由已有 Skill 检查保证。tag 指向的提交必须属于 `origin/main` 历史，不能直接给仅在 `develop` 上的提交打 tag 来绕过版本晋升。仅在本地创建 tag 不会触发 GitHub Actions，必须将该 tag 推送到远端。非 `v*` tag 不触发工作流；格式匹配但版本或归属校验失败时不打包。工作流不发布到 npm。

Linux 与 Windows 均使用 Node.js 24，pnpm 版本取自 `package.json`。日常验证依次执行锁定依赖安装、`lint`、`format:check`、`test`；`test` 已包含构建和独立 Skill 组装检查，不生成分发压缩包。只有 tag 推送额外执行 `npm run check:package`，通过后运行 `npm run pack:local`；打包命令会再次执行其自带的构建与 Skill 检查。此矩阵不代表 Node.js 22、其他操作系统或宿主原生执行已经验证。

打包输出放在 runner 临时目录，仅上传两个 `.tgz`、`SHA256SUMS` 与 `INSTALL.md`。CI 附件名包含 tag、平台和提交 SHA，保留 14 天；每个平台只在自身检查通过后上传，整次运行仍需两个平台均通过。

发布任务依赖整个验证矩阵成功，仅在 tag 推送时执行。它下载本次 Ubuntu 构建的跨平台 JavaScript 与 Markdown 包，复核 SHA256SUMS，通过 GitHub CLI 创建 Release 并附上四个文件。发布说明来自 `docs/releases/<tag>.md`，发版前须随版本提交；含连字符的预发布版本标记为 prerelease。使用 `--verify-tag` 防止意外创建 tag，不覆盖已有 Release 或附件；失败时先检查是否留下草稿，不移动版本 tag。

验证任务保持 `contents: read`，仅发布任务使用 `contents: write` 和 GitHub 提供的短期 token，不需另配发布密钥。工作流不写分支或标签、不发布到 registry，也不上传业务工作流、实验数据或日志。只有 Release 页面和附件实际可用才算发布成功。

`workflow_dispatch` 的手动入口需工作流存在于 GitHub 默认分支。tag 打包使用该 tag 对应提交中的工作流，因此应在获准的版本晋升时将工作流一并纳入 `main`，之后再明确创建并推送版本 tag。本地手动构建命令不受 CI 触发条件限制。当前配置尚未在 GitHub 上通过真实 tag 推送验证。

日常修改在 `develop` 验收并提交，`main` 只用于用户明确同意的版本发布。两个分支从独立历史起步，不能按普通共同祖先分支直接合并。版本晋升前需提供候选提交、版本、变更和验证结果，和用户确认晋升方式；CI 成功与开发分支推送授权都不代表发布授权。具体约束见 [AGENTS.md](../AGENTS.md)。

## 第三方许可

依赖版本以 `package.json` 和 `pnpm-lock.yaml` 为准。YAML 解析库 `yaml` 使用 ISC；React、React Flow、Dagre、Chokidar、react-markdown、remark-gfm 及 Vite 核心使用 MIT。保留依赖许可和 React Flow 署名；Vite 构建生成前端 `THIRD-PARTY-LICENSES.md`，运行依赖由 npm 安装并保留许可。新增或复制代码前核对具体文件许可，分发时检查产物中的许可材料。
