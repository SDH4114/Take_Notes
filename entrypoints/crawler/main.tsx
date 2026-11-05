// Crawler page: pick chapters of a documentation section and save them as one book. Owner: agent D.
import { render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import '@/src/ui/base.css';
import './style.css';
import { onBroadcast, send, sendToTab } from '@/src/core/messages';
import { translator } from '@/src/core/i18n';
import type { Book, CrawlProgress, ExportFormat, TocEntry } from '@/src/core/types';
import { defaultBookTitle } from '@/src/crawl/book';
import { scopePrefix } from '@/src/crawl/toc';
import { strings } from '@/src/crawl/strings';

const t = translator(strings);
type BookInfo = Omit<Book, 'chapters'>;
const EXPORTS: { format: ExportFormat; label: 'exportPdf' | 'exportMd' | 'exportZip' }[] = [
  { format: 'pdf', label: 'exportPdf' },
  { format: 'md', label: 'exportMd' },
  { format: 'md-folder-zip', label: 'exportZip' },
];
const IDLE: CrawlProgress = { state: 'idle', done: 0, total: 0, errors: [] };

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function ExportButtons({ id, onError }: { id: string; onError: (m: string) => void }) {
  return (
    <span class="row">
      {EXPORTS.map((x) => (
        <button key={x.format} onClick={() => send('export/book', { id, format: x.format }).catch((e) => onError(errText(e)))}>
          {t(x.label)}
        </button>
      ))}
    </span>
  );
}

function App() {
  const tabId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('tab');
    const n = raw == null ? NaN : Number(raw);
    return Number.isInteger(n) ? n : null;
  }, []);

  const [pageUrl, setPageUrl] = useState('');
  const [title, setTitle] = useState('');
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detecting, setDetecting] = useState(tabId != null);
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<CrawlProgress>(IDLE);
  const [saved, setSaved] = useState<BookInfo[]>([]);
  const [error, setError] = useState('');

  const applyEntries = useCallback((list: TocEntry[]) => {
    setEntries(list);
    setSelected(new Set(list.map((_, i) => i)));
  }, []);

  const loadBooks = useCallback(() => {
    send('book/list').then(setSaved).catch((e) => setError(errText(e)));
  }, []);

  useEffect(() => {
    loadBooks();
    send('crawl/status').then(setProgress).catch(() => {});
    const offProgress = onBroadcast('crawl/progress', setProgress);
    const offData = onBroadcast('data/changed', (e) => { if (e.kind === 'book') loadBooks(); });
    return () => { offProgress(); offData(); };
  }, [loadBooks]);

  // Firefox suspends an idle MV3 event page; a long crawl lives in the background's memory.
  // Pinging it while running keeps it awake (keep this tab open during a crawl).
  const running = progress.state === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { send('crawl/status').catch(() => {}); }, 15_000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (tabId == null) return;
    (async () => {
      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url) { setPageUrl(tab.url); setTitle(defaultBookTitle(tab.url)); }
        applyEntries(await send('crawl/detectToc', { tabId }));
      } catch (e) {
        setError(errText(e));
      } finally {
        setDetecting(false);
      }
    })();
  }, [tabId, applyEntries]);

  const pickManually = async () => {
    if (tabId == null) return;
    setError('');
    setPicking(true);
    try {
      await browser.tabs.update(tabId, { active: true });
      const picked = await sendToTab(tabId, 'content/pickToc');
      if (picked.length) applyEntries(picked);
    } catch (e) {
      setError(errText(e));
    } finally {
      setPicking(false);
      const me = await browser.tabs.getCurrent().catch(() => undefined);
      if (me?.id != null) browser.tabs.update(me.id, { active: true }).catch(() => {});
    }
  };

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  };

  const start = async () => {
    setError('');
    const chosen = entries.filter((_, i) => selected.has(i));
    try {
      await send('crawl/start', { title: title.trim() || defaultBookTitle(pageUrl), rootUrl: scopePrefix(pageUrl), entries: chosen });
    } catch (e) {
      setError(errText(e));
    }
  };

  const remove = async (b: BookInfo) => {
    if (!confirm(t('confirmDelete', { title: b.title }))) return;
    await send('book/delete', { id: b.id }).catch((e) => setError(errText(e)));
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main class="crawler">
      <h1>{t('pageTitle')}</h1>
      <p class="muted small">{t('copyright')}</p>
      {error && <p class="error">{error}</p>}

      {tabId == null ? (
        <p class="muted">{t('noTab')}</p>
      ) : (
        <section>
          <label class="field">
            <span>{t('bookTitle')}</span>
            <input type="text" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} disabled={running} />
          </label>

          <div class="row spread">
            <h2>{t('chapters')}</h2>
            <span class="muted">{t('selected', { n: selected.size, total: entries.length })}</span>
          </div>
          <div class="row">
            <button onClick={() => setSelected(new Set(entries.map((_, i) => i)))} disabled={running}>{t('selectAll')}</button>
            <button onClick={() => setSelected(new Set())} disabled={running}>{t('selectNone')}</button>
            <button onClick={pickManually} disabled={running || picking}>{t('pickManual')}</button>
          </div>

          {detecting && <p class="muted">{t('detecting')}</p>}
          {!detecting && entries.length === 0 && <p class="muted">{t('nothingFound')}</p>}
          <ul class="toc">
            {entries.map((e, i) => (
              <li key={e.url} style={{ paddingLeft: `${e.level * 18}px` }}>
                <label>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} disabled={running} />
                  {' '}{e.title}
                </label>
              </li>
            ))}
          </ul>

          <div class="row">
            <button class="primary" onClick={start} disabled={running || selected.size === 0}>{t('download')}</button>
            {running && <button onClick={() => send('crawl/stop')}>{t('stop')}</button>}
          </div>
        </section>
      )}

      {progress.state !== 'idle' && (
        <section>
          <progress max={progress.total || 1} value={progress.done} />
          <div class="row spread">
            <span>{t('progress', { done: progress.done, total: progress.total })} ({pct}%)</span>
            {progress.state === 'done' && <strong>{t('done')}</strong>}
            {progress.state === 'stopped' && <strong>{t('stopped')}</strong>}
            {progress.state === 'error' && <strong class="error">{t('failed')}</strong>}
          </div>
          {running && progress.current && <p class="muted small url">{progress.current}</p>}
          {progress.errors.length > 0 && (
            <details>
              <summary>{t('errors', { n: progress.errors.length })}</summary>
              <ul class="errors">
                {progress.errors.map((er, i) => <li key={i}><span class="url">{er.url}</span>: {er.message}</li>)}
              </ul>
            </details>
          )}
          {progress.bookId && <ExportButtons id={progress.bookId} onError={setError} />}
        </section>
      )}

      <section>
        <h2>{t('saved')}</h2>
        {saved.length === 0 && <p class="muted">{t('noBooks')}</p>}
        <ul class="books">
          {saved.map((b) => (
            <li key={b.id}>
              <div class="row spread">
                <span><strong>{b.title}</strong> <span class="muted small">{b.createdAt.slice(0, 10)}</span></span>
                <button onClick={() => remove(b)}>{t('del')}</button>
              </div>
              <ExportButtons id={b.id} onError={setError} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

render(<App />, document.getElementById('app')!);
