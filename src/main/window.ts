import {
  BaseWindow,
  WebContentsView,
  nativeTheme,
  type BaseWindowConstructorOptions,
  type Rectangle,
  type WebContents
} from 'electron'
import { join } from 'node:path'
import type {
  BlockingDetails,
  BrowserSnapshot,
  DownloadEntry,
  FindResult,
  PermissionPrompt,
  SidebarState
} from '@shared/types'
import { IPC } from '@shared/types'
import { Bookmarks } from './bookmarks'
import { attachContextMenu } from './contextMenu'
import { blockerStore } from './blocker'
import { Downloads } from './downloads'
import { faviconStore } from './favicons'
import { KeepAwake } from './gaming'
import { rebuildMenu } from './menu'
import { History } from './history'
import { Permissions } from './permissions'
import { QuickLinks, quickLinksStore } from './quickLinks'
import { runSmokeCapture } from './smoke'
import { Sidebar } from './sidebar'
import { JSONStore } from './store'
import { TabManager } from './tabs'
import { themeStore } from './theme'
import { weatherStore } from './weather'

/** Tab strip (40) + toolbar (44). The page always starts below this line. */
export const BASE_CHROME_HEIGHT = 84

export const HOME_URL = 'lumina://home'

const MIN_ZOOM = -3
const MAX_ZOOM = 5

interface SessionData {
  urls: string[]
  bounds: { width: number; height: number; x?: number; y?: number }
}

/**
 * One browser window: a chrome view painted over a stack of tab views.
 *
 * The chrome view floats *above* the page rather than displacing it, so
 * transient UI (suggestions, find bar, downloads popover) can expand over the
 * page without forcing the page to reflow. Its background is transparent, and
 * it only grows past BASE_CHROME_HEIGHT while such UI is open.
 */
/**
 * macOS hides the title bar but keeps its traffic lights, which the tab strip
 * insets for. Windows and Linux have no such lights: without an overlay a
 * frameless window has no close, minimise or maximise button at all, so they
 * get the native overlay drawn over the strip's right end instead.
 */
function titleBarOptions(): Partial<BaseWindowConstructorOptions> {
  if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset' }
  const dark = nativeTheme.shouldUseDarkColors
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: dark ? '#1f1f22' : '#e8e8ea',
      symbolColor: dark ? '#ececf0' : '#1c1c1e',
      // Matches --tabstrip-h, so the buttons sit level with the tabs.
      height: 40
    }
  }
}

export class BrowserWindow {
  readonly window: BaseWindow
  private readonly chromeView: WebContentsView
  private readonly tabs: TabManager
  private readonly history = new History()
  private readonly bookmarks = new Bookmarks()
  private readonly quickLinks: QuickLinks = quickLinksStore()
  private readonly downloads: Downloads
  private readonly permissions: Permissions
  private readonly sessionStore: JSONStore<SessionData>
  private readonly sidebar: Sidebar
  private chromeHeight = BASE_CHROME_HEIGHT
  private gaming = false
  private readonly keepAwake = new KeepAwake()
  /** What to put back on the way out. Null whenever gaming mode is off. */
  private gamingRestore: { sidebarOpen: boolean; wasFullScreen: boolean } | null = null
  /** Last URL the rail was told about, so it is not repainted needlessly. */
  private lastRailURL: string | null = null
  private disposed = false

  constructor() {
    this.sessionStore = new JSONStore<SessionData>('session.json', {
      urls: [],
      bounds: { width: 1280, height: 860 }
    })
    const saved = this.sessionStore.get()

    this.window = new BaseWindow({
      width: saved.bounds.width,
      height: saved.bounds.height,
      ...(saved.bounds.x !== undefined && saved.bounds.y !== undefined
        ? { x: saved.bounds.x, y: saved.bounds.y }
        : {}),
      minWidth: 560,
      minHeight: 400,
      title: 'Lumina',
      ...titleBarOptions(),
      backgroundColor: '#f6f6f7',
      show: false
    })

    this.chromeView = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/chrome.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    // Transparent so the page shows through wherever the chrome UI does not paint.
    this.chromeView.setBackgroundColor('#00000000')
    this.window.contentView.addChildView(this.chromeView)

    this.tabs = new TabManager(this.window, {
      onChange: () => this.broadcastSnapshot(),
      onNavigated: (url, title) => this.history.record(url, title),
      onTitleUpdated: (url, title) => this.history.updateTitle(url, title),
      contentBounds: () => this.contentBounds(),
      onTabCreated: (wc) => this.decorateTab(wc),
      blockState: (id) => blockerStore().stateFor(id),
      homeURL: HOME_URL
    })

    // The blocker repaints the shield when a burst of requests is cancelled.
    blockerStore().setOnChange(() => this.broadcastSnapshot())
    blockerStore().attach()

    this.sidebar = new Sidebar(this.window, () => {
      this.layout()
      this.broadcastSnapshot()
    })
    this.sidebar.openInTab = (url) => this.tabs.create(url)
    this.sidebar.currentTabURL = () => this.tabs.activeWebContents()?.getURL() ?? null

    this.downloads = new Downloads((list) => this.send<DownloadEntry[]>(IPC.OnDownloads, list))
    this.permissions = new Permissions((p) => this.send<PermissionPrompt>(IPC.OnPermissionPrompt, p))
    this.downloads.attach()
    this.permissions.attach()

    this.loadChrome()
    this.window.on('resize', () => this.layout())
    this.window.on('enter-full-screen', () => this.layout())
    this.window.on('leave-full-screen', () => {
      // Esc, the green button, Mission Control — however the user got out of
      // fullscreen, they are asking for the browser back. Without this they
      // would be left in a window with no toolbar and no tab strip.
      if (this.gaming) this.setGamingMode(false)
      else this.layout()
    })
    this.window.on('close', () => this.persistSession())
    this.window.on('closed', () => this.dispose())

    this.chromeView.webContents.once('did-finish-load', () => {
      this.restoreTabs(saved.urls)
      this.layout()
      this.window.show()
      this.broadcastSnapshot()
      this.send<DownloadEntry[]>(IPC.OnDownloads, this.downloads.list())

      const smokeDir = process.env['LUMINA_SMOKE_CAPTURE']
      if (smokeDir) this.scheduleSmokeCapture(smokeDir)
    })
  }

  private loadChrome(): void {
    const devURL = process.env['ELECTRON_RENDERER_URL']
    if (devURL) {
      void this.chromeView.webContents.loadURL(devURL)
    } else {
      void this.chromeView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  private restoreTabs(urls: string[]): void {
    if (urls.length === 0) {
      this.tabs.create(HOME_URL)
      return
    }
    urls.forEach((url, i) => this.tabs.create(url, { activate: i === 0 }))
  }

  /** Per-tab setup that needs main-process collaborators. */
  private decorateTab(wc: WebContents): void {
    attachContextMenu(wc, () => this.tabs)
    blockerStore().watch(wc)
    wc.on('found-in-page', (_e, result) => {
      this.send<FindResult>(IPC.OnFindResult, {
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches
      })
    })
  }

  // ------------------------------------------------------------------- layout

  /**
   * Height reserved for the chrome at the top of the window. Zero in gaming
   * mode, where the page owns every pixel.
   */
  private topInset(): number {
    return this.gaming ? 0 : BASE_CHROME_HEIGHT
  }

  /** The page rect. Fixed to below the base chrome, independent of overlays. */
  private contentBounds(): Rectangle {
    const { width, height } = this.window.getContentBounds()
    const top = this.topInset()
    return {
      x: 0,
      y: top,
      // The page yields horizontal space to the panel rather than being covered.
      width: Math.max(0, width - this.sidebar.currentWidth()),
      height: Math.max(0, height - top)
    }
  }

  /** The only place view bounds are assigned. Called from every resize event. */
  private layout(): void {
    const { width, height } = this.window.getContentBounds()
    const top = this.topInset()
    this.chromeView.setBounds({
      x: 0,
      y: 0,
      width,
      height: Math.min(height, Math.max(BASE_CHROME_HEIGHT, this.chromeHeight))
    })
    const sidebarWidth = this.sidebar.currentWidth()
    if (sidebarWidth > 0) {
      this.sidebar.setBounds({
        x: Math.max(0, width - sidebarWidth),
        y: top,
        width: sidebarWidth,
        height: Math.max(0, height - top)
      })
    }
    this.tabs.layout()
  }

  /** The chrome UI reports how tall it currently needs to be. */
  setChromeHeight(height: number): void {
    this.chromeHeight = Math.max(BASE_CHROME_HEIGHT, Math.round(height))
    this.layout()
  }

  // -------------------------------------------------------------- persistence

  private persistSession(): void {
    if (this.disposed) return
    const bounds = this.window.getBounds()
    this.sessionStore.update((d) => {
      d.urls = this.tabs.openURLs()
      d.bounds = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y }
    })
    this.sessionStore.flush()
    this.history.flush()
    this.bookmarks.flush()
    this.quickLinks.flush()
    this.sidebar.flush()
    faviconStore().flush()
    weatherStore().flush()
    themeStore().flush()
    blockerStore().flush()
  }

  // ------------------------------------------------------------------ plumbing

  private send<T>(channel: string, payload: T): void {
    const wc = this.chromeView.webContents
    if (!wc.isDestroyed()) wc.send(channel, payload)
  }

  private broadcastSnapshot(): void {
    this.send<BrowserSnapshot>(IPC.OnSnapshot, {
      ...this.tabs.snapshot(),
      sidebarOpen: this.sidebar.isOpen()
    })

    // The rail only cares which URL is in front, so repaint it on a real
    // change rather than on every title and progress tick.
    const url = this.tabs.activeWebContents()?.getURL() ?? null
    if (url !== this.lastRailURL) {
      this.lastRailURL = url
      this.sidebar.broadcast()
    }
  }

  // -------------------------------------------------------------------- facade

  get tabManager(): TabManager {
    return this.tabs
  }

  get historyStore(): History {
    return this.history
  }

  get quickLinkStore(): QuickLinks {
    return this.quickLinks
  }

  /** Speed-dial click: navigate the current tab, or open a new one. */
  openQuickLink(url: string, newTab: boolean): void {
    if (newTab) this.tabs.create(url)
    else this.tabs.loadURL(url)
  }

  get bookmarkStore(): Bookmarks {
    return this.bookmarks
  }

  get downloadStore(): Downloads {
    return this.downloads
  }

  get permissionStore(): Permissions {
    return this.permissions
  }

  isChromeContents(wc: WebContents): boolean {
    return wc === this.chromeView.webContents
  }

  focusAddressBar(): void {
    this.send(IPC.OnFocusAddressBar, null)
  }

  focusQuickLinks(): void {
    this.send(IPC.OnToggleQuickLinks, null)
  }

  toggleFind(): void {
    this.send(IPC.OnToggleFind, null)
  }

  /** Bookmark star: toggles the active tab's URL and repaints the chrome. */
  toggleBookmarkForActiveTab(): void {
    const wc = this.tabs.activeWebContents()
    if (!wc) return
    this.bookmarks.toggle(wc.getURL(), wc.getTitle())
    this.broadcastSnapshot()
  }

  blockingDetails(): BlockingDetails {
    const wc = this.tabs.activeWebContents()
    if (!wc) {
      return { site: null, blocking: false, reason: 'not-web', blocked: 0, owners: [] }
    }
    return blockerStore().detailsFor(wc.id)
  }

  /**
   * Flip blocking for the site the active tab is on.
   *
   * The reload is not cosmetic. onBeforeRequest only sees requests as they are
   * made, so turning blocking off leaves the page exactly as broken as it was,
   * and turning it on leaves already-executed trackers running. Reloading also
   * drives did-start-navigation, which zeroes the counter for free.
   */
  toggleBlockingForActiveTab(): void {
    const wc = this.tabs.activeWebContents()
    if (!wc) return
    if (!blockerStore().toggleSite(wc.getURL())) return
    wc.reload()
  }

  find(query: string): void {
    const wc = this.tabs.activeWebContents()
    if (!wc || !query) return
    wc.findInPage(query)
  }

  findNext(forward: boolean): void {
    const wc = this.tabs.activeWebContents()
    if (!wc) return
    wc.findInPage('', { findNext: true, forward })
  }

  stopFind(): void {
    this.tabs.activeWebContents()?.stopFindInPage('clearSelection')
  }

  zoom(direction: 'in' | 'out' | 'reset'): void {
    const wc = this.tabs.activeWebContents()
    if (!wc) return
    if (direction === 'reset') {
      wc.setZoomLevel(0)
      return
    }
    const next = wc.getZoomLevel() + (direction === 'in' ? 0.5 : -0.5)
    wc.setZoomLevel(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)))
  }

  // ------------------------------------------------------------ gaming mode

  isGamingMode(): boolean {
    return this.gaming
  }

  toggleGamingMode(): void {
    this.setGamingMode(!this.gaming)
  }

  /**
   * Hand the whole window to the game: no tab strip, no toolbar, no panel,
   * fullscreen, the display kept awake and background throttling off.
   *
   * The way out is deliberately findable without any browser UI on screen —
   * the menu bar (View → Gaming Mode, or its shortcut) still works, and
   * leaving fullscreen by any route drops the mode too.
   */
  setGamingMode(on: boolean): void {
    if (on === this.gaming) return
    this.gaming = on

    if (on) {
      this.gamingRestore = {
        sidebarOpen: this.sidebar.isOpen(),
        // Someone already in fullscreen should stay there on the way out.
        wasFullScreen: this.window.isFullScreen()
      }
      this.sidebar.hide()
      this.chromeView.setVisible(false)
      this.tabs.setBackgroundThrottling(false)
      this.keepAwake.start()
      if (!this.gamingRestore.wasFullScreen) this.window.setFullScreen(true)
      // Keyboard and gamepad input goes to the focused view, which may well be
      // the chrome the mode just hid. Hand it to the game.
      this.tabs.activeWebContents()?.focus()
    } else {
      const restore = this.gamingRestore
      this.gamingRestore = null
      this.chromeView.setVisible(true)
      this.tabs.setBackgroundThrottling(true)
      this.keepAwake.stop()
      if (restore?.sidebarOpen) this.sidebar.show()
      if (restore && !restore.wasFullScreen && this.window.isFullScreen()) {
        this.window.setFullScreen(false)
      }
    }

    this.layout()
    this.broadcastSnapshot()
    // Keeps the View menu's tick right when Esc, not the menu, ended the mode.
    rebuildMenu()
  }

  toggleSidebar(): void {
    this.sidebar.toggle()
    if (this.sidebar.isOpen()) this.sidebar.focus()
  }

  closeSidebar(): void {
    this.sidebar.hide()
  }

  reloadSidebar(): void {
    this.sidebar.reload()
  }

  sidebarState(): SidebarState {
    return this.sidebar.state(this.tabs.activeWebContents()?.getURL() ?? null)
  }

  selectSidebarTool(url: string): void {
    this.sidebar.select(url)
  }

  /** Right-click on a rail icon. Unpinning is deliberate, never a stray click. */
  reorderSidebarTools(from: number, to: number): void {
    this.sidebar.reorder(from, to)
  }

  showSidebarToolMenu(url: string): void {
    this.sidebar.showToolMenu(url)
  }

  /** Rail "+" button: pin whatever the active tab is showing. */
  pinActiveTabAsTool(): void {
    const wc = this.tabs.activeWebContents()
    if (!wc) return
    this.sidebar.pin(wc.getURL(), wc.getTitle())
  }

  isRailContents(wc: WebContents): boolean {
    return this.sidebar.isRailContents(wc)
  }

  toggleDevTools(): void {
    const wc = this.tabs.activeWebContents()
    if (!wc) return
    if (wc.isDevToolsOpened()) wc.closeDevTools()
    else wc.openDevTools({ mode: 'bottom' })
  }

  /** Dev-only: let the pages settle, then capture each view and quit. */
  private scheduleSmokeCapture(dir: string): void {
    // Optionally exercise the overlay path so the capture proves it expands.
    if (process.env['LUMINA_SMOKE_FIND']) {
      setTimeout(() => this.toggleFind(), 3500)
    }
    if (process.env['LUMINA_SMOKE_APPS']) {
      setTimeout(() => this.focusQuickLinks(), 1500)
    }
    if (process.env['LUMINA_SMOKE_SIDEBAR']) {
      setTimeout(() => this.toggleSidebar(), 1500)
    }
    if (process.env['LUMINA_SMOKE_GAMES']) {
      setTimeout(() => this.tabs.loadURL('lumina://home/games'), 1500)
    }
    if (process.env['LUMINA_SMOKE_GAMING']) {
      setTimeout(() => this.setGamingMode(true), 1500)
    }
    setTimeout(() => {
      const views = [{ name: 'chrome', wc: this.chromeView.webContents }]
      const page = this.tabs.activeWebContents()
      if (page) views.push({ name: 'page', wc: page })
      const panel = this.sidebar.contents()
      if (panel) views.push({ name: 'sidebar', wc: panel })
      const rail = this.sidebar.railContents()
      if (rail) views.push({ name: 'rail', wc: rail })
      void runSmokeCapture(dir, views)
    }, 5000)
  }

  private dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // Closing the window mid-game must not leave the display blocker running
    // for the rest of the session.
    this.keepAwake.stop()
    this.permissions.dispose()
    this.sidebar.dispose()
    this.tabs.dispose()
  }
}
