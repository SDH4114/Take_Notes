import { describe, expect, it } from 'vitest';
import { crawlerPath, findClipForUrl, isYoutubeWatchUrl } from '@/entrypoints/popup/logic';
import type { Clip } from '@/src/core/types';

describe('findClipForUrl', () => {
  const clip = (id: string, url: string, kind: Clip['kind'] = 'page') => ({ id, kind, source: { url } }) as Clip;

  it('matches a page clip by normalized url (hash and tracking params ignored)', () => {
    const clips = [clip('a', 'https://x.test/other'), clip('b', 'https://x.test/p?utm_source=n#top')];
    expect(findClipForUrl(clips, 'https://x.test/p')?.id).toBe('b');
  });
  it('ignores selections and returns undefined when nothing matches', () => {
    expect(findClipForUrl([clip('a', 'https://x.test/p', 'selection')], 'https://x.test/p')).toBeUndefined();
    expect(findClipForUrl([], 'https://x.test/p')).toBeUndefined();
    expect(findClipForUrl([clip('a', 'https://x.test/p')], undefined)).toBeUndefined();
  });
});

describe('popup logic', () => {
  it('detects youtube watch pages only', () => {
    expect(isYoutubeWatchUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYoutubeWatchUrl('https://m.youtube.com/watch?v=abc')).toBe(true);
    expect(isYoutubeWatchUrl('https://youtube.com/watch?v=abc')).toBe(true);
    expect(isYoutubeWatchUrl('https://www.youtube.com/')).toBe(false);
    expect(isYoutubeWatchUrl('https://evil-youtube.com/watch?v=abc')).toBe(false);
    expect(isYoutubeWatchUrl('https://youtube.com.evil.test/watch?v=1')).toBe(false);
    expect(isYoutubeWatchUrl(undefined)).toBe(false);
    expect(isYoutubeWatchUrl('not a url')).toBe(false);
  });

  it('builds the crawler page path with the tab id', () => {
    expect(crawlerPath(12)).toBe('/crawler.html?tab=12');
  });
});
