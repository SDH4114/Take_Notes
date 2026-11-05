// YouTube transcript extraction. Pure helpers are unit-tested; network/DOM parts are best-effort
// (YouTube changes often — treat as fragile).

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

/** Read segments from the transcript panel if the user opened it ("Show transcript"). */
export function segmentsFromPanel(doc: Document): Segment[] {
  const rows = doc.querySelectorAll('ytd-transcript-segment-renderer');
  const out: Segment[] = [];
  rows.forEach((r) => {
    const ts = r.querySelector('.segment-timestamp')?.textContent ?? '';
    const text = (r.querySelector('.segment-text')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) out.push({ start: parseTimestamp(ts), text });
  });
  return out;
}
