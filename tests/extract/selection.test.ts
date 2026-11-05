import { afterEach, describe, expect, it } from 'vitest';
import { extractSelectionFrom, setupExtractContent } from '@/src/extract/content';
import { fixtureHtml } from './helpers';

const URL_ = 'https://en.wikipedia.org/wiki/Quadratic_equation';

function select(from: Node, to: Node): Selection {
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStartBefore(from);
  range.setEndAfter(to);
  sel.addRange(range);
  return sel;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('extractSelectionFrom', () => {
  it('returns null for a collapsed or whitespace-only selection', () => {
    document.body.innerHTML = '<p id="a">   </p>';
    expect(extractSelectionFrom(window.getSelection()!, document, URL_)).toBeNull();
    const a = document.getElementById('a')!;
    expect(extractSelectionFrom(select(a, a), document, URL_)).toBeNull();
  });

  it('converts a selected fragment: math, absolute urls, sanitized', () => {
    document.body.innerHTML =
      '<div id="c"><p id="p1">Formula <span class="mwe-math-element"><img class="mwe-math-fallback-image-inline" alt="{\\displaystyle a^{2}}" src="/m.svg"></span> and ' +
      '<a href="/wiki/X">link</a><img src="/i.png" alt="i" onerror="x()"><script>bad()</script></p><p id="p2">tail</p><p id="p3">not selected</p></div>';
    const r = extractSelectionFrom(select(document.getElementById('p1')!, document.getElementById('p2')!), document, URL_)!;
    expect(r.markdown).toContain('Formula $a^{2}$ and [link](https://en.wikipedia.org/wiki/X)');
    expect(r.markdown).toContain('![i](https://en.wikipedia.org/i.png)');
    expect(r.markdown).toContain('tail');
    expect(r.markdown).not.toContain('not selected');
    expect(r.html).not.toMatch(/<script|onerror/);
    expect(r.imageUrls).toEqual(['https://en.wikipedia.org/i.png']);
    expect(r.source.url).toBe(URL_);
  });

  it('keeps the code fence and language when the selection is inside a <pre>', () => {
    document.body.innerHTML = '<pre class="brush:rust;" id="pre">fn main() {}</pre>';
    const text = document.getElementById('pre')!.firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 7);
    sel.addRange(range);
    expect(extractSelectionFrom(sel, document, URL_)!.markdown).toBe('```rust\nmain\n```');
  });

  it('uses the page title as title', () => {
    document.body.innerHTML = '<p id="a">Some text</p>';
    document.title = 'Page T';
    const a = document.getElementById('a')!;
    expect(extractSelectionFrom(select(a, a), document, URL_)!.title).toBe('Page T');
  });
});

describe('setupExtractContent', () => {
  it('registers page and selection handlers', async () => {
    const h = setupExtractContent();
    expect(typeof h['content/extractPage']).toBe('function');
    expect(typeof h['content/extractSelection']).toBe('function');
    document.documentElement.innerHTML = fixtureHtml('extract-metanit.html');
    const r = await h['content/extractPage']!(undefined as never, {} as never);
    expect(r.markdown).toContain('```rust');
    expect(await h['content/extractSelection']!(undefined as never, {} as never)).toBeNull();
  });
});
