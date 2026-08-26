import { app } from 'electron'
import { join } from 'node:path'

export interface BackgroundPreset {
  id: string
  name: string
  description: string
  file: string
}

/** Photos shipped with the app, offered alongside the user's own. */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'sunset-lake',
    name: 'Sunset lake',
    description: 'Still water under an orange sky',
    file: 'sunset-lake.jpg'
  },
  {
    id: 'misty-dawn',
    name: 'Misty dawn',
    description: 'Fog on the water between hills',
    file: 'misty-dawn.jpg'
  },
  {
    id: 'jetty',
    name: 'Jetty',
    description: 'A wooden pier at dusk',
    file: 'jetty.jpg'
  }
]

export function findPreset(id: string): BackgroundPreset | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? null
}

/**
 * Where the bundled photos live. Packaged they are copied into the app's
 * Contents/Resources by electron-builder's extraResources; in development they
 * are still in the project, two levels up from out/main.
 */
export function presetPath(id: string): string | null {
  const preset = findPreset(id)
  if (!preset) return null

  const dir = app.isPackaged
    ? join(process.resourcesPath, 'backgrounds')
    : join(__dirname, '..', '..', 'resources', 'backgrounds')

  return join(dir, preset.file)
}
