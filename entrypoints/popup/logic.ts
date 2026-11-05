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
