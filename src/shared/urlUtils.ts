/**
 * Pure URL helpers. No Electron imports here so this stays unit-testable
 * and usable from both the main process and the chrome UI.
 */

export const DEFAULT_SEARCH_TEMPLATE = 'https://www.google.com/search?q='

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i

/** Schemes we will hand to the tab as-is. */
const NAVIGABLE_SCHEMES = new Set([
  'nexus:',
  'http:',
  'https:',
  'file:',
  'about:',
  'data:',
  'blob:',
  'view-source:'
])

/** Schemes a page is allowed to navigate itself to. Deliberately narrower. */
const SAFE_NAVIGATION_SCHEMES = new Set(['http:', 'https:', 'about:', 'blob:', 'nexus:'])

/**
 * Real schemes this browser will not open. Needed because the scheme regex also
 * matches a bare "host:port" — "localhost:3000" looks exactly like "scheme:rest".
 * Anything matching the regex that is neither navigable nor listed here falls
 * through to hostname parsing, which resolves the host:port case correctly.
 */
const NON_WEB_SCHEMES = new Set([
  'mailto:',
  'tel:',
  'sms:',
  'javascript:',
  'chrome:',
  'chrome-extension:',
  'ftp:',
  'ws:',
  'wss:',
  'magnet:'
])

function isIPv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

/**
 * Decide whether what the user typed is a URL or a search query.
 *
 * Rules, in order:
 *   known scheme            -> use verbatim         ("about:blank", "https://x.dev/a?b=c")
 *   contains whitespace     -> search               ("how tall is everest")
 *   localhost or an IPv4    -> http://              ("localhost:3000", "127.0.0.1")
 *   dotted host + alpha TLD -> https://             ("example.com", "x.dev/a?b=c")
 *   anything else           -> search               ("3.14", "hello")
 */
export function normalizeInput(raw: string, searchTemplate: string = DEFAULT_SEARCH_TEMPLATE): string {
  const input = raw.trim()
  if (!input) return 'about:blank'

  const search = (): string => searchTemplate + encodeURIComponent(input)

  const schemeMatch = SCHEME_RE.exec(input)
  if (schemeMatch) {
    const scheme = `${schemeMatch[1].toLowerCase()}:`
    if (NAVIGABLE_SCHEMES.has(scheme)) return input
    // A scheme we will not open, or an explicit "scheme://" we do not support.
    if (NON_WEB_SCHEMES.has(scheme) || input.slice(scheme.length).startsWith('//')) return search()
    // Otherwise this is probably "host:port" — keep going and parse it as a host.
  }

  if (input.startsWith('//')) return `https:${input}`

  // Whitespace anywhere means it cannot be a bare hostname.
  if (/\s/.test(input)) return search()

  // Inspect only the authority, ignoring any path, query or fragment.
  const authority = input.split(/[/?#]/)[0] ?? ''
  const afterUserInfo = authority.split('@').pop() ?? authority
  const host = afterUserInfo.replace(/:\d+$/, '')

  if (host === 'localhost') return `http://${input}`
  if (isIPv4(host)) return `http://${input}`

  const labels = host.split('.')
  if (labels.length >= 2 && labels.every((l) => l.length > 0)) {
    const tld = labels[labels.length - 1] ?? ''
    if (/^[a-z]{2,}$/i.test(tld)) return `https://${input}`
  }

  return search()
}

/** True if a page-initiated navigation to this URL should be allowed. */
export function isSafeNavigation(url: string): boolean {
  try {
    return SAFE_NAVIGATION_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

/** Shortened form for the address bar: drops the scheme and a leading "www.". */
export function prettyURL(url: string): string {
  if (!url || url === 'about:blank' || url.startsWith('nexus:')) return ''
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return url
    const host = u.host.replace(/^www\./, '')
    const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`
    return host + rest
  } catch {
    return url
  }
}

/** Human-readable fallback title for a tab that has not reported one yet. */
export function hostLabel(url: string): string {
  if (url.startsWith('nexus:')) return 'New Tab'
  try {
    return new URL(url).host.replace(/^www\./, '') || 'New Tab'
  } catch {
    return 'New Tab'
  }
}
