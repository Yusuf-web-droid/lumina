import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * A tiny debounced, atomically-written JSON store.
 *
 * Deliberately hand-rolled rather than pulling in electron-store: the data here
 * is small, and this avoids a dependency whose recent majors are ESM-only,
 * which fights the CJS build the sandboxed preload requires.
 */
export class JSONStore<T extends object> {
  private readonly file: string
  private data: T
  private flushTimer: NodeJS.Timeout | null = null

  constructor(filename: string, private readonly defaults: T) {
    this.file = join(app.getPath('userData'), filename)
    this.data = this.load()
  }

  private load(): T {
    try {
      if (!existsSync(this.file)) return structuredClone(this.defaults)
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<T>
      return { ...structuredClone(this.defaults), ...parsed }
    } catch (err) {
      console.error(`[store] could not read ${this.file}, using defaults:`, err)
      return structuredClone(this.defaults)
    }
  }

  get(): Readonly<T> {
    return this.data
  }

  update(fn: (draft: T) => void): void {
    fn(this.data)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush()
    }, 250)
  }

  /** Write synchronously. Called on the debounce timer and again on quit. */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      renameSync(tmp, this.file) // atomic on the same filesystem
    } catch (err) {
      console.error(`[store] could not write ${this.file}:`, err)
    }
  }
}
