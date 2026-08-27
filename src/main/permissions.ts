import { session } from 'electron'
import { isCloudGaming } from '@shared/cloudGaming'
import type { PermissionPrompt } from '@shared/types'
import { PARTITION } from './tabs'

/** Granted without asking — low risk and needed for ordinary browsing. */
const AUTO_GRANT = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'])

/** Always refused; these have no UI here and are not worth the risk. */
const AUTO_DENY = new Set(['openExternal', 'mediaKeySystem'])

/**
 * Granted without asking on a cloud gaming page, and prompted for everywhere
 * else.
 *
 * Keyboard lock is what lets Esc reach the game instead of dropping out of
 * fullscreen, which is the difference between a pause menu and being thrown
 * back to the desktop mid-match. It only takes effect in fullscreen, so a
 * background page cannot use it to swallow keys, and the menu bar's shortcuts
 * still work — ⇧⌘G remains a way out of gaming mode whatever the page grabs.
 */
const CLOUD_GAMING_GRANT = new Set(['keyboardLock'])

type Decision = (granted: boolean) => void

/**
 * Deny-by-default permission handling. Anything not auto-decided is forwarded
 * to the chrome UI as a prompt, and stays pending until the user answers.
 */
export class Permissions {
  private pending = new Map<string, Decision>()
  private nextId = 1

  constructor(private readonly prompt: (p: PermissionPrompt) => void) {}

  attach(): void {
    const ses = session.fromPartition(PARTITION)

    ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (AUTO_GRANT.has(permission)) return callback(true)
      if (AUTO_DENY.has(permission)) return callback(false)

      const requestingURL = details?.requestingUrl || webContents?.getURL() || ''
      if (CLOUD_GAMING_GRANT.has(permission) && isCloudGaming(requestingURL)) {
        return callback(true)
      }

      const origin = this.originOf(requestingURL)
      const id = `perm-${this.nextId++}`
      this.pending.set(id, callback)
      this.prompt({ id, permission, origin })
    })

    // Synchronous checks (e.g. a page asking whether it already has access)
    // must not silently grant anything the user has not approved.
    ses.setPermissionCheckHandler((_wc, permission) => AUTO_GRANT.has(permission))
  }

  respond(id: string, granted: boolean): void {
    const callback = this.pending.get(id)
    if (!callback) return
    this.pending.delete(id)
    callback(granted)
  }

  /** Refuse anything still outstanding, so no request is left hanging. */
  dispose(): void {
    for (const callback of this.pending.values()) callback(false)
    this.pending.clear()
  }

  private originOf(url: string): string {
    try {
      return new URL(url).origin
    } catch {
      return url || 'this page'
    }
  }
}
