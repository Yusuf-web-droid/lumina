import { describe, expect, it } from 'vitest'
import { shortcutLabel } from './shortcuts'

describe('shortcutLabel', () => {
  it('leaves macOS labels alone', () => {
    expect(shortcutLabel('New Tab (⌘T)', 'darwin')).toBe('New Tab (⌘T)')
    expect(shortcutLabel('Home (⌘⇧H)', 'darwin')).toBe('Home (⌘⇧H)')
  })

  it('spells the glyphs out elsewhere', () => {
    expect(shortcutLabel('New Tab (⌘T)', 'win32')).toBe('New Tab (Ctrl+T)')
    expect(shortcutLabel('New Tab (⌘T)', 'linux')).toBe('New Tab (Ctrl+T)')
  })

  it('keeps modifier order when several are stacked', () => {
    expect(shortcutLabel('Home (⌘⇧H)', 'win32')).toBe('Home (Ctrl+Shift+H)')
    expect(shortcutLabel('Quick links (⌘⇧A)', 'win32')).toBe('Quick links (Ctrl+Shift+A)')
  })

  it('handles bracket keys, which carry no glyph of their own', () => {
    expect(shortcutLabel('Back (⌘[)', 'win32')).toBe('Back (Ctrl+[)')
  })

  it('passes through labels with no shortcut in them', () => {
    expect(shortcutLabel('Bookmark', 'win32')).toBe('Bookmark')
  })
})
