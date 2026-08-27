import { describe, expect, it } from 'vitest'
import { TRACKER_DOMAINS, TRACKER_OWNERS } from '../main/blocklistData'
import {
  hostOf,
  NEVER_BLOCKED_TYPES,
  registrableDomain,
  shouldBlock,
  trackerOwner
} from './blocking'

/** A fixture, so behaviour tests do not churn when the real list changes. */
const OWNERS = ['Google', 'Meta', 'BBC']
const DOMAINS = {
  'doubleclick.net': 0,
  'google-analytics.com': 0,
  'facebook.net': 1,
  'facebook.com': 1,
  'bbc.co.uk': 2
}

const block = (req: string, page: string, type = 'script'): string | null =>
  shouldBlock(req, page, type, DOMAINS, OWNERS)

describe('hostOf', () => {
  it('returns the lowercased host of a web URL', () => {
    expect(hostOf('https://Example.COM/a/b?c=1')).toBe('example.com')
    expect(hostOf('ws://sockets.example.com')).toBe('sockets.example.com')
  })

  it('ignores schemes that are not web requests', () => {
    expect(hostOf('lumina://home/weather')).toBeNull()
    expect(hostOf('data:text/html,hi')).toBeNull()
    expect(hostOf('about:blank')).toBeNull()
    expect(hostOf('blob:https://x.dev/abc')).toBeNull()
  })

  it('returns null rather than throwing on nonsense', () => {
    expect(hostOf('not a url')).toBeNull()
    expect(hostOf('')).toBeNull()
  })
})

describe('registrableDomain', () => {
  it('strips subdomains', () => {
    expect(registrableDomain('www.example.com')).toBe('example.com')
    expect(registrableDomain('a.b.c.example.com')).toBe('example.com')
  })

  it('keeps a bare registrable domain', () => {
    expect(registrableDomain('example.com')).toBe('example.com')
  })

  it('handles a two-label public suffix', () => {
    expect(registrableDomain('sport.bbc.co.uk')).toBe('bbc.co.uk')
    expect(registrableDomain('bbc.co.uk')).toBe('bbc.co.uk')
  })

  it('treats an IP literal as its own party', () => {
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1')
  })

  it('returns null when there is no domain to speak of', () => {
    expect(registrableDomain('localhost')).toBeNull()
    expect(registrableDomain('')).toBeNull()
  })
})

describe('trackerOwner', () => {
  const owner = (host: string): string | null => trackerOwner(host, DOMAINS, OWNERS)

  it('matches a listed domain', () => {
    expect(owner('doubleclick.net')).toBe('Google')
  })

  it('matches a subdomain against its parent', () => {
    expect(owner('stats.g.doubleclick.net')).toBe('Google')
  })

  it('does not match a lookalike suffix', () => {
    expect(owner('doubleclick.net.evil.example')).toBeNull()
  })

  it('does not match a lookalike prefix', () => {
    expect(owner('notdoubleclick.net')).toBeNull()
  })

  it('does not match an inherited object property', () => {
    expect(owner('constructor')).toBeNull()
    expect(owner('toString')).toBeNull()
  })

  it('returns null for anything unlisted', () => {
    expect(owner('example.com')).toBeNull()
    expect(owner('')).toBeNull()
  })
})

describe('shouldBlock', () => {
  it('blocks a tracker script on an unrelated page', () => {
    expect(block('https://www.google-analytics.com/analytics.js', 'https://news.example/')).toBe(
      'Google'
    )
  })

  it('never blocks a top-level navigation, even straight to a tracker', () => {
    expect(block('https://doubleclick.net/', 'https://news.example/', 'mainFrame')).toBeNull()
    expect(NEVER_BLOCKED_TYPES.has('mainFrame')).toBe(true)
  })

  it.each([
    'script',
    'image',
    'xhr',
    'subFrame',
    'ping',
    'cspReport',
    'media',
    'font',
    'stylesheet',
    'object',
    'webSocket',
    'other'
  ])('blocks a tracker loaded as %s', (type) => {
    expect(block('https://doubleclick.net/x', 'https://news.example/', type)).toBe('Google')
  })

  it('exempts a site talking to itself', () => {
    expect(block('https://pixel.facebook.com/tr', 'https://www.facebook.com/feed')).toBeNull()
  })

  it("exempts a company's own script on its own site, across its two domains", () => {
    // Meta serves its SDK from facebook.net, so an eTLD+1 test alone would call
    // it third-party while you are standing on facebook.com.
    expect(block('https://connect.facebook.net/sdk.js', 'https://www.facebook.com/feed')).toBeNull()
  })

  it('still blocks that same script on someone else\'s site', () => {
    expect(block('https://connect.facebook.net/sdk.js', 'https://news.example/')).toBe('Meta')
  })

  it('exempts first-party across subdomains and a two-label suffix', () => {
    expect(block('https://static.bbc.co.uk/x.js', 'https://www.bbc.co.uk/news')).toBeNull()
  })

  it('still blocks the same domain as a third party elsewhere', () => {
    expect(block('https://static.bbc.co.uk/x.js', 'https://news.example/')).toBe('BBC')
  })

  it('allows an unlisted third party', () => {
    expect(block('https://cdn.example.org/lib.js', 'https://news.example/')).toBeNull()
  })

  it('ignores non-web schemes entirely, so the start page is never touched', () => {
    expect(block('lumina://home/weather', 'lumina://home/')).toBeNull()
    expect(block('data:text/javascript,1', 'https://news.example/')).toBeNull()
  })

  it('does not throw on unparseable or missing input', () => {
    expect(block('not a url', 'https://news.example/')).toBeNull()
    expect(block('https://doubleclick.net/x', '')).toBe('Google')
    expect(block('', '')).toBeNull()
  })
})

describe('the shipped blocklist', () => {
  const entries = Object.entries(TRACKER_DOMAINS)

  it('is not empty and covers the domains that matter most', () => {
    expect(entries.length).toBeGreaterThan(150)
    for (const sentinel of [
      'doubleclick.net',
      'google-analytics.com',
      'googletagmanager.com',
      'criteo.com',
      'scorecardresearch.com'
    ]) {
      expect(TRACKER_DOMAINS[sentinel], sentinel).toBeTypeOf('number')
    }
  })

  it('contains only plain lowercase DNS names — no paths, ports or wildcards', () => {
    for (const [domain] of entries) {
      expect(domain, domain).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)
    }
  })

  it('maps every domain to a real owner', () => {
    for (const [domain, index] of entries) {
      expect(index, domain).toBeTypeOf('number')
      expect(TRACKER_OWNERS[index], domain).toBeTruthy()
    }
  })

  it('has no entry a parent entry already covers', () => {
    const all = new Set(Object.keys(TRACKER_DOMAINS))
    for (const domain of all) {
      const labels = domain.split('.')
      for (let i = 1; i < labels.length - 1; i++) {
        const parent = labels.slice(i).join('.')
        expect(all.has(parent), `${domain} is redundant: ${parent} already covers it`).toBe(false)
      }
    }
  })

  it('does not block infrastructure that pages need to work', () => {
    // Blocking any of these breaks pages rather than cleaning them up.
    for (const host of [
      'cdnjs.cloudflare.com',
      'cdn.jsdelivr.net',
      'unpkg.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'www.google.com',
      'accounts.google.com',
      'js.stripe.com',
      'www.paypal.com',
      'cookielaw.org',
      'cookiebot.com',
      'www.youtube.com',
      'onesignal.com'
    ]) {
      expect(trackerOwner(host, TRACKER_DOMAINS, TRACKER_OWNERS), host).toBeNull()
    }
  })
})
