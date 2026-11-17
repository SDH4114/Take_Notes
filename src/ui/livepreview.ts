// Obsidian-style live preview for the CodeMirror Markdown editor: one view that is both the rendered note and the editor.
// Markup (**, #, [](), ==, $…$ delimiters…) is hidden and the result shown in place; the element under the cursor
// (inline: the element itself, block marks: its line, tables: the whole table) shows its source again for editing.
// Decorations come from a StateField (not a ViewPlugin): tables are replaced as whole blocks, which plugins may not do.
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { type EditorState, type Extension, type Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { colorHex, hexToRgb } from '@/src/core/colors';
import { setHtml } from '@/src/core/html';
import type { Highlight } from '@/src/core/types';
import { findHighlightsInMarkdown } from '@/src/highlight/apply';
import { renderMarkdown } from './markdown';

// ---------------------------------------------------------------- state

/** Editor focus (from focusChangeEffect); without focus nothing is revealed. Exported for tests. */
export const setFocused = StateEffect.define<boolean>();
const focusedField = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setFocused)) v = e.value;
    return v;
  },
});

/** Page highlights to color inside the note (found by their text). */
export const setHighlights = StateEffect.define<readonly Highlight[]>();
const highlightsField = StateField.define<readonly Highlight[]>({
  create: () => [],
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setHighlights)) v = e.value;
    return v;
  },
});

// ---------------------------------------------------------------- widgets

class BulletWidget extends WidgetType {
  override eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-bullet';
    s.textContent = '•';
    return s;
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }
  override eq(o: TaskWidget) { return o.checked === this.checked && o.pos === this.pos; }
  toDOM() {
    const s = document.createElement('span');
    s.className = `cm-lp-task${this.checked ? ' on' : ''}`;
    s.dataset.pos = String(this.pos);
    s.setAttribute('role', 'checkbox');
    s.setAttribute('aria-checked', String(this.checked));
    return s;
  }
  override ignoreEvent() { return false; }
}

class HrWidget extends WidgetType {
  override eq() { return true; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-hr';
    return s;
  }
}

class LabelWidget extends WidgetType {
  constructor(readonly text: string, readonly cls: string) { super(); }
  override eq(o: LabelWidget) { return o.text === this.text && o.cls === this.cls; }
  toDOM() {
    const s = document.createElement('span');
    s.className = this.cls;
    s.textContent = this.text;
    return s;
  }
}

/** Only these image sources are loaded; anything else is shown as its alt text. */
export function safeImageSrc(src: string): string | null {
  const s = src.trim();
  return /^(https?:|blob:|data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,])/i.test(s) ? s : null;
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  override eq(o: ImageWidget) { return o.src === this.src && o.alt === this.alt; }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-lp-img';
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    return img;
  }
}

/** A GFM table rendered by the same (sanitizing) renderer as exports. */
class TableWidget extends WidgetType {
  constructor(readonly source: string) { super(); }
  override eq(o: TableWidget) { return o.source === this.source; }
  toDOM() {
    const d = document.createElement('div');
    d.className = 'cm-lp-table md';
    setHtml(d, renderMarkdown(this.source)); // sanitized with DOMPurify
    return d;
  }
  override ignoreEvent() { return false; }
}

// ---------------------------------------------------------------- building

const hide = Decoration.replace({});
const line = (cls: string) => Decoration.line({ class: cls });

/** `[label]: url` definitions (lower-cased labels), for reference images and links. */
function linkDefinitions(text: string): Map<string, string> {
  const defs = new Map<string, string>();
  for (const m of text.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*<?([^\s>]+)>?/gm)) {
    const key = m[1]!.trim().toLowerCase();
    if (!defs.has(key)) defs.set(key, m[2]!);
  }
  return defs;
}

/** $$…$$ blocks and $…$ inline math (same rules as the renderer in markdown.ts), outside code. */
function mathRanges(text: string, code: Array<[number, number]>): Array<{ from: number; to: number; block: boolean }> {
  const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);
  const out: Array<{ from: number; to: number; block: boolean }> = [];
  for (const m of text.matchAll(/\$\$[\s\S]+?\$\$/g)) {
    if (!inCode(m.index!)) out.push({ from: m.index!, to: m.index! + m[0].length, block: true });
  }
  const inBlock = (i: number) => out.some((r) => i >= r.from && i < r.to);
  for (const m of text.matchAll(/(?<!\$)\$(?![\s$])([^$\n]+?)(?<!\s)\$(?![\d$])/g)) {
    if (!inCode(m.index!) && !inBlock(m.index!)) out.push({ from: m.index!, to: m.index! + m[0].length, block: false });
  }
  return out;
}

const childrenOf = (n: SyntaxNode, name: string): SyntaxNode[] => {
  const out: SyntaxNode[] = [];
  for (let c = n.firstChild; c; c = c.nextSibling) if (c.name === name) out.push(c);
  return out;
};

/**
 * All live-preview decorations for a state. Exported for tests. Without focus nothing is revealed, so a note that is
 * only being read looks fully rendered.
 */
export function buildLivePreview(state: EditorState): DecorationSet {
  const doc = state.doc;
  const text = doc.toString();
  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state);
  const focused = state.field(focusedField, false) ?? false;
  const sel = focused ? state.selection.ranges : [];
  const touches = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);
  const activeLine = (pos: number) => {
    const l = doc.lineAt(pos);
    return touches(l.from, l.to);
  };
  const out: Range<Decoration>[] = [];
  const defs = linkDefinitions(text);

  // Code (from the parse tree) is left alone by everything regex-based.
  const code: Array<[number, number]> = [];
  tree.iterate({
    enter(n) {
      if (n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'InlineCode') { code.push([n.from, n.to]); return false; }
      return undefined;
    },
  });
  const math = mathRanges(text, code);
  const inMath = (from: number, to: number) => math.some((r) => from < r.to && to > r.from);
  const covered: Array<[number, number]> = []; // replaced as a whole (tables): nothing else inside
  const isCovered = (from: number, to: number) => covered.some(([a, b]) => from < b && to > a);
  const WIKI = /\[\[([^\]\n|#^]+)((?:[#^][^\]\n|]*)?)(?:\|([^\]\n]*))?\]\]/g;
  const wikis = [...text.matchAll(WIKI)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]);

  const hideMarkWithSpace = (m: SyntaxNode) => {
    const after = doc.sliceString(m.to, m.to + 1) === ' ' ? 1 : 0;
    out.push(hide.range(m.from, m.to + after));
  };

  tree.iterate({
    enter(ref) {
      const n = ref.node;
      const name = n.name;
      // Inside math ($a_1 b_2$) underscores are not emphasis.
      if (math.some((r) => n.from >= r.from && n.to <= r.to)) return false;

      if (name === 'FencedCode') {
        const first = doc.lineAt(n.from), last = doc.lineAt(n.to);
        for (let l = first.number; l <= last.number; l++) {
          const ln = doc.line(l);
          out.push(line(`cm-lp-code${l === first.number ? ' cm-lp-code-first' : ''}${l === last.number ? ' cm-lp-code-last' : ''}`).range(ln.from));
        }
        if (!touches(n.from, n.to)) {
          const lang = n.getChild('CodeInfo');
          const label = lang ? doc.sliceString(lang.from, lang.to) : '';
          if (first.to > first.from) out.push(Decoration.replace({ widget: new LabelWidget(label, 'cm-lp-code-lang') }).range(first.from, first.to));
          const closing = childrenOf(n, 'CodeMark');
          if (last.number !== first.number && closing.length > 1 && last.to > last.from) out.push(hide.range(last.from, last.to));
        }
        return false;
      }
      if (name === 'CodeBlock') {
        for (let l = doc.lineAt(n.from).number; l <= doc.lineAt(n.to).number; l++) out.push(line('cm-lp-code').range(doc.line(l).from));
        return false;
      }
      if (name === 'InlineCode') {
        if (!touches(n.from, n.to)) for (const m of childrenOf(n, 'CodeMark')) out.push(hide.range(m.from, m.to));
        return false;
      }
      if (name === 'Table') {
        const from = doc.lineAt(n.from).from, to = doc.lineAt(n.to).to;
        if (!touches(from, to)) {
          out.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(from, to)), block: true }).range(from, to));
          covered.push([from, to]);
        }
        return false;
      }
      if (/^ATXHeading[1-6]$/.test(name)) {
        out.push(line(`cm-lp-h cm-lp-h${name.slice(-1)}`).range(doc.lineAt(n.from).from));
        if (!activeLine(n.from)) {
          const marks = childrenOf(n, 'HeaderMark');
          marks.forEach((m, i) => (i === 0 ? hideMarkWithSpace(m) : out.push(hide.range(m.from, m.to))));
        }
        return undefined;
      }
      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const mark = n.getChild('HeaderMark');
        if (mark && !activeLine(mark.from)) out.push(hide.range(mark.from, mark.to));
        return undefined;
      }
      if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough') {
        if (!touches(n.from, n.to)) {
          for (const m of childrenOf(n, name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark')) out.push(hide.range(m.from, m.to));
        }
        return undefined;
      }
      if (name === 'Blockquote') {
        for (let l = doc.lineAt(n.from).number; l <= doc.lineAt(n.to).number; l++) out.push(line('cm-lp-quote').range(doc.line(l).from));
        return undefined;
      }
      if (name === 'QuoteMark') {
        if (!activeLine(n.from)) hideMarkWithSpace(n);
        return undefined;
      }
      if (name === 'ListMark') {
        const item = n.parent;
        const task = item?.getChild('Task');
        if (activeLine(n.from)) return undefined;
        if (task) hideMarkWithSpace(n);
        else if (item?.parent?.name === 'BulletList') out.push(Decoration.replace({ widget: new BulletWidget() }).range(n.from, n.to));
        return undefined;
      }
      if (name === 'TaskMarker') {
        if (!activeLine(n.from)) {
          const checked = /x/i.test(doc.sliceString(n.from, n.to));
          out.push(Decoration.replace({ widget: new TaskWidget(checked, n.from) }).range(n.from, n.to));
          if (checked) {
            const ln = doc.lineAt(n.from);
            if (n.to + 1 < ln.to) out.push(Decoration.mark({ class: 'cm-lp-done' }).range(n.to + 1, ln.to));
          }
        }
        return undefined;
      }
      if (name === 'HorizontalRule') {
        if (!activeLine(n.from)) out.push(Decoration.replace({ widget: new HrWidget() }).range(n.from, n.to));
        return false;
      }
      if (name === 'Image') {
        if (touches(n.from, n.to)) return false;
        const src = imageSource(n, doc.sliceString.bind(doc), defs);
        const raw = doc.sliceString(n.from, n.to);
        const alt = /^!\[([^\]]*)\]/.exec(raw)?.[1] ?? '';
        const safe = src ? safeImageSrc(src) : null;
        out.push(Decoration.replace({ widget: safe ? new ImageWidget(safe, alt) : new LabelWidget(alt || raw, 'cm-lp-img-alt') }).range(n.from, n.to));
        return false;
      }
      if (name === 'Link') {
        const marks = childrenOf(n, 'LinkMark');
        // [[wikilinks]] are handled below; the parser sees "[x]" in them as a link.
        if (marks.length < 2 || wikis.some(([a, b]) => n.from < b && n.to > a)) return undefined;
        const open = marks[0]!, close = marks[1]!;
        const url = n.getChild('URL');
        const label = n.getChild('LinkLabel');
        const href = url ? doc.sliceString(url.from, url.to)
          : defs.get((label ? doc.sliceString(label.from + 1, label.to - 1) : doc.sliceString(open.to, close.from)).trim().toLowerCase());
        if (!href) return undefined; // "[1]" without a definition is plain text
        const editing = touches(n.from, n.to);
        if (close.from > open.to) {
          const attributes: Record<string, string> = { 'data-href': href, title: href };
          if (editing) attributes['data-editing'] = '1';
          out.push(Decoration.mark({ class: 'cm-lp-link', attributes }).range(open.to, close.from));
        }
        if (!editing) {
          out.push(hide.range(open.from, open.to));
          out.push(hide.range(close.from, n.to));
        }
        return undefined;
      }
      if (name === 'URL' && n.parent?.name !== 'Link' && n.parent?.name !== 'Image' && n.parent?.name !== 'LinkReference') {
        const href = doc.sliceString(n.from, n.to);
        if (/^(https?:|mailto:)/i.test(href) || /^www\./i.test(href)) {
          out.push(Decoration.mark({ class: 'cm-lp-link', attributes: { 'data-href': /^www\./i.test(href) ? `https://${href}` : href } }).range(n.from, n.to));
        }
        return undefined;
      }
      if (name === 'LinkReference') {
        // Imported notes keep images as `[img-1]: <data:…>` lines: a long unreadable base64 run unless the cursor is there.
        const url = n.getChild('URL');
        if (url && /^<?data:/i.test(doc.sliceString(url.from, url.to)) && !activeLine(n.from)) {
          const label = n.getChild('LinkLabel');
          out.push(Decoration.replace({ widget: new LabelWidget(label ? doc.sliceString(label.from, label.to) : '[…]', 'cm-lp-ref') }).range(n.from, n.to));
        }
        return false;
      }
      return undefined;
    },
  });

  // ---- syntax the parser doesn't know: math, ==mark==, [[wikilinks]]
  const skip = (from: number, to: number) => code.some(([a, b]) => from < b && to > a) || isCovered(from, to);
  for (const r of math) {
    if (isCovered(r.from, r.to)) continue;
    const d = r.block ? 2 : 1;
    if (r.block) {
      for (let l = doc.lineAt(r.from).number; l <= doc.lineAt(r.to).number; l++) out.push(line('cm-lp-mathblock').range(doc.line(l).from));
    }
    out.push(Decoration.mark({ class: 'cm-lp-math' }).range(r.from, r.to));
    if (!touches(r.from, r.to)) { out.push(hide.range(r.from, r.from + d)); out.push(hide.range(r.to - d, r.to)); }
  }
  for (const m of text.matchAll(/==(?=\S)[^=\n]+?==/g)) {
    const from = m.index!, to = from + m[0].length;
    if (skip(from, to) || inMath(from, to)) continue;
    out.push(Decoration.mark({ class: 'cm-hl-mark' }).range(from, to));
    if (!touches(from, to)) { out.push(hide.range(from, from + 2)); out.push(hide.range(to - 2, to)); }
  }
  for (const m of text.matchAll(WIKI)) {
    const from = m.index!, to = from + m[0].length;
    if (skip(from, to) || inMath(from, to)) continue;
    const target = m[1]!.trim();
    const aliasAt = m[3] !== undefined ? to - 2 - m[3].length : -1;
    if (touches(from, to)) {
      out.push(Decoration.mark({ class: 'cm-lp-wikilink', attributes: { 'data-wikilink': target, 'data-editing': '1' } }).range(from + 2, to - 2));
    } else if (aliasAt >= 0 && m[3]!.trim()) {
      out.push(hide.range(from, aliasAt));
      out.push(Decoration.mark({ class: 'cm-lp-wikilink', attributes: { 'data-wikilink': target } }).range(aliasAt, to - 2));
      out.push(hide.range(to - 2, to));
    } else {
      const end = aliasAt >= 0 ? aliasAt - 1 : to - 2; // empty alias "[[x|]]" shows the target
      out.push(hide.range(from, from + 2));
      out.push(Decoration.mark({ class: 'cm-lp-wikilink', attributes: { 'data-wikilink': target } }).range(from + 2, end));
      out.push(hide.range(end, to));
    }
  }

  // ---- highlights made on the clip's page
  for (const { h, from, to } of findHighlightsInMarkdown(text, state.field(highlightsField, false) ?? [])) {
    if (isCovered(from, to)) continue;
    const attributes: Record<string, string> = {
      class: 'cm-lp-hl', 'data-tn-id': h.id,
      // colorHex() validates: only #rrggbb ever reaches the style attribute.
      style: `background-color: rgba(${hexToRgb(colorHex(h.color))}, .45)`,
    };
    if (h.note) attributes.title = h.note;
    out.push(Decoration.mark({ attributes }).range(from, to));
  }

  return Decoration.set(out, true);
}

/** Image URL: inline `![a](url "t")`, or `![a][ref]` / `![ref]` via the definitions. */
function imageSource(n: SyntaxNode, slice: (from: number, to: number) => string, defs: Map<string, string>): string | undefined {
  const url = n.getChild('URL');
  if (url) return slice(url.from, url.to).replace(/^<|>$/g, '');
  const label = n.getChild('LinkLabel');
  const raw = slice(n.from, n.to);
  const key = label ? slice(label.from + 1, label.to - 1) : /^!\[([^\]]*)\]/.exec(raw)?.[1] ?? '';
  return defs.get(key.trim().toLowerCase())?.replace(/^<|>$/g, '');
}

const decorationsField = StateField.define<DecorationSet>({
  create: (s) => buildLivePreview(s),
  update(deco, tr) {
    const focusChanged = tr.effects.some((e) => e.is(setFocused) || e.is(setHighlights));
    if (tr.docChanged || tr.selection || focusChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return buildLivePreview(tr.state);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  '.cm-lp-h': { paddingTop: '.35em' },
  '.cm-lp-h1, .cm-lp-h2': { paddingTop: '.6em' },
  '.cm-lp-quote': { borderLeft: '3px solid var(--border-strong)', paddingLeft: '14px !important', color: 'var(--fg-sub)' },
  '.cm-lp-code': { fontFamily: 'var(--mono)', fontSize: '.88em', backgroundColor: 'var(--bg-sub)', padding: '0 14px !important' },
  '.cm-lp-code-first': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px', paddingTop: '4px !important' },
  '.cm-lp-code-last': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', paddingBottom: '4px !important' },
  '.cm-lp-code-lang': { color: 'var(--muted)', fontSize: '.85em' },
  '.cm-lp-bullet': { display: 'inline-block', width: '.9em', color: 'var(--muted)', fontWeight: '700' },
  '.cm-lp-task': {
    display: 'inline-block', width: '14px', height: '14px', marginRight: '6px', verticalAlign: '-2px',
    border: '1.5px solid var(--border-strong)', borderRadius: '4px', cursor: 'pointer', boxSizing: 'border-box',
  },
  '.cm-lp-task.on': {
    backgroundColor: 'var(--accent)', borderColor: 'var(--accent)',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  },
  '.cm-lp-done': { color: 'var(--muted)', textDecoration: 'line-through' },
  '.cm-lp-hr': { display: 'inline-block', width: '100%', borderTop: '1px solid var(--border-strong)', verticalAlign: 'middle' },
  '.cm-lp-link': { color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px', cursor: 'pointer' },
  '.cm-lp-wikilink': { color: 'var(--accent)', borderBottom: '1px dashed currentColor', cursor: 'pointer' },
  '.cm-lp-img': { display: 'inline-block', maxWidth: '100%', maxHeight: '480px', borderRadius: '6px', verticalAlign: 'bottom' },
  '.cm-lp-img-alt, .cm-lp-ref': { color: 'var(--muted)', fontSize: '.85em' },
  '.cm-lp-math': { fontFamily: 'var(--mono)', fontSize: '.92em', color: 'var(--fg-sub)' },
  '.cm-lp-mathblock': { textAlign: 'center' },
  '.cm-lp-table': { cursor: 'text', padding: '4px 0' },
  '.cm-lp-hl': { borderRadius: '2px', transition: 'box-shadow .2s' },
  '.cm-lp-hl.flash': { boxShadow: '0 0 0 3px var(--accent)' },
});

export interface LivePreviewOptions {
  /** A [[wikilink]] was clicked. */
  onWikilink?: (target: string) => void;
}

/** The live-preview extension: decorations, focus tracking and clicks on links, checkboxes and tables. */
export function livePreview(opts: LivePreviewOptions = {}): Extension {
  return [
    focusedField, highlightsField, decorationsField, theme,
    EditorView.focusChangeEffect.of((_s, focusing) => setFocused.of(focusing)),
    EditorView.domEventHandlers({
      mousedown(e, view) {
        if (e.button !== 0) return false;
        const el = e.target as HTMLElement | null;
        const task = el?.closest<HTMLElement>('.cm-lp-task');
        if (task) {
          const pos = Number(task.dataset.pos);
          const cur = view.state.doc.sliceString(pos, pos + 3);
          if (/^\[[ xX]\]$/.test(cur)) {
            view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: cur[1] === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
          }
          e.preventDefault();
          return true;
        }
        // A link whose source is shown (cursor inside) is being edited: the click just places the cursor.
        const wiki = el?.closest<HTMLElement>('[data-wikilink]');
        if (wiki && !wiki.dataset.editing) {
          e.preventDefault();
          opts.onWikilink?.(wiki.dataset.wikilink ?? '');
          return true;
        }
        const link = el?.closest<HTMLElement>('.cm-lp-link[data-href], .cm-lp-table a[href]');
        if (link && !link.dataset.editing) {
          const href = link.dataset.href ?? link.getAttribute('href') ?? '';
          if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer');
          e.preventDefault();
          return true;
        }
        const table = el?.closest<HTMLElement>('.cm-lp-table');
        if (table) {
          // Show the table's source with the cursor at its start.
          const pos = view.posAtDOM(table);
          view.focus();
          view.dispatch({ selection: { anchor: pos }, scrollIntoView: false });
          e.preventDefault();
          return true;
        }
        return false;
      },
    }),
  ];
}
