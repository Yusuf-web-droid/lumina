import { describe, expect, it } from 'vitest'
import { indexForShortcut, neighbourAfterClose, reorderList, wrapIndex } from './tabOrder'

describe('neighbourAfterClose', () => {
  it('activates the tab that slid into the vacated slot', () => {
    // ['a','b','c'], closing 'b' at index 1 -> remaining ['a','c'] -> 'c'
    expect(neighbourAfterClose(['a', 'c'], 1)).toBe('c')
  })

  it('falls back to the previous tab when the last one was closed', () => {
    // ['a','b','c'], closing 'c' at index 2 -> remaining ['a','b'] -> 'b'
    expect(neighbourAfterClose(['a', 'b'], 2)).toBe('b')
  })

  it('activates the first tab when the first was closed', () => {
    expect(neighbourAfterClose(['b', 'c'], 0)).toBe('b')
  })

  it('returns undefined when nothing is left', () => {
    expect(neighbourAfterClose([], 0)).toBeUndefined()
  })
})

describe('wrapIndex', () => {
  it('advances forward', () => {
    expect(wrapIndex(0, 1, 3)).toBe(1)
  })

  it('wraps past the end', () => {
    expect(wrapIndex(2, 1, 3)).toBe(0)
  })

  it('wraps below zero', () => {
    expect(wrapIndex(0, -1, 3)).toBe(2)
  })

  it('handles offsets larger than the list', () => {
    expect(wrapIndex(0, 7, 3)).toBe(1)
    expect(wrapIndex(0, -7, 3)).toBe(2)
  })

  it('returns -1 for an empty list', () => {
    expect(wrapIndex(0, 1, 0)).toBe(-1)
  })
})

describe('reorderList', () => {
  it('moves an item forward', () => {
    expect(reorderList(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item backward', () => {
    expect(reorderList(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('preserves which item is active across a move', () => {
    const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const active = tabs[1]
    const moved = reorderList(tabs, 0, 2)
    expect(moved).toContain(active)
    expect(moved.map((t) => t.id)).toEqual([2, 3, 1])
  })

  it('returns the original reference for a no-op', () => {
    const list = ['a', 'b']
    expect(reorderList(list, 1, 1)).toBe(list)
  })

  it('returns the original reference for out-of-range indices', () => {
    const list = ['a', 'b']
    expect(reorderList(list, -1, 0)).toBe(list)
    expect(reorderList(list, 0, 9)).toBe(list)
  })

  it('does not mutate the input', () => {
    const list = ['a', 'b', 'c']
    reorderList(list, 0, 2)
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('indexForShortcut', () => {
  it('maps Cmd+1 to the first tab', () => {
    expect(indexForShortcut(0, 5)).toBe(0)
  })

  it('maps Cmd+9 to the last tab regardless of count', () => {
    expect(indexForShortcut(8, 3)).toBe(2)
    expect(indexForShortcut(8, 12)).toBe(11)
  })

  it('returns -1 when the shortcut points past the end', () => {
    expect(indexForShortcut(4, 3)).toBe(-1)
  })

  it('returns -1 with no tabs', () => {
    expect(indexForShortcut(0, 0)).toBe(-1)
  })
})
