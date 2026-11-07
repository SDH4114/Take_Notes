// Put a page's highlights into its saved note: <mark> in HTML (Library preview, PDF) and ==text== in Markdown exports.
// Clips and highlights are stored separately; they are joined by the normalized page URL.
import type { Clip, Highlight } from '@/src/core/types';
import { colorHex, hexToRgb } from '@/src/core/colors';
import { clipHighlightUrl } from '@/src/core/util';
import { resolveAnchor } from './anchor';

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

/**
 * Highlights of a clip (any project), oldest first: made on its page, or — for a note without a source URL — made
 * in that note (keyed by `noteHighlightUrl(clip.id)`, see clipHighlightUrl). Url-less notes never share highlights.
 */
export function highlightsForClip(clip: Pick<Clip, 'source'> & { id?: string }, all: readonly Highlight[]): Highlight[] {
  if (!clip.source.url && !clip.id) return [];
  const url = clipHighlightUrl({ id: clip.id ?? '', source: clip.source });
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

/** Ranges of fenced code blocks (whole block, up to the matching fence or the end) and inline code. */
export function codeSpans(md: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let fence: string | null = null;
  let start = 0;
  let pos = 0;
  for (const line of md.split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (m) {
      const f = m[1]!;
      if (!fence) { fence = f; start = pos; }
      else if (f[0] === fence[0] && f.length >= fence.length) { out.push([start, pos + line.length]); fence = null; }
    }
    pos += line.length + 1;
  }
  if (fence) out.push([start, md.length]);
  const inBlock = (i: number) => out.some(([a, b]) => i >= a && i < b);
  for (const m of md.matchAll(/`[^`\n]+`/g)) if (!inBlock(m.index!)) out.push([m.index!, m.index! + m[0].length]);
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
      // Count == marks outside code only ("a == b" in a code block is not a mark).
      let marks = 0;
      for (const mm of out.slice(0, s).matchAll(/==/g)) if (!code.some(([a, b]) => mm.index! >= a && mm.index! < b)) marks++;
      const inMark = marks % 2 === 1;
      if (!inCode && !inMark && !m[0].includes('==')) { hit = m; break; }
    }
    if (!hit) { missing.push(h.id); continue; }
    out = `${out.slice(0, hit.index)}==${hit[0]}==${out.slice(hit.index + hit[0].length)}`;
  }
  return { markdown: out, missing };
}
