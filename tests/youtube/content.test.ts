import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupYoutubeContent } from '@/src/youtube/content';

const player = {
  videoDetails: { title: 'Video', author: 'Chan' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [
    { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&exp=xpe&lang=en', languageCode: 'en', kind: 'asr', name: { simpleText: 'English (auto-generated)' } },
    { baseUrl: 'https://www.youtube.com/api/timedtext?v=abc&exp=xpe&lang=ru', languageCode: 'ru', name: { simpleText: 'Russian' } },
  ] } },
};
const watchHtml = `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`;

const seg = (ts: string, text: string) =>
  `<transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">${ts}</div><span role="text">${text}</span></transcript-segment-view-model>`;
const footer = (sel: 'en' | 'ru') => `<ytd-transcript-footer-renderer><yt-sort-filter-sub-menu-renderer>
  <tp-yt-paper-item id="l-en" aria-selected="${sel === 'en'}">English (auto-generated)</tp-yt-paper-item>
  <tp-yt-paper-item id="l-ru" aria-selected="${sel === 'ru'}">Russian</tp-yt-paper-item></yt-sort-filter-sub-menu-renderer></ytd-transcript-footer-renderer>`;

/** Fake YouTube: "Show transcript" renders the panel (English first) a bit later; the language menu re-renders it. */
function fakePage() {
  document.body.innerHTML = `<ytd-video-description-transcript-section-renderer><button id="show">Show transcript</button></ytd-video-description-transcript-section-renderer>
    <ytd-engagement-panel-section-list-renderer id="panel"></ytd-engagement-panel-section-list-renderer>`;
  const panel = document.getElementById('panel')!;
  const render = (lang: 'en' | 'ru') => {
    panel.innerHTML = `<div id="visibility-button"><button id="close">x</button></div>`
      + (lang === 'en' ? seg('0:01', 'Hello') : seg('0:01', 'Привет')) + footer(lang);
    panel.querySelector('#l-ru')!.addEventListener('click', () => setTimeout(() => render('ru'), 30));
    panel.querySelector('#close')!.addEventListener('click', () => { panel.innerHTML = ''; });
  };
  document.getElementById('show')!.addEventListener('click', () => setTimeout(() => render('en'), 30));
  return panel;
}

describe('youtube content: transcript', () => {
  beforeEach(() => {
    vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=abc'));
    // Watch page re-fetch works; timedtext answers 200 with an empty body (no PO token), as YouTube does now.
    vi.stubGlobal('fetch', vi.fn(async (u: string | URL) => new Response(String(u).includes('/api/timedtext') ? '' : watchHtml)));
  });
  afterEach(() => vi.unstubAllGlobals());

  const handlers = () => setupYoutubeContent();

  it('lists the tracks for the picker', async () => {
    const list = await handlers()['content/youtubeTracks']!(undefined as never, {} as never);
    expect(list.map((t) => t.languageCode)).toEqual(['ru', 'en']);
  });

  it('falls back to the transcript panel in the picked language when timedtext is empty', async () => {
    const panel = fakePage();
    const r = await handlers()['content/youtubeTranscript']!({ languageCode: 'ru' }, {} as never);
    expect(r?.markdown).toContain('Привет');
    expect(r?.source.lang).toBe('ru');
    expect(panel.innerHTML).toBe(''); // we opened it → closed again
  });

  it('reads the panel without a choice and keeps a panel the user opened', async () => {
    const panel = fakePage();
    (document.getElementById('show') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 50));
    const r = await handlers()['content/youtubeTranscript']!({}, {} as never);
    expect(r?.markdown).toContain('Hello');
    expect(panel.innerHTML).not.toBe('');
  });

  it('throws a clear error when there is no transcript at all', async () => {
    document.body.innerHTML = '<div></div>';
    await expect(handlers()['content/youtubeTranscript']!({ languageCode: 'ru' }, {} as never)).rejects.toThrow(/captions|субтитры/);
  });
});
