export const nowIso = (): string => new Date().toISOString();

export const newId = (): string => crypto.randomUUID();

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
