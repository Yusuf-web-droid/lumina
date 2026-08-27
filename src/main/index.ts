import { app, protocol, session, shell } from 'electron'
import { isSafeNavigation } from '@shared/urlUtils'
import { registerIPC } from './ipc'
import { buildMenu } from './menu'
import { quickLinksStore } from './quickLinks'
import { backgroundStore } from './background'
import { faviconStore } from './favicons'
import { themeStore } from './theme'
import { siteIcon } from './siteIcon'
import { weatherStore } from './weather'
import { createStartPageRouter } from './startPageRoutes'
import { applyClientHints, cleanUserAgent } from './userAgent'
import { PARTITION } from './tabs'
import { migrateProfile } from './migrateProfile'
import { BrowserWindow } from './window'

app.setName('Lumina')

// Before anything reads userData: the app was called Nexus in earlier builds,
// and userData is derived from the name, so the old profile has to move across.
migrateProfile()

// Must run before the app is ready, so the scheme behaves like a real origin
// (proper security context) rather than an opaque one.
// supportFetchAPI lets the start page fetch its own lumina://home/weather route.
// corsEnabled stays off, so only same-origin pages — that is, the start page
// itself — can read from the scheme.
protocol.registerSchemesAsPrivileged([
  { scheme: 'lumina', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

app.userAgentFallback = cleanUserAgent()

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow()
  mainWindow.window.on('closed', () => {
    mainWindow = null
  })
}

// A browser holding a persistent session must not run twice over the same profile.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.window.isMinimized()) mainWindow.window.restore()
      // focus() raises the window within this app but does not bring the app
      // itself forward, so launching Lumina while it is already running behind
      // another app looked like nothing happening at all.
      app.focus({ steal: true })
      mainWindow.window.focus()
    }
  })

  void app
    .whenReady()
    .then(() => {
      // The start page is generated per request, so edits to quick links show up
      // on the next new tab without any cache busting. The router itself lives in
      // ./startPageRoutes, which is where its token and CSP handling is explained.
      const serveStartPage = createStartPageRouter({
        background: backgroundStore(),
        favicons: faviconStore(),
        quickLinks: quickLinksStore(),
        weather: weatherStore(),
        theme: themeStore(),
        // Opening a game from the games page hands the window to it.
        gaming: { on: () => mainWindow?.setGamingMode(true) },
        siteIcon
      })

      const tabSession = session.fromPartition(PARTITION)
      tabSession.protocol.handle('lumina', serveStartPage)

    // Client hints must match the spoofed UA or Google refuses to sign in.
    const ua = app.userAgentFallback
    applyClientHints(session.defaultSession, ua)
    applyClientHints(tabSession, ua)

    // Apply the stored appearance before any window exists, so the chrome
    // paints in the right theme rather than flashing the other one.
    themeStore().apply()

    // Warm the icon cache at launch, so the first new tab already has logos.
    void faviconStore().refresh(quickLinksStore().list().map((l) => l.url))

    registerIPC(() => mainWindow)
      buildMenu(() => mainWindow)
      createWindow()

      app.on('activate', () => {
        // Clicking the Dock icon with a window already open must raise it,
        // not quietly do nothing.
        if (!mainWindow) createWindow()
        else {
          if (mainWindow.window.isMinimized()) mainWindow.window.restore()
          mainWindow.window.show()
        }
      })
    })
    .catch((err) => {
      // Without this, a throw during startup leaves a silent, windowless app.
      console.error('[startup] failed:', err)
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/**
 * Belt-and-braces security net applied to every WebContents the app ever makes,
 * including ones created by code paths added later.
 */
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Anything the tab logic did not already claim is handed to the real browser.
    if (!isSafeNavigation(url)) void shell.openExternal(url).catch(() => undefined)
    return { action: 'deny' }
  })

  contents.on('will-attach-webview', (event) => {
    event.preventDefault() // <webview> is disabled everywhere
  })
})

// Never silently accept a bad certificate.
app.on('certificate-error', (event, _wc, _url, _error, _cert, callback) => {
  event.preventDefault()
  callback(false)
})
