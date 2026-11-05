import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '@/src/markdown';

const base = 'https://example.com/docs/page.html';

describe('htmlToMarkdown', () => {
  it('uses atx headings and strikethrough', () => {
    expect(htmlToMarkdown('<h2>Title</h2><p>a <del>b</del></p>', base)).toBe('## Title\n\na ~~b~~');
  });

  it('renders fenced code with language from brush/lang/highlight classes', () => {
    const md = htmlToMarkdown(
      '<pre class="brush:rust;">fn main() {}\n</pre>' +
        '<div class="highlight highlight-source-python"><pre>print(1)</pre></div>' +
        '<pre><code class="lang-cpp">int x;</code></pre>' +
        '<pre><code class="language-js">let a;</code></pre>',
      base,
    );
    expect(md).toContain('```rust\nfn main() {}\n```');
    expect(md).toContain('```python\nprint(1)\n```');
    expect(md).toContain('```cpp\nint x;\n```');
    expect(md).toContain('```js\nlet a;\n```');
  });

  it('keeps code content literal (no escaping, br becomes newline)', () => {
    const md = htmlToMarkdown('<pre>a_b *c*<br>x &lt; y</pre>', base);
    expect(md).toBe('```\na_b *c*\nx < y\n```');
  });

  it('uses a longer fence when code contains backticks fences', () => {
    const md = htmlToMarkdown('<pre>```\nx\n```</pre>', base);
    expect(md).toBe('````\n```\nx\n```\n````');
  });

  it('converts math markers without escaping TeX', () => {
    const md = htmlToMarkdown(
      '<p>Let <span data-tn-math="inline" data-tex="a_1^{2}*b">a_1^{2}*b</span> be.</p>' +
        '<p><span data-tn-math="display" data-tex="x = \\frac{1}{2}">x</span></p>',
      base,
    );
    expect(md).toContain('Let $a_1^{2}*b$ be.');
    expect(md).toContain('$$\nx = \\frac{1}{2}\n$$');
  });

  it('makes images and links absolute', () => {
    const md = htmlToMarkdown('<p><img src="/a.png" alt="Pic"> <a href="next.html">next</a></p>', base);
    expect(md).toContain('![Pic](https://example.com/a.png)');
    expect(md).toContain('[next](https://example.com/docs/next.html)');
  });

  it('escapes parentheses in link urls', () => {
    const md = htmlToMarkdown('<a href="/wiki/Foo_(bar)">x</a>', base);
    expect(md).toBe('[x](https://example.com/wiki/Foo_%28bar%29)');
  });

  it('strips empty links and same-page anchors, keeps their text', () => {
    expect(htmlToMarkdown('<p>a<a href="/x"></a>b <a href="#n1">[1]</a></p>', base)).toBe('ab \\[1\\]');
  });

  it('keeps links that wrap only an image', () => {
    const md = htmlToMarkdown('<a href="/big.png"><img src="/s.png" alt="s"></a>', base);
    expect(md).toBe('[![s](https://example.com/s.png)](https://example.com/big.png)');
  });

  it('converts simple tables to GFM', () => {
    const md = htmlToMarkdown(
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
      base,
    );
    expect(md).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('keeps a simple html table for rowspan/colspan', () => {
    const md = htmlToMarkdown(
      '<table class="w"><tbody><tr><th rowspan="2">A</th><th>B</th></tr><tr><td>1</td></tr></tbody></table>',
      base,
    );
    expect(md).toContain('<table>');
    expect(md).toContain('rowspan="2"');
    expect(md).not.toContain('class=');
    expect(md).not.toContain('---');
  });

  it('keeps html table when cells hold nested blocks or no header row', () => {
    expect(htmlToMarkdown('<table><tr><th>A</th></tr><tr><td><ul><li>x</li></ul></td></tr></table>', base)).toContain('<table>');
    expect(htmlToMarkdown('<table><tr><td>A</td></tr></table>', base)).toContain('<table>');
  });

  it('collapses 3+ blank lines outside code', () => {
    const md = htmlToMarkdown('<p>a</p><br><br><br><p>b</p><pre>x\n\n\n\ny</pre>', base);
    expect(md).not.toMatch(/a\n{3,}b/);
    expect(md).toContain('x\n\n\n\ny');
  });
});
