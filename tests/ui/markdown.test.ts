import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/src/ui/markdown';

describe('renderMarkdown', () => {
  it('renders GFM, ==mark== and math', () => {
    const html = renderMarkdown('# T\n\n**b** *i* ==hl== and $a^2$ costs $5 and $10\n\n$$\nc=1\n$$\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<em>i</em>');
    expect(html).toContain('<mark>hl</mark>');
    expect(html).toContain('<span class="math">$a^2$</span>');
    expect(html).toContain('costs $5 and $10');
    expect(html).toContain('<p class="math math-display">$$c=1$$</p>');
    expect(html).toContain('<table>');
  });
  it('sanitizes raw HTML and opens links in new tab', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>[l](https://a.b) [j](javascript:alert(1))');
    expect(html).not.toMatch(/onerror|<script|javascript:/);
    expect(html).toContain('<a target="_blank" rel="noopener noreferrer" href="https://a.b">l</a>');
  });
});
