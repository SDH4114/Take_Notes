import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';

vi.mock('@/src/core/messages', async (orig) => ({
  ...(await orig<typeof import('@/src/core/messages')>()),
  broadcast: vi.fn(),
}));

const { broadcast } = await import('@/src/core/messages');
const { openLibrary } = await import('@/src/ui/components');

const tab = (over: object) => ({ id: 5, windowId: 1, discarded: false, ...over }) as never;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(broadcast).mockClear();
  vi.spyOn(browser.windows, 'update').mockResolvedValue({} as never);
});

describe('openLibrary', () => {
  it('navigates an open Library tab by message and only activates it (no reload)', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([tab({})] as never);
    const update = vi.spyOn(browser.tabs, 'update').mockResolvedValue({} as never);
    await openLibrary({ project: 'p1', clip: 'c1' });
    expect(broadcast).toHaveBeenCalledWith('library/open', { tabId: 5, search: 'project=p1&clip=c1' });
    expect(update).toHaveBeenCalledWith(5, { active: true });
  });

  it('a discarded Library tab gets the URL instead', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([tab({ discarded: true })] as never);
    const update = vi.spyOn(browser.tabs, 'update').mockResolvedValue({} as never);
    await openLibrary({ clip: 'c1' });
    expect(broadcast).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(5, { active: true, url: expect.stringContaining('library.html?clip=c1') });
  });

  it('opens a new tab when none is open', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    await openLibrary({});
    expect(create).toHaveBeenCalledWith({ url: expect.stringMatching(/library\.html$/) });
  });
});
