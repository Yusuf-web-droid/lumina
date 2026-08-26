/**
 * The contract between the main process and the chrome UI.
 * Imported by main, preload and renderer so the three can never drift.
 */

export interface TabState {
  id: number
  title: string
  url: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  crashed: boolean
}

/**
 * Main owns all tab state and broadcasts this whole snapshot on every change.
 * The renderer never mutates its own copy — it just paints whatever arrives.
 */
export interface BrowserSnapshot {
  tabs: TabState[]
  activeTabId: number | null
  /** Whether the assistant side panel is currently docked open. */
  sidebarOpen: boolean
}

export interface HistoryEntry {
  url: string
  title: string
  visitedAt: number
}

export interface QuickLink {
  name: string
  url: string
}

/**
 * How a quick link is shown: the site's own favicon where one has been
 * fetched, otherwise a bundled single-path brand glyph in a 24x24 viewBox.
 * Links with neither fall back to a letter tile.
 */
export type QuickLinkIcon =
  | { kind: 'image'; src: string }
  | { kind: 'glyph'; path: string; color: string }

/** A web app pinned to the side panel's icon rail. */
export interface SidebarTool {
  name: string
  url: string
}

/** A pinned tool as the rail paints it: identity, resolved icon, selection. */
export interface SidebarToolView extends SidebarTool {
  icon: QuickLinkIcon | null
  active: boolean
}

/** Why the rail's pin button is disabled, or null when it can be used. */
export type PinBlocked = 'pinned' | 'full' | 'unpinnable'

/** Everything the rail needs to repaint itself. */
export interface SidebarState {
  tools: SidebarToolView[]
  /** Whether the active tab can be pinned, and if not, why. */
  pinBlocked: PinBlocked | null
}

export interface Bookmark {
  url: string
  title: string
  addedAt: number
}

export type DownloadState = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadEntry {
  id: string
  filename: string
  url: string
  savePath: string
  state: DownloadState
  receivedBytes: number
  totalBytes: number
  startedAt: number
}

export interface FindResult {
  activeMatchOrdinal: number
  matches: number
}

export interface PermissionPrompt {
  id: string
  permission: string
  origin: string
}

/** A suggestion row under the address bar. */
export interface Suggestion {
  kind: 'history' | 'bookmark' | 'search'
  url: string
  title: string
}

export const IPC = {
  // renderer -> main (invoke)
  TabsCreate: 'tabs:create',
  TabsClose: 'tabs:close',
  TabsActivate: 'tabs:activate',
  TabsReorder: 'tabs:reorder',
  TabsReopenClosed: 'tabs:reopen-closed',

  NavBack: 'nav:back',
  NavForward: 'nav:forward',
  NavReload: 'nav:reload',
  NavStop: 'nav:stop',
  NavLoadURL: 'nav:load-url',
  NavHome: 'nav:home',

  FindStart: 'find:start',
  FindNext: 'find:next',
  FindStop: 'find:stop',

  HistoryQuery: 'history:query',
  HistoryList: 'history:list',
  HistoryClear: 'history:clear',

  BookmarksList: 'bookmarks:list',
  BookmarksAdd: 'bookmarks:add',
  BookmarksRemove: 'bookmarks:remove',
  BookmarksHas: 'bookmarks:has',

  DownloadsList: 'downloads:list',
  DownloadsReveal: 'downloads:reveal',
  DownloadsCancel: 'downloads:cancel',
  DownloadsClear: 'downloads:clear',

  QuickLinksList: 'quicklinks:list',
  QuickLinksIcons: 'quicklinks:icons',
  QuickLinksOpen: 'quicklinks:open',
  QuickLinksAdd: 'quicklinks:add',
  QuickLinksRemove: 'quicklinks:remove',
  QuickLinksReset: 'quicklinks:reset',

  SidebarToggle: 'sidebar:toggle',
  SidebarReload: 'sidebar:reload',

  // rail -> main (invoke)
  SidebarToolsList: 'sidebar:tools-list',
  SidebarToolsSelect: 'sidebar:tools-select',
  SidebarToolsPinCurrent: 'sidebar:tools-pin-current',
  SidebarToolsUnpin: 'sidebar:tools-unpin',
  SidebarClose: 'sidebar:close',

  ZoomIn: 'zoom:in',
  ZoomOut: 'zoom:out',
  ZoomReset: 'zoom:reset',

  PermissionRespond: 'permission:respond',
  ChromeHeightChanged: 'chrome:height-changed',

  // main -> renderer (send)
  OnSnapshot: 'on:snapshot',
  OnFindResult: 'on:find-result',
  OnDownloads: 'on:downloads',
  OnPermissionPrompt: 'on:permission-prompt',
  OnFocusAddressBar: 'on:focus-address-bar',
  OnToggleFind: 'on:toggle-find',
  OnToggleQuickLinks: 'on:toggle-quick-links',

  // main -> rail (send)
  OnSidebarTools: 'on:sidebar-tools'
} as const

/** The surface `contextBridge` exposes to the chrome UI as `window.nexus`. */
export interface NexusAPI {
  tabs: {
    create(url?: string): Promise<void>
    close(id: number): Promise<void>
    activate(id: number): Promise<void>
    reorder(fromIndex: number, toIndex: number): Promise<void>
    reopenClosed(): Promise<void>
  }
  nav: {
    back(): Promise<void>
    forward(): Promise<void>
    reload(): Promise<void>
    stop(): Promise<void>
    loadURL(input: string): Promise<void>
    home(): Promise<void>
  }
  find: {
    start(query: string): Promise<void>
    next(forward: boolean): Promise<void>
    stop(): Promise<void>
  }
  history: {
    query(prefix: string): Promise<Suggestion[]>
    list(): Promise<HistoryEntry[]>
    clear(): Promise<void>
  }
  bookmarks: {
    list(): Promise<Bookmark[]>
    add(): Promise<void>
    remove(url: string): Promise<void>
    has(url: string): Promise<boolean>
  }
  downloads: {
    list(): Promise<DownloadEntry[]>
    reveal(id: string): Promise<void>
    cancel(id: string): Promise<void>
    clear(): Promise<void>
  }
  quickLinks: {
    list(): Promise<QuickLink[]>
    /** Icons for the given links, keyed by URL. */
    icons(urls: string[]): Promise<Record<string, QuickLinkIcon>>
    open(url: string, newTab: boolean): Promise<void>
    add(url: string, name: string): Promise<void>
    remove(url: string): Promise<void>
    reset(): Promise<void>
  }
  sidebar: {
    toggle(): Promise<void>
  }
  zoom: {
    in(): Promise<void>
    out(): Promise<void>
    reset(): Promise<void>
  }
  respondToPermission(id: string, granted: boolean): Promise<void>
  setChromeHeight(height: number): Promise<void>

  onSnapshot(cb: (s: BrowserSnapshot) => void): void
  onFindResult(cb: (r: FindResult) => void): void
  onDownloads(cb: (d: DownloadEntry[]) => void): void
  onPermissionPrompt(cb: (p: PermissionPrompt) => void): void
  onFocusAddressBar(cb: () => void): void
  onToggleFind(cb: () => void): void
  onToggleQuickLinks(cb: () => void): void
}

/**
 * The much smaller surface exposed to the side panel's icon rail as
 * `window.nexusRail`. Kept separate from NexusAPI so the rail — a second
 * renderer — cannot reach tab, history or download control.
 */
export interface NexusRailAPI {
  list(): Promise<SidebarState>
  select(url: string): Promise<void>
  unpin(url: string): Promise<void>
  pinCurrent(): Promise<void>
  reload(): Promise<void>
  close(): Promise<void>
  onState(cb: (s: SidebarState) => void): void
}
