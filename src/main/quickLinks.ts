import type { QuickLink } from '@shared/types'
import { hostLabel } from '@shared/urlUtils'
import { JSONStore } from './store'

/** Shipped defaults. Replaced entirely once the user edits the list. */
const DEFAULT_LINKS: QuickLink[] = [
  { name: 'Apple', url: 'https://www.apple.com' },
  { name: 'Samsung', url: 'https://www.samsung.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'Amazon', url: 'https://www.amazon.co.uk' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'BBC', url: 'https://www.bbc.co.uk' },
  { name: 'Reddit', url: 'https://www.reddit.com' },
  { name: 'Netflix', url: 'https://www.netflix.com' },
  { name: 'Maps', url: 'https://maps.google.com' }
]

interface QuickLinkData {
  items: QuickLink[]
  /** Distinguishes "never customised" from "emptied on purpose". */
  customised: boolean
}

export class QuickLinks {
  private store = new JSONStore<QuickLinkData>('quicklinks.json', {
    items: [],
    customised: false
  })

  list(): QuickLink[] {
    const data = this.store.get()
    return data.customised ? [...data.items] : [...DEFAULT_LINKS]
  }

  add(url: string, name: string): void {
    const items = this.list()
    if (items.some((l) => l.url === url)) return
    items.push({ name: name || hostLabel(url), url })
    this.write(items)
  }

  remove(url: string): void {
    this.write(this.list().filter((l) => l.url !== url))
  }

  reset(): void {
    this.store.update((d) => {
      d.items = []
      d.customised = false
    })
    this.store.flush()
  }

  private write(items: QuickLink[]): void {
    this.store.update((d) => {
      d.items = items
      d.customised = true
    })
  }

  flush(): void {
    this.store.flush()
  }
}

let shared: QuickLinks | null = null

/** Single shared instance — the protocol handler and the window both read it. */
export function quickLinksStore(): QuickLinks {
  if (!shared) shared = new QuickLinks()
  return shared
}
