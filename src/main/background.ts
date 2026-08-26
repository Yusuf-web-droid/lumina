import { app, dialog } from 'electron'
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { JSONStore } from './store'

export type BackgroundKind = 'scene' | 'image' | 'plain'

interface BackgroundData {
  kind: BackgroundKind
  /** Filename inside userData, for kind === 'image'. */
  file: string | null
  /** 0-100; how much the photo is dimmed so text stays readable. */
  dim: number
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif'
}

/**
 * Start-page background preference, plus the stored image itself.
 *
 * A chosen photo is copied into userData rather than referenced in place, so
 * the background keeps working after the original is moved, renamed or deleted.
 */
export class Background {
  private store = new JSONStore<BackgroundData>('background.json', {
    kind: 'scene',
    file: null,
    dim: 45
  })

  get(): Readonly<BackgroundData> {
    return this.store.get()
  }

  setKind(kind: BackgroundKind): void {
    this.store.update((d) => {
      d.kind = kind
    })
    this.store.flush()
  }

  setDim(dim: number): void {
    this.store.update((d) => {
      d.dim = Math.min(85, Math.max(0, Math.round(dim)))
    })
    this.store.flush()
  }

  /** Absolute path of the stored image, if there is one. */
  imagePath(): string | null {
    const { file } = this.store.get()
    if (!file) return null
    const full = join(app.getPath('userData'), file)
    return existsSync(full) ? full : null
  }

  /** The stored image as an HTTP response, for the nexus://bg route. */
  imageResponse(): Response {
    const path = this.imagePath()
    if (!path) return new Response('No background set', { status: 404 })
    try {
      const bytes = readFileSync(path)
      const type = CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(bytes), {
        headers: { 'content-type': type, 'cache-control': 'no-store' }
      })
    } catch (err) {
      console.error('[background] could not read image:', err)
      return new Response('Unreadable', { status: 500 })
    }
  }

  /**
   * Ask for an image and store it. Returns true if the background changed.
   * Resolves false when the dialog is cancelled.
   */
  async chooseImage(): Promise<boolean> {
    const result = await dialog.showOpenDialog({
      title: 'Choose a background image',
      buttonLabel: 'Use image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }]
    })

    const source = result.filePaths[0]
    if (result.canceled || !source) return false

    const ext = extname(source).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      console.warn(`[background] refused unsupported file type: ${ext}`)
      return false
    }

    return this.useFile(source)
  }

  /** Copy a file in as the background. Shared by the dialog and setup code. */
  useFile(source: string): boolean {
    const ext = extname(source).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext) || !existsSync(source)) return false

    const filename = `background${ext}`
    try {
      // Drop any previous image so old formats do not linger in userData.
      const previous = this.imagePath()
      if (previous && previous !== join(app.getPath('userData'), filename)) unlinkSync(previous)

      copyFileSync(source, join(app.getPath('userData'), filename))
    } catch (err) {
      console.error('[background] could not copy image:', err)
      return false
    }

    this.store.update((d) => {
      d.file = filename
      d.kind = 'image'
    })
    this.store.flush()
    return true
  }

  clearImage(): void {
    const path = this.imagePath()
    if (path) {
      try {
        unlinkSync(path)
      } catch {
        /* already gone */
      }
    }
    this.store.update((d) => {
      d.file = null
      if (d.kind === 'image') d.kind = 'scene'
    })
    this.store.flush()
  }

  flush(): void {
    this.store.flush()
  }
}

let shared: Background | null = null

export function backgroundStore(): Background {
  if (!shared) shared = new Background()
  return shared
}
