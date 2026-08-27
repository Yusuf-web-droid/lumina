import { session, type WebContents } from 'electron'
import { hostOf, registrableDomain, shouldBlock } from '@shared/blocking'
import { isCloudGaming } from '@shared/cloudGaming'
// The shield's payload crosses to the renderer, so its shape is declared once
// in @shared/types rather than being restated here.
import type { BlockingDetails } from '@shared/types'
import { TRACKER_DOMAINS, TRACKER_OWNERS } from './blocklistData'
import { JSONStore } from './store'
import { PARTITION } from './tabs'

interface BlockerData {
  /** Master switch, from View -> Block Ads and Trackers. */
  enabled: boolean
  /** Registrable domains the user has switched blocking off for. */
  allowed: string[]
}

/** What one watched page has blocked since it committed. */
interface PageRecord {
  url: string
  blocking: boolean
  blocked: number
  owners: Map<string, number>
}

export interface BlockingState {
  blocked: number
  blocking: boolean
}

/**
 * Bursts of blocked requests must not each cause a snapshot broadcast. A heavy
 * page blocks 50-150 requests in a couple of seconds, and the chrome rebuilds
 * its tab strip on every snapshot. Leading edge, so the badge appears at once,
 * then at most one repaint per interval.
 */
const NOTIFY_MS = 400

/**
 * Cancels requests to known ad and tracker domains.
 *
 * The decision itself is in `@shared/blocking` and is unit-tested; this class
 * is the plumbing around it — which session it listens on, which WebContents it
 * is willing to block for, and what the UI gets told.
 */
export class Blocker {
  private readonly store = new JSONStore<BlockerData>('blocking.json', {
    enabled: true,
    allowed: []
  })

  /** Watched pages, keyed by `webContents.id`. */
  private readonly pages = new Map<number, PageRecord>()

  private onChange: () => void = () => {}
  private timer: NodeJS.Timeout | null = null
  private dirty = false
  private attached = false

  /** Called by the window, so a blocked request can repaint the shield. */
  setOnChange(fn: () => void): void {
    this.onChange = fn
  }

  attach(): void {
    if (this.attached) return
    this.attached = true

    // onBeforeRequest is free. onBeforeSendHeaders is NOT — applyClientHints()
    // owns it, and Electron allows one listener per event per session. Touching
    // it would break the client hints that keep Google sign-in working.
    session
      .fromPartition(PARTITION)
      .webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        callback(this.decide(details) === null ? {} : { cancel: true })
      })
  }

  /**
   * Start blocking for a tab.
   *
   * Anything not watched is never blocked. That is what keeps the side panel
   * out of it: pinned tools share the tab session, so their requests reach this
   * listener, but they are sign-in-gated app surfaces with no first-party page
   * context, and silently breaking them would be reckless.
   */
  watch(wc: WebContents): void {
    const id = wc.id
    this.reset(id, wc.getURL())

    // Set the first-party URL before the document commits, so a redirect chain
    // cannot leave a stale page URL in the record.
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.reset(id, details.url)
    })
    wc.on('did-navigate', (_event, url) => this.reset(id, url))
    wc.once('destroyed', () => this.pages.delete(id))
  }

  stateFor(webContentsId: number): BlockingState {
    const page = this.pages.get(webContentsId)
    if (!page) return { blocked: 0, blocking: false }
    return { blocked: page.blocked, blocking: page.blocking }
  }

  detailsFor(webContentsId: number): BlockingDetails {
    const page = this.pages.get(webContentsId)
    const site = page ? registrableDomain(hostOf(page.url) ?? '') : null
    const data = this.store.get()

    const reason: BlockingDetails['reason'] = !site
      ? 'not-web'
      : !data.enabled
        ? 'disabled'
        : page && isCloudGaming(page.url)
          ? 'cloud-gaming'
          : data.allowed.includes(site)
            ? 'site-allowed'
            : 'on'

    const owners = page
      ? [...page.owners.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
      : []

    return { site, blocking: page?.blocking ?? false, reason, blocked: page?.blocked ?? 0, owners }
  }

  /**
   * Turn blocking on or off for the site a tab is on. Returns false when there
   * is no site to speak of, so the caller knows not to reload.
   *
   * Keyed by registrable domain, so switching it off for www.bbc.co.uk also
   * covers sport.bbc.co.uk — which is what "this site" means to a person, and
   * it stops the list filling with near-duplicates.
   */
  toggleSite(url: string): boolean {
    const site = registrableDomain(hostOf(url) ?? '')
    if (!site) return false

    this.store.update((data) => {
      const at = data.allowed.indexOf(site)
      if (at === -1) data.allowed.push(site)
      else data.allowed.splice(at, 1)
    })
    // A deliberate setting should survive a crash in the next 250 ms.
    this.store.flush()

    // Other open tabs on the same site pick it up without needing a reload.
    for (const page of this.pages.values()) {
      if (registrableDomain(hostOf(page.url) ?? '') === site) {
        page.blocking = this.blockingFor(page.url)
      }
    }
    return true
  }

  enabled(): boolean {
    return this.store.get().enabled
  }

  setEnabled(value: boolean): void {
    this.store.update((data) => {
      data.enabled = value
    })
    this.store.flush()
    for (const page of this.pages.values()) page.blocking = this.blockingFor(page.url)
    this.onChange()
  }

  flush(): void {
    this.store.flush()
  }

  private blockingFor(url: string): boolean {
    const data = this.store.get()
    if (!data.enabled) return false
    // A stream's session management is indistinguishable from telemetry from
    // out here, and cancelling the wrong request drops the game rather than
    // hiding an advert. Not worth the risk on a page you opened to play on.
    if (isCloudGaming(url)) return false
    const site = registrableDomain(hostOf(url) ?? '')
    if (!site) return false
    return !data.allowed.includes(site)
  }

  private reset(id: number, url: string): void {
    this.pages.set(id, {
      url,
      blocking: this.blockingFor(url),
      blocked: 0,
      owners: new Map()
    })
    this.markDirty()
  }

  private decide(details: Electron.OnBeforeRequestListenerDetails): string | null {
    const id = details.webContentsId
    // No owning WebContents means no first-party context to judge against —
    // a service worker or a session-level fetch. Never guess; let it through.
    if (id === undefined) return null

    const page = this.pages.get(id)
    if (!page || !page.blocking) return null

    const owner = shouldBlock(
      details.url,
      page.url,
      details.resourceType,
      TRACKER_DOMAINS,
      TRACKER_OWNERS
    )
    if (owner === null) return null

    page.blocked++
    page.owners.set(owner, (page.owners.get(owner) ?? 0) + 1)
    this.markDirty()
    return owner
  }

  /** Coalesce bursts: repaint immediately, then at most every NOTIFY_MS. */
  private markDirty(): void {
    if (this.timer) {
      this.dirty = true
      return
    }
    this.onChange()
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.dirty) {
        this.dirty = false
        this.markDirty()
      }
    }, NOTIFY_MS)
  }
}

let instance: Blocker | null = null

export function blockerStore(): Blocker {
  if (!instance) instance = new Blocker()
  return instance
}
