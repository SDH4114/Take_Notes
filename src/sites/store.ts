// Site access lives in browser.storage.local (not IndexedDB): content scripts can read it directly
// and get live updates through storage.onChanged, so toggling applies to open tabs at once.
import { browser } from 'wxt/browser';
import { DEFAULT_SITE_ACCESS, normalizeSite, type SiteAccess } from './rules';

export const SITE_ACCESS_KEY = 'tn-site-access';

function parse(raw: unknown): SiteAccess {
  const v = (raw ?? {}) as Partial<SiteAccess>;
  const sites = Array.isArray(v.blockedSites) ? v.blockedSites : [];
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_SITE_ACCESS.enabled,
    blockedSites: [...new Set(sites.map((s) => (typeof s === 'string' ? normalizeSite(s) : null)).filter((s): s is string => !!s))],
  };
}

export async function getSiteAccess(): Promise<SiteAccess> {
  const got = await browser.storage.local.get(SITE_ACCESS_KEY);
  return parse(got[SITE_ACCESS_KEY]);
}

export async function setSiteAccess(patch: Partial<SiteAccess>): Promise<SiteAccess> {
  const next = parse({ ...(await getSiteAccess()), ...patch });
  await browser.storage.local.set({ [SITE_ACCESS_KEY]: next });
  return next;
}

export async function resetSiteAccess(): Promise<void> {
  await browser.storage.local.remove(SITE_ACCESS_KEY);
}

/** Subscribe to changes made from any extension context. Returns an unsubscribe function. */
export function onSiteAccessChanged(cb: (access: SiteAccess) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && SITE_ACCESS_KEY in changes) cb(parse(changes[SITE_ACCESS_KEY]!.newValue));
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}
