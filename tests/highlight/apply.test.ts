import { describe, expect, it } from 'vitest';
import type { Clip, Highlight } from '@/src/core/types';
import { highlightsForClip, markHighlightsInHtml, markHighlightsInMarkdown } from '@/src/highlight/apply';

const hl = (id: string, text: string, over: Partial<Highlight> = {}): Highlight => ({
  id, url: 'https://ex.com/a', color: '#facc15', anchor: { exact: text, prefix: '', suffix: '' }, text,
  source: { url: 'https://ex.com/a', title: 'A', authors: [], accessed: '' }, projectId: null,
  createdAt: `2026-01-0${id.length}T00:00:00Z`, updatedAt: '', ...over,
});
const clip = (url: string) => ({ source: { url, title: '', authors: [], accessed: '' } }) as Pick<Clip, 'source'>;

describe('highlightsForClip', () => {
  it('joins by normalized page URL, ignores other pages and notes without a source', () => {
    const list = [hl('a', 'x'), hl('b', 'y', { url: 'https://ex.com/b' })];
    expect(highlightsForClip(clip('https://ex.com/a#top'), list).map((h) => h.id)).toEqual(['a']);
    expect(highlightsForClip(clip(''), list)).toEqual([]);
  });
});

describe('markHighlightsInMarkdown', () => {
  it('wraps text across whitespace/line wraps, skips code and reports misses', () => {
    const md = 'Ownership is a set\nof rules.\n\n`set of rules`\n\nOther text.';
    const { markdown, missing } = markHighlightsInMarkdown(md, [hl('a', 'is a set of rules'), hl('bb', 'not there')]);
    expect(markdown).toBe('Ownership ==is a set\nof rules==.\n\n`set of rules`\n\nOther text.');
    expect(missing).toEqual(['bb']);
  });

  it('does not cross a paragraph break or mark inside code blocks', () => {
    const md = 'end of one\n\nstart two\n\n```\nalpha beta\n```\nalpha beta';
    const r = markHighlightsInMarkdown(md, [hl('a', 'one start'), hl('bb', 'alpha beta')]);
    expect(r.missing).toEqual(['a']);
    expect(r.markdown.endsWith('```\n==alpha beta==')).toBe(true);
  });

  it('escapes regex characters in the text', () => {
    expect(markHighlightsInMarkdown('cost (a+b)*2 now', [hl('a', '(a+b)*2')]).markdown).toBe('cost ==(a+b)*2== now');
  });
});

describe('markHighlightsInHtml', () => {
  it('wraps text spanning elements in <mark> with a validated color', () => {
    const { html, missing } = markHighlightsInHtml('<p>Hello <b>big</b> world</p>', [hl('a', 'big world'), hl('bb', 'nope')]);
    expect(html).toContain('<b><mark class="tn-hl" data-tn-id="a"');
    expect(html).toContain('background-color: rgba(250,204,21, .45)');
    expect(html).toMatch(/<\/b><mark[^>]*> world<\/mark>/);
    expect(missing).toEqual(['bb']);
  });

  it('never puts an unvalidated color into the style attribute', () => {
    const { html } = markHighlightsInHtml('<p>abc</p>', [hl('a', 'abc', { color: 'red;background:url(x)' })]);
    expect(html).not.toContain('url(');
  });
});

describe('code protection (regressions)', () => {
  it('protects every line of a fenced block, and text after it can still be marked', () => {
    const md = 'text\n```js\nline1\nline2 needle here\nline3\n```\nafter needle';
    const { markdown } = markHighlightsInMarkdown(md, [hl('a', 'needle')]);
    expect(markdown).toBe('text\n```js\nline1\nline2 needle here\nline3\n```\nafter ==needle==');
  });
  it('"==" inside code does not count as an open mark', () => {
    const md = '```\nif a == b {}\n```\nplain words here';
    expect(markHighlightsInMarkdown(md, [hl('a', 'plain words')]).markdown).toContain('==plain words==');
  });
  it('an unclosed fence protects to the end', () => {
    expect(markHighlightsInMarkdown('```\nsecret word', [hl('a', 'secret word')]).missing).toEqual(['a']);
  });
});
