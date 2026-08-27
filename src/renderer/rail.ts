import { destinationAfterDrop } from '@shared/tabOrder'
import type { LuminaRailAPI, SidebarState, SidebarToolView } from '@shared/types'

declare global {
  interface Window {
    luminaRail: LuminaRailAPI
  }
}

const api = window.luminaRail

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
    // Without this the browser drags the favicon itself and the reorder
    // never starts.
    img.draggable = false
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

/** Index of the tool being dragged, or -1 when no drag is in flight. */
let dragFrom = -1

function clearDropMarkers(): void {
  for (const el of els.tools.querySelectorAll('.drop-before, .drop-after')) {
    el.classList.remove('drop-before', 'drop-after')
  }
}

/**
 * Where the drop would insert, as a gap index in [0, length]: the pointer's
 * half of the hovered icon decides whether it lands above or below it.
 */
function gapIndex(button: HTMLButtonElement, index: number, event: DragEvent): number {
  const box = button.getBoundingClientRect()
  return event.clientY < box.top + box.height / 2 ? index : index + 1
}

/** Wire one icon for dragging. Reorder is the only thing a drag can do. */
function makeDraggable(button: HTMLButtonElement, index: number): void {
  button.draggable = true

  button.addEventListener('dragstart', (event) => {
    dragFrom = index
    button.classList.add('dragging')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      // A private type rather than text/plain: dropping a rail icon onto a
      // page should do nothing, not paste an index into it.
      event.dataTransfer.setData('application/x-lumina-tool', String(index))
    }
  })

  button.addEventListener('dragover', (event) => {
    if (dragFrom === -1) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const gap = gapIndex(button, index, event)
    clearDropMarkers()
    // No marker where the drop would change nothing.
    if (destinationAfterDrop(dragFrom, gap) === dragFrom) return
    button.classList.add(gap === index ? 'drop-before' : 'drop-after')
  })

  button.addEventListener('dragleave', () => button.classList.remove('drop-before', 'drop-after'))

  button.addEventListener('drop', (event) => {
    event.preventDefault()
    if (dragFrom === -1) return
    const to = destinationAfterDrop(dragFrom, gapIndex(button, index, event))
    const from = dragFrom
    dragFrom = -1
    clearDropMarkers()
    if (to !== from) void api.reorder(from, to)
  })

  // Covers a drag abandoned outside the rail, where no drop ever fires.
  button.addEventListener('dragend', () => {
    dragFrom = -1
    button.classList.remove('dragging')
    clearDropMarkers()
  })
}

function render(state: SidebarState): void {
  els.tools.replaceChildren(
    ...state.tools.map((tool, index) => {
      const button = document.createElement('button')
      button.className = tool.active ? 'tool active' : 'tool'
      button.type = 'button'
      button.title = tool.name
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', String(tool.active))
      button.setAttribute('aria-label', tool.name)
      button.dataset['index'] = String(index)
      paintIcon(button, tool)
      makeDraggable(button, index)
      button.addEventListener('click', () => void api.select(tool.url))
      // Unpinning lives behind a right-click, not a hover badge: the badge sat
      // on top of the icon you were aiming for and lost tools to stray clicks.
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        void api.menu(tool.url)
      })

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
