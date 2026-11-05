// Pure Markdown formatting commands: (doc text, selection) -> (new text, new selection).
// The CodeMirror commands in src/ui/editor.tsx are thin wrappers around these.

export interface Sel { from: number; to: number }
export interface Edit extends Sel { text: string }

const sel = (text: string, from: number, to = from): Edit => ({ text, from, to });

// ---------- inline wrappers

/** Number of consecutive `ch` characters ending at `end` (backwards) or starting at `start` (forwards). */
function runBefore(text: string, end: number, ch: string): number {
  let n = 0;
  while (end - n > 0 && text[end - n - 1] === ch) n++;
  return n;
}
function runAfter(text: string, start: number, ch: string): number {
  let n = 0;
  while (text[start + n] === ch) n++;
  return n;
}

/**
 * Is a run of `n` marker characters a toggle-able instance of `marker`?
 * "*" (italic) lives next to "**" (bold): only an odd run contains an italic marker. "**" needs at least two.
 */
function runMatches(marker: string, n: number): boolean {
  if (marker === '*') return n % 2 === 1;
  if (marker === '**') return n >= 2;
  return n >= marker.length;
}

/** Toggle an inline marker (`**`, `*`, `==`, `~~`, `` ` ``) around the selection. */
export function toggleWrap(text: string, { from, to }: Sel, marker: string): Edit {
  const len = marker.length;
  const ch = marker[0]!;
  const uniform = marker === ch.repeat(len); // all marker chars equal, so run counting works
  // Markers just outside the selection.
  const outside = uniform
    ? runMatches(marker, Math.min(runBefore(text, from, ch), runAfter(text, to, ch)))
    : text.slice(from - len, from) === marker && text.slice(to, to + len) === marker;
  if (outside && from - len >= 0) {
    return sel(text.slice(0, from - len) + text.slice(from, to) + text.slice(to + len), from - len, to - len);
  }
  // Markers just inside the selection.
  const chosen = text.slice(from, to);
  if (chosen.length > 2 * len && chosen.startsWith(marker) && chosen.endsWith(marker)) {
    const insideOk = uniform
      ? runMatches(marker, runAfter(chosen, 0, ch)) && runMatches(marker, runBefore(chosen, chosen.length, ch))
      : true;
    if (insideOk) {
      return sel(text.slice(0, from) + chosen.slice(len, -len) + text.slice(to), from, to - 2 * len);
    }
  }
  return sel(`${text.slice(0, from)}${marker}${chosen}${marker}${text.slice(to)}`, from + len, to + len);
}

// ---------- line-based helpers

interface LineRange { start: number; end: number; lines: string[]; a: number; b: number }

/** Lines touched by the selection. A selection ending at the very start of a line does not include that line. */
function lineRange(text: string, { from, to }: Sel): LineRange {
  const lines = text.split('\n');
  const starts: number[] = [];
  let pos = 0;
  for (const l of lines) { starts.push(pos); pos += l.length + 1; }
  const lineOf = (p: number) => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1]! <= p) i++;
    return i;
  };
  const a = lineOf(from);
  let b = lineOf(to);
  if (to > from && b > a && starts[b] === to) b--;
  return { start: starts[a]!, end: starts[b]! + lines[b]!.length, lines, a, b };
}

/** Replace lines a..b with `next` (any count) and map the selection through the change. */
function replaceLines(s: Sel, r: LineRange, next: string[]): Edit {
  const out = [...r.lines.slice(0, r.a), ...next, ...r.lines.slice(r.b + 1)];
  const starts: number[] = [];
  let pos = 0;
  for (const l of r.lines) { starts.push(pos); pos += l.length + 1; }
  const map = (p: number, keepLineStart: boolean): number => {
    if (p < r.start) return p;
    const oldEndOfRange = r.end;
    if (p > oldEndOfRange) return p + (next.join('\n').length - (oldEndOfRange - r.start));
    // Inside the range: map per line (line counts are equal in this path).
    let i = r.a;
    while (i < r.b && starts[i + 1]! <= p) i++;
    const col = p - starts[i]!;
    const idx = i - r.a;
    const newStart = r.start + next.slice(0, idx).reduce((n, l) => n + l.length + 1, 0);
    const delta = next[idx]!.length - r.lines[i]!.length;
    if (keepLineStart && col === 0) return newStart;
    return newStart + Math.max(0, Math.min(next[idx]!.length, col + delta));
  };
  const nonEmpty = s.to > s.from;
  return { text: out.join('\n'), from: map(s.from, nonEmpty), to: map(s.to, false) };
}

const isBlank = (l: string) => l.trim() === '';
const BULLET = /^(\s*)[-*+] /;
const ORDERED = /^(\s*)\d+[.)] /;
const QUOTE = /^(\s*)> ?/;

/** Cycle the heading level of the cursor line: none -> H1 -> H2 -> H3 -> none. */
export function cycleHeading(text: string, s: Sel): Edit {
  const r = lineRange(text, { from: s.from, to: s.from });
  const line = r.lines[r.a]!;
  const m = /^(#{1,6})\s+/.exec(line);
  const level = m ? m[1]!.length : 0;
  const body = m ? line.slice(m[0].length) : line;
  const nextLevel = level >= 3 ? 0 : level + 1;
  return replaceLines(s, r, [nextLevel ? `${'#'.repeat(nextLevel)} ${body}` : body]);
}

/** Blockquote: prefix "> " on every selected line, or remove it when all have it. */
export function toggleBlockquote(text: string, s: Sel): Edit {
  const r = lineRange(text, s);
  const slice = r.lines.slice(r.a, r.b + 1);
  const targets = slice.some((l) => !isBlank(l)) ? slice.map((l) => !isBlank(l)) : slice.map(() => true);
  const allQuoted = slice.every((l, i) => !targets[i] || QUOTE.test(l));
  const next = slice.map((l, i) => {
    if (!targets[i]) return l;
    return allQuoted ? l.replace(QUOTE, '$1') : `> ${l}`;
  });
  return replaceLines(s, r, next);
}

function toggleList(text: string, s: Sel, own: RegExp, make: (n: number, line: string) => string): Edit {
  const r = lineRange(text, s);
  const slice = r.lines.slice(r.a, r.b + 1);
  const targets = slice.some((l) => !isBlank(l)) ? slice.map((l) => !isBlank(l)) : slice.map(() => true);
  const allOwn = slice.every((l, i) => !targets[i] || own.test(l));
  let n = 0;
  const next = slice.map((l, i) => {
    if (!targets[i]) return l;
    n++;
    if (allOwn) return l.replace(own, '$1');
    const bare = l.replace(BULLET, '$1').replace(ORDERED, '$1');
    return make(n, bare);
  });
  return replaceLines(s, r, next);
}

export const toggleBulletList = (text: string, s: Sel): Edit => toggleList(text, s, BULLET, (_n, l) => `- ${l}`);
export const toggleOrderedList = (text: string, s: Sel): Edit => toggleList(text, s, ORDERED, (n, l) => `${n}. ${l}`);

/** Inline code for a single-line selection, fenced block for several lines. */
export function toggleCode(text: string, s: Sel): Edit {
  if (!text.slice(s.from, s.to).includes('\n')) return toggleWrap(text, s, '`');
  const r = lineRange(text, s);
  const before = r.lines[r.a - 1];
  const after = r.lines[r.b + 1];
  const body = r.lines.slice(r.a, r.b + 1);
  const fenced = before !== undefined && after !== undefined && /^```/.test(before) && /^```\s*$/.test(after);
  if (fenced) {
    const from = r.a - 1;
    const out = [...r.lines.slice(0, from), ...body, ...r.lines.slice(r.b + 2)].join('\n');
    const start = r.start - before.length - 1;
    return sel(out, start, start + body.join('\n').length);
  }
  const out = [...r.lines.slice(0, r.a), '```', ...body, '```', ...r.lines.slice(r.b + 1)].join('\n');
  const start = r.start + 4;
  return sel(out, start, start + body.join('\n').length);
}

const URL_RE = /^https?:\/\/\S+$/i;
const LINK_RE = /^\[([^\]]*)\]\([^)]*\)$/;

/** Link: wrap selection as [text](url) and put the cursor in the url; a selected URL becomes the target. */
export function toggleLink(text: string, { from, to }: Sel): Edit {
  const chosen = text.slice(from, to);
  const head = text.slice(0, from);
  const tail = text.slice(to);
  const existing = LINK_RE.exec(chosen);
  if (existing) return sel(head + existing[1]! + tail, from, from + existing[1]!.length);
  if (URL_RE.test(chosen)) return sel(`${head}[](${chosen})${tail}`, from + 1);
  if (!chosen) return sel(`${head}[]()${tail}`, from + 1);
  return sel(`${head}[${chosen}]()${tail}`, from + chosen.length + 3);
}

// ---------- document diff

/** Smallest single change turning `a` into `b` (for dispatching to an editor without resetting the cursor). */
export function diffChange(a: string, b: string): { from: number; to: number; insert: string } {
  const max = Math.min(a.length, b.length);
  let p = 0;
  while (p < max && a[p] === b[p]) p++;
  let s = 0;
  while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { from: p, to: a.length - s, insert: b.slice(p, b.length - s) };
}
