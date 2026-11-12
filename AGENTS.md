# AGENTS.md — TakeNotes

## Purpose
Browser extension (Firefox + Chrome) for school and university students: turn web pages into study material — Markdown/PDF notes, projects (coursework) with a bibliography, highlights, Anki cards, and whole documentation sections saved as one book (e.g. metanit.com → Rust). Audience: CIS + international (RU/EN UI, GOST default, APA/MLA).

## What it does (target v0.1)
1. Save page / selection → Markdown (math as `$…$`, tables, code, images downloaded into zip).
2. Projects: ordered clips with sections, exported as one document.
3. Bibliography: GOST R 7.0.100-2018, APA 7, MLA 9; access date set automatically.
4. Highlights (colors + notes) restored on revisit; export highlights only.
5. Docs crawler: detect TOC (or user picks the menu), crawl same-origin + path-prefix slowly, assemble a book (MD / PDF / folder of .md).
6. Anki export (TSV), Obsidian frontmatter + `[[wikilinks]]`, YouTube transcript → .md (language picked in the popup).
7. Import own notes into the Library: folder / zip of .md (Obsidian vault, our project export) and PDF (text → Markdown, original kept).
AI features are deferred.

## Status
Prototype v0.9.3 (v0.9.3: bug-fix pass — highlights saved into a deleted project (options page wrote back a stale `defaultProjectId`), visible error when a highlight fails to save, clip write races, orphaned note highlights, chunked offscreen blob transfer; v0.9.2: `newId()` falls back to getRandomValues — `crypto.randomUUID` is missing in content scripts on http:// pages in Chrome, highlights failed there; v0.9.1: AMO lint clean — own code without innerHTML writes, vendor patches in `build/vendor-lint-patches.ts`; v0.9.0: import of own notes: .md folders/zips + PDF via pdf.js; YouTube caption language picker; v0.8.1: logo/icons; v0.8.0: Chrome support: offscreen DOM host, side panel, sendResponse messaging; bug-fix pass; v0.7: kanban cards as to-dos + done column, whole-project PDF zip via pdfmake; v0.6: folders in projects, highlight long notes, board export, whole-project exports only; v0.5: kanban: own cards create/delete; Library graph + kanban board, tags/[[wikilinks]], highlights inside notes and exports, whole-project folder export, highlight move/open-note, themes, add-on ID take-notes@amikolabs.com; v0.4: on/off + site blocklist); UI/UX redesign done — Library tab with Markdown editor, new popup/sidebar/options/crawler, jump-to-highlight.
559 unit tests, build + web-ext lint (0 errors, 0 warnings) clean. Tested by Haos in Zen (Firefox-based) at v0.1; v0.9 import and YouTube picker not yet run in a browser.
Known gaps: book chapters keep remote images in PDF; math in PDF is TeX text; `src/crawl/book.ts bookToMarkdown`
duplicates `src/export/document.ts bookToMarkdownExport` (only tests use it); Library loads full books to count chapters.

## Stack
TypeScript, WXT 0.21 (Vite), Manifest V3 for Firefox (background = event page with DOM) and Chrome 116+ (background = service worker, no DOM), Preact, IndexedDB via `idb`, `@mozilla/readability`, `turndown` + `turndown-plugin-gfm`, `dompurify`, `fflate`, `pdfjs-dist` 6 (PDF import, lazy). CodeMirror 6 (editor), `marked` (preview). `pdfmake` 0.3 + `html-to-pdfmake` 2.5 (whole-project PDF zip; browser builds, Roboto vfs). Tests: Vitest + jsdom (+ `fake-indexeddb`). npm.

## Structure
- `entrypoints/background.ts` — merges handler maps from every module's `setup*Background()`.
- `entrypoints/content.ts` — merges `setup*Content()` handlers; runs on `<all_urls>`.
- `entrypoints/{popup,sidepanel,options,crawler,print,library}/` — Preact pages (`sidepanel` → Firefox `sidebar_action`; `library` = full-tab workspace, opened via `openLibrary({project, clip, view})`).
- `src/library/` — Library app (App, Nav, Lists, ClipPane, Panes, GraphView, BoardView), `format.ts` (pure Markdown formatting commands), `logic.ts`, `graph.ts` (pure: wikilinks/tags parsing, graph build, force layout), `board.ts` (pure kanban moves).
- `src/highlight/apply.ts` — joins a page's highlights to its clip (by normalized URL): `<mark>` in HTML (Library preview, PDF), `==text==` in Markdown exports.
- `public/icon/` — logo: `logo.svg` (source) + `16/32/48/96/128.png` (WXT picks them up as manifest icons; toolbar/sidebar via `manifest.default_icon` meta in popup/sidepanel HTML). In-page copy = `Logo` in `src/ui/icons.tsx` — change both together; PNGs re-rendered from the SVG with `@resvg/resvg-js`.
- `src/ui/theme.ts` — `initTheme()` in every extension page; `data-theme` on `<html>` overrides `prefers-color-scheme` (base.css).
- `src/ui/` — shared kit: `base.css` (tokens + classes), `icons.tsx`, `components.tsx` (UiProvider toast/prompt/confirm, Menu, ProjectPicker, ExportMenu, openLibrary), `markdown.ts` (renderMarkdown: GFM + ==mark== + $math$, sanitized), `editor.tsx` (CodeMirror MarkdownEditor).
- `src/core/` — `types.ts` (data model), `messages.ts` (typed message contract + sender allowlist), `storage.ts` (IndexedDB), `i18n.ts`, `util.ts`, `dom-guard.ts` (isTrusted / closed shadow for page UI).
- `src/cite/` — source metadata + GOST/APA/MLA formatting. `src/markdown/` — HTML→MD (Turndown).
- `src/sites/` — global on/off + blocked sites: `rules.ts` (pure matching), `store.ts` (storage.local), `content.ts` (`gateHandlers`, `watchSiteActive`), `background.ts` (hides menu items via `menus.onShown`).
- `src/import/` — import of own notes (runs in the Library page, no background part): `parse.ts` (pure: frontmatter, note fields, folders, image embedding), `pdf.ts` (pure layout → Markdown + lazy pdf.js `extractPdf`), `run.ts` (`collectFiles` / `importFiles`: zip via fflate, writes via storage.ts). UI: `src/library/ImportMenu.tsx`.
- `src/<module>/` — `extract`, `projects`, `highlight`, `crawl`, `export`, `youtube`; each has `background.ts` / `content.ts` setup functions and its own `strings.ts`.
- `tests/` — unit tests + `tests/fixtures/` HTML.

## Architecture
Content script extracts/anchors on the page and answers `ContentMessages`. Background owns persistence, crawling and export and answers `BackgroundMessages`. Extension pages may use `src/core/storage.ts` directly (same origin) or messages. Events (`crawl/progress`, `data/changed`) go via `broadcast`/`onBroadcast`. Exports produce Blobs and save via `browser.downloads`; PDF renders the `print` page and calls Firefox `tabs.saveAsPDF`.

## Commands
- `npm install` — also runs `wxt prepare` (generates `.wxt/`).
- `npm run dev` — dev build, launches Firefox with the extension.
- `npm run build` — production build to `.output/firefox-mv3`. `npm run build:chrome` / `dev:chrome` / `zip:chrome` — Chrome (`.output/chrome-mv3`).
- `npm run zip` — package for AMO.
- `npm test` — Vitest. `npm run typecheck` — tsc. `npm run lint:ext` — web-ext lint (after build).

## Conventions
- Message contract lives only in `src/core/messages.ts`; add new message types there.
- Each module owns its folder; shared files (`src/core/*`, entrypoints) change only when necessary.
- UI strings: per-module `strings.ts` with `translator()` from `src/core/i18n.ts`, RU + EN. Manifest strings in `public/_locales`.
- Imports with `@/` alias (project root).
- Dates as ISO strings; IDs from `newId()`; URLs as identity via `normalizeUrl()`.
- Any HTML coming from web pages is sanitized with DOMPurify before rendering in extension pages.
- Never assign `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `setHTMLUnsafe` (AMO linter UNSAFE_VAR_ASSIGNMENT): parse with `parseHtml()` (inert `<template>`, same parsing as `template.innerHTML`) or `setHtml(el, html)` from `src/core/html.ts`. Reading `.innerHTML` is fine.
- UI injected into web pages: `attachShadow({ mode: shadowMode() })` and `if (!isTrustedEvent(e)) return;` in every handler (`src/core/dom-guard.ts`).
- New background message that content scripts must send → add it to `allowFromWebPages` in `entrypoints/background.ts` and validate against `sender`.
- Context menus are created only in `entrypoints/background.ts` (`removeAll` then each module's `create*Menus()`).

## Decisions
- UX: Library tab is the main workspace (edit there); sidebar is compact (list, preview, jump); popup = save + quick export.
- Bibliography style lives in Settings only; sidebar shows a collapsed "Список литературы". Anki only inside ExportMenu with explanation (users found GOST/APA/MLA and Anki buttons confusing).
- Editing markdown re-renders `clip.html` in `clip/update` (PDF uses html).
- WXT over hand-rolled Vite config: multi-entry build, Firefox manifest, dev runner out of the box.
- Local-only (IndexedDB), no server/accounts: privacy, zero cost.
- PDF via `tabs.saveAsPDF` on our own print page instead of a JS PDF library: real text, small bundle (Firefox-only API).
- Own tiny i18n per module instead of `_locales` for UI strings: avoids merge conflicts between modules.
- Crawler limited to same origin + path prefix, 1 request at a time, delay ≥1 s, max pages setting.

## Gotchas
- Chrome: the service worker has no DOM and no `import()`. DOM work goes through `dom(op)` (`src/core/dom.ts`): in place where `document` exists, else in `entrypoints/offscreen` (Chrome-only entrypoint, reasons DOM_PARSER + BLOBS). Ops: renderMarkdown, extractHtml (crawler), blobUrl/revokeUrl (downloads). Messages to/from offscreen are JSON (Blobs as base64).
- `registerHandlers` answers with `sendResponse` + `return true` (Chrome accepts a returned Promise only from 148, rolling out). Keep message payloads JSON-serializable.
- Chrome PDF: no `tabs.saveAsPDF` → print page opens with `&autoprint=1` and calls `window.print()` itself (scripting can't inject into extension pages in Chrome).
- Sidebar: Firefox `sidebarAction.open()`, Chrome `sidePanel.open({ windowId })`; both must run synchronously in the click.
- Library sends field changes (folder, column, project) with `clip/patch`, never a full stale `clip/update`. Page popover uses `highlight/recolor` / `highlight/setNote` for the same reason.
- Kanban moves change only the moved card's place in the project order (`moveCard`).
- Clips and highlights are separate records joined only by `normalizeUrl(clip.source.url) === highlight.url`; edited note text may no longer contain a highlight → it is still listed in the "Highlights" section of exports.
- Folders = `clip.section` (one level). Stored list (order + empty folders) in kv `folders:<projectId|__inbox__>`; `folderList()` merges it with sections found on clips. Graph adds a folder node per (project, folder).
- Highlight has two notes: `note` (short, page popover, shown on sites) and `body` (long Markdown, Library only). `highlight/save` from a web page never changes `body`.
- Project export menu = whole project only: Markdown zip (`projectToFolderFiles`) and PDF zip (`src/export/pdfzip.ts`), same layout from `projectLayout()`: notes in folders, `highlights/NNN - snippet.*` (one per highlight), `board.*`, index. Single notes / the board alone still use Firefox `tabs.saveAsPDF` (one save dialog each; it can't write into zips or subfolders).
- PDF zip runs in the extension page, never in the background: the background is a single bundle (dynamic `import()` gets inlined) and pdfmake + fonts are ~1.7 MB. `runExport` lazy-imports `src/export/pdfzip.ts`. pdfmake may not fetch URLs (`setUrlAccessPolicy(() => false)`); `prepareForPdf` inlines PNG/JPEG as data URLs, other images become alt text. No monospace font is embedded (code is Roboto).
- Vendor lint patches (`build/vendor-lint-patches.ts`, Vite plugin in `wxt.config.ts`, build only, both browsers): exact string replacements in third-party code the AMO linter flags — Readability + Preact `innerHTML =` → appended `__tnSetHtml` helper (DOMParser `"<body>"+html` + `replaceChildren`; body context, so not for table/SVG targets), DOMPurify's non-DOMParser `innerHTML` fallback → throws inside its try (sanitize returns ''), pdfmake `Function('return this')` → `globalThis`, pdf.js fake-worker `import(workerSrc)` and the worker asset's no-wasm decoder `import()` → rejected promise. Each pattern must match exactly or the build fails (also fails if a patched package is bundled but its file was never patched). After a dependency update that breaks a pattern: re-check the new code and update the `find` strings; `tests/build/vendor-lint-patches.test.ts` checks them against node_modules. Dev mode (`wxt` serve) is unpatched.
- Kanban to-dos: card checkbox moves it to `doneColumnId()` (column with `done: true`, else id `done`, else last) and back to the first other column.
- `UiProvider` api is memoized: pages put `ui` in deps; an unstable object made a failing load loop forever.
- Kanban: column per clip = `clip.status` (unknown/missing → first column); columns per project in IndexedDB `kv` key `board:<projectId|__inbox__>`; card order = project `clip.order`.
- Theme lives in `localStorage` `tn.theme` (extension pages only, synchronous → no flash). In-page bubble/popover still follow the browser theme.
- Graph/[[link]] resolution is by note title (case-insensitive), current project first. Project folder export names files by title so links resolve in Obsidian.
- Add-on ID changed from `take-notes@haos` to `take-notes@amikolabs.com` (v0.5): Firefox sees a new add-on, data stored under the old ID is not visible.
- Site access (`enabled`, `blockedSites`) lives in `browser.storage.local` key `tn-site-access`, NOT in IndexedDB `Settings`: content scripts can't reach the extension IndexedDB but can read storage.local and get `storage.onChanged`. Gating happens in the content script (every `ContentMessages` handler is wrapped by `gateHandlers`), so menus, hotkeys, popup and sidebar jumps are all refused on blocked pages. A blocklist entry covers subdomains; `www.` is stripped.
- Highlight colors: stored as `#rrggbb`, old data may hold names (`yellow`…). Always go through `colorHex()` (`src/core/colors.ts`) — it is also the CSS-injection guard for marks (`--tn-hl-rgb` on each `<mark>`). Palette = `settings.highlightPalette`, main color = `settings.highlightColor`; content scripts get it via `highlight/palette`.
- Library editor keeps its own draft; `data/changed` refreshes must not reset the clip being edited. Autosave merges onto the stored clip.
- Firefox may intercept some editor shortcuts (Ctrl/Cmd+N, K, E); toolbar buttons always work.
- Tests run with `tests/setup.ts` → `relaxDomGuardForTests()` (jsdom events are never trusted, shadow roots must be open for tests).
- Handler tests must pass an extension-page sender (`{ url: browser.runtime.getURL('/x.html') }`); an empty sender counts as a web page.
- Wikipedia (2025+) serves native MathML; TeX is in `data-mw` JSON `body.extsrc` (`src/extract/math.ts`).
- Crawl state lives in the event page memory; the crawler page pings `crawl/status` every 15 s to keep it alive — closing that tab mid-crawl may lose the crawl.
- `settings.defaultProjectId` = active project, set by popup and sidebar; hotkeys/menu/highlights save there. Background reads it only via `activeProjectId()` (storage.ts): a stale id (project gone) means Inbox.
- Settings writes must be patches of changed fields: the options page keeps a copy and sends `changedSettings(prev, next)`. Writing the whole copy back restored an old `defaultProjectId` → highlights went into a deleted project, invisible everywhere.
- Background clip writes (`clip/update`, `clip/patch`, `clip/reorder`, `clip/delete`) run one at a time (`serialClip` in src/projects/background.ts); `updateClip` awaits rendering between read and put.
- `openLibrary` with a Library tab already open sends broadcast `library/open` {tabId, search} instead of changing its URL (a reload could drop unsaved typing); discarded tabs still get the URL.
- Chrome downloads: blobs go to the offscreen document in 8 MB base64 pieces (`blobUrlViaDom`: `blobPart` ops, then `blobUrl` with the id).
- Deleting a url-less note (or its project) deletes its highlights (`takenotes-note:<id>`); project delete also drops kv `board:<id>` / `folders:<id>`.
- Min Firefox 140 (for `data_collection_permissions`); Firefox for Android 142 (`gecko_android.strict_min_version`, Android got that key in 142).
- IndexedDB cannot index `null`: Inbox clips/highlights are stored with `_project = '__inbox__'` (handled in `storage.ts`).
- Import: notes are `kind: 'selection'` with `source.url = ''` (shown as "Note"; exports skip the source line and bibliography entry for them). Local images become reference-style data URLs at the end of the note (`![a][img-1]` … `[img-1]: <data:…>`): DOMPurify keeps `data:` on `<img>`, so preview, PDF and exports need no extra storage. Images > 5 MB stay as links.
- Imported PDF original = an `Asset` (`mime application/pdf`, url `takenotes-import:…`) listed in `clip.assetIds`; `clips.delete` / `projects.delete` delete the clip's `assetIds` (only imports fill them; web images are cached by URL and shared). Library "Original PDF" opens it as a blob URL.
- pdf.js worker is emitted by Vite from `pdfjs-dist/build/pdf.worker.min.mjs?url` (1.3 MB asset); pdf.js itself is a lazy chunk loaded only by `ImportMenu` → `run.ts` → `pdf.ts`. No `cMapUrl` / `standardFontDataUrl` bundled: PDFs with CID fonts lacking ToUnicode may extract badly. Its fake-worker fallback is disabled by the vendor lint patch: if the module Worker fails to start, PDF import fails instead of running on the main thread.
- PDF layout heuristics (`itemsToMarkdown`): headings = size ≥ 1.18× body median; new block on vertical gap > 1.7× line size, on a short line (ends > 20% before the column's right edge) followed by a capital, or on an indented capital after a finished sentence; ≥ 2 consecutive fully indented blocks = list (bullets drawn as graphics); list continuation must be indented past the bullet; line-end hyphen dropped only after Cyrillic (Latin keeps compounds like lower-order); running headers/footers removed only with ≥ 3 pages. Scan = < 20 letters per page → note just points to the original (no OCR).
- Import of our own project zip: detected by root `index.md` with frontmatter tag `takenotes` (index skipped). `highlights/*.md` → Highlight records (linked to their note via "From note: [[path]]", then page URL, then text); the `==…==` marks the export added for them are removed; `board.md` → board columns + `clip.status` (existing project: columns matched by name, new ones appended). The export's trailing "Highlights" section and heading shift are undone on import.
- `==text==` in imported notes (not our export) → a Highlight per mark, `==` removed from the note text.
- Highlights of url-less notes use `Highlight.url = takenotes-note:<clipId>` (`noteHighlightUrl`); join clips ↔ highlights ONLY via `clipHighlightUrl(clip)` (src/core/util.ts), never `normalizeUrl(clip.source.url)` (two url-less notes would share highlights). No web page matches the key; `highlight/open` opens the Library note for it; exports print a plain heading instead of a link.
- YouTube: popup asks `youtube/tracks` first; >1 track → picker, last language in `localStorage` `tn.ytLang`. timedtext `baseUrl` now returns HTTP 200 with an empty body without the player's PO token (checked 2026-11) → fallback reads the transcript panel: content script clicks YouTube's "Show transcript" button, waits for segments (old `ytd-transcript-segment-renderer` and new `transcript-segment-view-model` markup, one panel only), switches the panel language menu to the picked track when it can, closes the panel if it opened it. No innertube client spoofing / PO-token scraping (deliberate). `source.url` = clean `watch?v=ID`; `source.lang` only when the language is confirmed.
- `vitest.config.ts` imports `WxtVitest` from `wxt/testing/vitest-plugin` (not `wxt/testing`).
- The sidebar entrypoint must be named `sidepanel` for WXT to emit `sidebar_action`.
