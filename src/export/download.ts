// Download helper. Owner: agent E. STUB — signature is a contract.
import { browser } from 'wxt/browser';

/** Save a Blob via browser.downloads with a safe filename (opens Save dialog if saveAs). */
export async function downloadBlob(blob: Blob, filename: string, saveAs = false): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await browser.downloads.download({ url, filename, saveAs });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
