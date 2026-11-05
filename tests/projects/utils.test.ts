import { describe, expect, it } from 'vitest';
import { bibliographyText, domainOf, moveItem, relativeDate, safePreviewHtml } from '@/src/projects/utils';

describe('relativeDate', () => {
  const now = new Date('2026-05-10T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('says "just now" under a minute', () => {
    expect(relativeDate(ago(20_000), now, 'ru')).toBe('только что');
    expect(relativeDate(ago(20_000), now, 'en')).toBe('just now');
  });
  it('formats minutes and hours', () => {
    expect(relativeDate(ago(5 * MIN), now, 'ru')).toBe('5 мин назад');
    expect(relativeDate(ago(3 * HOUR), now, 'ru')).toBe('3 ч назад');
    expect(relativeDate(ago(5 * MIN), now, 'en')).toBe('5 min ago');
  });
  it('formats yesterday and days', () => {
    expect(relativeDate(ago(DAY + HOUR), now, 'ru')).toBe('вчера');
    expect(relativeDate(ago(DAY + HOUR), now, 'en')).toBe('yesterday');
    expect(relativeDate(ago(4 * DAY), now, 'ru')).toBe('4 дн назад');
  });
  it('falls back to the calendar date after a week, and handles future/invalid input', () => {
    expect(relativeDate(ago(10 * DAY), now, 'en')).toBe('2026-04-30');
    expect(relativeDate(new Date(now + HOUR).toISOString(), now, 'en')).toBe('just now');
    expect(relativeDate('garbage', now, 'en')).toBe('');
  });
});

describe('moveItem', () => {
  it('moves an item forward and backward', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
  it('returns a copy unchanged for out-of-range or same index', () => {
    const src = ['a', 'b'];
    expect(moveItem(src, 0, 5)).toEqual(['a', 'b']);
    expect(moveItem(src, -1, 0)).toEqual(['a', 'b']);
    expect(moveItem(src, 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(src, 0, 5)).not.toBe(src);
  });
});

describe('domainOf', () => {
  it('returns hostname without www', () => {
    expect(domainOf('https://www.metanit.com/rust/x')).toBe('metanit.com');
  });
  it('falls back to the raw string for invalid URLs', () => {
    expect(domainOf('not a url')).toBe('not a url');
  });
});

describe('bibliographyText', () => {
  it('numbers entries for copy', () => {
    expect(bibliographyText(['A', 'B'])).toBe('1. A\n2. B');
  });
  it('can be unnumbered', () => {
    expect(bibliographyText(['A', 'B'], false)).toBe('A\nB');
  });
  it('is empty for no entries', () => {
    expect(bibliographyText([])).toBe('');
  });
});

describe('safePreviewHtml', () => {
  it('removes scripts, event handlers and javascript: links', () => {
    const out = safePreviewHtml('<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(out).toContain('hi');
  });
});
