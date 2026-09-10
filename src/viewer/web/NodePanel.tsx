import type { Node } from '../../workflow/types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NodeAssignment } from './NodeAssignment';

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
      <NodeAssignment node={node} />
      <Sections sections={node.sections} />
      <details>
        <summary>完整 YAML 元数据（只读）</summary>
        <pre>{JSON.stringify(node.metadata, null, 2)}</pre>
      </details>
    </>
  );
}
