// Crawler page: pick chapters of a documentation section and save them as one book. Owner: agent D.
import { render } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import '@/src/ui/base.css';
import { initTheme } from '@/src/ui/theme';
import './style.css';
import { onBroadcast, send, sendToTab } from '@/src/core/messages';
import { translator } from '@/src/core/i18n';
import type { Book, CrawlProgress, TocEntry } from '@/src/core/types';
import { defaultBookTitle } from '@/src/crawl/book';
import { scopePrefix } from '@/src/crawl/toc';
import { strings } from '@/src/crawl/strings';
import { ExportMenu, IconButton, UiProvider, errText, useUi } from '@/src/ui/components';
import { Icon } from '@/src/ui/icons';

initTheme();

const t = translator(strings);
type BookInfo = Omit<Book, 'chapters'>;
const IDLE: CrawlProgress = { state: 'idle', done: 0, total: 0, errors: [] };

function Crawler() {
  const ui = useUi();
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
    if (!(await ui.confirm(t('confirmDelete', { title: b.title }), { okLabel: t('del'), danger: true }))) return;
    await send('book/delete', { id: b.id }).catch((e) => setError(errText(e)));
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main class="crawler">
      <header class="cr-head">
        <span class="logo" aria-hidden="true"><Icon name="book" size={16} /></span>
        <h1>{t('pageTitle')}</h1>
      </header>
      {error && <div class="error-box">{error}</div>}

      {tabId == null ? (
        <p class="muted">{t('noTab')}</p>
      ) : (
        <section class="cr-section">
          <label>
            <span class="label">{t('bookTitle')}</span>
            <input class="input" type="text" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} disabled={running} />
          </label>

          <div class="row cr-bar">
            <h2 class="grow">{t('chapters')}</h2>
            <span class="muted small">{t('selected', { n: selected.size, total: entries.length })}</span>
          </div>
          <div class="row">
            <button type="button" class="btn sm" onClick={() => setSelected(new Set(entries.map((_, i) => i)))} disabled={running}>{t('selectAll')}</button>
            <button type="button" class="btn sm" onClick={() => setSelected(new Set())} disabled={running}>{t('selectNone')}</button>
            <button type="button" class="btn sm" onClick={pickManually} disabled={running || picking}>{t('pickManual')}</button>
          </div>

          {detecting && <p class="muted">{t('detecting')}</p>}
          {!detecting && entries.length === 0 && <p class="muted">{t('nothingFound')}</p>}
          {entries.length > 0 && (
            <ul class="toc card">
              {entries.map((e, i) => (
                <li key={e.url} style={{ paddingLeft: `${e.level * 18}px` }}>
                  <label>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} disabled={running} />
                    <span>{e.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div class="row">
            <button type="button" class="btn primary lg" onClick={start} disabled={running || selected.size === 0}>
              <Icon name="download" size={16} />{t('download')}
            </button>
            {running && <button type="button" class="btn lg" onClick={() => send('crawl/stop')}>{t('stop')}</button>}
          </div>
        </section>
      )}

      {progress.state !== 'idle' && (
        <section class="cr-section card cr-progress">
          <progress max={progress.total || 1} value={progress.done} />
          <div class="row">
            <span class="grow">{t('progress', { done: progress.done, total: progress.total })} ({pct}%)</span>
            {progress.state === 'done' && <span class="badge ok">{t('done')}</span>}
            {progress.state === 'stopped' && <span class="badge">{t('stopped')}</span>}
            {progress.state === 'error' && <span class="badge err">{t('failed')}</span>}
          </div>
          {running && progress.current && <p class="muted small url">{progress.current}</p>}
          {progress.errors.length > 0 && (
            <details>
              <summary>{t('errors', { n: progress.errors.length })}</summary>
              <ul class="errors small">
                {progress.errors.map((er, i) => <li key={i}><span class="url">{er.url}</span>: {er.message}</li>)}
              </ul>
            </details>
          )}
          {progress.bookId && (
            <div><ExportMenu subject={{ kind: 'book', id: progress.bookId }} variant="primary" placement="down" align="left" /></div>
          )}
        </section>
      )}

      <section class="cr-section">
        <h2>{t('saved')}</h2>
        {saved.length === 0 && <p class="muted">{t('noBooks')}</p>}
        <ul class="books">
          {saved.map((b) => (
            <li key={b.id} class="card">
              <div class="grow">
                <strong>{b.title}</strong> <span class="muted small">{b.createdAt.slice(0, 10)}</span>
              </div>
              <ExportMenu subject={{ kind: 'book', id: b.id }} placement="down" align="right" />
              <IconButton icon="trash" danger title={t('del')} onClick={() => void remove(b)} />
            </li>
          ))}
        </ul>
      </section>

      <p class="muted small cr-copy">{t('copyright')}</p>
    </main>
  );
}

render(<UiProvider><Crawler /></UiProvider>, document.getElementById('app')!);
