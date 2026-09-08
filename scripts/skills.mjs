import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillNames = ['ddflow-planner', 'ddflow-executor'];
export const referenceNames = ['workflow-schema.md', 'execution-protocol.md', 'planning-guide.md'];
const root = fileURLToPath(new URL('../', import.meta.url));

// Repository links stay readable; installed links resolve within the Skill directory.
export async function stageSkill(name, target) {
  if (!skillNames.includes(name)) {
    throw new Error('Unknown ddflow Skill: ' + name);
  }
  await mkdir(target);
  await mkdir(path.join(target, 'agents'));
  await cp(
    path.join(root, 'skills', name, 'agents/openai.yaml'),
    path.join(target, 'agents/openai.yaml'),
  );
  await cp(path.join(root, 'LICENSE'), path.join(target, 'LICENSE'));
  const entry = path.join(target, 'SKILL.md');
  const text = await readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
  await writeFile(entry, text.replaceAll('../protocol/', 'references/'));
  await mkdir(path.join(target, 'references'));
  for (const reference of referenceNames) {
    await cp(
      path.join(root, 'skills/protocol', reference),
      path.join(target, 'references', reference),
    );
  }
}
