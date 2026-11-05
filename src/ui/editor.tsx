// Reusable Markdown editor (CodeMirror 6) with a formatting toolbar. Styling follows the tokens in base.css.
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, MatchDecorator, placeholder as cmPlaceholder, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'preact/hooks';
import { translator } from '@/src/core/i18n';
import {
  cycleHeading, diffChange, toggleBlockquote, toggleBulletList, toggleCode, toggleLink, toggleOrderedList, toggleWrap,
  type Edit, type Sel,
} from '@/src/library/format';
import { IconButton } from './components';
import type { IconName } from './icons';

const t = translator({
  ru: {
    heading: 'Заголовок (H1 / H2 / H3 / обычный)', bold: 'Жирный', italic: 'Курсив', mark: 'Маркер', strike: 'Зачёркнутый',
    code: 'Код', link: 'Ссылка', quote: 'Цитата', list: 'Список', ordered: 'Нумерованный список', placeholder: 'Пишите в Markdown…',
  },
  en: {
    heading: 'Heading (H1 / H2 / H3 / none)', bold: 'Bold', italic: 'Italic', mark: 'Highlight', strike: 'Strikethrough',
    code: 'Code', link: 'Link', quote: 'Quote', list: 'Bullet list', ordered: 'Numbered list', placeholder: 'Write in Markdown…',
  },
});

const isMac = /mac/i.test(globalThis.navigator?.platform ?? '');
const mod = isMac ? '⌘' : 'Ctrl+';
const shift = isMac ? '⇧' : 'Shift+';

type Command = (text: string, sel: Sel) => Edit;

interface Action { id: string; icon: IconName; label: () => string; keys?: string; shortcut?: string; run: Command }
const ACTIONS: Action[] = [
  { id: 'heading', icon: 'heading', label: () => t('heading'), run: cycleHeading },
  { id: 'bold', icon: 'bold', label: () => t('bold'), keys: 'Mod-b', shortcut: `${mod}B`, run: (x, s) => toggleWrap(x, s, '**') },
  { id: 'italic', icon: 'italic', label: () => t('italic'), keys: 'Mod-i', shortcut: `${mod}I`, run: (x, s) => toggleWrap(x, s, '*') },
  { id: 'mark', icon: 'highlighter', label: () => t('mark'), keys: 'Mod-Shift-h', shortcut: `${mod}${shift}H`, run: (x, s) => toggleWrap(x, s, '==') },
  { id: 'strike', icon: 'strike', label: () => t('strike'), keys: 'Mod-Shift-x', shortcut: `${mod}${shift}X`, run: (x, s) => toggleWrap(x, s, '~~') },
  { id: 'code', icon: 'code', label: () => t('code'), keys: 'Mod-e', shortcut: `${mod}E`, run: toggleCode },
  { id: 'link', icon: 'link', label: () => t('link'), keys: 'Mod-k', shortcut: `${mod}K`, run: toggleLink },
  { id: 'quote', icon: 'quote', label: () => t('quote'), run: toggleBlockquote },
  { id: 'list', icon: 'list', label: () => t('list'), run: toggleBulletList },
  { id: 'ordered', icon: 'listOrdered', label: () => t('ordered'), run: toggleOrderedList },
];

/** Apply a pure formatting command to the main selection, touching only the changed range. */
function applyFormat(view: EditorView, run: Command): boolean {
  const main = view.state.selection.main;
  const before = view.state.doc.toString();
  const edit = run(before, { from: main.from, to: main.to });
  const change = diffChange(before, edit.text);
  view.dispatch({
    changes: change,
    selection: EditorSelection.range(edit.from, edit.to),
    scrollIntoView: true,
    userEvent: 'input.format',
  });
  view.focus();
  return true;
}

// ==highlight== gets a yellow background
const markDeco = Decoration.mark({ class: 'cm-hl-mark' });
const markMatcher = new MatchDecorator({ regexp: /==(?=\S)[^=\n]+?==/g, decoration: () => markDeco });
const markPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = markMatcher.createDeco(view); }
    update(u: ViewUpdate) { this.decorations = markMatcher.updateDeco(u, this.decorations); }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--fg)', fontSize: '15px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '20px 28px 120px', maxWidth: '760px', margin: '0 auto', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-hl-mark': { backgroundColor: 'color-mix(in srgb, var(--hl-yellow) 55%, transparent)', borderRadius: '3px' },
  '.cm-placeholder': { color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--bg-sub)', color: 'var(--fg)', borderColor: 'var(--border)' },
  '.cm-panels input, .cm-panels button': { font: '12px var(--font)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--hl-yellow) 50%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--hl-blue) 60%, transparent)' },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.7em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '700' },
  { tag: tags.heading3, fontSize: '1.18em', fontWeight: '650' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '650' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: tags.monospace, fontFamily: 'var(--mono)', fontSize: '.9em', backgroundColor: 'var(--bg-hover)', borderRadius: '3px' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--accent)', opacity: '.75' },
  { tag: tags.quote, color: 'var(--fg-sub)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--muted)' },
]);

/** Typing * _ ~ = over a selection wraps it (the pair is not auto-inserted, so lists and snake_case stay untouched). */
const wrapOnType = EditorView.inputHandler.of((view, from, to, text) => {
  if (from === to || text.length !== 1 || !'*_~='.includes(text)) return false;
  view.dispatch({
    changes: [{ from, insert: text }, { from: to, insert: text }],
    selection: EditorSelection.range(from + 1, to + 1),
    userEvent: 'input.type',
  });
  return true;
});

export interface EditorApi {
  focus(): void;
  /** Scroll to a 0..1 fraction of the scrollable height. */
  scrollToRatio(r: number): void;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onScroll?: (ratio: number) => void;
  onReady?: (api: EditorApi) => void;
  autofocus?: boolean;
  hideToolbar?: boolean;
}

/**
 * The editor owns its document: `value` is applied from outside only while the editor is not focused, so reloads of
 * the surrounding data never move the cursor or overwrite text being typed. Remount (key=...) to switch documents.
 */
export function MarkdownEditor(p: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(p);
  cb.current = p;
  const suppress = useRef(false);

  useEffect(() => {
    const extensions: Extension[] = [
      history(), closeBrackets(), search({ top: true }), markdown({ base: markdownLanguage }), syntaxHighlighting(highlightStyle), markPlugin,
      EditorView.lineWrapping, cmPlaceholder(t('placeholder')), theme, wrapOnType,
      EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{', '`'] } }]),
      keymap.of([
        ...ACTIONS.filter((a) => a.keys).map((a) => ({ key: a.keys!, preventDefault: true, run: (v: EditorView) => applyFormat(v, a.run) })),
        { key: 'Mod-s', preventDefault: true, run: () => { cb.current.onSave?.(); return true; } },
        ...closeBracketsKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !suppress.current) cb.current.onChange(u.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        scroll: (_e, v) => {
          const d = v.scrollDOM;
          const max = d.scrollHeight - d.clientHeight;
          cb.current.onScroll?.(max > 0 ? d.scrollTop / max : 0);
        },
      }),
    ];
    const v = new EditorView({ parent: host.current!, state: EditorState.create({ doc: cb.current.value, extensions }) });
    view.current = v;
    cb.current.onReady?.({
      focus: () => v.focus(),
      scrollToRatio: (r) => { v.scrollDOM.scrollTop = r * (v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight); },
    });
    if (cb.current.autofocus) v.focus();
    return () => { v.destroy(); view.current = null; };
  }, []);

  // External value changes (e.g. refreshed data) are ignored while the user is working in the editor.
  useEffect(() => {
    const v = view.current;
    if (!v || v.hasFocus) return;
    const current = v.state.doc.toString();
    if (current === p.value) return;
    suppress.current = true;
    try { v.dispatch({ changes: diffChange(current, p.value) }); } finally { suppress.current = false; }
  }, [p.value]);

  return (
    <div class="md-editor">
      {!p.hideToolbar && (
        <div class="md-toolbar" role="toolbar">
          {ACTIONS.map((a) => (
            <IconButton key={a.id} icon={a.icon} title={a.shortcut ? `${a.label()} (${a.shortcut})` : a.label()}
              onClick={() => { if (view.current) applyFormat(view.current, a.run); }} />
          ))}
        </div>
      )}
      <div class="md-editor-host" ref={host} />
    </div>
  );
}
