import { basename, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

const shared = resolve(__dirname, 'src/shared')

/**
 * Give every preload entry its own copy of the @shared modules it imports.
 *
 * A sandboxed preload gets a `require` that resolves Electron and a few
 * built-ins only — it cannot load a sibling file. Rollup hoists any module
 * two entries share into a chunk, so the moment a second preload imported
 * @shared/types both preloads started requiring ./chunks/types-*.js, failed
 * with "module not found", and silently left window.nexus undefined.
 *
 * Rollup will not duplicate a module shared by two entries, but it will happily
 * inline one that looks distinct — so resolve @shared to a per-entry id and let
 * each preload carry its own couple of kilobytes.
 */
function isolatePreloadShared(): Plugin {
  const TAG = 'preload-copy'

  return {
    name: 'nexus:isolate-preload-shared',
    enforce: 'pre',
    apply: 'build',
    resolveId(source, importer) {
      if (!source.startsWith('@shared/') || !importer) return null
      const file = resolve(shared, `${source.slice('@shared/'.length)}.ts`)
      // Transitive @shared imports inherit the entry that pulled them in, so
      // one entry never ends up with two copies of the same module.
      const inherited = new RegExp(`[?&]${TAG}=([^&]+)`).exec(importer)?.[1]
      const entry = inherited ?? basename(importer).replace(/\.[^.]+$/, '')
      return `${file}?${TAG}=${entry}`
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    // No @shared alias here on purpose — isolatePreloadShared resolves that
    // prefix itself, and Vite's alias plugin would otherwise get there first.
    plugins: [externalizeDepsPlugin(), isolatePreloadShared()],
    build: {
      rollupOptions: {
        input: {
          chrome: resolve(__dirname, 'src/preload/chrome.ts'),
          rail: resolve(__dirname, 'src/preload/rail.ts'),
          stealth: resolve(__dirname, 'src/preload/stealth.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          rail: resolve(__dirname, 'src/renderer/rail.html')
        }
      }
    }
  }
})
