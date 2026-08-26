import { WebContentsView, type BaseWindow, type Rectangle } from 'electron'
import { join } from 'node:path'
import type { PinBlocked, SidebarState, SidebarToolView } from '@shared/types'
import { IPC } from '@shared/types'
import { isSafeNavigation } from '@shared/urlUtils'
import { faviconStore } from './favicons'
import { MAX_TOOLS, SidebarTools } from './sidebarTools'
import { siteIcon } from './siteIcon'
import { PARTITION } from './tabs'

/** Width of the icon rail pinned to the window's right edge. */
export const RAIL_WIDTH = 52

export const SIDEBAR_MIN_WIDTH = 280
export const SIDEBAR_MAX_WIDTH = 720
export const SIDEBAR_DEFAULT_WIDTH = 400

/**
 * A docked panel that hosts the pinned tools beside the page, with an icon
 * rail down the window's right edge for switching between them.
 *
 * Each tool is a real browser view rather than an API client: it signs in with
 * the user's existing account, so there is no API key to manage and no
 * per-message billing. Tools share the tabs' session partition, so a Google
 * sign-in here or in a tab counts for both.
 *
 * A tool's view is built on first use and then kept alive but detached, so
 * switching away and back does not reload the conversation.
 */
export class Sidebar {
  private readonly tools = new SidebarTools()
  /** Live views keyed by tool URL. Built lazily, never rebuilt. */
  private readonly views = new Map<string, WebContentsView>()
  private railView: WebContentsView | null = null
  private activeUrl: string | null = null
  private open = false
  private width = SIDEBAR_DEFAULT_WIDTH

  constructor(
    private readonly window: BaseWindow,
    private readonly onChange: () => void
  ) {
    // Pinned tools are the one set of icons the rail always shows, so warm
    // them now rather than waiting for the panel to be opened.
    this.warmIcons(this.tools.list().map((t) => t.url))
  }

  isOpen(): boolean {
    return this.open
  }

  /** Total docked width: the rail is always shown while the panel is open. */
  currentWidth(): number {
    return this.open ? this.width + RAIL_WIDTH : 0
  }

  setWidth(width: number): void {
    this.width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
  }

  toggle(): void {
    if (this.open) this.hide()
    else this.show()
  }

  show(): void {
    if (this.open) return
    const url = this.activeUrl ?? this.tools.activeUrl()
    if (!url) return // nothing pinned; nothing to dock
    this.activeUrl = url

    this.window.contentView.addChildView(this.ensureRail())
    this.window.contentView.addChildView(this.ensureToolView(url))
    this.open = true
    this.onChange()
    this.broadcast()
  }

  hide(): void {
    if (!this.open) return
    if (this.railView) this.window.contentView.removeChildView(this.railView)
    const view = this.activeUrl ? this.views.get(this.activeUrl) : null
    if (view) this.window.contentView.removeChildView(view)
    this.open = false
    this.onChange()
    this.broadcast()
  }

  /** Rail click: switch the panel to a tool, opening the panel if needed. */
  select(url: string): void {
    if (!this.tools.has(url)) return

    if (!this.open) {
      this.activeUrl = url
      this.tools.setActiveUrl(url)
      this.show()
      this.focus()
      return
    }

    if (this.activeUrl === url) {
      this.focus()
      return
    }

    const previous = this.activeUrl ? this.views.get(this.activeUrl) : null
    if (previous) this.window.contentView.removeChildView(previous)

    this.activeUrl = url
    this.tools.setActiveUrl(url)
    this.window.contentView.addChildView(this.ensureToolView(url))
    this.layoutViews()
    this.focus()
    this.broadcast()
  }

  /** Pin a page as a tool and switch to it. No-op if already pinned or full. */
  pin(url: string, title: string): void {
    if (!isSafeNavigation(url)) return
    if (this.tools.add(url, title)) this.warmIcons([url])
    this.select(url)
    this.broadcast()
  }

  unpin(url: string): void {
    if (!this.tools.has(url)) return
    this.tools.remove(url)

    // Tear the view down: an unpinned tool has no way back to the screen.
    const view = this.views.get(url)
    if (view) {
      if (this.open && this.activeUrl === url) this.window.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close()
      this.views.delete(url)
    }

    if (this.activeUrl !== url) {
      this.broadcast()
      return
    }

    // The active tool went away — fall to the next one, or close the panel.
    const next = this.tools.activeUrl()
    this.activeUrl = null
    this.tools.setActiveUrl(next)
    if (!next) {
      this.hide()
      return
    }
    if (this.open) {
      this.activeUrl = next
      this.window.contentView.addChildView(this.ensureToolView(next))
      this.layoutViews()
    } else {
      this.activeUrl = next
    }
    this.broadcast()
  }

  /** Bounds are assigned only from BrowserWindow.layout(). */
  setBounds(bounds: Rectangle): void {
    if (!this.open) return
    this.bounds = bounds
    this.layoutViews()
  }

  private bounds: Rectangle | null = null

  /** Split the docked rect: rail hard against the right edge, panel left of it. */
  private layoutViews(): void {
    const b = this.bounds
    if (!b || !this.open) return
    const railX = b.x + Math.max(0, b.width - RAIL_WIDTH)
    this.railView?.setBounds({ x: railX, y: b.y, width: RAIL_WIDTH, height: b.height })

    const view = this.activeUrl ? this.views.get(this.activeUrl) : null
    view?.setBounds({
      x: b.x,
      y: b.y,
      width: Math.max(0, b.width - RAIL_WIDTH),
      height: b.height
    })
  }

  /** Dev-only: the rail's WebContents, for smoke captures. */
  railContents(): Electron.WebContents | null {
    return this.railView?.webContents ?? null
  }

  /** Dev-only: the active tool's WebContents, for smoke captures. */
  contents(): Electron.WebContents | null {
    if (!this.activeUrl) return null
    return this.views.get(this.activeUrl)?.webContents ?? null
  }

  reload(): void {
    this.contents()?.reload()
  }

  focus(): void {
    this.contents()?.focus()
  }

  /** State for the rail. `pinBlocked` drives the pin button's appearance. */
  state(currentTabURL: string | null): SidebarState {
    const list = this.tools.list()
    const tools: SidebarToolView[] = list.map((tool) => ({
      ...tool,
      icon: siteIcon(tool.url, true),
      active: this.open && tool.url === this.activeUrl
    }))

    // Work out up front why pinning would be refused, so the button can say so
    // rather than looking live and doing nothing.
    let pinBlocked: PinBlocked | null = null
    if (currentTabURL === null || !isSafeNavigation(currentTabURL)) pinBlocked = 'unpinnable'
    else if (list.some((t) => t.url === currentTabURL)) pinBlocked = 'pinned'
    else if (list.length >= MAX_TOOLS) pinBlocked = 'full'

    return { tools, pinBlocked }
  }

  /** Set by BrowserWindow: the active tab's URL, for the pin button. */
  currentTabURL: (() => string | null) | null = null

  /** Set by BrowserWindow so a tool can hand links to the tab manager. */
  openInTab: ((url: string) => void) | null = null

  /** Fetch icons for these URLs, then repaint the rail with whatever landed. */
  private warmIcons(urls: string[]): void {
    void faviconStore()
      .refresh(urls)
      .then(() => this.broadcast())
      .catch(() => {
        /* an icon that will not download just keeps its letter tile */
      })
  }

  /** Repaint the rail. Safe to call before the rail view exists. */
  broadcast(): void {
    const wc = this.railView?.webContents
    if (!wc || wc.isDestroyed()) return
    wc.send(IPC.OnSidebarTools, this.state(this.currentTabURL?.() ?? null))
  }

  isRailContents(wc: Electron.WebContents): boolean {
    return this.railView !== null && wc === this.railView.webContents
  }

  private ensureRail(): WebContentsView {
    if (this.railView) return this.railView

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/rail.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    // Transparent so the rail's own CSS paints it, and it can follow the
    // system theme the same way the toolbar does.
    view.setBackgroundColor('#00000000')

    const devURL = process.env['ELECTRON_RENDERER_URL']
    if (devURL) {
      void view.webContents.loadURL(`${devURL}/rail.html`)
    } else {
      void view.webContents.loadFile(join(__dirname, '../renderer/rail.html'))
    }
    // The rail asks for state itself on load; this covers later reloads.
    view.webContents.on('did-finish-load', () => this.broadcast())

    this.railView = view
    return view
  }

  private ensureToolView(url: string): WebContentsView {
    const existing = this.views.get(url)
    if (existing) return existing

    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/stealth.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        // Same jar as the tabs, so one sign-in covers both.
        partition: PARTITION
      }
    })
    view.setBackgroundColor('#ffffff')

    const wc = view.webContents

    // Links from a tool belong in a real tab, not inside the narrow panel.
    wc.setWindowOpenHandler(({ url: target }) => {
      if (isSafeNavigation(target)) this.openInTab?.(target)
      return { action: 'deny' }
    })

    // A tool that reaches its real favicon gets a sharper rail icon than the
    // bundled glyph fallback, so repaint once one lands.
    wc.on('page-favicon-updated', () => this.warmIcons([url]))

    void wc.loadURL(url).catch((err) => {
      console.error(`[sidebar] failed to load ${url}:`, err)
    })

    this.views.set(url, view)
    return view
  }

  flush(): void {
    this.tools.flush()
  }

  dispose(): void {
    for (const view of this.views.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    this.views.clear()
    if (this.railView && !this.railView.webContents.isDestroyed()) {
      this.railView.webContents.close()
    }
    this.railView = null
    this.open = false
    this.activeUrl = null
  }
}
