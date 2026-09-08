import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import chokidar from 'chokidar';
import { inspectWorkflow } from '../../workflow/inspect.js';
import type { Inspection } from '../../workflow/types.js';
import type { ViewerState } from '../types.js';

export async function watchWorkflow(root: string, notify: () => void) {
  let state: ViewerState = {
    documentStatus: 'invalid',
    diagnostics: [],
    snapshot: null,
    lastValidAt: null,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy: Promise<void> | undefined;
  let dirty = false;
  let closed = false;
  let watcherFailed = false;
  async function read(): Promise<Inspection> {
    try {
      return await inspectWorkflow(root);
    } catch {
      return {
        valid: false,
        diagnostics: [
          { severity: 'error', code: 'read', file: '', message: 'Cannot read workflow documents.' },
        ],
        workflow: null,
        nodes: [],
        edges: [],
        ready_node_ids: [],
        blocked_node_ids: [],
      };
    }
  }
  function schedule() {
    if (closed) {
      return;
    }
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void refresh();
    }, 150);
  }
  async function refresh() {
    if (closed || busy) {
      return busy;
    }
    busy = (async () => {
      dirty = false;
      const first = await read();
      await delay(100);
      const next = await read();
      if (closed) {
        return;
      }
      // Do not publish a parse spanning an observed edit or an unstable read.
      if (dirty || JSON.stringify(first) !== JSON.stringify(next)) {
        schedule();
        return;
      }
      // Watch health is separate from the validity of this successful read.
      const valid = next.valid;
      state = {
        documentStatus: valid ? 'valid' : 'invalid',
        diagnostics: watcherFailed
          ? [
              ...next.diagnostics,
              {
                severity: 'error',
                code: 'watch',
                file: '',
                message: 'File watching failed; restart Viewer to resume reliable updates.',
              },
            ]
          : next.diagnostics,
        snapshot: valid ? next : state.snapshot,
        lastValidAt: valid ? new Date().toISOString() : state.lastValidAt,
      };
      notify();
    })().finally(() => {
      busy = undefined;
      if (dirty && !closed) {
        schedule();
      }
    });
    return busy;
  }
  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    depth: 2,
    atomic: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignored: (candidate) => {
      const relative = path.relative(root, candidate).split(path.sep).join('/');
      return (
        relative !== '' &&
        relative !== 'workflow.md' &&
        relative !== 'nodes' &&
        !/^nodes\/[^/]+\.md$/.test(relative)
      );
    },
  });
  watcher.on('all', schedule);
  watcher.on('error', () => {
    watcherFailed = true;
    schedule();
  });
  await new Promise<void>((resolve) => {
    watcher.once('ready', resolve);
    watcher.once('error', () => resolve());
  });
  await refresh();
  return {
    getState: () => state,
    async close() {
      closed = true;
      clearTimeout(timer);
      await watcher.close();
      await busy;
    },
  };
}
