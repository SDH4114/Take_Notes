import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addSite, isActiveOn, isBlocked, normalizeSite, siteOf, unblockUrl } from '@/src/sites/rules';
import { getSiteAccess, setSiteAccess, resetSiteAccess } from '@/src/sites/store';
import { gateHandlers, watchSiteActive } from '@/src/sites/content';

describe('site rules', () => {
  it('normalizes user input to a bare host', () => {
    expect(normalizeSite('https://www.Example.com/a/b?c=1')).toBe('example.com');
    expect(normalizeSite('  docs.rs ')).toBe('docs.rs');
    expect(normalizeSite('*.metanit.com')).toBe('metanit.com');
    expect(normalizeSite('example.com/path')).toBe('example.com');
    expect(normalizeSite('localhost:3000')).toBe('localhost');
    expect(normalizeSite('')).toBeNull();
    expect(normalizeSite('not a site')).toBeNull();
    expect(normalizeSite('about:config')).toBeNull();
  });

  it('siteOf ignores non-web URLs', () => {
    expect(siteOf('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(siteOf('about:blank')).toBeNull();
    expect(siteOf('moz-extension://x/popup.html')).toBeNull();
    expect(siteOf(undefined)).toBeNull();
  });

  it('blocks a site and its subdomains, not look-alikes', () => {
    const list = ['example.com'];
    expect(isBlocked('https://example.com/x', list)).toBe(true);
    expect(isBlocked('https://www.example.com/', list)).toBe(true);
    expect(isBlocked('https://docs.example.com/', list)).toBe(true);
    expect(isBlocked('https://notexample.com/', list)).toBe(false);
    expect(isBlocked('https://example.com.evil.io/', list)).toBe(false);
    expect(isBlocked('about:blank', list)).toBe(false);
  });

  it('global switch overrides the list', () => {
    expect(isActiveOn('https://a.com', { enabled: true, blockedSites: [] })).toBe(true);
    expect(isActiveOn('https://a.com', { enabled: false, blockedSites: [] })).toBe(false);
    expect(isActiveOn('https://a.com', { enabled: true, blockedSites: ['a.com'] })).toBe(false);
  });

  it('addSite dedupes and sorts; unblockUrl removes parent entries too', () => {
    expect(addSite(['b.com'], 'https://www.a.com/x')).toEqual(['a.com', 'b.com']);
    expect(addSite(['a.com'], 'a.com')).toEqual(['a.com']);
    expect(addSite(['a.com'], '???')).toEqual(['a.com']);
    expect(unblockUrl(['a.com', 'docs.a.com', 'b.com'], 'https://docs.a.com/p')).toEqual(['b.com']);
  });
});

describe('site access store and gate', () => {
  beforeEach(() => fakeBrowser.reset());

  it('defaults to enabled with an empty list and sanitizes stored data', async () => {
    expect(await getSiteAccess()).toEqual({ enabled: true, blockedSites: [] });
    await fakeBrowser.storage.local.set({ 'tn-site-access': { enabled: 'yes', blockedSites: ['WWW.A.com', 5, 'a.com', 'bad host'] } });
    expect(await getSiteAccess()).toEqual({ enabled: true, blockedSites: ['a.com'] });
    await setSiteAccess({ enabled: false });
    expect((await getSiteAccess()).enabled).toBe(false);
    await resetSiteAccess();
    expect(await getSiteAccess()).toEqual({ enabled: true, blockedSites: [] });
  });

  it('gated handlers refuse to run on a blocked page', async () => {
    const h = vi.fn(async () => 'ok');
    const gated = gateHandlers<{ 'content/x': [void, string] }>({ 'content/x': h }, () => 'https://docs.a.com/');
    const call = () => gated['content/x']!(undefined, {} as never);
    expect(await call()).toBe('ok');
    await setSiteAccess({ blockedSites: ['a.com'] });
    await expect(call()).rejects.toThrow();
    await setSiteAccess({ blockedSites: [], enabled: false });
    await expect(call()).rejects.toThrow();
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('watchSiteActive reports the initial state and live flips only', async () => {
    const seen: boolean[] = [];
    const stop = watchSiteActive((a) => seen.push(a), () => 'https://a.com/');
    await vi.waitFor(() => expect(seen).toEqual([true]));
    await setSiteAccess({ blockedSites: ['b.com'] }); // unrelated site: no event
    await setSiteAccess({ blockedSites: ['a.com'] });
    await vi.waitFor(() => expect(seen).toEqual([true, false]));
    await setSiteAccess({ enabled: false });
    await setSiteAccess({ enabled: true, blockedSites: [] });
    await vi.waitFor(() => expect(seen).toEqual([true, false, true]));
    stop();
  });
});
