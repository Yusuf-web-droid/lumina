/**
 * Pure tab-ordering rules, kept free of Electron so they can be tested directly.
 * TabManager delegates to these rather than open-coding the index arithmetic.
 */

/**
 * Which tab should become active after the tab at `closedIndex` is removed.
 * `remaining` is the list *after* the removal.
 *
 * Prefers the tab that slid into the vacated slot (matching Chrome/Safari),
 * falling back to the one before it when the last tab was closed.
 */
export function neighbourAfterClose<T>(remaining: T[], closedIndex: number): T | undefined {
  if (remaining.length === 0) return undefined
  return remaining[closedIndex] ?? remaining[closedIndex - 1] ?? remaining[remaining.length - 1]
}

/** Wrap `current + offset` into [0, length). Returns -1 for an empty list. */
export function wrapIndex(current: number, offset: number, length: number): number {
  if (length <= 0) return -1
  return (((current + offset) % length) + length) % length
}

/**
 * Move an item between positions, returning a new array.
 * Out-of-range or no-op moves return the list unchanged.
 */
export function reorderList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

/** Resolve a ⌘1–⌘9 shortcut. Index 8 means "last tab", as Chrome does. */
export function indexForShortcut(shortcutIndex: number, length: number): number {
  if (length === 0) return -1
  if (shortcutIndex === 8) return length - 1
  return shortcutIndex < length ? shortcutIndex : -1
}
