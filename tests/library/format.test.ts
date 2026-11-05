import { describe, expect, it } from 'vitest';
import {
  cycleHeading, diffChange, toggleBlockquote, toggleBulletList, toggleCode, toggleLink, toggleOrderedList, toggleWrap,
  type Edit,
} from '@/src/library/format';

/** Notation: "ab[cd]ef" marks a selection, "ab|cd" an empty cursor. */
function parse(s: string): { text: string; from: number; to: number } {
  const cur = s.indexOf('|');
  if (cur >= 0) return { text: s.replace('|', ''), from: cur, to: cur };
  const from = s.indexOf('[');
  const to = s.indexOf(']') - 1;
  return { text: s.replace('[', '').replace(']', ''), from, to };
}
function show(e: Edit): string {
  if (e.from === e.to) return `${e.text.slice(0, e.from)}|${e.text.slice(e.from)}`;
  return `${e.text.slice(0, e.from)}[${e.text.slice(e.from, e.to)}]${e.text.slice(e.to)}`;
}
type Sel = { from: number; to: number };
const run = (s: string, f: (t: string, sel: Sel) => Edit) => {
  const p = parse(s);
  return show(f(p.text, p));
};

describe('toggleWrap', () => {
  const bold = (t: string, s: Sel) => toggleWrap(t, s, '**');
  it('wraps a selection and keeps it selected', () => {
    expect(run('a [word] b', bold)).toBe('a **[word]** b');
  });
  it('removes markers that surround the selection', () => {
    expect(run('a **[word]** b', bold)).toBe('a [word] b');
  });
  it('removes markers that are inside the selection', () => {
    expect(run('a [**word**] b', bold)).toBe('a [word] b');
  });
  it('inserts a pair at an empty cursor', () => {
    expect(run('a | b', bold)).toBe('a **|** b');
  });
  it('removes an empty pair around the cursor', () => {
    expect(run('a **|** b', bold)).toBe('a | b');
  });
  it('works for mark, strike and inline code markers', () => {
    expect(run('[x]', (t, s) => toggleWrap(t, s, '=='))).toBe('==[x]==');
    expect(run('[x]', (t, s) => toggleWrap(t, s, '~~'))).toBe('~~[x]~~');
    expect(run('[x]', (t, s) => toggleWrap(t, s, '`'))).toBe('`[x]`');
  });
  it('italic does not unwrap bold asterisks, it adds to them', () => {
    expect(run('**[x]**', (t, s) => toggleWrap(t, s, '*'))).toBe('***[x]***');
  });
  it('italic removes only its own asterisk from bold+italic', () => {
    expect(run('***[x]***', (t, s) => toggleWrap(t, s, '*'))).toBe('**[x]**');
  });
  it('bold removes only its own asterisks from bold+italic', () => {
    expect(run('***[x]***', bold)).toBe('*[x]*');
  });
  it('wraps multi-line selection as is', () => {
    expect(run('[a\nb]', bold)).toBe('**[a\nb]**');
  });
  it('does not treat a lone marker as wrapped', () => {
    expect(run('[**]', bold)).toBe('**[**]**');
  });
});

describe('cycleHeading', () => {
  const h = (t: string, s: Sel) => cycleHeading(t, s);
  it('none -> H1', () => expect(run('te|xt', h)).toBe('# te|xt'));
  it('H1 -> H2', () => expect(run('# te|xt', h)).toBe('## te|xt'));
  it('H2 -> H3', () => expect(run('## te|xt', h)).toBe('### te|xt'));
  it('H3 -> none', () => expect(run('### te|xt', h)).toBe('te|xt'));
  it('H4+ -> none', () => expect(run('#### te|xt', h)).toBe('te|xt'));
  it('affects only the cursor line', () => {
    expect(run('a\nb|\nc', h)).toBe('a\n# b|\nc');
  });
  it('clamps the cursor when it sat inside the removed prefix', () => {
    expect(run('###| x', h)).toBe('|x');
  });
  it('keeps a selection on the line', () => {
    expect(run('[abc]', h)).toBe('[# abc]');
  });
});

describe('block prefixes', () => {
  it('adds a quote to every selected line', () => {
    expect(run('[a\nb]\nc', toggleBlockquote)).toBe('[> a\n> b]\nc');
  });
  it('removes the quote when all lines have it', () => {
    expect(run('[> a\n> b]', toggleBlockquote)).toBe('[a\nb]');
  });
  it('adds to all lines when only some have it', () => {
    expect(run('[> a\nb]', toggleBlockquote)).toBe('[> > a\n> b]');
  });
  it('bullet list on one line at cursor', () => {
    expect(run('ab|c', toggleBulletList)).toBe('- ab|c');
  });
  it('bullet list toggles off', () => {
    expect(run('- ab|c', toggleBulletList)).toBe('ab|c');
  });
  it('bullet list on an empty line', () => {
    expect(run('|', toggleBulletList)).toBe('- |');
  });
  it('skips blank lines inside a selection', () => {
    expect(run('[a\n\nb]', toggleBulletList)).toBe('[- a\n\n- b]');
  });
  it('ordered list numbers non-empty lines', () => {
    expect(run('[a\nb\nc]', toggleOrderedList)).toBe('[1. a\n2. b\n3. c]');
  });
  it('ordered list toggles off', () => {
    expect(run('[1. a\n2. b]', toggleOrderedList)).toBe('[a\nb]');
  });
  it('converts a bullet list to an ordered one', () => {
    expect(run('[- a\n- b]', toggleOrderedList)).toBe('[1. a\n2. b]');
  });
  it('converts an ordered list to a bullet one', () => {
    expect(run('[1. a\n2. b]', toggleBulletList)).toBe('[- a\n- b]');
  });
});

describe('toggleCode', () => {
  it('single line selection becomes inline code', () => {
    expect(run('a [b] c', toggleCode)).toBe('a `[b]` c');
  });
  it('inline code toggles off', () => {
    expect(run('a `[b]` c', toggleCode)).toBe('a [b] c');
  });
  it('multi-line selection becomes a fenced block', () => {
    expect(run('[a\nb]', toggleCode)).toBe('```\n[a\nb]\n```');
  });
  it('fenced block toggles off', () => {
    expect(run('```\n[a\nb]\n```', toggleCode)).toBe('[a\nb]');
  });
  it('fence expands to whole lines', () => {
    expect(run('x a[b\nc]d y', toggleCode)).toBe('```\n[x ab\ncd y]\n```');
  });
});

describe('toggleLink', () => {
  it('wraps the selection and puts the cursor in the url', () => {
    expect(run('see [site] now', toggleLink)).toBe('see [site](|) now');
  });
  it('a selected url becomes the target and the cursor goes to the text', () => {
    expect(run('[https://a.b]', toggleLink)).toBe('[|](https://a.b)');
  });
  it('empty selection inserts an empty link with cursor in the text', () => {
    expect(run('a |', toggleLink)).toBe('a [|]()');
  });
  it('unwraps an existing link to its text', () => {
    const text = 'x [t](https://a.b) y';
    expect(show(toggleLink(text, { from: 2, to: 18 }))).toBe('x [t] y');
  });
});

describe('diffChange', () => {
  it('finds the minimal replaced range', () => {
    expect(diffChange('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
    expect(diffChange('abc', 'abc')).toEqual({ from: 3, to: 3, insert: '' });
    expect(diffChange('abXcd', 'abcd')).toEqual({ from: 2, to: 3, insert: '' });
    expect(diffChange('aaa', 'aa')).toEqual({ from: 2, to: 3, insert: '' });
  });
});
