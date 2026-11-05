import { describe, expect, it, vi } from 'vitest';
import type { Book, Clip, Project, Settings } from '@/src/core/types';
import { DEFAULT_SETTINGS } from '@/src/core/types';

vi.mock('@/src/cite', () => ({
  formatBibliography: (sources: { title: string }[], style: string) => sources.map((s) => `[${style}] ${s.title}`),
}));

import {
  bookToFolderFiles, bookToMarkdownExport, clipToMarkdown, highlightsToMd, projectToMarkdown,
  shiftHeadings, yamlScalar,
} from '@/src/export/document';

const src = (over = {}) => ({
  url: 'https://ex.com/a', title: 'Ownership', authors: ['Ann Lee', 'Bob: Jr'], siteName: 'Ex',
  published: '2024-03-01T00:00:00Z', accessed: '2025-01-02T10:00:00.000Z', ...over,
});
const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c1', projectId: 'p1', kind: 'page', title: 'Rust: "ownership"', html: '', source: src(),
  markdown: 'Intro\n\n# H1\n\n```\n# not heading\n```\n\n## H2', tags: ['rust', 'a b'], order: 0, assetIds: [],
  createdAt: '2025-01-02T10:00:00.000Z', updatedAt: '2025-01-02T10:00:00.000Z', ...over,
});
const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const noFm = settings({ obsidian: { frontmatter: false, wikilinks: false } });

describe('yamlScalar', () => {
  it('keeps simple words plain and quotes risky values', () => {
    expect(yamlScalar('rust')).toBe('rust');
    expect(yamlScalar('2024-03-01')).toBe('2024-03-01');
    expect(yamlScalar('true')).toBe('"true"');
    expect(yamlScalar('42')).toBe('"42"');
    expect(yamlScalar('a: b')).toBe('"a: b"');
    expect(yamlScalar('say "hi"\nnow')).toBe('"say \\"hi\\"\\nnow"');
    expect(yamlScalar('')).toBe('""');
  });
});

describe('shiftHeadings', () => {
  it('shifts ATX headings, clamps at 6 and ignores fenced code', () => {
    expect(shiftHeadings('# A\n\n```\n# x\n```\n\n###### F', 1)).toBe('## A\n\n```\n# x\n```\n\n###### F');
  });
});

describe('clipToMarkdown', () => {
  it('builds frontmatter, title, source line, note callout and shifted body', () => {
    const out = clipToMarkdown(clip({ note: 'Remember\nthis' }), settings(), 'en');
    expect(out).toBe(
      [
        '---',
        'title: "Rust: \\"ownership\\""',
        'source: "https://ex.com/a"',
        'author:',
        '  - "Ann Lee"',
        '  - "Bob: Jr"',
        'published: 2024-03-01',
        'accessed: 2025-01-02',
        'site: Ex',
        'tags:',
        '  - takenotes',
        '  - rust',
        '  - a-b',
        '---',
        '',
        '# Rust: "ownership"',
        '',
        'Source: [Ownership](https://ex.com/a) (accessed 2025-01-02)',
        '',
        '> [!note]',
        '> Remember',
        '> this',
        '',
        'Intro',
        '',
        '## H1',
        '',
        '```',
        '# not heading',
        '```',
        '',
        '### H2',
        '',
      ].join('\n'),
    );
  });
  it('omits frontmatter when disabled and uses Russian labels', () => {
    const out = clipToMarkdown(clip({ markdown: 'x' }), noFm, 'ru');
    expect(out.startsWith('# Rust: "ownership"\n')).toBe(true);
    expect(out).toContain('Источник: [Ownership](https://ex.com/a) (дата обращения 2025-01-02)');
    expect(out).not.toContain('---');
  });
  it('drops a leading h1 duplicating the title', () => {
    const out = clipToMarkdown(clip({ title: 'T', markdown: '# T\n\nbody' }), noFm, 'en');
    expect(out).not.toContain('## T');
    expect(out).toContain('body');
  });
});

describe('projectToMarkdown', () => {
  const project: Project = { id: 'p1', name: 'Coursework', citationStyle: 'apa', createdAt: '', updatedAt: '' };
  const clips = [
    clip({ id: 'a', title: 'Alpha', order: 0, section: 'Part 1', markdown: '# Inner\n\ntext a', source: src({ url: 'https://ex.com/a', title: 'SrcA' }) }),
    clip({ id: 'b', title: 'Beta', order: 1, markdown: 'text b', source: src({ url: 'https://ex.com/b', title: 'SrcB' }) }),
    clip({ id: 'c', title: 'Gamma', order: 2, section: 'Part 1', markdown: 'text c', source: src({ url: 'https://ex.com/a', title: 'SrcA' }) }),
  ];
  it('groups by section, shifts headings, links sources and ends with a deduplicated bibliography', () => {
    const out = projectToMarkdown(project, clips, noFm, 'en');
    expect(out.startsWith('# Coursework\n')).toBe(true);
    expect(out).toContain('## Contents');
    expect(out).toContain('## Part 1');
    expect(out.indexOf('### Alpha')).toBeLessThan(out.indexOf('### Gamma'));
    expect(out.indexOf('### Gamma')).toBeLessThan(out.indexOf('## Beta'));
    expect(out).toContain('#### Inner');
    expect(out).toContain('Source: [SrcA](https://ex.com/a)');
    expect(out.endsWith('## References\n\n1. [apa] SrcA\n2. [apa] SrcB\n')).toBe(true);
  });
  it('uses the Russian bibliography heading and optional wikilinks', () => {
    const out = projectToMarkdown(project, clips, settings(), 'ru');
    expect(out).toContain('## Список литературы');
    expect(out).toContain('## Связанные заметки\n\n- [[Alpha]]\n- [[Beta]]\n- [[Gamma]]');
    expect(out.startsWith('---\ntitle: Coursework\n')).toBe(true);
  });
  it('omits the bibliography for an empty project', () => {
    expect(projectToMarkdown(project, [], noFm, 'en')).not.toContain('References');
  });
});

describe('book export', () => {
  const book: Book = {
    id: 'b1', title: 'Rust Book', rootUrl: 'https://ex.com/rust', source: src({ title: 'Rust Book', url: 'https://ex.com/rust' }),
    createdAt: '2025-01-02T10:00:00.000Z',
    chapters: [
      { url: 'https://ex.com/rust/1', title: 'Intro', level: 0, html: '', markdown: '# Intro\n\nHello', assetIds: [] },
      { url: 'https://ex.com/rust/2', title: 'Own/ership: basics', level: 1, html: '', markdown: '## Sub\n\nWorld', assetIds: [] },
    ],
  };
  it('single document nests chapters by level', () => {
    const out = bookToMarkdownExport(book, noFm, 'en');
    expect(out).toContain('# Rust Book');
    expect(out).toContain('## Intro');
    expect(out).toContain('### Own/ership: basics');
    expect(out).toContain('#### Sub');
  });
  it('folder files: numbered chapters plus index with wikilinks or md links', () => {
    const wiki = bookToFolderFiles(book, settings({ obsidian: { frontmatter: false, wikilinks: true } }), 'en');
    expect(Object.keys(wiki).sort()).toEqual(['01 - Intro.md', '02 - Own ership basics.md', 'index.md']);
    expect(wiki['index.md']).toContain('- [[01 - Intro|Intro]]');
    expect(wiki['index.md']).toContain('  - [[02 - Own ership basics|Own/ership: basics]]');
    expect(wiki['02 - Own ership basics.md']).toContain('# Own/ership: basics\n');
    expect(wiki['02 - Own ership basics.md']).toContain('### Sub');
    const md = bookToFolderFiles(book, noFm, 'en');
    expect(md['index.md']).toContain('- [Intro](01%20-%20Intro.md)');
  });
});

describe('highlightsToMd', () => {
  it('groups highlights by source page with notes', () => {
    const h = (id: string, text: string, note?: string, url = 'https://ex.com/a') => ({
      id, url, color: 'yellow' as const, anchor: { exact: text, prefix: '', suffix: '' }, text, note,
      source: src({ url }), projectId: null, createdAt: '', updatedAt: '',
    });
    const out = highlightsToMd([h('1', 'one', 'my note'), h('2', 'two'), h('3', 'three', undefined, 'https://ex.com/b')], 'en');
    expect(out).toContain('# Highlights');
    expect(out).toContain('## [Ownership](https://ex.com/a)');
    expect(out).toContain('> one\n\nmy note');
    expect(out.indexOf('> two')).toBeLessThan(out.indexOf('## [Ownership](https://ex.com/b)'));
  });
});
