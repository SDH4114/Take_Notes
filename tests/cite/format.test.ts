import { describe, expect, it } from 'vitest';
import { formatBibliography, formatCitation } from '@/src/cite';
import type { SourceMeta } from '@/src/core/types';

const ACCESSED = '2026-11-05T12:00:00';
const src = (o: Partial<SourceMeta> = {}): SourceMeta => ({
  url: 'https://example.com/a',
  title: 'Title of page',
  authors: [],
  accessed: ACCESSED,
  ...o,
});

describe('GOST R 7.0.100-2018', () => {
  it('full entry with one author, site and year', () => {
    const s = src({
      url: 'https://example.com/a',
      title: 'Название статьи',
      authors: ['Иван Иванович Иванов'],
      siteName: 'Название сайта',
      published: '2023-05-04',
    });
    expect(formatCitation(s, 'gost')).toBe(
      'Иванов, И. И. Название статьи / И. И. Иванов. — Текст : электронный // Название сайта : [сайт]. — 2023. — URL: https://example.com/a (дата обращения: 05.11.2026).',
    );
  });

  it('no author: title first, no date', () => {
    const s = src({ url: 'https://x.ru/a', title: 'Название', siteName: 'Сайт' });
    expect(formatCitation(s, 'gost')).toBe(
      'Название — Текст : электронный // Сайт : [сайт]. — URL: https://x.ru/a (дата обращения: 05.11.2026).',
    );
  });

  it('no site name', () => {
    const s = src({ url: 'https://x.ru/a', title: 'Название', authors: ['Пётр Петров'], published: '2020' });
    expect(formatCitation(s, 'gost')).toBe(
      'Петров, П. Название / П. Петров. — Текст : электронный. — 2020. — URL: https://x.ru/a (дата обращения: 05.11.2026).',
    );
  });

  it('two authors', () => {
    const s = src({ title: 'Т', authors: ['Иван Иванов', 'Пётр Петров'], siteName: 'С' });
    expect(formatCitation(s, 'gost')).toBe(
      'Иванов, И. Т / И. Иванов, П. Петров. — Текст : электронный // С : [сайт]. — URL: https://example.com/a (дата обращения: 05.11.2026).',
    );
  });

  it('three authors', () => {
    const s = src({ title: 'Т', authors: ['Иван Иванов', 'Пётр Петров', 'Сидор Сидоров'], siteName: 'С' });
    expect(formatCitation(s, 'gost')).toBe(
      'Иванов, И. Т / И. Иванов, П. Петров, С. Сидоров. — Текст : электронный // С : [сайт]. — URL: https://example.com/a (дата обращения: 05.11.2026).',
    );
  });

  it('four or more authors: title first, [и др.]', () => {
    const s = src({ title: 'Т', authors: ['Иван Иванов', 'Пётр Петров', 'Сидор Сидоров', 'Анна Фёдорова'], siteName: 'С' });
    expect(formatCitation(s, 'gost')).toBe(
      'Т / И. Иванов [и др.]. — Текст : электронный // С : [сайт]. — URL: https://example.com/a (дата обращения: 05.11.2026).',
    );
  });

  it('English source keeps its language and the GOST scheme', () => {
    const s = src({ title: 'Learning Rust', authors: ['John Adam Smith'], siteName: 'Rust Blog', published: '2023-05-04T10:00:00Z' });
    expect(formatCitation(s, 'gost')).toBe(
      'Smith, J. A. Learning Rust / J. A. Smith. — Текст : электронный // Rust Blog : [сайт]. — 2023. — URL: https://example.com/a (дата обращения: 05.11.2026).',
    );
  });

  it('understands "Last, First" and initials input', () => {
    expect(formatCitation(src({ title: 'T', authors: ['Smith, John Adam'] }), 'gost')).toContain('Smith, J. A. T / J. A. Smith.');
    expect(formatCitation(src({ title: 'T', authors: ['И.И. Иванов'] }), 'gost')).toContain('Иванов, И. И. T / И. И. Иванов.');
  });

  it('handles hyphenated given names and single-token names', () => {
    expect(formatCitation(src({ title: 'T', authors: ['Анна-Мария Орлова'] }), 'gost')).toContain('Орлова, А.-М. T');
    expect(formatCitation(src({ title: 'T', authors: ['Wikipedia'] }), 'gost')).toContain('Wikipedia T / Wikipedia.');
  });

  it('accessed date given as plain date', () => {
    expect(formatCitation(src({ accessed: '2026-01-09' }), 'gost')).toContain('(дата обращения: 09.01.2026)');
  });
});

describe('APA 7', () => {
  const base = { published: '2023-05-04', siteName: 'Site Name' };
  it('one author', () => {
    expect(formatCitation(src({ ...base, authors: ['John Adam Smith'] }), 'apa')).toBe(
      'Smith, J. A. (2023, May 4). Title of page. Site Name. https://example.com/a',
    );
  });
  it('two authors', () => {
    expect(formatCitation(src({ ...base, authors: ['John Smith', 'Barbara B. Doe'] }), 'apa')).toBe(
      'Smith, J., & Doe, B. B. (2023, May 4). Title of page. Site Name. https://example.com/a',
    );
  });
  it('three authors', () => {
    expect(formatCitation(src({ ...base, authors: ['John Smith', 'Barbara Doe', 'Carl Brown'] }), 'apa')).toBe(
      'Smith, J., Doe, B., & Brown, C. (2023, May 4). Title of page. Site Name. https://example.com/a',
    );
  });
  it('no date: (n.d.) and Retrieved', () => {
    expect(formatCitation(src({ authors: ['John Smith'], siteName: 'Site Name' }), 'apa')).toBe(
      'Smith, J. (n.d.). Title of page. Site Name. Retrieved November 5, 2026, from https://example.com/a',
    );
  });
  it('no author: title moves to author position', () => {
    expect(formatCitation(src(base), 'apa')).toBe('Title of page. (2023, May 4). Site Name. https://example.com/a');
  });
  it('no author, no date (wiki-like)', () => {
    expect(formatCitation(src({ siteName: 'Wikipedia' }), 'apa')).toBe(
      'Title of page. (n.d.). Wikipedia. Retrieved November 5, 2026, from https://example.com/a',
    );
  });
  it('year only and year-month', () => {
    expect(formatCitation(src({ published: '2023', authors: ['John Smith'] }), 'apa')).toBe('Smith, J. (2023). Title of page. https://example.com/a');
    expect(formatCitation(src({ published: '2023-05', authors: ['John Smith'] }), 'apa')).toBe('Smith, J. (2023, May). Title of page. https://example.com/a');
  });
  it('title ending with a question mark gets no extra period', () => {
    expect(formatCitation(src({ title: 'Why?', published: '2023', authors: ['John Smith'] }), 'apa')).toBe('Smith, J. (2023). Why? https://example.com/a');
  });
});

describe('MLA 9', () => {
  const base = { published: '2023-05-04', siteName: 'Site Name' };
  it('one author', () => {
    expect(formatCitation(src({ ...base, authors: ['John Adam Smith'] }), 'mla')).toBe(
      'Smith, John Adam. "Title of page." Site Name, 4 May 2023, https://example.com/a. Accessed 5 Nov. 2026.',
    );
  });
  it('two authors', () => {
    expect(formatCitation(src({ ...base, authors: ['John Smith', 'Barbara Doe'] }), 'mla')).toBe(
      'Smith, John, and Barbara Doe. "Title of page." Site Name, 4 May 2023, https://example.com/a. Accessed 5 Nov. 2026.',
    );
  });
  it('three authors: et al.', () => {
    expect(formatCitation(src({ ...base, authors: ['John Smith', 'Barbara Doe', 'Carl Brown'] }), 'mla')).toBe(
      'Smith, John, et al. "Title of page." Site Name, 4 May 2023, https://example.com/a. Accessed 5 Nov. 2026.',
    );
  });
  it('no author', () => {
    expect(formatCitation(src(base), 'mla')).toBe(
      '"Title of page." Site Name, 4 May 2023, https://example.com/a. Accessed 5 Nov. 2026.',
    );
  });
  it('no date', () => {
    expect(formatCitation(src({ siteName: 'Site Name', authors: ['John Smith'] }), 'mla')).toBe(
      'Smith, John. "Title of page." Site Name, https://example.com/a. Accessed 5 Nov. 2026.',
    );
  });
  it('no site name', () => {
    expect(formatCitation(src({ published: '2023-05-04' }), 'mla')).toBe(
      '"Title of page." 4 May 2023, https://example.com/a. Accessed 5 Nov. 2026.',
    );
  });
  it('month abbreviations follow MLA (Sept., June, partial dates)', () => {
    expect(formatCitation(src({ published: '2023-09-01' }), 'mla')).toContain('1 Sept. 2023');
    expect(formatCitation(src({ published: '2023-06-15' }), 'mla')).toContain('15 June 2023');
    expect(formatCitation(src({ published: '2023-03' }), 'mla')).toContain('Mar. 2023');
    expect(formatCitation(src({ published: '2023' }), 'mla')).toContain('"Title of page." 2023,');
  });
  it('title ending with a question mark', () => {
    expect(formatCitation(src({ title: 'Why?' }), 'mla')).toContain('"Why?" https://');
  });
});

describe('formatBibliography', () => {
  it('skips url-less sources (own/imported notes)', () => {
    const list = [src({ url: '', title: '' }), src({ url: '', title: 'Note' }), src({ url: 'https://e.com/x', title: 'X' })];
    for (const style of ['gost', 'apa', 'mla'] as const) expect(formatBibliography(list, style)).toHaveLength(1);
  });

  it('dedupes by normalized URL (tracking params and hash ignored)', () => {
    const a = src({ url: 'https://example.com/a?utm_source=x#top', title: 'A' });
    const b = src({ url: 'https://example.com/a', title: 'A copy' });
    expect(formatBibliography([a, b], 'apa')).toHaveLength(1);
  });

  it('GOST: sorted alphabetically, Cyrillic before Latin, anonymous sources by title', () => {
    const list = [
      src({ url: 'https://e.com/1', title: 'T', authors: ['John Zed'] }),
      src({ url: 'https://e.com/2', title: 'T', authors: ['Пётр Яковлев'] }),
      src({ url: 'https://e.com/3', title: 'Борьба', authors: [] }),
      src({ url: 'https://e.com/4', title: 'T', authors: ['Anna Adams'] }),
      src({ url: 'https://e.com/5', title: 'T', authors: ['Иван Андреев'] }),
    ];
    const out = formatBibliography(list, 'gost').map((s) => s.split(' ')[0]);
    expect(out).toEqual(['Андреев,', 'Борьба', 'Яковлев,', 'Adams,', 'Zed,']);
  });

  it('APA: sorted by author surname or title, no numbering', () => {
    const list = [
      src({ url: 'https://e.com/1', title: 'Zebra facts', authors: [] }),
      src({ url: 'https://e.com/2', title: 'T', authors: ['Bob Brown'], published: '2020' }),
      src({ url: 'https://e.com/3', title: 'T', authors: ['Al Adams'], published: '2020' }),
    ];
    const out = formatBibliography(list, 'apa');
    expect(out).toEqual([
      'Adams, A. (2020). T. https://e.com/3',
      'Brown, B. (2020). T. https://e.com/2',
      'Zebra facts. (n.d.). Retrieved November 5, 2026, from https://e.com/1',
    ]);
  });

  it('MLA sorts too and returns [] for empty input', () => {
    const list = [
      src({ url: 'https://e.com/1', title: 'B', authors: ['Bob Brown'] }),
      src({ url: 'https://e.com/2', title: 'A', authors: ['Al Adams'] }),
    ];
    expect(formatBibliography(list, 'mla')[0]?.startsWith('Adams, Al.')).toBe(true);
    expect(formatBibliography([], 'mla')).toEqual([]);
  });
});
