import { strToU8, zipSync } from 'fflate';

/** Zip `{ relative/path: text | bytes }` into a Blob. Entries are deflated, text is UTF-8. */
export function createZip(files: Record<string, string | Uint8Array>): Blob {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) entries[path] = typeof data === 'string' ? strToU8(data) : data;
  const zipped = zipSync(entries, { level: 6 });
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
