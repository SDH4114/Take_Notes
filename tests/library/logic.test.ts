import { describe, expect, it } from 'vitest';
import type { Clip, Highlight } from '@/src/core/types';
import {
  buildParams, clipIcon, countByProject, filterClips, filterHighlights, moveId, parseParams, relativeDate, snippet,
} from '@/src/library/logic';

const src = (url: string, title = '') => ({ url, title, authors: [], accessed: '2026-01-01T00:00:00Z' });
const clip = (o: Partial<Clip>): Clip => ({
  id: 'c', projectId: null, kind: 'page', title: 'T', html: '', markdown: '', source: src('https://example.com/a'),
  tags: [], order: 0, assetIds: [], createdAt: '', updatedAt: '', ...o,
});
const hl = (o: Partial<Highlight>): Highlight => ({
  id: 'h', url: 'https://example.com/a', color: 'yellow', anchor: { exact: '', prefix: '', suffix: '' }, text: 'txt',
  source: src('https://example.com/a'), projectId: null, createdAt: '', updatedAt: '', ...o,
});

describe('filterClips', () => {
  const list = [
    clip({ id: '1', title: 'Rust ownership', markdown: 'borrow checker', source: src('https://doc.rust-lang.org/x') }),
    clip({ id: '2', title: 'Cats', note: 'my private memo', source: src('https://www.wikipedia.org/cat') }),
  ];
  it('returns everything for an empty query', () => expect(filterClips(list, '  ')).toHaveLength(2));
  it('matches title, body, note and domain case-insensitively', () => {
    expect(filterClips(list, 'OWNERSHIP').map((c) => c.id)).toEqual(['1']);
    expect(filterClips(list, 'borrow').map((c) => c.id)).toEqual(['1']);
    expect(filterClips(list, 'memo').map((c) => c.id)).toEqual(['2']);
    expect(filterClips(list, 'wikipedia').map((c) => c.id)).toEqual(['2']);
  });
  it('requires every word to match', () => {
    expect(filterClips(list, 'rust cats')).toEqual([]);
    expect(filterClips(list, 'rust borrow').map((c) => c.id)).toEqual(['1']);
  });
});

describe('filterHighlights', () => {
  it('matches text, note, title and domain', () => {
    const list = [
      hl({ id: '1', text: 'photosynthesis' }),
      hl({ id: '2', note: 'quiz question', source: src('https://bio.org/p', 'Biology') }),
    ];
    expect(filterHighlights(list, 'photo').map((h) => h.id)).toEqual(['1']);
    expect(filterHighlights(list, 'quiz').map((h) => h.id)).toEqual(['2']);
    expect(filterHighlights(list, 'biology').map((h) => h.id)).toEqual(['2']);
    expect(filterHighlights(list, 'bio.org').map((h) => h.id)).toEqual(['2']);
  });
});

describe('moveId', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('moves before the target', () => expect(moveId(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']));
  it('moves after the target', () => expect(moveId(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']));
  it('is a no-op for the same id or unknown ids', () => {
    expect(moveId(ids, 'a', 'a', 'after')).toEqual(ids);
    expect(moveId(ids, 'x', 'a', 'after')).toEqual(ids);
    expect(moveId(ids, 'a', 'x', 'after')).toEqual(ids);
  });
});

describe('URL params', () => {
  it('parses project, clip and view', () => {
    expect(parseParams('?project=p1&clip=c1&view=highlights')).toEqual({ project: 'p1', clip: 'c1', view: 'highlights' });
  });
  it('maps the inbox sentinel to null and defaults the view', () => {
    expect(parseParams('?project=__inbox__')).toEqual({ project: null, clip: undefined, view: 'clips' });
    expect(parseParams('')).toEqual({ project: null, clip: undefined, view: 'clips' });
  });
  it('ignores unknown views', () => expect(parseParams('?view=zzz').view).toBe('clips'));
  it('builds a query that round-trips', () => {
    const s = { project: 'p1', clip: 'c1', view: 'books' as const };
    expect(parseParams(buildParams(s))).toEqual(s);
    expect(buildParams({ project: null, clip: undefined, view: 'clips' })).toBe('?project=__inbox__');
  });
});

describe('relativeDate', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  it('uses relative words for recent dates', () => {
    expect(relativeDate('2026-06-15T11:59:40Z', now, 'en')).toBe('just now');
    expect(relativeDate('2026-06-15T11:30:00Z', now, 'en')).toBe('30 minutes ago');
    expect(relativeDate('2026-06-15T07:00:00Z', now, 'en')).toBe('5 hours ago');
    expect(relativeDate('2026-06-13T12:00:00Z', now, 'en')).toBe('2 days ago');
  });
  it('falls back to a date for older items', () => {
    expect(relativeDate('2025-01-02T12:00:00Z', now, 'en')).toMatch(/2025/);
  });
  it('returns empty for invalid input', () => expect(relativeDate('', now, 'en')).toBe(''));
});

describe('snippet, icons and counts', () => {
  it('collapses whitespace and truncates', () => {
    expect(snippet('a  b\n\nc', 10)).toBe('a b c');
    expect(snippet('abcdefghij', 5)).toBe('abcde…');
    expect(snippet(undefined, 5)).toBe('');
  });
  it('picks icons by kind and source', () => {
    expect(clipIcon(clip({ source: src('') }))).toBe('note');
    expect(clipIcon(clip({ kind: 'page' }))).toBe('globe');
    expect(clipIcon(clip({ kind: 'selection' }))).toBe('scissors');
    expect(clipIcon(clip({ kind: 'transcript' }))).toBe('video');
    expect(clipIcon(clip({ kind: 'chapter' }))).toBe('book');
  });
  it('counts items by project, inbox as null key', () => {
    const m = countByProject([hl({ projectId: null }), hl({ projectId: 'p' }), hl({ projectId: 'p' })]);
    expect(m.get(null)).toBe(1);
    expect(m.get('p')).toBe(2);
  });
});
