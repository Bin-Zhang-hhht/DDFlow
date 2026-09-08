import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseDocument } from 'yaml';
import { stageSkill } from '../scripts/skills.mjs';

function yaml(text) {
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  assert.deepEqual(document.errors, [], 'Skill metadata must be valid YAML without duplicate keys');
  assert.deepEqual(document.warnings, [], 'Skill metadata must not use unknown YAML tags');
  return document.toJS({ maxAliasCount: 50 });
}
async function markdownFiles(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) {
      files.push(...(await markdownFiles(file)));
    } else if (item.name.endsWith('.md')) {
      files.push(file);
    }
  }
  return files;
}

for (const name of ['ddflow-planner', 'ddflow-executor']) {
  test(`${name} distribution works without the repository or sibling Skill`, async (t) => {
    const tempBase = await realpath(tmpdir());
    const temporary = await mkdtemp(path.join(tempBase, 'ddflow-skill-'));
    t.after(async () => {
      const actual = await realpath(temporary);
      assert.equal(
        path.dirname(actual),
        tempBase,
        'Cleanup must stay in the original temporary directory',
      );
      assert.ok(path.basename(actual).startsWith('ddflow-skill-'));
      await rm(actual, { recursive: true, force: true });
    });
    const isolated = path.join(temporary, name);
    await stageSkill(name, isolated);
    assert.deepEqual(await readdir(temporary), [name]);
    const main = await readFile(path.join(isolated, 'SKILL.md'), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(main);
    assert.ok(frontmatter, 'SKILL.md needs YAML frontmatter');
    const metadata = yaml(frontmatter[1]);
    assert.equal(metadata.name, name);
    assert.equal(metadata.license, 'MIT');
    assert.deepEqual(await readFile(path.join(isolated, 'LICENSE')), await readFile('LICENSE'));

    assert.equal(
      metadata.metadata.version,
      JSON.parse(await readFile('package.json', 'utf8')).version,
      'Skill and optional CLI distribution versions must match',
    );
    assert.ok(typeof metadata.description === 'string' && metadata.description.trim().length > 0);
    assert.equal(
      yaml(await readFile(path.join(isolated, 'agents/openai.yaml'), 'utf8')).policy
        .allow_implicit_invocation,
      false,
    );
    for (const file of await markdownFiles(isolated)) {
      const content = await readFile(file, 'utf8');
      // These distribution documents use simple inline Markdown file links.
      for (const match of content.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
        const destination = match[1];
        if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(destination)) {
          continue;
        }
        const resolved = await realpath(
          path.resolve(path.dirname(file), decodeURIComponent(destination.split('#')[0])),
        );
        const relative = path.relative(isolated, resolved);
        assert.ok(
          relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
          `Reference escapes isolated Skill: ${destination}`,
        );
        await readFile(resolved); // Existence alone does not prove the installed copy is readable.
      }
    }
    for (const reference of ['workflow-schema.md', 'execution-protocol.md', 'planning-guide.md']) {
      assert.deepEqual(
        await readFile(path.join(isolated, 'references', reference)),
        await readFile(path.resolve('skills', 'protocol', reference)),
        `Distribution reference differs from maintenance source: ${reference}`,
      );
    }
  });
}
