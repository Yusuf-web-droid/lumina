/**
 * The blocking decision, as pure functions.
 *
 * No Electron import, so it stays unit-testable and can be exercised without a
 * browser. The domain table is a parameter rather than an import for two
 * reasons: tests run against a small fixture, so regenerating the real list
 * never churns them; and `electron.vite.config.ts` gives every preload its own
 * copy of any `@shared/*` module it pulls in, so a shared module must not drag
 * a data table behind it.
 */

/**
 * Resource types the blocker will never cancel.
 *
 * Only top-level navigation. Everything else on a known tracker domain is fair
 * game, but cancelling a main-frame load leaves a dead tab on an error page,
 * which is the worst failure a blocker has — and it would mean typing a
 * tracker's domain in the address bar could not reach it. Deliberately not a
 * general escape hatch: scripts, images, XHR, subframes, beacons and the rest
 * are all blockable.
 */
export const NEVER_BLOCKED_TYPES: ReadonlySet<string> = new Set(['mainFrame'])

/** Schemes worth inspecting at all. `lumina:`, `data:` and `blob:` are not. */
const WEB_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:'])

/**
 * Two-label public suffixes, so `bbc.co.uk` is not mistaken for `co.uk`.
 *
 * Deliberately short rather than the full Public Suffix List, which is ~230 KB
 * and changes monthly. The error is asymmetric, which is what makes a partial
 * list safe here: this is used only to grant the first-party exemption, and the
 * exemption only ever *allows*. A missing entry makes two sites look like the
 * same party, so it under-blocks — harmless. A wrong entry narrows first-party
 * and would over-block, which breaks pages. So when in doubt, leave it out.
 */
const MULTI_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz',
  'co.za', 'org.za',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve',
  'com.tr', 'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.hk', 'com.tw', 'com.sg', 'com.my', 'com.ph', 'com.vn',
  'com.pk', 'com.bd', 'com.ua', 'com.ru', 'com.pl', 'com.es',
  'co.il', 'co.id', 'co.th', 'or.th',
  'github.io', 'blogspot.com', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app'
])

/** Lowercased hostname with any leading "www.", or null for a non-web URL. */
export function hostOf(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!WEB_SCHEMES.has(parsed.protocol)) return null
  const host = parsed.hostname.toLowerCase()
  return host || null
}

/**
 * The registrable domain ("eTLD+1"), approximated with the suffix set above.
 *
 * Used for two things that must agree: deciding whether a request is
 * first-party, and keying the per-site off switch. Both live here so they
 * cannot drift apart.
 */
export function registrableDomain(host: string): string | null {
  if (!host) return null
  // An IP literal is never a registrable domain; treat it as its own party.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host

  const labels = host.split('.')
  if (labels.length < 2) return null

  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.length < 3 ? host : labels.slice(-3).join('.')
  }
  return lastTwo
}

/**
 * The tracker's owner if this host is on the list, walking parent domains.
 *
 * Same walk as `brandFor()` in main/brandMarks, and safe the same way: it only
 * ever joins whole labels, so `doubleclick.net.evil.example` matches nothing,
 * and neither does `notdoubleclick.net`.
 */
export function trackerOwner(
  host: string,
  domains: Readonly<Record<string, number>>,
  owners: readonly string[]
): string | null {
  if (!host) return null
  const labels = host.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const index = domains[labels.slice(i).join('.')]
    // A number check rather than truthiness: index 0 is a real owner, and it
    // also means an inherited property like "constructor" cannot match.
    if (typeof index === 'number') return owners[index] ?? null
  }
  return null
}

/**
 * The whole decision: the owner's name when the request should be cancelled,
 * or null to let it through.
 *
 * Ordered cheapest-first, because this runs on every single request.
 */
export function shouldBlock(
  requestURL: string,
  pageURL: string,
  resourceType: string,
  domains: Readonly<Record<string, number>>,
  owners: readonly string[]
): string | null {
  if (NEVER_BLOCKED_TYPES.has(resourceType)) return null

  const requestHost = hostOf(requestURL)
  if (requestHost === null) return null

  const owner = trackerOwner(requestHost, domains, owners)
  if (owner === null) return null // the common case, and the cheapest exit

  const pageHost = hostOf(pageURL)
  if (pageHost !== null) {
    // First-party exemption: a site may always talk to itself.
    const requestSite = registrableDomain(requestHost)
    const pageSite = registrableDomain(pageHost)
    if (requestSite !== null && requestSite === pageSite) return null

    // Same-owner exemption. Companies split their tracking onto a separate
    // registrable domain — Meta's SDK is on facebook.net, not facebook.com —
    // so an eTLD+1 comparison alone would call a company's own script a
    // third-party tracker while you are standing on its site. Blocking it
    // there is both wrong and the kind of breakage that loses trust.
    if (trackerOwner(pageHost, domains, owners) === owner) return null
  }

  return owner
}
