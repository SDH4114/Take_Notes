// Pure helpers for the sidebar UI (kept separate so they can be unit-tested).
import DOMPurify from 'dompurify';

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
