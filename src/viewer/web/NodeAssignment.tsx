import type { Node } from '../../workflow/types';

export function assignmentRows(node: Node) {
  const agent = node.metadata.agent as { recommended?: string; profile?: string } | undefined;
  return [
    { label: '子 Agent', requested: agent?.recommended },
    { label: 'Agent 配置', requested: agent?.profile },
    { label: '模型', requested: node.requestedModel, actual: node.execution.modelUsed },
    {
      label: '思考强度',
      requested: node.requestedReasoningEffort,
      actual: node.execution.reasoningEffortUsed,
    },
  ].filter((row) => row.requested || row.actual);
}

export function NodeAssignment({ node, compact = false }: { node: Node; compact?: boolean }) {
  const rows = assignmentRows(node);
  if (rows.length === 0) {
    return null;
  }
  if (compact) {
    return rows.map((row) => (
      <small key={row.label} title={`${row.label} · ${row.requested ?? row.actual}`}>
        {row.label} · {row.requested ? '计划' : '实际'} · {row.requested ?? row.actual}
      </small>
    ));
  }
  return (
    <>
      <h3>执行安排</h3>
      <table>
        <thead>
          <tr>
            <th>字段</th>
            <th>计划 / 契约</th>
            <th>实际记录</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>{row.requested ?? '—'}</td>
              <td>{row.actual ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        计划不代表实际执行；实际记录来自 execution 字段，空缺以 — 表示。Viewer 不独立验证宿主证据。
      </p>
    </>
  );
}
