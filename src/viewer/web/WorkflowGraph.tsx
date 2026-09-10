import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Position,
  MarkerType,
  useReactFlow,
  useNodesInitialized,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { Inspection } from '../../workflow/types';
import { assignmentRows, NodeAssignment } from './NodeAssignment';

function FitToCanvas({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!container.current || !initialized) {
      return;
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void fitView({ padding: 0.15 });
      });
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, initialized, fitView]);
  return null;
}

export function WorkflowGraph({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: Inspection;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => {
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', nodesep: 35, ranksep: 55, marginx: 24, marginy: 24 });
    for (const node of snapshot.nodes) {
      graph.setNode(node.id, { width: 230, height: 94 + assignmentRows(node).length * 20 });
    }
    for (const edge of snapshot.edges) {
      graph.setEdge(edge.source, edge.target);
    }
    dagre.layout(graph);
    return graph;
  }, [snapshot]);
  const blocked = new Set(snapshot.blocked_node_ids);
  const nodes = snapshot.nodes.map((node) => ({
    id: node.id,
    position: {
      x: layout.node(node.id).x - 115,
      y: layout.node(node.id).y - layout.node(node.id).height / 2,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: { height: layout.node(node.id).height },
    selected: selectedId === node.id,
    className: `workflow-node ${blocked.has(node.id) ? 'blocked' : node.execution.status}`,
    data: {
      label: (
        <button
          className="node-content"
          onClick={() => onSelect(node.id)}
          aria-pressed={selectedId === node.id}
        >
          <div className="node-top">
            <b>{node.id}</b>
            <span>{blocked.has(node.id) ? 'blocked' : node.execution.status}</span>
          </div>
          <strong>{node.title}</strong>
          <NodeAssignment node={node} compact />
        </button>
      ),
    },
  }));
  const edges = snapshot.edges.map((edge) => ({
    ...edge,
    id: `${edge.source}:${edge.target}`,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    selectable: false,
  }));
  return (
    <div className="graph" ref={container}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        nodesFocusable={false}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.15}
        maxZoom={1.5}
        onNodeDoubleClick={(_, node) => onSelect(node.id)}
      >
        <FitToCanvas container={container} />
        <Background gap={20} size={1} color="#d8dfdf" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
