import type { ViewerState } from '../types';

export function WorkflowHeader({
  state,
  connected,
  syncError,
}: {
  state: ViewerState | null;
  connected: boolean;
  syncError: boolean;
}) {
  const snapshot = state?.snapshot;
  const hasIssues =
    !connected ||
    syncError ||
    state?.documentStatus === 'invalid' ||
    Boolean(state?.diagnostics.length);
  const lastValid = state?.lastValidAt ? new Date(state.lastValidAt) : null;
  const status = (
    <span className="status-content">
      <span className="connection">
        <span className={`indicator ${connected ? 'good' : 'bad'}`}>
          {connected ? '已连接' : '已断连'}
        </span>
        <span className={state?.documentStatus === 'valid' ? 'good' : 'bad'}>
          {!state ? '等待文档' : state.documentStatus === 'valid' ? '文档合法' : '文档非法'}
        </span>
      </span>
      <span
        className="updated"
        title={`最后合法读取：${lastValid?.toLocaleString() ?? '尚无合法快照'}`}
      >
        {lastValid ? `更新 ${lastValid.toLocaleTimeString()}` : '尚无合法快照'}
        {hasIssues && <span className="issue-hint"> · 查看问题 ▾</span>}
      </span>
    </span>
  );
  return (
    <header className="workflow-header">
      <div className="header-main">
        <div className="identity">
          <div className="brand">
            <svg viewBox="0 0 44 44" role="img" aria-label="ddflow 文档工作流">
              <path
                d="M24 9H14a3 3 0 0 0-3 3v20a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V16Z"
                fill="#ffffff08"
                stroke="#edf8f2"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M24 9v7h7"
                fill="none"
                stroke="#edf8f2"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path
                d="M16 24h5m0 0v-4h5m-5 4v5h5"
                fill="none"
                stroke="#9eddbb"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="16" cy="24" r="2.2" fill="#edf8f2" />
              <circle cx="26" cy="20" r="2.2" fill="#9eddbb" />
              <circle cx="26" cy="29" r="2.2" fill="#9eddbb" />
            </svg>
          </div>
          <div className="workflow-name">
            <div className="eyebrow">DDFLOW / WORKFLOW VIEWER</div>
            <h1>{String(snapshot?.workflow?.metadata.name ?? '工作流视图')}</h1>
          </div>
        </div>
        <div className="overview" aria-label="工作流概览">
          <div className="stats">
            {[
              ['pending', '待处理'],
              ['running', '运行中'],
              ['completed', '已完成'],
              ['failed', '失败'],
            ].map(([status, label]) => (
              <div key={status}>
                <span className={`dot ${status}`} />
                <span>{label}</span>
                <strong>
                  {snapshot?.nodes.filter((node) => node.execution.status === status).length ?? 0}
                </strong>
              </div>
            ))}
          </div>
        </div>
        <div className="status-area" aria-live="polite">
          {hasIssues ? (
            <details className="diagnostics">
              <summary aria-label="查看连接与文档问题">{status}</summary>
              <div className="diagnostic-content">
                <h2>连接与文档问题</h2>
                {!connected && (
                  <p className="notice">服务已断连，显示内容可能过期；连接恢复后自动同步。</p>
                )}
                {syncError && (
                  <p className="notice">快照同步失败，显示内容可能过期；连接可用时会自动重试。</p>
                )}
                {state?.diagnostics.some((item) => item.code === 'watch') && (
                  <p className="notice">文件监听异常，后续修改可能无法同步；请重启 Viewer。</p>
                )}
                <p className="hint">
                  最后合法读取：{lastValid?.toLocaleString() ?? '尚无合法快照'}
                </p>
                <p className="hint">
                  诊断来自当前读取；非法时图与详情来自最后合法快照。blocked
                  为失败依赖派生状态；ready 仅表示依赖满足，不代表可以执行。
                </p>
                {state?.diagnostics.length ? (
                  <ul>
                    {state.diagnostics.map((item, i) => (
                      <li key={i} className={item.severity}>
                        <b>{item.severity}</b>
                        <code>{item.file || 'workflow'}</code>
                        <code>{item.code}</code>
                        <span>{item.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">
                    {state ? '没有文档诊断。结构合法不等于业务已验收。' : '等待服务返回文档诊断。'}
                  </p>
                )}
                <p className="hint">Markdown 是唯一工作流状态来源 · ddflow/v1</p>
              </div>
            </details>
          ) : (
            <div role="status">{status}</div>
          )}
        </div>
      </div>
    </header>
  );
}
