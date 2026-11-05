// Pure helpers for the sidebar UI (kept separate so they can be unit-tested).
import DOMPurify from 'dompurify';
import { translator, type Lang } from '@/src/core/i18n';
import { dict } from './strings';

/** Return a copy of `ids` with the item at `from` moved to index `to`. Invalid indexes leave it unchanged. */
export function moveItem<T>(ids: readonly T[], from: number, to: number): T[] {
  const out = [...ids];
  if (from === to || from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Bibliography as copyable text; numbered for GOST-style lists, plain lines otherwise. */
export function bibliographyText(entries: readonly string[], numbered = true): string {
  return entries.map((e, i) => (numbered ? `${i + 1}. ${e}` : e)).join('\n');
}

/** Sanitize page-derived HTML before it is rendered in an extension page. */
export function safePreviewHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** Short relative date for lists: "5 мин назад", "вчера"; calendar date (YYYY-MM-DD) after a week; '' if invalid. */
export function relativeDate(iso: string, now: number = Date.now(), lang?: Lang): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const tr = translator(dict, lang);
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 1) return tr('justNow');
  if (mins < 60) return tr('minAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tr('hourAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return tr('yesterday');
  if (days < 7) return tr('daysAgo', { n: days });
  return iso.slice(0, 10);
}
