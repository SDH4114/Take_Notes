// Content-script part of the highlight module. Owner: agent C.
import { send as sendMessage, type ContentMessages, type Handlers } from '@/src/core/messages';
import type { Highlight, HighlightColor } from '@/src/core/types';
import { newId, normalizeUrl, nowIso } from '@/src/core/util';
import { extractSourceMeta } from '@/src/cite';
import { createAnchor } from './anchor';
import { openPopover } from './popover';
import {
  clearHighlights, installMarkClicks, recolorHighlight, removeHighlight, renderHighlight, wrapRange,
} from './render';
import { createSelectionToolbar, isEditable } from './toolbar';

const RETRY_DELAY_MS = 2000;

export interface ControllerDeps {
  send?: typeof sendMessage;
  location?: Pick<URL, 'href'>;
  /** Delay of the single re-anchoring attempt for content that loads late (SPA). */
  retryDelayMs?: number;
}

/** All page-side highlight logic; dependencies are injectable for tests. */
export function createHighlightController(deps: ControllerDeps = {}) {
  const send = deps.send ?? sendMessage;
  const pageUrl = () => normalizeUrl((deps.location ?? window.location).href);
  const retryDelay = deps.retryDelayMs ?? RETRY_DELAY_MS;
  const items = new Map<string, Highlight>();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopFns: Array<() => void> = [];

  async function save(h: Highlight): Promise<void> {
    try {
      items.set(h.id, await send('highlight/save', h));
    } catch (e) {
      console.warn('[take-notes] saving highlight failed', e);
    }
  }

  async function highlightSelection(color: HighlightColor = 'yellow'): Promise<Highlight | null> {
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

  async function refresh(): Promise<void> {
    clearTimeout(retryTimer);
    const list = await send('highlight/listForUrl', { url: pageUrl() });
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

  function onMarkClick(id: string, mark: HTMLElement): void {
    const h = items.get(id);
    if (!h) return;
    openPopover({
      mark, color: h.color, note: h.note ?? '', text: h.text,
      onColor: (color) => {
        recolorHighlight(id, color);
        const cur = items.get(id) ?? h;
        void save({ ...cur, color });
        items.set(id, { ...cur, color });
      },
      onNote: (note) => {
        const cur = items.get(id) ?? h;
        const next = { ...cur, note: note.trim() || undefined };
        items.set(id, next);
        void save(next);
      },
      onDelete: () => {
        removeHighlight(id);
        items.delete(id);
        send('highlight/delete', { id }).catch((e) => console.warn('[take-notes] deleting highlight failed', e));
      },
    });
  }

  function start(): void {
    const toolbar = createSelectionToolbar((color) => {
      highlightSelection(color).catch((e) => console.warn('[take-notes] highlight failed', e));
    });
    stopFns = [installMarkClicks(onMarkClick), () => toolbar.destroy()];
  }

  function stop(): void {
    clearTimeout(retryTimer);
    stopFns.forEach((f) => f());
    stopFns = [];
  }

  return { highlightSelection, refresh, start, stop };
}

/** Called once per page from entrypoints/content.ts. */
export function setupHighlightContent(): Handlers<ContentMessages> {
  const controller = createHighlightController();
  controller.start();
  controller.refresh().catch((e) => console.warn('[take-notes] loading highlights failed', e));
  return {
    'content/highlightSelection': ({ color } = {}) => controller.highlightSelection(color),
    'content/refreshHighlights': () => controller.refresh(),
  };
}
