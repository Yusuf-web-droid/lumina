import type { Bookmark } from '@shared/types'
import { hostLabel } from '@shared/urlUtils'
import { JSONStore } from './store'

interface BookmarkData {
  items: Bookmark[]
}

export class Bookmarks {
  private store = new JSONStore<BookmarkData>('bookmarks.json', { items: [] })

  list(): Bookmark[] {
    return [...this.store.get().items]
  }

  has(url: string): boolean {
    return this.store.get().items.some((b) => b.url === url)
  }

  add(url: string, title: string): void {
    if (!url || url === 'about:blank' || this.has(url)) return
    this.store.update((d) => {
      d.items.unshift({ url, title: title || hostLabel(url), addedAt: Date.now() })
    })
  }

  remove(url: string): void {
    this.store.update((d) => {
      d.items = d.items.filter((b) => b.url !== url)
    })
  }

  /** Star button behaviour: add if missing, remove if present. Returns the new state. */
  toggle(url: string, title: string): boolean {
    if (this.has(url)) {
      this.remove(url)
      return false
    }
    this.add(url, title)
    return true
  }

  flush(): void {
    this.store.flush()
  }
}
