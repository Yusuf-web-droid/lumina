import { WebContentsView, type BaseWindow, type Rectangle } from 'electron'
import { join } from 'node:path'
import { isSafeNavigation } from '@shared/urlUtils'
import { PARTITION } from './tabs'

export const SIDEBAR_URL = 'https://gemini.google.com/app'

export const SIDEBAR_MIN_WIDTH = 280
export const SIDEBAR_MAX_WIDTH = 720
export const SIDEBAR_DEFAULT_WIDTH = 400

/**
 * A docked panel that loads the Gemini web app beside the page.
 *
 * Deliberately a real browser view rather than an API client: it signs in with
 * the user's existing Google account, so there is no API key to manage and no
 * per-message billing. It shares the tabs' session partition, so a Google
 * sign-in here or in a tab counts for both.
 *
 * The view is created lazily on first open and then kept alive but detached, so
 * reopening does not reload the conversation.
 */
export class Sidebar {
  private view: WebContentsView | null = null
  private open = false
  private width = SIDEBAR_DEFAULT_WIDTH

  constructor(
    private readonly window: BaseWindow,
    private readonly onChange: () => void
  ) {}

  isOpen(): boolean {
    return this.open
  }

  currentWidth(): number {
    return this.open ? this.width : 0
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
    const view = this.ensureView()
    // Added last so it paints above the page view but below the chrome view.
    this.window.contentView.addChildView(view)
    this.open = true
    this.onChange()
  }

  hide(): void {
    if (!this.open || !this.view) return
    this.window.contentView.removeChildView(this.view)
    this.open = false
    this.onChange()
  }

  /** Bounds are assigned only from BrowserWindow.layout(). */
  setBounds(bounds: Rectangle): void {
    if (this.open) this.view?.setBounds(bounds)
  }

  /** Dev-only: the panel's WebContents, for smoke captures. */
  contents(): Electron.WebContents | null {
    return this.view?.webContents ?? null
  }

  reload(): void {
    this.view?.webContents.reload()
  }

  focus(): void {
    this.view?.webContents.focus()
  }

  private ensureView(): WebContentsView {
    if (this.view) return this.view

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

    // Links from the panel belong in a real tab, not inside the panel.
    wc.setWindowOpenHandler(({ url }) => {
      if (isSafeNavigation(url)) this.openInTab?.(url)
      return { action: 'deny' }
    })

    void wc.loadURL(SIDEBAR_URL).catch((err) => {
      console.error('[sidebar] failed to load:', err)
    })

    this.view = view
    return view
  }

  /** Set by BrowserWindow so the panel can hand links to the tab manager. */
  openInTab: ((url: string) => void) | null = null

  dispose(): void {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.view = null
    this.open = false
  }
}
