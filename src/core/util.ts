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
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return s || 'untitled';
}
