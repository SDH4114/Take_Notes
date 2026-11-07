// Shared data model. Changing this file affects every module — keep it stable.

export type CitationStyle = 'gost' | 'apa' | 'mla';
export type ClipKind = 'page' | 'selection' | 'transcript' | 'chapter';
/** "#rrggbb" (v0.3+) or a legacy name ('yellow'|'green'|'blue'|'pink'|'purple'). Always read via colorHex(). */
export type HighlightColor = string;
/** 'pdf-zip': a zip of PDFs generated in JS (whole project); 'pdf' uses Firefox' own PDF printer. */
export type ExportFormat = 'md' | 'md-zip' | 'md-folder-zip' | 'pdf' | 'pdf-zip' | 'anki-tsv';

/** Bibliographic metadata of a web source. Dates are ISO 8601 strings. */
export interface SourceMeta {
  url: string;
  title: string;
  authors: string[];
  siteName?: string;
  publisher?: string;
  published?: string;
  /** Date the user accessed/saved the page ("дата обращения"). */
  accessed: string;
  lang?: string;
  description?: string;
}

/** Result of extracting content in a page (content script → background). */
export interface ExtractResult {
  title: string;
  /** Cleaned, sanitized article/selection HTML. Image src are absolute URLs. */
  html: string;
  markdown: string;
  source: SourceMeta;
  /** Absolute URLs of images referenced in html/markdown. */
  imageUrls: string[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  citationStyle: CitationStyle;
  createdAt: string;
  updatedAt: string;
}

export interface Clip {
  id: string;
  /** null = "Inbox" (no project). */
  projectId: string | null;
  kind: ClipKind;
  title: string;
  html: string;
  markdown: string;
  source: SourceMeta;
  note?: string;
  tags: string[];
  /** Folder inside the project (Library "folders"); also the section heading in exports. */
  section?: string;
  /** Sort order inside a project (ascending). */
  order: number;
  /** Kanban column id (see BoardColumn); missing or unknown = first column. */
  status?: string;
  assetIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Binary asset (image) downloaded for offline export. */
export interface Asset {
  id: string;
  /** Original absolute URL. */
  url: string;
  mime: string;
  /** Suggested relative path inside exports, e.g. "images/abc123.png". */
  filename: string;
  data: Blob;
}

/** W3C-style text quote selector used to re-anchor highlights. */
export interface TextQuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface Highlight {
  id: string;
  /** Page URL normalized by normalizeUrl() (no hash, no tracking params). */
  url: string;
  color: HighlightColor;
  anchor: TextQuoteAnchor;
  text: string;
  /** Short note: edited in the page popover and shown on the site. */
  note?: string;
  /** Long Markdown note: edited only in the Library. Pages never change it (see highlight/save). */
  body?: string;
  source: SourceMeta;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Kanban column of a project board. */
export interface BoardColumn {
  id: string;
  name: string;
  /** Checked-off cards go here. At most one column has it; see doneColumnId(). */
  done?: boolean;
}

/** A YouTube caption track as offered in the language picker (no URLs). kind 'asr' = auto-generated. */
export interface TrackInfo { languageCode: string; kind?: string; label: string }

export interface TocEntry {
  url: string;
  title: string;
  /** Nesting depth, 0 = top level. */
  level: number;
}

export interface BookChapter {
  url: string;
  title: string;
  level: number;
  html: string;
  markdown: string;
  assetIds: string[];
}

export interface Book {
  id: string;
  title: string;
  rootUrl: string;
  source: SourceMeta;
  chapters: BookChapter[];
  createdAt: string;
}

export type CrawlState = 'idle' | 'running' | 'done' | 'stopped' | 'error';

export interface CrawlProgress {
  state: CrawlState;
  done: number;
  total: number;
  current?: string;
  bookId?: string;
  errors: { url: string; message: string }[];
}

export interface Settings {
  citationStyle: CitationStyle;
  defaultProjectId: string | null;
  obsidian: { frontmatter: boolean; wikilinks: boolean };
  crawl: { delayMs: number; maxPages: number };
  /** Download images into zip exports (true) or keep remote links (false). */
  downloadImages: boolean;
  /** Default (one-click) highlight color. */
  highlightColor: HighlightColor;
  /** User palette shown in the selection toolbar; edited in Settings. */
  highlightPalette: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  citationStyle: 'gost',
  defaultProjectId: null,
  obsidian: { frontmatter: true, wikilinks: true },
  crawl: { delayMs: 1500, maxPages: 300 },
  downloadImages: true,
  highlightColor: '#facc15',
  highlightPalette: ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa'],
};
