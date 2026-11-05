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
Prototype. Scaffold done; modules being implemented in parallel.

## Stack
TypeScript, WXT 0.21 (Vite), Manifest V3 for Firefox (background = event page with DOM), Preact, IndexedDB via `idb`, `@mozilla/readability`, `turndown` + `turndown-plugin-gfm`, `dompurify`, `fflate`. Tests: Vitest + jsdom (+ `fake-indexeddb`). npm.

## Structure
- `entrypoints/background.ts` — merges handler maps from every module's `setup*Background()`.
- `entrypoints/content.ts` — merges `setup*Content()` handlers; runs on `<all_urls>`.
- `entrypoints/{popup,sidepanel,options,crawler,print}/` — Preact pages (`sidepanel` → Firefox `sidebar_action`).
- `src/core/` — `types.ts` (data model), `messages.ts` (typed message contract), `storage.ts` (IndexedDB), `i18n.ts`, `util.ts`.
- `src/<module>/` — `extract`, `projects`, `highlight`, `crawl`, `export`, `youtube`; each has `background.ts` / `content.ts` setup functions and its own `strings.ts`.
- `src/ui/base.css` — shared styles (light/dark).
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

## Decisions
- WXT over hand-rolled Vite config: multi-entry build, Firefox manifest, dev runner out of the box.
- Local-only (IndexedDB), no server/accounts: privacy, zero cost.
- PDF via `tabs.saveAsPDF` on our own print page instead of a JS PDF library: real text, small bundle (Firefox-only API).
- Own tiny i18n per module instead of `_locales` for UI strings: avoids merge conflicts between modules.
- Crawler limited to same origin + path prefix, 1 request at a time, delay ≥1 s, max pages setting.

## Gotchas
- IndexedDB cannot index `null`: Inbox clips/highlights are stored with `_project = '__inbox__'` (handled in `storage.ts`).
- `vitest.config.ts` imports `WxtVitest` from `wxt/testing/vitest-plugin` (not `wxt/testing`).
- The sidebar entrypoint must be named `sidepanel` for WXT to emit `sidebar_action`.
