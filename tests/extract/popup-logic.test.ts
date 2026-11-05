import { describe, expect, it } from 'vitest';
import { crawlerPath, isYoutubeWatchUrl } from '@/entrypoints/popup/logic';

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
