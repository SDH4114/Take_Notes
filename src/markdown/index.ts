// Public API of the markdown module. Owner: agent A. STUB — signatures are a contract.
import TurndownService from 'turndown';

/** Convert cleaned article HTML to Markdown (GFM tables, fenced code, math as $…$). */
export function htmlToMarkdown(html: string, baseUrl: string): string {
  void baseUrl;
  return new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(html);
}
