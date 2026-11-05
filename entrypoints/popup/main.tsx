// Popup page. Owner: agent A.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import '@/src/ui/base.css';
import { send } from '@/src/core/messages';
import { settings } from '@/src/core/storage';
import type { Project } from '@/src/core/types';
import { t } from '@/src/extract/strings';
import { crawlerPath, isYoutubeWatchUrl } from './logic';
import './popup.css';

interface Status { kind: 'ok' | 'error' | 'info'; text: string }

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<{ id?: number; url?: string }>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [[active], list, s] = await Promise.all([
          browser.tabs.query({ active: true, currentWindow: true }),
          send('project/list'),
          settings.get(),
        ]);
        setTab({ id: active?.id, url: active?.url });
        setProjects(list);
        // A deleted project must not stay selected: fall back to Inbox.
        setProjectId(list.some((p) => p.id === s.defaultProjectId) ? s.defaultProjectId : null);
      } catch (e) {
        fail(e);
      }
    })();
  }, []);

  const fail = (e: unknown) => setStatus({ kind: 'error', text: t('error', { message: e instanceof Error ? e.message : String(e) }) });

  const chooseProject = (value: string) => {
    const id = value === '' ? null : value;
    setProjectId(id);
    settings.set({ defaultProjectId: id }).catch(fail);
  };

  async function run(action: () => Promise<Status | null>) {
    setBusy(true);
    setStatus({ kind: 'info', text: t('working') });
    try {
      setStatus(await action());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  const savePage = () =>
    run(async () => {
      const clip = await send('clip/savePage', { tabId: tab.id, projectId });
      return { kind: 'ok', text: t('saved', { title: clip.title }) };
    });

  const saveSelection = () =>
    run(async () => {
      const clip = await send('clip/saveSelection', { tabId: tab.id, projectId });
      return clip ? { kind: 'ok', text: t('saved', { title: clip.title }) } : { kind: 'error', text: t('noSelection') };
    });

  const exportPage = (format: 'md' | 'pdf') =>
    run(async () => {
      const clip = await send('clip/savePage', { tabId: tab.id, projectId });
      await send('export/clip', { id: clip.id, format });
      return { kind: 'ok', text: t('exported', { title: clip.title }) };
    });

  const youtube = () =>
    run(async () => {
      const clip = await send('youtube/saveTranscript', { tabId: tab.id, projectId });
      return clip ? { kind: 'ok', text: t('saved', { title: clip.title }) } : { kind: 'error', text: t('error', { message: 'no transcript' }) };
    });

  const openCrawler = async () => {
    if (tab.id == null) return;
    await browser.tabs.create({ url: browser.runtime.getURL(crawlerPath(tab.id) as '/crawler.html') });
    window.close();
  };

  const openSidebar = () => {
    // sidebarAction.open() must run synchronously inside the click handler (user gesture).
    const sidebar = (browser as unknown as { sidebarAction?: { open(): Promise<void> } }).sidebarAction;
    sidebar?.open().then(() => window.close(), fail);
  };

  return (
    <div class="tn-popup">
      <label class="tn-row">
        <span class="muted">{t('project')}</span>
        <select value={projectId ?? ''} onChange={(e) => chooseProject(e.currentTarget.value)}>
          <option value="">{t('inbox')}</option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <button class="primary" disabled={busy} onClick={savePage}>{t('savePage')}</button>
      <button disabled={busy} onClick={saveSelection}>{t('saveSelection')}</button>
      <div class="tn-pair">
        <button disabled={busy} onClick={() => exportPage('md')}>{t('exportMd')}</button>
        <button disabled={busy} onClick={() => exportPage('pdf')}>{t('exportPdf')}</button>
      </div>
      <button disabled={busy || tab.id == null} onClick={openCrawler}>{t('crawl')}</button>
      {isYoutubeWatchUrl(tab.url) && <button disabled={busy} onClick={youtube}>{t('youtube')}</button>}
      <button onClick={openSidebar}>{t('sidebar')}</button>
      {status && <div class={`tn-status ${status.kind}`} role="status">{status.text}</div>}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
