// Pure site rules: where TakeNotes is allowed to work on web pages.

export interface SiteAccess {
  /** Global switch: off = no page UI, no highlights restored, menus/hotkeys/popup actions blocked everywhere. */
  enabled: boolean;
  /** Hostnames without "www."; an entry also covers its subdomains ("example.com" → "docs.example.com"). */
  blockedSites: string[];
}

export const DEFAULT_SITE_ACCESS: SiteAccess = { enabled: true, blockedSites: [] };

const HOST_RE = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}$/;

const stripWww = (host: string) => host.replace(/^www\./, '');

/** Hostname of an http(s) URL without "www.", or null for other schemes / invalid input. */
export function siteOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return stripWww(u.hostname.toLowerCase().replace(/\.$/, '')) || null;
  } catch {
    return null;
  }
}

/** User input ("https://www.Example.com/path", "*.example.com", "example.com") → "example.com"; null if not a host. */
export function normalizeSite(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^\*\./, '');
  const host = siteOf(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `http://${s}`);
  return host && HOST_RE.test(host) ? host : null;
}

/** True when the URL's host is a blocked site or one of its subdomains. */
export function isBlocked(url: string | undefined, blockedSites: readonly string[]): boolean {
  const host = siteOf(url);
  if (!host) return false;
  return blockedSites.some((site) => host === site || host.endsWith(`.${site}`));
}

export function isActiveOn(url: string | undefined, access: SiteAccess): boolean {
  return access.enabled && !isBlocked(url, access.blockedSites);
}

/** Add a site (normalized, deduplicated, sorted). Returns the same list when the input is not a valid host. */
export function addSite(list: readonly string[], input: string): string[] {
  const site = normalizeSite(input);
  if (!site || list.includes(site)) return [...list];
  return [...list, site].sort();
}

/** Remove every entry that blocks this URL's host (the exact site and any parent domain entries). */
export function unblockUrl(list: readonly string[], url: string | undefined): string[] {
  const host = siteOf(url);
  if (!host) return [...list];
  return list.filter((site) => !(host === site || host.endsWith(`.${site}`)));
}
