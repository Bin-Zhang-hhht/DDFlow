import type { Diagnostic, Inspection } from '../workflow/types.js';

// Transport state only; never persisted beside the workflow documents.
export interface ViewerState {
  documentStatus: 'valid' | 'invalid';
  diagnostics: Diagnostic[];
  snapshot: Inspection | null;
  lastValidAt: string | null;
}
