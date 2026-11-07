# TakeNotes

Firefox extension that turns web pages into study notes: Markdown and PDF export, projects with a bibliography (GOST / APA / MLA), highlights, Anki cards, and whole documentation sections saved as one book.

## Requirements
- Node.js 22 (tested with 22.23.1), npm
- Firefox 140+ (desktop) or Chrome 116+

## Install & build
```sh
npm install
npm run build        # output: .output/firefox-mv3
```

## Chrome
```sh
npm run build:chrome   # .output/chrome-mv3 → chrome://extensions → Developer mode → Load unpacked
npm run dev:chrome     # dev build with auto-reload
```
In Chrome a PDF of a single note opens the print dialog (choose "Save as PDF"); the whole-project PDF (.zip) works the same as in Firefox.

## Run
```sh
npm run dev          # launches Firefox with the extension loaded
```
Or load manually: `about:debugging` → This Firefox → Load Temporary Add-on → `.output/firefox-mv3/manifest.json`.

## Tests
```sh
npm test
npm run typecheck
```

## Usage
- **Popup** (toolbar button): choose the active project, save the page or selection, export to .md / PDF, save a documentation section, save a YouTube transcript (if the video has several caption tracks, you pick the language; the note starts with a link to the video).
- **Hotkeys**: `Alt+Shift+S` save selection, `Alt+Shift+P` save page. **Context menu**: save selection/page, highlight.
- **Highlights**: select text → pick a color in the small toolbar; click a highlight to add a note or delete it. Highlights show up inside the saved note of that page and in its .md / PDF export.
- **Library** (popup → library icon): full-tab workspace — projects, notes, highlights, books, Markdown editor with toolbar (bold, italic, highlight `==text==`, headings, lists, code, links) and live preview.
- **Library views**: *Notes*, *Highlights* (open the note of a highlight, move it to another project), *Graph* (notes linked by `[[Note title]]` and shared tags, like Obsidian), *Board* (kanban columns per project, drag cards, add your own cards or delete them; a card is a note; tick a card to move it to the done column, any column can be marked as the done one). Notes have tags (`#tag` in text or the Tags field) and clickable `[[links]]`.
- **Folders**: Library → folder button next to "New note"; drag notes onto a folder or use the folder menu in a note. Folders are linked in the graph and become folders in the export.
- **Highlight notes**: a short note (shown on the site) and a long Markdown note (only in the Library).
- **Export**: a single note from the note itself (.md / .md + images / PDF). Library → "Download project": Markdown (.zip) or PDF (.zip), both with notes in folders, `highlights/` (one file per highlight), the board and an index; Anki cards from highlights. On the Board tab: "Download board" as .md (Obsidian Kanban format) or PDF (landscape).
- **Import your own notes**: Library → "Import" in the left panel. A folder (e.g. an Obsidian vault) or a .zip (also a TakeNotes project export) becomes a new project: subfolders become folders, frontmatter/#tags/sources are kept, local images are embedded. Loose .md / PDF files go into the current project. PDF text is turned into Markdown (headings, paragraphs, lists); the original PDF is kept ("Original PDF" button in the note). Scanned PDFs have no text layer: the note only points to the original (no OCR).
- **Sidebar** (View → Sidebar → TakeNotes): compact list of notes and highlights; click a highlight to jump to it on the page; bibliography and export at the bottom.
- **Documentation section**: on e.g. `https://metanit.com/rust/tutorial/` open the popup → "Download docs section", review the chapter list, download, then export as PDF / one .md / folder of .md. Keep that tab open while it downloads. Saved material is for personal study.
- **Settings**: `about:addons` → TakeNotes → Preferences. Theme (browser / light / dark), turning TakeNotes off globally or per site (also from the popup), bibliography, export, crawler, highlight palette.
