// Guards for UI injected into web pages. A hostile page can dispatch synthetic events and read open shadow roots,
// so page-facing UI must ignore untrusted events and use closed shadow roots.
// Tests (jsdom) can't produce trusted events, so they switch the guard to relaxed mode via tests/setup.ts.
let relaxed = false;

/** Test-only: accept untrusted events and use open shadow roots. */
export function relaxDomGuardForTests(v = true): void {
  relaxed = v;
}

/** True for real user input; false for events dispatched by page scripts (el.click(), dispatchEvent). */
export const isTrustedEvent = (e: Event): boolean => relaxed || e.isTrusted;

export const shadowMode = (): ShadowRootMode => (relaxed ? 'open' : 'closed');
