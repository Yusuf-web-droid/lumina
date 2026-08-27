import type { QuickLinkIcon } from '@shared/types'
import { brandFor } from './brandMarks'
import { faviconStore, hostOf } from './favicons'

/**
 * Brand colours are picked for the brand's own background, and a few of them
 * (the yellows and light greens) all but vanish on the pale icon chip. Darken
 * those just enough to stay legible, and leave everything else on-brand.
 */
export function glyphColor(hex: string): string {
  const channel = (i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

  const rgb = [channel(0), channel(1), channel(2)]
  const luminance = 0.2126 * linear(rgb[0]!) + 0.7152 * linear(rgb[1]!) + 0.0722 * linear(rgb[2]!)
  if (luminance <= 0.55) return hex

  const scale = 0.55 / luminance
  return `#${rgb
    .map((c) =>
      Math.round(c * scale * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}

/**
 * The icon for a site: its own fetched favicon where there is one, else the
 * bundled brand glyph. Returns null when the caller should fall back to a
 * letter tile.
 *
 * `inline` picks how the favicon is addressed — the start page is served the
 * lumina:// scheme and can link to it, while the app chrome is not and needs
 * the bytes themselves.
 */
export function siteIcon(url: string, inline = false): QuickLinkIcon | null {
  const host = hostOf(url)
  if (host && faviconStore().path(url)) {
    const src = inline ? faviconStore().dataUrl(url) : `lumina://icon/${host}`
    if (src) return { kind: 'image', src }
  }

  const brand = brandFor(url)
  return brand ? { kind: 'glyph', path: brand.path, color: glyphColor(brand.hex) } : null
}
