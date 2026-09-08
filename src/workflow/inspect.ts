import { open, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseMarkdown, validateDocument } from './parser.js';
import { deriveGraph } from './graph.js';
import type { Diagnostic, Document, Inspection, Node } from './types.js';

// Operational safety limits, not persisted workflow fields.
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * MAX_DOCUMENT_BYTES;
const MAX_NODES = 1000;
export class ReadError extends Error {}
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

export async function inspectWorkflow(directory: string): Promise<Inspection> {
  let root: string;
  try {
    root = await realpath(directory);
    if (!(await stat(root)).isDirectory()) {
      throw new Error('Not a directory');
    }
  } catch {
    throw new ReadError('Cannot read workflow directory.');
  }
  const diagnostics: Diagnostic[] = [];
  let total = 0;
  const error = (file: string, code: string, message: string) =>
    diagnostics.push({ severity: 'error', code, file, message } as const);
  const withinRoot = (target: string) => {
    const relative = path.relative(root, target);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  async function readDocument(file: string): Promise<Document | null> {
    let target: string;
    try {
      target = await realpath(path.join(root, file));
    } catch (err) {
      if (missing(err)) {
        error(file, 'missing-file', 'Required document does not exist.');
        return null;
      }
      throw new ReadError(`Cannot resolve ${file}.`);
    }
    if (!withinRoot(target)) {
      error(file, 'path-boundary', 'Document resolves outside the workflow directory.');
      return null;
    }
    const handle = await open(target, 'r').catch(() => {
      throw new ReadError(`Cannot open ${file}.`);
    });
    try {
      if (!(await handle.stat()).isFile()) {
        error(file, 'file-type', 'Document must be a regular file.');
        return null;
      }
      // Bounded reads also protect against a file growing after stat.
      const buffer = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const { bytesRead } = await handle.read(buffer, bytes, buffer.length - bytes, bytes);
        if (!bytesRead) {
          break;
        }
        bytes += bytesRead;
      }
      total += bytes;
      if (bytes > MAX_DOCUMENT_BYTES || total > MAX_TOTAL_BYTES) {
        error(file, 'size-limit', 'Document exceeds 1 MiB or workflow exceeds 16 MiB.');
        return null;
      }
      let raw: string;
      try {
        raw = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes));
      } catch {
        error(file, 'encoding', 'Document is not valid UTF-8.');
        return null;
      }
      return parseMarkdown(file, raw, diagnostics);
    } catch (err) {
      if (err instanceof ReadError) {
        throw err;
      }
      throw new ReadError(`Cannot read ${file}.`);
    } finally {
      await handle.close();
    }
  }
  const workflow = await readDocument('workflow.md');
  if (workflow) {
    validateDocument(workflow, 'workflow', diagnostics);
  }
  const nodes: Node[] = [];
  let names: string[] = [];
  try {
    const nodeDirectory = await realpath(path.join(root, 'nodes'));
    if (!withinRoot(nodeDirectory)) {
      error('nodes', 'path-boundary', 'nodes directory resolves outside the workflow directory.');
    } else {
      names = (await readdir(nodeDirectory)).filter((name) => name.endsWith('.md')).sort();
    }
  } catch (err) {
    if (missing(err)) {
      error('nodes', 'missing-directory', 'nodes directory does not exist.');
    } else {
      throw new ReadError('Cannot read nodes directory.');
    }
  }
  if (names.length > MAX_NODES) {
    error('nodes', 'node-limit', 'Workflow exceeds 1000 nodes.');
  } else {
    for (const name of names) {
      if (total > MAX_TOTAL_BYTES) {
        break;
      }
      const doc = await readDocument(`nodes/${name}`);
      if (doc) {
        const node = validateDocument(doc, 'node', diagnostics);
        if (node) {
          nodes.push(node);
        }
      }
    }
  }
  const graph = deriveGraph(nodes, diagnostics);
  return {
    valid: !diagnostics.some((d) => d.severity === 'error'),
    diagnostics,
    workflow,
    nodes,
    ...graph,
  };
}
