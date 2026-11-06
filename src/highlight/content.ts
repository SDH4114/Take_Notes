// Content-script part of the highlight module. Owner: agent C.
import { send as sendMessage, type ContentMessages, type Handlers } from '@/src/core/messages';
import type { Highlight, HighlightColor } from '@/src/core/types';
import { newId, normalizeUrl, nowIso } from '@/src/core/util';
import { extractSourceMeta } from '@/src/cite';
import { createAnchor } from './anchor';
import { openPopover } from './popover';
import {
  clearHighlights, flashHighlight, installMarkClicks, marksOf, recolorHighlight, removeHighlight, renderHighlight, wrapRange,
} from './render';
import { createSelectionToolbar, isEditable } from './toolbar';
import { watchSiteActive } from '@/src/sites/content';

const RETRY_DELAY_MS = 2000;
const FOCUS_TIMEOUT_MS = 4000;
const FOCUS_POLL_MS = 100;
const FLASH_MS = 800;

export interface ControllerDeps {
  send?: typeof sendMessage;
  location?: Pick<URL, 'href'>;
  /** Delay of the single re-anchoring attempt for content that loads late (SPA). */
  retryDelayMs?: number;
  /** How long focusHighlight waits for the highlight to render. */
  focusTimeoutMs?: number;
  flashMs?: number;
}

/** All page-side highlight logic; dependencies are injectable for tests. */
export function createHighlightController(deps: ControllerDeps = {}) {
  const send = deps.send ?? sendMessage;
  const pageUrl = () => normalizeUrl((deps.location ?? window.location).href);
  const retryDelay = deps.retryDelayMs ?? RETRY_DELAY_MS;
  const focusTimeout = deps.focusTimeoutMs ?? FOCUS_TIMEOUT_MS;
  const flashMs = deps.flashMs ?? FLASH_MS;
  const items = new Map<string, Highlight>();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopFns: Array<() => void> = [];

  /** Adopt the stored result of a field update (brings in notes edited in the Library meanwhile). */
  async function patch(req: Promise<Highlight>): Promise<void> {
    try {
      const saved = await req;
      items.set(saved.id, saved);
    } catch (e) {
      console.warn('[take-notes] saving highlight failed', e);
    }
  }

  // User palette from Settings (background owns IndexedDB); refreshed whenever the bubble opens.
  let palette: { colors: string[]; defaultColor: string } | undefined;
  const loadPalette = async () => (palette = await send('highlight/palette'));

  async function highlightSelection(color?: HighlightColor): Promise<Highlight | null> {
    color ??= palette?.defaultColor ?? (await loadPalette().catch(() => undefined))?.defaultColor ?? '#facc15';
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    if (isEditable(sel.anchorNode) || isEditable(sel.focusNode) || isEditable(document.activeElement)) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const anchor = createAnchor(range);
    if (!anchor.exact) return null;

    const url = pageUrl();
    const now = nowIso();
    const h: Highlight = {
      id: newId(), url, color, anchor, text: anchor.exact,
      source: extractSourceMeta(document, url),
      // Content scripts cannot reach the extension IndexedDB: background fills in the default project.
      projectId: null, createdAt: now, updatedAt: now,
    };
    if (wrapRange(range, h.id, color).length === 0) return null;
    sel.removeAllRanges();
    try {
      const saved = await send('highlight/save', h);
      items.set(saved.id, saved);
      return saved;
    } catch (e) {
      removeHighlight(h.id);
      throw e;
    }
  }

  function renderAll(list: Highlight[]): Highlight[] {
    return list.filter((h) => !renderHighlight(h));
  }

  let generation = 0;
  async function refresh(): Promise<void> {
    clearTimeout(retryTimer);
    const gen = ++generation;
    const list = await send('highlight/listForUrl', { url: pageUrl() });
    if (gen !== generation) return; // switched off (or refreshed again) while loading
    clearHighlights();
    items.clear();
    for (const h of list) items.set(h.id, h);
    const missed = renderAll(list);
    if (missed.length) {
      retryTimer = setTimeout(() => {
        // Skip anything the user removed in the meantime.
        renderAll(missed.filter((h) => items.has(h.id)));
      }, retryDelay);
    }
  }

  function reveal(id: string): true {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    marksOf(id)[0]?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    flashHighlight(id, flashMs);
    return true;
  }

  /** Scroll to a highlight and flash it; waits for late rendering, never touches focus or selection. */
  async function focusHighlight(id: string): Promise<boolean> {
    const ticks = Math.ceil(focusTimeout / FOCUS_POLL_MS);
    for (let i = 0; ; i++) {
      const known = items.get(id);
      // Re-anchor now and then: the page text may have appeared after the first attempt (SPA).
      if (known && marksOf(id).length === 0 && i % 5 === 0) renderHighlight(known);
      if (marksOf(id).length > 0) return reveal(id);
      if (i >= ticks) break;
      await new Promise<void>((r) => setTimeout(r, FOCUS_POLL_MS));
    }
    try {
      const h = (await send('highlight/listForUrl', { url: pageUrl() })).find((x) => x.id === id);
      if (h) {
        items.set(id, h);
        renderHighlight(h);
      }
    } catch (e) {
      console.warn('[take-notes] reloading highlight failed', e);
    }
    return marksOf(id).length > 0 ? reveal(id) : false;
  }

  function onMarkClick(id: string, mark: HTMLElement): void {
    const h = items.get(id);
    if (!h) return;
    openPopover({
      mark, color: h.color, note: h.note ?? '', text: h.text, palette: palette?.colors,
      onColor: (color) => {
        recolorHighlight(id, color);
        const cur = items.get(id) ?? h;
        items.set(id, { ...cur, color });
        void patch(send('highlight/recolor', { id, color }));
      },
      onNote: (note) => {
        const cur = items.get(id) ?? h;
        items.set(id, { ...cur, note: note.trim() || undefined });
        void patch(send('highlight/setNote', { id, note: note.trim() || undefined }));
      },
      onDelete: () => {
        removeHighlight(id);
        items.delete(id);
        send('highlight/delete', { id }).catch((e) => console.warn('[take-notes] deleting highlight failed', e));
      },
    });
  }

  function start(): void {
    if (stopFns.length) return;
    const toolbar = createSelectionToolbar((color) => {
      highlightSelection(color).catch((e) => console.warn('[take-notes] highlight failed', e));
    }, loadPalette);
    stopFns = [installMarkClicks(onMarkClick), () => toolbar.destroy()];
  }

  function stop(): void {
    clearTimeout(retryTimer);
    stopFns.forEach((f) => f());
    stopFns = [];
  }

  /** Remove every rendered mark from the page (TakeNotes switched off here); data stays stored. */
  function unrender(): void {
    generation++;
    clearTimeout(retryTimer);
    clearHighlights();
    items.clear();
  }

  return { highlightSelection, refresh, focusHighlight, start, stop, unrender };
}

/** Called once per page from entrypoints/content.ts. */
export function setupHighlightContent(): Handlers<ContentMessages> {
  const controller = createHighlightController();
  // Site access decides whether the bubble and stored highlights appear; it can flip live from the popup/settings.
  watchSiteActive((active) => {
    if (active) {
      controller.start();
      controller.refresh().catch((e) => console.warn('[take-notes] loading highlights failed', e));
    } else {
      controller.stop();
      controller.unrender();
    }
  });
  return {
    'content/highlightSelection': ({ color } = {}) => controller.highlightSelection(color),
    'content/refreshHighlights': () => controller.refresh(),
    'content/focusHighlight': ({ id }) => controller.focusHighlight(id),
  };
}
