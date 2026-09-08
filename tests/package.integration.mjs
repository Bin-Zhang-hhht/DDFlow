import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { npm, packDistribution } from '../scripts/pack.mjs';

async function contents(root, prefix = '') {
  const result = {};
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, await contents(root, name));
    } else {
      result[name] = (await readFile(path.join(root, name))).toString('base64');
    }
  }
  return result;
}

test(
  'Skills bundle and separate CLI install and uninstall without changing workflows',
  { timeout: 180000 },
  async (t) => {
    const base = await realpath(tmpdir());
    const temporary = await mkdtemp(path.join(base, 'ddflow-package-'));
    t.after(async () => {
      assert.equal(path.dirname(await realpath(temporary)), base);
      assert.ok(path.basename(temporary).startsWith('ddflow-package-'));
      await rm(temporary, { recursive: true, force: true });
    });
    const release = await packDistribution(path.join(temporary, 'release'));
    assert.equal(release.files.length, 2);
    const paths = release.packed.files.map((file) => file.path);
    for (const required of [
      'LICENSE',
      'dist/cli.js',
      'dist/viewer/web/index.html',
      'dist/viewer/web/THIRD-PARTY-LICENSES.md',
    ]) {
      assert.ok(paths.includes(required), `Missing packed file: ${required}`);
    }
    assert.ok(paths.some((name) => name.startsWith('dist/viewer/web/assets/')));
    assert.ok(paths.every((name) => /^(?:package\.json|README\.md|LICENSE|dist\/)/.test(name)));
    assert.ok(paths.every((name) => !/\.(?:map|ts|tsx)$/.test(name)));
    const sums = await readFile(path.join(release.output, 'SHA256SUMS'), 'utf8');
    for (const filename of release.files) {
      const digest = createHash('sha256')
        .update(await readFile(path.join(release.output, filename)))
        .digest('hex');
      assert.ok(sums.includes(`${digest}  ${filename}\n`));
    }
    await assert.rejects(packDistribution(release.output), { code: 'EEXIST' });

    const workspace = path.join(temporary, 'user-workspace');
    const workflow = path.join(workspace, 'workflow');
    await mkdir(path.join(workflow, 'nodes'), { recursive: true });
    await writeFile(
      path.join(workflow, 'workflow.md'),
      '---\nschema: ddflow/v1\nname: package-test\n---\n# Goal\nVerify read-only installation.\n',
    );
    await writeFile(
      path.join(workflow, 'nodes', 'check.md'),
      '---\nid: check\ntitle: Check\ndepends_on: []\nexecution:\n  status: pending\n---\n' +
        '# Goal\nCheck.\n# Prompt\nRead inputs.\n# Inputs\n\n# Outputs\n\n' +
        '# Completion Criteria\nVerify evidence.\n# Result\n\n# Error\n',
    );
    await writeFile(path.join(workspace, 'user-output.txt'), 'Keep user artifacts.\n');
    const before = await contents(workspace);
    const skillRoot = path.join(temporary, 'host', '.agents', 'skills');
    await mkdir(skillRoot, { recursive: true });
    const archive = release.files.find((filename) => filename.startsWith('ddflow-skills-'));
    execFileSync('tar', ['-xzf', path.join(release.output, archive), '-C', skillRoot]);
    assert.deepEqual((await readdir(skillRoot)).sort(), ['ddflow-executor', 'ddflow-planner']);
    for (const name of ['ddflow-planner', 'ddflow-executor']) {
      const target = path.join(skillRoot, name);
      assert.deepEqual(await readFile(path.join(target, 'LICENSE')), await readFile('LICENSE'));

      const source = await readFile(path.resolve('skills', name, 'SKILL.md'), 'utf8');
      assert.equal(
        await readFile(path.join(target, 'SKILL.md'), 'utf8'),
        source.replaceAll('../protocol/', 'references/'),
      );
      assert.deepEqual(
        await readFile(path.join(target, 'agents/openai.yaml')),
        await readFile(path.resolve('skills', name, 'agents/openai.yaml')),
      );
      for (const ref of ['workflow-schema.md', 'planning-guide.md', 'execution-protocol.md']) {
        assert.deepEqual(
          await readFile(path.join(target, 'references', ref)),
          await readFile(path.resolve('skills/protocol', ref)),
        );
      }
      assert.equal(path.dirname(await realpath(target)), await realpath(skillRoot));
      await rm(target, { recursive: true });
    }
    assert.deepEqual(await readdir(skillRoot), []);

    const installation = path.join(temporary, 'cli-install');
    const install = (archive) =>
      npm(
        [
          'install',
          '--global',
          '--prefix',
          installation,
          '--omit=dev',
          '--ignore-scripts',
          archive,
        ],
        temporary,
      );
    const cliArchive = path.join(release.output, release.files[0]);
    install(cliArchive);
    const installed = path.join(
      installation,
      ...(process.platform === 'win32' ? [] : ['lib']),
      'node_modules',
      'ddflow',
    );
    const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
    assert.equal(manifest.private, true);
    assert.equal(manifest.scripts, undefined);
    assert.equal(manifest.devDependencies, undefined);
    assert.equal(manifest.license, 'MIT');
    assert.equal(manifest.version, JSON.parse(await readFile('package.json', 'utf8')).version);
    const shim = path.join(
      installation,
      ...(process.platform === 'win32' ? [] : ['bin']),
      process.platform === 'win32' ? 'ddflow.cmd' : 'ddflow',
    );
    const cli = path.join(installed, 'dist', 'cli.js');
    const windows = process.platform === 'win32';
    const inspected = JSON.parse(
      execFileSync(
        windows ? 'powershell.exe' : shim,
        windows
          ? [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              '& $env:DDFLOW_TEST_BIN inspect $env:DDFLOW_TEST_WORKFLOW --json; exit $LASTEXITCODE',
            ]
          : ['inspect', workflow, '--json'],
        {
          cwd: workspace,
          encoding: 'utf8',
          env: { ...process.env, DDFLOW_TEST_BIN: shim, DDFLOW_TEST_WORKFLOW: workflow },
        },
      ),
    );
    assert.equal(inspected.valid, true);
    assert.ok(inspected.nodes.length > 0);
    const { startViewer } = await import(
      pathToFileURL(path.join(installed, 'dist/viewer/server/server.js'))
    );
    const viewer = await startViewer(workflow);
    try {
      const state = await (await fetch(`${viewer.url}/api/workflow`)).json();
      assert.equal(state.documentStatus, 'valid');
      const html = await (await fetch(viewer.url)).text();
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)];
      assert.ok(assets.length > 0);
      for (const [, asset] of assets) {
        assert.equal((await fetch(`${viewer.url}${asset}`)).status, 200);
      }
      assert.equal((await fetch(`${viewer.url}/api/workflow`, { method: 'POST' })).status, 405);
    } finally {
      await viewer.close();
    }
    npm(
      ['uninstall', '--global', '--prefix', installation, '--ignore-scripts', 'ddflow'],
      temporary,
    );
    await assert.rejects(readFile(cli), { code: 'ENOENT' });
    assert.deepEqual(await contents(workspace), before);
  },
);
