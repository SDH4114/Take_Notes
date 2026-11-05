import { translator, type Dict } from '@/src/core/i18n';

const keys = [
  'inbox', 'projects', 'newProject', 'projectName', 'create', 'rename', 'delete', 'cancel', 'save',
  'confirmDeleteProject', 'confirmDeleteClip', 'noClips', 'noHighlights', 'clips', 'highlights',
  'up', 'down', 'edit', 'note', 'section', 'open', 'preview', 'hidePreview', 'bibliography',
  'copy', 'copied', 'export', 'exportMd', 'exportMdZip', 'exportPdf', 'exportAnki', 'exportFailed',
  'kind_page', 'kind_selection', 'kind_transcript', 'kind_chapter', 'noBibliography', 'error', 'loading',
  'style_gost', 'style_apa', 'style_mla', 'citationStyle', 'emptyMarkdown',
  // options
  'settings', 'obsidianFrontmatter', 'obsidianWikilinks', 'crawlDelay', 'crawlMaxPages', 'downloadImages',
  'highlightColor', 'saved', 'dangerZone', 'deleteAll', 'confirmDeleteAll', 'deletedAll', 'defaultProject',
  'none', 'color_yellow', 'color_green', 'color_blue', 'color_pink', 'color_purple', 'ms',
] as const;
export type StringKey = (typeof keys)[number];

const dict: Dict<StringKey> = {
  ru: {
    inbox: 'Входящие', projects: 'Проекты', newProject: 'Новый проект', projectName: 'Название проекта',
    create: 'Создать', rename: 'Переименовать', delete: 'Удалить', cancel: 'Отмена', save: 'Сохранить',
    confirmDeleteProject: 'Удалить проект «{name}» вместе со всеми его конспектами?',
    confirmDeleteClip: 'Удалить конспект «{title}»?',
    noClips: 'Пока пусто', noHighlights: 'Нет выделений', clips: 'Конспекты', highlights: 'Выделения',
    up: 'Вверх', down: 'Вниз', edit: 'Править', note: 'Заметка', section: 'Раздел', open: 'Открыть источник',
    preview: 'Просмотр', hidePreview: 'Скрыть', bibliography: 'Список литературы',
    copy: 'Копировать', copied: 'Скопировано', export: 'Экспорт', exportMd: 'MD', exportMdZip: 'MD + картинки (zip)',
    exportPdf: 'PDF', exportAnki: 'Anki (TSV)', exportFailed: 'Ошибка экспорта: {message}',
    kind_page: 'страница', kind_selection: 'фрагмент', kind_transcript: 'субтитры', kind_chapter: 'глава',
    noBibliography: 'Нет источников', error: 'Ошибка: {message}', loading: 'Загрузка…',
    style_gost: 'ГОСТ', style_apa: 'APA', style_mla: 'MLA', citationStyle: 'Стиль цитирования',
    emptyMarkdown: '(пусто)',
    settings: 'Настройки', obsidianFrontmatter: 'Obsidian: frontmatter', obsidianWikilinks: 'Obsidian: [[вики-ссылки]]',
    crawlDelay: 'Пауза между страницами при обходе', crawlMaxPages: 'Максимум страниц при обходе',
    downloadImages: 'Скачивать картинки в zip', highlightColor: 'Цвет выделения по умолчанию',
    saved: 'Сохранено', dangerZone: 'Опасная зона', deleteAll: 'Удалить все данные',
    confirmDeleteAll: 'Удалить ВСЕ проекты, конспекты, выделения, книги и настройки? Это нельзя отменить.',
    deletedAll: 'Все данные удалены', defaultProject: 'Проект по умолчанию', none: 'Входящие',
    color_yellow: 'Жёлтый', color_green: 'Зелёный', color_blue: 'Синий', color_pink: 'Розовый', color_purple: 'Фиолетовый',
    ms: 'мс',
  },
  en: {
    inbox: 'Inbox', projects: 'Projects', newProject: 'New project', projectName: 'Project name',
    create: 'Create', rename: 'Rename', delete: 'Delete', cancel: 'Cancel', save: 'Save',
    confirmDeleteProject: 'Delete project "{name}" and all its clips?',
    confirmDeleteClip: 'Delete clip "{title}"?',
    noClips: 'Nothing here yet', noHighlights: 'No highlights', clips: 'Clips', highlights: 'Highlights',
    up: 'Up', down: 'Down', edit: 'Edit', note: 'Note', section: 'Section', open: 'Open source',
    preview: 'Preview', hidePreview: 'Hide', bibliography: 'Bibliography',
    copy: 'Copy', copied: 'Copied', export: 'Export', exportMd: 'MD', exportMdZip: 'MD + images (zip)',
    exportPdf: 'PDF', exportAnki: 'Anki (TSV)', exportFailed: 'Export failed: {message}',
    kind_page: 'page', kind_selection: 'selection', kind_transcript: 'transcript', kind_chapter: 'chapter',
    noBibliography: 'No sources', error: 'Error: {message}', loading: 'Loading…',
    style_gost: 'GOST', style_apa: 'APA', style_mla: 'MLA', citationStyle: 'Citation style',
    emptyMarkdown: '(empty)',
    settings: 'Settings', obsidianFrontmatter: 'Obsidian: frontmatter', obsidianWikilinks: 'Obsidian: [[wikilinks]]',
    crawlDelay: 'Delay between crawled pages', crawlMaxPages: 'Max pages per crawl',
    downloadImages: 'Download images into zip', highlightColor: 'Default highlight color',
    saved: 'Saved', dangerZone: 'Danger zone', deleteAll: 'Delete all data',
    confirmDeleteAll: 'Delete ALL projects, clips, highlights, books and settings? This cannot be undone.',
    deletedAll: 'All data deleted', defaultProject: 'Default project', none: 'Inbox',
    color_yellow: 'Yellow', color_green: 'Green', color_blue: 'Blue', color_pink: 'Pink', color_purple: 'Purple',
    ms: 'ms',
  },
};

export const t = translator(dict);
