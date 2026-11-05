import { translator, type Dict } from '@/src/core/i18n';

type K =
  | 'search' | 'projects' | 'books' | 'settings' | 'newNote' | 'notes' | 'highlights' | 'untitled'
  | 'renameProject' | 'deleteProject' | 'deleteProjectMsg' | 'deleteClip' | 'deleteClipMsg' | 'deleteHighlight'
  | 'deleteHighlightMsg' | 'deleteBook' | 'deleteBookMsg' | 'openSource' | 'moveTo' | 'moved'
  | 'emptyClips' | 'emptyClipsText' | 'emptySearch' | 'emptySearchText' | 'emptyHighlights' | 'emptyHighlightsText'
  | 'pickClip' | 'pickClipText' | 'pickHighlight' | 'modeView' | 'modeEdit' | 'modeSplit' | 'myNote' | 'notePlaceholder'
  | 'titlePlaceholder' | 'saved' | 'saving' | 'saveFailed' | 'kindPage' | 'kindSelection' | 'kindTranscript'
  | 'kindChapter' | 'kindNote' | 'goToSpot' | 'chapters' | 'noBooks' | 'noBooksText' | 'pickBook' | 'pickChapter'
  | 'loading' | 'editHint' | 'emptyNoteBody' | 'noteInHighlight' | 'color'
  | 'bookChapters' | 'newNoteTitle' | 'clipDeleted';

export const libraryStrings: Dict<K> = {
  ru: {
    search: 'Поиск…', projects: 'Проекты', books: 'Книги', settings: 'Настройки', newNote: 'Новая заметка',
    notes: 'Заметки', highlights: 'Хайлайты', untitled: 'Без названия',
    renameProject: 'Переименовать проект', deleteProject: 'Удалить проект «{name}»?',
    deleteProjectMsg: 'Заметки проекта ({n}) будут удалены. Хайлайты останутся во Входящих.',
    deleteClip: 'Удалить заметку?', deleteClipMsg: '«{title}» будет удалена без возможности восстановления.',
    deleteHighlight: 'Удалить хайлайт?', deleteHighlightMsg: 'Выделение исчезнет и на странице.',
    deleteBook: 'Удалить книгу?', deleteBookMsg: '«{title}» будет удалена со всеми главами.',
    openSource: 'Открыть источник', moveTo: 'Переместить в проект', moved: 'Перемещено: {name}',
    emptyClips: 'Здесь пока пусто',
    emptyClipsText: 'Выделите текст на сайте и нажмите Alt+Shift+S — фрагмент появится здесь. Или создайте заметку вручную.',
    emptySearch: 'Ничего не найдено', emptySearchText: 'Попробуйте другой запрос.',
    emptyHighlights: 'Хайлайтов пока нет',
    emptyHighlightsText: 'Выделите текст на сайте и выберите цвет маркера — выделение сохранится и появится здесь.',
    pickClip: 'Выберите заметку', pickClipText: 'Откройте её из списка слева или создайте новую.',
    pickHighlight: 'Выберите хайлайт',
    modeView: 'Просмотр', modeEdit: 'Редактор', modeSplit: 'Рядом',
    myNote: 'Моя заметка', notePlaceholder: 'Мысли, вопросы, к чему это относится…', titlePlaceholder: 'Заголовок',
    saved: 'Сохранено', saving: 'Сохраняю…', saveFailed: 'Не удалось сохранить',
    kindPage: 'Страница', kindSelection: 'Фрагмент', kindTranscript: 'Транскрипт', kindChapter: 'Глава', kindNote: 'Заметка',
    goToSpot: 'Перейти к месту', chapters: 'Главы', noBooks: 'Книг пока нет',
    noBooksText: 'Соберите раздел документации в одну книгу на странице краулера.',
    pickBook: 'Выберите книгу', pickChapter: 'Выберите главу', loading: 'Загрузка…',
    editHint: 'Дважды щёлкните, чтобы редактировать', emptyNoteBody: 'Пока пусто. Дважды щёлкните, чтобы писать.',
    noteInHighlight: 'Заметка к хайлайту', color: 'Цвет', bookChapters: 'глав: {n}', newNoteTitle: 'Новая заметка', clipDeleted: 'Заметка удалена',
  },
  en: {
    search: 'Search…', projects: 'Projects', books: 'Books', settings: 'Settings', newNote: 'New note',
    notes: 'Notes', highlights: 'Highlights', untitled: 'Untitled',
    renameProject: 'Rename project', deleteProject: 'Delete project "{name}"?',
    deleteProjectMsg: 'The project notes ({n}) will be deleted. Highlights stay in Inbox.',
    deleteClip: 'Delete note?', deleteClipMsg: '"{title}" will be deleted permanently.',
    deleteHighlight: 'Delete highlight?', deleteHighlightMsg: 'The highlight will disappear from the page too.',
    deleteBook: 'Delete book?', deleteBookMsg: '"{title}" will be deleted with all chapters.',
    openSource: 'Open source', moveTo: 'Move to project', moved: 'Moved to {name}',
    emptyClips: 'Nothing here yet',
    emptyClipsText: 'Select text on a site and press Alt+Shift+S — the clip shows up here. Or create a note by hand.',
    emptySearch: 'Nothing found', emptySearchText: 'Try a different query.',
    emptyHighlights: 'No highlights yet',
    emptyHighlightsText: 'Select text on a site and pick a marker color — the highlight is saved and shows up here.',
    pickClip: 'Select a note', pickClipText: 'Open one from the list or create a new one.',
    pickHighlight: 'Select a highlight',
    modeView: 'Read', modeEdit: 'Edit', modeSplit: 'Split',
    myNote: 'My note', notePlaceholder: 'Thoughts, questions, what this relates to…', titlePlaceholder: 'Title',
    saved: 'Saved', saving: 'Saving…', saveFailed: 'Could not save',
    kindPage: 'Page', kindSelection: 'Excerpt', kindTranscript: 'Transcript', kindChapter: 'Chapter', kindNote: 'Note',
    goToSpot: 'Go to location', chapters: 'Chapters', noBooks: 'No books yet',
    noBooksText: 'Collect a documentation section into one book on the crawler page.',
    pickBook: 'Select a book', pickChapter: 'Select a chapter', loading: 'Loading…',
    editHint: 'Double-click to edit', emptyNoteBody: 'Empty so far. Double-click to start writing.',
    noteInHighlight: 'Highlight note', color: 'Color', bookChapters: '{n} chapters', newNoteTitle: 'New note', clipDeleted: 'Note deleted',
  },
};

export const lt = translator(libraryStrings);
