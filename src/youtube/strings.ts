import type { Dict } from '@/src/core/i18n';

export const strings: Dict<'transcript' | 'noCaptions' | 'notVideo' | 'channel'> = {
  ru: { transcript: 'Субтитры', noCaptions: 'Не удалось получить субтитры. Откройте «Показать текст видео» под видео и попробуйте снова.', notVideo: 'Это не страница видео YouTube', channel: 'Канал' },
  en: { transcript: 'Transcript', noCaptions: 'Could not get captions. Open "Show transcript" under the video and try again.', notVideo: 'Not a YouTube video page', channel: 'Channel' },
};
