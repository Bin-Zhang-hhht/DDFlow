import { createServer, type ServerResponse } from 'node:http';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchWorkflow } from './watcher.js';

export async function startViewer(directory: string, port = 0) {
  const root = await realpath(directory);
  if (!(await stat(root)).isDirectory()) {
    throw new Error('Workflow path must be a directory.');
  }
  const web = fileURLToPath(new URL('../web/', import.meta.url));
  // Only built assets enter this allowlist. No URL is resolved against workflow files.
  const assets = new Map<string, { body: Buffer; type: string }>();
  assets.set('/', {
    body: await readFile(path.join(web, 'index.html')),
    type: 'text/html; charset=utf-8',
  });
  for (const name of await readdir(path.join(web, 'assets'))) {
    if (!/^[\w.-]+\.(js|css)$/.test(name)) {
      continue;
    }
    assets.set(`/assets/${name}`, {
      body: await readFile(path.join(web, 'assets', name)),
      type: name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8',
    });
  }
  const clients = new Set<ServerResponse>();
  const broadcast = () => {
    for (const client of clients) {
      client.write('event: refresh\ndata: {}\n\n');
    }
  };
  const watcher = await watchWorkflow(root, broadcast);
  let origin = '';
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    const deny = (status: number, message: string) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(message);
    };
    if (
      `http://${request.headers.host}` !== origin ||
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      deny(403, 'Only same-origin loopback access is allowed.');
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      deny(405, 'Read-only Viewer.');
      return;
    }
    const route = request.url ?? '';
    if (route === '/api/workflow') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(watcher.getState()));
    } else if (route === '/api/events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      clients.add(response);
      response.write('retry: 1000\nevent: refresh\ndata: {}\n\n');
      response.on('close', () => clients.delete(response));
    } else {
      const asset = assets.get(route);
      if (!asset) {
        deny(404, 'Not found.');
        return;
      }
      response.writeHead(200, { 'Content-Type': asset.type });
      response.end(asset.body);
    }
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      client.write(': heartbeat\n\n');
    }
  }, 15000);
  heartbeat.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Cannot determine Viewer address.'));
          return;
        }
        origin = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  } catch (error) {
    clearInterval(heartbeat);
    await watcher.close();
    throw error;
  }
  return {
    url: origin,
    async close() {
      clearInterval(heartbeat);
      for (const client of clients) {
        client.end();
      }
      const stopped = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await Promise.all([watcher.close(), stopped]);
    },
  };
}
