// PDF export: open our print page in a tab, wait until it is rendered, save with Firefox' tabs.saveAsPDF.
import { browser } from 'wxt/browser';
import { uiLang, type Lang } from '@/src/core/i18n';
import { printPath, type PrintKind } from './data';
import { exportT } from './strings';

/** Raw runtime message the print page sends when it is rendered (not part of the typed contract). */
export const PRINT_READY = 'export/printReady';
export interface ReadyMessage { ok: boolean; error?: string }

export interface PdfDeps {
  openTab(url: string): Promise<number>;
  /** Resolves when the print page reports readiness; rejects on timeout. */
  waitReady(tabId: number): Promise<ReadyMessage>;
  /** Firefox-only; undefined elsewhere. Resolves with 'saved' | 'replaced' | 'canceled' | 'not_saved' | 'not_replaced'. */
  saveAsPDF?: (settings: Record<string, unknown>) => Promise<string>;
  print(tabId: number): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  /** Release listeners; safe to call more than once. */
  dispose?(): void;
}

export interface PdfOptions { url: string; filename: string; lang?: Lang; landscape?: boolean }

/** Orchestration, independent of the browser APIs (see browserPdfDeps for the real ones). */
export async function runPdfExport(deps: PdfDeps, { url, filename, lang = uiLang(), landscape = false }: PdfOptions): Promise<void> {
  const t = exportT(lang);
  // Without saveAsPDF (Chrome) the print page opens the browser's print dialog itself ("Save as PDF").
  const tabId = await deps.openTab(deps.saveAsPDF ? url : `${url}&autoprint=1`);
  let keepOpen = false;
  try {
    let ready: ReadyMessage;
    try {
      ready = await deps.waitReady(tabId);
    } catch {
      throw new Error(t('errPdfTimeout'));
    }
    if (!ready.ok) throw new Error(t('errPdf', { reason: ready.error ?? '?' }));

    if (!deps.saveAsPDF) {
      // Not Firefox (or API missing): let the user print from the open tab.
      keepOpen = true;
      await deps.print(tabId);
      return;
    }
    const status = await deps.saveAsPDF({
      toFileName: filename,
      orientation: landscape ? 1 : 0,
      shrinkToFit: true,
      showBackgroundColors: true, // highlight marks are backgrounds
      showBackgroundImages: false,
      headerLeft: '', headerCenter: '', headerRight: '',
      footerLeft: '', footerCenter: '&P / &PT', footerRight: '',
    });
    if (status === 'not_saved' || status === 'not_replaced') throw new Error(t('errPdfNotSaved'));
    // 'saved' | 'replaced' | 'canceled' (user's choice, not an error)
  } finally {
    if (!keepOpen) await deps.closeTab(tabId).catch(() => {});
  }
}

/** Real implementation on top of WebExtension APIs. One instance per export. */
export function browserPdfDeps(timeoutMs = 90_000): PdfDeps {
  const early = new Map<number, ReadyMessage>();
  const waiters = new Map<number, (m: ReadyMessage) => void>();
  const listener = (msg: unknown, sender: { tab?: { id?: number } }) => {
    const m = msg as { type?: string } & ReadyMessage;
    const id = sender.tab?.id;
    if (m?.type !== PRINT_READY || id == null) return undefined;
    const w = waiters.get(id);
    if (w) w({ ok: m.ok, error: m.error });
    else early.set(id, { ok: m.ok, error: m.error });
    return undefined;
  };
  browser.runtime.onMessage.addListener(listener);
  const dispose = () => browser.runtime.onMessage.removeListener(listener);

  const tabsApi = browser.tabs as unknown as { saveAsPDF?: (s: Record<string, unknown>) => Promise<string> };
  return {
    dispose,
    async openTab(url) {
      const tab = await browser.tabs.create({ url: browser.runtime.getURL(url as never), active: true });
      if (tab.id == null) throw new Error('No tab id');
      return tab.id;
    },
    waitReady(tabId) {
      const done = early.get(tabId);
      if (done) return Promise.resolve(done);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(tabId); reject(new Error('timeout')); }, timeoutMs);
        waiters.set(tabId, (m) => { clearTimeout(timer); waiters.delete(tabId); resolve(m); });
      });
    },
    saveAsPDF: tabsApi.saveAsPDF ? (s) => tabsApi.saveAsPDF!(s) : undefined,
    async print() {
      // The page prints itself (autoprint=1): Chrome can't inject scripts into extension pages.
      dispose();
    },
    async closeTab(tabId) {
      dispose();
      await browser.tabs.remove(tabId);
    },
  };
}

/** Export a subject as PDF through the print page. */
export async function exportPdf(kind: PrintKind, id: string, filename: string, lang: Lang = uiLang()): Promise<void> {
  const deps = browserPdfDeps();
  try {
    // The board is wide: columns side by side.
    await runPdfExport(deps, { url: printPath(kind, id), filename, lang, landscape: kind === 'board' });
  } finally {
    deps.dispose?.(); // also covers a failed openTab, which never reaches closeTab
  }
}
