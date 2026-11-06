// Offscreen document (Chrome): runs DOM operations for the service worker. Only the runtime API exists here.
import { browser } from 'wxt/browser';
import { OFFSCREEN_TARGET, runDomOp, type DomOp } from '@/src/core/dom';

browser.runtime.onMessage.addListener((msg: unknown, sender, sendResponse: (r: unknown) => void) => {
  const m = msg as { target?: string; op?: DomOp; payload?: unknown };
  if (m?.target !== OFFSCREEN_TARGET || !m.op) return undefined;
  // Only our own extension talks to this page.
  if (sender.id !== browser.runtime.id) return undefined;
  runDomOp(m.op, m.payload as never)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true;
});
