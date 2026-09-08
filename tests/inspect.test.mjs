import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectWorkflow } from '../dist/index.js';

const cli = path.resolve('dist/cli.js');
const workflow = '---\nschema: ddflow/v1\nname: test\n---\n# Goal\nA bounded check.\n';
function node(id, deps = [], status = 'pending', extra = '') {
  return `---\nid: ${id}\ntitle: ${id}\ndepends_on: ${JSON.stringify(deps)}\n${extra}execution:\n  status: ${status}\n---\n# Goal\nCheck.\n# Prompt\nRead the inputs.\n# Inputs\nAn input path.\n# Outputs\nAn output path.\n# Completion Criteria\nVerify evidence.\n# Result\n\n# Error\n`;
}
async function fixture(t, files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ddflow-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'nodes'));
  await writeFile(path.join(root, 'workflow.md'), workflow);
  for (const [file, content] of Object.entries(files)) {
    await writeFile(path.join(root, 'nodes', file), content);
  }
  return root;
}
const has = (result, code) => result.diagnostics.some((d) => d.code === code);

test('pending DAG is structurally valid, initially ready only at root, and unchanged by CLI', async (t) => {
  const root = await fixture(t, {
    'a.md': node('a'),
    'b.md': node('b', ['a']),
    'c.md': node('c', ['a']),
    'd.md': node('d', ['b', 'c']),
  });
  const files = [
    'workflow.md',
    ...(await readdir(path.join(root, 'nodes'))).map((f) => `nodes/${f}`),
  ];
  const before = await Promise.all(files.map((file) => readFile(path.join(root, file))));
  const result = spawnSync(process.execPath, [cli, 'inspect', root, '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.nodes.length, 4);
  assert.deepEqual(parsed.ready_node_ids, ['a']);
  assert.deepEqual(parsed.blocked_node_ids, []);
  assert.deepEqual(await Promise.all(files.map((file) => readFile(path.join(root, file)))), before);
});

test('parallel join, transitive failed ancestry, and independent ready remain distinct', async (t) => {
  const root = await fixture(t, {
    'a.md': node('a', [], 'completed'),
    'b.md': node('b', ['a'], 'failed'),
    'c.md': node('c', ['a'], 'completed'),
    'd.md': node('d', ['b', 'c']),
    'e.md': node('e', ['d']),
    'f.md': node('f'),
    'g.md': node('g', ['f']),
  });
  const result = await inspectWorkflow(root);
  assert.equal(result.valid, true);
  assert.deepEqual(result.ready_node_ids, ['f']); // Dependency fact, not fail-fast bypass permission.
  assert.deepEqual(result.blocked_node_ids, ['d', 'e']);
  assert.equal(result.nodes.find((n) => n.id === 'd').execution.status, 'pending');
  assert.ok(has(result, 'missing-evidence'));
});

test('unknown metadata and raw fenced content survive; model request never becomes evidence', async (t) => {
  const content = node(
    'a',
    [],
    'running',
    'model: requested-model\nskills: [known-skill]\nfuture: { run: never }\n',
  ).replace(
    'Read the inputs.',
    'Read the inputs.\n```md\n# Goal\nfake section\n```\n~~~text\n# Error\nfake error\n~~~',
  );
  const root = await fixture(t, { 'a.md': content });
  const result = await inspectWorkflow(root);
  assert.equal(result.valid, true);
  assert.ok(has(result, 'unknown-field'));
  assert.ok(has(result, 'unknown-model'));
  assert.equal(result.nodes[0].requestedModel, 'requested-model');
  assert.equal(result.nodes[0].execution.modelUsed, undefined);
  assert.equal(result.nodes[0].metadata.future.run, 'never');
  assert.match(result.nodes[0].sections.Prompt, /# Goal\nfake section/);
});

test('CLI preserves requested and effective reasoning effort separately without writes or inferred facts', async (t) => {
  const files = {
    'a.md': node('a', [], 'running', 'model: requested-model\nreasoning_effort: high\n'),
    'b.md': node('b', [], 'completed', 'reasoning_effort: future-host-level\n').replace(
      'status: completed',
      'status: completed\n  reasoning_effort_used: medium',
    ),
    'c.md': node('c'),
    'd.md': node('d', [], 'completed').replace(
      'status: completed',
      'status: completed\n  reasoning_effort_used: low',
    ),
  };
  const root = await fixture(t, files);
  const cliResult = spawnSync(process.execPath, [cli, 'inspect', root, '--json'], {
    encoding: 'utf8',
  });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  const result = JSON.parse(cliResult.stdout);
  const [a, b, c, d] = result.nodes;
  assert.equal(a.requestedReasoningEffort, 'high');
  assert.equal(Object.hasOwn(a.execution, 'reasoningEffortUsed'), false);
  assert.ok(
    result.diagnostics.some(
      (x) => x.file.endsWith('/a.md') && x.code === 'unknown-reasoning-effort',
    ),
  );
  // Opaque values and mismatching facts are retained for Harness preflight, not silently mapped.
  assert.equal(b.requestedReasoningEffort, 'future-host-level');
  assert.equal(b.execution.reasoningEffortUsed, 'medium');
  assert.equal(b.metadata.execution.reasoning_effort_used, 'medium');
  assert.equal(b.execution.modelUsed, undefined);
  assert.equal(Object.hasOwn(c, 'requestedReasoningEffort'), false);
  assert.equal(Object.hasOwn(c.execution, 'reasoningEffortUsed'), false);
  assert.equal(Object.hasOwn(d, 'requestedReasoningEffort'), false);
  assert.equal(d.execution.reasoningEffortUsed, 'low');
  assert.equal(has(result, 'unknown-field'), false);
  assert.deepEqual(result.ready_node_ids, ['c']);
  for (const [name, content] of Object.entries(files)) {
    assert.equal(await readFile(path.join(root, 'nodes', name), 'utf8'), content);
  }
});

test('pending or legacy nodes do not require effective reasoning evidence', async (t) => {
  const root = await fixture(t, {
    'a.md': node('a', [], 'pending', 'reasoning_effort: medium\n'),
    'b.md': node('b', [], 'completed'),
  });
  const result = await inspectWorkflow(root);
  assert.equal(result.valid, true);
  assert.equal(has(result, 'unknown-reasoning-effort'), false);
  assert.deepEqual(result.ready_node_ids, ['a']);
});

test('malformed requested or effective reasoning effort suppresses all candidates', async (t) => {
  const root = await fixture(t, { 'b.md': node('b') });
  for (const value of ['""', '"   "', 'null', '42', '[]', '{}']) {
    for (const effective of [false, true]) {
      const content = effective
        ? node('a').replace('status: pending', `status: pending\n  reasoning_effort_used: ${value}`)
        : node('a', [], 'pending', `reasoning_effort: ${value}\n`);
      await writeFile(path.join(root, 'nodes/a.md'), content);
      const result = await inspectWorkflow(root);
      assert.equal(result.valid, false, `${effective}: ${value}`);
      assert.ok(has(result, 'field-type'));
      assert.deepEqual(result.ready_node_ids, []);
      assert.deepEqual(result.blocked_node_ids, []);
    }
  }
});

test('structural errors suppress all derived execution candidates', async (t) => {
  const cases = [
    ['duplicate YAML key', node('a').replace('id: a', 'id: a\nid: a'), 'yaml'],
    ['unsafe tag', node('a').replace('title: a', 'title: !custom a'), 'yaml'],
    ['bad filename', node('other'), 'filename-id'],
    ['unsafe id', node('../escape'), 'invalid-id'],
    ['missing dependency', node('a', ['absent']), 'missing-dependency'],
    ['self dependency', node('a', ['a']), 'self-dependency'],
    ['duplicate dependency', node('a', ['b', 'b']), 'duplicate-entry'],
    ['illegal status', node('a', [], 'blocked'), 'status'],
    ['bad skills', node('a', [], 'pending', 'skills: text\n'), 'field-type'],
    ['bad agent', node('a', [], 'pending', 'agent: text\n'), 'field-type'],
    ['empty model', node('a', [], 'pending', 'model: ""\n'), 'field-type'],
    ['duplicate section', node('a') + '\n# Goal\nAgain.', 'duplicate-section'],
    ['missing section', node('a').replace('# Prompt', '## Prompt'), 'missing-section'],
    ['empty completion', node('a').replace('Verify evidence.', ''), 'empty-section'],
    [
      'invalid calendar day',
      node('a').replace('status: pending', 'status: running\n  started_at: "2026-02-30T00:00:00Z"'),
      'timestamp',
    ],
    [
      'timestamp type',
      node('a').replace('status: pending', 'status: running\n  started_at: 123'),
      'timestamp',
    ],
  ];
  for (const [label, content, code] of cases) {
    await t.test(label, async (sub) => {
      const root = await fixture(sub, { 'a.md': content, 'b.md': node('b') });
      const result = await inspectWorkflow(root);
      assert.equal(result.valid, false);
      assert.ok(has(result, code), JSON.stringify(result.diagnostics));
      assert.deepEqual(result.ready_node_ids, []);
      assert.deepEqual(result.blocked_node_ids, []);
    });
  }
});

test('cycle detected even with a separate valid root', async (t) => {
  const root = await fixture(t, {
    'a.md': node('a', ['b']),
    'b.md': node('b', ['a']),
    'c.md': node('c'),
  });
  const result = await inspectWorkflow(root);
  assert.ok(has(result, 'cycle'));
  assert.deepEqual(result.ready_node_ids, []);
});

test('size and encoding errors are bounded structural failures', async (t) => {
  const root = await fixture(t, { 'a.md': 'x'.repeat(1024 * 1024 + 1) });
  assert.ok(has(await inspectWorkflow(root), 'size-limit'));
  await writeFile(path.join(root, 'nodes/a.md'), Buffer.from([0xff]));
  assert.ok(has(await inspectWorkflow(root), 'encoding'));
});

test('CLI separates validation, argument and read failures; executes no body commands', async (t) => {
  const root = await fixture(t, {
    'a.md': node('a').replace('Read the inputs.', 'Run node -e "process.exit(99)"'),
  });
  const invoke = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(invoke('inspect', root, '--json').status, 0);
  assert.equal(invoke('run', root).status, 2);
  assert.equal(invoke('inspect', root, '--unknown').status, 2);
  assert.equal(invoke('inspect', path.join(root, 'absent'), '--json').status, 2);
  await writeFile(path.join(root, 'workflow.md'), workflow.replace('ddflow/v1', 'unsupported/v0'));
  const invalid = invoke('inspect', root, '--json');
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).valid, false);
});

test('external nodes junction is rejected before scanning external files', async (t) => {
  const outside = await fixture(t, { 'a.md': node('a') });
  const root = await fixture(t);
  await rm(path.join(root, 'nodes'), { recursive: true });
  try {
    await symlink(
      path.join(outside, 'nodes'),
      path.join(root, 'nodes'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (err) {
    if (err.code === 'EPERM') {
      t.skip('Symlink privilege unavailable.');
      return;
    }
    throw err;
  }
  const result = await inspectWorkflow(root);
  assert.equal(result.valid, false);
  assert.ok(has(result, 'path-boundary'));
  assert.deepEqual(result.nodes, []);
});
