import { gameById } from '@shared/games'
import type { QuickLink, QuickLinkIcon } from '@shared/types'
import { DEFAULT_SEARCH_TEMPLATE } from '@shared/urlUtils'
import { hasValidToken } from './pageToken'
import {
  renderBackgroundPage,
  renderGamesPage,
  renderStartPage,
  type BackgroundOptions
} from './startPage'
import { isThemeSource, type ThemeSource } from './theme'

/**
 * The `lumina://` router.
 *
 * Lives in its own module, taking its stores as arguments, for two reasons: it
 * was ~80 lines of regex dispatch with side effects buried inside `whenReady`,
 * where nothing could reach it; and it is a privilege boundary, so it is the
 * part of the app that most needs tests.
 *
 * ## Why the mutating routes need a token
 *
 * The scheme is registered `standard` and `secure`, and some of its routes
 * change real state — the appearance and wallpaper settings, and one that opens
 * a native file dialog. They are reached by ordinary link navigation, so any
 * page that could point a tab at `lumina://home/background/choose` could open
 * that dialog. `mayNavigateTo()` now refuses that navigation, and the CSP below
 * refuses the iframe version of it, but neither is a reason to leave the routes
 * themselves unauthenticated: `will-navigate` is main-frame only, and a future
 * caller could reach the scheme by a path neither guard covers.
 *
 * So every route that writes requires the per-run token, and every route that
 * only reads does not. That split matters in practice — it keeps a bookmarked
 * `lumina://home/background` working across restarts, even though the token
 * itself changes every run.
 */

/** What the router needs. Narrow on purpose, so a test can supply fakes. */
export interface RouteDeps {
  background: {
    get(): { kind: BackgroundOptions['kind']; preset: string | null; dim: number }
    imagePath(): string | null
    presetPath(id: string): string | null
    imageResponse(path?: string | null): Response
    setKind(kind: 'scene' | 'plain'): void
    setDim(dim: number): void
    setPreset(id: string): boolean
    chooseImage(): Promise<boolean>
  }
  favicons: {
    response(path: string): Promise<Response> | Response
    refresh(urls: string[]): Promise<unknown>
  }
  quickLinks: { list(): QuickLink[] }
  /** Switching on gaming mode when a game is opened from the games page. */
  gaming: { on(): void }
  weather: {
    current(): Promise<unknown>
    setPlace(query: string): Promise<unknown>
  }
  theme: {
    get(): ThemeSource
    set(source: ThemeSource): void
  }
  siteIcon(url: string): QuickLinkIcon | null
}

/**
 * Sent with every response from the scheme.
 *
 * `frame-ancestors 'none'` is the load-bearing directive: it stops another
 * origin embedding a privileged page in an iframe, which is the one way to
 * reach these routes that a `will-navigate` guard structurally cannot see —
 * that event fires for main-frame navigation only.
 *
 * `'unsafe-inline'` is required because the start page inlines its own styles
 * and its widget script rather than loading them as separate resources.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // `lumina:` and not just 'self': the scheme's hosts are separate origins, so
  // a start page on lumina://home cannot load its own background from
  // lumina://bg or its tile icons from lumina://icon under 'self' alone.
  "img-src 'self' lumina: data:",
  "connect-src 'self' lumina:",
  "form-action 'self' https:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ')

function withCSP(headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, 'content-security-policy': CSP }
}

const html = (body: string): Response =>
  new Response(body, { headers: withCSP({ 'content-type': 'text/html; charset=utf-8' }) })

const redirect = (location: string): Response =>
  new Response(null, { status: 302, headers: withCSP({ location }) })

const backToHome = (): Response => redirect('lumina://home/')

const notFound = (): Response =>
  new Response('Not found', { status: 404, headers: withCSP() })

const forbidden = (): Response =>
  new Response('Forbidden', { status: 403, headers: withCSP() })

export function createStartPageRouter(deps: RouteDeps) {
  const backgroundOptions = (): BackgroundOptions => {
    const bg = deps.background.get()
    return {
      kind: bg.kind,
      hasImage: deps.background.imagePath() !== null,
      preset: bg.preset,
      dim: bg.dim
    }
  }

  return async function serveStartPage(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const { hostname, pathname } = url

    // lumina://bg/current — the background in use.
    // lumina://bg/preset/<id> — one bundled photo, for the picker's thumbnails.
    if (hostname === 'bg') {
      const preset = /^\/preset\/([a-z0-9-]+)$/.exec(pathname)
      if (preset) {
        const path = deps.background.presetPath(preset[1]!)
        if (!path) return notFound()
        return deps.background.imageResponse(path)
      }
      if (pathname === '/current' || pathname === '/' || pathname === '') {
        return deps.background.imageResponse()
      }
      return notFound()
    }

    if (hostname === 'icon') {
      // Only a bare hostname, so no path can walk out of the icon directory.
      const host = pathname.replace(/^\/+/, '')
      if (!/^[a-z0-9.-]+$/i.test(host) || host.includes('..')) return notFound()
      return deps.favicons.response(host)
    }

    if (hostname !== 'home') return notFound()

    const path = pathname.replace(/\/+$/, '')

    // ------------------------------------------------------------ read-only

    if (path === '' || path === '/') {
      const links = deps.quickLinks.list()
      // Pick up icons for anything new or stale; they show on the next open.
      void deps.favicons.refresh(links.map((l) => l.url))
      return html(
        renderStartPage(links, DEFAULT_SEARCH_TEMPLATE, backgroundOptions(), (u) =>
          deps.siteIcon(u)
        )
      )
    }

    if (path === '/background') {
      return html(renderBackgroundPage(backgroundOptions(), deps.theme.get()))
    }

    if (path === '/games') {
      return html(renderGamesPage())
    }

    // ------------------------------------------------------------- mutating
    // Everything below changes state, so everything below needs the token.

    const authorised = hasValidToken(request, url)

    if (path === '/weather' || path === '/weather/place') {
      if (!authorised) return forbidden()
      const payload =
        path === '/weather/place'
          ? await deps.weather.setPlace(await request.text())
          : await deps.weather.current()

      return new Response(JSON.stringify(payload), {
        headers: withCSP({ 'content-type': 'application/json', 'cache-control': 'no-store' })
      })
    }

    const themeMatch = /^\/appearance\/([a-z]+)$/.exec(path)
    if (themeMatch) {
      if (!authorised) return forbidden()
      const source = themeMatch[1]!
      if (isThemeSource(source)) deps.theme.set(source)
      // Back to the picker, so the newly active option is visible.
      return redirect('lumina://home/background')
    }

    if (path === '/background/choose') {
      if (!authorised) return forbidden()
      // Opens the system file picker; cancelling just returns unchanged.
      await deps.background.chooseImage()
      return backToHome()
    }

    const presetMatch = /^\/background\/preset\/([a-z0-9-]+)$/.exec(path)
    if (presetMatch) {
      if (!authorised) return forbidden()
      deps.background.setPreset(presetMatch[1]!)
      return redirect('lumina://home/background')
    }

    if (path === '/background/scene' || path === '/background/plain') {
      if (!authorised) return forbidden()
      deps.background.setKind(path.endsWith('scene') ? 'scene' : 'plain')
      return backToHome()
    }

    // Sends the tab to a game and switches gaming mode on for it. The id is
    // looked up in the fixed catalogue rather than trusted as a URL, so this
    // cannot be used as an open redirect out of the privileged scheme.
    const playMatch = /^\/games\/play\/([a-z0-9-]+)$/.exec(path)
    if (playMatch) {
      if (!authorised) return forbidden()
      const game = gameById(playMatch[1]!)
      if (!game) return notFound()
      deps.gaming.on()
      return redirect(game.url)
    }

    const dimMatch = /^\/background\/dim\/(\d{1,3})$/.exec(path)
    if (dimMatch) {
      if (!authorised) return forbidden()
      deps.background.setDim(Number(dimMatch[1]))
      return redirect('lumina://home/background')
    }

    return notFound()
  }
}
