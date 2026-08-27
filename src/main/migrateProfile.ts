import { app } from 'electron'
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PARTITION } from './tabs'

/** What the app was called before, newest first. */
const FORMER_NAMES = ['Nexus']

/** What the tab session's partition was called before, newest first. */
const FORMER_PARTITIONS = ['nexus']

/** What the internal scheme was called before, newest first. */
const FORMER_SCHEMES = ['nexus']

/** The scheme those now have to become. */
const SCHEME = 'lumina'

/**
 * Carry an earlier release's profile over to the current name.
 *
 * Renaming the app moves `userData` — it is derived from `app.getName()` — so
 * without this a rename silently strands every bookmark, cookie and logged-in
 * session in a directory nothing reads any more, and the browser comes up
 * looking freshly installed.
 *
 * Must run before anything touches `app.getPath('userData')`, which is why it
 * is called at the top of the main entry point rather than on `whenReady`.
 * Renames only, and only into a name that does not exist yet, so an existing
 * profile is never overwritten and running an old build again is still safe.
 *
 * The old directory is looked for beside the current one rather than under
 * `appData` directly, so `--user-data-dir` pointing somewhere else quietly
 * finds nothing to move instead of reaching into the default location.
 */
export function migrateProfile(): void {
  const userData = app.getPath('userData')
  const appData = dirname(userData)

  if (!existsSync(userData)) {
    for (const former of FORMER_NAMES) {
      const old = join(appData, former)
      if (!existsSync(old)) continue
      try {
        renameSync(old, userData)
        console.log(`[migrate] profile ${former} -> ${userData}`)
      } catch (err) {
        // Not fatal: the browser still starts, just with an empty profile.
        console.error(`[migrate] could not move ${old}:`, err)
      }
      break
    }
  }

  migratePartition(userData)
  migrateStoredURLs(userData)
}

/**
 * The tab session lives in `Partitions/<name>`, keyed off the `persist:` string
 * rather than the app name, so it needs moving separately — that directory is
 * where the cookies and logins actually are.
 */
function migratePartition(userData: string): void {
  const partitions = join(userData, 'Partitions')
  if (!existsSync(partitions)) return

  const current = join(partitions, PARTITION.replace(/^persist:/, ''))
  if (existsSync(current)) return

  for (const former of FORMER_PARTITIONS) {
    const old = join(partitions, former)
    if (!existsSync(old)) continue
    try {
      renameSync(old, current)
      console.log(`[migrate] partition ${former} -> ${PARTITION}`)
    } catch (err) {
      console.error(`[migrate] could not move ${old}:`, err)
    }
    return
  }
}

/**
 * Rewrite the old internal scheme wherever it was written down.
 *
 * Moving the directory is not enough on its own: the stores hold URLs, and the
 * restored session in particular points at `nexus://home/`, a scheme nothing
 * answers to any more. Left alone the browser reopens on a tab that fails with
 * ERR_FAILED, which is the first thing you see after upgrading.
 *
 * Runs on every launch rather than only after a rename. The profile may already
 * have been moved by a build that did not do this part, and the substitution is
 * idempotent — once no old scheme is left, every file is skipped.
 */
function migrateStoredURLs(userData: string): void {
  if (!existsSync(userData)) return

  let files: string[]
  try {
    files = readdirSync(userData).filter((name) => name.endsWith('.json'))
  } catch {
    return // an unreadable profile directory is the caller's problem, not ours
  }

  for (const name of files) {
    const file = join(userData, name)
    try {
      const before = readFileSync(file, 'utf8')
      let after = before
      for (const former of FORMER_SCHEMES) {
        after = after.split(`${former}://`).join(`${SCHEME}://`)
      }
      if (after === before) continue

      writeFileSync(file, after, 'utf8')
      console.log(`[migrate] rewrote scheme in ${name}`)
    } catch (err) {
      // One bad store must not stop the others, or block startup.
      console.error(`[migrate] could not rewrite ${file}:`, err)
    }
  }
}
