export const nowIso = (): string => new Date().toISOString();

/**
 * Random UUID v4. `crypto.randomUUID` exists only in secure contexts, and content scripts on http:// pages
 * are not one (Chrome) → fall back to getRandomValues, which works everywhere.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const TRACKING = /^(utm_|fbclid$|gclid$|yclid$|mc_|ref$|_hs)/;

/** Normalize a URL for identity: drop hash and tracking params. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Highlights join their note by `Highlight.url`. A note without a source URL (own / imported) has no page, so its
 * highlights carry this synthetic per-note key instead: two url-less notes never share highlights, and no web page
 * (content scripts, highlight/listForUrl) can ever match it.
 */
const NOTE_URL_PREFIX = 'takenotes-note:';
export const noteHighlightUrl = (clipId: string): string => `${NOTE_URL_PREFIX}${clipId}`;
export const isNoteHighlightUrl = (url: string): boolean => url.startsWith(NOTE_URL_PREFIX);
/** Clip id inside a note key, or null for page URLs. */
export const noteIdOfHighlightUrl = (url: string): string | null => (isNoteHighlightUrl(url) ? url.slice(NOTE_URL_PREFIX.length) || null : null);
/** True when a highlight's url is a real page that can be opened (not a note key, not empty). */
export const isPageHighlightUrl = (url: string): boolean => !!url && !isNoteHighlightUrl(url);

/** The `Highlight.url` that belongs to a clip: its normalized page URL, or the note key for url-less notes. */
export function clipHighlightUrl(clip: { id: string; source: { url: string } }): string {
  return clip.source.url ? normalizeUrl(clip.source.url) : noteHighlightUrl(clip.id);
}

/** Safe filename for downloads (keeps Cyrillic). */
export function slugifyFilename(name: string, max = 80): string {
  const s = name
    // Path separators, characters illegal on Windows/macOS, and [ ] # ^ | which break Obsidian [[wikilinks]].
    .replace(/[\\/:*?"<>|\[\]#^\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return s && !/^\.+$/.test(s) ? s : 'untitled';
}

export const isHttpUrl = (u: string): boolean => /^https?:\/\//i.test(u);

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Read a response body but stop at `maxBytes` (rejects early on a too-large Content-Length). */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`too large (${declared} bytes)`);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error(`too large (${buf.byteLength} bytes)`);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`too large (> ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
