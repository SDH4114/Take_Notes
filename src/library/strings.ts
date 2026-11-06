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
  | 'bookChapters' | 'newNoteTitle' | 'clipDeleted' | 'openNote' | 'noNoteForHl' | 'hlNotInNote'
  | 'tags' | 'addTags' | 'graph' | 'board' | 'graphProject' | 'graphAll' | 'graphTags' | 'graphHint' | 'graphReset'
  | 'graphEmpty' | 'graphEmptyText' | 'linkNotFound' | 'colTodo' | 'colDoing' | 'colDone' | 'newColumn' | 'columnName'
  | 'renameColumn' | 'deleteColumn' | 'deleteColumnMsg' | 'dropHere'
  | 'newCard' | 'addCard' | 'cardTitle' | 'cardText' | 'deleteCard'
  | 'hlShortNote' | 'hlShortPlaceholder' | 'hlLongNote' | 'hlLongHint' | 'hlLongEmpty'
  | 'folders' | 'newFolder' | 'folderName' | 'noFolder' | 'renameFolder' | 'deleteFolder' | 'deleteFolderMsg'
  | 'moveToFolder' | 'folderExists' | 'movedToFolder' | 'emptyFolder' | 'exportBoard' | 'exportProjectBtn'
  | 'markDone' | 'markUndone' | 'doneColumnOn' | 'doneColumnSet' | 'collectDone';

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
    openNote: 'Открыть заметку', noNoteForHl: 'Страница этого хайлайта не сохранена как заметка.',
    hlNotInNote: 'Текст хайлайта не найден в заметке (возможно, его отредактировали).',
    tags: 'Теги', addTags: 'Добавить теги…',
    graph: 'Граф', board: 'Доска', graphProject: 'Этот проект', graphAll: 'Все проекты', graphTags: 'Теги',
    graphHint: 'Колесо — масштаб, перетаскивание — сдвиг, клик — открыть',
    graphReset: 'Сбросить вид',
    graphEmpty: 'Пока нечего показать',
    graphEmptyText: 'Связи появляются из ссылок [[Название заметки]] в тексте и общих тегов (#тег или поле «Теги»).',
    linkNotFound: 'Заметка «{title}» не найдена',
    colTodo: 'Прочитать', colDoing: 'В работе', colDone: 'Готово',
    newColumn: 'Новая колонка', columnName: 'Название колонки', renameColumn: 'Переименовать колонку',
    deleteColumn: 'Удалить колонку «{name}»?', deleteColumnMsg: 'Карточки ({n}) перейдут в «{to}».',
    dropHere: 'Перетащите сюда заметку',
    hlShortNote: 'Короткая заметка', hlShortPlaceholder: 'Видна на сайте рядом с выделением',
    hlLongNote: 'Большая заметка', hlLongHint: 'Markdown, видна только в расширении и в экспорте',
    hlLongEmpty: 'Пусто. Дважды щёлкните или выберите «Правка», чтобы написать.',
    folders: 'Папки', newFolder: 'Новая папка', folderName: 'Название папки', noFolder: 'Без папки',
    renameFolder: 'Переименовать папку', deleteFolder: 'Удалить папку «{name}»?',
    deleteFolderMsg: 'Заметки ({n}) не удалятся — они останутся в проекте без папки.',
    moveToFolder: 'Переместить в папку', folderExists: 'Такая папка уже есть', movedToFolder: 'Перемещено в «{name}»',
    emptyFolder: 'Пустая папка — перетащите сюда заметку', exportBoard: 'Скачать доску', exportProjectBtn: 'Скачать проект',
    markDone: 'Выполнено', markUndone: 'Вернуть в работу',
    doneColumnOn: 'Сюда попадают выполненные карточки', doneColumnSet: 'Собирать выполненные в этой колонке',
    collectDone: 'Сюда собираются выполненные карточки',
    newCard: 'Добавить карточку', addCard: 'Добавить', cardTitle: 'Название карточки',
    cardText: 'Текст (необязательно). Ctrl/⌘+Enter — добавить', deleteCard: 'Удалить карточку',
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
    openNote: 'Open note', noNoteForHl: 'The page of this highlight is not saved as a note.',
    hlNotInNote: 'The highlighted text was not found in the note (it may have been edited).',
    tags: 'Tags', addTags: 'Add tags…',
    graph: 'Graph', board: 'Board', graphProject: 'This project', graphAll: 'All projects', graphTags: 'Tags',
    graphHint: 'Wheel: zoom, drag: pan, click: open',
    graphReset: 'Reset view',
    graphEmpty: 'Nothing to show yet',
    graphEmptyText: 'Links come from [[Note title]] in the text and shared tags (#tag or the Tags field).',
    linkNotFound: 'Note "{title}" not found',
    colTodo: 'To read', colDoing: 'In progress', colDone: 'Done',
    newColumn: 'New column', columnName: 'Column name', renameColumn: 'Rename column',
    deleteColumn: 'Delete column "{name}"?', deleteColumnMsg: '{n} card(s) will move to "{to}".',
    dropHere: 'Drop a note here',
    hlShortNote: 'Short note', hlShortPlaceholder: 'Shown on the site next to the highlight',
    hlLongNote: 'Long note', hlLongHint: 'Markdown, only in the extension and in exports',
    hlLongEmpty: 'Empty. Double-click or choose Edit to write.',
    folders: 'Folders', newFolder: 'New folder', folderName: 'Folder name', noFolder: 'No folder',
    renameFolder: 'Rename folder', deleteFolder: 'Delete folder "{name}"?',
    deleteFolderMsg: '{n} note(s) are kept: they stay in the project without a folder.',
    moveToFolder: 'Move to folder', folderExists: 'This folder already exists', movedToFolder: 'Moved to "{name}"',
    emptyFolder: 'Empty folder: drop a note here', exportBoard: 'Download board', exportProjectBtn: 'Download project',
    markDone: 'Mark as done', markUndone: 'Mark as not done',
    doneColumnOn: 'Completed cards go here', doneColumnSet: 'Collect completed cards in this column',
    collectDone: 'Collect completed cards here',
    newCard: 'Add a card', addCard: 'Add', cardTitle: 'Card title',
    cardText: 'Text (optional). Ctrl/⌘+Enter to add', deleteCard: 'Delete card',
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
