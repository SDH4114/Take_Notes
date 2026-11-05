// Content-script part of the extract module. Owner: agent A.
import type { ContentMessages, Handlers } from '@/src/core/messages';
import type { ExtractResult } from '@/src/core/types';
import { extractSourceMeta } from '@/src/cite';
import { detectCodeLanguage } from '@/src/markdown';
import { extractArticle } from './article';
import { finishHtml, prepareContent } from './prepare';

/**
 * Convert the current selection to an ExtractResult, or null if it holds no text.
 * The fragment is cloned into an inert document so images do not start loading.
 */
export function extractSelectionFrom(selection: Selection | null, doc: Document, url: string): ExtractResult | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const inert = doc.implementation.createHTMLDocument('');
  const container = inert.createElement('div');

  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    const fragment = inert.importNode(range.cloneContents(), true);
    const anc = range.commonAncestorContainer;
    const pre = (anc.nodeType === Node.ELEMENT_NODE ? (anc as Element) : anc.parentElement)?.closest('pre');
    if (pre) {
      // Selection lies inside a code block: re-wrap so it stays a fenced block with its language.
      const wrapper = inert.createElement('pre');
      const lang = detectCodeLanguage(pre);
      if (lang) wrapper.setAttribute('data-lang', lang);
      wrapper.appendChild(fragment);
      container.appendChild(wrapper);
    } else {
      container.appendChild(fragment);
    }
  }

  if (!container.textContent?.trim() && !container.querySelector('img')) return null;
  prepareContent(container, url);
  return {
    title: doc.title,
    ...finishHtml(container.innerHTML, url),
    source: extractSourceMeta(doc, url),
  };
}

/** Called once per page from entrypoints/content.ts. */
export function setupExtractContent(): Handlers<ContentMessages> {
  return {
    'content/extractPage': () => extractArticle(document, location.href),
    'content/extractSelection': () => extractSelectionFrom(window.getSelection(), document, location.href),
  };
}
