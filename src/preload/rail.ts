import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { NexusRailAPI, SidebarState } from '@shared/types'
import { IPC } from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

/**
 * The side panel's icon rail gets its own, much smaller bridge than the app
 * chrome: it can switch, pin and close panel tools, and nothing else. Tabs,
 * history, downloads and navigation are deliberately absent.
 */
const api: NexusRailAPI = {
  list: () => invoke<SidebarState>(IPC.SidebarToolsList),
  select: (url) => invoke<void>(IPC.SidebarToolsSelect, url),
  unpin: (url) => invoke<void>(IPC.SidebarToolsUnpin, url),
  pinCurrent: () => invoke<void>(IPC.SidebarToolsPinCurrent),
  reload: () => invoke<void>(IPC.SidebarReload),
  close: () => invoke<void>(IPC.SidebarClose),
  onState: (cb) => {
    ipcRenderer.on(IPC.OnSidebarTools, (_event: IpcRendererEvent, state: SidebarState) => cb(state))
  }
}

contextBridge.exposeInMainWorld('nexusRail', api)
