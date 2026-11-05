// Anki export. Owner: agent C.
import type { Highlight } from '@/src/core/types';

const HEADERS = ['#separator:tab', '#html:false', '#tags column:3'];

/** html:false + tab separator: tabs and line breaks must not survive inside a field. */
const field = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

function domainTag(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const slug = host.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return slug || null;
  } catch {
    return null;
  }
}

/** Build a TSV importable by Anki (front<TAB>back<TAB>tags), with "#separator:tab" headers. */
export function highlightsToAnkiTsv(items: Highlight[]): string {
  const rows = items.map((h) => {
    const [front, back] = h.note?.trim()
      ? [h.note, h.text]
      : [h.text, `${h.source.title} ${h.source.url}`];
    const tags = [domainTag(h.source.url), 'takenotes'].filter(Boolean).join(' ');
    return `${field(front)}\t${field(back)}\t${tags}`;
  });
  return [...HEADERS, ...rows].join('\n') + '\n';
}
