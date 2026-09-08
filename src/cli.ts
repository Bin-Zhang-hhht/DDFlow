#!/usr/bin/env node
import { inspectWorkflow } from './workflow/inspect.js';

const usage =
  'Usage: ddflow inspect [workflow-dir] [--json]\n       ddflow view [workflow-dir] [--port 0-65535]\nRead-only tools. Ready is a dependency fact, not execution permission.';
const args = process.argv.slice(2);
const json = args.includes('--json');
function fail(message: string): void {
  if (json) {
    console.log(
      JSON.stringify({
        valid: false,
        diagnostics: [{ severity: 'error', code: 'cli', file: '', message }],
      }),
    );
  } else {
    console.error(message);
  }
  process.exitCode = 2;
}
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(usage);
} else if (args[0] === 'view') {
  if (args.length === 2 && ['--help', '-h'].includes(args[1])) {
    console.log(usage);
  } else {
    try {
      let directory: string | undefined;
      let port: number | undefined;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--port' && port === undefined) {
          const value = args[++i];
          if (!value || !/^\d+$/.test(value) || Number(value) > 65535) {
            throw new Error(usage);
          }
          port = Number(value);
        } else if (!args[i].startsWith('-') && directory === undefined) {
          directory = args[i];
        } else {
          throw new Error(usage);
        }
      }
      const { startViewer } = await import('./viewer/server/server.js');
      const viewer = await startViewer(directory ?? '.', port ?? 0);
      console.log(
        `Read-only Viewer: ${viewer.url}\nPress Ctrl+C to stop. No workflow files are written.`,
      );
      let closing = false;
      const stop = () => {
        if (closing) {
          return;
        }
        closing = true;
        void viewer.close().catch(() => {
          process.exitCode = 2;
        });
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Cannot start Viewer.');
    }
  }
} else if (args[0] !== 'inspect') {
  fail(usage);
} else if (args.length === 2 && ['--help', '-h'].includes(args[1])) {
  console.log(usage);
} else {
  const positional = args.slice(1).filter((arg) => arg !== '--json');
  if (
    positional.length > 1 ||
    positional.some((arg) => arg.startsWith('-')) ||
    args.filter((arg) => arg === '--json').length > 1
  ) {
    fail(usage);
  } else {
    try {
      const result = await inspectWorkflow(positional[0] ?? '.');
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          `Structure: ${result.valid ? 'valid' : 'invalid'}; nodes: ${result.nodes.length}`,
        );
        for (const item of result.diagnostics) {
          console.log(`${item.severity.toUpperCase()} ${item.file} [${item.code}] ${item.message}`);
        }
        console.log(`Ready (dependencies only): ${result.ready_node_ids.join(', ') || '(none)'}`);
        console.log(`Blocked (failed ancestry): ${result.blocked_node_ids.join(', ') || '(none)'}`);
        console.log(
          'This does not verify inputs, model or reasoning effort availability, execution permission or business quality.',
        );
      }
      process.exitCode = result.valid ? 0 : 1;
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Inspection failed.');
    }
  }
}
