import { Menu, MenuItem, clipboard, nativeImage, type WebContents } from 'electron'
import { DEFAULT_SEARCH_TEMPLATE } from '@shared/urlUtils'
import type { TabManager } from './tabs'

/** Right-click menu for page content, built from what was actually clicked. */
export function attachContextMenu(wc: WebContents, tabs: () => TabManager): void {
  wc.on('context-menu', (_event, params) => {
    const menu = new Menu()
    const add = (options: Electron.MenuItemConstructorOptions): void => {
      menu.append(new MenuItem(options))
    }
    const separator = (): void => add({ type: 'separator' })

    if (params.linkURL) {
      add({ label: 'Open Link in New Tab', click: () => tabs().create(params.linkURL) })
      add({
        label: 'Open Link in Background Tab',
        click: () => tabs().create(params.linkURL, { activate: false })
      })
      add({ label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) })
      separator()
    }

    if (params.mediaType === 'image' && params.srcURL) {
      add({ label: 'Open Image in New Tab', click: () => tabs().create(params.srcURL) })
      add({ label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) })
      add({
        label: 'Copy Image',
        click: () => {
          if (params.srcURL.startsWith('data:')) {
            clipboard.writeImage(nativeImage.createFromDataURL(params.srcURL))
          } else {
            wc.copyImageAt(params.x, params.y)
          }
        }
      })
      separator()
    }

    if (params.isEditable) {
      add({ role: 'undo' })
      add({ role: 'redo' })
      separator()
      add({ role: 'cut', enabled: params.editFlags.canCut })
      add({ role: 'copy', enabled: params.editFlags.canCopy })
      add({ role: 'paste', enabled: params.editFlags.canPaste })
      add({ role: 'selectAll' })
      separator()
    } else if (params.selectionText) {
      const snippet =
        params.selectionText.length > 24
          ? `${params.selectionText.slice(0, 24).trim()}…`
          : params.selectionText.trim()
      add({ role: 'copy' })
      add({
        label: `Search for “${snippet}”`,
        click: () =>
          tabs().create(DEFAULT_SEARCH_TEMPLATE + encodeURIComponent(params.selectionText))
      })
      separator()
    }

    if (!params.linkURL && !params.isEditable && !params.selectionText) {
      add({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => tabs().back() })
      add({
        label: 'Forward',
        enabled: wc.navigationHistory.canGoForward(),
        click: () => tabs().forward()
      })
      add({ label: 'Reload', click: () => tabs().reload() })
      separator()
    }

    add({ label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) })

    menu.popup()
  })
}
