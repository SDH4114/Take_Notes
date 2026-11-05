import { translator, type Dict } from '@/src/core/i18n';

const dict = {
  ru: {
    menuHighlight: 'Выделить маркером',
    highlight: 'Выделить',
    moreColors: 'Другие цвета',
    note: 'Заметка…',
    delete: 'Удалить',
    copy: 'Копировать текст',
    copied: 'Скопировано',
    close: 'Закрыть',
    yellow: 'Жёлтый',
    green: 'Зелёный',
    blue: 'Синий',
    pink: 'Розовый',
    purple: 'Фиолетовый',
    notFound: 'Не удалось найти выделение на странице — возможно, текст изменился',
    unknownHighlight: 'Выделение не найдено',
  },
  en: {
    menuHighlight: 'Highlight selection',
    highlight: 'Highlight',
    moreColors: 'More colors',
    note: 'Note…',
    delete: 'Delete',
    copy: 'Copy text',
    copied: 'Copied',
    close: 'Close',
    yellow: 'Yellow',
    green: 'Green',
    blue: 'Blue',
    pink: 'Pink',
    purple: 'Purple',
    notFound: 'Could not find the highlight on the page — the text may have changed',
    unknownHighlight: 'Highlight not found',
  },
} satisfies Dict<string>;

export type HighlightStringKey = keyof (typeof dict)['en'];
export const t = translator<HighlightStringKey>(dict);
