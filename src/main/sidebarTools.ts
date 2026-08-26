import type { SidebarTool } from '@shared/types'
import { hostLabel } from '@shared/urlUtils'
import { JSONStore } from './store'

/**
 * Shipped defaults: the three assistants that work well in a narrow column and
 * sign in with an account the user already has. Replaced entirely once the
 * user pins or unpins anything — same rule as the quick links.
 */
const DEFAULT_TOOLS: SidebarTool[] = [
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Claude', url: 'https://claude.ai/new' }
]

/** Beyond this the rail would need to scroll; refuse rather than overflow. */
export const MAX_TOOLS = 12

interface SidebarToolData {
  items: SidebarTool[]
  /** Distinguishes "never customised" from "unpinned everything on purpose". */
  customised: boolean
  /** URL of the tool shown when the panel was last open. */
  activeUrl: string | null
}

/**
 * The pinned side-panel tools, persisted across launches.
 *
 * Only the list and the last selection live here — the live WebContentsViews
 * belong to ./sidebar, which reads this to decide what to build.
 */
export class SidebarTools {
  private store = new JSONStore<SidebarToolData>('sidebar-tools.json', {
    items: [],
    customised: false,
    activeUrl: null
  })

  list(): SidebarTool[] {
    const data = this.store.get()
    return data.customised ? [...data.items] : [...DEFAULT_TOOLS]
  }

  has(url: string): boolean {
    return this.list().some((t) => t.url === url)
  }

  /** The tool to show on open: the last one used, else the first pinned. */
  activeUrl(): string | null {
    const items = this.list()
    const saved = this.store.get().activeUrl
    if (saved && items.some((t) => t.url === saved)) return saved
    return items[0]?.url ?? null
  }

  setActiveUrl(url: string | null): void {
    this.store.update((d) => {
      d.activeUrl = url
    })
  }

  /** Returns false when the URL is already pinned or the rail is full. */
  add(url: string, name: string): boolean {
    const items = this.list()
    if (items.length >= MAX_TOOLS || items.some((t) => t.url === url)) return false
    items.push({ name: name.trim() || hostLabel(url), url })
    this.write(items)
    return true
  }

  remove(url: string): void {
    this.write(this.list().filter((t) => t.url !== url))
  }

  private write(items: SidebarTool[]): void {
    this.store.update((d) => {
      d.items = items
      d.customised = true
    })
  }

  flush(): void {
    this.store.flush()
  }
}
