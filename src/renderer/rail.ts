import type { NexusRailAPI, SidebarState, SidebarToolView } from '@shared/types'

declare global {
  interface Window {
    nexusRail: NexusRailAPI
  }
}

const api = window.nexusRail

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing element #${id}`)
  return el as T
}

const els = {
  tools: $<HTMLDivElement>('tools'),
  pin: $<HTMLButtonElement>('pin'),
  reload: $<HTMLButtonElement>('reload'),
  close: $<HTMLButtonElement>('close')
}

const PIN_TITLES: Record<string, string> = {
  ok: 'Pin this page',
  pinned: 'This page is already pinned',
  full: 'The rail is full — unpin a tool first',
  unpinnable: 'This page cannot be pinned'
}

/** Same palette as the start page's letter tiles, so a site keeps its colour. */
const TILE_COLORS = ['#3b7ddd', '#d0453b', '#2f9e5f', '#c9821f', '#7a4fd0', '#0f8a94']

function colorFor(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  return TILE_COLORS[hash % TILE_COLORS.length] ?? TILE_COLORS[0]!
}

/**
 * Draw the tool's real logo — its fetched favicon, else a bundled brand glyph
 * — falling back to a letter tile until an icon is available.
 */
function paintIcon(button: HTMLButtonElement, tool: SidebarToolView): void {
  if (tool.icon?.kind === 'image') {
    const img = document.createElement('img')
    img.src = tool.icon.src
    img.alt = ''
    button.append(img)
    return
  }

  if (tool.icon?.kind === 'glyph') {
    // Built as a string because SVG children need the SVG namespace.
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${tool.icon.path}"/></svg>`
    const path = button.querySelector('path')
    if (path) path.setAttribute('fill', tool.icon.color)
    return
  }

  button.style.background = colorFor(tool.url)
  button.textContent = (tool.name.trim()[0] ?? '?').toUpperCase()
}

function render(state: SidebarState): void {
  els.tools.replaceChildren(
    ...state.tools.map((tool) => {
      const button = document.createElement('button')
      button.className = tool.active ? 'tool active' : 'tool'
      button.type = 'button'
      button.title = tool.name
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', String(tool.active))
      button.setAttribute('aria-label', tool.name)
      paintIcon(button, tool)
      button.addEventListener('click', () => void api.select(tool.url))

      const unpin = document.createElement('button')
      unpin.className = 'unpin'
      unpin.type = 'button'
      unpin.textContent = '×'
      unpin.title = `Unpin ${tool.name}`
      unpin.setAttribute('aria-label', `Unpin ${tool.name}`)
      unpin.addEventListener('click', (event) => {
        // Otherwise the click also selects the tool being removed.
        event.stopPropagation()
        void api.unpin(tool.url)
      })
      button.append(unpin)

      return button
    })
  )

  if (state.tools.length === 0) {
    const empty = document.createElement('p')
    empty.id = 'empty'
    empty.textContent = 'Pin a page with +'
    els.tools.append(empty)
  }

  els.pin.disabled = state.pinBlocked !== null
  els.pin.title = PIN_TITLES[state.pinBlocked ?? 'ok']
}

els.pin.addEventListener('click', () => void api.pinCurrent())
els.reload.addEventListener('click', () => void api.reload())
els.close.addEventListener('click', () => void api.close())

api.onState(render)
void api.list().then(render)
