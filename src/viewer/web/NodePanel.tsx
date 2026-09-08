import type { Node } from '../../workflow/types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Format prose without activating HTML, remote media, or artifact links.
export function Sections({ sections }: { sections: Record<string, string> }) {
  return (
    <>
      {Object.entries(sections).map(([title, body]) => (
        <section className="section" key={title}>
          <h3>{title}</h3>
          <div className="markdown-body">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => <span title={href}>{children}</span>,
                img: ({ alt }) => <span>〔图片：{alt || '未命名'}〕</span>,
                table: ({ children }) => (
                  <div className="markdown-table">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {body.trim() || '（未填写）'}
            </Markdown>
          </div>
        </section>
      ))}
    </>
  );
}
export function NodePanel({
  node,
  blocked,
  ready,
}: {
  node: Node;
  blocked: boolean;
  ready: boolean;
}) {
  return (
    <>
      <div className="eyebrow">NODE DETAIL / {node.id}</div>
      <h2>{node.title}</h2>
      <dl className="facts">
        <dt>持久状态</dt>
        <dd>{node.execution.status}</dd>
        <dt>依赖状态</dt>
        <dd>
          {blocked
            ? 'blocked · 存在失败前置'
            : ready
              ? 'ready · 仅依赖满足'
              : '无 ready / blocked 标记'}
        </dd>
        <dt>依赖节点</dt>
        <dd>{node.depends_on.join(', ') || '无'}</dd>
      </dl>
      <h3>模型与思考强度</h3>
      <table>
        <thead>
          <tr>
            <th>字段</th>
            <th>请求 / 契约</th>
            <th>实际记录</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>模型</th>
            <td>{node.requestedModel ?? '未指定（宿主默认）'}</td>
            <td>{node.execution.modelUsed ?? '未知'}</td>
          </tr>
          <tr>
            <th>思考强度</th>
            <td>{node.requestedReasoningEffort ?? '未指定（宿主默认）'}</td>
            <td>{node.execution.reasoningEffortUsed ?? '未知'}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">实际记录来自 execution 字段，Viewer 不独立验证宿主证据。</p>
      <Sections sections={node.sections} />
      <details>
        <summary>完整 YAML 元数据（只读）</summary>
        <pre>{JSON.stringify(node.metadata, null, 2)}</pre>
      </details>
    </>
  );
}
