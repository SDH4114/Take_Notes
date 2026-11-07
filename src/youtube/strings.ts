import type { Dict } from '@/src/core/i18n';

export const strings: Dict<'transcript' | 'noCaptions' | 'notVideo' | 'channel' | 'video' | 'auto'> = {
  ru: { transcript: 'Субтитры', noCaptions: 'Не удалось получить субтитры: у видео нет текста или YouTube его не показал. Откройте «Показать текст видео» под описанием и попробуйте снова.', notVideo: 'Это не страница видео YouTube', channel: 'Канал', video: 'Видео', auto: 'автосубтитры' },
  en: { transcript: 'Transcript', noCaptions: 'Could not get captions: the video has no transcript or YouTube did not show it. Open "Show transcript" under the description and try again.', notVideo: 'Not a YouTube video page', channel: 'Channel', video: 'Video', auto: 'auto-generated' },
};
