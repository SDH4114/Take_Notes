# TakeNotes

Firefox extension that turns web pages into study notes: Markdown and PDF export, projects with a bibliography (GOST / APA / MLA), highlights, Anki cards, and whole documentation sections saved as one book.

## Requirements
- Node.js 22 (tested with 22.23.1), npm
- Firefox 140+ (desktop)

## Install & build
```sh
npm install
npm run build        # output: .output/firefox-mv3
```

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
- **Popup** (toolbar button): choose the active project, save the page or selection, export to .md / PDF, save a documentation section, save a YouTube transcript.
- **Hotkeys**: `Alt+Shift+S` save selection, `Alt+Shift+P` save page. **Context menu**: save selection/page, highlight.
- **Highlights**: select text → pick a color in the small toolbar; click a highlight to add a note or delete it.
- **Sidebar** (View → Sidebar → TakeNotes): projects, clips (reorder, notes, sections), highlights, bibliography (GOST / APA / MLA), export (MD, MD + images zip, PDF, Anki TSV).
- **Documentation section**: on e.g. `https://metanit.com/rust/tutorial/` open the popup → "Download docs section", review the chapter list, download, then export as PDF / one .md / folder of .md. Keep that tab open while it downloads. Saved material is for personal study.
- **Settings**: `about:addons` → TakeNotes → Preferences.
