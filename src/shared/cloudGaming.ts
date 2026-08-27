import { hostOf } from './blocking'

/**
 * The cloud gaming services, where a real game runs on someone else's hardware
 * and arrives in the tab as a video stream.
 *
 * These pages need two things ordinary browsing does not: the keyboard locked,
 * so Esc opens the in-game menu instead of dropping out of fullscreen, and the
 * ad blocker out of the way, since a stream's session management is hard to
 * tell apart from telemetry and cancelling the wrong request kills the session.
 *
 * Deliberately a short, hand-checked list rather than a heuristic: both of the
 * things it unlocks are worth granting to a service you chose to visit and not
 * worth granting to any page that happens to look like a game.
 */
interface CloudGamingSite {
  name: string
  /** Matches this host exactly, or any subdomain of it. */
  host: string
  /**
   * Restricts the match to one part of a larger site. Microsoft streams from a
   * path under its main marketing domain, and the rest of xbox.com is an
   * ordinary website that should be treated like one.
   */
  path?: string
}

const CLOUD_GAMING_SITES: readonly CloudGamingSite[] = [
  { name: 'GeForce NOW', host: 'geforcenow.com' },
  // The stream itself comes from NVIDIA's session hosts, not the play domain.
  { name: 'GeForce NOW', host: 'nvidiagrid.net' },
  { name: 'Xbox Cloud Gaming', host: 'xbox.com', path: '/play' },
  { name: 'Amazon Luna', host: 'luna.amazon.com' },
  { name: 'Amazon Luna', host: 'luna.amazon.co.uk' },
  { name: 'Boosteroid', host: 'boosteroid.com' },
  { name: 'Shadow', host: 'shadow.tech' }
]

/**
 * Drop a leading locale segment. Microsoft serves the streaming page as
 * `/play`, `/en-GB/play` and `/pt-BR/play` alike, so a plain prefix test on
 * the path would only recognise whichever spelling the redirect happened to
 * land on.
 */
function withoutLocale(path: string): string {
  return path.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i, '')
}

/** The service streaming this URL, or null for anywhere else on the web. */
export function cloudGamingService(url: string): string | null {
  const host = hostOf(url)
  if (host === null) return null

  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }

  for (const site of CLOUD_GAMING_SITES) {
    if (host !== site.host && !host.endsWith(`.${site.host}`)) continue
    if (site.path !== undefined && !withoutLocale(path).startsWith(site.path)) continue
    return site.name
  }
  return null
}

/** Whether this URL is a cloud gaming page at all. */
export function isCloudGaming(url: string): boolean {
  return cloudGamingService(url) !== null
}
