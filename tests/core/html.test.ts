import { describe, expect, it } from 'vitest';
import { parseHtml, setHtml } from '@/src/core/html';

describe('parseHtml', () => {
  it('round-trips markup like template.innerHTML (whitespace, head-like tags, table parts)', () => {
    const cases = [
      '  <p>a <b>b</b></p>\n<p>c</p>  ',
      '<style>p{}</style><p>x</p>',
      '<title>t</title><meta charset="utf-8"><p>y</p>',
      '<tr><td>1</td></tr>',
      'plain text &amp; more',
      '<p>unclosed <i>tag',
      '',
    ];
    for (const html of cases) {
      const ref = document.createElement('template');
      ref.innerHTML = html;
      expect(parseHtml(html).innerHTML).toBe(ref.innerHTML);
    }
  });

  it('keeps content after a stray </template>', () => {
    const out = parseHtml('<p>a</p></template><p>b</p>').innerHTML;
    expect(out).toContain('<p>a</p>');
    expect(out).toContain('<p>b</p>');
  });

  it('returns an inert template whose content can be queried and edited', () => {
    const tpl = parseHtml('<h2>x</h2><img src="https://ex.test/i.png">');
    expect(tpl.content.querySelector('h2')?.textContent).toBe('x');
    tpl.content.querySelector('img')!.remove();
    expect(tpl.innerHTML).toBe('<h2>x</h2>');
    expect(tpl.ownerDocument).not.toBe(document);
  });
});

describe('setHtml', () => {
  it('replaces the children of an element in its own document', () => {
    const el = document.createElement('div');
    el.append('old');
    setHtml(el, '<p>new</p> tail');
    expect(el.innerHTML).toBe('<p>new</p> tail');
    expect(el.firstChild!.ownerDocument).toBe(document);
  });

  it('creates SVG icons in the SVG namespace', () => {
    const btn = document.createElement('button');
    setHtml(btn, '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>');
    expect(btn.firstElementChild!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(btn.querySelector('path')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });
});
