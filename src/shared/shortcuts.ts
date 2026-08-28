/**
 * Keyboard hints are written the macOS way, with glyphs: ⌘⇧A. Those glyphs
 * mean nothing on Windows or Linux, where the same accelerator is spelt out
 * as Ctrl+Shift+A — and the accelerators themselves are declared CmdOrCtrl,
 * so what the menu does already differs from what these labels claim.
 */
const SPELLED: Record<string, string> = {
  '⌘': 'Ctrl+',
  '⌃': 'Ctrl+',
  '⇧': 'Shift+',
  '⌥': 'Alt+'
}

/** Rewrite a label's glyphs for the platform reading it. */
export function shortcutLabel(label: string, platform: string): string {
  if (platform === 'darwin') return label
  return label.replace(/[⌘⌃⇧⌥]/g, (glyph) => SPELLED[glyph] ?? glyph)
}

/** Rewrite every `title` under `root` in place. A no-op on macOS. */
export function localiseTitles(root: ParentNode, platform: string): void {
  if (platform === 'darwin') return
  for (const el of root.querySelectorAll('[title]')) {
    const title = el.getAttribute('title')
    if (title) el.setAttribute('title', shortcutLabel(title, platform))
  }
}
