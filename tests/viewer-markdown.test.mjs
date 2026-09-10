import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Viewer shows only provided assignments and keeps requests separate from evidence', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true } });
  try {
    const { NodeAssignment } = await server.ssrLoadModule('/src/viewer/web/NodeAssignment.tsx');
    const base = {
      id: 'clean',
      title: 'Clean data',
      file: 'clean.md',
      depends_on: [],
      metadata: {},
      sections: {},
      execution: { status: 'pending' },
    };
    const render = (node, compact = false) =>
      renderToStaticMarkup(createElement(NodeAssignment, { node, compact }));

    for (const compact of [false, true]) {
      assert.equal(render(base, compact), '');
      const agentOnly = render(
        { ...base, metadata: { agent: { recommended: 'data-cleaner', profile: 'local-profile' } } },
        compact,
      );
      assert.match(agentOnly, /子 Agent/);
      assert.match(agentOnly, /data-cleaner/);
      assert.match(agentOnly, /local-profile/);
      assert.doesNotMatch(agentOnly, /模型|思考强度|宿主默认|未知/);
      const modelOnly = render({ ...base, requestedModel: 'requested-model' }, compact);
      assert.match(modelOnly, /模型/);
      assert.doesNotMatch(modelOnly, /思考强度|子 Agent/);
      const effortOnly = render({ ...base, requestedReasoningEffort: 'high' }, compact);
      assert.match(effortOnly, /思考强度/);
      assert.doesNotMatch(effortOnly, /模型|子 Agent/);
      const actualOnly = render(
        { ...base, execution: { status: 'completed', modelUsed: 'observed-model' } },
        compact,
      );
      assert.match(actualOnly, /observed-model/);
      assert.match(actualOnly, /实际/);
      assert.doesNotMatch(actualOnly, /思考强度|宿主默认/);
    }
    const requestedOnly = render({ ...base, requestedModel: 'requested-model' });
    assert.match(requestedOnly, /<td>requested-model<\/td><td>—<\/td>/);
    const differentEvidence = render({
      ...base,
      requestedModel: 'requested-model',
      requestedReasoningEffort: 'high',
      execution: { status: 'failed', modelUsed: 'observed-model', reasoningEffortUsed: 'low' },
    });
    assert.match(differentEvidence, /<td>requested-model<\/td><td>observed-model<\/td>/);
    assert.match(differentEvidence, /<td>high<\/td><td>low<\/td>/);
  } finally {
    await server.close();
  }
});

test('Viewer renders Markdown sections while keeping embedded content inert', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true } });
  try {
    const { Sections } = await server.ssrLoadModule('/src/viewer/web/NodePanel.tsx');
    const html = renderToStaticMarkup(
      createElement(Sections, {
        sections: {
          Goal: '## Heading\n\n**Bold** and `inline`\n\n> Quote\n\n- item\n- [x] done\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```js\nconst n = 1;\n```',
          Result:
            '[Report](./output.csv) ![Chart](https://example.com/chart.png)\n\n<script>alert(1)</script>\n\n<img src="https://example.com/raw.png" onerror="alert(1)">\n\n[unsafe](javascript:alert%281%29)',
          Error: '',
        },
      }),
    );
    for (const pattern of [
      /<h2>Heading<\/h2>/,
      /<strong>Bold<\/strong>/,
      /<code>inline<\/code>/,
      /<blockquote>/,
      /<li>item<\/li>/,
      /<table>/,
      /<td>two<\/td>/,
      /<pre><code class="language-js">const n = 1;/,
      /<input[^>]*disabled=""[^>]*checked=""/,
      /<span title="\.\/output.csv">Report<\/span>/,
      /〔图片：Chart〕/,
      /&lt;script&gt;/,
      /（未填写）/,
    ]) {
      assert.match(html, pattern);
    }
    assert.doesNotMatch(html, /<(?:a|img|script|iframe)\b|<[^>]+\s(?:href|src)=|javascript:/i);
  } finally {
    await server.close();
  }
});
