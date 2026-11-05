import { translator, type Dict } from '@/src/core/i18n';

const dict = {
  ru: {
    menuHighlight: 'Выделить маркером',
    highlight: 'Выделить',
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
  },
  en: {
    menuHighlight: 'Highlight selection',
    highlight: 'Highlight',
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
  },
} satisfies Dict<string>;

export type HighlightStringKey = keyof (typeof dict)['en'];
export const t = translator<HighlightStringKey>(dict);
