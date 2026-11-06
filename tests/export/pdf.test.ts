import { describe, expect, it } from 'vitest';
import { runPdfExport, type PdfDeps } from '@/src/export/pdf';

function fakeDeps(over: Partial<PdfDeps> = {}) {
  const log: string[] = [];
  const saved: unknown[] = [];
  const deps: PdfDeps = {
    openTab: async (url) => { log.push(`open ${url}`); return 7; },
    waitReady: async () => ({ ok: true }),
    saveAsPDF: async (opts) => { saved.push(opts); return 'saved'; },
    print: async (id) => { log.push(`print ${id}`); },
    closeTab: async (id) => { log.push(`close ${id}`); },
    ...over,
  };
  return { deps, log, saved };
}

const opts = { url: 'moz-extension://x/print.html?kind=clip&id=1', filename: 'Doc.pdf', lang: 'en' as const };

describe('runPdfExport', () => {
  it('saves with the expected page settings and closes the tab', async () => {
    const { deps, log, saved } = fakeDeps();
    await runPdfExport(deps, opts);
    expect(saved[0]).toMatchObject({ toFileName: 'Doc.pdf', shrinkToFit: true, showBackgroundColors: true });
    expect(log).toEqual([`open ${opts.url}`, 'close 7']);
  });
  it('treats replaced as success and canceled as a silent no-op', async () => {
    for (const status of ['replaced', 'canceled']) {
      const { deps, log } = fakeDeps({ saveAsPDF: async () => status });
      await expect(runPdfExport(deps, opts)).resolves.toBeUndefined();
      expect(log).toContain('close 7');
    }
  });
  it('throws on not_saved / not_replaced and still closes the tab', async () => {
    const { deps, log } = fakeDeps({ saveAsPDF: async () => 'not_saved' });
    await expect(runPdfExport(deps, opts)).rejects.toThrow('PDF was not saved');
    expect(log).toContain('close 7');
  });
  it('without saveAsPDF (Chrome) the print page prints itself and the tab stays open', async () => {
    const { deps, log } = fakeDeps({ saveAsPDF: undefined });
    await runPdfExport(deps, opts);
    expect(log).toEqual([`open ${opts.url}&autoprint=1`, 'print 7']);
  });
  it('reports a failing print page and closes the tab', async () => {
    const { deps, log } = fakeDeps({ waitReady: async () => ({ ok: false, error: 'Clip not found' }) });
    await expect(runPdfExport(deps, opts)).rejects.toThrow('Could not save PDF: Clip not found');
    expect(log).toContain('close 7');
  });
  it('reports a timeout when the page never becomes ready', async () => {
    const { deps, log } = fakeDeps({ waitReady: async () => { throw new Error('timeout'); } });
    await expect(runPdfExport(deps, opts)).rejects.toThrow('The print page did not load in time');
    expect(log).toContain('close 7');
  });
});
