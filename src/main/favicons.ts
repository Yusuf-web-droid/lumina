import { app, nativeImage, net } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSONStore } from './store'

/** Icons are stored square at this size — sharp on a 46px tile at 2x. */
const ICON_SIZE = 128

/** Refuse anything implausible for an icon, so a bad URL cannot fill the disk. */
const MAX_BYTES = 1024 * 1024

const SUCCESS_TTL = 14 * 24 * 60 * 60 * 1000
const FAILURE_TTL = 24 * 60 * 60 * 1000

const REQUEST_TIMEOUT = 6000
const CONCURRENCY = 4

/** What a cached icon can be. Anything else is converted to PNG. */
const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

interface Entry {
  /** Filename inside the cache directory, or null if the fetch failed. */
  file: string | null
  /** When this entry was last written, for the refresh TTL. */
  at: number
}

interface FaviconData {
  entries: Record<string, Entry>
}

/** Hostnames become filenames, so only ever accept a plain DNS name. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export function hostOf(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') return null
    const host = hostname.toLowerCase()
    return HOST.test(host) ? host : null
  } catch {
    return null
  }
}

interface Candidate {
  url: string
  /** Rough pixel size, used to try the largest icon first. */
  score: number
}

/**
 * The site icons shown on the start page.
 *
 * Icons are fetched from each site directly — never through a third-party
 * favicon service — and cached in userData, so the start page renders from
 * disk and works offline. Sites with no usable icon fall back to their bundled
 * brand glyph, and then to a letter tile; see ./brandMarks.
 */
export class Favicons {
  private store = new JSONStore<FaviconData>('favicons.json', { entries: {} })
  private inFlight = new Set<string>()

  private dir(): string {
    const dir = join(app.getPath('userData'), 'favicons')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /** Absolute path of the cached icon for a URL, if one was fetched. */
  path(url: string): string | null {
    const host = hostOf(url)
    if (!host) return null
    const file = this.store.get().entries[host]?.file
    if (!file) return null
    const full = join(this.dir(), file)
    return existsSync(full) ? full : null
  }

  /** The cached icon as an HTTP response, for the nexus://icon route. */
  response(host: string): Response {
    const path = HOST.test(host) ? this.path(`https://${host}`) : null
    if (!path) return new Response('No icon', { status: 404 })
    try {
      const bytes = readFileSync(path)
      const type = TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream'
      return new Response(new Uint8Array(bytes), {
        headers: { 'content-type': type, 'cache-control': 'no-cache' }
      })
    } catch {
      return new Response('Unreadable', { status: 500 })
    }
  }

  /** The cached icon inlined, for windows the nexus:// scheme is not served to. */
  dataUrl(url: string): string | null {
    const path = this.path(url)
    if (!path) return null
    try {
      const type = TYPES[path.slice(path.lastIndexOf('.'))]
      if (!type) return null
      return `data:${type};base64,${readFileSync(path).toString('base64')}`
    } catch {
      return null
    }
  }

  /**
   * Fetch any icon that is missing or stale, a few at a time.
   *
   * The start page treats this as fire-and-forget — new icons simply appear the
   * next time it is opened — but the returned promise lets a caller that paints
   * a fixed set of icons, like the side panel's rail, repaint as soon as the
   * fetches land. It resolves once this call's fetches are done; icons already
   * being fetched for another caller are not waited on.
   */
  async refresh(urls: string[]): Promise<void> {
    const now = Date.now()
    const { entries } = this.store.get()

    const stale = [...new Set(urls.map(hostOf).filter((h): h is string => h !== null))].filter(
      (host) => {
        if (this.inFlight.has(host)) return false
        const entry = entries[host]
        if (!entry) return true
        const ttl = entry.file ? SUCCESS_TTL : FAILURE_TTL
        return now - entry.at > ttl || (entry.file !== null && !this.path(`https://${host}`))
      }
    )

    for (const host of stale) this.inFlight.add(host)

    const queue = [...stale]
    const worker = async (): Promise<void> => {
      for (let host = queue.shift(); host; host = queue.shift()) {
        try {
          await this.fetchFor(host)
        } catch (err) {
          console.error(`[favicons] ${host}:`, err)
          this.record(host, null)
        } finally {
          this.inFlight.delete(host)
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    await Promise.all(workers)
  }

  private async fetchFor(host: string): Promise<void> {
    const candidates = await this.candidates(host)

    let best: { bytes: Buffer; ext: string; width: number } | null = null
    for (const candidate of candidates) {
      const icon = await this.download(candidate.url)
      if (!icon) continue
      if (!best || icon.width > best.width) best = icon
      if (best.width >= ICON_SIZE) break
    }

    if (!best) {
      this.record(host, null)
      return
    }

    const file = `${host}${best.ext}`
    const full = join(this.dir(), file)
    const tmp = `${full}.tmp`
    writeFileSync(tmp, best.bytes)
    renameSync(tmp, full) // atomic, so a half-written icon is never served

    const previous = this.store.get().entries[host]?.file
    if (previous && previous !== file) {
      try {
        unlinkSync(join(this.dir(), previous))
      } catch {
        /* already gone */
      }
    }

    this.record(host, file)
  }

  /** Icons declared by the page, largest first, then the conventional paths. */
  private async candidates(host: string): Promise<Candidate[]> {
    const origin = `https://${host}`
    const declared: Candidate[] = []

    try {
      const response = await this.request(origin, 'text/html')
      if (response?.ok) {
        const html = (await response.text()).slice(0, 300_000)
        const base = response.url || origin

        for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
          const rel = attr(tag, 'rel')?.toLowerCase()
          const href = attr(tag, 'href')
          if (!rel || !href || !/\b(?:shortcut )?icon\b/.test(rel)) continue

          let url: string
          try {
            url = new URL(href, base).toString()
          } catch {
            continue
          }
          if (!url.startsWith('http')) continue

          const sizes = attr(tag, 'sizes')?.toLowerCase() ?? ''
          const declaredSize = Math.max(0, ...(sizes.match(/\d+/g) ?? []).map(Number))
          const score = /\.svg(?:$|\?)/i.test(url)
            ? 1000
            : declaredSize || (rel.includes('apple-touch-icon') ? 180 : 32)

          declared.push({ url, score })
        }
      }
    } catch {
      /* no markup to go on — fall through to the conventional paths */
    }

    declared.sort((a, b) => b.score - a.score)

    return [
      ...declared.slice(0, 4),
      { url: `${origin}/apple-touch-icon.png`, score: 180 },
      { url: `${origin}/apple-touch-icon-precomposed.png`, score: 180 },
      { url: `${origin}/favicon.ico`, score: 32 }
    ]
  }

  /** Download one candidate and normalise it to a PNG, or pass SVG through. */
  private async download(
    url: string
  ): Promise<{ bytes: Buffer; ext: string; width: number } | null> {
    const response = await this.request(url, 'image/*')
    if (!response?.ok) return null

    const type = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (type && !type.startsWith('image/')) return null

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null

    // SVG is already resolution-independent, so it is stored untouched.
    if (type.includes('svg') || /\.svg(?:$|\?)/i.test(url)) {
      if (!/<svg[\s>]/i.test(bytes.subarray(0, 2048).toString('utf8'))) return null
      return { bytes, ext: '.svg', width: 1000 }
    }

    // nativeImage cannot decode .ico on macOS, but Chromium renders one
    // happily — and picks the sharpest frame in it — so a well-formed icon
    // file is stored as it came.
    const ico = icoWidth(bytes)
    if (ico) return { bytes, ext: '.ico', width: ico }

    // Everything else goes through nativeImage, which normalises the many
    // formats sites serve into the one we store.
    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) return null

    const { width, height } = image.getSize()
    if (width < 16 || height < 16) return null

    const sized = width > ICON_SIZE ? image.resize({ width: ICON_SIZE, quality: 'best' }) : image
    return { bytes: sized.toPNG(), ext: '.png', width: Math.min(width, ICON_SIZE) }
  }

  private async request(url: string, accept: string): Promise<Response | null> {
    try {
      return await net.fetch(url, {
        headers: { accept, 'user-agent': app.userAgentFallback },
        credentials: 'omit',
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
    } catch {
      return null
    }
  }

  private record(host: string, file: string | null): void {
    this.store.update((d) => {
      d.entries[host] = { file, at: Date.now() }
    })
  }

  flush(): void {
    this.store.flush()
  }
}

/**
 * The largest frame declared in an .ico, or null if these are not the bytes of
 * one. Only the directory is read — Chromium does the decoding.
 */
function icoWidth(bytes: Buffer): number | null {
  if (bytes.byteLength < 22) return null
  if (bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null

  const count = bytes.readUInt16LE(4)
  if (count === 0 || bytes.byteLength < 6 + count * 16) return null

  let largest = 0
  for (let i = 0; i < count; i++) {
    const width = bytes[6 + i * 16]!
    largest = Math.max(largest, width === 0 ? 256 : width) // 0 means 256
  }
  return largest >= 16 ? largest : null
}

/** Read an attribute out of a single tag. */
function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag)
  return match ? (match[2] ?? match[3] ?? match[4] ?? null) : null
}

let shared: Favicons | null = null

/** Single shared instance — the protocol handler and the window both read it. */
export function faviconStore(): Favicons {
  if (!shared) shared = new Favicons()
  return shared
}
