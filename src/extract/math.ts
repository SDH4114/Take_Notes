// Replace rendered math (Wikipedia, MathJax, KaTeX, bare MathML) with a marker span that keeps the TeX.
// The markdown module turns the marker into $…$ / $$…$$.
import { MATH_ATTR, MATH_TEX_ATTR } from '@/src/markdown';

const STYLE_WRAPPER = /^\{\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s+([\s\S]*)\}$/;

/** Strip Wikipedia's "{\displaystyle …}" wrapper and surrounding whitespace. */
export function cleanTex(raw: string): string {
  const t = raw.trim();
  const m = STYLE_WRAPPER.exec(t);
  return (m?.[1] ?? t).trim();
}

function makeMarker(doc: Document, tex: string, display: boolean): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'tn-math';
  span.setAttribute(MATH_ATTR, display ? 'display' : 'inline');
  span.setAttribute(MATH_TEX_ATTR, tex);
  span.textContent = tex;
  return span;
}

function annotationTex(root: Element): string {
  return root.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '';
}

/** Parsoid-era Wikipedia (2025+) renders native MathML with the source TeX in data-mw JSON: body.extsrc. */
function dataMwTex(el: Element): string {
  const raw = el.getAttribute('data-mw') ?? el.querySelector('[data-mw]')?.getAttribute('data-mw');
  if (!raw) return '';
  try {
    const src = (JSON.parse(raw) as { name?: string; body?: { extsrc?: unknown } }).body?.extsrc;
    return typeof src === 'string' ? src : '';
  } catch {
    return '';
  }
}

function replaceWithMarker(el: Element, tex: string, display: boolean): void {
  const clean = cleanTex(tex);
  if (clean) el.replaceWith(makeMarker(el.ownerDocument, clean, display));
}

/** Mutates `root`: all recognised math becomes marker spans. */
export function replaceMath(root: Element): void {
  // Wikipedia
  for (const el of Array.from(root.querySelectorAll('.mwe-math-element'))) {
    if (!root.contains(el)) continue;
    const tex = annotationTex(el) || dataMwTex(el) || el.querySelector('img[class*="mwe-math-fallback-image"]')?.getAttribute('alt') || '';
    const display = el.classList.contains('mwe-math-element-block') || el.nodeName === 'DIV' || !!el.querySelector('math[display="block"], .mwe-math-fallback-image-display');
    replaceWithMarker(el, tex, display);
  }
  // KaTeX (display wrapper wins over the inner .katex)
  for (const el of Array.from(root.querySelectorAll('.katex-display, .katex'))) {
    if (!root.contains(el)) continue;
    replaceWithMarker(el, annotationTex(el), el.classList.contains('katex-display'));
  }
  // MathJax v2 scripts; drop the already rendered siblings
  for (const s of Array.from(root.querySelectorAll('script[type^="math/tex"]'))) {
    const display = /mode\s*=\s*display/.test(s.getAttribute('type') ?? '');
    let prev = s.previousElementSibling;
    while (prev && prev.matches('.MathJax, .MathJax_Preview, .MathJax_Display, .MathJax_SVG, .MathJax_SVG_Display, mjx-container')) {
      const next: Element | null = prev.previousElementSibling;
      prev.remove();
      prev = next;
    }
    replaceWithMarker(s, s.textContent ?? '', display);
  }
  // Bare MathML with a TeX annotation
  for (const el of Array.from(root.querySelectorAll('math'))) {
    if (!root.contains(el)) continue;
    replaceWithMarker(el, annotationTex(el) || dataMwTex(el), el.getAttribute('display') === 'block');
  }
}
