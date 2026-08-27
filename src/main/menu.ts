import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron'
import { blockerStore } from './blocker'
import { THEME_SOURCES, themeStore } from './theme'
import type { BrowserWindow } from './window'

/**
 * The application menu. Accelerators declared here fire regardless of which
 * WebContents holds focus, which is why navigation shortcuts live here rather
 * than being bound inside the chrome UI.
 */
let lastGetWindow: (() => BrowserWindow | null) | null = null

/**
 * Redraw the menu so its checkboxes match state that changed from outside it —
 * gaming mode, which can also be left by exiting fullscreen.
 */
export function rebuildMenu(): void {
  if (lastGetWindow) buildMenu(lastGetWindow)
}

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const win = getWindow
  lastGetWindow = getWindow
  // Windows and Linux have no application menu: its roles are macOS-only, and
  // Quit and About belong on File and Help there instead.
  const isMac = process.platform === 'darwin'
  const macOnly = <T>(items: T[]): T[] => (isMac ? items : [])
  const template: MenuItemConstructorOptions[] = [
    ...macOnly<MenuItemConstructorOptions>([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }
    ]),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => win()?.tabManager.create() },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => win()?.tabManager.closeActive()
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => win()?.tabManager.reopenClosed()
        },
        { type: 'separator' },
        {
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: () => win()?.focusAddressBar()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => win()?.toggleFind() },
        ...(isMac
          ? []
          : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[]))
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win()?.tabManager.reload() },
        // Deliberately no Esc accelerator: a menu accelerator outranks the focused
        // page, which would stop Esc ever reaching the find bar or a web page.
        { label: 'Stop', click: () => win()?.tabManager.stop() },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => win()?.zoom('in') },
        // "+" needs Shift on most layouts, so accept the bare "=" key too.
        // Hidden items still fire their accelerator on macOS.
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          visible: false,
          click: () => win()?.zoom('in')
        },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => win()?.zoom('out') },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => win()?.zoom('reset') },
        { type: 'separator' },
        {
          label: 'Quick Links',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => win()?.focusQuickLinks()
        },
        {
          label: 'Toggle Side Panel',
          accelerator: 'CmdOrCtrl+J',
          click: () => win()?.toggleSidebar()
        },
        {
          label: 'Games',
          click: () => win()?.tabManager.create('lumina://home/games')
        },
        {
          label: 'Gaming Mode',
          accelerator: 'CmdOrCtrl+Shift+G',
          type: 'checkbox' as const,
          checked: win()?.isGamingMode() ?? false,
          // No rebuild here: setGamingMode redraws the menu itself, since the
          // mode can also be left by exiting fullscreen.
          click: () => win()?.toggleGamingMode()
        },
        { type: 'separator' },
        {
          label: 'Block Ads and Trackers',
          type: 'checkbox' as const,
          checked: blockerStore().enabled(),
          // Same rebuild trick as Appearance below: a checkbox's state is a
          // snapshot taken when the template was built.
          click: () => {
            blockerStore().setEnabled(!blockerStore().enabled())
            buildMenu(getWindow)
          }
        },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: THEME_SOURCES.map((source) => ({
            label: source === 'system' ? 'Match System' : source === 'light' ? 'Light' : 'Dark',
            type: 'radio' as const,
            checked: themeStore().get() === source,
            // Rebuilding is what redraws the radio dots — a menu item's checked
            // state is a snapshot taken when the template was built.
            click: () => {
              themeStore().set(source)
              buildMenu(getWindow)
            }
          }))
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Alt+I',
          click: () => win()?.toggleDevTools()
        }
      ]
    },
    {
      label: 'History',
      submenu: [
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => win()?.tabManager.back() },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => win()?.tabManager.forward() },
        { type: 'separator' },
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => win()?.tabManager.home() }
      ]
    },
    {
      label: 'Bookmarks',
      submenu: [
        {
          label: 'Bookmark This Page',
          accelerator: 'CmdOrCtrl+D',
          click: () => win()?.toggleBookmarkForActiveTab()
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...macOnly<MenuItemConstructorOptions>([{ role: 'zoom' }]),
        { type: 'separator' },
        {
          label: 'Select Next Tab',
          accelerator: 'Ctrl+Tab',
          click: () => win()?.tabManager.activateRelative(1)
        },
        {
          label: 'Select Previous Tab',
          accelerator: 'Ctrl+Shift+Tab',
          click: () => win()?.tabManager.activateRelative(-1)
        },
        { type: 'separator' },
        // Cmd+1..9 need real menu items to receive their accelerators.
        ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map<MenuItemConstructorOptions>((n) => ({
          label: `Tab ${n}`,
          accelerator: `CmdOrCtrl+${n}`,
          click: () => win()?.tabManager.activateIndex(n - 1)
        })),
        {
          label: 'Last Tab',
          accelerator: 'CmdOrCtrl+9',
          click: () => win()?.tabManager.activateIndex(8)
        },
        ...macOnly<MenuItemConstructorOptions>([{ type: 'separator' }, { role: 'front' }])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Electron Documentation',
          click: () => void shell.openExternal('https://www.electronjs.org/docs/latest')
        },
        ...(isMac
          ? []
          : ([{ type: 'separator' }, { role: 'about' }] as MenuItemConstructorOptions[]))
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
