// Floating highlight bubble under a fresh text selection (closed Shadow DOM).
// Collapsed: [default color] [›]. The arrow expands the rest of the user's palette.
import type { HighlightColor } from '@/src/core/types';
import { colorHex } from '@/src/core/colors';
import { t } from './strings';
import { isTrustedEvent, shadowMode } from '@/src/core/dom-guard';
import { setHtml } from '@/src/core/html';

const HOST_ID = 'tn-toolbar-host';
const SHOW_DELAY_MS = 60;
const GAP_PX = 8;
const EDGE_PX = 6;
const ERROR_MS = 3500;

export interface Palette { colors: string[]; defaultColor: string }

const STYLE = `
:host{all:initial}
.bar{position:absolute;z-index:2147483647;display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;
 background:#fff;border:1px solid rgba(0,0,0,.1);box-shadow:0 6px 20px rgba(0,0,0,.16),0 1px 3px rgba(0,0,0,.1);
 font:13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;animation:in .12s ease-out;transform-origin:top center}
@media (prefers-color-scheme:dark){.bar{background:#26262b;border-color:rgba(255,255,255,.12);box-shadow:0 6px 20px rgba(0,0,0,.5)}}
@keyframes in{from{opacity:0;transform:translateY(-3px) scale(.96)}}
button{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.sw{width:26px;height:26px;border-radius:50%}
.sw i{width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);transition:transform .1s}
.sw:hover i{transform:scale(1.15)}
.sw:focus-visible{outline:2px solid #5b5bd6;outline-offset:1px}
.more{width:22px;height:26px;border-radius:999px;color:#71717a}
.more:hover{background:rgba(127,127,127,.14);color:inherit}
.more svg{transition:transform .15s}
.bar.open .more svg{transform:rotate(180deg)}
.rest{display:none;align-items:center;gap:2px;padding-left:2px;margin-left:2px;border-left:1px solid rgba(127,127,127,.25)}
.bar.open .rest{display:flex;animation:in .12s ease-out}
@media (prefers-color-scheme:dark){.more{color:#a1a1aa}}
.msg{padding:4px 10px;color:#b91c1c;max-width:320px;line-height:1.3}
@media (prefers-color-scheme:dark){.msg{color:#fca5a5}}
@media (prefers-reduced-motion:reduce){.bar,.bar.open .rest{animation:none}.more svg,.sw i{transition:none}}
`;

const CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

export function isEditable(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  if (!el) return false;
  if (el.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** Bounding box of the selection in viewport coordinates. */
function selectionBox(range: Range): { left: number; right: number; bottom: number } {
  const r = range.getBoundingClientRect?.();
  return { left: r?.left ?? 0, right: r?.right ?? 0, bottom: r?.bottom ?? 0 };
}

/** Left/top (document coords) that center a bar of `width` under the box, clamped to the viewport. */
export function centeredPosition(
  box: { left: number; right: number; bottom: number }, width: number,
  view: { width: number; scrollX: number; scrollY: number },
): { left: number; top: number } {
  const center = (box.left + box.right) / 2;
  const left = Math.min(Math.max(EDGE_PX, center - width / 2), Math.max(EDGE_PX, view.width - width - EDGE_PX));
  return { left: left + view.scrollX, top: box.bottom + GAP_PX + view.scrollY };
}

export function createSelectionToolbar(
  onPick: (color: HighlightColor) => void,
  loadPalette: () => Promise<Palette> = async () => ({ colors: ['#facc15'], defaultColor: '#facc15' }),
): { destroy(): void; showError(text: string): void } {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.display = 'none';
  const root = host.attachShadow({ mode: shadowMode() });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const bar = document.createElement('div');
  bar.className = 'bar';
  root.append(style, bar);

  let palette: Palette = { colors: ['#facc15'], defaultColor: '#facc15' };
  let paletteKey = '';

  const swatch = (color: string, title: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'sw';
    b.title = title;
    b.setAttribute('aria-label', title);
    const dot = document.createElement('i');
    dot.style.background = colorHex(color);
    b.appendChild(dot);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the page selection alive
    b.addEventListener('click', (e) => {
      if (!isTrustedEvent(e)) return;
      hide();
      onPick(colorHex(color));
    });
    return b;
  };

  function build(): void {
    const key = JSON.stringify(palette);
    if (key === paletteKey) return;
    paletteKey = key;
    bar.replaceChildren();
    const [first, ...rest] = palette.colors.length ? palette.colors : [palette.defaultColor];
    bar.appendChild(swatch(first!, t('highlight')));
    if (rest.length) {
      const more = document.createElement('button');
      more.className = 'more';
      more.title = t('moreColors');
      more.setAttribute('aria-label', t('moreColors'));
      setHtml(more, CHEVRON); // static constant
      more.addEventListener('mousedown', (e) => e.preventDefault());
      more.addEventListener('click', (e) => {
        if (!isTrustedEvent(e)) return;
        bar.classList.toggle('open');
        place(); // width changed: re-center
      });
      const wrap = document.createElement('span');
      wrap.className = 'rest';
      rest.forEach((c) => wrap.appendChild(swatch(c, t('highlight'))));
      bar.append(more, wrap);
    }
  }

  let box = { left: 0, right: 0, bottom: 0 };
  function place(): void {
    const width = bar.getBoundingClientRect().width || 60;
    const pos = centeredPosition(box, width, { width: document.documentElement.clientWidth || window.innerWidth, scrollX: window.scrollX, scrollY: window.scrollY });
    bar.style.left = `${pos.left}px`;
    bar.style.top = `${pos.top}px`;
  }

  let errorTimer: ReturnType<typeof setTimeout> | undefined;
  let showingError = false;
  function hide(): void {
    clearTimeout(errorTimer);
    showingError = false;
    host.style.display = 'none';
    bar.classList.remove('open');
    host.remove();
  }

  function update(): void {
    const sel = window.getSelection();
    const empty = !sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim();
    // The error stays for its timeout; only a new selection replaces it.
    if (empty && showingError) return;
    if (!sel || empty) return hide();
    const active = document.activeElement;
    if (isEditable(sel.anchorNode) || isEditable(sel.focusNode) || isEditable(active)) return hide();
    if (host.contains(sel.anchorNode)) return hide();
    box = selectionBox(sel.getRangeAt(0));
    showingError = false;
    clearTimeout(errorTimer);
    build();
    bar.classList.remove('open');
    if (!host.isConnected) document.body.appendChild(host);
    host.style.display = '';
    place();
    // Settings may have changed since last time: refresh and rebuild if needed.
    loadPalette().then((p) => {
      palette = p;
      if (host.isConnected) { build(); place(); }
    }).catch(() => {});
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (e?: Event) => {
    // Clicks inside the bubble (e.g. the arrow) must not re-run update(), which would collapse it.
    if (e && e.composedPath?.().includes(host)) return;
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
  loadPalette().then((p) => { palette = p; }).catch(() => {});

  /** Short message in place of the swatches at the last selection (a failed save must not just vanish). */
  function showError(text: string): void {
    const msg = document.createElement('span');
    msg.className = 'msg';
    msg.setAttribute('role', 'alert');
    msg.textContent = text;
    bar.classList.remove('open');
    bar.replaceChildren(msg);
    paletteKey = ''; // next update() rebuilds the swatches
    if (!host.isConnected) document.body.appendChild(host);
    host.style.display = '';
    place();
    showingError = true;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(hide, ERROR_MS);
  }

  return {
    showError,
    destroy() {
      clearTimeout(timer);
      clearTimeout(errorTimer);
      document.removeEventListener('mouseup', schedule);
      document.removeEventListener('keyup', schedule);
      document.removeEventListener('selectionchange', onSelChange);
      host.remove();
    },
  };
}
