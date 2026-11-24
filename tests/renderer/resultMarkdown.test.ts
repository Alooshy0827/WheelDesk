// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeResultMarkdown } from '../../src/renderer/workbench/ResultView';

describe('sanitizeResultMarkdown', () => {
  it('renders headings, lists, tables, and fenced code blocks with language classes', () => {
    const html = sanitizeResultMarkdown('# Title\n\n- **Bold** item\n\n```ts\nconst x = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code class="language-ts">const x = 1;\n</code>');
    expect(html).toContain('<table>');
  });

  it('strips scripts, remote images, and inline event handlers', () => {
    const html = sanitizeResultMarkdown('Hello <script>alert(1)</script><img src="https://evil.example/a.png" onerror="alert(2)">[link](javascript:alert(3))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });
});
