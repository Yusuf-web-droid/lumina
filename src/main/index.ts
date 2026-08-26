import { app, protocol, session, shell } from 'electron'
import { DEFAULT_SEARCH_TEMPLATE, isSafeNavigation } from '@shared/urlUtils'
import { registerIPC } from './ipc'
import { buildMenu } from './menu'
import { quickLinksStore } from './quickLinks'
import { backgroundStore } from './background'
import { faviconStore } from './favicons'
import { isThemeSource, themeStore } from './theme'
import { siteIcon } from './siteIcon'
import { weatherStore } from './weather'
import { widgetToken } from './widgets'
import { renderBackgroundPage, renderStartPage } from './startPage'
import { applyClientHints, cleanUserAgent } from './userAgent'
import { PARTITION } from './tabs'
import { BrowserWindow } from './window'

app.setName('Nexus')

// Must run before the app is ready, so the scheme behaves like a real origin
// (proper security context) rather than an opaque one.
// supportFetchAPI lets the start page fetch its own nexus://home/weather route.
// corsEnabled stays off, so only same-origin pages — that is, the start page
// itself — can read from the scheme.
protocol.registerSchemesAsPrivileged([
  { scheme: 'nexus', privileges: { standard: true, secure: true, supportFetchAPI: true } }
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
      mainWindow.window.focus()
    }
  })

  void app
    .whenReady()
    .then(() => {
      // The start page is generated per request, so edits to quick links show up
    // on the next new tab without any cache busting.
    const html = (body: string): Response =>
      new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })

    const backToHome = (): Response =>
      new Response(null, { status: 302, headers: { location: 'nexus://home/' } })

    const backgroundOptions = () => {
      const bg = backgroundStore().get()
      return {
        kind: bg.kind,
        hasImage: backgroundStore().imagePath() !== null,
        preset: bg.preset,
        dim: bg.dim
      }
    }

    const serveStartPage = async (request: Request): Promise<Response> => {
      const { hostname, pathname } = new URL(request.url)

      // nexus://bg/current — the background in use.
      // nexus://bg/preset/<id> — one bundled photo, for the picker's thumbnails.
      if (hostname === 'bg') {
        const preset = /^\/preset\/([a-z0-9-]+)$/.exec(pathname)
        return backgroundStore().imageResponse(
          preset ? backgroundStore().presetPath(preset[1]!) : undefined
        )
      }
      if (hostname === 'icon') return faviconStore().response(pathname.replace(/^\/+/, ''))
      if (hostname !== 'home') return new Response('Not found', { status: 404 })

      const path = pathname.replace(/\/+$/, '')

      if (path === '' || path === '/') {
        const links = quickLinksStore().list()
        // Pick up icons for anything new or stale; they show on the next open.
        void faviconStore().refresh(links.map((l) => l.url))
        return html(renderStartPage(links, DEFAULT_SEARCH_TEMPLATE, backgroundOptions(), (url) => siteIcon(url)))
      }

      // Only the start page this run generated may reach the weather routes.
      if (path === '/weather' || path === '/weather/place') {
        if (request.headers.get('x-nexus-widget') !== widgetToken()) {
          return new Response('Forbidden', { status: 403 })
        }
        const payload =
          path === '/weather/place'
            ? await weatherStore().setPlace(await request.text())
            : await weatherStore().current()

        return new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
        })
      }

      if (path === '/background') {
        return html(renderBackgroundPage(backgroundOptions(), themeStore().get()))
      }

      const themeMatch = /^\/appearance\/([a-z]+)$/.exec(path)
      if (themeMatch) {
        const source = themeMatch[1]!
        if (isThemeSource(source)) themeStore().set(source)
        // Back to the picker, so the newly active option is visible.
        return new Response(null, {
          status: 302,
          headers: { location: 'nexus://home/background' }
        })
      }

      if (path === '/background/choose') {
        // Opens the system file picker; cancelling just returns unchanged.
        await backgroundStore().chooseImage()
        return backToHome()
      }

      const presetMatch = /^\/background\/preset\/([a-z0-9-]+)$/.exec(path)
      if (presetMatch) {
        backgroundStore().setPreset(presetMatch[1]!)
        return new Response(null, {
          status: 302,
          headers: { location: 'nexus://home/background' }
        })
      }

      if (path === '/background/scene' || path === '/background/plain') {
        backgroundStore().setKind(path.endsWith('scene') ? 'scene' : 'plain')
        return backToHome()
      }

      const dimMatch = /^\/background\/dim\/(\d{1,3})$/.exec(path)
      if (dimMatch) {
        backgroundStore().setDim(Number(dimMatch[1]))
        return new Response(null, { status: 302, headers: { location: 'nexus://home/background' } })
      }

      return new Response('Not found', { status: 404 })
    }

    const tabSession = session.fromPartition(PARTITION)
    tabSession.protocol.handle('nexus', serveStartPage)

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
        if (!mainWindow) createWindow()
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
