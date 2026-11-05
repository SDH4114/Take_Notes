// Content-script part of the youtube module.
import type { ContentMessages, Handlers } from '@/src/core/messages';
import type { ExtractResult } from '@/src/core/types';
import { nowIso } from '@/src/core/util';
import { translator, uiLang } from '@/src/core/i18n';
import { strings } from './strings';
import { captionTracks, parseJson3, parsePlayerResponse, pickTrack, segmentsFromPanel, segmentsToMarkdown, type Segment } from './transcript';

const t = translator(strings);

async function fetchSegments(): Promise<{ segments: Segment[]; title?: string; author?: string; published?: string }> {
  // Re-fetch the watch page: ytInitialPlayerResponse in the live DOM is stale after SPA navigation.
  const html = await (await fetch(location.href, { credentials: 'include' })).text();
  const player = parsePlayerResponse(html) as { videoDetails?: { title?: string; author?: string }; microformat?: { playerMicroformatRenderer?: { publishDate?: string } } } | null;
  const meta = { title: player?.videoDetails?.title, author: player?.videoDetails?.author, published: player?.microformat?.playerMicroformatRenderer?.publishDate };
  const track = pickTrack(captionTracks(player), [uiLang(), document.documentElement.lang || 'en', 'en']);
  if (track) {
    try {
      const url = new URL(track.baseUrl, location.href);
      url.searchParams.set('fmt', 'json3');
      const res = await fetch(url, { credentials: 'include' });
      const body = await res.text();
      if (res.ok && body.trim()) {
        const segments = parseJson3(JSON.parse(body));
        if (segments.length) return { segments, ...meta };
      }
    } catch { /* fall through to panel */ }
  }
  return { segments: segmentsFromPanel(document), ...meta };
}

export function setupYoutubeContent(): Handlers<ContentMessages> {
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return {};
  return {
    'content/youtubeTranscript': async (): Promise<ExtractResult | null> => {
      if (location.pathname !== '/watch') throw new Error(t('notVideo'));
      const { segments, title, author, published } = await fetchSegments();
      if (!segments.length) throw new Error(t('noCaptions'));
      const pageTitle = title ?? document.title.replace(/ - YouTube$/, '');
      const markdown = segmentsToMarkdown(segments, location.href);
      const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      const html = markdown.split('\n\n').map((p) => `<p>${esc(p.replace(/^\[([^\]]+)\]\([^)]+\) /, '[$1] '))}</p>`).join('');
      return {
        title: `${pageTitle} — ${t('transcript')}`,
        html,
        markdown,
        imageUrls: [],
        source: { url: location.href, title: pageTitle, authors: author ? [author] : [], siteName: 'YouTube', published, accessed: nowIso(), lang: document.documentElement.lang || undefined },
      };
    },
  };
}
