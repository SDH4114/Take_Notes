import { describe, expect, it } from 'vitest';
import { captionTracks, formatTimestamp, parseJson3, parsePlayerResponse, parseTimestamp, pickTrack, segmentsFromPanel, segmentsToMarkdown } from '@/src/youtube/transcript';

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
});
