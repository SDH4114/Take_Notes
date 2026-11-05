// Rendering of highlights as <mark> wrappers around text nodes. Owner: agent C.
import type { HighlightColor, TextQuoteAnchor } from '@/src/core/types';
import { resolveAnchor } from './anchor';
import { isTrustedEvent } from '@/src/core/dom-guard';

export const COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'purple'];
/** Swatch colors, also used by the popover/toolbar. */
export const SWATCH: Record<HighlightColor, string> = {
  yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', pink: '#f472b6', purple: '#a78bfa',
};

const STYLE_ID = 'tn-hl-style';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);

// Semi-transparent backgrounds and inherited text color keep text readable on light and dark sites.
function css(): string {
  const rgb: Record<HighlightColor, string> = {
    yellow: '250,204,21', green: '74,222,128', blue: '96,165,250', pink: '244,114,182', purple: '167,139,250',
  };
  const rules = COLORS.map((c) => `mark.tn-hl-${c}{background-color:rgba(${rgb[c]},.4)!important;box-shadow:0 0 0 1px rgba(${rgb[c]},.25)}`);
  // Flash: a vivid ring + brighter background; box-shadow/outline only, so text never shifts.
  const flash = [
    '@keyframes tn-hl-pulse{0%{box-shadow:0 0 0 0 rgba(255,120,0,.95),0 0 0 0 rgba(255,120,0,.6)}'
      + '35%{box-shadow:0 0 0 3px rgba(255,120,0,1),0 0 16px 6px rgba(255,120,0,.75)}'
      + '100%{box-shadow:0 0 0 0 rgba(255,120,0,0),0 0 0 0 rgba(255,120,0,0)}}',
    `mark.tn-hl.tn-hl-flash{background-color:rgba(255,190,0,.9)!important;outline:2px solid rgba(255,120,0,.9);`
      + `outline-offset:1px;animation:tn-hl-pulse .8s ease-out 1}`,
  ];
  return `mark.tn-hl{color:inherit!important;cursor:pointer;border-radius:2px;padding:0;margin:0}\n${rules.join('\n')}\n${flash.join('\n')}`;
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css();
  (doc.head ?? doc.documentElement).appendChild(s);
}

function textNodesIn(range: Range): Text[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return [root as Text];
  const doc = root.ownerDocument!;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!range.intersectsNode(n)) continue;
    const tag = n.parentElement?.tagName;
    if (tag && SKIP_TAGS.has(tag)) continue;
    out.push(n);
  }
  return out;
}

/** Wrap every text node touched by the range in its own <mark>; the DOM structure is otherwise untouched. */
export function wrapRange(range: Range, id: string, color: HighlightColor): HTMLElement[] {
  const doc = range.commonAncestorContainer.ownerDocument ?? document;
  ensureStyle(doc);
  const { startContainer, startOffset, endContainer, endOffset } = range;
  const marks: HTMLElement[] = [];
  for (const node of textNodesIn(range)) {
    const from = node === startContainer ? startOffset : 0;
    const to = node === endContainer ? endOffset : node.length;
    if (from >= to) continue;
    let target = node;
    if (to < target.length) target.splitText(to);
    if (from > 0) target = target.splitText(from);
    if (!target.data.trim()) continue; // whitespace between blocks: wrapping would break e.g. <ul>/<tr>
    const mark = doc.createElement('mark');
    mark.className = `tn-hl tn-hl-${color}`;
    mark.dataset.tnId = id;
    target.parentNode!.replaceChild(mark, target);
    mark.appendChild(target);
    marks.push(mark);
  }
  return marks;
}

export function renderHighlight(
  h: { id: string; color: HighlightColor; anchor: TextQuoteAnchor },
  root: Node = document.body,
): boolean {
  const range = resolveAnchor(h.anchor, root);
  if (!range) return false;
  return wrapRange(range, h.id, h.color).length > 0;
}

export const marksOf = (id: string): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('mark.tn-hl[data-tn-id]')].filter((m) => m.dataset.tnId === id);

function unwrap(mark: HTMLElement): void {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

export function removeHighlight(id: string): void {
  marksOf(id).forEach(unwrap);
}

const flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Add the pulse class to every mark of a highlight for `ms`, then return to normal. */
export function flashHighlight(id: string, ms: number): void {
  const marks = marksOf(id);
  clearTimeout(flashTimers.get(id));
  marks.forEach((m) => m.classList.remove('tn-hl-flash'));
  if (marks[0]) void marks[0].offsetWidth; // reflow so a repeated flash restarts the animation
  marks.forEach((m) => m.classList.add('tn-hl-flash'));
  flashTimers.set(id, setTimeout(() => {
    flashTimers.delete(id);
    marksOf(id).forEach((m) => m.classList.remove('tn-hl-flash'));
  }, ms));
}

export function recolorHighlight(id: string, color: HighlightColor): void {
  for (const m of marksOf(id)) m.className = `tn-hl tn-hl-${color}`;
}

export function clearHighlights(): void {
  document.querySelectorAll<HTMLElement>('mark.tn-hl').forEach(unwrap);
}

/** Delegated click listener: cb(id, clickedMark). Returns an uninstall function. */
export function installMarkClicks(cb: (id: string, mark: HTMLElement) => void): () => void {
  const l = (e: Event) => {
    if (!isTrustedEvent(e)) return; // page scripts must not open the note popover
    const mark = (e.target as Element | null)?.closest?.('mark.tn-hl[data-tn-id]') as HTMLElement | null;
    if (mark?.dataset.tnId) cb(mark.dataset.tnId, mark);
  };
  document.addEventListener('click', l, true);
  return () => document.removeEventListener('click', l, true);
}
