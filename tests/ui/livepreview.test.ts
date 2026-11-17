import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { Highlight } from '@/src/core/types';
import { buildLivePreview, livePreview, safeImageSrc, setFocused, setHighlights } from '@/src/ui/livepreview';

interface D { from: number; to: number; text: string; kind: 'hide' | 'widget' | 'mark' | 'line'; cls?: string; widget?: string; block?: boolean; attrs?: Record<string, string> }

function make(doc: string, cursor?: number, highlights?: Highlight[]): EditorState {
  let s = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage }), livePreview()] });
  const effects = [];
  if (cursor !== undefined) effects.push(setFocused.of(true));
  if (highlights) effects.push(setHighlights.of(highlights));
  s = s.update({ effects, selection: cursor === undefined ? undefined : EditorSelection.cursor(cursor) }).state;
  return s;
}

function decos(s: EditorState): D[] {
  const out: D[] = [];
  buildLivePreview(s).between(0, s.doc.length, (from, to, v) => {
    const spec = v.spec as { widget?: object; class?: string; attributes?: Record<string, string>; block?: boolean };
    const text = s.doc.sliceString(from, to);
    if (from === to && !spec.widget) out.push({ from, to, text, kind: 'line', cls: spec.class });
    else if (spec.widget) out.push({ from, to, text, kind: 'widget', widget: spec.widget.constructor.name, block: !!spec.block });
    else if (spec.class || spec.attributes) out.push({ from, to, text, kind: 'mark', cls: spec.class, attrs: spec.attributes });
    else out.push({ from, to, text, kind: 'hide' });
  });
  return out;
}
const hidden = (s: EditorState) => decos(s).filter((d) => d.kind === 'hide').map((d) => d.text);

describe('live preview', () => {
  it('hides inline markup when the editor is not focused', () => {
    const s = make('a **b** *c* ~~d~~ `e` ==f==');
    expect(hidden(s)).toEqual(['**', '**', '*', '*', '~~', '~~', '`', '`', '==', '==']);
    expect(decos(s).some((d) => d.kind === 'mark' && d.cls === 'cm-hl-mark' && d.text === '==f==')).toBe(true);
  });

  it('reveals only the element under the cursor', () => {
    const doc = 'a **b** *c*';
    const s = make(doc, doc.indexOf('b'));
    expect(hidden(s)).toEqual(['*', '*']);
  });

  it('heading: hides "# " except on the cursor line', () => {
    const doc = '# Title\n\ntext\n\n## Sub';
    expect(hidden(make(doc))).toEqual(['# ', '## ']);
    expect(hidden(make(doc, 3))).toEqual(['## ']);
    expect(decos(make(doc)).filter((d) => d.kind === 'line').map((d) => d.cls)).toEqual(['cm-lp-h cm-lp-h1', 'cm-lp-h cm-lp-h2']);
  });

  it('link: shows only the text, keeps the url for clicks', () => {
    const doc = 'see [docs](https://x.org/a) now';
    const d = decos(make(doc));
    expect(d.filter((x) => x.kind === 'hide').map((x) => x.text)).toEqual(['[', '](https://x.org/a)']);
    const m = d.find((x) => x.cls === 'cm-lp-link')!;
    expect(m.text).toBe('docs');
    expect(m.attrs?.['data-href']).toBe('https://x.org/a');
    expect(m.attrs?.['data-editing']).toBeUndefined();
    // cursor inside: source shown, the click edits instead of opening
    const e = decos(make(doc, doc.indexOf('docs') + 1));
    expect(e.filter((x) => x.kind === 'hide')).toEqual([]);
    expect(e.find((x) => x.cls === 'cm-lp-link')!.attrs?.['data-editing']).toBe('1');
  });

  it('wikilinks: brackets and alias target hidden', () => {
    const d = decos(make('[[Rust book|the book]] and [[Other]]'));
    expect(d.filter((x) => x.kind === 'hide').map((x) => x.text)).toEqual(['[[Rust book|', ']]', '[[', ']]']);
    expect(d.filter((x) => x.cls === 'cm-lp-wikilink').map((x) => [x.text, x.attrs?.['data-wikilink']]))
      .toEqual([['the book', 'Rust book'], ['Other', 'Other']]);
  });

  it('lists: bullets and task checkboxes', () => {
    const d = decos(make('- one\n- [x] done\n- [ ] todo\n1. num'));
    expect(d.filter((x) => x.kind === 'widget').map((x) => x.widget)).toEqual(['BulletWidget', 'TaskWidget', 'TaskWidget']);
    expect(d.find((x) => x.cls === 'cm-lp-done')?.text).toBe('done');
  });

  it('table becomes a block widget unless the cursor is in it', () => {
    const doc = 'x\n\n| a | b |\n|---|---|\n| 1 | **2** |\n\ny';
    const d = decos(make(doc));
    const t = d.find((x) => x.widget === 'TableWidget')!;
    expect(t.block).toBe(true);
    expect(t.text).toBe('| a | b |\n|---|---|\n| 1 | **2** |');
    expect(hidden(make(doc))).toEqual([]); // nothing hidden inside the replaced table
    expect(decos(make(doc, doc.indexOf('1 |'))).some((x) => x.widget === 'TableWidget')).toBe(false);
  });

  it('math: underscores are not emphasis, dollars hidden', () => {
    const d = decos(make('so $a_1 + b_2$ ok'));
    expect(d.filter((x) => x.kind === 'hide').map((x) => x.text)).toEqual(['$', '$']);
    expect(d.find((x) => x.cls === 'cm-lp-math')?.text).toBe('$a_1 + b_2$');
    expect(hidden(make('costs $5 and $10'))).toEqual([]);
  });

  it('code is left alone', () => {
    const doc = '```js\nconst a = **b** == [[c]];\n```';
    const d = decos(make(doc));
    expect(d.filter((x) => x.kind === 'line').every((x) => x.cls?.startsWith('cm-lp-code'))).toBe(true);
    expect(d.filter((x) => x.kind === 'mark')).toEqual([]);
    expect(d.find((x) => x.widget === 'LabelWidget')?.text).toBe('```js');
    expect(hidden(make(doc))).toEqual(['```']);
  });

  it('images: inline and reference data URLs; data definitions collapsed', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const doc = `![cat](https://x.org/c.png)\n\n![dog][img-1]\n\n[img-1]: <${png}>`;
    const d = decos(make(doc));
    expect(d.filter((x) => x.widget === 'ImageWidget').map((x) => x.text)).toEqual(['![cat](https://x.org/c.png)', '![dog][img-1]']);
    expect(d.find((x) => x.widget === 'LabelWidget')?.text).toBe(`[img-1]: <${png}>`);
  });

  it('only safe image sources load', () => {
    expect(safeImageSrc('https://a/b.png')).toBe('https://a/b.png');
    expect(safeImageSrc('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('data:text/html,<b>')).toBeNull();
  });

  it('colors page highlights found in the text, with a validated color', () => {
    const h = { id: 'h1', text: 'quick  brown', color: 'url(x);' as never, note: 'n' } as unknown as Highlight;
    const g = { id: 'h2', text: 'missing words', color: '#00ff00' } as unknown as Highlight;
    const d = decos(make('the quick brown fox', undefined, [h, g]));
    const m = d.filter((x) => x.attrs?.['data-tn-id']);
    expect(m.map((x) => [x.text, x.attrs?.['data-tn-id']])).toEqual([['quick brown', 'h1']]);
    expect(m[0]!.attrs!.style).toMatch(/^background-color: rgba\(\d+,\d+,\d+, \.45\)$/);
  });
});

describe('live preview: plain brackets', () => {
  it('"[1]" without a definition stays text', () => {
    const d = decos(make('see [1] and [x]'));
    expect(d).toEqual([]);
  });
  it('reference link with a definition', () => {
    const d = decos(make('read [the spec][s]\n\n[s]: https://spec.org'));
    expect(d.find((x) => x.cls === 'cm-lp-link')?.attrs?.['data-href']).toBe('https://spec.org');
  });
});
