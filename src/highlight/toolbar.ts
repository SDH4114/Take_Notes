// Small floating "highlight" toolbar shown near a fresh text selection (Shadow DOM). Owner: agent C.
import type { HighlightColor } from '@/src/core/types';
import { COLORS, SWATCH } from './render';
import { t } from './strings';
import { isTrustedEvent, shadowMode } from '@/src/core/dom-guard';

const HOST_ID = 'tn-toolbar-host';
const SHOW_DELAY_MS = 60;

const STYLE = `
:host{all:initial}
.bar{position:absolute;z-index:2147483647;display:flex;gap:6px;padding:5px 7px;border-radius:999px;
 background:#fff;border:1px solid #d0d7de;box-shadow:0 2px 10px rgba(0,0,0,.25)}
@media (prefers-color-scheme:dark){.bar{background:#22272e;border-color:#444c56}}
.dot{width:18px;height:18px;border-radius:50%;border:1px solid rgba(0,0,0,.25);padding:0;cursor:pointer}
`;

export function isEditable(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  if (!el) return false;
  if (el.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) return true;
  return (el as HTMLElement).isContentEditable === true;
}

function selectionRect(range: Range): { left: number; bottom: number } {
  const rects = range.getClientRects?.();
  const last = rects && rects.length ? rects[rects.length - 1] : range.getBoundingClientRect?.();
  return { left: last?.left ?? 0, bottom: last?.bottom ?? 0 };
}

export function createSelectionToolbar(onPick: (color: HighlightColor) => void): { destroy(): void } {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.display = 'none';
  const root = host.attachShadow({ mode: shadowMode() });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const bar = document.createElement('div');
  bar.className = 'bar';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'dot';
    b.title = `${t('highlight')}: ${t(c)}`;
    b.style.background = SWATCH[c];
    // Keep the page selection alive while clicking the toolbar.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      if (!isTrustedEvent(e)) return;
      hide();
      onPick(c);
    });
    bar.appendChild(b);
  }
  root.append(style, bar);

  function hide(): void { host.style.display = 'none'; host.remove(); }

  function update(): void {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return hide();
    const active = document.activeElement;
    if (isEditable(sel.anchorNode) || isEditable(sel.focusNode) || isEditable(active)) return hide();
    if (host.contains(sel.anchorNode)) return hide();
    const pos = selectionRect(sel.getRangeAt(0));
    bar.style.left = `${Math.max(4, pos.left + window.scrollX)}px`;
    bar.style.top = `${pos.bottom + window.scrollY + 6}px`;
    if (!host.isConnected) document.body.appendChild(host);
    host.style.display = '';
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(update, SHOW_DELAY_MS);
  };
  // mouseup/keyup: selection finished; selectionchange only matters for hiding (it fires while dragging).
  const onSelChange = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) schedule();
  };
  document.addEventListener('mouseup', schedule);
  document.addEventListener('keyup', schedule);
  document.addEventListener('selectionchange', onSelChange);
  // Host is attached lazily in update(): don't advertise the extension on every page.

  return {
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('mouseup', schedule);
      document.removeEventListener('keyup', schedule);
      document.removeEventListener('selectionchange', onSelChange);
      host.remove();
    },
  };
}
