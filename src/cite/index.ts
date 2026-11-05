// Public API of the citation module. Owner: agent B. STUB — signatures are a contract, implementation will be replaced.
import type { CitationStyle, SourceMeta } from '@/src/core/types';
import { nowIso } from '@/src/core/util';

/** Read bibliographic metadata from a document (citation_*, og:, JSON-LD, <time>, etc.). */
export function extractSourceMeta(doc: Document, url: string): SourceMeta {
  return { url, title: doc.title || url, authors: [], accessed: nowIso(), lang: doc.documentElement.lang || undefined };
}

/** Format one bibliography entry (plain text, no numbering). */
export function formatCitation(source: SourceMeta, style: CitationStyle): string {
  void style;
  return `${source.title}. URL: ${source.url}`;
}

/** Format a deduplicated, correctly sorted bibliography list for the style. */
export function formatBibliography(sources: SourceMeta[], style: CitationStyle): string[] {
  return sources.map((s) => formatCitation(s, style));
}
