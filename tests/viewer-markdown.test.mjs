import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

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
