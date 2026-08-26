import { app, type Session } from 'electron'

/**
 * Make requests look like ordinary Chrome.
 *
 * Two separate problems, both of which make Google refuse to sign you in with
 * "this browser or app may not be secure":
 *
 *   1. Electron's user agent carries "Electron/x.y" and the app name.
 *   2. Electron sends *no* User-Agent Client Hints at all, while real Chrome
 *      always sends Sec-CH-UA, Sec-CH-UA-Mobile and Sec-CH-UA-Platform. A
 *      Chrome UA with no client hints is a contradiction, and sign-in flows
 *      treat that as an embedded browser.
 *
 * Fixing only the user agent is not enough; the hints have to match it.
 */

/** Strip the Electron and app-name tokens, leaving the genuine Chrome UA. */
export function cleanUserAgent(): string {
  return app.userAgentFallback
    .replace(/\s*Electron\/[^\s]+/, '')
    .replace(new RegExp(`\\s*${app.getName()}\\/[^\\s]+`), '')
}

function chromeMajorVersion(userAgent: string): string {
  return /Chrome\/(\d+)/.exec(userAgent)?.[1] ?? '150'
}

function platformBrand(): string {
  if (process.platform === 'darwin') return 'macOS'
  if (process.platform === 'win32') return 'Windows'
  return 'Linux'
}

/**
 * Attach the client hints Chrome would send. The "Not)A;Brand" entry is the
 * deliberate junk brand Chrome includes so servers cannot assume a fixed list.
 */
export function applyClientHints(session: Session, userAgent: string): void {
  const major = chromeMajorVersion(userAgent)
  const brands = `"Not)A;Brand";v="8", "Chromium";v="${major}", "Google Chrome";v="${major}"`
  const platform = `"${platformBrand()}"`

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders

    // Only add hints for secure origins, matching Chrome's own behaviour.
    if (details.url.startsWith('https://')) {
      const existing = Object.keys(headers)
      const has = (name: string): boolean =>
        existing.some((k) => k.toLowerCase() === name.toLowerCase())

      if (!has('Sec-CH-UA')) headers['Sec-CH-UA'] = brands
      if (!has('Sec-CH-UA-Mobile')) headers['Sec-CH-UA-Mobile'] = '?0'
      if (!has('Sec-CH-UA-Platform')) headers['Sec-CH-UA-Platform'] = platform
    }

    // Belt and braces: never let the Electron token leak via any header.
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string' && value.includes('Electron')) {
        headers[key] = value.replace(/\s*"?Electron"?[^,]*,?\s*/g, '').trim()
      }
    }

    callback({ requestHeaders: headers })
  })
}
