// Public API of the citation module. Owner: agent B.
import type { CitationStyle, SourceMeta } from '@/src/core/types';
import { normalizeUrl, nowIso } from '@/src/core/util';

// ---------------------------------------------------------------- extraction

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const isUrl = (s: string) => /^https?:\/\//i.test(s);

function metaAll(doc: Document, names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    for (const el of Array.from(doc.querySelectorAll('meta'))) {
      const key = el.getAttribute('name') ?? el.getAttribute('property');
      if (key?.toLowerCase() === name) {
        const v = clean(el.getAttribute('content'));
        if (v) out.push(v);
      }
    }
  }
  return out;
}
const meta = (doc: Document, ...names: string[]) => metaAll(doc, names)[0];

interface LdInfo { headline?: string; authors: string[]; published?: string; publisher?: string }

function ldNames(v: unknown): string[] {
  if (typeof v === 'string') return [clean(v)].filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(ldNames);
  if (v && typeof v === 'object') return ldNames((v as { name?: unknown }).name);
  return [];
}

function readJsonLd(doc: Document): LdInfo {
  const info: LdInfo = { authors: [] };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (typeof o.headline === 'string') info.headline ??= clean(o.headline) || undefined;
    if (typeof o.datePublished === 'string') info.published ??= o.datePublished;
    if (o.author) info.authors.push(...ldNames(o.author));
    info.publisher ??= ldNames(o.publisher)[0];
    if (o['@graph']) visit(o['@graph']);
  };
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      visit(JSON.parse(s.textContent ?? ''));
    } catch {
      // Broken JSON-LD is common; just skip that block.
    }
  }
  return info;
}

/** Normalize a date string to ISO "YYYY-MM-DD" (or "YYYY-MM" / "YYYY"); undefined if unparseable. */
function normalizeDate(raw: string | undefined): string | undefined {
  const s = clean(raw);
  if (!s) return undefined;
  const full = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(s);
  if (full) return `${full[1]}-${full[2]!.padStart(2, '0')}-${full[3]!.padStart(2, '0')}`;
  const ym = /^(\d{4})[-/.](\d{1,2})$/.exec(s);
  if (ym) return `${ym[1]}-${ym[2]!.padStart(2, '0')}`;
  if (/^\d{4}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

const KNOWN_SITE_SUFFIX = /^(википедия|wikipedia|wikipédia|wikipedia, the free encyclopedia|википедия — свободная энциклопедия)$/i;

/** Trailing " — Site" part of a title, if any. */
function titleSuffix(title: string): string | undefined {
  return /^.*\S\s+(?:[—–|·-])\s+([^—–|·]+?)$/.exec(title)?.[1]?.trim();
}

/** Collective/organizational "authors" that must not appear as a person in citations. */
const NON_AUTHOR = /^(contributors to wikimedia projects|участники проектов викимедиа|wikipedia contributors|авторы википедии)$/i;

function stripSiteSuffix(title: string, siteName: string | undefined, url: string): string {
  const m = /^(.*\S)\s+(?:[—–|·-])\s+([^—–|·]+?)$/.exec(title);
  if (!m) return title;
  const suffix = clean(m[2]).toLowerCase();
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* keep empty */ }
  const hostLabel = host.split('.').slice(-2, -1)[0] ?? '';
  const matchesSite = !!siteName && suffix === siteName.toLowerCase();
  if (matchesSite || KNOWN_SITE_SUFFIX.test(suffix) || suffix === host || (hostLabel && suffix === hostLabel)) return clean(m[1]);
  return title;
}

/** Read bibliographic metadata from a document (citation_*, og:, JSON-LD, <time>, etc.). */
export function extractSourceMeta(doc: Document, url: string): SourceMeta {
  const ld = readJsonLd(doc);
  const docTitle = clean(doc.title);
  // A known site suffix in <title> ("… — Википедия") names the site better than JSON-LD publisher (foundation).
  const suffix = docTitle ? titleSuffix(docTitle) : undefined;
  const siteName = meta(doc, 'og:site_name') ?? (suffix && KNOWN_SITE_SUFFIX.test(suffix) ? suffix : undefined) ?? ld.publisher;
  const publisher = meta(doc, 'citation_publisher', 'publisher') ?? ld.publisher;
  const strip = (t: string | undefined) => (t ? stripSiteSuffix(t, siteName, url) : undefined);

  const title =
    meta(doc, 'citation_title') ??
    strip(meta(doc, 'og:title')) ??
    strip(ld.headline) ??
    (clean(doc.querySelector('h1')?.textContent) || undefined) ??
    (docTitle ? stripSiteSuffix(docTitle, siteName, url) : undefined) ??
    url;

  const authors: string[] = [];
  for (const a of [
    ...metaAll(doc, ['citation_author']),
    ...metaAll(doc, ['author']),
    ...ld.authors,
    ...metaAll(doc, ['article:author']),
  ]) {
    if (!isUrl(a) && !NON_AUTHOR.test(a) && !authors.includes(a)) authors.push(a);
  }

  const published = normalizeDate(
    meta(doc, 'citation_publication_date', 'citation_date', 'article:published_time') ??
      ld.published ??
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ??
      undefined,
  );

  return {
    url,
    title,
    authors,
    siteName,
    publisher,
    published,
    accessed: nowIso(),
    lang: doc.documentElement.getAttribute('lang') || undefined,
    description: meta(doc, 'og:description', 'description'),
  };
}

// ---------------------------------------------------------------- names

interface Person { last: string; given: string[] }

const isInitials = (t: string) => /^(\p{L}\.-?)+$/u.test(t);

function parsePerson(raw: string): Person {
  const s = clean(raw);
  const comma = s.indexOf(',');
  if (comma > 0) {
    return { last: clean(s.slice(0, comma)), given: clean(s.slice(comma + 1)).split(' ').filter(Boolean) };
  }
  const tokens = s.split(' ').filter(Boolean);
  const last = tokens.pop() ?? '';
  return { last, given: tokens };
}

/** "Иван Иванович" -> ["И.", "И."]; "А.-М." and "И.И." are kept as initials. */
function initialsOf(p: Person): string[] {
  const out: string[] = [];
  for (const tok of p.given) {
    if (isInitials(tok)) out.push(...(tok.match(/\p{L}\.-?(?=\p{L}|$)|\p{L}\.-?/gu) ?? []));
    else out.push(tok.split('-').map((part) => `${part.charAt(0).toUpperCase()}.`).join('-'));
  }
  return out;
}

const initialsStr = (p: Person) => initialsOf(p).join(' ');
/** "Last, I. O." (or just "Last") */
const lastInitials = (p: Person) => (p.given.length ? `${p.last}, ${initialsStr(p)}` : p.last);
/** "I. O. Last" */
const initialsLast = (p: Person) => (p.given.length ? `${initialsStr(p)} ${p.last}` : p.last);
/** "Last, First Middle" (MLA) */
const lastFull = (p: Person) => (p.given.length ? `${p.last}, ${p.given.join(' ')}` : p.last);
const firstLast = (p: Person) => [...p.given, p.last].join(' ');

// ---------------------------------------------------------------- dates

interface Ymd { y: number; m?: number; d?: number }

function parseYmd(iso: string | undefined): Ymd | undefined {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(iso ?? '');
  if (!m) return undefined;
  return { y: +m[1]!, m: m[2] ? +m[2] : undefined, d: m[3] ? +m[3] : undefined };
}

/** Accessed date: date-only strings are taken literally, instants in local time. */
function accessedYmd(iso: string): Ymd {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return parseYmd(iso)!;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return parseYmd(nowIso())!;
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

// ---------------------------------------------------------------- helpers

/** Append terminal punctuation unless the text already ends with one. */
const endWith = (s: string, p = '.') => (/[.?!]$/.test(s) ? s : s + p);

function entryTitle(s: SourceMeta): string {
  return clean(s.title) || s.url;
}

// ---------------------------------------------------------------- GOST

function formatGost(s: SourceMeta): string {
  const title = entryTitle(s);
  const people = s.authors.map(parsePerson).filter((p) => p.last);
  const ymd = parseYmd(s.published);
  const a = accessedYmd(s.accessed);

  const first = people[0];
  let head = title;
  let responsibility = '';
  if (first && people.length <= 3) {
    head = `${lastInitials(first)} ${title}`;
    responsibility = ` / ${people.map(initialsLast).join(', ')}.`;
  } else if (first) {
    responsibility = ` / ${initialsLast(first)} [и др.].`;
  }

  let out = `${head}${responsibility} — Текст : электронный`;
  const site = clean(s.siteName);
  if (site) out += ` // ${site} : [сайт]`;
  if (ymd) out += `. — ${ymd.y}`;
  out += `. — URL: ${s.url} (дата обращения: ${pad(a.d!)}.${pad(a.m!)}.${a.y}).`;
  return out;
}

// ---------------------------------------------------------------- APA

function apaDate(y: Ymd | undefined): string {
  if (!y) return 'n.d.';
  if (y.m && y.d) return `${y.y}, ${MONTHS[y.m - 1]} ${y.d}`;
  if (y.m) return `${y.y}, ${MONTHS[y.m - 1]}`;
  return String(y.y);
}

function apaAuthors(people: Person[]): string {
  const f = people.map(lastInitials);
  const last = f[f.length - 1] ?? '';
  if (f.length === 1) return last;
  if (f.length === 2) return `${f[0]}, & ${last}`;
  if (f.length <= 20) return `${f.slice(0, -1).join(', ')}, & ${last}`;
  return `${f.slice(0, 19).join(', ')}, . . . ${last}`;
}

function formatApa(s: SourceMeta): string {
  const title = entryTitle(s);
  const people = s.authors.map(parsePerson).filter((p) => p.last);
  const ymd = parseYmd(s.published);
  const date = `(${apaDate(ymd)}).`;
  const parts: string[] = [];
  if (people.length) {
    parts.push(endWith(apaAuthors(people)), date, endWith(title));
  } else {
    parts.push(endWith(title), date);
  }
  const site = clean(s.siteName);
  if (site) parts.push(endWith(site));
  if (ymd) {
    parts.push(s.url);
  } else {
    const a = accessedYmd(s.accessed);
    parts.push(`Retrieved ${MONTHS[a.m! - 1]} ${a.d}, ${a.y}, from ${s.url}`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------- MLA

function mlaDate(y: Ymd): string {
  if (y.m && y.d) return `${y.d} ${MLA_MONTHS[y.m - 1]} ${y.y}`;
  if (y.m) return `${MLA_MONTHS[y.m - 1]} ${y.y}`;
  return String(y.y);
}

function mlaAuthors([first, second, third]: [Person, ...Person[]]): string {
  if (!second) return lastFull(first);
  if (!third) return `${lastFull(first)}, and ${firstLast(second)}`;
  return `${lastFull(first)}, et al`;
}

function formatMla(s: SourceMeta): string {
  const title = entryTitle(s);
  const people = s.authors.map(parsePerson).filter((p) => p.last);
  const ymd = parseYmd(s.published);
  const a = accessedYmd(s.accessed);

  const parts: string[] = [];
  const [firstPerson, ...restPeople] = people;
  if (firstPerson) parts.push(endWith(mlaAuthors([firstPerson, ...restPeople])));
  parts.push(`"${endWith(title)}"`);
  const container = [clean(s.siteName), ymd ? mlaDate(ymd) : '', s.url].filter(Boolean).join(', ');
  parts.push(`${container}.`);
  parts.push(`Accessed ${a.d} ${MLA_MONTHS[a.m! - 1]} ${a.y}.`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- public

/** Format one bibliography entry (plain text, no numbering). */
export function formatCitation(source: SourceMeta, style: CitationStyle): string {
  switch (style) {
    case 'gost': return formatGost(source);
    case 'apa': return formatApa(source);
    case 'mla': return formatMla(source);
  }
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

function sortKey(s: SourceMeta): string {
  const first = s.authors.map(parsePerson).find((p) => p.last);
  const raw = first ? `${first.last} ${first.given.join(' ')}` : entryTitle(s);
  return raw.replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
}

/** Format a deduplicated, correctly sorted bibliography list for the style. */
export function formatBibliography(sources: SourceMeta[], style: CitationStyle): string[] {
  const seen = new Set<string>();
  const unique = sources.filter((s) => {
    const k = normalizeUrl(s.url);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const keyed = unique.map((s) => ({ s, key: sortKey(s) }));
  keyed.sort((x, y) => {
    if (style === 'gost') {
      const cx = CYRILLIC.test(x.key[0] ?? '') ? 0 : 1;
      const cy = CYRILLIC.test(y.key[0] ?? '') ? 0 : 1;
      if (cx !== cy) return cx - cy;
    }
    return x.key.localeCompare(y.key, style === 'gost' ? 'ru' : 'en');
  });
  return keyed.map(({ s }) => formatCitation(s, style));
}
