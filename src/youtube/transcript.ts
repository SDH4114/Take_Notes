// YouTube transcript extraction. Pure helpers are unit-tested; network/DOM parts are best-effort
// (YouTube changes often — treat as fragile).

import type { TrackInfo } from '@/src/core/types';

export type { TrackInfo };
export interface Segment { start: number; text: string }
export interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string; name?: string }

/** Pull the ytInitialPlayerResponse JSON object out of a watch page HTML. */
export function parsePlayerResponse(html: string): unknown | null {
  const marker = 'ytInitialPlayerResponse';
  let i = html.indexOf(marker);
  while (i !== -1) {
    const start = html.indexOf('{', i);
    if (start === -1) return null;
    // Balanced-brace scan that respects strings.
    let depth = 0, inStr = false, esc = false;
    for (let j = start; j < html.length; j++) {
      const c = html[j];
      if (inStr) {
        if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(html.slice(start, j + 1)); } catch { break; }
      }
    }
    i = html.indexOf(marker, i + marker.length);
  }
  return null;
}

export function captionTracks(player: unknown): CaptionTrack[] {
  const p = player as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ baseUrl: string; languageCode: string; kind?: string; name?: { simpleText?: string; runs?: { text: string }[] } }> } } };
  const list = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return list.map((t) => ({ baseUrl: t.baseUrl, languageCode: t.languageCode, kind: t.kind, name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') }));
}

/** Prefer manual captions in a preferred language, then auto (asr) in it, then any manual, then anything. */
export function pickTrack(tracks: CaptionTrack[], prefLangs: string[]): CaptionTrack | undefined {
  const manual = tracks.filter((t) => t.kind !== 'asr');
  for (const l of prefLangs) {
    const m = manual.find((t) => t.languageCode.startsWith(l));
    if (m) return m;
  }
  for (const l of prefLangs) {
    const a = tracks.find((t) => t.languageCode.startsWith(l));
    if (a) return a;
  }
  return manual[0] ?? tracks[0];
}


/** Language name for a code in the UI language, e.g. "ru" → "русский"; falls back to the code. */
export function languageName(code: string, uiLang: string): string {
  try {
    const n = new Intl.DisplayNames([uiLang], { type: 'language' }).of(code);
    if (n && n !== code) return n.charAt(0).toUpperCase() + n.slice(1);
  } catch { /* invalid code or no Intl.DisplayNames */ }
  return code;
}

/** Tracks for the language picker: manual first, then auto (asr); one entry per language + kind. */
export function listTracks(tracks: CaptionTrack[], uiLang = 'en', autoSuffix = 'auto'): TrackInfo[] {
  const seen = new Set<string>();
  const out: TrackInfo[] = [];
  const sorted = [...tracks.filter((t) => t.kind !== 'asr'), ...tracks.filter((t) => t.kind === 'asr')];
  for (const t of sorted) {
    const key = `${t.languageCode}|${t.kind === 'asr' ? 'asr' : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // YouTube's own name ("English (auto-generated)") is in the YouTube UI language; ours follows the extension UI.
    const base = languageName(t.languageCode, uiLang);
    out.push({ languageCode: t.languageCode, ...(t.kind === 'asr' ? { kind: 'asr' } : {}), label: t.kind === 'asr' ? `${base} (${autoSuffix})` : base });
  }
  return out;
}

/** The track the user picked (exact language + kind), if it still exists. */
export function findTrack(tracks: CaptionTrack[], choice: { languageCode: string; kind?: string }): CaptionTrack | undefined {
  const asr = choice.kind === 'asr';
  return tracks.find((t) => t.languageCode === choice.languageCode && (t.kind === 'asr') === asr);
}

/** Order picker entries so the last used language comes first (manual before auto within it). */
export function preferLanguage(list: TrackInfo[], lang: string | null | undefined): TrackInfo[] {
  if (!lang) return list;
  const hit = list.filter((t) => t.languageCode === lang);
  return hit.length ? [...hit, ...list.filter((t) => t.languageCode !== lang)] : list;
}

/** Canonical video URL without playlist / time / tracking params: https://www.youtube.com/watch?v=ID */
export function cleanVideoUrl(url: string): string {
  try {
    const id = new URL(url).searchParams.get('v');
    return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : url;
  } catch {
    return url;
  }
}

/** Parse YouTube timedtext json3 format. */
export function parseJson3(json: unknown): Segment[] {
  const j = json as { events?: Array<{ tStartMs?: number; segs?: { utf8: string }[] }> };
  const out: Segment[] = [];
  for (const e of j?.events ?? []) {
    if (!e.segs) continue;
    const text = e.segs.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim();
    if (text) out.push({ start: (e.tStartMs ?? 0) / 1000, text });
  }
  return out;
}

/** Parse "1:02:03" / "12:34" timestamps into seconds. */
export function parseTimestamp(s: string): number {
  return s.trim().split(':').map(Number).reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);
}

export function formatTimestamp(sec: number): string {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Group segments into paragraphs (~every `every` seconds) with clickable timestamps. */
export function segmentsToMarkdown(segments: Segment[], videoUrl: string, every = 60): string {
  const id = new URL(videoUrl).searchParams.get('v');
  const link = (t: number) => (id ? `https://www.youtube.com/watch?v=${id}&t=${Math.floor(t)}s` : videoUrl);
  const paras: string[] = [];
  let cur: Segment[] = [];
  const flush = () => {
    if (!cur.length) return;
    const t = cur[0]!.start;
    paras.push(`[${formatTimestamp(t)}](${link(t)}) ${cur.map((s) => s.text).join(' ')}`);
    cur = [];
  };
  for (const s of segments) {
    if (cur.length && s.start - cur[0]!.start >= every) flush();
    cur.push(s);
  }
  flush();
  return paras.join('\n\n');
}

// Transcript panel ("Show transcript"). YouTube renders it on demand; two segment generations coexist:
// new `transcript-segment-view-model` and legacy `ytd-transcript-segment-renderer`.
const NEW_SEGMENT = 'transcript-segment-view-model';
const LEGACY_SEGMENT = 'ytd-transcript-segment-renderer';
export const SEGMENT_SELECTOR = `${NEW_SEGMENT}, ${LEGACY_SEGMENT}`;
export const PANEL_SELECTOR = 'ytd-engagement-panel-section-list-renderer';
// Structural selector first (works in any UI language), English labels as a fallback.
const TRANSCRIPT_BUTTONS = ['ytd-video-description-transcript-section-renderer button', 'button[aria-label="Show transcript"]', 'button[aria-label="Transcript"]'];
export const PANEL_CLOSE_SELECTORS = ['#visibility-button button', 'button[aria-label="Close transcript"]'];

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** The panel holding the rendered transcript (YouTube mirrors it into several panels; read one). */
export function transcriptPanel(root: ParentNode): Element | null {
  const seg = root.querySelector(SEGMENT_SELECTOR);
  return seg ? (seg.closest(PANEL_SELECTOR) ?? seg.parentElement) : null;
}

/** Read segments from the transcript panel, if it is rendered. */
export function segmentsFromPanel(root: ParentNode): Segment[] {
  const panel = transcriptPanel(root);
  if (!panel) return [];
  const out: Segment[] = [];
  const fresh = panel.querySelectorAll(NEW_SEGMENT);
  if (fresh.length) {
    fresh.forEach((r) => {
      // The caption is the only role="text" node; the timestamp's a11y label is a plain div.
      const text = clean(r.querySelector('span[role="text"]')?.textContent);
      if (text) out.push({ start: parseTimestamp(r.querySelector('.ytwTranscriptSegmentViewModelTimestamp')?.textContent ?? ''), text });
    });
    return out;
  }
  panel.querySelectorAll(LEGACY_SEGMENT).forEach((r) => {
    const text = clean(r.querySelector('.segment-text')?.textContent);
    if (text) out.push({ start: parseTimestamp(r.querySelector('.segment-timestamp')?.textContent ?? ''), text });
  });
  return out;
}

export function findTranscriptButton(doc: ParentNode): HTMLElement | null {
  for (const sel of TRANSCRIPT_BUTTONS) {
    const b = doc.querySelector<HTMLElement>(sel);
    if (b) return b;
  }
  return null;
}

export interface PanelLanguage { el: HTMLElement; label: string; selected: boolean }

/** Language menu in the transcript panel footer (only present when the video has several transcripts). */
export function panelLanguages(panel: ParentNode): PanelLanguage[] {
  const items = panel.querySelectorAll<HTMLElement>('ytd-transcript-footer-renderer tp-yt-paper-item, yt-sort-filter-sub-menu-renderer tp-yt-paper-item');
  return [...new Set(items)].map((el) => ({
    el,
    label: clean(el.textContent),
    selected: el.getAttribute('aria-selected') === 'true' || el.classList.contains('iron-selected'),
  })).filter((x) => x.label);
}

/** Index of the panel language matching the track's YouTube name ("English (auto-generated)"), or -1. */
export function matchLanguage(labels: string[], track: { languageCode: string; kind?: string; name?: string }): number {
  const name = clean(track.name).toLowerCase();
  return name ? labels.findIndex((l) => clean(l).toLowerCase() === name) : -1;
}
