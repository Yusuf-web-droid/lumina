import { WebContentsView, type BaseWindow, type Rectangle, type WebContents } from 'electron'
import { join } from 'node:path'
import type { BrowserSnapshot, TabState } from '@shared/types'
import { indexForShortcut, neighbourAfterClose, reorderList, wrapIndex } from '@shared/tabOrder'
import { hostLabel, isSafeNavigation, normalizeInput } from '@shared/urlUtils'

/** Shared session for every tab, so cookies and logins persist across them. */
export const PARTITION = 'persist:nexus'

const MAX_CLOSED_STACK = 25

interface Tab {
  id: number
  view: WebContentsView
  favicon: string | null
  crashed: boolean
}

export interface TabManagerHooks {
  /** Any state change worth repainting the chrome for. */
  onChange(): void
  /** A committed main-frame navigation, for the history log. */
  onNavigated(url: string, title: string): void
  /** A page reported a new title, for backfilling the history entry. */
  onTitleUpdated(url: string, title: string): void
  /** Current rect for page content (i.e. the window minus the chrome strip). */
  contentBounds(): Rectangle
  /** Hook for per-tab extras (context menus, zoom defaults) on a fresh WebContents. */
  onTabCreated(wc: WebContents): void
  homeURL: string
}

/**
 * Owns every tab and is the single authority on tab state.
 *
 * Only the active tab's view is attached to the window; inactive tabs keep
 * running detached, so background pages continue to load and play.
 */
export class TabManager {
  private tabs: Tab[] = []
  private activeId: number | null = null
  private nextId = 1
  private closedStack: string[] = []

  constructor(
    private readonly window: BaseWindow,
    private readonly hooks: TabManagerHooks
  ) {}

  // ---------------------------------------------------------------- lifecycle

  create(url?: string, options: { activate?: boolean } = {}): number {
    const activate = options.activate ?? true
    const target = url ?? this.hooks.homeURL

    const view = new WebContentsView({
      webPreferences: {
        // Web content is treated as hostile: no bridge, no Node, full sandbox.
        // The stealth preload exposes nothing — it only aligns the JS-visible
        // browser identity with the user agent we send.
        preload: join(__dirname, '../preload/stealth.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        partition: PARTITION,
        // Chromium's own spellchecker is fine, but keep autofill etc. off.
        spellcheck: true
      }
    })
    view.setBackgroundColor('#ffffff')

    const tab: Tab = { id: this.nextId++, view, favicon: null, crashed: false }
    this.tabs.push(tab)
    this.wire(tab)

    void view.webContents.loadURL(target).catch((err) => {
      console.error(`[tabs] load failed for ${target}:`, err)
    })

    if (activate) this.activate(tab.id)
    else this.hooks.onChange()

    return tab.id
  }

  close(id: number): void {
    const index = this.tabs.findIndex((t) => t.id === id)
    if (index === -1) return
    const tab = this.tabs[index]!

    const url = tab.view.webContents.getURL()
    if (url && url !== 'about:blank') {
      this.closedStack.push(url)
      if (this.closedStack.length > MAX_CLOSED_STACK) this.closedStack.shift()
    }

    if (this.activeId === id) this.detach(tab)
    this.tabs.splice(index, 1)

    // Destroying the WebContents is what actually frees the renderer process.
    tab.view.webContents.close()

    if (this.activeId === id) {
      const next = neighbourAfterClose(this.tabs, index)
      this.activeId = null
      if (next) this.activate(next.id)
      else this.create() // never leave the window empty
      return
    }

    this.hooks.onChange()
  }

  activate(id: number): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || this.activeId === id) return

    const current = this.activeTab()
    if (current) this.detach(current)

    // index 0 keeps the page below the chrome view in the z-order.
    this.window.contentView.addChildView(tab.view, 0)
    tab.view.setBounds(this.hooks.contentBounds())
    this.activeId = id
    tab.view.webContents.focus()
    this.hooks.onChange()
  }

  reorder(fromIndex: number, toIndex: number): void {
    const next = reorderList(this.tabs, fromIndex, toIndex)
    if (next === this.tabs) return
    this.tabs = next
    this.hooks.onChange()
  }

  closeActive(): void {
    if (this.activeId !== null) this.close(this.activeId)
  }

  /** Jump to the nth tab (0-based). Index 8 means "last tab", as in Chrome. */
  activateIndex(index: number): void {
    const resolved = indexForShortcut(index, this.tabs.length)
    const tab = resolved === -1 ? undefined : this.tabs[resolved]
    if (tab) this.activate(tab.id)
  }

  activateRelative(offset: number): void {
    const current = this.tabs.findIndex((t) => t.id === this.activeId)
    if (current === -1) return
    const tab = this.tabs[wrapIndex(current, offset, this.tabs.length)]
    if (tab) this.activate(tab.id)
  }

  reopenClosed(): void {
    const url = this.closedStack.pop()
    if (url) this.create(url)
  }

  private detach(tab: Tab): void {
    this.window.contentView.removeChildView(tab.view)
  }

  // ------------------------------------------------------------------ queries

  activeTab(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  activeWebContents(): WebContents | null {
    const tab = this.activeTab()
    if (!tab || tab.view.webContents.isDestroyed()) return null
    return tab.view.webContents
  }

  isEmpty(): boolean {
    return this.tabs.length === 0
  }

  /** URLs of all open tabs, in order — used to persist the session. */
  openURLs(): string[] {
    return this.tabs.map((t) => t.view.webContents.getURL()).filter((u) => u && u !== 'about:blank')
  }

  /** Tab state only; the window adds window-level flags like the sidebar. */
  snapshot(): Omit<BrowserSnapshot, 'sidebarOpen'> {
    return {
      tabs: this.tabs.map((tab) => this.toState(tab)),
      activeTabId: this.activeId
    }
  }

  private toState(tab: Tab): TabState {
    const wc = tab.view.webContents
    if (wc.isDestroyed()) {
      return {
        id: tab.id,
        title: 'Closed',
        url: '',
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        crashed: true
      }
    }
    const url = wc.getURL()
    return {
      id: tab.id,
      title: wc.getTitle() || hostLabel(url),
      url,
      favicon: tab.favicon,
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      crashed: tab.crashed
    }
  }

  // --------------------------------------------------------------- navigation

  loadURL(input: string): void {
    const wc = this.activeWebContents()
    if (!wc) return
    void wc.loadURL(normalizeInput(input)).catch((err) => {
      console.error('[tabs] navigation failed:', err)
    })
  }

  back(): void {
    const wc = this.activeWebContents()
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  }

  forward(): void {
    const wc = this.activeWebContents()
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  }

  reload(): void {
    const tab = this.activeTab()
    if (!tab) return
    tab.crashed = false
    tab.view.webContents.reload()
  }

  stop(): void {
    this.activeWebContents()?.stop()
  }

  home(): void {
    this.loadURL(this.hooks.homeURL)
  }

  // ------------------------------------------------------------------- layout

  /** Re-apply bounds to the attached view. The only place tab bounds are set. */
  layout(): void {
    const tab = this.activeTab()
    if (tab) tab.view.setBounds(this.hooks.contentBounds())
  }

  // -------------------------------------------------------------- event wiring

  private wire(tab: Tab): void {
    const wc = tab.view.webContents
    const changed = (): void => this.hooks.onChange()

    wc.on('page-title-updated', (_e, title) => {
      this.hooks.onTitleUpdated(wc.getURL(), title)
      changed()
    })

    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] ?? null
      changed()
    })

    wc.on('did-start-loading', changed)
    wc.on('did-stop-loading', changed)

    wc.on('did-navigate', (_e, url) => {
      tab.crashed = false
      this.hooks.onNavigated(url, wc.getTitle())
      changed()
    })

    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.hooks.onNavigated(url, wc.getTitle())
      changed()
    })

    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 is ERR_ABORTED, which fires on every ordinary navigation interrupt.
      if (isMainFrame && errorCode !== -3) {
        console.warn(`[tabs] ${errorCode} ${errorDescription} for ${validatedURL}`)
      }
      changed()
    })

    wc.on('render-process-gone', (_e, details) => {
      console.error('[tabs] render process gone:', details.reason)
      tab.crashed = true
      changed()
    })

    // A page must never open a window we did not configure. Route it to a tab.
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (isSafeNavigation(url)) {
        this.create(url, { activate: disposition !== 'background-tab' })
      }
      return { action: 'deny' }
    })

    // Block page-initiated navigation to schemes we do not want to handle.
    wc.on('will-navigate', (event, url) => {
      if (!isSafeNavigation(url)) {
        event.preventDefault()
        console.warn(`[tabs] blocked navigation to ${url}`)
      }
    })

    this.hooks.onTabCreated(wc)
  }

  /** Destroy every tab. Called on window close. */
  dispose(): void {
    for (const tab of this.tabs) {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close()
    }
    this.tabs = []
    this.activeId = null
  }
}
