import { describe, expect, it } from 'vitest';
import { bibliographyText, domainOf, moveItem, safePreviewHtml } from '@/src/projects/utils';

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
