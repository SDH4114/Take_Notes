// Content-script part of the crawl module. Owner: agent D.
import type { ContentMessages, Handlers } from '@/src/core/messages';
import type { TocEntry } from '@/src/core/types';
import { translator } from '@/src/core/i18n';
import { strings } from './strings';
import { detectToc, entriesFromContainer } from './toc';
import { isTrustedEvent, shadowMode } from '@/src/core/dom-guard';

/** Nearest ancestor-or-self that holds at least two links (a menu), or null. */
export function findLinkContainer(el: Element): Element | null {
  for (let n: Element | null = el; n && n !== n.ownerDocument.documentElement; n = n.parentElement) {
    if (n.querySelectorAll('a[href]').length >= 2) return n;
  }
  return null;
}

const OVERLAY_CSS = `
.box { position: fixed; pointer-events: none; border: 2px solid #3b6ef5; background: rgba(59,110,245,.15); z-index: 2147483646; display: none; }
.hint { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; pointer-events: none;
  font: 14px system-ui, sans-serif; background: #1d1d1f; color: #fff; padding: 8px 14px; border-radius: 8px; }`;

/**
 * Manual mode: highlight the menu under the cursor, click to select, Esc to cancel (resolves []).
 * The overlay lives in a Shadow DOM so page styles cannot affect it.
 */
export function pickToc(doc: Document, pageUrl: string): Promise<TocEntry[]> {
  const t = translator(strings);
  const host = doc.createElement('div');
  host.setAttribute('data-tn-picker', '');
  const shadow = host.attachShadow({ mode: shadowMode() });
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;
  const box = doc.createElement('div');
  box.className = 'box';
  const hint = doc.createElement('div');
  hint.className = 'hint';
  hint.textContent = t('pickHint');
  shadow.append(style, box, hint);
  doc.documentElement.append(host);

  let hovered: Element | null = null;
  const targetOf = (e: Event): Element | null => {
    const el = e.target as Element | null;
    return el && el !== host && el.nodeType === 1 ? el : null;
  };

  return new Promise<TocEntry[]>((resolve) => {
    const finish = (entries: TocEntry[]) => {
      doc.removeEventListener('mouseover', onOver, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('keydown', onKey, true);
      host.remove();
      resolve(entries);
    };
    const onOver = (e: Event) => {
      if (!isTrustedEvent(e)) return;
      const el = targetOf(e);
      hovered = el && findLinkContainer(el);
      if (!hovered) { box.style.display = 'none'; return; }
      const r = hovered.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const onClick = (e: Event) => {
      if (!isTrustedEvent(e)) return;
      const el = targetOf(e);
      const container = el && findLinkContainer(el);
      e.preventDefault();
      e.stopPropagation();
      if (container) finish(entriesFromContainer(container, pageUrl));
    };
    const onKey = (e: Event) => {
      if (!isTrustedEvent(e)) return;
      if ((e as KeyboardEvent).key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      finish([]);
    };
    doc.addEventListener('mouseover', onOver, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
  });
}

/** Called once per page from entrypoints/content.ts. */
export function setupCrawlContent(): Handlers<ContentMessages> {
  return {
    'content/detectToc': () => detectToc(document, location.href),
    'content/pickToc': () => pickToc(document, location.href),
  };
}
