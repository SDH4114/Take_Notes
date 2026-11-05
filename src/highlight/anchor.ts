// Text-quote anchoring: create an anchor from a Range and resolve it back in a (changed) document.
// Works on a whitespace-normalized view of the document text (runs of whitespace collapse to one space).
import type { TextQuoteAnchor } from '@/src/core/types';

const CONTEXT = 32;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

interface TextIndex {
  /** Normalized text. */
  text: string;
  nodes: Text[];
  /** Per normalized char: index in `nodes` and raw offset inside that node. */
  nodeOf: number[];
  offOf: number[];
  /** Per node: normalized index of its first char (or where it would start). */
  nodeStart: number[];
}

function buildIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      for (let p = n.parentElement; p && p !== root; p = p.parentElement) {
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      }
      return n.parentElement && SKIP_TAGS.has(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const chars: string[] = [];
  const idx: TextIndex = { text: '', nodes: [], nodeOf: [], offOf: [], nodeStart: [] };
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const ni = idx.nodes.length;
    idx.nodes.push(n);
    idx.nodeStart.push(chars.length);
    const data = n.data;
    for (let i = 0; i < data.length; i++) {
      let c = data[i]!;
      if (/\s/.test(c)) {
        if (chars.length === 0 || chars[chars.length - 1] === ' ') continue;
        c = ' ';
      }
      chars.push(c);
      idx.nodeOf.push(ni);
      idx.offOf.push(i);
    }
  }
  idx.text = chars.join('');
  return idx;
}

/** Normalized index of the first char located at or after the DOM point. */
function pointToIndex(idx: TextIndex, container: Node, offset: number): number {
  const ni = container.nodeType === Node.TEXT_NODE ? idx.nodes.indexOf(container as Text) : -1;
  if (ni >= 0) {
    let k = idx.nodeStart[ni]!;
    while (k < idx.text.length && idx.nodeOf[k] === ni && idx.offOf[k]! < offset) k++;
    return k;
  }
  const doc = container.ownerDocument ?? (container as Document);
  const r = doc.createRange();
  r.setStart(container, offset);
  r.collapse(true);
  for (let i = 0; i < idx.nodes.length; i++) {
    if (r.comparePoint(idx.nodes[i]!, 0) >= 0) return idx.nodeStart[i]!;
  }
  return idx.text.length;
}

const collapse = (s: string) => s.replace(/\s+/g, ' ');

export function createAnchor(range: Range, root: Node = range.commonAncestorContainer.ownerDocument?.body ?? document.body): TextQuoteAnchor {
  const idx = buildIndex(root);
  let s = pointToIndex(idx, range.startContainer, range.startOffset);
  let e = pointToIndex(idx, range.endContainer, range.endOffset);
  while (s < e && idx.text[s] === ' ') s++;
  while (e > s && idx.text[e - 1] === ' ') e--;
  return {
    exact: idx.text.slice(s, e),
    prefix: idx.text.slice(Math.max(0, s - CONTEXT), s),
    suffix: idx.text.slice(e, e + CONTEXT),
  };
}

function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Find the anchor in the document. Picks the exact-text occurrence whose surroundings agree best with the
 * stored prefix/suffix. A single occurrence is always accepted; with several, one needs some context
 * agreement (otherwise the match is ambiguous and null is returned).
 */
export function resolveAnchor(anchor: TextQuoteAnchor, root: Node = document.body): Range | null {
  const exact = collapse(anchor.exact).trim();
  if (!exact) return null;
  const idx = buildIndex(root);
  const hits: number[] = [];
  for (let i = idx.text.indexOf(exact); i >= 0; i = idx.text.indexOf(exact, i + 1)) hits.push(i);
  if (hits.length === 0) return null;

  const prefix = collapse(anchor.prefix);
  const suffix = collapse(anchor.suffix);
  let best = -1;
  let bestScore = -1;
  for (const h of hits) {
    const before = idx.text.slice(Math.max(0, h - prefix.length), h);
    const after = idx.text.slice(h + exact.length, h + exact.length + suffix.length);
    const score = commonSuffixLen(before, prefix) + commonPrefixLen(after, suffix);
    if (score > bestScore) { best = h; bestScore = score; }
  }
  if (hits.length > 1 && bestScore === 0 && (prefix || suffix)) return null;

  const end = best + exact.length - 1;
  const doc = (root.ownerDocument ?? (root as Document));
  const r = doc.createRange();
  r.setStart(idx.nodes[idx.nodeOf[best]!]!, idx.offOf[best]!);
  r.setEnd(idx.nodes[idx.nodeOf[end]!]!, idx.offOf[end]! + 1);
  return r;
}
