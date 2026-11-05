import { describe, expect, it } from 'vitest';
import type { Highlight } from '@/src/core/types';
import { highlightsToAnkiTsv } from '@/src/highlight/anki';
import { highlightsToMarkdown } from '@/src/highlight/markdown';

function hl(over: Partial<Highlight> & { text: string }): Highlight {
  return {
    id: 'id',
    url: 'https://www.ru.wikipedia.org/wiki/Rust',
    color: 'yellow',
    anchor: { exact: over.text, prefix: '', suffix: '' },
    source: { url: 'https://www.ru.wikipedia.org/wiki/Rust', title: 'Rust', authors: [], accessed: '2026-01-01T00:00:00.000Z' },
    projectId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('highlightsToAnkiTsv', () => {
  it('emits only headers for an empty list', () => {
    expect(highlightsToAnkiTsv([])).toBe('#separator:tab\n#html:false\n#tags column:3\n');
  });

  it('uses text/source on a card without a note', () => {
    expect(highlightsToAnkiTsv([hl({ text: 'Ownership moves values' })])).toBe(
      '#separator:tab\n#html:false\n#tags column:3\n' +
        'Ownership moves values\tRust https://www.ru.wikipedia.org/wiki/Rust\tru-wikipedia-org takenotes\n',
    );
  });

  it('uses note as front and text as back when a note exists', () => {
    expect(highlightsToAnkiTsv([hl({ text: 'Borrow checker', note: 'What enforces aliasing rules?' })])).toBe(
      '#separator:tab\n#html:false\n#tags column:3\n' +
        'What enforces aliasing rules?\tBorrow checker\tru-wikipedia-org takenotes\n',
    );
  });

  it('replaces tabs and newlines with spaces', () => {
    const out = highlightsToAnkiTsv([hl({ text: 'a\tb\nc\r\nd', note: 'n\t1\n2' })]);
    expect(out.split('\n')[3]).toBe('n 1 2\ta b c d\tru-wikipedia-org takenotes');
  });

  it('falls back to a generic tag for an unparsable url', () => {
    const h = hl({ text: 't', source: { url: 'not a url', title: 'T', authors: [], accessed: '' } });
    expect(highlightsToAnkiTsv([h]).split('\n')[3]).toBe('t\tT not a url\ttakenotes');
  });
});

describe('highlightsToMarkdown', () => {
  it('returns an empty string for no highlights', () => {
    expect(highlightsToMarkdown([])).toBe('');
  });

  it('groups by source page with link, quote and note', () => {
    const a = hl({ text: 'one', note: 'my note' });
    const b = hl({ text: 'two\nlines', color: 'blue' });
    const c = hl({
      text: 'other',
      source: { url: 'https://b.example/x', title: 'Other', authors: [], accessed: '' },
    });
    expect(highlightsToMarkdown([a, c, b])).toBe(
      [
        '## [Rust](https://www.ru.wikipedia.org/wiki/Rust)',
        '',
        '> one',
        '',
        'my note',
        '',
        '> two',
        '> lines (blue)',
        '',
        '## [Other](https://b.example/x)',
        '',
        '> other',
        '',
      ].join('\n'),
    );
  });

  it('escapes brackets in titles', () => {
    const h = hl({ text: 'x', source: { url: 'https://a.b/', title: 'A [b]', authors: [], accessed: '' } });
    expect(highlightsToMarkdown([h])).toContain('## [A \\[b\\]](https://a.b/)');
  });
});
