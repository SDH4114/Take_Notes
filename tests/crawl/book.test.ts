import { describe, expect, it } from 'vitest';
import type { Book } from '@/src/core/types';
import { bookToMarkdown, defaultBookTitle } from '@/src/crawl/book';

const book = (chapters: Book['chapters']): Book => ({
  id: 'b1',
  title: 'Rust — metanit.com',
  rootUrl: 'https://metanit.com/rust/',
  source: { url: 'https://metanit.com/rust/', title: 'Rust', authors: [], accessed: '2026-03-05T10:00:00.000Z' },
  chapters,
  createdAt: '2026-03-05T10:00:00.000Z',
});
const ch = (title: string, level: number, markdown: string, url = `https://metanit.com/rust/${title}.php`) =>
  ({ url, title, level, html: '', markdown, assetIds: [] });

describe('defaultBookTitle', () => {
  it('uses the section name and host', () => {
    expect(defaultBookTitle('https://metanit.com/rust/tutorial/1.1.php')).toBe('Rust — metanit.com');
    expect(defaultBookTitle('https://doc.rust-lang.org/book/ch01.html')).toBe('Book — doc.rust-lang.org');
  });
  it('falls back to the host for a root page', () => {
    expect(defaultBookTitle('https://acme.dev/')).toBe('acme.dev');
  });
});

describe('bookToMarkdown', () => {
  it('has title, source line and a linked table of contents', () => {
    const md = bookToMarkdown(book([ch('A', 0, 'text a'), ch('B', 1, 'text b')]), 'en');
    expect(md.startsWith('# Rust — metanit.com\n')).toBe(true);
    expect(md).toContain('Source: https://metanit.com/rust/');
    expect(md).toContain('2026-03-05');
    expect(md).toContain('## Contents');
    expect(md).toContain('- [A](#chapter-1)');
    expect(md).toContain('  - [B](#chapter-2)');
    expect(md).toContain('<a id="chapter-1"></a>\n\n## A');
    expect(md).toContain('<a id="chapter-2"></a>\n\n### B');
  });

  it('shifts headings inside chapters under the chapter heading', () => {
    const md = bookToMarkdown(book([ch('A', 0, '# Intro\n\ntext\n\n## Part\n\n### Deep')]), 'en');
    expect(md).toContain('\n### Intro\n');
    expect(md).toContain('\n#### Part\n');
    expect(md).toContain('\n##### Deep\n');
  });

  it('drops a leading h1 duplicating the chapter title', () => {
    const md = bookToMarkdown(book([ch('Variables', 0, '# Variables\n\nbody')]), 'en');
    expect(md.match(/Variables/g)).toHaveLength(2); // contents entry + chapter heading
    expect(md).toContain('body');
  });

  it('caps heading depth at 6 and leaves code fences untouched', () => {
    const md = bookToMarkdown(book([ch('A', 3, '###### x\n\n```sh\n# comment\n```\n\n~~~\n## not a heading\n~~~')]), 'en');
    expect(md).toContain('\n###### x\n');
    expect(md).toContain('```sh\n# comment\n```');
    expect(md).toContain('~~~\n## not a heading\n~~~');
  });

  it('renders Russian labels for ru', () => {
    const md = bookToMarkdown(book([ch('A', 0, 'x')]), 'ru');
    expect(md).toContain('## Содержание');
    expect(md).toContain('Источник:');
  });

  it('handles a book without chapters', () => {
    const md = bookToMarkdown(book([]), 'en');
    expect(md).toContain('# Rust — metanit.com');
    expect(md).not.toContain('Contents');
  });
});
