// Markdown → sanitized HTML for previews, the library reader and PDF of edited clips.
// Supports GFM plus ==highlight== (→ <mark>) and $math$ / $$math$$ (→ monospace span, no TeX renderer bundled).
import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked';

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const markExt: TokenizerAndRendererExtension = {
  name: 'mark',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src) {
    const m = /^==(?=\S)([\s\S]*?\S)==/.exec(src);
    if (!m) return undefined;
    return { type: 'mark', raw: m[0], text: m[1]!, tokens: this.lexer.inlineTokens(m[1]!) };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline((token as Tokens.Generic).tokens ?? [])}</mark>`;
  },
};

const blockMathExt: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => src.indexOf('$$'),
  tokenizer(src) {
    const m = /^\$\$\s*\n?([\s\S]+?)\n?\s*\$\$(?:\n|$)/.exec(src);
    return m ? { type: 'blockMath', raw: m[0], text: m[1]!.trim() } : undefined;
  },
  renderer: (token) => `<p class="math math-display">$$${escapeHtml(String(token.text))}$$</p>\n`,
};

const inlineMathExt: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src) {
    // "$x^2$" but not prices like "$5 and $10": no space right inside the dollars, no digit right after the closing one.
    const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
    return m ? { type: 'inlineMath', raw: m[0], text: m[1]! } : undefined;
  },
  renderer: (token) => `<span class="math">$${escapeHtml(String(token.text))}$</span>`,
};

const md = new Marked({ gfm: true, breaks: false });
md.use({ extensions: [blockMathExt, inlineMathExt, markExt] });

/** Render markdown to sanitized HTML. Links open in a new tab. */
export function renderMarkdown(source: string): string {
  const raw = md.parse(source, { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, { FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'], FORBID_ATTR: ['style'] });
  return clean.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
}
