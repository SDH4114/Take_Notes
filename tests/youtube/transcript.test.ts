import { describe, expect, it } from 'vitest';
import { captionTracks, cleanVideoUrl, findTrack, formatTimestamp, listTracks, preferLanguage, parseJson3, parsePlayerResponse, parseTimestamp, pickTrack, segmentsFromPanel, segmentsToMarkdown, findTranscriptButton, panelLanguages, matchLanguage } from '@/src/youtube/transcript';

const player = {
  videoDetails: { title: 'Rust за 10 минут', author: 'Канал' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [
    { baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr', languageCode: 'en', kind: 'asr' },
    { baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=ru', languageCode: 'ru', name: { simpleText: 'Русский' } },
  ] } },
};

describe('youtube transcript', () => {
  it('parses ytInitialPlayerResponse with braces inside strings', () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify({ ...player, x: 'a } { "b' })};var meta = {};</script>`;
    expect(parsePlayerResponse(html)).toMatchObject({ videoDetails: { title: 'Rust за 10 минут' } });
  });
  it('returns null when absent', () => expect(parsePlayerResponse('<html></html>')).toBeNull());
  it('prefers manual track in preferred language', () => {
    const tr = captionTracks(player);
    expect(tr[1]?.name).toBe('Русский');
    expect(pickTrack(tr, ['ru'])?.languageCode).toBe('ru');
    expect(pickTrack(tr, ['de'])?.languageCode).toBe('ru'); // any manual before asr
    expect(pickTrack([tr[0]!], ['de'])?.kind).toBe('asr');
  });
  it('parses json3 events', () => {
    expect(parseJson3({ events: [{ tStartMs: 0 }, { tStartMs: 1500, segs: [{ utf8: 'Привет,' }, { utf8: '\nмир' }] }] }))
      .toEqual([{ start: 1.5, text: 'Привет, мир' }]);
  });
  it('timestamps round-trip', () => {
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp('12:34')).toBe(754);
    expect(formatTimestamp(3723)).toBe('1:02:03');
    expect(formatTimestamp(65)).toBe('1:05');
  });
  it('groups into paragraphs with links', () => {
    const md = segmentsToMarkdown([{ start: 0, text: 'a' }, { start: 30, text: 'b' }, { start: 61, text: 'c' }], 'https://www.youtube.com/watch?v=abc', 60);
    expect(md).toBe('[0:00](https://www.youtube.com/watch?v=abc&t=0s) a b\n\n[1:01](https://www.youtube.com/watch?v=abc&t=61s) c');
  });
  it('reads transcript panel DOM', () => {
    document.body.innerHTML = `<ytd-transcript-segment-renderer><div class="segment-timestamp"> 0:05 </div><yt-formatted-string class="segment-text">Hello  there</yt-formatted-string></ytd-transcript-segment-renderer>`;
    expect(segmentsFromPanel(document)).toEqual([{ start: 5, text: 'Hello there' }]);
  });
  it('reads the new transcript-segment-view-model layout', () => {
    document.body.innerHTML = `<ytd-engagement-panel-section-list-renderer>
      <transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">1:02</div>
        <div class="a11y">1 minute, 2 seconds</div><span role="text">Новый  текст</span></transcript-segment-view-model>
    </ytd-engagement-panel-section-list-renderer>`;
    expect(segmentsFromPanel(document)).toEqual([{ start: 62, text: 'Новый текст' }]);
  });
  it('reads only one panel when YouTube mirrors the transcript into several', () => {
    const panel = `<ytd-engagement-panel-section-list-renderer><ytd-transcript-segment-renderer><div class="segment-timestamp">0:01</div><div class="segment-text">x</div></ytd-transcript-segment-renderer></ytd-engagement-panel-section-list-renderer>`;
    document.body.innerHTML = panel + panel;
    expect(segmentsFromPanel(document)).toEqual([{ start: 1, text: 'x' }]);
  });
  it('returns no segments when no panel is rendered', () => {
    document.body.innerHTML = '<div>nothing</div>';
    expect(segmentsFromPanel(document)).toEqual([]);
  });
  it('finds the "Show transcript" button structurally (any UI language)', () => {
    document.body.innerHTML = `<ytd-video-description-transcript-section-renderer><button aria-label="Показать текст видео">x</button></ytd-video-description-transcript-section-renderer>`;
    expect(findTranscriptButton(document)?.getAttribute('aria-label')).toBe('Показать текст видео');
    document.body.innerHTML = '<button aria-label="Show transcript">x</button>';
    expect(findTranscriptButton(document)).not.toBeNull();
    document.body.innerHTML = '<button>other</button>';
    expect(findTranscriptButton(document)).toBeNull();
  });
  it('lists the language menu of the transcript panel', () => {
    document.body.innerHTML = `<ytd-engagement-panel-section-list-renderer><ytd-transcript-footer-renderer><yt-sort-filter-sub-menu-renderer>
      <tp-yt-paper-listbox><a><tp-yt-paper-item class="iron-selected" aria-selected="true"> English (auto-generated) </tp-yt-paper-item></a>
      <a><tp-yt-paper-item aria-selected="false">Russian</tp-yt-paper-item></a></tp-yt-paper-listbox>
    </yt-sort-filter-sub-menu-renderer></ytd-transcript-footer-renderer></ytd-engagement-panel-section-list-renderer>`;
    const items = panelLanguages(document.querySelector('ytd-engagement-panel-section-list-renderer')!);
    expect(items.map((i) => [i.label, i.selected])).toEqual([['English (auto-generated)', true], ['Russian', false]]);
    document.body.innerHTML = '<ytd-engagement-panel-section-list-renderer></ytd-engagement-panel-section-list-renderer>';
    expect(panelLanguages(document.body)).toEqual([]);
  });
  it('matches the picked track to a panel language by its YouTube name', () => {
    const labels = ['English (auto-generated)', 'Russian'];
    expect(matchLanguage(labels, { languageCode: 'ru', name: 'Russian' })).toBe(1);
    expect(matchLanguage(labels, { languageCode: 'en', kind: 'asr', name: 'english (auto-generated)' })).toBe(0);
    expect(matchLanguage(labels, { languageCode: 'de', name: 'German' })).toBe(-1);
    expect(matchLanguage(labels, { languageCode: 'ru' })).toBe(-1);
    expect(matchLanguage([], { languageCode: 'ru', name: 'Russian' })).toBe(-1);
  });

  it('lists tracks for the picker: manual first, one per language+kind', () => {
    const tr = [
      ...captionTracks(player),
      { baseUrl: 'u', languageCode: 'ru', name: 'Русский (дубль)' },
      { baseUrl: 'u2', languageCode: 'ru', kind: 'asr' },
    ];
    const list = listTracks(tr, 'en', 'auto');
    expect(list.map((x) => [x.languageCode, x.kind ?? ''])).toEqual([['ru', ''], ['en', 'asr'], ['ru', 'asr']]);
    expect(list[0]!.label).toBe('Russian');
    expect(list[1]!.label).toBe('English (auto)');
    expect(listTracks([], 'en')).toEqual([]);
  });
  it('falls back to the code for unknown languages', () => {
    expect(listTracks([{ baseUrl: 'u', languageCode: 'not a code!' }], 'en')[0]!.label).toBe('not a code!');
  });
  it('finds the picked track by language and kind', () => {
    const tr = [...captionTracks(player), { baseUrl: 'manual-en', languageCode: 'en' }];
    expect(findTrack(tr, { languageCode: 'en' })?.baseUrl).toBe('manual-en');
    expect(findTrack(tr, { languageCode: 'en', kind: 'asr' })?.kind).toBe('asr');
    expect(findTrack(tr, { languageCode: 'de' })).toBeUndefined();
  });
  it('puts the last used language first', () => {
    const list = [{ languageCode: 'en', label: 'E' }, { languageCode: 'ru', label: 'R' }, { languageCode: 'ru', kind: 'asr', label: 'Ra' }];
    expect(preferLanguage(list, 'ru').map((x) => x.label)).toEqual(['R', 'Ra', 'E']);
    expect(preferLanguage(list, 'de')).toBe(list);
    expect(preferLanguage(list, null)).toBe(list);
  });
  it('cleans the video URL', () => {
    expect(cleanVideoUrl('https://www.youtube.com/watch?v=abc&list=PL1&t=42s&si=x')).toBe('https://www.youtube.com/watch?v=abc');
    expect(cleanVideoUrl('https://www.youtube.com/feed')).toBe('https://www.youtube.com/feed');
    expect(cleanVideoUrl('not a url')).toBe('not a url');
  });
});
