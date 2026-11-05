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
