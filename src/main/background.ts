import { app, dialog } from 'electron'
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { findPreset, presetPath } from './backgroundPresets'
import { JSONStore } from './store'

export type BackgroundKind = 'scene' | 'image' | 'plain'

interface BackgroundData {
  kind: BackgroundKind
  /** Filename inside userData, for a photo the user chose themselves. */
  file: string | null
  /** Id of a bundled photo, which takes precedence over `file`. */
  preset: string | null
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
    preset: null,
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

  /** Absolute path of the current photo — a bundled one, or the user's own. */
  imagePath(): string | null {
    const { preset, file } = this.store.get()

    if (preset) {
      const bundled = presetPath(preset)
      return bundled && existsSync(bundled) ? bundled : null
    }

    if (!file) return null
    const full = join(app.getPath('userData'), file)
    return existsSync(full) ? full : null
  }

  /** Absolute path of one bundled photo, for the picker's thumbnails. */
  presetPath(id: string): string | null {
    const path = presetPath(id)
    return path && existsSync(path) ? path : null
  }

  /** Switch to one of the shipped photos. */
  setPreset(id: string): boolean {
    if (!findPreset(id)) return false
    this.store.update((d) => {
      d.preset = id
      d.kind = 'image'
    })
    this.store.flush()
    return true
  }

  /** A photo as an HTTP response, for the nexus://bg routes. */
  imageResponse(path: string | null = this.imagePath()): Response {
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
      d.preset = null
      d.kind = 'image'
    })
    this.store.flush()
    return true
  }

  clearImage(): void {
    // Only ever unlink the user's own copy — never a file shipped with the app.
    const { file } = this.store.get()
    const path = file ? join(app.getPath('userData'), file) : null
    if (path && existsSync(path)) {
      try {
        unlinkSync(path)
      } catch {
        /* already gone */
      }
    }
    this.store.update((d) => {
      d.file = null
      d.preset = null
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
