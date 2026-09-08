import type { Diagnostic, Node } from './types.js';

export function deriveGraph(nodes: Node[], diagnostics: Diagnostic[]) {
  const byId = new Map<string, Node>();
  const issue = (node: Node, code: string, message: string) =>
    diagnostics.push({ severity: 'error', code, file: node.file, message } as const);
  for (const node of nodes) {
    if (byId.has(node.id)) {
      issue(node, 'duplicate-id', `Duplicate node ID: ${node.id}`);
    }
    byId.set(node.id, node);
  }
  const edges = nodes.flatMap((node) =>
    node.depends_on.map((source) => ({ source, target: node.id })),
  );
  for (const node of nodes) {
    for (const dependency of node.depends_on) {
      if (dependency === node.id) {
        issue(node, 'self-dependency', `Node depends on itself: ${node.id}`);
      } else if (!byId.has(dependency)) {
        issue(node, 'missing-dependency', `Dependency does not exist: ${dependency}`);
      }
    }
  }
  const empty = { edges, ready_node_ids: [] as string[], blocked_node_ids: [] as string[] };
  if (diagnostics.some((d) => d.severity === 'error')) {
    return empty;
  }
  const remaining = new Map(nodes.map((node) => [node.id, node.depends_on.length]));
  const children = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    children.get(edge.source)!.push(edge.target);
  }
  const queue = nodes.filter((node) => node.depends_on.length === 0).map((node) => node.id);
  const failedAncestry = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const failed = byId.get(id)!.execution.status === 'failed' || failedAncestry.has(id);
    for (const child of children.get(id)!) {
      if (failed) {
        failedAncestry.add(child);
      }
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (count === 0) {
        queue.push(child);
      }
    }
  }
  if (queue.length !== nodes.length) {
    diagnostics.push({
      severity: 'error',
      code: 'cycle',
      file: 'nodes',
      message: 'Dependency graph contains a cycle.',
    });
    return empty;
  }
  return {
    edges,
    ready_node_ids: nodes
      .filter(
        (node) =>
          node.execution.status === 'pending' &&
          node.depends_on.every((id) => byId.get(id)!.execution.status === 'completed'),
      )
      .map((node) => node.id),
    blocked_node_ids: nodes
      .filter((node) => node.execution.status === 'pending' && failedAncestry.has(node.id))
      .map((node) => node.id),
  };
}
