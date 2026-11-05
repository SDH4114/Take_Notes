import { normalizeUrl } from '@/src/core/util';
import type { Clip } from '@/src/core/types';

export function isYoutubeWatchUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /^(www\.|m\.)?youtube\.com$/.test(u.hostname) && u.pathname === '/watch';
  } catch {
    return false;
  }
}

/** Path of the crawler page for a tab; prefix with browser.runtime.getURL(). */
export function crawlerPath(tabId: number): string {
  return `/crawler.html?tab=${tabId}`;
}

/** Existing page clip for the URL (so exporting a page does not create a duplicate clip each time). */
export function findClipForUrl(clips: readonly Clip[], url: string | undefined): Clip | undefined {
  if (!url) return undefined;
  const target = normalizeUrl(url);
  return clips.find((c) => c.kind === 'page' && normalizeUrl(c.source.url) === target);
}
