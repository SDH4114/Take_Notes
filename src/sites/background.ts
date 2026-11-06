// Background side of site access: hides our context-menu items where TakeNotes is off (Firefox menus.onShown).
import { browser } from 'wxt/browser';
import { isActiveOn } from './rules';
import { getSiteAccess } from './store';

interface MenusApi {
  onShown?: { addListener(cb: (info: { pageUrl?: string; frameUrl?: string }) => void): void };
  update(id: string, props: { visible: boolean }): Promise<void> | void;
  refresh?: () => Promise<void> | void;
}

/** Call once from entrypoints/background.ts with the ids of every page-facing menu item. */
export function setupSitesBackground(menuIds: readonly string[]): void {
  const menus = ((browser as unknown as { menus?: MenusApi }).menus ?? browser.contextMenus) as unknown as MenusApi | undefined;
  menus?.onShown?.addListener(async (info) => {
    try {
      const visible = isActiveOn(info.pageUrl ?? info.frameUrl, await getSiteAccess());
      await Promise.all(menuIds.map((id) => menus.update(id, { visible })));
      await menus.refresh?.();
    } catch (e) {
      // Clicks are still refused by the content script, so a failed update only means a visible no-op item.
      console.warn('[take-notes] updating menu visibility failed', e);
    }
  });
}
