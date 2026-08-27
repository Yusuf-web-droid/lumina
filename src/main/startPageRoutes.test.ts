import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKEN_HEADER, pageToken } from './pageToken'
import { createStartPageRouter, type RouteDeps } from './startPageRoutes'

/**
 * These cover the privilege boundary, so most of them are about what the router
 * refuses. The rule under test: a route that changes state requires the per-run
 * token, a route that only reads does not.
 */

function fakeDeps() {
  const background = {
    get: vi.fn(() => ({ kind: 'scene' as const, preset: null, dim: 0 })),
    imagePath: vi.fn(() => null),
    presetPath: vi.fn((id: string) => (id === 'jetty' ? '/photos/jetty.jpg' : null)),
    imageResponse: vi.fn(() => new Response('image-bytes')),
    setKind: vi.fn(),
    setDim: vi.fn(),
    setPreset: vi.fn(() => true),
    chooseImage: vi.fn(async () => true)
  }
  const favicons = {
    response: vi.fn(() => new Response('icon-bytes')),
    refresh: vi.fn(async () => undefined)
  }
  const quickLinks = { list: vi.fn(() => []) }
  const weather = {
    current: vi.fn(async () => ({ place: 'Leeds' })),
    setPlace: vi.fn(async () => ({ place: 'York' }))
  }
  const theme = { get: vi.fn(() => 'system' as const), set: vi.fn() }
  const siteIcon = vi.fn(() => null)
  const gaming = { on: vi.fn() }

  const deps: RouteDeps = { background, favicons, quickLinks, weather, theme, gaming, siteIcon }
  return { deps, background, favicons, quickLinks, weather, theme, gaming }
}

type Fakes = ReturnType<typeof fakeDeps>

let fakes: Fakes
let serve: (request: Request) => Promise<Response>

/** Every store method that writes. None of these may run without a token. */
const writers = (f: Fakes): Array<ReturnType<typeof vi.fn>> => [
  f.background.setKind,
  f.background.setDim,
  f.background.setPreset,
  f.background.chooseImage,
  f.theme.set,
  f.weather.setPlace,
  f.gaming.on
]

const get = (url: string, init?: RequestInit): Promise<Response> =>
  serve(new Request(url, init))

/** The same URL the start page would generate, token and all. */
const signed = (url: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(pageToken())}`

beforeEach(() => {
  fakes = fakeDeps()
  serve = createStartPageRouter(fakes.deps)
})

describe('unknown routes', () => {
  it('404s an unknown host', async () => {
    expect((await get('lumina://nope/')).status).toBe(404)
  })

  it('404s an unknown path under home', async () => {
    expect((await get('lumina://home/not-a-route')).status).toBe(404)
  })
})

describe('read-only routes need no token', () => {
  it('serves the start page', async () => {
    const res = await get('lumina://home/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<!doctype html>')
  })

  it('serves the appearance page, so a bookmark to it survives a restart', async () => {
    expect((await get('lumina://home/background')).status).toBe(200)
  })

  it('serves the games page without switching anything on', async () => {
    const res = await get('lumina://home/games')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Minecraft Classic')
    // Merely looking at the page must not hand the window to a game.
    expect(fakes.gaming.on).not.toHaveBeenCalled()
  })

  it('serves the current background and a preset thumbnail', async () => {
    expect((await get('lumina://bg/current')).status).toBe(200)
    expect((await get('lumina://bg/preset/jetty')).status).toBe(200)
  })

  it('404s a preset that does not exist rather than serving the default', async () => {
    expect((await get('lumina://bg/preset/nosuch')).status).toBe(404)
    expect(fakes.background.imageResponse).not.toHaveBeenCalled()
  })
})

describe('mutating routes require the token', () => {
  const mutating: Array<[name: string, url: string, init?: RequestInit]> = [
    ['open the file dialog', 'lumina://home/background/choose'],
    ['change the theme', 'lumina://home/appearance/dark'],
    ['change the preset', 'lumina://home/background/preset/jetty'],
    ['switch to the scene', 'lumina://home/background/scene'],
    ['switch to plain', 'lumina://home/background/plain'],
    ['change the dim level', 'lumina://home/background/dim/45'],
    ['read the weather', 'lumina://home/weather'],
    ['set the weather place', 'lumina://home/weather/place', { method: 'POST', body: 'York' }]
  ]

  it.each(mutating)('refuses to %s with no token', async (_name, url, init) => {
    const res = await get(url, init)
    expect(res.status).toBe(403)
    for (const write of writers(fakes)) expect(write).not.toHaveBeenCalled()
  })

  it.each(mutating)('refuses to %s with a wrong token', async (_name, url, init) => {
    const res = await get(`${url}${url.includes('?') ? '&' : '?'}t=not-the-token`, init)
    expect(res.status).toBe(403)
    for (const write of writers(fakes)) expect(write).not.toHaveBeenCalled()
  })

  it('is not fooled by a token in a header-shaped query key', async () => {
    const res = await get(`lumina://home/appearance/dark?${TOKEN_HEADER}=${pageToken()}`)
    expect(res.status).toBe(403)
    expect(fakes.theme.set).not.toHaveBeenCalled()
  })
})

describe('mutating routes work when the token is present', () => {
  it('accepts the token from a signed link, as the settings page sends it', async () => {
    const res = await get(signed('lumina://home/appearance/dark'))
    expect(res.status).toBe(302)
    expect(fakes.theme.set).toHaveBeenCalledWith('dark')
  })

  it('accepts the token from a header, as the weather widget sends it', async () => {
    const res = await get('lumina://home/weather', { headers: { [TOKEN_HEADER]: pageToken() } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ place: 'Leeds' })
  })

  it('ignores an appearance value that is not a real theme', async () => {
    const res = await get(signed('lumina://home/appearance/chartreuse'))
    expect(res.status).toBe(302)
    expect(fakes.theme.set).not.toHaveBeenCalled()
  })

  it('opens the file dialog, sets a preset, a kind and a dim level', async () => {
    await get(signed('lumina://home/background/choose'))
    await get(signed('lumina://home/background/preset/jetty'))
    await get(signed('lumina://home/background/plain'))
    await get(signed('lumina://home/background/dim/45'))

    expect(fakes.background.chooseImage).toHaveBeenCalled()
    expect(fakes.background.setPreset).toHaveBeenCalledWith('jetty')
    expect(fakes.background.setKind).toHaveBeenCalledWith('plain')
    expect(fakes.background.setDim).toHaveBeenCalledWith(45)
  })
})

describe('icon route', () => {
  it('serves a plain host', async () => {
    const res = await get('lumina://icon/github.com')
    expect(res.status).toBe(200)
    expect(fakes.favicons.response).toHaveBeenCalledWith('github.com')
  })

  it('refuses a path that tries to walk out of the icon directory', async () => {
    for (const path of ['../../etc/passwd', '..%2f..%2fetc', 'a/b', 'host/../..']) {
      const res = await get(`lumina://icon/${path}`)
      expect(res.status, path).toBe(404)
    }
    expect(fakes.favicons.response).not.toHaveBeenCalled()
  })
})

describe('content security policy', () => {
  it('is sent on every response, including errors', async () => {
    const responses = [
      await get('lumina://home/'),
      await get('lumina://home/background'),
      await get('lumina://nope/'),
      await get('lumina://home/appearance/dark'),
      await get(signed('lumina://home/appearance/dark'))
    ]
    for (const res of responses) {
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    }
  })

  it("lets the start page load its own background and icons", async () => {
    // lumina://home, lumina://bg and lumina://icon are separate origins because
    // the host differs, so 'self' alone silently blanks the background and every
    // tile icon. That shipped once; this is the test that catches it.
    const csp = (await get('lumina://home/')).headers.get('content-security-policy') ?? ''
    const directive = (name: string): string =>
      csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name)) ?? ''

    expect(directive('img-src')).toContain('lumina:')
    expect(directive('connect-src')).toContain('lumina:')
  })

  it("forbids being framed, which is the vector will-navigate cannot see", async () => {
    const csp = (await get('lumina://home/')).headers.get('content-security-policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
  })
})

describe('the games play route', () => {
  it('sends the tab to the game and switches gaming mode on', async () => {
    const res = await get(signed('lumina://home/games/play/minecraft-classic'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://classic.minecraft.net')
    expect(fakes.gaming.on).toHaveBeenCalled()
  })

  it('refuses an unsigned request, like every other writing route', async () => {
    const res = await get('lumina://home/games/play/minecraft-classic')
    expect(res.status).toBe(403)
    expect(fakes.gaming.on).not.toHaveBeenCalled()
  })

  it('404s an id that is not in the catalogue', async () => {
    // The id names a fixed entry; it is never treated as a URL of its own, so
    // this route cannot be turned into a redirect out of the scheme.
    const res = await get(signed('lumina://home/games/play/not-a-game'))
    expect(res.status).toBe(404)
    expect(fakes.gaming.on).not.toHaveBeenCalled()
  })
})
