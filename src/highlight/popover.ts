// Floating popover for an existing highlight (plain DOM inside a closed-style Shadow DOM). Owner: agent C.
import type { HighlightColor } from '@/src/core/types';
import { COLORS, SWATCH } from './render';
import { t } from './strings';
import { isTrustedEvent, shadowMode } from '@/src/core/dom-guard';

const HOST_ID = 'tn-popover-host';
const NOTE_DEBOUNCE_MS = 500;

const svg = (inner: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
// Same paths as src/ui/icons.tsx (Preact components cannot be imported cheaply into the content script).
const ICON_COPY = svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>');
const ICON_CHECK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
const ICON_TRASH = svg('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>');

const STYLE = `
:host{all:initial}
.box{position:absolute;z-index:2147483647;width:248px;box-sizing:border-box;padding:10px;border-radius:10px;
 background:#fff;color:#1f2328;border:1px solid #d8dee4;box-shadow:0 8px 24px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12);
 font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){.box{background:#22272e;color:#e6edf3;border-color:#444c56;box-shadow:0 8px 24px rgba(0,0,0,.5)}}
.row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.sw{width:18px;height:18px;border-radius:50%;border:0;padding:0;cursor:pointer;transition:box-shadow .12s}
.sw:hover{box-shadow:0 0 0 2px rgba(128,128,128,.45)}
.sw.active{box-shadow:0 0 0 2px #fff,0 0 0 4px #1f2328}
@media (prefers-color-scheme:dark){.sw.active{box-shadow:0 0 0 2px #22272e,0 0 0 4px #e6edf3}}
textarea{width:100%;box-sizing:border-box;min-height:64px;resize:vertical;font:inherit;padding:6px 8px;border-radius:8px;
 border:1px solid #d8dee4;background:transparent;color:inherit;outline:none}
textarea:focus{border-color:#0969da;box-shadow:0 0 0 2px rgba(9,105,218,.25)}
@media (prefers-color-scheme:dark){textarea{border-color:#444c56}}
.actions{display:flex;justify-content:flex-end;gap:4px;margin-top:8px}
button.act{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;cursor:pointer;
 border:0;border-radius:8px;background:transparent;color:inherit;opacity:.75}
button.act:hover{opacity:1;background:rgba(128,128,128,.18)}
button.del:hover{color:#cf222e}
`;

export interface PopoverOptions {
  mark: HTMLElement;
  color: HighlightColor;
  note: string;
  text: string;
  onColor(color: HighlightColor): void;
  onNote(note: string): void;
  onDelete(): void;
}

/** Open the popover next to a mark. Returns close(), which also flushes a pending note edit. */
export function openPopover(o: PopoverOptions): () => void {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: shadowMode() });

  const style = document.createElement('style');
  style.textContent = STYLE;
  const box = document.createElement('div');
  box.className = 'box';

  const swatches = document.createElement('div');
  swatches.className = 'row';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = `sw${c === o.color ? ' active' : ''}`;
    b.dataset.color = c;
    b.title = t(c);
    b.style.background = SWATCH[c];
    b.addEventListener('click', (e) => {
      if (!isTrustedEvent(e)) return;
      o.color = c;
      swatches.querySelectorAll('.sw').forEach((x) => x.classList.toggle('active', x === b));
      o.onColor(c);
    });
    swatches.appendChild(b);
  }

  const ta = document.createElement('textarea');
  ta.value = o.note;
  ta.placeholder = t('note');

  let saved = o.note;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (ta.value !== saved) {
      saved = ta.value;
      o.onNote(ta.value);
    }
  };
  ta.addEventListener('input', (e) => {
    if (!isTrustedEvent(e)) return;
    clearTimeout(timer);
    timer = setTimeout(flush, NOTE_DEBOUNCE_MS);
  });

  const actions = document.createElement('div');
  actions.className = 'actions';
  const copy = document.createElement('button');
  copy.className = 'act copy';
  copy.innerHTML = ICON_COPY;
  copy.title = t('copy');
  copy.setAttribute('aria-label', t('copy'));
  copy.addEventListener('click', (e) => {
    if (!isTrustedEvent(e)) return;
    navigator.clipboard.writeText(o.text).then(
      () => {
        copy.innerHTML = ICON_CHECK;
        copy.title = t('copied');
        copy.setAttribute('aria-label', t('copied'));
      },
      () => { /* clipboard denied: nothing sensible to do in a page popover */ },
    );
  });
  const del = document.createElement('button');
  del.className = 'act del';
  del.innerHTML = ICON_TRASH;
  del.title = t('delete');
  del.setAttribute('aria-label', t('delete'));
  del.addEventListener('click', (e) => {
    if (!isTrustedEvent(e)) return;
    o.onDelete();
    close(false);
  });
  actions.append(copy, del);

  box.append(swatches, ta, actions);
  root.append(style, box);

  const rect = o.mark.getBoundingClientRect();
  box.style.left = `${Math.max(4, rect.left + window.scrollX)}px`;
  box.style.top = `${rect.bottom + window.scrollY + 6}px`;
  document.body.appendChild(host);

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const onDown = (e: Event) => {
    if (!e.composedPath().includes(host)) close();
  };

  function close(doFlush = true): void {
    if (doFlush) flush();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onDown, true);
    host.remove();
  }

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onDown, true);
  return () => close();
}
