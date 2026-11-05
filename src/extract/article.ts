// Public API for article extraction. Owner: agent A.
// Works on a live document AND on a DOMParser-parsed document (used by the crawler in background).
import { Readability } from '@mozilla/readability';
import type { ExtractResult } from '@/src/core/types';
import { extractSourceMeta } from '@/src/cite';
import { finishHtml, prepareContent } from './prepare';

const MIN_ARTICLE_CHARS = 500;

function baseFor(doc: Document, url: string): string {
  const href = doc.querySelector('base[href]')?.getAttribute('href');
  if (!href) return url;
  try {
    return new URL(href, url).toString();
  } catch {
    return url;
  }
}

/** Fallback when Readability finds nothing: <main>, <article>, else the body without page chrome. */
function fallbackHtml(clone: Document): string {
  const root = clone.querySelector('main, [role="main"], article') ?? clone.body;
  if (!root) return '';
  for (const el of Array.from(root.querySelectorAll('nav, aside, footer, header, script, style, noscript, [role="navigation"]'))) el.remove();
  return root.innerHTML;
}

/** Extract main content of a document. Must not mutate `doc` (clone first). */
export function extractArticle(doc: Document, url: string): ExtractResult {
  const clone = doc.cloneNode(true) as Document;
  const base = baseFor(doc, url);
  if (clone.documentElement) prepareContent(clone.documentElement, base);

  let article: ReturnType<Readability['parse']> = null;
  try {
    article = new Readability(clone.cloneNode(true) as Document, { keepClasses: true }).parse();
  } catch {
    article = null; // malformed documents: use the fallback below
  }
  // Readability under its char threshold has already retried with all cleanup disabled, so its
  // output is mostly page chrome; a semantic <main>/<article> is a better bet then.
  const weak = !article?.content?.trim() || (article.textContent?.trim().length ?? 0) < MIN_ARTICLE_CHARS;
  const body = weak ? fallbackHtml(clone) || article?.content || '' : article!.content!;

  return {
    title: article?.title?.trim() || doc.title,
    ...finishHtml(body, base),
    source: extractSourceMeta(doc, url),
  };
}
