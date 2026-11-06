// Content-script side of site access: gates every page feature.
import type { Handlers } from '@/src/core/messages';
import { DEFAULT_SITE_ACCESS, isActiveOn, type SiteAccess } from './rules';
import { getSiteAccess, onSiteAccessChanged } from './store';
import { t } from './strings';

const readAccess = () => getSiteAccess().catch((): SiteAccess => DEFAULT_SITE_ACCESS);

/** Calls `cb` with the current state and again whenever it flips. Returns an unsubscribe function. */
export function watchSiteActive(cb: (active: boolean) => void, href: () => string = () => location.href): () => void {
  let last: boolean | undefined;
  const emit = (a: SiteAccess) => {
    const active = isActiveOn(href(), a);
    if (active !== last) {
      last = active;
      cb(active);
    }
  };
  void readAccess().then(emit);
  return onSiteAccessChanged(emit);
}

/** Wrap content handlers so each one fails with a clear message when TakeNotes is off for this page. */
export function gateHandlers<M>(handlers: Handlers<M>, href: () => string = () => location.href): Handlers<M> {
  const out: Record<string, unknown> = {};
  for (const [type, h] of Object.entries(handlers) as Array<[string, (p: unknown, s: unknown) => unknown]>) {
    out[type] = async (payload: unknown, sender: unknown) => {
      const access = await readAccess();
      if (!isActiveOn(href(), access)) throw new Error(t(access.enabled ? 'disabledHere' : 'disabledGlobal'));
      return h(payload, sender);
    };
  }
  return out as Handlers<M>;
}
