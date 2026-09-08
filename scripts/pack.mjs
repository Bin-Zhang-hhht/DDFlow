import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { skillNames, stageSkill } from './skills.mjs';
import { fileURLToPath } from 'node:url';

// Use npm's own pack implementation; no registry publication or host installation.
export function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  if (!cli || path.basename(cli) !== 'npm-cli.js') {
    throw new Error('Run this command through npm run (npm CLI is required).');
  }
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  });
}

export async function packDistribution(destination) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.private !== true || manifest.license !== 'MIT') {
    throw new Error('Local packaging requires private: true and MIT.');
  }
  const output = path.resolve(destination);
  // Refuse to overwrite or mix existing artifacts.
  await mkdir(output, { recursive: false });
  const base = await realpath(tmpdir());
  const temporary = await mkdtemp(path.join(base, 'ddflow-pack-'));
  try {
    const cliRoot = path.join(temporary, 'cli');
    await mkdir(cliRoot);
    await cp(path.join(root, 'dist'), path.join(cliRoot, 'dist'), { recursive: true });
    const cliManifest = { ...manifest };
    delete cliManifest.scripts;
    delete cliManifest.devDependencies;
    delete cliManifest.packageManager;
    await writeFile(
      path.join(cliRoot, 'package.json'),
      JSON.stringify(cliManifest, null, 2) + '\n',
    );
    await cp(path.join(root, 'LICENSE'), path.join(cliRoot, 'LICENSE'));
    await writeFile(
      path.join(cliRoot, 'README.md'),
      '# ddflow CLI\n\nVersion ' +
        manifest.version +
        '. Read-only tools for ddflow/v1 workflows. Licensed under MIT.\n\n' +
        'Requires Node.js ' +
        manifest.engines.node +
        '. npm installs runtime dependencies.\n\n' +
        '    ddflow inspect <workflow-dir> --json\n    ddflow view <workflow-dir>\n\n' +
        'View runs a local foreground server; Ctrl+C stops it. Neither command executes nodes or writes workflow files.\n' +
        'Planner and Executor are installed separately from the ddflow-skills archive.\n',
    );
    const [packed] = JSON.parse(
      npm(['pack', '--ignore-scripts', '--json', '--pack-destination', output], cliRoot),
    );
    const skillsRoot = path.join(temporary, 'skills');
    await mkdir(skillsRoot);
    for (const name of skillNames) {
      await stageSkill(name, path.join(skillsRoot, name));
    }
    const skillsArchive = 'ddflow-skills-' + manifest.version + '.tgz';
    execFileSync('tar', [
      '-czf',
      path.join(output, skillsArchive),
      '-C',
      skillsRoot,
      ...skillNames,
    ]);
    const files = [packed.filename, skillsArchive];
    const checksums = [];
    for (const name of files) {
      checksums.push(
        createHash('sha256')
          .update(await readFile(path.join(output, name)))
          .digest('hex') +
          '  ' +
          name,
      );
    }
    await writeFile(path.join(output, 'SHA256SUMS'), checksums.join('\n') + '\n');
    await writeFile(
      path.join(output, 'INSTALL.md'),
      '# ddflow installation\n\nVersion ' +
        manifest.version +
        '; protocol ddflow/v1; MIT license.\n\n' +
        'Extract ' +
        skillsArchive +
        ' into the host skills directory to install both Skills.\n' +
        'Codex: ~/.agents/skills (user) or .agents/skills (project).\n' +
        'ZCode: ~/.zcode/skills, then refresh Settings > Skills (native discovery not yet tested).\n' +
        'Both named directories must remain intact, including references, agents/openai.yaml and LICENSE.\n' +
        'If either Skill is already installed, stop execution and remove its complete installation before reinstalling both.\n' +
        'Invoke $ddflow-planner explicitly, then $ddflow-executor separately to execute.\n' +
        'ZCode explicit-only invocation relies on Skill instructions, not a native switch.\n\n' +
        'Install the matching CLI alongside both Skills by default. It requires Node.js ' +
        manifest.engines.node +
        ':\n\n' +
        '    npm install -g --omit=dev --ignore-scripts ./' +
        packed.filename +
        '\n' +
        '    ddflow --help\n    ddflow inspect <workflow-dir> --json\n    ddflow view <workflow-dir>\n\n' +
        'npm needs network access or cached runtime dependencies. Skills do not require Node.js or the CLI.\n' +
        'Verify archives against SHA256SUMS from a trusted source.\n' +
        'Uninstall CLI: npm uninstall -g --ignore-scripts ddflow.\n' +
        'Uninstall Skills: remove only the two installed Skill directories; keep user workflows and artifacts.\n',
    );
    return { output, files, packed };
  } finally {
    const actual = await realpath(temporary);
    assert.equal(
      path.dirname(actual),
      base,
      'Temporary cleanup must stay within its original parent.',
    );
    assert.ok(path.basename(actual).startsWith('ddflow-pack-'));
    await rm(actual, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    throw new Error('Usage: npm run pack:local -- <new-output-directory>');
  }
  const { output, files } = await packDistribution(process.argv[2]);
  console.log(JSON.stringify({ output, files }, null, 2));
}
