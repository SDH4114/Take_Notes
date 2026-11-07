// Content-script part of the youtube module.
import type { ContentMessages, Handlers } from '@/src/core/messages';
import type { ExtractResult } from '@/src/core/types';
import { nowIso } from '@/src/core/util';
import { translator, uiLang } from '@/src/core/i18n';
import { strings } from './strings';
import {
  PANEL_CLOSE_SELECTORS, captionTracks, cleanVideoUrl, findTrack, findTranscriptButton, listTracks, matchLanguage, panelLanguages,
  parseJson3, parsePlayerResponse, pickTrack, segmentsFromPanel, segmentsToMarkdown, transcriptPanel,
  type CaptionTrack, type Segment, type TrackInfo,
} from './transcript';

const t = translator(strings);

interface PlayerMeta { title?: string; author?: string; published?: string }

async function loadPlayer(): Promise<{ tracks: CaptionTrack[]; meta: PlayerMeta }> {
  // Re-fetch the watch page: ytInitialPlayerResponse in the live DOM is stale after SPA navigation.
  // Best-effort: without it there's no language list, but the transcript panel can still be read.
  let html = '';
  try { html = await (await fetch(location.href, { credentials: 'include' })).text(); } catch { /* offline / blocked */ }
  const player = parsePlayerResponse(html) as { videoDetails?: { title?: string; author?: string }; microformat?: { playerMicroformatRenderer?: { publishDate?: string } } } | null;
  const meta = { title: player?.videoDetails?.title, author: player?.videoDetails?.author, published: player?.microformat?.playerMicroformatRenderer?.publishDate };
  return { tracks: captionTracks(player), meta };
}

const PANEL_TIMEOUT_MS = 5000;

/** Poll until `get()` returns something (YouTube renders the panel asynchronously). */
async function waitFor<T>(get: () => T | null | undefined, ms: number): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > end) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const firstTexts = (root: ParentNode) => segmentsFromPanel(root).slice(0, 5).map((s) => s.text).join('\n');

/**
 * Read captions from YouTube's own transcript panel: open it via "Show transcript" if needed, switch it to the
 * picked track's language when the panel offers a choice, read, then close it again if we opened it.
 * `langOk` = the segments are known to be in the picked language.
 */
async function readPanel(track: CaptionTrack | undefined, trackCount: number): Promise<{ segments: Segment[]; langOk: boolean }> {
  let panel = transcriptPanel(document);
  let opened = false;
  if (!panel) {
    const button = findTranscriptButton(document);
    if (!button) return { segments: [], langOk: false };
    button.click();
    opened = true;
    panel = await waitFor(() => transcriptPanel(document), PANEL_TIMEOUT_MS);
    if (!panel) return { segments: [], langOk: false };
  }
  try {
    let langOk = !track || trackCount <= 1;
    const langs = track ? panelLanguages(panel) : [];
    const i = track ? matchLanguage(langs.map((l) => l.label), track) : -1;
    if (i >= 0) {
      if (langs[i]!.selected) langOk = true;
      else {
        const before = firstTexts(panel);
        langs[i]!.el.click();
        // The segment list re-renders in place for the new language.
        const switched = await waitFor(() => {
          const p = transcriptPanel(document);
          return p && firstTexts(p) && firstTexts(p) !== before ? p : null;
        }, PANEL_TIMEOUT_MS);
        if (switched) { panel = switched; langOk = true; }
      }
    }
    return { segments: segmentsFromPanel(panel), langOk };
  } finally {
    if (opened) {
      for (const sel of PANEL_CLOSE_SELECTORS) {
        const close = panel.querySelector<HTMLElement>(sel);
        if (close) { close.click(); break; }
      }
    }
  }
}

async function fetchSegments(choice?: { languageCode: string; kind?: string }): Promise<{ segments: Segment[]; lang?: string } & PlayerMeta> {
  const { tracks, meta } = await loadPlayer();
  const track = choice ? findTrack(tracks, choice) : pickTrack(tracks, [uiLang(), document.documentElement.lang || 'en', 'en']);
  if (track) {
    // Usually empty now: caption URLs carry `exp=xpe` and YouTube answers 200 with no body unless the player
    // adds its own PO token. Kept because it's one cheap request and still works where the token isn't enforced.
    try {
      const url = new URL(track.baseUrl, location.href);
      url.searchParams.set('fmt', 'json3');
      const res = await fetch(url, { credentials: 'include' });
      const body = await res.text();
      if (res.ok && body.trim()) {
        const segments = parseJson3(JSON.parse(body));
        if (segments.length) return { segments, lang: track.languageCode, ...meta };
      }
    } catch { /* fall through to the panel */ }
  }
  const { segments, langOk } = await readPanel(track, new Set(tracks.map((t) => `${t.languageCode}|${t.kind ?? ''}`)).size);
  return { segments, lang: langOk && track ? track.languageCode : undefined, ...meta };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function setupYoutubeContent(): Handlers<ContentMessages> {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return {};
  return {
    'content/youtubeTracks': async (): Promise<TrackInfo[]> => {
      if (location.pathname !== '/watch') throw new Error(t('notVideo'));
      return listTracks((await loadPlayer()).tracks, uiLang(), t('auto'));
    },
    'content/youtubeTranscript': async (choice): Promise<ExtractResult | null> => {
      if (location.pathname !== '/watch') throw new Error(t('notVideo'));
      const { segments, title, author, published, lang } = await fetchSegments(choice?.languageCode ? { languageCode: choice.languageCode, kind: choice.kind } : undefined);
      if (!segments.length) throw new Error(t('noCaptions'));
      const pageTitle = title ?? document.title.replace(/ - YouTube$/, '');
      const videoUrl = cleanVideoUrl(location.href);
      const body = segmentsToMarkdown(segments, videoUrl);
      const markdown = `${t('video')}: [${pageTitle.replace(/[[\]]/g, '\\$&')}](${videoUrl})\n\n${body}`;
      const html = `<p>${esc(t('video'))}: <a href="${esc(videoUrl)}">${esc(pageTitle)}</a></p>`
        + body.split('\n\n').map((p) => `<p>${esc(p.replace(/^\[([^\]]+)\]\([^)]+\) /, '[$1] '))}</p>`).join('');
      return {
        title: `${pageTitle} — ${t('transcript')}`,
        html,
        markdown,
        imageUrls: [],
        source: { url: videoUrl, title: pageTitle, authors: author ? [author] : [], siteName: 'YouTube', published, accessed: nowIso(), lang: lang || document.documentElement.lang || undefined },
      };
    },
  };
}
