// Print page: renders a document (clip / project / book / highlights) from storage for PDF export.
// Opened as print.html?kind=…&id=… by src/export/pdf.ts. Math is shown as raw TeX (no renderer bundled).
import { browser } from 'wxt/browser';
import { loadPrintDoc, type PrintKind } from '@/src/export/data';
import { PRINT_READY } from '@/src/export/pdf';
import { buildPrintHtml, PRINT_CSS } from '@/src/export/printdoc';
import { exportT } from '@/src/export/strings';
import { setHtml } from '@/src/core/html';

const KINDS: PrintKind[] = ['clip', 'project', 'book', 'highlights', 'board'];
const IMAGE_TIMEOUT_MS = 20_000;

declare global {
  interface Window { __tnReady?: boolean }
}

function waitForImages(): Promise<void> {
  const pending = Array.from(document.images).filter((img) => !img.complete);
  if (!pending.length) return Promise.resolve();
  const loaded = Promise.all(
    pending.map((img) => new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    })),
  );
  return Promise.race([loaded.then(() => undefined), new Promise<void>((r) => setTimeout(r, IMAGE_TIMEOUT_MS))]);
}

function signal(ok: boolean, error?: string): void {
  window.__tnReady = ok;
  browser.runtime.sendMessage({ type: PRINT_READY, ok, error }).catch(() => {});
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const kind = params.get('kind') as PrintKind | null;
  const id = params.get('id');
  if (!kind || !KINDS.includes(kind) || !id) throw new Error(exportT()('printMissing'));

  const doc = await loadPrintDoc(kind, id);
  document.title = doc.title;
  document.documentElement.lang = doc.lang;
  const style = document.createElement('style');
  style.textContent = doc.landscape ? `${PRINT_CSS}\n@page { size: A4 landscape; margin: 12mm; }` : PRINT_CSS;
  document.head.append(style);
  // buildPrintHtml: every section body is sanitized with DOMPurify, all other text is escaped.
  setHtml(document.getElementById('app')!, buildPrintHtml(doc));
  await waitForImages();
  signal(true);
  if (params.get('autoprint') === '1') setTimeout(() => window.print(), 300);
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  document.getElementById('app')!.textContent = message;
  signal(false, message);
});
