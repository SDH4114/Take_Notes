// Public API for article extraction. Owner: agent A. STUB — signature is a contract.
// Must work on a live document AND on a DOMParser-parsed document (used by the crawler in background).
import type { ExtractResult } from '@/src/core/types';
import { extractSourceMeta } from '@/src/cite';
import { htmlToMarkdown } from '@/src/markdown';

/** Extract main content of a document. Must not mutate `doc` (clone first). */
export function extractArticle(doc: Document, url: string): ExtractResult {
  const html = doc.body?.innerHTML ?? '';
  return { title: doc.title, html, markdown: htmlToMarkdown(html, url), source: extractSourceMeta(doc, url), imageUrls: [] };
}
