import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  BlockingDetails,
  Bookmark,
  QuickLink,
  QuickLinkIcon,
  BrowserSnapshot,
  DownloadEntry,
  FindResult,
  HistoryEntry,
  LuminaAPI,
  PermissionPrompt,
  Suggestion
} from '@shared/types'
import { IPC } from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const on = <T>(channel: string, cb: (payload: T) => void): void => {
  ipcRenderer.on(channel, (_event: IpcRendererEvent, payload: T) => cb(payload))
}

/**
 * The entire surface the chrome UI can reach. Note there is no generic
 * "send(channel, ...)" escape hatch — every capability is named explicitly.
 */
const api: LuminaAPI = {
  tabs: {
    create: (url) => invoke<void>(IPC.TabsCreate, url),
    close: (id) => invoke<void>(IPC.TabsClose, id),
    activate: (id) => invoke<void>(IPC.TabsActivate, id),
    reorder: (from, to) => invoke<void>(IPC.TabsReorder, from, to),
    reopenClosed: () => invoke<void>(IPC.TabsReopenClosed)
  },
  nav: {
    back: () => invoke<void>(IPC.NavBack),
    forward: () => invoke<void>(IPC.NavForward),
    reload: () => invoke<void>(IPC.NavReload),
    stop: () => invoke<void>(IPC.NavStop),
    loadURL: (input) => invoke<void>(IPC.NavLoadURL, input),
    home: () => invoke<void>(IPC.NavHome)
  },
  find: {
    start: (query) => invoke<void>(IPC.FindStart, query),
    next: (forward) => invoke<void>(IPC.FindNext, forward),
    stop: () => invoke<void>(IPC.FindStop)
  },
  history: {
    query: (prefix) => invoke<Suggestion[]>(IPC.HistoryQuery, prefix),
    list: () => invoke<HistoryEntry[]>(IPC.HistoryList),
    clear: () => invoke<void>(IPC.HistoryClear)
  },
  bookmarks: {
    list: () => invoke<Bookmark[]>(IPC.BookmarksList),
    add: () => invoke<void>(IPC.BookmarksAdd),
    remove: (url) => invoke<void>(IPC.BookmarksRemove, url),
    has: (url) => invoke<boolean>(IPC.BookmarksHas, url)
  },
  blocking: {
    details: () => invoke<BlockingDetails>(IPC.BlockingDetails),
    toggleSite: () => invoke<void>(IPC.BlockingToggleSite)
  },
  downloads: {
    list: () => invoke<DownloadEntry[]>(IPC.DownloadsList),
    reveal: (id) => invoke<void>(IPC.DownloadsReveal, id),
    cancel: (id) => invoke<void>(IPC.DownloadsCancel, id),
    clear: () => invoke<void>(IPC.DownloadsClear)
  },
  quickLinks: {
    list: () => invoke<QuickLink[]>(IPC.QuickLinksList),
    icons: (urls) => invoke<Record<string, QuickLinkIcon>>(IPC.QuickLinksIcons, urls),
    open: (url, newTab) => invoke<void>(IPC.QuickLinksOpen, url, newTab),
    add: (url, name) => invoke<void>(IPC.QuickLinksAdd, url, name),
    remove: (url) => invoke<void>(IPC.QuickLinksRemove, url),
    reset: () => invoke<void>(IPC.QuickLinksReset)
  },
  sidebar: {
    toggle: () => invoke<void>(IPC.SidebarToggle)
  },
  zoom: {
    in: () => invoke<void>(IPC.ZoomIn),
    out: () => invoke<void>(IPC.ZoomOut),
    reset: () => invoke<void>(IPC.ZoomReset)
  },
  respondToPermission: (id, granted) => invoke<void>(IPC.PermissionRespond, id, granted),
  setChromeHeight: (height) => invoke<void>(IPC.ChromeHeightChanged, height),

  onSnapshot: (cb) => on<BrowserSnapshot>(IPC.OnSnapshot, cb),
  onFindResult: (cb) => on<FindResult>(IPC.OnFindResult, cb),
  onDownloads: (cb) => on<DownloadEntry[]>(IPC.OnDownloads, cb),
  onPermissionPrompt: (cb) => on<PermissionPrompt>(IPC.OnPermissionPrompt, cb),
  onFocusAddressBar: (cb) => on<null>(IPC.OnFocusAddressBar, () => cb()),
  onToggleFind: (cb) => on<null>(IPC.OnToggleFind, () => cb()),
  onToggleQuickLinks: (cb) => on<null>(IPC.OnToggleQuickLinks, () => cb())
}

contextBridge.exposeInMainWorld('lumina', api)
