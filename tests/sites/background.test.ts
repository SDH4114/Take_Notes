import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { resetSiteAccess, setSiteAccess } from '@/src/sites/store';
import { setupSitesBackground } from '@/src/sites/background';

type Shown = (info: { pageUrl?: string; frameUrl?: string }) => Promise<void>;

function installMenus(opts: { failUpdate?: boolean } = {}) {
  let shown: Shown | undefined;
  const update = vi.fn(async (_id: string, _p: { visible: boolean }) => { if (opts.failUpdate) throw new Error('boom'); });
  const refresh = vi.fn(async () => {});
  (browser as unknown as { menus: unknown }).menus = { onShown: { addListener: (cb: Shown) => { shown = cb; } }, update, refresh };
  return { update, refresh, fire: (info: { pageUrl?: string; frameUrl?: string }) => shown!(info) };
}

describe('setupSitesBackground', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await resetSiteAccess();
  });

  it('hides every given menu id on a blocked page and refreshes', async () => {
    await setSiteAccess({ enabled: true, blockedSites: ['example.com'] });
    const m = installMenus();
    setupSitesBackground(['a', 'b']);
    await m.fire({ pageUrl: 'https://docs.example.com/x' });
    expect(m.update.mock.calls).toEqual([['a', { visible: false }], ['b', { visible: false }]]);
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the menus on an allowed page and falls back to frameUrl', async () => {
    await setSiteAccess({ enabled: true, blockedSites: ['example.com'] });
    const m = installMenus();
    setupSitesBackground(['a']);
    await m.fire({ pageUrl: 'https://other.org/' });
    expect(m.update).toHaveBeenLastCalledWith('a', { visible: true });
    await m.fire({ frameUrl: 'https://example.com/' });
    expect(m.update).toHaveBeenLastCalledWith('a', { visible: false });
  });

  it('hides everywhere when the global switch is off', async () => {
    await setSiteAccess({ enabled: false, blockedSites: [] });
    const m = installMenus();
    setupSitesBackground(['a']);
    await m.fire({ pageUrl: 'https://other.org/' });
    expect(m.update).toHaveBeenCalledWith('a', { visible: false });
  });

  it('swallows update failures (warns instead of throwing)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = installMenus({ failUpdate: true });
    setupSitesBackground(['a']);
    await expect(m.fire({ pageUrl: 'https://x.org/' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(m.refresh).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
