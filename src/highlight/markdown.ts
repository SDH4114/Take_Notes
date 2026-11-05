// Markdown export of highlights only. Owner: agent C.
import type { Highlight } from '@/src/core/types';

const escapeTitle = (s: string) => s.replace(/[[\]]/g, '\\$&').replace(/\s+/g, ' ').trim();

/** Highlights grouped by source page (order of first appearance): link heading, `>` quote, note below. */
export function highlightsToMarkdown(items: Highlight[]): string {
  const groups = new Map<string, Highlight[]>();
  for (const h of items) {
    const list = groups.get(h.source.url);
    if (list) list.push(h);
    else groups.set(h.source.url, [h]);
  }
  const lines: string[] = [];
  for (const list of groups.values()) {
    const { url, title } = list[0]!.source;
    lines.push(`## [${escapeTitle(title || url)}](${url})`, '');
    for (const h of list) {
      const quote = h.text.trim().split(/\r?\n/).map((l) => `> ${l}`);
      // Legacy named colors get a text label; custom hex colors carry no meaning in plain Markdown.
      if (h.color !== 'yellow' && !h.color.startsWith('#')) quote[quote.length - 1] += ` (${h.color})`;
      lines.push(...quote, '');
      if (h.note?.trim()) lines.push(h.note.trim(), '');
    }
  }
  return lines.join('\n');
}
