import { powerSaveBlocker } from 'electron'

/**
 * Holds the display awake while gaming mode is on.
 *
 * Wrapped in a class because `powerSaveBlocker` is id-based: starting twice
 * leaks the first id, and the display then stays awake for the rest of the
 * session with nothing left to stop it. Every start/stop goes through here so
 * there is only ever one id to lose.
 */
export class KeepAwake {
  private id: number | null = null

  /**
   * `prevent-display-sleep` rather than `prevent-app-suspension`: a game being
   * watched is not generating input, and the weaker blocker would let the
   * screen dim mid-cutscene.
   */
  start(): void {
    if (this.id !== null) return
    this.id = powerSaveBlocker.start('prevent-display-sleep')
  }

  stop(): void {
    if (this.id === null) return
    // A blocker can already have been stopped from under us on quit; asking
    // first keeps that from throwing on the way out.
    if (powerSaveBlocker.isStarted(this.id)) powerSaveBlocker.stop(this.id)
    this.id = null
  }

  isActive(): boolean {
    return this.id !== null
  }
}
