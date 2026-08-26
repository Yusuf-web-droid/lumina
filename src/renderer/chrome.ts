import type {
  BrowserSnapshot,
  QuickLink,
  QuickLinkIcon,
  DownloadEntry,
  NexusAPI,
  PermissionPrompt,
  Suggestion,
  TabState
} from '@shared/types'
import { prettyURL } from '@shared/urlUtils'

declare global {
  interface Window {
    nexus: NexusAPI
  }
}

const api = window.nexus
const BASE_CHROME_HEIGHT = 84

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el as T
}

const els = {
  tabs: $<HTMLDivElement>('tabs'),
  newTab: $<HTMLButtonElement>('new-tab'),
  back: $<HTMLButtonElement>('back'),
  forward: $<HTMLButtonElement>('forward'),
  reload: $<HTMLButtonElement>('reload'),
  stop: $<HTMLButtonElement>('stop'),
  home: $<HTMLButtonElement>('home'),
  address: $<HTMLInputElement>('address'),
  schemeBadge: $<HTMLSpanElement>('scheme-badge'),
  star: $<HTMLButtonElement>('star'),
  progress: $<HTMLDivElement>('progress'),
  suggestions: $<HTMLDivElement>('suggestions'),
  findbar: $<HTMLDivElement>('findbar'),
  findInput: $<HTMLInputElement>('find-input'),
  findCount: $<HTMLSpanElement>('find-count'),
  findPrev: $<HTMLButtonElement>('find-prev'),
  findNext: $<HTMLButtonElement>('find-next'),
  findClose: $<HTMLButtonElement>('find-close'),
  appsBtn: $<HTMLButtonElement>('apps-btn'),
  appsPanel: $<HTMLDivElement>('apps-panel'),
  appsGrid: $<HTMLDivElement>('apps-grid'),
  appsAdd: $<HTMLFormElement>('apps-add'),
  appsName: $<HTMLInputElement>('apps-name'),
  appsUrl: $<HTMLInputElement>('apps-url'),
  appsReset: $<HTMLButtonElement>('apps-reset'),
  assistantBtn: $<HTMLButtonElement>('assistant-btn'),
  downloadsBtn: $<HTMLButtonElement>('downloads-btn'),
  downloadsDot: $<HTMLSpanElement>('downloads-dot'),
  downloadsPanel: $<HTMLDivElement>('downloads-panel'),
  downloadsList: $<HTMLUListElement>('downloads-list'),
  downloadsEmpty: $<HTMLParagraphElement>('downloads-empty'),
  downloadsClear: $<HTMLButtonElement>('downloads-clear'),
  permission: $<HTMLDivElement>('permission'),
  permissionText: $<HTMLParagraphElement>('permission-text'),
  permissionAllow: $<HTMLButtonElement>('permission-allow'),
  permissionDeny: $<HTMLButtonElement>('permission-deny')
}

let snapshot: BrowserSnapshot = { tabs: [], activeTabId: null, sidebarOpen: false }
let suggestions: Suggestion[] = []
let selectedSuggestion = -1
let addressDirty = false
let dragFromIndex = -1
let quickLinks: QuickLink[] = []
let quickLinkIcons: Record<string, QuickLinkIcon> = {}

const activeTab = (): TabState | null =>
  snapshot.tabs.find((t) => t.id === snapshot.activeTabId) ?? null

// ------------------------------------------------------------------ chrome height

/**
 * The chrome view floats over the page, so main only needs to know how tall it
 * must be right now. Measured from whichever overlays are actually visible.
 */
let lastReportedHeight = -1
function syncHeight(): void {
  let needed = BASE_CHROME_HEIGHT
  const overlays = [els.suggestions, els.findbar, els.appsPanel, els.downloadsPanel, els.permission]
  for (const el of overlays) {
    if (el.hidden) continue
    needed = Math.max(needed, BASE_CHROME_HEIGHT + el.offsetTop + el.offsetHeight + 10)
  }
  if (needed !== lastReportedHeight) {
    lastReportedHeight = needed
    void api.setChromeHeight(needed)
  }
}

const scheduleSync = (): void => {
  requestAnimationFrame(syncHeight)
}

// --------------------------------------------------------------------- tab strip

function renderTabs(): void {
  els.tabs.replaceChildren(
    ...snapshot.tabs.map((tab, index) => {
      const el = document.createElement('div')
      el.className = 'tab' + (tab.id === snapshot.activeTabId ? ' active' : '') + (tab.crashed ? ' crashed' : '')
      el.title = tab.title
      el.draggable = true
      el.dataset['index'] = String(index)

      if (tab.loading) {
        const spinner = document.createElement('div')
        spinner.className = 'tab-spinner'
        el.append(spinner)
      } else if (tab.favicon) {
        const img = document.createElement('img')
        img.className = 'tab-favicon'
        img.src = tab.favicon
        img.alt = ''
        // A broken favicon must not leave a torn icon in the strip.
        img.addEventListener('error', () => img.remove())
        el.append(img)
      }

      const title = document.createElement('span')
      title.className = 'tab-title'
      title.textContent = tab.crashed ? `${tab.title} (crashed)` : tab.title
      el.append(title)

      const close = document.createElement('button')
      close.className = 'tab-close'
      close.setAttribute('aria-label', 'Close tab')
      close.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>'
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        void api.tabs.close(tab.id)
      })
      el.append(close)

      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault()
          void api.tabs.close(tab.id)
        } else if (e.button === 0) {
          void api.tabs.activate(tab.id)
        }
      })

      el.addEventListener('dragstart', () => {
        dragFromIndex = index
      })
      el.addEventListener('dragover', (e) => e.preventDefault())
      el.addEventListener('drop', (e) => {
        e.preventDefault()
        if (dragFromIndex !== -1 && dragFromIndex !== index) {
          void api.tabs.reorder(dragFromIndex, index)
        }
        dragFromIndex = -1
      })

      return el
    })
  )
}

// ----------------------------------------------------------------------- toolbar

async function renderToolbar(): Promise<void> {
  const tab = activeTab()

  els.back.disabled = !tab?.canGoBack
  els.forward.disabled = !tab?.canGoForward
  els.reload.hidden = Boolean(tab?.loading)
  els.stop.hidden = !tab?.loading
  els.progress.hidden = !tab?.loading

  if (!addressDirty && document.activeElement !== els.address) {
    els.address.value = tab ? prettyURL(tab.url) : ''
  }

  const url = tab?.url ?? ''
  if (url.startsWith('https://')) {
    els.schemeBadge.textContent = '🔒'
    els.schemeBadge.classList.remove('insecure')
  } else if (url.startsWith('http://')) {
    els.schemeBadge.textContent = 'Not secure'
    els.schemeBadge.classList.add('insecure')
  } else {
    els.schemeBadge.textContent = ''
    els.schemeBadge.classList.remove('insecure')
  }

  els.assistantBtn.classList.toggle('on', snapshot.sidebarOpen)

  const saved = url ? await api.bookmarks.has(url) : false
  els.star.classList.toggle('saved', saved)
}

// ------------------------------------------------------------------- suggestions

function renderSuggestions(): void {
  if (suggestions.length === 0) {
    els.suggestions.hidden = true
    scheduleSync()
    return
  }

  els.suggestions.replaceChildren(
    ...suggestions.map((s, i) => {
      const row = document.createElement('div')
      row.className = 'suggestion' + (i === selectedSuggestion ? ' selected' : '')
      row.setAttribute('role', 'option')

      const title = document.createElement('span')
      title.className = 'suggestion-title'
      title.textContent = s.title
      row.append(title)

      if (s.kind !== 'search') {
        const url = document.createElement('span')
        url.className = 'suggestion-url'
        url.textContent = prettyURL(s.url)
        row.append(url)
      }

      row.addEventListener('mousedown', (e) => {
        e.preventDefault() // keep focus so the input does not fight the click
        commit(s.url)
      })
      return row
    })
  )
  els.suggestions.hidden = false
  scheduleSync()
}

function clearSuggestions(): void {
  suggestions = []
  selectedSuggestion = -1
  renderSuggestions()
}

let queryTimer: number | undefined
function querySuggestions(prefix: string): void {
  window.clearTimeout(queryTimer)
  queryTimer = window.setTimeout(async () => {
    if (!prefix.trim()) return clearSuggestions()
    suggestions = await api.history.query(prefix)
    selectedSuggestion = -1
    renderSuggestions()
  }, 90)
}

function commit(input: string): void {
  addressDirty = false
  clearSuggestions()
  els.address.blur()
  void api.nav.loadURL(input)
}

// ------------------------------------------------------------------- find bar

let findVisible = false
function toggleFind(show?: boolean): void {
  findVisible = show ?? !findVisible
  els.findbar.hidden = !findVisible
  if (findVisible) {
    els.findInput.focus()
    els.findInput.select()
    if (els.findInput.value) void api.find.start(els.findInput.value)
  } else {
    els.findCount.textContent = '0/0'
    void api.find.stop()
  }
  scheduleSync()
}

// ------------------------------------------------------------------ downloads

let downloads: DownloadEntry[] = []

function formatBytes(n: number): string {
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function renderDownloads(): void {
  els.downloadsEmpty.hidden = downloads.length > 0
  els.downloadsList.replaceChildren(
    ...downloads.map((d) => {
      const li = document.createElement('li')
      li.className = 'download'

      const name = document.createElement('div')
      name.className = 'download-name'
      const label = document.createElement('span')
      label.textContent = d.filename
      const action = document.createElement('span')
      action.className = 'download-meta'
      name.append(label, action)
      li.append(name)

      if (d.state === 'progressing' || d.state === 'paused') {
        action.textContent = d.totalBytes
          ? `${formatBytes(d.receivedBytes)} / ${formatBytes(d.totalBytes)}`
          : formatBytes(d.receivedBytes)
        const bar = document.createElement('div')
        bar.className = 'download-bar'
        const fill = document.createElement('div')
        fill.style.width = d.totalBytes
          ? `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`
          : '0%'
        bar.append(fill)
        li.append(bar)
        li.addEventListener('click', () => void api.downloads.cancel(d.id))
        li.title = 'Click to cancel'
      } else if (d.state === 'completed') {
        action.textContent = formatBytes(d.receivedBytes)
        li.addEventListener('click', () => void api.downloads.reveal(d.id))
        li.title = 'Click to show in Finder'
      } else {
        action.textContent = d.state
      }

      return li
    })
  )

  const active = downloads.some((d) => d.state === 'progressing' || d.state === 'paused')
  els.downloadsDot.hidden = !active
  scheduleSync()
}

// ----------------------------------------------------------------- quick links

const TILE_COLORS = [
  '#3b7ddd', '#7b5bff', '#e0568a', '#f08b3c',
  '#2fb890', '#38a4c9', '#c2557d', '#8a6fe8'
]

/** Deterministic colour, so a site always keeps the same tile. */
function colorFor(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  return TILE_COLORS[hash % TILE_COLORS.length] ?? TILE_COLORS[0]!
}

/**
 * Draw the site's real logo onto a tile — its favicon where one has been
 * fetched, else a bundled brand glyph — falling back to the letter chip.
 */
function paintIcon(icon: HTMLElement, link: QuickLink): void {
  const art = quickLinkIcons[link.url]

  if (art?.kind === 'image') {
    const img = document.createElement('img')
    img.src = art.src
    img.alt = ''
    icon.classList.add('logo')
    icon.append(img)
    return
  }

  if (art?.kind === 'glyph') {
    // Built as a string because SVG children need the SVG namespace.
    icon.classList.add('logo')
    icon.innerHTML =
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${art.path}"/></svg>`
    const path = icon.querySelector('path')
    if (path) path.setAttribute('fill', art.color)
    return
  }

  icon.style.background = colorFor(link.url)
  icon.textContent = (link.name.trim()[0] ?? '?').toUpperCase()
}

function renderQuickLinks(): void {
  els.appsGrid.replaceChildren(
    ...quickLinks.map((link) => {
      const tile = document.createElement('button')
      tile.className = 'app-tile'
      tile.type = 'button'
      tile.title = link.url

      const icon = document.createElement('span')
      icon.className = 'app-icon'
      icon.setAttribute('aria-hidden', 'true')
      paintIcon(icon, link)

      const name = document.createElement('span')
      name.className = 'app-name'
      name.textContent = link.name

      const remove = document.createElement('span')
      remove.className = 'app-remove'
      remove.setAttribute('role', 'button')
      remove.setAttribute('aria-label', `Remove ${link.name}`)
      remove.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>'
      remove.addEventListener('click', async (e) => {
        e.stopPropagation() // do not also open the site
        await api.quickLinks.remove(link.url)
        await loadQuickLinks()
      })

      // Plain click navigates this tab; Cmd-click or middle-click opens a new one.
      tile.addEventListener('click', (e) => {
        void api.quickLinks.open(link.url, e.metaKey || e.ctrlKey)
        if (!(e.metaKey || e.ctrlKey)) closeAppsPanel()
      })
      tile.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault()
          void api.quickLinks.open(link.url, true)
        }
      })

      tile.append(icon, name, remove)
      return tile
    })
  )
  scheduleSync()
}

async function loadQuickLinks(): Promise<void> {
  quickLinks = await api.quickLinks.list()
  quickLinkIcons = await api.quickLinks.icons(quickLinks.map((l) => l.url))
  renderQuickLinks()
}

function closeAppsPanel(): void {
  els.appsPanel.hidden = true
  els.appsBtn.classList.remove('on')
  scheduleSync()
}

els.appsBtn.addEventListener('click', async () => {
  const opening = els.appsPanel.hidden
  els.appsPanel.hidden = !opening
  els.appsBtn.classList.toggle('on', opening)
  if (opening) await loadQuickLinks()
  scheduleSync()
})

els.appsReset.addEventListener('click', async () => {
  await api.quickLinks.reset()
  await loadQuickLinks()
})

els.appsAdd.addEventListener('submit', async (e) => {
  e.preventDefault()
  const raw = els.appsUrl.value.trim()
  if (!raw) return
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  await api.quickLinks.add(url, els.appsName.value.trim())
  els.appsName.value = ''
  els.appsUrl.value = ''
  await loadQuickLinks()
})

// ----------------------------------------------------------------- event wiring

els.newTab.addEventListener('click', () => void api.tabs.create())
els.back.addEventListener('click', () => void api.nav.back())
els.forward.addEventListener('click', () => void api.nav.forward())
els.reload.addEventListener('click', () => void api.nav.reload())
els.stop.addEventListener('click', () => void api.nav.stop())
els.home.addEventListener('click', () => void api.nav.home())
els.assistantBtn.addEventListener('click', () => void api.sidebar.toggle())
els.star.addEventListener('click', async () => {
  await api.bookmarks.add()
  void renderToolbar()
})

els.address.addEventListener('focus', () => {
  const tab = activeTab()
  if (tab && !addressDirty) els.address.value = tab.url
  els.address.select()
})

els.address.addEventListener('blur', () => {
  addressDirty = false
  clearSuggestions()
  void renderToolbar()
})

els.address.addEventListener('input', () => {
  addressDirty = true
  querySuggestions(els.address.value)
})

els.address.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (suggestions.length === 0) return
    e.preventDefault()
    const delta = e.key === 'ArrowDown' ? 1 : -1
    selectedSuggestion =
      (selectedSuggestion + delta + suggestions.length + 1) % (suggestions.length + 1) - 1
    renderSuggestions()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const picked = suggestions[selectedSuggestion]
    commit(picked ? picked.url : els.address.value)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    addressDirty = false
    clearSuggestions()
    els.address.blur()
  }
})

els.findInput.addEventListener('input', () => {
  const q = els.findInput.value
  if (q) void api.find.start(q)
  else {
    els.findCount.textContent = '0/0'
    void api.find.stop()
  }
})

els.findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    void api.find.next(!e.shiftKey)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    toggleFind(false)
  }
})

els.findPrev.addEventListener('click', () => void api.find.next(false))
els.findNext.addEventListener('click', () => void api.find.next(true))
els.findClose.addEventListener('click', () => toggleFind(false))

els.downloadsBtn.addEventListener('click', () => {
  els.downloadsPanel.hidden = !els.downloadsPanel.hidden
  els.downloadsBtn.classList.toggle('active', !els.downloadsPanel.hidden)
  scheduleSync()
})

els.downloadsClear.addEventListener('click', () => void api.downloads.clear())

// Clicking outside the downloads panel dismisses it.
document.addEventListener('mousedown', (e) => {
  if (!els.appsPanel.hidden) {
    const t = e.target as Node
    if (!els.appsPanel.contains(t) && !els.appsBtn.contains(t)) closeAppsPanel()
  }
  if (els.downloadsPanel.hidden) return
  const target = e.target as Node
  if (!els.downloadsPanel.contains(target) && !els.downloadsBtn.contains(target)) {
    els.downloadsPanel.hidden = true
    els.downloadsBtn.classList.remove('active')
    scheduleSync()
  }
})

let pendingPermission: PermissionPrompt | null = null
const answerPermission = (granted: boolean): void => {
  if (!pendingPermission) return
  void api.respondToPermission(pendingPermission.id, granted)
  pendingPermission = null
  els.permission.hidden = true
  scheduleSync()
}
els.permissionAllow.addEventListener('click', () => answerPermission(true))
els.permissionDeny.addEventListener('click', () => answerPermission(false))

window.addEventListener('resize', scheduleSync)

// -------------------------------------------------------------- main -> chrome

api.onSnapshot((s) => {
  snapshot = s
  renderTabs()
  void renderToolbar()
})

api.onFindResult((r) => {
  els.findCount.textContent = `${r.matches ? r.activeMatchOrdinal : 0}/${r.matches}`
})

api.onDownloads((list) => {
  downloads = list
  renderDownloads()
})

api.onPermissionPrompt((p) => {
  pendingPermission = p
  els.permissionText.textContent = `${p.origin} wants to use ${p.permission.replace(/-/g, ' ')}.`
  els.permission.hidden = false
  scheduleSync()
})

api.onFocusAddressBar(() => {
  els.address.focus()
  els.address.select()
})

api.onToggleFind(() => toggleFind(true))

api.onToggleQuickLinks(() => {
  els.appsPanel.hidden = false
  els.appsBtn.classList.add('on')
  void loadQuickLinks()
})

renderDownloads()
syncHeight()
