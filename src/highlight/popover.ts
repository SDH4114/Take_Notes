// Floating popover for an existing highlight (plain DOM inside a closed-style Shadow DOM). Owner: agent C.
import type { HighlightColor } from '@/src/core/types';
import { COLORS, SWATCH } from './render';
import { t } from './strings';
import { isTrustedEvent, shadowMode } from '@/src/core/dom-guard';

const HOST_ID = 'tn-popover-host';
const NOTE_DEBOUNCE_MS = 500;

const STYLE = `
:host{all:initial}
.box{position:absolute;z-index:2147483647;width:240px;box-sizing:border-box;padding:8px;border-radius:8px;
 background:#fff;color:#1f2328;border:1px solid #d0d7de;box-shadow:0 4px 16px rgba(0,0,0,.25);
 font:13px/1.4 system-ui,sans-serif}
@media (prefers-color-scheme:dark){.box{background:#22272e;color:#e6edf3;border-color:#444c56}}
.row{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.sw{width:20px;height:20px;border-radius:50%;border:2px solid transparent;padding:0;cursor:pointer}
.sw.active{border-color:#1f2328;box-shadow:0 0 0 2px #fff}
textarea{width:100%;box-sizing:border-box;min-height:60px;resize:vertical;font:inherit;padding:4px;border-radius:4px;
 border:1px solid #d0d7de;background:transparent;color:inherit}
.actions{display:flex;justify-content:space-between;margin-top:6px}
button.act{font:inherit;cursor:pointer;border:1px solid #d0d7de;border-radius:4px;padding:2px 8px;background:transparent;color:inherit}
button.del{color:#cf222e}
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
  copy.textContent = t('copy');
  copy.addEventListener('click', (e) => {
    if (!isTrustedEvent(e)) return;
    navigator.clipboard.writeText(o.text).then(
      () => { copy.textContent = t('copied'); },
      () => { /* clipboard denied: nothing sensible to do in a page popover */ },
    );
  });
  const del = document.createElement('button');
  del.className = 'act del';
  del.textContent = t('delete');
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
