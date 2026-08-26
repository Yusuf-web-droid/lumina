import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  Bookmark,
  QuickLink,
  QuickLinkIcon,
  DownloadEntry,
  HistoryEntry,
  SidebarState,
  Suggestion
} from '@shared/types'
import { IPC } from '@shared/types'
import { siteIcon } from './siteIcon'
import type { BrowserWindow } from './window'

type Getter = () => BrowserWindow | null

/**
 * All IPC in one place.
 *
 * Every handler runs through `guard`, which drops any message that did not
 * come from the chrome view — web content must never be able to drive the
 * browser, even if a preload were somehow reachable from a page.
 */
export function registerIPC(getWindow: Getter): void {
  const guard =
    <A extends unknown[], R>(fn: (win: BrowserWindow, ...args: A) => R) =>
    (event: IpcMainInvokeEvent, ...args: A): R | undefined => {
      const win = getWindow()
      if (!win || !win.isChromeContents(event.sender)) return undefined
      return fn(win, ...args)
    }

  const handle = <A extends unknown[], R>(
    channel: string,
    fn: (win: BrowserWindow, ...args: A) => R
  ): void => {
    ipcMain.handle(channel, guard(fn) as (event: IpcMainInvokeEvent, ...args: A) => R | undefined)
  }

  /**
   * The side panel's icon rail is a second trusted renderer, so it gets its own
   * guard rather than being folded into `isChromeContents`. Channels registered
   * here are reachable from the rail only — never from the chrome, and never
   * from a panel tool or a page.
   */
  const handleRail = <A extends unknown[], R>(
    channel: string,
    fn: (win: BrowserWindow, ...args: A) => R
  ): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: A): R | undefined => {
      const win = getWindow()
      if (!win || !win.isRailContents(event.sender)) return undefined
      return fn(win, ...args)
    })
  }

  // ------------------------------------------------------------------- tabs
  handle(IPC.TabsCreate, (win, url?: string) => {
    win.tabManager.create(url)
  })
  handle(IPC.TabsClose, (win, id: number) => {
    win.tabManager.close(id)
  })
  handle(IPC.TabsActivate, (win, id: number) => {
    win.tabManager.activate(id)
  })
  handle(IPC.TabsReorder, (win, from: number, to: number) => {
    win.tabManager.reorder(from, to)
  })
  handle(IPC.TabsReopenClosed, (win) => {
    win.tabManager.reopenClosed()
  })

  // ------------------------------------------------------------- navigation
  handle(IPC.NavBack, (win) => win.tabManager.back())
  handle(IPC.NavForward, (win) => win.tabManager.forward())
  handle(IPC.NavReload, (win) => win.tabManager.reload())
  handle(IPC.NavStop, (win) => win.tabManager.stop())
  handle(IPC.NavHome, (win) => win.tabManager.home())
  handle(IPC.NavLoadURL, (win, input: string) => {
    win.tabManager.loadURL(input)
  })

  // ------------------------------------------------------------------- find
  handle(IPC.FindStart, (win, query: string) => win.find(query))
  handle(IPC.FindNext, (win, forward: boolean) => win.findNext(forward))
  handle(IPC.FindStop, (win) => win.stopFind())

  // ---------------------------------------------------------------- history
  handle(IPC.HistoryQuery, (win, prefix: string): Suggestion[] => win.historyStore.query(prefix))
  handle(IPC.HistoryList, (win): HistoryEntry[] => win.historyStore.list())
  handle(IPC.HistoryClear, (win) => win.historyStore.clear())

  // -------------------------------------------------------------- bookmarks
  handle(IPC.BookmarksList, (win): Bookmark[] => win.bookmarkStore.list())
  handle(IPC.BookmarksAdd, (win) => win.toggleBookmarkForActiveTab())
  handle(IPC.BookmarksRemove, (win, url: string) => {
    win.bookmarkStore.remove(url)
  })
  handle(IPC.BookmarksHas, (win, url: string): boolean => win.bookmarkStore.has(url))

  // -------------------------------------------------------------- downloads
  handle(IPC.DownloadsList, (win): DownloadEntry[] => win.downloadStore.list())
  handle(IPC.DownloadsReveal, (win, id: string) => {
    win.downloadStore.reveal(id)
  })
  handle(IPC.DownloadsCancel, (win, id: string) => {
    win.downloadStore.cancel(id)
  })
  handle(IPC.DownloadsClear, (win) => win.downloadStore.clear())

  // ------------------------------------------------------------ quick links
  handle(IPC.QuickLinksList, (win): QuickLink[] => win.quickLinkStore.list())
  handle(IPC.QuickLinksIcons, (_win, urls: string[]): Record<string, QuickLinkIcon> => {
    const icons: Record<string, QuickLinkIcon> = {}
    for (const url of urls) {
      // Inlined: the app chrome is not served the nexus:// scheme.
      const icon = siteIcon(url, true)
      if (icon) icons[url] = icon
    }
    return icons
  })
  handle(IPC.QuickLinksOpen, (win, url: string, newTab: boolean) => {
    win.openQuickLink(url, newTab)
  })
  handle(IPC.QuickLinksAdd, (win, url: string, name: string) => {
    win.quickLinkStore.add(url, name)
  })
  handle(IPC.QuickLinksRemove, (win, url: string) => {
    win.quickLinkStore.remove(url)
  })
  handle(IPC.QuickLinksReset, (win) => win.quickLinkStore.reset())

  // ---------------------------------------------------------------- sidebar
  handle(IPC.SidebarToggle, (win) => win.toggleSidebar())

  handleRail(IPC.SidebarToolsList, (win): SidebarState => win.sidebarState())
  handleRail(IPC.SidebarToolsSelect, (win, url: string) => win.selectSidebarTool(url))
  handleRail(IPC.SidebarToolsUnpin, (win, url: string) => win.unpinSidebarTool(url))
  handleRail(IPC.SidebarToolsPinCurrent, (win) => win.pinActiveTabAsTool())
  handleRail(IPC.SidebarReload, (win) => win.reloadSidebar())
  handleRail(IPC.SidebarClose, (win) => win.closeSidebar())

  // ------------------------------------------------------------------- zoom
  handle(IPC.ZoomIn, (win) => win.zoom('in'))
  handle(IPC.ZoomOut, (win) => win.zoom('out'))
  handle(IPC.ZoomReset, (win) => win.zoom('reset'))

  // ------------------------------------------------------------------ misc
  handle(IPC.PermissionRespond, (win, id: string, granted: boolean) => {
    win.permissionStore.respond(id, granted)
  })
  handle(IPC.ChromeHeightChanged, (win, height: number) => {
    win.setChromeHeight(height)
  })
}
