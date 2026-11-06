import { translator, type Dict } from '@/src/core/i18n';

type K =
  | 'inbox' | 'newProject' | 'projectName' | 'create' | 'cancel' | 'save' | 'delete' | 'rename' | 'confirm'
  | 'export' | 'exportMd' | 'exportMdHint' | 'exportZip' | 'exportZipHint' | 'exportPdf' | 'exportPdfHint'
  | 'exportFolder' | 'exportFolderHint' | 'exportAnki' | 'exportAnkiHint' | 'exportHlMd' | 'exportHlMdHint'
  | 'exportProject' | 'exportProjectHint' | 'exportHlPdf' | 'exportHlPdfHint' | 'exportProjectPdf' | 'exportProjectPdfHint' | 'exportBoardMd' | 'exportBoardMdHint' | 'exportBoardPdfHint' | 'menuProjectAll' | 'menuHighlightsOnly' | 'theme' | 'themeText' | 'theme_system' | 'theme_light' | 'theme_dark' | 'exporting' | 'exported' | 'project' | 'openLibrary' | 'close';

export const uiStrings: Dict<K> = {
  ru: {
    inbox: 'Входящие', newProject: 'Новый проект', projectName: 'Название проекта', create: 'Создать', cancel: 'Отмена',
    save: 'Сохранить', delete: 'Удалить', rename: 'Переименовать', confirm: 'Подтвердить',
    export: 'Экспорт',
    exportMd: 'Markdown (.md)', exportMdHint: 'Один текстовый файл — для Obsidian, Notion, GitHub',
    exportZip: 'Markdown + картинки (.zip)', exportZipHint: 'Картинки скачиваются, работает офлайн',
    exportPdf: 'PDF', exportPdfHint: 'Для печати и чтения',
    exportFolder: 'Папка .md по главам (.zip)', exportFolderHint: 'Каждая глава — отдельный файл',
    exportAnki: 'Карточки для Anki (.txt)', exportAnkiHint: 'Хайлайт = вопрос, заметка = ответ. Импорт: Anki → Файл → Импорт',
    exportHlMd: 'Хайлайты в Markdown', exportHlMdHint: 'Только выделенное с заметками',
    theme: 'Тема', themeText: 'Оформление страниц расширения: библиотеки, окна, боковой панели и настроек.',
    theme_system: 'Как в браузере', theme_light: 'Светлая', theme_dark: 'Тёмная',
    exportHlPdf: 'Хайлайты в PDF', exportHlPdfHint: 'Только выделенное с заметками, для печати',
    menuProjectAll: 'Проект целиком', menuHighlightsOnly: 'Карточки из хайлайтов',
    exportProject: 'Весь проект — Markdown (.zip)', exportProjectHint: 'Заметки по папкам, папка highlights (файл на каждый хайлайт), доска, картинки. Открывается как хранилище Obsidian',
    exportProjectPdf: 'Весь проект — PDF (.zip)', exportProjectPdfHint: 'Каждая заметка отдельным PDF по папкам, папка highlights (PDF на каждый хайлайт), доска, оглавление. Большой проект собирается до минуты',
    exportBoardMd: 'Доска — Markdown (.md)', exportBoardMdHint: 'Колонки и карточки; формат плагина Obsidian Kanban',
    exportBoardPdfHint: 'Колонки рядом, альбомный лист',
    exporting: 'Готовлю файл…', exported: 'Готово', project: 'Проект', openLibrary: 'Открыть библиотеку', close: 'Закрыть',
  },
  en: {
    inbox: 'Inbox', newProject: 'New project', projectName: 'Project name', create: 'Create', cancel: 'Cancel',
    save: 'Save', delete: 'Delete', rename: 'Rename', confirm: 'Confirm',
    export: 'Export',
    exportMd: 'Markdown (.md)', exportMdHint: 'Single text file — for Obsidian, Notion, GitHub',
    exportZip: 'Markdown + images (.zip)', exportZipHint: 'Images downloaded, works offline',
    exportPdf: 'PDF', exportPdfHint: 'For printing and reading',
    exportFolder: 'Folder of .md per chapter (.zip)', exportFolderHint: 'One file per chapter',
    exportAnki: 'Anki flashcards (.txt)', exportAnkiHint: 'Highlight = question, note = answer. Anki → File → Import',
    exportHlMd: 'Highlights as Markdown', exportHlMdHint: 'Only highlighted text with notes',
    theme: 'Theme', themeText: 'Look of the extension pages: library, popup, sidebar and settings.',
    theme_system: 'Same as browser', theme_light: 'Light', theme_dark: 'Dark',
    exportHlPdf: 'Highlights as PDF', exportHlPdfHint: 'Only highlighted text with notes, for printing',
    menuProjectAll: 'Whole project', menuHighlightsOnly: 'Flashcards from highlights',
    exportProject: 'Whole project: Markdown (.zip)', exportProjectHint: 'Notes in their folders, a highlights folder (one file each), the board, images. Opens as an Obsidian vault',
    exportProjectPdf: 'Whole project: PDF (.zip)', exportProjectPdfHint: 'Every note as its own PDF in its folder, a highlights folder (one PDF each), the board, contents. A big project can take a minute',
    exportBoardMd: 'Board: Markdown (.md)', exportBoardMdHint: 'Columns and cards; Obsidian Kanban plugin format',
    exportBoardPdfHint: 'Columns side by side, landscape',
    exporting: 'Preparing file…', exported: 'Done', project: 'Project', openLibrary: 'Open library', close: 'Close',
  },
};

export const ut = translator(uiStrings);
