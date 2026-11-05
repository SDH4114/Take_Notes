import { describe, expect, it } from 'vitest';
import { extractArticle } from '@/src/extract/article';
import { fixtureDoc } from './helpers';

const WIKI = 'https://en.wikipedia.org/wiki/Quadratic_equation';
const METANIT = 'https://metanit.com/rust/tutorial/1.3.php';

describe('extractArticle: wikipedia-like page', () => {
  const doc = fixtureDoc('extract-wikipedia.html');
  const before = doc.documentElement.outerHTML;
  const r = extractArticle(doc, WIKI);

  it('does not mutate the input document', () => {
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it('keeps the body and drops navigation and footer', () => {
    expect(r.markdown).toContain('quadratic equation');
    expect(r.markdown).toContain('## Solving');
    expect(r.markdown).not.toContain('Random article');
    expect(r.markdown).not.toContain('cookies and privacy');
    expect(r.title).toContain('Quadratic equation');
    expect(r.source.url).toBe(WIKI);
  });

  it('turns math into $...$ and $$...$$ with the displaystyle wrapper stripped', () => {
    expect(r.markdown).toContain('$ax^{2}+bx+c=0$');
    expect(r.markdown).toContain('$$\nx={\\frac {-b\\pm {\\sqrt {b^{2}-4ac}}}{2a}}\n$$');
    expect(r.markdown).toContain('$\\Delta =b^{2}-4ac$'); // from fallback img alt only
    expect(r.markdown).not.toContain('displaystyle');
    expect(r.html).not.toContain('mwe-math-fallback-image');
  });

  it('removes edit links but keeps footnote refs as text', () => {
    expect(r.markdown).not.toMatch(/\\?\[edit\\?\]/);
    expect(r.markdown).not.toContain('action=edit');
    expect(r.markdown).toContain('\\[1\\]');
    expect(r.markdown).not.toContain('#cite_note-1');
  });

  it('converts the simple table to GFM and the rowspan table to html', () => {
    expect(r.markdown).toContain('| Discriminant | Roots |');
    expect(r.markdown).toContain('rowspan="2"');
  });

  it('makes links and images absolute', () => {
    expect(r.markdown).toContain('(https://en.wikipedia.org/wiki/Quadratic_function)');
    expect(r.markdown).toContain('(https://en.wikipedia.org/wiki/Foo_%28bar%29)');
    expect(r.markdown).toContain('![Plot of a parabola](https://upload.wikimedia.org/plot.png)');
    expect(r.html).toContain('href="https://en.wikipedia.org/wiki/Quadratic_function"');
    expect(r.html).toContain('https://upload.wikimedia.org/plot-2x.png 2x');
  });

  it('uses data-src for lazy images and drops placeholder-only images', () => {
    expect(r.markdown).toContain('![Lazy picture](https://en.wikipedia.org/lazy/real.jpg)');
    expect(r.markdown).not.toContain('placeholder only');
    expect(r.html).not.toContain('data:image/gif');
  });

  it('returns unique absolute http(s) image urls', () => {
    expect(r.imageUrls).toContain('https://upload.wikimedia.org/plot.png');
    expect(r.imageUrls).toContain('https://en.wikipedia.org/lazy/real.jpg');
    expect(new Set(r.imageUrls).size).toBe(r.imageUrls.length);
    expect(r.imageUrls.every((u) => /^https?:\/\//.test(u))).toBe(true);
  });

  it('sanitizes scripts, handlers and iframes', () => {
    expect(r.html).not.toMatch(/<script|<iframe|<style|onclick/i);
    expect(r.markdown).not.toContain('alert(1)');
    expect(r.markdown).not.toContain('evil.example');
  });
});

describe('extractArticle: metanit-like page', () => {
  const r = extractArticle(fixtureDoc('extract-metanit.html'), METANIT);

  it('keeps the article and drops the side menu', () => {
    expect(r.title).toContain('Rust');
    expect(r.markdown).toContain('Определим простейшую программу');
    expect(r.markdown).not.toContain('Типы данных');
    expect(r.markdown).not.toContain('Copyright metanit');
  });

  it('keeps code fences with languages', () => {
    expect(r.markdown).toContain('```rust\nfn main() {\n    println!("Hello <World>");\n}\n```');
    expect(r.markdown).toContain('```python\nprint("hi")\nx = 1\n```');
    expect(r.markdown).toContain('```cpp\nint main() { return 0; }\n```');
  });

  it('resolves relative links against the page url', () => {
    expect(r.markdown).toContain('[следующую главу](https://metanit.com/rust/tutorial/2.1.php)');
    expect(r.imageUrls).toEqual(['https://metanit.com/imgs/rust.png']);
  });
});

describe('extractArticle: fallback', () => {
  it('falls back to <main> when Readability cannot find an article', () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>T</title></head><body><nav>menu</nav><main><h2>Hi</h2><p>Tiny.</p></main></body></html>',
      'text/html',
    );
    const r = extractArticle(doc, 'https://x.test/a');
    expect(r.markdown).toContain('Tiny.');
    expect(r.markdown).not.toContain('menu');
  });

  it('handles an empty document', () => {
    const doc = new DOMParser().parseFromString('<html><body></body></html>', 'text/html');
    const r = extractArticle(doc, 'https://x.test/a');
    expect(r.markdown).toBe('');
    expect(r.imageUrls).toEqual([]);
  });
  it('does not keep TakeNotes highlight marks in the extracted html', () => {
    const doc = new DOMParser().parseFromString('<html><head><title>T</title></head><body><article><h1>T</h1><p>' + 'Lorem ipsum dolor sit amet. '.repeat(40) + '<mark class="tn-hl tn-hl-yellow" data-tn-id="x">marked</mark> text</p></article></body></html>', 'text/html');
    const r = extractArticle(doc, 'https://x.test/a');
    expect(r.html).not.toContain('tn-hl');
    expect(r.html).toContain('marked text');
  });
});
