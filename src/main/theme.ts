import { nativeTheme } from 'electron'
import { JSONStore } from './store'

export type ThemeSource = 'system' | 'light' | 'dark'

export const THEME_SOURCES: ThemeSource[] = ['system', 'light', 'dark']

export function isThemeSource(value: string): value is ThemeSource {
  return (THEME_SOURCES as string[]).includes(value)
}

/**
 * Light and dark appearance.
 *
 * Setting nativeTheme.themeSource is the whole mechanism: Chromium drives
 * prefers-color-scheme in every renderer from it, so the chrome UI and the
 * lumina:// pages both restyle themselves the moment it changes. Nothing needs
 * to be pushed over IPC, and nothing needs reloading.
 */
export class Theme {
  private store = new JSONStore<{ source: ThemeSource }>('theme.json', { source: 'system' })

  /** Push the stored choice into Chromium. Call once the app is ready. */
  apply(): void {
    nativeTheme.themeSource = this.store.get().source
  }

  get(): ThemeSource {
    return this.store.get().source
  }

  set(source: ThemeSource): void {
    this.store.update((d) => {
      d.source = source
    })
    this.store.flush()
    this.apply()
  }

  /** What the choice resolves to right now — 'system' depends on macOS. */
  isDark(): boolean {
    return nativeTheme.shouldUseDarkColors
  }

  /** Fires when the OS appearance changes while the source is 'system'. */
  onChange(listener: () => void): void {
    nativeTheme.on('updated', listener)
  }

  flush(): void {
    this.store.flush()
  }
}

let shared: Theme | null = null

export function themeStore(): Theme {
  if (!shared) shared = new Theme()
  return shared
}
