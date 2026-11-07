// Markdown export of highlights only. Owner: agent C.
import type { Highlight } from '@/src/core/types';
import { isNoteHighlightUrl } from '@/src/core/util';

const escapeTitle = (s: string) => s.replace(/[[\]]/g, '\\$&').replace(/\s+/g, ' ').trim();

/** Highlights grouped by source page (order of first appearance): link heading, `>` quote, note below. */
export function highlightsToMarkdown(items: Highlight[]): string {
  const groups = new Map<string, Highlight[]>();
  // Highlights of url-less notes group per note (their key), not all together under an empty URL.
  const keyOf = (h: Highlight) => (isNoteHighlightUrl(h.url) ? h.url : h.source.url);
  for (const h of items) {
    const list = groups.get(keyOf(h));
    if (list) list.push(h);
    else groups.set(keyOf(h), [h]);
  }
  const lines: string[] = [];
  for (const list of groups.values()) {
    const { url, title } = list[0]!.source;
    lines.push(url ? `## [${escapeTitle(title || url)}](${url})` : `## ${escapeTitle(title || '…')}`, '');
    for (const h of list) {
      const quote = h.text.trim().split(/\r?\n/).map((l) => `> ${l}`);
      // Legacy named colors get a text label; custom hex colors carry no meaning in plain Markdown.
      if (h.color !== 'yellow' && !h.color.startsWith('#')) quote[quote.length - 1] += ` (${h.color})`;
      lines.push(...quote, '');
      if (h.note?.trim()) lines.push(h.note.trim(), '');
      if (h.body?.trim()) lines.push(h.body.trim(), '');
    }
  }
  return lines.join('\n');
}
