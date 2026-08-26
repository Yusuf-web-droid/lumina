import { session, shell, type DownloadItem } from 'electron'
import type { DownloadEntry } from '@shared/types'
import { PARTITION } from './tabs'

export class Downloads {
  private entries = new Map<string, DownloadEntry>()
  private items = new Map<string, DownloadItem>()
  private nextId = 1

  constructor(private readonly onChange: (list: DownloadEntry[]) => void) {}

  attach(): void {
    session.fromPartition(PARTITION).on('will-download', (_event, item) => {
      const id = `dl-${this.nextId++}`
      this.items.set(id, item)
      this.entries.set(id, {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        savePath: item.getSavePath(),
        state: 'progressing',
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        startedAt: Date.now()
      })
      this.emit()

      item.on('updated', (_e, state) => {
        const entry = this.entries.get(id)
        if (!entry) return
        entry.receivedBytes = item.getReceivedBytes()
        entry.totalBytes = item.getTotalBytes()
        entry.savePath = item.getSavePath()
        entry.state = state === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progressing'
        this.emit()
      })

      item.once('done', (_e, state) => {
        const entry = this.entries.get(id)
        if (entry) {
          entry.state = state
          entry.receivedBytes = item.getReceivedBytes()
          entry.savePath = item.getSavePath()
        }
        this.items.delete(id)
        this.emit()
      })
    })
  }

  list(): DownloadEntry[] {
    return [...this.entries.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  reveal(id: string): void {
    const entry = this.entries.get(id)
    if (entry?.state === 'completed' && entry.savePath) shell.showItemInFolder(entry.savePath)
  }

  cancel(id: string): void {
    this.items.get(id)?.cancel()
  }

  /** Drop finished rows; anything still running keeps going. */
  clear(): void {
    for (const [id, entry] of this.entries) {
      if (entry.state !== 'progressing' && entry.state !== 'paused') this.entries.delete(id)
    }
    this.emit()
  }

  private emit(): void {
    this.onChange(this.list())
  }
}
