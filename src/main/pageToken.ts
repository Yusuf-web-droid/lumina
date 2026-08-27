import { randomUUID } from 'node:crypto'

/**
 * A secret minted once per run and embedded in the pages the main process
 * generates, so a privileged `lumina://` route can tell a request from our own
 * start page apart from one another origin caused.
 *
 * Chromium sends no Sec-Fetch-* headers for a custom scheme, so there is no
 * request metadata to key on. This is what fills that gap: another origin
 * cannot read our page to learn the token, and a no-cors request cannot set a
 * non-safelisted header to send one.
 *
 * The weather widget has used this since it was written. It now also guards
 * every route that changes state, because those are reached by ordinary link
 * navigation and would otherwise fire for any page that can point a tab at
 * them — including `background/choose`, which opens a native file dialog.
 *
 * Two ways to present it, because the two callers differ:
 *
 *   - `x-lumina-token`, for the widget's `fetch()` calls.
 *   - a `t=` query parameter, for `<a href>` links, which cannot set a header.
 *
 * Rotating per run is deliberate. A token that outlived the process would have
 * to be stored somewhere, and nothing needs it to: the pages that carry it are
 * regenerated on every request.
 */
const TOKEN = randomUUID()

/** The header a generated page's `fetch()` must send. */
export const TOKEN_HEADER = 'x-lumina-token'

/** The query parameter a generated page's links must carry. */
export const TOKEN_PARAM = 't'

export function pageToken(): string {
  return TOKEN
}

/** Append the token to a `lumina://` link that will change state when followed. */
export function signRoute(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${TOKEN_PARAM}=${encodeURIComponent(TOKEN)}`
}

/**
 * Whether a request carries the token, by either route.
 *
 * Compared with a plain `!==`. A timing-safe compare would be theatre here: the
 * attacker is a web page that cannot read the response, so it has no oracle to
 * time against in the first place.
 */
export function hasValidToken(request: Request, url: URL): boolean {
  if (request.headers.get(TOKEN_HEADER) === TOKEN) return true
  return url.searchParams.get(TOKEN_PARAM) === TOKEN
}
