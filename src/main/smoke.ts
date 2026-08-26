import { app, type WebContents } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dev-only self-capture, enabled with NEXUS_SMOKE_CAPTURE=<dir>.
 *
 * Uses webContents.capturePage() rather than an external screenshot tool so it
 * works without macOS Screen Recording permission, and so it can run headless
 * in CI. Writes one PNG per view, then quits.
 */
export async function runSmokeCapture(
  outDir: string,
  views: Array<{ name: string; wc: WebContents }>
): Promise<void> {
  try {
    for (const { name, wc } of views) {
      if (wc.isDestroyed()) continue
      const image = await wc.capturePage()
      const file = join(outDir, `${name}.png`)
      writeFileSync(file, image.toPNG())
      console.log(`[smoke] wrote ${file} (${image.getSize().width}x${image.getSize().height})`)
    }
  } catch (err) {
    console.error('[smoke] capture failed:', err)
  } finally {
    app.quit()
  }
}
