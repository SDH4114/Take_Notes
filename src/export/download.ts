// Download helper. Owner: agent E.
import { browser } from 'wxt/browser';
import { slugifyFilename } from '@/src/core/util';

/** `<safe base name>.<ext>` — the base is slugified (Cyrillic kept), the extension is never truncated. */
export function exportFilename(base: string, ext: string): string {
  return `${slugifyFilename(base)}.${ext}`;
}

/** Save a Blob via browser.downloads with a safe filename (opens Save dialog if saveAs). */
export async function downloadBlob(blob: Blob, filename: string, saveAs = false): Promise<void> {
  const dot = filename.lastIndexOf('.');
  const safe = dot > 0 ? exportFilename(filename.slice(0, dot), filename.slice(dot + 1)) : slugifyFilename(filename);
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({ url, filename: safe, saveAs });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export const markdownBlob = (text: string): Blob => new Blob([text], { type: 'text/markdown;charset=utf-8' });
export const textBlob = (text: string): Blob => new Blob([text], { type: 'text/plain;charset=utf-8' });
