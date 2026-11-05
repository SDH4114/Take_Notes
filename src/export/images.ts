// Download images referenced from Markdown and rewrite the links to relative `images/…` paths.
import { assets } from '@/src/core/storage';
import type { Asset } from '@/src/core/types';
import { newId } from '@/src/core/util';

export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const IMAGE_CONCURRENCY = 4;

export interface LocalizeOptions {
  fetchFn?: typeof fetch;
  /** false = leave every link remote (settings.downloadImages). */
  enabled?: boolean;
  maxTotalBytes?: number;
  concurrency?: number;
}

export interface LocalizeResult {
  /** Input documents with rewritten image links (same order). */
  markdown: string[];
  /** Relative path → bytes, ready for zipping. */
  files: Record<string, Uint8Array>;
  /** URLs that could not be downloaded (links stay remote). */
  failed: string[];
}

// ![alt](url) / ![alt](<url> "title")
const IMAGE_RE = /(!\[[^\]]*\]\(\s*)(<[^>\s]+>|[^)\s]+)((?:\s+"[^"]*")?\s*\))/g;
const unwrap = (u: string) => (u.startsWith('<') ? u.slice(1, -1) : u);
const isRemote = (u: string) => /^https?:\/\//i.test(u);

export function collectImageUrls(markdown: string): string[] {
  const urls = new Set<string>();
  for (const m of markdown.matchAll(IMAGE_RE)) {
    const u = unwrap(m[2] ?? '');
    if (isRemote(u)) urls.add(u);
  }
  return [...urls];
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
};

function extFor(mime: string, url: string): string {
  const fromMime = MIME_EXT[mime.toLowerCase()];
  if (fromMime) return fromMime;
  const m = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:$|[?#])/i.exec(url);
  return m ? (m[1] ?? '').toLowerCase().replace('jpeg', 'jpg') : 'bin';
}

/** Short stable hash of a URL (cyrb53) used as the file name. */
function hashUrl(url: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const bytesOf = async (blob: Blob): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await new Response(blob).arrayBuffer());

export async function localizeImages(docs: string[], opts: LocalizeOptions = {}): Promise<LocalizeResult> {
  const { fetchFn = fetch, enabled = true, maxTotalBytes = MAX_TOTAL_BYTES, concurrency = IMAGE_CONCURRENCY } = opts;
  if (!enabled) return { markdown: docs, files: {}, failed: [] };

  const urls = [...new Set(docs.flatMap(collectImageUrls))];
  const pathByUrl = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};
  const failed: string[] = [];
  let total = 0;
  let limitHit = false;

  async function load(url: string): Promise<void> {
    try {
      let asset = await assets.findByUrl(url);
      let data: Uint8Array<ArrayBuffer>;
      if (asset) {
        data = await bytesOf(asset.data);
      } else {
        if (limitHit) throw new Error('size limit reached');
        const res = await fetchFn(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        if (!mime.startsWith('image/')) throw new Error(`not an image: ${mime || 'unknown type'}`);
        data = new Uint8Array(await res.arrayBuffer());
        asset = { id: newId(), url, mime, filename: `images/${hashUrl(url)}.${extFor(mime, url)}`, data: new Blob([data], { type: mime }) } satisfies Asset;
      }
      if (total + data.byteLength > maxTotalBytes) {
        limitHit = true;
        throw new Error('size limit reached');
      }
      total += data.byteLength;
      if (!(await assets.findByUrl(url))) await assets.put(asset);
      files[asset.filename] = data;
      pathByUrl.set(url, asset.filename);
    } catch {
      failed.push(url);
    }
  }

  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) await load(url);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));

  const rewrite = (md: string) =>
    md.replace(IMAGE_RE, (whole, pre: string, url: string, post: string) => {
      const path = pathByUrl.get(unwrap(url));
      return path ? `${pre}${path}${post}` : whole;
    });
  return { markdown: docs.map(rewrite), files, failed };
}
