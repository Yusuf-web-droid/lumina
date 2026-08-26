/**
 * Generates resources/icon.icns (and icon.png) from a source logo image.
 *
 *   env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/make-icon.cjs \
 *     <source-image> [--backdrop <inner>[,<outer>]]
 *
 * --backdrop sets the body colour explicitly, as one hex for a flat fill or two
 * for a centre-to-edge gradient. Without it the backdrop is sampled from the
 * source, which is right for a logo that already sits on its own colour and
 * wrong for one on plain white — that yields a white tile you cannot see.
 *
 * Runs under Electron so it can use nativeImage for decoding, scaling and raw
 * pixel access — no image dependencies needed.
 *
 * What it does:
 *   1. Finds the logo *mark* by bounding-box, ignoring flat background and any
 *      unsaturated wordmark text (marks stay legible at 32px; wordmarks do not).
 *   2. Crops it square with breathing room, keying the source's flat backdrop
 *      out to alpha so the mark can sit on any body colour.
 *   3. Insets it into the Big Sur icon grid: an 824x824 rounded body, corner
 *      radius 185, centred on a transparent 1024x1024 canvas.
 *   4. Emits every size macOS asks for and runs iconutil.
 */
const { app, nativeImage } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const CANVAS = 1024
const BODY = 824 // Apple's icon-grid body size within a 1024 canvas
const RADIUS = 185
const MARK_FILL = 0.66 // fraction of the body the mark occupies

const SRC = resolve(process.argv[2] ?? '')
const BACKDROP_ARG = (() => {
  const at = process.argv.indexOf('--backdrop')
  return at > -1 ? process.argv[at + 1] : null
})()
const OUT_DIR = resolve(__dirname, '..', 'resources')
const ICONSET = join(OUT_DIR, 'icon.iconset')

/** True if a pixel is logo content rather than flat background or white text. */
function isContent(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const saturation = max - min
  const brightness = (r + g + b) / 3
  return saturation > 40 || brightness < 120
}

function findMarkBounds(bitmap, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // nativeImage.toBitmap() is BGRA on all platforms.
      if (!isContent(bitmap[i + 2], bitmap[i + 1], bitmap[i])) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < 0) throw new Error('no logo content found — adjust isContent() thresholds')
  return { minX, minY, maxX, maxY }
}

/**
 * Backdrop colour, sampled from a band just outside the crop rectangle.
 *
 * Sampling the whole image margin would pick up the vignette and come out too
 * dark, leaving a visible square where the crop meets the backdrop. The band
 * immediately around the mark is the colour the crop's own corners actually are.
 */
function backgroundNear(bitmap, width, height, rect, band = 6) {
  const x0 = Math.max(0, rect.x - band)
  const y0 = Math.max(0, rect.y - band)
  const x1 = Math.min(width, rect.x + rect.width + band)
  const y1 = Math.min(height, rect.y + rect.height + band)

  let r = 0
  let g = 0
  let b = 0
  let n = 0

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // Only the ring outside the crop itself, which is pure background.
      const inside =
        x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
      if (inside) continue
      const i = (y * width + x) * 4
      if (isContent(bitmap[i + 2], bitmap[i + 1], bitmap[i])) continue
      b += bitmap[i]
      g += bitmap[i + 1]
      r += bitmap[i + 2]
      n++
    }
  }

  if (n === 0) return { r: 235, g: 235, b: 238 }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

/**
 * Colour at the crop's own boundary, sampled from patches in its four corners.
 *
 * Averaging all non-content pixels inside the crop does not work: the mark's
 * soft dark edges fall below the content threshold and drag the mean down.
 * A letterform's bounding-box corners are genuinely empty, so they give the
 * true backdrop colour where the crop meets the generated body.
 */
function innerBackground(bitmap, width, rect) {
  const patch = Math.max(3, Math.round(rect.width * 0.1))
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width - patch, rect.y],
    [rect.x, rect.y + rect.height - patch],
    [rect.x + rect.width - patch, rect.y + rect.height - patch]
  ]

  let r = 0
  let g = 0
  let b = 0
  let n = 0

  for (const [px, py] of corners) {
    for (let y = py; y < py + patch; y++) {
      for (let x = px; x < px + patch; x++) {
        const i = (y * width + x) * 4
        if (isContent(bitmap[i + 2], bitmap[i + 1], bitmap[i])) continue
        b += bitmap[i]
        g += bitmap[i + 1]
        r += bitmap[i + 2]
        n++
      }
    }
  }

  if (n === 0) return { r: 235, g: 235, b: 238 }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

/** "#0b1b2b" or "#0b1b2b,#061019" -> the body's inner and outer colours. */
function parseBackdrop(value) {
  const hex = (text) => {
    const match = /^#?([0-9a-f]{6})$/i.exec(text.trim())
    if (!match) throw new Error(`--backdrop expects #rrggbb, got "${text}"`)
    const n = parseInt(match[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }

  const [inner, outer] = value.split(',')
  const centre = hex(inner)
  return { inner: centre, outer: outer ? hex(outer) : centre }
}

/**
 * Knock the source's flat backdrop out of the mark.
 *
 * Alpha comes from how far a pixel sits from the backdrop colour, and the
 * colour is un-premultiplied against it, so anti-aliased edges keep no halo of
 * the original background when the mark is placed on a different one.
 */
function keyOutBackdrop(bitmap, size, key) {
  // JPEG ringing puts a halo of near-backdrop pixels around every hard edge.
  // Anything within NOISE of the backdrop is treated as backdrop, or that halo
  // survives as a speckled fringe once the mark moves onto a darker body.
  const NOISE = 22
  const SOLID = 64 // distance at which a pixel is fully opaque

  for (let i = 0; i < size * size * 4; i += 4) {
    const distance = Math.max(
      Math.abs(bitmap[i + 2] - key.r),
      Math.abs(bitmap[i + 1] - key.g),
      Math.abs(bitmap[i] - key.b)
    )

    const alpha = Math.min(1, Math.max(0, (distance - NOISE) / (SOLID - NOISE)))
    if (alpha >= 1) continue

    if (alpha <= 0) {
      bitmap[i + 3] = 0
      continue
    }

    const unmix = (value, keyValue) =>
      Math.max(0, Math.min(255, Math.round((value - keyValue * (1 - alpha)) / alpha)))

    bitmap[i] = unmix(bitmap[i], key.b)
    bitmap[i + 1] = unmix(bitmap[i + 1], key.g)
    bitmap[i + 2] = unmix(bitmap[i + 2], key.r)
    bitmap[i + 3] = Math.round(alpha * 255)
  }
}

/** Zero the alpha of every pixel outside a rounded rectangle. */
function applyRoundedMask(bitmap, size, radius) {
  const inCorner = (x, y, cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let outside = false
      if (x < radius && y < radius) outside = inCorner(x, y, radius, radius)
      else if (x >= size - radius && y < radius) outside = inCorner(x, y, size - radius - 1, radius)
      else if (x < radius && y >= size - radius) outside = inCorner(x, y, radius, size - radius - 1)
      else if (x >= size - radius && y >= size - radius)
        outside = inCorner(x, y, size - radius - 1, size - radius - 1)

      if (outside) bitmap[(y * size + x) * 4 + 3] = 0
    }
  }
}

async function main() {
  if (!process.argv[2]) throw new Error('usage: make-icon.cjs <source-image>')

  const source = nativeImage.createFromPath(SRC)
  if (source.isEmpty()) throw new Error(`could not read image: ${SRC}`)

  const { width, height } = source.getSize()
  const bitmap = source.toBitmap()
  const { minX, minY, maxX, maxY } = findMarkBounds(bitmap, width, height)

  const markW = maxX - minX + 1
  const markH = maxY - minY + 1
  console.log(`source ${width}x${height} -> mark at (${minX},${minY}) ${markW}x${markH}`)

  // Square crop centred on the mark, clamped to the image.
  const side = Math.min(Math.max(markW, markH), width, height)
  const cx = minX + markW / 2
  const cy = minY + markH / 2
  const cropX = Math.round(Math.min(Math.max(0, cx - side / 2), width - side))
  const cropY = Math.round(Math.min(Math.max(0, cy - side / 2), height - side))

  const markSize = Math.round(BODY * MARK_FILL)
  const mark = source
    .crop({ x: cropX, y: cropY, width: side, height: side })
    .resize({ width: markSize, height: markSize, quality: 'best' })
  const markBitmap = mark.toBitmap()

  const cropRect = { x: cropX, y: cropY, width: side, height: side }

  // The colour the mark actually sits on, which is what has to be keyed out.
  const key = innerBackground(bitmap, width, cropRect)
  keyOutBackdrop(markBitmap, markSize, key)

  // Body colour: either given, or sampled so the crop leaves no seam. Sampling
  // uses a radial gradient because the source may have a soft glow behind the
  // mark, which a flat fill cannot continue.
  const override = BACKDROP_ARG ? parseBackdrop(BACKDROP_ARG) : null
  const bg = override ? override.outer : backgroundNear(bitmap, width, height, cropRect)
  const glow = override ? override.inner : key
  console.log(`body rgb(${glow.r}, ${glow.g}, ${glow.b}) -> rgb(${bg.r}, ${bg.g}, ${bg.b})`)

  const bodyBitmap = Buffer.alloc(BODY * BODY * 4)
  const centre = (BODY - 1) / 2
  const maxDist = Math.hypot(centre, centre)
  for (let y = 0; y < BODY; y++) {
    for (let x = 0; x < BODY; x++) {
      const t = Math.min(1, Math.hypot(x - centre, y - centre) / maxDist)
      const i = (y * BODY + x) * 4
      bodyBitmap[i] = Math.round(glow.b + (bg.b - glow.b) * t)
      bodyBitmap[i + 1] = Math.round(glow.g + (bg.g - glow.g) * t)
      bodyBitmap[i + 2] = Math.round(glow.r + (bg.r - glow.r) * t)
      bodyBitmap[i + 3] = 255
    }
  }

  // Centre the mark, feathering the outermost few pixels so no hard edge
  // survives wherever the gradient and the crop still disagree slightly.
  const off = Math.round((BODY - markSize) / 2)
  const feather = Math.max(2, Math.round(markSize * 0.02))
  for (let y = 0; y < markSize; y++) {
    for (let x = 0; x < markSize; x++) {
      const edge = Math.min(x, y, markSize - 1 - x, markSize - 1 - y)
      const src = (y * markSize + x) * 4
      const a = Math.min(1, edge / feather) * (markBitmap[src + 3] / 255)
      if (a <= 0) continue

      const dst = ((y + off) * BODY + (x + off)) * 4
      bodyBitmap[dst] = Math.round(bodyBitmap[dst] + (markBitmap[src] - bodyBitmap[dst]) * a)
      bodyBitmap[dst + 1] = Math.round(
        bodyBitmap[dst + 1] + (markBitmap[src + 1] - bodyBitmap[dst + 1]) * a
      )
      bodyBitmap[dst + 2] = Math.round(
        bodyBitmap[dst + 2] + (markBitmap[src + 2] - bodyBitmap[dst + 2]) * a
      )
      bodyBitmap[dst + 3] = 255
    }
  }

  applyRoundedMask(bodyBitmap, BODY, RADIUS)

  // Compose onto the transparent 1024 canvas.
  const canvas = Buffer.alloc(CANVAS * CANVAS * 4, 0)
  const inset = Math.round((CANVAS - BODY) / 2)
  for (let y = 0; y < BODY; y++) {
    const srcRow = y * BODY * 4
    const dstRow = ((y + inset) * CANVAS + inset) * 4
    bodyBitmap.copy(canvas, dstRow, srcRow, srcRow + BODY * 4)
  }

  const icon = nativeImage.createFromBitmap(canvas, { width: CANVAS, height: CANVAS })

  mkdirSync(OUT_DIR, { recursive: true })
  rmSync(ICONSET, { recursive: true, force: true })
  mkdirSync(ICONSET, { recursive: true })

  const variants = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png']
  ]

  for (const [size, name] of variants) {
    const scaled = icon.resize({ width: size, height: size, quality: 'best' })
    writeFileSync(join(ICONSET, name), scaled.toPNG())
  }

  writeFileSync(join(OUT_DIR, 'icon.png'), icon.toPNG())
  execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', join(OUT_DIR, 'icon.icns')])
  rmSync(ICONSET, { recursive: true, force: true })

  console.log(`wrote ${join(OUT_DIR, 'icon.icns')} and icon.png`)
}

app
  .whenReady()
  .then(main)
  .then(() => app.exit(0))
  .catch((err) => {
    console.error(err)
    app.exit(1)
  })
