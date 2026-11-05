import { translator, type Dict } from '@/src/core/i18n';

type K =
  | 'inbox' | 'newProject' | 'projectName' | 'create' | 'cancel' | 'save' | 'delete' | 'rename' | 'confirm'
  | 'export' | 'exportMd' | 'exportMdHint' | 'exportZip' | 'exportZipHint' | 'exportPdf' | 'exportPdfHint'
  | 'exportFolder' | 'exportFolderHint' | 'exportAnki' | 'exportAnkiHint' | 'exportHlMd' | 'exportHlMdHint'
  | 'exporting' | 'exported' | 'project' | 'openLibrary' | 'close';

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
    exporting: 'Preparing file…', exported: 'Done', project: 'Project', openLibrary: 'Open library', close: 'Close',
  },
};

export const ut = translator(uiStrings);
