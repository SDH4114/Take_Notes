// Popup page.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import '@/src/ui/base.css';
import { initTheme } from '@/src/ui/theme';
import './popup.css';
import { send } from '@/src/core/messages';
import { settings } from '@/src/core/storage';
import type { ExportFormat, Project } from '@/src/core/types';
import { t } from '@/src/extract/strings';
import { Icon } from '@/src/ui/icons';
import { IconButton, Menu, ProjectPicker, UiProvider, errText, openLibrary, runExport, type MenuItem } from '@/src/ui/components';
import { ut } from '@/src/ui/strings';
import { crawlerPath, findClipForUrl, isYoutubeWatchUrl } from './logic';
import { DEFAULT_SITE_ACCESS, addSite, isActiveOn, isBlocked, siteOf, unblockUrl, type SiteAccess } from '@/src/sites/rules';
import { getSiteAccess, onSiteAccessChanged, setSiteAccess } from '@/src/sites/store';
import { t as st } from '@/src/sites/strings';

initTheme();

interface Status { kind: 'ok' | 'error' | 'info'; text: string; clipId?: string }

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [tab, setTab] = useState<{ id?: number; url?: string; windowId?: number }>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [access, setAccess] = useState<SiteAccess>(DEFAULT_SITE_ACCESS);

  const fail = (e: unknown) => setStatus({ kind: 'error', text: t('error', { message: errText(e) }) });

  const loadProjects = async () => {
    const list = await send('project/list');
    setProjects(list);
    return list;
  };

  useEffect(() => {
    getSiteAccess().then(setAccess).catch(fail);
    return onSiteAccessChanged(setAccess);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [[active], list, s] = await Promise.all([
          browser.tabs.query({ active: true, currentWindow: true }),
          loadProjects(),
          settings.get(),
        ]);
        setTab({ id: active?.id, url: active?.url, windowId: active?.windowId });
        // A deleted project must not stay selected: fall back to Inbox.
        setProjectId(list.some((p) => p.id === s.defaultProjectId) ? s.defaultProjectId : null);
      } catch (e) {
        fail(e);
      }
    })();
  }, []);

  const chooseProject = (id: string | null) => {
    setProjectId(id);
    settings.set({ defaultProjectId: id }).catch(fail);
  };

  const site = siteOf(tab.url);
  const blocked = isBlocked(tab.url, access.blockedSites);
  // Only web pages are gated; on browser pages the actions fail with their own message anyway.
  const inactive = site != null && !isActiveOn(tab.url, access);
  const updateAccess = (patch: Partial<SiteAccess>) => {
    setStatus(null);
    setSiteAccess(patch).then(setAccess, fail);
  };
  const toggleEnabled = () => updateAccess({ enabled: !access.enabled });
  const toggleSite = () =>
    updateAccess({ blockedSites: blocked ? unblockUrl(access.blockedSites, tab.url) : addSite(access.blockedSites, site ?? '') });

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
      return { kind: 'ok', text: t('saved', { title: clip.title }), clipId: clip.id };
    });

  const saveSelection = () =>
    run(async () => {
      const clip = await send('clip/saveSelection', { tabId: tab.id, projectId });
      return clip
        ? { kind: 'ok', text: t('saved', { title: clip.title }), clipId: clip.id }
        : { kind: 'error', text: t('noSelection') };
    });

  const youtube = () =>
    run(async () => {
      const clip = await send('youtube/saveTranscript', { tabId: tab.id, projectId });
      return clip
        ? { kind: 'ok', text: t('saved', { title: clip.title }), clipId: clip.id }
        : { kind: 'error', text: t('noTranscript') };
    });

  // Reuse the clip of this page if the project already has one; saving again would create a duplicate each time.
  const exportPage = (format: ExportFormat) =>
    run(async () => {
      const existing = findClipForUrl(await send('clip/list', { projectId }), tab.url);
      const clip = existing ?? (await send('clip/savePage', { tabId: tab.id, projectId }));
      await runExport({ kind: 'clip', id: clip.id }, format);
      return { kind: 'ok', text: t('exported', { title: clip.title }), clipId: clip.id };
    });

  const openCrawler = async () => {
    if (tab.id == null) return;
    await browser.tabs.create({ url: browser.runtime.getURL(crawlerPath(tab.id) as '/crawler.html') });
    window.close();
  };

  const openSidebar = () => {
    // Both must be called synchronously inside the click handler (user gesture).
    const api = browser as unknown as {
      sidebarAction?: { open(): Promise<void> }; // Firefox
      sidePanel?: { open(o: { windowId: number }): Promise<void> }; // Chrome 116+
    };
    if (api.sidebarAction) api.sidebarAction.open().then(() => window.close(), fail);
    else if (api.sidePanel && tab.windowId != null) api.sidePanel.open({ windowId: tab.windowId }).then(() => window.close(), fail);
  };

  const openLib = (clip?: string) => {
    openLibrary({ project: projectId, clip }).then(() => window.close(), fail);
  };

  const openSettings = () => {
    browser.runtime.openOptionsPage().then(() => window.close(), fail);
  };

  const exportItems: MenuItem[] = [
    { label: ut('exportMd'), hint: ut('exportMdHint'), icon: 'file', onSelect: () => void exportPage('md') },
    { label: ut('exportZip'), hint: ut('exportZipHint'), icon: 'layers', onSelect: () => void exportPage('md-zip') },
    { label: ut('exportPdf'), hint: ut('exportPdfHint'), icon: 'book', onSelect: () => void exportPage('pdf') },
  ];

  return (
    <div class="pop">
      <header class="pop-head">
        <span class="logo" aria-hidden="true"><Icon name="note" size={16} /></span>
        <strong class="grow">TakeNotes</strong>
        <IconButton icon="library" title={t('openLibrary')} onClick={() => openLib()} />
        <IconButton icon="sidebar" title={t('sidebar')} onClick={openSidebar} />
        <IconButton icon="settings" title={t('settings')} onClick={openSettings} />
        <button type="button" role="switch" aria-checked={access.enabled} title={st('enabled')} aria-label={st('enabled')}
          class={`pop-switch ${access.enabled ? 'on' : ''}`} onClick={toggleEnabled}>
          <span class="knob" />
        </button>
      </header>

      <div class="pop-body">
        {inactive && (
          <div class="pop-off" role="status">
            <Icon name={access.enabled ? 'ban' : 'power'} size={14} />
            <span class="grow">{access.enabled ? st('blockedNotice', { site: site! }) : st('offNotice')}</span>
            <button type="button" class="btn sm primary" onClick={access.enabled ? toggleSite : toggleEnabled}>{st('turnOn')}</button>
          </div>
        )}

        <div>
          <span class="label">{t('saveTo')}</span>
          <ProjectPicker
            projects={projects} value={projectId} onChange={chooseProject}
            onCreated={() => void loadProjects().catch(fail)}
          />
        </div>

        <div class="stack">
          <button type="button" class="btn primary lg block" disabled={busy || inactive} onClick={savePage}>
            <Icon name="globe" size={16} />{t('savePage')}
          </button>
          <button type="button" class="btn block between" disabled={busy || inactive} onClick={saveSelection}>
            <span class="row"><Icon name="scissors" size={14} />{t('saveSelection')}</span>
            <kbd class="kbd">Alt+Shift+S</kbd>
          </button>
          {isYoutubeWatchUrl(tab.url) && (
            <button type="button" class="btn block" disabled={busy || inactive} onClick={youtube}>
              <Icon name="video" size={14} />{t('youtube')}
            </button>
          )}
        </div>

        {status && (
          <div class={status.kind === 'error' ? 'error-box' : 'status small'} role="status">
            <span>{status.text}</span>
            {status.kind === 'ok' && status.clipId && (
              <> <a href="#" onClick={(e) => { e.preventDefault(); openLib(status.clipId); }}>{t('openClip')}</a></>
            )}
          </div>
        )}

        <button type="button" class="btn ghost block book" disabled={busy || inactive || tab.id == null} onClick={openCrawler}>
          <Icon name="book" size={16} />
          <span class="grow">
            <span class="line">{t('crawl')}</span>
            <span class="muted small line">{t('crawlHint')}</span>
          </span>
        </button>
      </div>

      <footer class="pop-foot">
        <Menu placement="up" align="left" items={exportItems}
          trigger={(toggle) => (
            <button type="button" class="btn ghost" disabled={busy || inactive} onClick={toggle}>
              <Icon name="download" size={14} />{t('exportPage')}<Icon name="chevronDown" size={14} />
            </button>
          )} />
        {site && access.enabled && (
          <button type="button" class="btn ghost sm" title={site} onClick={toggleSite}>
            <Icon name={blocked ? 'check' : 'ban'} size={14} />{blocked ? st('unblockSite') : st('blockSite')}
          </button>
        )}
      </footer>
    </div>
  );
}

render(<UiProvider><App /></UiProvider>, document.getElementById('app')!);
