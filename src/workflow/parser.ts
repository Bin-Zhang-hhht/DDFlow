import { parseDocument } from 'yaml';
import type { Diagnostic, Document, Node, Status } from './types.js';

export const isMapping = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(
      value,
    );
  if (!match) {
    return false;
  }
  const [, year, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = match;
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= days[m - 1] &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60 &&
    Number(offsetHour) < 24 &&
    Number(offsetMinute) < 60
  );
}
const standard = ['Goal', 'Prompt', 'Inputs', 'Outputs', 'Completion Criteria', 'Result', 'Error'];

export function parseMarkdown(
  file: string,
  raw: string,
  diagnostics: Diagnostic[],
): Document | null {
  const issue = (code: string, message: string) =>
    diagnostics.push({ severity: 'error', code, file, message });
  const lines = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const end = lines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line));
  if (!/^---\s*$/.test(lines[0]) || end < 0) {
    issue('frontmatter', 'Expected opening and closing YAML frontmatter delimiters.');
    return null;
  }
  let metadata: unknown;
  try {
    const doc = parseDocument(lines.slice(1, end).join('\n'), {
      schema: 'core',
      version: '1.2',
      uniqueKeys: true,
      stringKeys: true,
      resolveKnownTags: false,
      prettyErrors: false,
    });
    // Unknown/custom tags are never constructors or executable instructions.
    for (const err of [...doc.errors, ...doc.warnings]) {
      issue('yaml', err.message);
    }
    if (doc.errors.length || doc.warnings.length) {
      return null;
    }
    metadata = doc.toJS({ maxAliasCount: 50 });
    // Cyclic aliases cannot be represented by the JSON read model.
    JSON.stringify(metadata);
  } catch (error) {
    issue('yaml', error instanceof Error ? error.message : 'YAML conversion failed.');
    return null;
  }
  if (!isMapping(metadata)) {
    issue('frontmatter', 'YAML frontmatter must be a mapping.');
    return null;
  }
  const sections: Record<string, string> = Object.create(null);
  let active: string | undefined;
  let content: string[] = [];
  let fence: { char: string; length: number } | undefined;
  const flush = () => {
    if (active !== undefined) {
      sections[active] = content.join('\n');
    }
  };
  for (const line of lines.slice(end + 1)) {
    if (fence) {
      content.push(line);
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && (open[1][0] !== '`' || !open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length };
      content.push(line);
      continue;
    }
    const heading = /^ {0,3}#(?:[ \t]+(.*?)|$)$/.exec(line);
    if (heading) {
      flush();
      active = (heading[1] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
      if (Object.hasOwn(sections, active)) {
        issue('duplicate-section', `Duplicate H1 section: ${active}`);
      }
      content = [];
    } else {
      content.push(line);
    }
  }
  flush();
  return { file, metadata, sections };
}

export function validateDocument(
  doc: Document,
  kind: 'workflow' | 'node',
  diagnostics: Diagnostic[],
): Node | null {
  const { file, metadata: data, sections } = doc;
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const issue = (code: string, message: string, severity: Diagnostic['severity'] = 'error') =>
    diagnostics.push({ severity, code, file, message });
  const unknown = (object: Record<string, unknown>, allowed: string[], prefix = '') => {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) {
        issue(
          'unknown-field',
          `Unknown field retained without execution semantics: ${prefix}${key}`,
          'warning',
        );
      }
    }
  };
  const string = (object: Record<string, unknown>, key: string, required: boolean, prefix = '') => {
    if ((required || Object.hasOwn(object, key)) && !nonempty(object[key])) {
      issue('field-type', `${prefix}${key} must be a non-empty string.`);
    }
  };
  const requiredSections = kind === 'node' ? standard : ['Goal'];
  for (const section of requiredSections) {
    if (!Object.hasOwn(sections, section)) {
      issue('missing-section', `Missing H1 section: ${section}`);
    } else if (
      ['Goal', 'Prompt', 'Completion Criteria'].includes(section) &&
      !sections[section].trim()
    ) {
      issue('empty-section', `${section} must not be empty.`);
    }
  }
  if (kind === 'workflow') {
    if (data.schema !== 'ddflow/v1') {
      issue('schema', 'schema must be ddflow/v1.');
    }
    string(data, 'name', true);
    unknown(data, ['schema', 'name']);
    return null;
  }
  unknown(data, [
    'id',
    'title',
    'depends_on',
    'model',
    'reasoning_effort',
    'agent',
    'skills',
    'execution',
  ]);
  string(data, 'id', true);
  string(data, 'title', true);
  string(data, 'model', false);
  string(data, 'reasoning_effort', false);
  if (typeof data.id === 'string') {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(data.id)) {
      issue('invalid-id', 'id must be a safe filename stem.');
    }
    if (data.id !== file.split('/').at(-1)?.slice(0, -3)) {
      issue('filename-id', 'id must match the filename stem.');
    }
  }
  for (const key of ['depends_on', 'skills']) {
    if (key === 'skills' && !Object.hasOwn(data, key)) {
      continue;
    }
    const value = data[key];
    if (!Array.isArray(value) || value.some((item) => !nonempty(item))) {
      issue('field-type', `${key} must be an array of non-empty strings.`);
    } else if (new Set(value).size !== value.length) {
      issue('duplicate-entry', `${key} must not contain duplicates.`);
    }
  }
  if (Object.hasOwn(data, 'agent')) {
    if (!isMapping(data.agent)) {
      issue('field-type', 'agent must be a mapping.');
    } else {
      unknown(data.agent, ['recommended', 'profile'], 'agent.');
      string(data.agent, 'recommended', false, 'agent.');
      string(data.agent, 'profile', false, 'agent.');
    }
  }
  const execution = data.execution;
  if (!isMapping(execution)) {
    issue('field-type', 'execution must be a mapping.');
  } else {
    unknown(
      execution,
      ['status', 'started_at', 'updated_at', 'finished_at', 'model_used', 'reasoning_effort_used'],
      'execution.',
    );
    if (!['pending', 'running', 'completed', 'failed'].includes(execution.status as string)) {
      issue('status', 'execution.status must be pending, running, completed or failed.');
    }
    string(execution, 'model_used', false, 'execution.');
    string(execution, 'reasoning_effort_used', false, 'execution.');
    for (const key of ['started_at', 'updated_at', 'finished_at']) {
      if (!Object.hasOwn(execution, key)) {
        continue;
      }
      const value = execution[key];
      if (!isTimestamp(value)) {
        issue('timestamp', `execution.${key} must be RFC 3339 text with a timezone.`);
      }
    }
    const status = execution.status;
    if (status === 'running' && !execution.started_at) {
      issue('missing-fact', 'running node has no started_at.', 'warning');
    }
    if (status === 'completed' || status === 'failed') {
      if (!execution.finished_at) {
        issue('missing-fact', 'Terminal node has no finished_at.', 'warning');
      }
      const section = status === 'completed' ? 'Result' : 'Error';
      if (!sections[section]?.trim()) {
        issue('missing-evidence', `${status} node has an empty ${section}.`, 'warning');
      }
    }
    if (status !== 'pending' && !execution.model_used) {
      issue(
        'unknown-model',
        'Actual worker model is unknown; the requested model is not evidence.',
        'warning',
      );
    }
    if (
      status !== 'pending' &&
      nonempty(data.reasoning_effort) &&
      !execution.reasoning_effort_used
    ) {
      issue(
        'unknown-reasoning-effort',
        'Effective worker reasoning effort is unknown; the requested setting is not evidence.',
        'warning',
      );
    }
  }
  for (const key of ['Inputs', 'Outputs']) {
    if (Object.hasOwn(sections, key) && !sections[key].trim()) {
      issue('empty-io', `${key} is empty.`, 'warning');
    }
  }
  if (diagnostics.filter((d) => d.severity === 'error').length > errorCount) {
    return null;
  }
  return {
    ...doc,
    id: data.id as string,
    title: data.title as string,
    depends_on: data.depends_on as string[],
    ...(data.model === undefined ? {} : { requestedModel: data.model as string }),
    ...(data.reasoning_effort === undefined
      ? {}
      : { requestedReasoningEffort: data.reasoning_effort as string }),
    execution: {
      status: (execution as Record<string, unknown>).status as Status,
      ...((execution as Record<string, unknown>).model_used === undefined
        ? {}
        : { modelUsed: (execution as Record<string, unknown>).model_used as string }),
      ...((execution as Record<string, unknown>).reasoning_effort_used === undefined
        ? {}
        : {
            reasoningEffortUsed: (execution as Record<string, unknown>)
              .reasoning_effort_used as string,
          }),
    },
  };
}
