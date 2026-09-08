import { useEffect, useState } from 'react';
import type { ViewerState } from '../types';
import { WorkflowGraph } from './WorkflowGraph';
import { NodePanel, Sections } from './NodePanel';
import { WorkflowHeader } from './WorkflowHeader';

export function App() {
  const [state, setState] = useState<ViewerState | null>(null);
  const [connected, setConnected] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [selectedId, select] = useState<string | null>(null);
  useEffect(() => {
    const events = new EventSource('/api/events');
    let active = true;
    let sequence = 0;
    let request: AbortController | undefined;
    async function refresh() {
      const current = ++sequence;
      request?.abort();
      request = new AbortController();
      try {
        const response = await fetch('/api/workflow', {
          cache: 'no-store',
          signal: request.signal,
        });
        if (!response.ok) {
          throw new Error('Snapshot unavailable');
        }
        const next: ViewerState = await response.json();
        if (active && current === sequence) {
          // A restarted service may have no in-memory snapshot yet. Keep the
          // browser's last valid view until a new valid document arrives.
          setState((previous) =>
            next.snapshot || !previous?.snapshot
              ? next
              : { ...next, snapshot: previous.snapshot, lastValidAt: previous.lastValidAt },
          );
          setSyncError(false);
        }
      } catch {
        if (active && current === sequence) {
          setSyncError(true);
        }
      }
    }
    events.onopen = () => {
      setConnected(true);
      void refresh();
    };
    events.addEventListener('refresh', () => {
      void refresh();
    });
    events.onerror = () => {
      setConnected(false);
      ++sequence;
      request?.abort();
    };
    // A transient GET failure must recover even if documents do not change.
    const retry = setInterval(() => {
      if (events.readyState === EventSource.OPEN) {
        void refresh();
      }
    }, 15000);
    return () => {
      active = false;
      ++sequence;
      request?.abort();
      events.close();
      clearInterval(retry);
    };
  }, []);
  const snapshot = state?.snapshot;
  const selected = snapshot?.nodes.find((node) => node.id === selectedId);
  const blocked = new Set(snapshot?.blocked_node_ids);
  const ready = new Set(snapshot?.ready_node_ids);
  return (
    <div className="app">
      <WorkflowHeader state={state} connected={connected} syncError={syncError} />
      <main>
        <section className="canvas-panel" aria-label="工作流图谱">
          <div className="graph-title">
            <div>
              <div className="eyebrow">DEPENDENCY MAP</div>
              <div className="graph-heading">
                <h2>工作流图谱</h2>
                <span className="graph-count">
                  {snapshot?.nodes.length ?? 0} 节点 / {snapshot?.edges.length ?? 0} 依赖
                </span>
              </div>
            </div>
          </div>
          {snapshot ? (
            snapshot.nodes.length ? (
              <WorkflowGraph
                snapshot={snapshot}
                selectedId={selected?.id ?? null}
                onSelect={select}
              />
            ) : (
              <div className="empty">文档合法，尚无节点。</div>
            )
          ) : (
            <div className="empty">
              <h3>尚无合法视图</h3>
              <p>修正文档后会自动显示工作流。可在顶栏查看诊断。</p>
            </div>
          )}
        </section>
        <aside className="detail-panel" aria-label="内容展示">
          <div className="detail-content" key={selected?.id ?? 'workflow'}>
            {selected ? (
              <>
                <button className="back-button" onClick={() => select(null)}>
                  ← 目标与全局约束
                </button>
                <NodePanel
                  node={selected}
                  blocked={blocked.has(selected.id)}
                  ready={ready.has(selected.id)}
                />
              </>
            ) : (
              <>
                <div className="eyebrow">WORKFLOW CONTEXT</div>
                <h2>目标与全局约束</h2>
                {snapshot?.workflow ? (
                  <Sections sections={snapshot.workflow.sections} />
                ) : (
                  <p className="hint">等待合法工作流文档。读取错误可在顶栏的文档诊断中查看。</p>
                )}
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
