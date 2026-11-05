import { beforeEach, describe, expect, it } from 'vitest';
import { createAnchor, resolveAnchor } from '@/src/highlight/anchor';
import { rangeForRaw } from './helpers';

const html = (s: string) => { document.body.innerHTML = s; };

describe('createAnchor', () => {
  beforeEach(() => html('<p>The quick brown fox jumps over the lazy dog and keeps running far away.</p>'));

  it('stores exact text with prefix and suffix', () => {
    const a = createAnchor(rangeForRaw('brown fox'));
    expect(a).toEqual({ exact: 'brown fox', prefix: 'The quick ', suffix: ' jumps over the lazy dog and kee' });
  });

  it('limits context to 32 characters', () => {
    const a = createAnchor(rangeForRaw('lazy dog'));
    expect(a.prefix).toBe(' quick brown fox jumps over the ');
    expect(a.prefix.length).toBe(32);
    expect(a.suffix).toBe(' and keeps running far away.');
  });

  it('normalizes whitespace and trims the selection', () => {
    html('<p>one   two\n  three <b>four</b>   five</p>');
    const a = createAnchor(rangeForRaw(' two\n  three '));
    expect(a.exact).toBe('two three');
    expect(a.prefix).toBe('one ');
    expect(a.suffix).toBe(' four five');
  });

  it('works across several elements', () => {
    html('<p>Alpha <em>beta <b>gamma</b></em> delta</p>');
    const a = createAnchor(rangeForRaw('beta gamma'));
    expect(a).toEqual({ exact: 'beta gamma', prefix: 'Alpha ', suffix: ' delta' });
  });

  it('supports element-container range boundaries', () => {
    html('<div><p>first</p><p>second</p></div>');
    const r = document.createRange();
    r.setStart(document.querySelector('div')!, 1);
    r.setEnd(document.querySelector('div')!, 2);
    expect(createAnchor(r).exact).toBe('second');
  });
});

describe('resolveAnchor', () => {
  it('round-trips to the same text', () => {
    html('<p>Hello <b>big</b> world</p>');
    const a = createAnchor(rangeForRaw('big'));
    expect(resolveAnchor(a)!.toString()).toBe('big');
  });

  it('picks the occurrence matching prefix/suffix', () => {
    html('<p>cat sat here.</p><p>dog sat there.</p><p>cow sat everywhere.</p>');
    const a = createAnchor(rangeForRaw('sat', 1));
    const r = resolveAnchor(a)!;
    expect(r.startContainer.textContent).toBe('dog sat there.');
  });

  it('resolves text split across many elements', () => {
    html('<p>Some <i>long</i> <span>quote <b>that</b></span> spans</p>');
    const a = createAnchor(rangeForRaw('long quote that'));
    const r = resolveAnchor(a)!;
    expect(r.toString()).toBe('long quote that');
  });

  it('tolerates changed whitespace and markup between create and resolve', () => {
    html('<p>Intro text. The mitochondria is the powerhouse of the cell. Outro.</p>');
    const a = createAnchor(rangeForRaw('mitochondria is the powerhouse'));
    html('<p>Intro text.</p>\n\n<p>The   mitochondria\n is the <em>powerhouse</em> of the cell. Outro.</p>');
    const r = resolveAnchor(a)!;
    expect(r).not.toBeNull();
    expect(r.toString().replace(/\s+/g, ' ')).toBe('mitochondria is the powerhouse');
  });

  it('uses a unique exact match even if the context changed', () => {
    html('<p>before unique phrase after</p>');
    const a = createAnchor(rangeForRaw('unique phrase'));
    html('<p>totally different context unique phrase here</p>');
    expect(resolveAnchor(a)!.toString()).toBe('unique phrase');
  });

  it('returns null when the text is gone', () => {
    html('<p>some words here</p>');
    const a = createAnchor(rangeForRaw('words'));
    html('<p>nothing similar</p>');
    expect(resolveAnchor(a)).toBeNull();
  });

  it('returns null for ambiguous matches with no context agreement', () => {
    html('<p>aaa-foo-bbb</p>');
    const a = createAnchor(rangeForRaw('foo'));
    html('<p>xxx(foo)yyy</p><p>zzz(foo)qqq</p>');
    expect(resolveAnchor(a)).toBeNull();
  });

  it('returns null for an empty exact', () => {
    html('<p>x</p>');
    expect(resolveAnchor({ exact: '  ', prefix: '', suffix: '' })).toBeNull();
  });

  it('ignores script and style text', () => {
    html('<style>.a{color:red}</style><p>visible text</p><script>var visible = 1</script>');
    const r = resolveAnchor({ exact: 'visible', prefix: '', suffix: '' })!;
    expect(r.startContainer.textContent).toBe('visible text');
  });
});
