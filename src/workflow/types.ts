export type Status = 'pending' | 'running' | 'completed' | 'failed';
export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  file: string;
  message: string;
}
export interface Document {
  file: string;
  metadata: Record<string, unknown>;
  sections: Record<string, string>;
}
export interface Node extends Document {
  id: string;
  title: string;
  depends_on: string[];
  requestedModel?: string;
  requestedReasoningEffort?: string;
  execution: { status: Status; modelUsed?: string; reasoningEffortUsed?: string };
}
export interface Inspection {
  valid: boolean;
  diagnostics: Diagnostic[];
  workflow: Document | null;
  nodes: Node[];
  edges: { source: string; target: string }[];
  ready_node_ids: string[];
  blocked_node_ids: string[];
}
