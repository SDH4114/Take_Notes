import { describe, expect, it, vi } from 'vitest';
import type { Book, Clip, Highlight, Project } from '@/src/core/types';

vi.mock('@/src/cite', () => ({
  formatBibliography: (sources: { title: string }[]) => sources.map((s) => `ref ${s.title}`),
}));

import {
  bookPrintDoc, buildPrintHtml, clipPrintDoc, highlightsPrintDoc, prepareHtml, projectPrintDoc,
} from '@/src/export/printdoc';

const source = { url: 'https://ex.com/p', title: 'Src <b>', authors: [], accessed: '2025-01-02T00:00:00Z' };
const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c', projectId: 'p', kind: 'page', title: 'Clip <1>', html: '<p>hi</p>', source, markdown: '', tags: [],
  order: 0, assetIds: [], createdAt: '', updatedAt: '', ...over,
});

describe('prepareHtml', () => {
  it('renders extractor math markers as $…$ code', () => {
    const out = prepareHtml('<p>x <span class="tn-math" data-tn-math="inline" data-tex="a^2">a^2</span></p><span class="tn-math" data-tn-math="display" data-tex="c=1">c=1</span>', 0);
    expect(out).toContain('<code class="tn-math">$a^2$</code>');
    expect(out).toContain('<code class="tn-math">$$c=1$$</code>');
  });
  it('sanitizes scripts, handlers and javascript: links', () => {
    const out = prepareHtml('<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>', 0);
    expect(out).not.toMatch(/script|onclick|javascript:/i);
    expect(out).toContain('<p>a</p>');
  });
  it('shifts headings down and clamps at h6', () => {
    expect(prepareHtml('<h1>A</h1><h5>B</h5>', 2)).toBe('<h3>A</h3><h6>B</h6>');
  });
  it('turns TeX-annotated math into monospace $…$ text', () => {
    const html = '<p>x <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow>'
      + '<annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html">x2</span></span> y</p>';
    const out = prepareHtml(html, 0);
    expect(out).toContain('<code class="tn-math">$x^2$</code>');
    expect(out).not.toContain('katex-html');
  });
  it('makes lazy images load eagerly', () => {
    expect(prepareHtml('<img src="https://ex.com/a.png" loading="lazy">', 0)).not.toContain('lazy');
  });
});

describe('print documents', () => {
  it('clip: one chapter, no bibliography, title from the clip', () => {
    const doc = clipPrintDoc(clip({ html: '<h1>Inner</h1>' }), 'en');
    expect(doc.title).toBe('Clip <1>');
    expect(doc.sections).toHaveLength(1);
    expect(doc.bibliography).toEqual([]);
    expect(buildPrintHtml(doc)).toContain('<h2>Inner</h2>');
  });
  it('project: sections group clips, bibliography at the end in the UI language', () => {
    const project: Project = { id: 'p', name: 'Курсовая', citationStyle: 'gost', createdAt: '', updatedAt: '' };
    const doc = projectPrintDoc(project, [
      clip({ id: '1', title: 'A', section: 'S1', order: 0 }),
      clip({ id: '2', title: 'B', section: 'S1', order: 1 }),
      clip({ id: '3', title: 'C', order: 2 }),
    ], 'ru');
    expect(doc.sections.map((s) => [s.title, s.level])).toEqual([['S1', 1], ['A', 2], ['B', 2], ['C', 1]]);
    expect(doc.bibliography).toEqual(['ref Src <b>']);
    const html = buildPrintHtml(doc);
    expect(html).toContain('Список литературы');
    expect(html.indexOf('Список литературы')).toBeGreaterThan(html.indexOf('>C<'));
  });
  it('book: chapters by level', () => {
    const book: Book = {
      id: 'b', title: 'Book', rootUrl: 'https://ex.com', source, createdAt: '2025-01-02T00:00:00Z',
      chapters: [
        { url: 'u1', title: 'One', level: 0, html: '<p>1</p>', markdown: '', assetIds: [] },
        { url: 'u2', title: 'Two', level: 3, html: '<p>2</p>', markdown: '', assetIds: [] },
      ],
    };
    expect(bookPrintDoc(book, 'en').sections.map((s) => [s.title, s.level])).toEqual([['One', 1], ['Two', 2]]);
  });
  it('highlights: quotes and notes are escaped HTML', () => {
    const h: Highlight = {
      id: 'h', url: 'https://ex.com/p', color: 'yellow', anchor: { exact: '', prefix: '', suffix: '' }, text: '<i>q</i>',
      note: 'n & m', source, projectId: null, createdAt: '', updatedAt: '',
    };
    const html = buildPrintHtml(highlightsPrintDoc([h], 'Notes', 'en'));
    expect(html).toContain('<blockquote>&lt;i&gt;q&lt;/i&gt;</blockquote>');
    expect(html).toContain('n &amp; m');
  });
});

describe('buildPrintHtml', () => {
  it('has title page, contents with anchors, page-broken chapters and escaped titles', () => {
    const html = buildPrintHtml(projectPrintDoc(
      { id: 'p', name: 'P', citationStyle: 'apa', createdAt: '', updatedAt: '' },
      [clip({ id: '1', order: 0 }), clip({ id: '2', title: 'Second', order: 1 })], 'en',
    ));
    expect(html).toContain('class="title-page"');
    expect(html).toContain('Contents');
    expect(html).toMatch(/<a href="#s1">Clip &lt;1&gt;<\/a>/);
    expect(html).toContain('<section class="chapter" id="s2"><h1>Second</h1>');
    expect(buildPrintHtml(clipPrintDoc(clip(), 'en'))).not.toContain('Contents');
    expect(html).toContain('<a href="https://ex.com/p">');
  });
  it('does not link non-http sources', () => {
    const html = buildPrintHtml(clipPrintDoc(clip({ source: { ...source, url: 'javascript:alert(1)' } }), 'en'));
    expect(html).not.toContain('javascript:');
  });
});

describe('own notes in PDF', () => {
  it('no source line and no bibliography for a note without URL', () => {
    const own = clip({ source: { ...source, url: '', title: '' } });
    expect(clipPrintDoc(own, 'en').source).toBeUndefined();
    const project: Project = { id: 'p', name: 'P', citationStyle: 'apa', createdAt: '', updatedAt: '' };
    expect(projectPrintDoc(project, [own], 'en').bibliography).toEqual([]);
    expect(buildPrintHtml(clipPrintDoc(own, 'en'))).not.toContain('class="meta">Source');
  });
});
