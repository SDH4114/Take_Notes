import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { Clip, Highlight, Project } from '@/src/core/types';
import { DEFAULT_SETTINGS } from '@/src/core/types';
import { flattenRgba, prepareForPdf, printDocToPdf } from '@/src/export/pdfgen';
import { buildProjectPdfZip } from '@/src/export/pdfzip';

const noFetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;

describe('flattenRgba', () => {
  it('blends over white; rejects garbage', () => {
    expect(flattenRgba('background-color: rgba(250,204,21, .45)')).toBe('#fde896');
    expect(flattenRgba('rgb(0, 0, 0)')).toBe('#000000');
    expect(flattenRgba('url(x)')).toBeNull();
  });
});

describe('prepareForPdf', () => {
  it('turns marks/quotes/inline code into styled spans/divs and drops images it cannot embed', async () => {
    const out = await prepareForPdf('<p><mark style="background-color: rgba(250,204,21, .45)">hi</mark> <code>x</code></p>'
      + '<blockquote>q</blockquote><pre><code>keep</code></pre><img src="https://a.test/i.webp" alt="Pic"><img src="javascript:1">', noFetch);
    expect(out).toContain('<span style="background-color: #fde896">hi</span>');
    expect(out).toContain('<span style="background-color: #f0f0f2">x</span>');
    expect(out).toContain('<div style="margin-left: 14px; color: #333333; font-style: italic">q</div>');
    expect(out).toContain('<pre><code>keep</code></pre>');
    expect(out).toContain('[Pic]');
    expect(out).not.toContain('<img');
  });
  it('inlines PNG/JPEG images as data URLs', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const fetchFn = (async () => new Response(png, { headers: { 'content-type': 'image/png' } })) as unknown as typeof fetch;
    expect(await prepareForPdf('<img src="https://a.test/i.png">', fetchFn)).toContain('src="data:image/png;base64,iVBORw=="');
  });
});

const now = '2026-01-01T00:00:00Z';
const src = (url: string) => ({ url, title: 'Src', authors: [], accessed: now });
const clip = (id: string, title: string, order: number, section?: string): Clip => ({
  id, projectId: 'p', kind: 'page', title, html: `<h1>${title}</h1><p>Привет, мир: текст заметки ${id}.</p>`, markdown: '', tags: [],
  order, assetIds: [], section, source: src(`https://ex.test/${id}`), createdAt: now, updatedAt: now,
});

describe('PDF generation (pdfmake)', () => {
  it('renders a real PDF with Cyrillic text', async () => {
    const blob = await printDocToPdf({
      title: 'Заметка', date: '2026-01-01', lang: 'ru', bibliography: ['Автор. Книга. 2020.'],
      sections: [{ title: 'Заметка', level: 1, html: '<p>Привет, <b>мир</b></p><ul><li>один</li></ul><table><tr><th>a</th></tr><tr><td>b</td></tr></table>' }],
    }, noFetch);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(1000);
  }, 30_000);

  it('whole project zip: index, notes in folders, one PDF per highlight, board', async () => {
    const project: Project = { id: 'p', name: 'Курс', citationStyle: 'gost', createdAt: now, updatedAt: now };
    const notes = [clip('a', 'Введение', 0), clip('b', 'Глава', 1, 'Часть 1')];
    const hl: Highlight = {
      id: 'h', url: 'https://ex.test/a', color: '#facc15', anchor: { exact: 'текст заметки', prefix: '', suffix: '' }, text: 'текст заметки',
      note: 'коротко', body: '# Длинная\n\nмысль', source: src('https://ex.test/a'), projectId: 'p', createdAt: now, updatedAt: now,
    };
    const board = { columns: [{ id: 'todo', name: 'Сделать' }, { id: 'done', name: 'Готово', done: true }], cards: new Map([['todo', notes], ['done', []]]) };
    let progress = 0;
    const a = await buildProjectPdfZip(project, notes, DEFAULT_SETTINGS, { highlights: [hl], board, fetchFn: noFetch, lang: 'ru', onProgress: (d) => { progress = d; } });
    const files = unzipSync(new Uint8Array(await a.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'Курс/board.pdf', 'Курс/highlights/001 - текст заметки.pdf', 'Курс/index.pdf', 'Курс/Введение.pdf', 'Курс/Часть 1/Глава.pdf',
    ].sort());
    for (const f of Object.values(files)) expect(strFromU8(f.slice(0, 5))).toBe('%PDF-');
    expect(progress).toBe(5);
    expect(a.filename).toBe('Курс.zip');
  }, 60_000);
});
