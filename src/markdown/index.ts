// Public API of the markdown module. Owner: agent A.
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/** Attribute names of the math marker produced by src/extract/math.ts. */
export const MATH_ATTR = 'data-tn-math';
export const MATH_TEX_ATTR = 'data-tex';

const LANG_PATTERNS = [
  /(?:^|\s)brush:\s*([\w+#.-]+)/i, // metanit / SyntaxHighlighter: "brush:rust;"
  /(?:^|\s)(?:language|lang)-([\w+#.-]+)/i,
  /(?:^|\s)highlight-source-([\w+#.-]+)/i, // GitHub
];

function langFromClass(cls: string | null | undefined): string {
  if (!cls) return '';
  for (const re of LANG_PATTERNS) {
    const m = re.exec(cls);
    if (!m) continue;
    const lang = m[1] ?? '';
    return /^(none|plain|plaintext|text)$/i.test(lang) ? '' : lang.toLowerCase();
  }
  return '';
}

/** Detect a code language from the <pre>, its <code> child or up to two ancestors. */
export function detectCodeLanguage(pre: Element): string {
  const candidates: (Element | null)[] = [pre, pre.querySelector('code'), pre.parentElement, pre.parentElement?.parentElement ?? null];
  for (const el of candidates) {
    if (!el) continue;
    const lang = langFromClass(el.getAttribute('class')) || el.getAttribute('data-lang')?.toLowerCase() || el.getAttribute('data-language')?.toLowerCase() || '';
    if (lang) return lang;
  }
  return '';
}

function preText(pre: Element): string {
  const clone = pre.cloneNode(true) as Element;
  for (const br of Array.from(clone.querySelectorAll('br'))) br.replaceWith('\n');
  return (clone.textContent ?? '').replace(/\n$/, '');
}

function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const escapeUrl = (u: string) => u.replace(/\(/g, '%28').replace(/\)/g, '%29');
const stripHash = (u: string) => u.split('#')[0];

const BLOCK_IN_CELL = 'p,ul,ol,pre,div,table,blockquote,h1,h2,h3,h4,h5,h6,br,hr';

function isHeadingRow(tr: Element): boolean {
  const parent = tr.parentElement;
  if (!parent) return false;
  if (parent.nodeName === 'THEAD') return true;
  return Array.from(tr.children).every((c) => c.nodeName === 'TH');
}

/** True when a GFM pipe table would be lossy or broken. */
function needsHtmlTable(table: Element): boolean {
  const first = table.querySelector('tr');
  if (!first || !isHeadingRow(first)) return true;
  if (table.querySelector('[rowspan],[colspan],table table')) return true;
  return table.querySelector(BLOCK_IN_CELL) !== null && Array.from(table.querySelectorAll('td,th')).some((c) => c.querySelector(BLOCK_IN_CELL));
}

function simpleHtmlTable(table: Element): string {
  const clone = table.cloneNode(true) as Element;
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const keep = ['rowspan', 'colspan', 'href', 'src', 'alt'].includes(attr.name);
      if (!keep) el.removeAttribute(attr.name);
    }
  }
  return clone.outerHTML.replace(/\n+/g, '');
}

function createService(baseUrl: string): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.use(gfm);

  // The gfm plugin emits a single "~"; double is the portable form.
  td.addRule('tn-strike', {
    filter: ['del', 's'],
    replacement: (content) => `~~${content}~~`,
  });

  td.addRule('tn-table-fallback', {
    filter: (node) => node.nodeName === 'TABLE' && needsHtmlTable(node as Element),
    replacement: (_c, node) => `\n\n${simpleHtmlTable(node as Element)}\n\n`,
  });

  td.addRule('tn-code', {
    filter: 'pre',
    replacement: (_c, node) => {
      const el = node as Element;
      const code = preText(el);
      let fence = '```';
      while (code.includes(fence)) fence += '`';
      return `\n\n${fence}${detectCodeLanguage(el)}\n${code}\n${fence}\n\n`;
    },
  });

  td.addRule('tn-math', {
    filter: (node) => node.nodeName === 'SPAN' && (node as Element).hasAttribute(MATH_ATTR),
    replacement: (_c, node) => {
      const el = node as Element;
      const tex = (el.getAttribute(MATH_TEX_ATTR) ?? el.textContent ?? '').trim();
      if (!tex) return '';
      return el.getAttribute(MATH_ATTR) === 'display' ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex.replace(/\s+/g, ' ')}$`;
    },
  });

  td.addRule('tn-image', {
    filter: 'img',
    replacement: (_c, node) => {
      const el = node as Element;
      const src = absolute(el.getAttribute('src'), baseUrl);
      if (!src || src.startsWith('data:')) return '';
      const alt = (el.getAttribute('alt') ?? '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
      return `![${alt}](${escapeUrl(src)})`;
    },
  });

  td.addRule('tn-link', {
    filter: (node) => node.nodeName === 'A' && (node as Element).hasAttribute('href'),
    replacement: (content, node) => {
      const text = content.trim();
      if (!text) return '';
      const href = absolute((node as Element).getAttribute('href'), baseUrl);
      if (!href || !/^(https?|mailto|ftp):/i.test(href)) return content;
      const samePage = href.includes('#') && stripHash(href) === stripHash(baseUrl);
      return samePage ? content : `[${text}](${escapeUrl(href)})`;
    },
  });

  return td;
}

/** Collapse runs of 3+ newlines to a blank line, leaving fenced code untouched. */
function collapseBlankLines(md: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let blank = 0;
  for (const line of md.split('\n')) {
    const m = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m?.[1] && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      out.push(line);
      continue;
    }
    if (m) fence = m[1] ?? null;
    blank = line.trim() === '' ? blank + 1 : 0;
    if (blank <= 1) out.push(line.trim() === '' ? '' : line);
  }
  return out.join('\n').trim();
}

/** Convert cleaned article HTML to Markdown (GFM tables, fenced code, math as $…$). */
export function htmlToMarkdown(html: string, baseUrl: string): string {
  return collapseBlankLines(createService(baseUrl).turndown(html));
}
