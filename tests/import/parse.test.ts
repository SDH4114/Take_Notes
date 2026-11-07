import { describe, expect, it } from 'vitest';
import {
  boardFromMarkdown, cleanPath, embedImages, extractMarks, highlightFromMarkdown, imageLookup, inlineTags, isIgnoredPath,
  isOurExportIndex, markPlainText, noteFromExportBody, noteFromMarkdown, parseFrontmatter, resolveRelative, sectionOf, stripCommonRoot,
} from '@/src/import/parse';
import { DEFAULT_SETTINGS, type Highlight } from '@/src/core/types';
import { boardToMarkdown, highlightFile } from '@/src/export/document';
import { importColumns } from '@/src/library/board';
import { renderMarkdown } from '@/src/ui/markdown';

const NOW = '2026-11-07T10:00:00.000Z';

describe('import: paths', () => {
  it('cleans paths', () => {
    expect(cleanPath('./a\\b//c.md')).toBe('a/b/c.md');
    expect(cleanPath('/x.md')).toBe('x.md');
  });
  it('strips a root folder shared by every path', () => {
    expect(stripCommonRoot(['Vault/a.md', 'Vault/b/c.md'])('Vault/b/c.md')).toBe('b/c.md');
    expect(stripCommonRoot(['Vault/a.md', 'Other/b.md'])('Vault/a.md')).toBe('Vault/a.md');
    expect(stripCommonRoot(['a.md', 'Vault/b.md'])('a.md')).toBe('a.md');
  });
  it('ignores hidden and app folders', () => {
    expect(isIgnoredPath('.obsidian/app.json')).toBe(true);
    expect(isIgnoredPath('notes/.trash/x.md')).toBe(true);
    expect(isIgnoredPath('__MACOSX/a.md')).toBe(true);
    expect(isIgnoredPath('notes/a.md')).toBe(false);
  });
  it('folder of a note', () => {
    expect(sectionOf('a.md')).toBe('');
    expect(sectionOf('Lectures/a.md')).toBe('Lectures');
    expect(sectionOf('Lectures/Week 1/a.md')).toBe('Lectures / Week 1');
  });
  it('resolves relative image paths', () => {
    expect(resolveRelative('dir/note.md', '../images/a.png')).toBe('images/a.png');
    expect(resolveRelative('note.md', './img/a%20b.png')).toBe('img/a b.png');
  });
});

describe('import: frontmatter', () => {
  it('reads scalars, inline lists and block lists', () => {
    const { data, body } = parseFrontmatter('---\ntitle: "Hi: there"\ntags: [a, "b c"]\nauthor:\n  - Ann\n  - Bob\nn: 3\n---\nBody');
    expect(data).toEqual({ title: 'Hi: there', tags: ['a', 'b c'], author: ['Ann', 'Bob'], n: '3' });
    expect(body).toBe('Body');
  });
  it('no frontmatter → whole text is body', () => {
    expect(parseFrontmatter('# T\n---\nx')).toEqual({ data: {}, body: '# T\n---\nx' });
  });
  it('unterminated frontmatter is just text', () => {
    expect(parseFrontmatter('---\ntitle: x\n').data).toEqual({});
  });
});

describe('import: note', () => {
  it('Obsidian note: title from file name, inline tags, folder', () => {
    const n = noteFromMarkdown('Bio/Cells.md', 'Text #biology and #exam/2026 but not #1 or `#code`.\n\n```\n#nope\n```\n', NOW);
    expect(n.title).toBe('Cells');
    expect(n.section).toBe('Bio');
    expect(n.tags).toEqual(['biology', 'exam/2026']);
    expect(n.source).toEqual({ url: '', title: '', authors: [], accessed: NOW });
  });
  it('title from H1, which is removed from the body', () => {
    const n = noteFromMarkdown('x.md', '\n# Real title\n\nBody\n', NOW);
    expect(n.title).toBe('Real title');
    expect(n.markdown).toBe('Body\n');
  });
  it('our own export round-trips its metadata', () => {
    const md = [
      '---', 'title: "Ownership: basics"', 'source: https://metanit.com/rust/1.htm', 'author:', '  - Ann',
      'published: 2024-05-01', 'accessed: 2026-10-01', 'site: METANIT', 'tags:', '  - takenotes', '  - rust', '---', '',
      '# Ownership: basics', '', 'Источник: [Ownership](https://metanit.com/rust/1.htm) (дата обращения 2026-10-01)', '', '## Part', 'Text', '',
    ].join('\n');
    const n = noteFromMarkdown('Rust/ownership-basics.md', md, NOW);
    expect(n.title).toBe('Ownership: basics');
    expect(n.tags).toEqual(['rust']);
    expect(n.markdown).toBe('## Part\nText\n');
    expect(n.source).toMatchObject({
      url: 'https://metanit.com/rust/1.htm', title: 'Ownership', authors: ['Ann'], siteName: 'METANIT',
      published: '2024-05-01T00:00:00.000Z', accessed: '2026-10-01T00:00:00.000Z',
    });
  });
  it('non-http source is dropped', () => {
    expect(noteFromMarkdown('a.md', '---\nsource: javascript:alert(1)\n---\nx', NOW).source.url).toBe('');
  });
  it('detects our export index', () => {
    expect(isOurExportIndex('index.md', '---\ntitle: P\ntags:\n  - takenotes\n---\n# P')).toBe(true);
    expect(isOurExportIndex('index.md', '# My index')).toBe(false);
    expect(isOurExportIndex('sub/index.md', '---\ntags: [takenotes]\n---')).toBe(false);
  });
  it('inline tags skip headings', () => {
    expect(inlineTags('# Heading\n## Sub #tag')).toEqual(['tag']);
  });
});

describe('import: images', () => {
  const lookup = imageLookup(['images/a.png', 'att/Pic 1.jpg', 'notes/x.md']);
  const url = (p: string) => (p === 'images/a.png' ? 'data:image/png;base64,AAA' : p === 'att/Pic 1.jpg' ? 'data:image/jpeg;base64,BBB' : null);

  it('turns relative and Obsidian embeds into reference images at the end', () => {
    const md = 'A ![x](../images/a.png) B ![[Pic 1.jpg|200]] C ![y](../images/a.png) ![r](https://e.com/r.png) ![[missing.png]] ![[Note]]';
    const out = embedImages('notes/n.md', md, lookup, url);
    expect(out).toBe('A ![x][img-1] B ![Pic 1][img-2] C ![y][img-1] ![r](https://e.com/r.png) ![[missing.png]] ![[Note]]\n\n'
      + '[img-1]: <data:image/png;base64,AAA>\n[img-2]: <data:image/jpeg;base64,BBB>\n');
  });
  it('leaves notes without local images unchanged', () => {
    expect(embedImages('n.md', 'plain', lookup, url)).toBe('plain');
  });
  it('rendered: reference images keep their data URL through the sanitizer', () => {
    const html = renderMarkdown(embedImages('notes/n.md', '![x](../images/a.png)', lookup, url));
    expect(html).toContain('<img src="data:image/png;base64,AAA" alt="x">');
  });
});

describe('import: highlight files of our export', () => {
  const h: Highlight = {
    id: 'h', url: 'https://e.com/a', color: '#60a5fa', anchor: { exact: 'x', prefix: '', suffix: '' },
    text: 'First line\nsecond line', note: 'Short one', body: '# Big\n\nLong *note*\n\n```\n# not a heading\n```',
    source: { url: 'https://e.com/a', title: 'Page A', authors: [], siteName: 'E', accessed: '2026-10-01T00:00:00.000Z' },
    projectId: null, createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '',
  };

  for (const lang of ['ru', 'en'] as const) {
    it(`reads highlightFile() back (${lang})`, () => {
      const got = highlightFromMarkdown(highlightFile(h, DEFAULT_SETTINGS, lang, 'osnovy/vladenie'), NOW)!;
      expect(got).toEqual({
        text: h.text, color: '#60a5fa', note: 'Short one', body: h.body,
        source: { url: 'https://e.com/a', title: 'Page A', authors: [], siteName: 'E', accessed: '2026-10-01T00:00:00.000Z' },
        createdAt: '2026-10-02T00:00:00.000Z', noteRef: 'osnovy/vladenie',
      });
    });
  }

  it('without frontmatter, wikilinks, source or notes', () => {
    const s = { ...DEFAULT_SETTINGS, obsidian: { frontmatter: false, wikilinks: false } };
    const own = { ...h, url: 'takenotes-note:c1', note: undefined, body: undefined, source: { url: '', title: '', authors: [], accessed: '' } };
    const md = highlightFile(own, s, 'ru', 'My note');
    expect(md).not.toContain('takenotes-note');
    expect(highlightFromMarkdown(md, NOW)).toEqual({
      text: h.text, source: { url: '', title: '', authors: [], accessed: NOW }, noteRef: 'My note',
    });
  });

  it('a bare quote is enough; no quote → null', () => {
    expect(highlightFromMarkdown('> Just this.\n', NOW)?.text).toBe('Just this.');
    expect(highlightFromMarkdown('# Title\n\nNo quote here.\n', NOW)).toBeNull();
  });
});

describe('import: ==marks==', () => {
  it('unwraps marks and returns their plain text', () => {
    const md = 'A ==first **bold** [link](https://x.y)== and ==[[Note|alias]]==.\nNext ==spans\ntwo lines== ok.';
    expect(extractMarks(md)).toEqual({
      markdown: 'A first **bold** [link](https://x.y) and [[Note|alias]].\nNext spans\ntwo lines ok.',
      marks: ['first bold link', 'alias', 'spans two lines'],
    });
  });

  it('ignores code, data URLs, "a == b" and marks across paragraphs', () => {
    const md = '`==code==` and\n\n```\n==fenced==\n```\n\nx == y and z == w\n\n==not\n\nacross==\n\n![i](data:image/png;base64,AA==) ==real==\n';
    const r = extractMarks(md);
    expect(r.marks).toEqual(['real']);
    expect(r.markdown).toBe(md.replace('==real==', 'real'));
  });

  it('take() decides which marks become highlights; the rest stay marked', () => {
    expect(extractMarks('==a b== ==c==', (t) => t === 'a b')).toEqual({ markdown: 'a b ==c==', marks: ['a b'] });
  });

  it('plain text keeps snake_case and lone asterisks', () => {
    expect(markPlainText('*em* snake_case a * b `code`')).toBe('em snake_case a * b code');
    expect(extractMarks('==E = mc^2==').marks).toEqual(['E = mc^2']);
    expect(extractMarks('==E = mc^2==').marks).toEqual(['E = mc^2']);
  });
});

describe('import: board.md', () => {
  it('reads boardToMarkdown() back, ignores Obsidian settings', () => {
    const clip = (id: string, title: string) => ({ id, title }) as Parameters<typeof boardToMarkdown>[2] extends ReadonlyMap<string, readonly (infer C)[]> ? C : never;
    const a = clip('a', 'Intro'), b = clip('b', 'Own|ership');
    const md = boardToMarkdown('Board: P', [{ id: 'todo', name: 'To do' }, { id: 'x', name: 'Later' }, { id: 'done', name: 'Done' }],
      new Map([['todo', [a]], ['done', [b]]]), DEFAULT_SETTINGS, (c) => (c.id === 'b' ? 'basics/own' : undefined));
    expect(boardFromMarkdown(`${md}\n%% kanban:settings\n## Not a column\n%%\n`)).toEqual({
      columns: [
        { name: 'To do', cards: [{ target: 'Intro', title: 'Intro' }] },
        { name: 'Later', cards: [] },
        { name: 'Done', cards: [{ target: 'basics/own', title: 'Own ership' }] },
      ],
    });
    expect(boardFromMarkdown('---\nkanban-plugin: basic\n---\n\n## To do\n\n- [x] Plain title\n')).toEqual({
      columns: [{ name: 'To do', cards: [{ title: 'Plain title' }] }],
    });
    expect(boardFromMarkdown('# Just a note\n')).toBeNull();
  });

  it('importColumns: reuse by name, append or replace', () => {
    let n = 0;
    const id = () => `c${++n}`;
    const base = [{ id: 'todo', name: 'To do' }, { id: 'done', name: 'Done', done: true }];
    expect(importColumns(base, ['done', 'New', 'New'], id, false)).toEqual({
      columns: [...base, { id: 'c1', name: 'New' }], ids: ['done', 'c1', 'c1'],
    });
    expect(importColumns(base, ['Later', 'Done'], id, true)).toEqual({
      columns: [{ id: 'c2', name: 'Later' }, { id: 'done', name: 'Done', done: true }], ids: ['c2', 'done'],
    });
  });
});

describe('import: note bodies of our export', () => {
  it('drops the appended quotes section only when every quote is a known highlight; undoes the heading shift', () => {
    const md = '## Part\n\nText.\n\n```\n## code\n```\n\n## Выделения\n\n> one\n> line\n\nnote\n\n> two\n';
    const known = (t: string) => ['one line', 'two'].includes(t);
    expect(noteFromExportBody(md, known)).toBe('# Part\n\nText.\n\n```\n## code\n```\n');
    expect(noteFromExportBody(md, (t) => t === 'two')).toContain('# Выделения');
  });
});
