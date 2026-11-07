// Background part of the youtube module.
import { broadcast, resolveTabId, sendToTab, type BackgroundMessages, type Handlers } from '@/src/core/messages';
import { clips, settings } from '@/src/core/storage';
import type { Clip } from '@/src/core/types';
import { newId, nowIso } from '@/src/core/util';

export function setupYoutubeBackground(): Handlers<BackgroundMessages> {
  return {
    'youtube/tracks': async ({ tabId }) => sendToTab(await resolveTabId(tabId), 'content/youtubeTracks'),
    'youtube/saveTranscript': async ({ tabId, projectId, lang, kind }) => {
      const tab = await resolveTabId(tabId);
      const r = await sendToTab(tab, 'content/youtubeTranscript', lang ? { languageCode: lang, kind } : {});
      if (!r) return null;
      const pid = projectId !== undefined ? projectId : (await settings.get()).defaultProjectId;
      const now = nowIso();
      const clip: Clip = {
        id: newId(), projectId: pid, kind: 'transcript', title: r.title, html: r.html, markdown: r.markdown,
        source: r.source, tags: ['youtube'], order: await clips.nextOrder(pid), assetIds: [], createdAt: now, updatedAt: now,
      };
      await clips.put(clip);
      broadcast('data/changed', { kind: 'clip' });
      return clip;
    },
  };
}
