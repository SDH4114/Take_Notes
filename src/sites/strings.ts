import { translator, type Dict } from '@/src/core/i18n';

type K =
  | 'disabledHere' | 'disabledGlobal' | 'enabled' | 'enabledHint' | 'thisSite' | 'blockSite' | 'unblockSite'
  | 'blockedNotice' | 'offNotice' | 'turnOn' | 'optTitle' | 'optText' | 'blockedList' | 'blockedEmpty'
  | 'addPlaceholder' | 'add' | 'remove' | 'invalidSite' | 'alreadyBlocked';

export const dict: Dict<K> = {
  ru: {
    disabledHere: 'TakeNotes отключён на этом сайте. Включить можно в окне расширения или в настройках.',
    disabledGlobal: 'TakeNotes выключен. Включить можно в окне расширения или в настройках.',
    enabled: 'Расширение включено',
    enabledHint: 'Если выключить, на сайтах не будет панели выделения, хайлайтов, пунктов меню и горячих клавиш. Библиотека продолжит работать.',
    thisSite: 'Этот сайт',
    blockSite: 'Отключить на этом сайте',
    unblockSite: 'Включить на этом сайте',
    blockedNotice: 'На {site} TakeNotes отключён.',
    offNotice: 'TakeNotes выключен на всех сайтах.',
    turnOn: 'Включить',
    optTitle: 'Сайты',
    optText: 'На отключённых сайтах (и их поддоменах) TakeNotes ничего не делает: нет панели выделения, хайлайты не показываются, сохранение недоступно.',
    blockedList: 'Отключённые сайты',
    blockedEmpty: 'Список пуст — TakeNotes работает везде.',
    addPlaceholder: 'example.com или ссылка',
    add: 'Добавить',
    remove: 'Убрать',
    invalidSite: 'Не похоже на адрес сайта',
    alreadyBlocked: 'Этот сайт уже в списке',
  },
  en: {
    disabledHere: 'TakeNotes is disabled on this site. Turn it back on in the extension popup or in Settings.',
    disabledGlobal: 'TakeNotes is turned off. Turn it on in the extension popup or in Settings.',
    enabled: 'Extension enabled',
    enabledHint: 'When off, sites get no selection bar, highlights, menu items or hotkeys. The Library keeps working.',
    thisSite: 'This site',
    blockSite: 'Disable on this site',
    unblockSite: 'Enable on this site',
    blockedNotice: 'TakeNotes is disabled on {site}.',
    offNotice: 'TakeNotes is turned off on all sites.',
    turnOn: 'Turn on',
    optTitle: 'Sites',
    optText: 'On disabled sites (and their subdomains) TakeNotes does nothing: no selection bar, highlights are not shown, saving is unavailable.',
    blockedList: 'Disabled sites',
    blockedEmpty: 'The list is empty: TakeNotes works everywhere.',
    addPlaceholder: 'example.com or a link',
    add: 'Add',
    remove: 'Remove',
    invalidSite: 'This does not look like a site address',
    alreadyBlocked: 'This site is already in the list',
  },
};

export const t = translator(dict);
