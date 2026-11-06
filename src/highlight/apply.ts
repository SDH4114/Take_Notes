// Put a page's highlights into its saved note: <mark> in HTML (Library preview, PDF) and ==text== in Markdown exports.
// Clips and highlights are stored separately; they are joined by the normalized page URL.
import type { Clip, Highlight } from '@/src/core/types';
import { colorHex, hexToRgb } from '@/src/core/colors';
import { normalizeUrl } from '@/src/core/util';
import { resolveAnchor } from './anchor';

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

/** Highlights made on the clip's page (any project), oldest first. */
export function highlightsForClip(clip: Pick<Clip, 'source'>, all: readonly Highlight[]): Highlight[] {
  if (!clip.source.url) return [];
  const url = normalizeUrl(clip.source.url);
  return all.filter((h) => h.url === url).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function wrap(range: Range, h: Highlight): boolean {
  const root = range.commonAncestorContainer;
  const doc = root.ownerDocument!;
  const nodes: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
  else {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (range.intersectsNode(n) && !SKIP.has(n.parentElement?.tagName ?? '')) nodes.push(n);
    }
  }
  const { startContainer, startOffset, endContainer, endOffset } = range;
  let wrapped = false;
  for (const node of nodes) {
    const from = node === startContainer ? startOffset : 0;
    const to = node === endContainer ? endOffset : node.length;
    if (from >= to) continue;
    let target = node;
    if (to < target.length) target.splitText(to);
    if (from > 0) target = target.splitText(from);
    if (!target.data.trim()) continue;
    const mark = doc.createElement('mark');
    mark.className = 'tn-hl';
    mark.setAttribute('data-tn-id', h.id);
    // colorHex validates the stored value, so only "#rrggbb" can reach the style attribute.
    mark.setAttribute('style', `background-color: rgba(${hexToRgb(colorHex(h.color))}, .45)`);
    if (h.note?.trim()) mark.setAttribute('title', h.note.trim());
    target.parentNode!.replaceChild(mark, target);
    mark.appendChild(target);
    wrapped = true;
  }
  return wrapped;
}

/** Wrap each highlight's text in <mark>. Input must already be sanitized; returns HTML and the ids not found. */
export function markHighlightsInHtml(html: string, list: readonly Highlight[]): { html: string; missing: string[] } {
  if (!list.length) return { html, missing: [] };
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const missing: string[] = [];
  for (const h of list) {
    let range: Range | null = null;
    try { range = resolveAnchor(h.anchor, tpl.content); } catch { range = null; }
    if (!range || !wrap(range, h)) missing.push(h.id);
  }
  return { html: tpl.innerHTML, missing };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ranges of fenced code blocks and inline code, which must not get ==marks==. */
function codeSpans(md: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const re of [/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\n]*|$)/gm, /`[^`\n]+`/g]) {
    for (const m of md.matchAll(re)) out.push([m.index!, m.index! + m[0].length]);
  }
  return out;
}

/**
 * Wrap the first plain-text occurrence of each highlight in ==…==. Whitespace may differ; matches crossing
 * a paragraph break, code or an existing mark are skipped. Returns the markdown and the ids not found.
 */
export function markHighlightsInMarkdown(md: string, list: readonly Highlight[]): { markdown: string; missing: string[] } {
  let out = md;
  const missing: string[] = [];
  for (const h of list) {
    const words = h.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { missing.push(h.id); continue; }
    // Any whitespace between words, but at most one line break (a blank line ends the paragraph).
    const re = new RegExp(words.map(escapeRe).join('(?:[ \\t]+\\n?[ \\t]*|\\n[ \\t]*)'), 'g');
    const code = codeSpans(out);
    let hit: RegExpExecArray | null = null;
    for (let m = re.exec(out); m; m = re.exec(out)) {
      const s = m.index, e = s + m[0].length;
      const inCode = code.some(([a, b]) => s < b && e > a);
      const inMark = (out.slice(0, s).match(/==/g)?.length ?? 0) % 2 === 1;
      if (!inCode && !inMark && !m[0].includes('==')) { hit = m; break; }
    }
    if (!hit) { missing.push(h.id); continue; }
    out = `${out.slice(0, hit.index)}==${hit[0]}==${out.slice(hit.index + hit[0].length)}`;
  }
  return { markdown: out, missing };
}
