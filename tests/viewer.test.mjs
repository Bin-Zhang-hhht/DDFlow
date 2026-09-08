import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  realpath,
  rm,
  rename,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { startViewer } from '../dist/viewer/server/server.js';

const workflow = '---\nschema: ddflow/v1\nname: Viewer check\n---\n# Goal\nRead-only view.\n';
const node = (id, status = 'pending', deps = []) =>
  `---\nid: ${id}\ntitle: ${id}\ndepends_on: ${JSON.stringify(deps)}\nmodel: requested-model\nreasoning_effort: medium\nexecution:\n  status: ${status}\n---\n# Goal\nRead.\n# Prompt\nRead.\n# Inputs\nsource\n# Outputs\nresult\n# Completion Criteria\nVerify.\n# Result\nEvidence\n# Error\nFailure evidence\n`;
async function fixture(t, initial = workflow) {
  const base = await realpath(tmpdir());
  const root = await mkdtemp(path.join(base, 'ddflow-viewer-'));
  t.after(async () => {
    assert.equal(path.dirname(await realpath(root)), base);
    assert.ok(path.basename(root).startsWith('ddflow-viewer-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, 'nodes'));
  await writeFile(path.join(root, 'workflow.md'), initial);
  await writeFile(path.join(root, 'nodes/a.md'), node('a'));
  return root;
}
async function start(t, root) {
  const viewer = await startViewer(root);
  t.after(() => viewer.close());
  return viewer;
}
const snapshot = async (viewer) => (await fetch(`${viewer.url}/api/workflow`)).json();
async function until(viewer, check) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const state = await snapshot(viewer);
    if (check(state)) {
      return state;
    }
    await delay(50);
  }
  assert.fail('Viewer did not converge within 8 seconds');
}
function rawGet(viewer, route, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(`${viewer.url}/`, { path: route, method, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () =>
        resolve({ status: response.statusCode, body, headers: response.headers }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

test('Viewer serves only read-only endpoints and built assets, leaving workflow bytes untouched', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'secret.txt'), 'must not be served');
  const before = await Promise.all(
    ['workflow.md', 'nodes/a.md', 'secret.txt'].map((file) => readFile(path.join(root, file))),
  );
  const viewer = await start(t, root);
  const state = await snapshot(viewer);
  assert.equal(state.documentStatus, 'valid');
  assert.equal(state.snapshot.nodes[0].requestedModel, 'requested-model');
  assert.equal(state.snapshot.nodes[0].execution.modelUsed, undefined);
  const home = await rawGet(viewer, '/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-security-policy'], /script-src 'self'/);
  assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(home.headers['access-control-allow-origin'], undefined);
  for (const asset of home.body.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)) {
    assert.equal((await rawGet(viewer, asset[1])).status, 200);
  }
  for (const route of [
    '/workflow.md',
    '/secret.txt',
    '/api/run',
    '/api/workflow?path=secret.txt',
    '/../secret.txt',
    '/assets/../../workflow.md',
    '/%2e%2e/secret.txt',
    '/assets%5c..%5cworkflow.md',
  ]) {
    assert.equal((await rawGet(viewer, route)).status, 404, route);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.equal((await rawGet(viewer, '/api/workflow', {}, method)).status, 405);
  }
  assert.equal((await rawGet(viewer, '/api/workflow', { Host: 'attacker.example' })).status, 403);
  assert.equal(
    (await rawGet(viewer, '/api/workflow', { Origin: 'https://attacker.example' })).status,
    403,
  );
  assert.equal(
    (await rawGet(viewer, '/api/workflow', { 'Sec-Fetch-Site': 'cross-site' })).status,
    403,
  );
  assert.deepEqual(
    await Promise.all(
      ['workflow.md', 'nodes/a.md', 'secret.txt'].map((file) => readFile(path.join(root, file))),
    ),
    before,
  );
  assert.deepEqual((await readdir(root)).sort(), ['nodes', 'secret.txt', 'workflow.md']);
});

test('edits, atomic replacement, invalid documents, deletion and recovery retain Last-Known-Good', async (t) => {
  const root = await fixture(t);
  const viewer = await start(t, root);
  await writeFile(path.join(root, 'nodes/a.md'), node('a', 'completed'));
  const completed = await until(
    viewer,
    (s) => s.snapshot?.nodes[0].execution.status === 'completed',
  );
  await writeFile(path.join(root, 'nodes/a.md'), '---\nbroken: [\n---\n');
  const invalid = await until(viewer, (s) => s.documentStatus === 'invalid');
  assert.deepEqual(invalid.snapshot, completed.snapshot);
  assert.equal(invalid.lastValidAt, completed.lastValidAt);
  assert.ok(invalid.diagnostics.some((d) => d.severity === 'error'));
  await writeFile(path.join(root, 'nodes/temporary'), node('a', 'running'));
  await rename(path.join(root, 'nodes/temporary'), path.join(root, 'nodes/a.md'));
  await until(
    viewer,
    (s) => s.documentStatus === 'valid' && s.snapshot.nodes[0].execution.status === 'running',
  );
  await writeFile(path.join(root, 'nodes/b.md'), node('b', 'pending', ['a']));
  await until(viewer, (s) => s.snapshot?.nodes.length === 2);
  await rm(path.join(root, 'nodes/a.md'));
  const missing = await until(viewer, (s) => s.documentStatus === 'invalid');
  assert.equal(missing.snapshot.nodes.length, 2);
  await writeFile(path.join(root, 'nodes/a.md'), node('a', 'failed'));
  const failed = await until(
    viewer,
    (s) => s.documentStatus === 'valid' && s.snapshot.blocked_node_ids.includes('b'),
  );
  assert.equal(failed.snapshot.nodes.find((n) => n.id === 'b').execution.status, 'pending');
  await rename(path.join(root, 'nodes'), path.join(root, 'nodes-away'));
  await until(viewer, (s) => s.documentStatus === 'invalid');
  await rename(path.join(root, 'nodes-away'), path.join(root, 'nodes'));
  await until(viewer, (s) => s.documentStatus === 'valid');
});

test('initial invalid workflow exposes diagnostics with no invented snapshot and recovers', async (t) => {
  const root = await fixture(t, 'invalid');
  const viewer = await start(t, root);
  const initial = await snapshot(viewer);
  assert.equal(initial.documentStatus, 'invalid');
  assert.equal(initial.snapshot, null);
  assert.equal(initial.lastValidAt, null);
  assert.ok(initial.diagnostics.length);
  await writeFile(path.join(root, 'workflow.md'), workflow);
  await until(viewer, (s) => s.documentStatus === 'valid' && s.snapshot.nodes.length === 1);
});

test('SSE sends invalidations only, and streams end on foreground service shutdown', async (t) => {
  const root = await fixture(t);
  const viewer = await startViewer(root);
  let closed = false;
  t.after(async () => {
    if (!closed) {
      await viewer.close();
    }
  });
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${viewer.url}/api/events`, { signal: abort.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body.getReader();
  const read = async () => new TextDecoder().decode((await reader.read()).value);
  const initial = await read();
  assert.match(initial, /event: refresh\ndata: \{\}/);
  assert.doesNotMatch(initial, /requested-model|snapshot|Viewer check/);
  await writeFile(path.join(root, 'workflow.md'), workflow.replace('Viewer check', 'New name'));
  const deadline = setTimeout(() => abort.abort(), 8000);
  let update;
  try {
    update = await read();
  } finally {
    clearTimeout(deadline);
  }
  assert.equal(update, 'event: refresh\ndata: {}\n\n');
  assert.equal((await snapshot(viewer)).snapshot.workflow.metadata.name, 'New name');
  await viewer.close();
  closed = true;
  assert.equal((await reader.read()).done, true);
});

test('directory links outside the selected directory are diagnosed without leaking content', async (t) => {
  const root = await fixture(t);
  const outside = await fixture(t, workflow.replace('Viewer check', 'SECRET OUTSIDE'));
  await writeFile(
    path.join(outside, 'nodes/a.md'),
    node('a').replace('title: a', 'title: SECRET OUTSIDE'),
  );
  await rename(path.join(root, 'nodes'), path.join(root, 'original-nodes'));
  try {
    await symlink(path.join(outside, 'nodes'), path.join(root, 'nodes'), 'junction');
  } catch (error) {
    if (error.code === 'EPERM') {
      t.skip('OS does not permit test symlink');
      return;
    }
    throw error;
  }
  const viewer = await start(t, root);
  const state = await snapshot(viewer);
  assert.equal(state.documentStatus, 'invalid');
  assert.ok(state.diagnostics.some((d) => d.code === 'path-boundary'));
  assert.doesNotMatch(JSON.stringify(state), /SECRET OUTSIDE/);
});

test('view CLI rejects invalid options without starting a service', () => {
  for (const args of [
    ['--port', '-1'],
    ['--port', '65536'],
    ['--port'],
    ['--port', '0', '--port', '1'],
    ['--json'],
    ['a', 'b'],
  ]) {
    const result = spawnSync(process.execPath, ['dist/cli.js', 'view', ...args], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 2, args.join(' '));
  }
});
