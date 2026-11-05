import { afterEach, describe, expect, it } from 'vitest';
import { pickToc, setupCrawlContent, findLinkContainer } from '@/src/crawl/content';

const PAGE = 'https://s.io/docs/a.html';

function mount(html: string): void {
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.querySelectorAll('[data-tn-picker]').forEach((n) => n.remove());
});

describe('findLinkContainer', () => {
  it('climbs from a link to the nearest ancestor with at least two links', () => {
    mount('<ul id="u"><li><a id="l1" href="/docs/a.html">A</a></li><li><a href="/docs/b.html">B</a></li></ul>');
    expect(findLinkContainer(document.getElementById('l1')!)?.id).toBe('u');
  });
  it('returns null when no ancestor has two links', () => {
    mount('<p id="p"><a href="/x">x</a></p>');
    expect(findLinkContainer(document.getElementById('p')!)).toBeNull();
  });
});

describe('pickToc', () => {
  it('click selects the hovered container and returns its links', async () => {
    mount('<div id="menu"><a id="l1" href="/docs/a.html">A</a><a href="/docs/b.html">B</a></div><p id="other">text</p>');
    const p = pickToc(document, PAGE);
    const l1 = document.getElementById('l1')!;
    l1.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }));
    expect(document.querySelector('[data-tn-picker]')).not.toBeNull();
    l1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    const entries = await p;
    expect(entries.map((e) => e.title)).toEqual(['A', 'B']);
    expect(entries[1]?.url).toBe('https://s.io/docs/b.html');
    expect(document.querySelector('[data-tn-picker]')).toBeNull();
  });

  it('Escape cancels with []', async () => {
    mount('<div><a href="/docs/a.html">A</a><a href="/docs/b.html">B</a></div>');
    const p = pickToc(document, PAGE);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toEqual([]);
    expect(document.querySelector('[data-tn-picker]')).toBeNull();
  });

  it('clicking something without a link container is ignored and does not resolve', async () => {
    mount('<p id="other">text</p><div id="m"><a href="/docs/a.html">A</a><a href="/docs/b.html">B</a></div>');
    const p = pickToc(document, PAGE);
    const other = document.getElementById('other')!;
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    document.getElementById('m')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    expect(await p).toHaveLength(2);
  });
});

describe('setupCrawlContent', () => {
  it('content/detectToc runs detectToc on the current document', () => {
    mount('<nav><ul><li><a href="/x/a.html">A</a></li><li><a href="/x/b.html">B</a></li></ul></nav>');
    const h = setupCrawlContent();
    expect(typeof h['content/detectToc']).toBe('function');
    expect(typeof h['content/pickToc']).toBe('function');
  });
});
