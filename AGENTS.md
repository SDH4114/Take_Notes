# AGENTS.md — TakeNotes

## Purpose
Firefox extension for school and university students: turn web pages into study material — Markdown/PDF notes, projects (coursework) with a bibliography, highlights, Anki cards, and whole documentation sections saved as one book (e.g. metanit.com → Rust). Audience: CIS + international (RU/EN UI, GOST default, APA/MLA).

## What it does (target v0.1)
1. Save page / selection → Markdown (math as `$…$`, tables, code, images downloaded into zip).
2. Projects: ordered clips with sections, exported as one document.
3. Bibliography: GOST R 7.0.100-2018, APA 7, MLA 9; access date set automatically.
4. Highlights (colors + notes) restored on revisit; export highlights only.
5. Docs crawler: detect TOC (or user picks the menu), crawl same-origin + path-prefix slowly, assemble a book (MD / PDF / folder of .md).
6. Anki export (TSV), Obsidian frontmatter + `[[wikilinks]]`, YouTube transcript → .md.
AI features are deferred.

## Status
Prototype v0.2.0: UI/UX redesign done — Library tab with Markdown editor, new popup/sidebar/options/crawler, jump-to-highlight.
365 unit tests, build + web-ext lint (0 errors) clean. Tested by Haos in Zen (Firefox-based) at v0.1; v0.2 not yet run in a browser.
Known gaps: book chapters keep remote images in PDF; math in PDF is TeX text; `src/crawl/book.ts bookToMarkdown`
duplicates `src/export/document.ts bookToMarkdownExport` (only tests use it); Library loads full books to count chapters.

## Stack
TypeScript, WXT 0.21 (Vite), Manifest V3 for Firefox (background = event page with DOM), Preact, IndexedDB via `idb`, `@mozilla/readability`, `turndown` + `turndown-plugin-gfm`, `dompurify`, `fflate`. CodeMirror 6 (editor), `marked` (preview). Tests: Vitest + jsdom (+ `fake-indexeddb`). npm.

## Structure
- `entrypoints/background.ts` — merges handler maps from every module's `setup*Background()`.
- `entrypoints/content.ts` — merges `setup*Content()` handlers; runs on `<all_urls>`.
- `entrypoints/{popup,sidepanel,options,crawler,print,library}/` — Preact pages (`sidepanel` → Firefox `sidebar_action`; `library` = full-tab workspace, opened via `openLibrary({project, clip, view})`).
- `src/library/` — Library app (App, Nav, Lists, ClipPane, Panes), `format.ts` (pure Markdown formatting commands), `logic.ts`.
- `src/ui/` — shared kit: `base.css` (tokens + classes), `icons.tsx`, `components.tsx` (UiProvider toast/prompt/confirm, Menu, ProjectPicker, ExportMenu, openLibrary), `markdown.ts` (renderMarkdown: GFM + ==mark== + $math$, sanitized), `editor.tsx` (CodeMirror MarkdownEditor).
- `src/core/` — `types.ts` (data model), `messages.ts` (typed message contract + sender allowlist), `storage.ts` (IndexedDB), `i18n.ts`, `util.ts`, `dom-guard.ts` (isTrusted / closed shadow for page UI).
- `src/cite/` — source metadata + GOST/APA/MLA formatting. `src/markdown/` — HTML→MD (Turndown).
- `src/<module>/` — `extract`, `projects`, `highlight`, `crawl`, `export`, `youtube`; each has `background.ts` / `content.ts` setup functions and its own `strings.ts`.
- `tests/` — unit tests + `tests/fixtures/` HTML.

## Architecture
Content script extracts/anchors on the page and answers `ContentMessages`. Background owns persistence, crawling and export and answers `BackgroundMessages`. Extension pages may use `src/core/storage.ts` directly (same origin) or messages. Events (`crawl/progress`, `data/changed`) go via `broadcast`/`onBroadcast`. Exports produce Blobs and save via `browser.downloads`; PDF renders the `print` page and calls Firefox `tabs.saveAsPDF`.

## Commands
- `npm install` — also runs `wxt prepare` (generates `.wxt/`).
- `npm run dev` — dev build, launches Firefox with the extension.
- `npm run build` — production build to `.output/firefox-mv3`.
- `npm run zip` — package for AMO.
- `npm test` — Vitest. `npm run typecheck` — tsc. `npm run lint:ext` — web-ext lint (after build).

## Conventions
- Message contract lives only in `src/core/messages.ts`; add new message types there.
- Each module owns its folder; shared files (`src/core/*`, entrypoints) change only when necessary.
- UI strings: per-module `strings.ts` with `translator()` from `src/core/i18n.ts`, RU + EN. Manifest strings in `public/_locales`.
- Imports with `@/` alias (project root).
- Dates as ISO strings; IDs from `newId()`; URLs as identity via `normalizeUrl()`.
- Any HTML coming from web pages is sanitized with DOMPurify before rendering in extension pages.
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
- Library editor keeps its own draft; `data/changed` refreshes must not reset the clip being edited. Autosave merges onto the stored clip.
- Firefox may intercept some editor shortcuts (Ctrl/Cmd+N, K, E); toolbar buttons always work.
- Tests run with `tests/setup.ts` → `relaxDomGuardForTests()` (jsdom events are never trusted, shadow roots must be open for tests).
- Handler tests must pass an extension-page sender (`{ url: browser.runtime.getURL('/x.html') }`); an empty sender counts as a web page.
- Wikipedia (2025+) serves native MathML; TeX is in `data-mw` JSON `body.extsrc` (`src/extract/math.ts`).
- Crawl state lives in the event page memory; the crawler page pings `crawl/status` every 15 s to keep it alive — closing that tab mid-crawl may lose the crawl.
- `settings.defaultProjectId` = active project, set by popup and sidebar; hotkeys/menu/highlights save there.
- Min Firefox 140 (for `data_collection_permissions`).
- IndexedDB cannot index `null`: Inbox clips/highlights are stored with `_project = '__inbox__'` (handled in `storage.ts`).
- `vitest.config.ts` imports `WxtVitest` from `wxt/testing/vitest-plugin` (not `wxt/testing`).
- The sidebar entrypoint must be named `sidepanel` for WXT to emit `sidebar_action`.
