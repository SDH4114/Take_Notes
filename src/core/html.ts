// HTML string → DOM without assigning innerHTML (AMO's linter flags every innerHTML/insertAdjacentHTML write).
// DOMParser documents are inert: no scripts run, no images load.

/**
 * Parse `html` into an inert <template>, the same way `template.innerHTML = html` would: whitespace, head-like tags
 * (<style>, <title>) and table parts stay in place. Read/serialize via `.content` / `.innerHTML` (getter).
 */
export function parseHtml(html: string): HTMLTemplateElement {
  // In "in body" mode, so content after a stray </template> lands in <body> instead of <head>.
  const doc = new DOMParser().parseFromString(`<!doctype html><body><template>${html}`, 'text/html');
  const tpl = doc.body.querySelector('template')!;
  // A stray </template> in the input closes ours early; keep what follows (template.innerHTML would ignore that tag).
  while (tpl.nextSibling) tpl.content.append(tpl.nextSibling);
  return tpl;
}

/** Replace the children of `el` with parsed `html`. Only for trusted or already sanitized markup. */
export function setHtml(el: Element, html: string): void {
  el.replaceChildren(el.ownerDocument.importNode(parseHtml(html).content, true));
}
