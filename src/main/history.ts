import type { HistoryEntry, Suggestion } from '@shared/types'
import { DEFAULT_SEARCH_TEMPLATE, hostLabel, prettyURL } from '@shared/urlUtils'
import { JSONStore } from './store'

const MAX_ENTRIES = 5000
const MAX_SUGGESTIONS = 8

interface HistoryData {
  entries: HistoryEntry[]
}

export class History {
  private store = new JSONStore<HistoryData>('history.json', { entries: [] })

  /** Record a visit, collapsing repeats of the same URL into one entry. */
  record(url: string, title: string): void {
    if (!url || url === 'about:blank' || url.startsWith('data:')) return

    this.store.update((d) => {
      const existing = d.entries.findIndex((e) => e.url === url)
      if (existing !== -1) d.entries.splice(existing, 1)
      d.entries.unshift({ url, title: title || hostLabel(url), visitedAt: Date.now() })
      if (d.entries.length > MAX_ENTRIES) d.entries.length = MAX_ENTRIES
    })
  }

  /** Update the title of the most recent visit to a URL, once the page reports one. */
  updateTitle(url: string, title: string): void {
    if (!title) return
    this.store.update((d) => {
      const entry = d.entries.find((e) => e.url === url)
      if (entry) entry.title = title
    })
  }

  list(): HistoryEntry[] {
    return [...this.store.get().entries]
  }

  clear(): void {
    this.store.update((d) => {
      d.entries = []
    })
    this.store.flush()
  }

  /**
   * Address-bar suggestions. Ranked so that a host-prefix match ("git" -> github.com)
   * beats a match buried in a path or title, and a raw search is always offered last.
   */
  query(rawPrefix: string): Suggestion[] {
    const prefix = rawPrefix.trim().toLowerCase()
    if (!prefix) return []

    const scored: Array<{ score: number; visitedAt: number; suggestion: Suggestion }> = []

    for (const entry of this.store.get().entries) {
      const host = hostLabel(entry.url).toLowerCase()
      const url = entry.url.toLowerCase()
      const title = (entry.title ?? '').toLowerCase()

      let score = 0
      if (host.startsWith(prefix)) score = 4
      else if (url.startsWith(`https://${prefix}`) || url.startsWith(`http://${prefix}`)) score = 3
      else if (title.startsWith(prefix)) score = 2
      else if (url.includes(prefix) || title.includes(prefix)) score = 1

      if (score > 0) {
        scored.push({
          score,
          visitedAt: entry.visitedAt,
          suggestion: { kind: 'history', url: entry.url, title: entry.title || prettyURL(entry.url) }
        })
      }
    }

    scored.sort((a, b) => b.score - a.score || b.visitedAt - a.visitedAt)

    const results = scored.slice(0, MAX_SUGGESTIONS - 1).map((s) => s.suggestion)
    results.push({
      kind: 'search',
      url: DEFAULT_SEARCH_TEMPLATE + encodeURIComponent(rawPrefix.trim()),
      title: `Search for “${rawPrefix.trim()}”`
    })
    return results
  }

  flush(): void {
    this.store.flush()
  }
}
