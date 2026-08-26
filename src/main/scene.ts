/**
 * A generated forest-path scene used as the start page background.
 *
 * Authored as inline SVG rather than a photograph: nothing to license, no
 * network fetch, no multi-megabyte asset in the bundle, and it stays sharp at
 * any window size. Tree placement is deterministic (fixed-seed PRNG), so the
 * scene is identical on every launch instead of flickering between renders.
 */

const WIDTH = 1600
const HEIGHT = 900
const HORIZON = 520
const CENTRE = 800

/** Small deterministic PRNG — natural-looking scatter without randomness. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

function mix(near: [number, number, number], far: [number, number, number], amount: number): string {
  const c = near.map((n, i) => Math.round(n + (far[i]! - n) * amount))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/**
 * One tree. `depth` runs 0 (far, at the horizon) to 1 (near, at the edge of
 * frame); size, offset from the path and haze all follow from it.
 */
function tree(depth: number, side: -1 | 1, rand: () => number): string {
  const perspective = Math.pow(depth, 1.9)
  const baseY = HORIZON + 384 * perspective + 6
  const height = 64 + 660 * Math.pow(depth, 1.45)
  const trunkW = 3 + 30 * Math.pow(depth, 1.55)
  const offset = 30 + 780 * Math.pow(depth, 1.3) * (0.85 + rand() * 0.3)
  const x = CENTRE + side * offset
  const haze = Math.pow(1 - depth, 1.25)

  const trunk = mix([58, 44, 33], [163, 176, 174], haze)
  const canopy = mix([38, 72, 46], [166, 188, 180], haze)
  const canopyLight = mix([74, 116, 72], [186, 204, 196], haze)

  const topY = baseY - height
  const lean = (rand() - 0.5) * trunkW * 1.6
  const crownR = height * (0.19 + rand() * 0.08)

  // Trunk tapers from base to crown, with a slight lean.
  const trunkPath = `M${x - trunkW / 2},${baseY} L${x + trunkW / 2},${baseY} L${x + lean + trunkW * 0.18},${topY} L${x + lean - trunkW * 0.18},${topY} Z`

  // Three overlapping blobs read as foliage without looking like circles.
  const blobs = [
    { dx: 0, dy: 0, r: crownR },
    { dx: -crownR * 0.55, dy: crownR * 0.42, r: crownR * 0.74 },
    { dx: crownR * 0.52, dy: crownR * 0.36, r: crownR * 0.68 }
  ]
    .map(
      (b, i) =>
        `<ellipse cx="${(x + lean + b.dx).toFixed(1)}" cy="${(topY + b.dy).toFixed(1)}" rx="${(b.r * 1.15).toFixed(1)}" ry="${b.r.toFixed(1)}" fill="${i === 0 ? canopy : canopyLight}" opacity="${(0.92 - i * 0.12).toFixed(2)}"/>`
    )
    .join('')

  return `<g><path d="${trunkPath}" fill="${trunk}"/>${blobs}</g>`
}

export function forestScene(): string {
  const rand = makeRandom(20260826)
  const trees: Array<{ depth: number; svg: string }> = []

  // Painter's algorithm: emit far trees first so near ones overlap them.
  const COUNT = 17
  for (const side of [-1, 1] as const) {
    for (let i = 1; i <= COUNT; i++) {
      const depth = Math.pow(i / COUNT, 1.12) * (0.97 + rand() * 0.06)
      trees.push({ depth, svg: tree(Math.min(depth, 1), side, rand) })
    }
  }
  trees.sort((a, b) => a.depth - b.depth)

  return `<svg class="scene" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#20415a"/>
      <stop offset="45%" stop-color="#5b8698"/>
      <stop offset="82%" stop-color="#dbe2d3"/>
      <stop offset="100%" stop-color="#f2ecd8"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#94a389"/>
      <stop offset="30%" stop-color="#4f6544"/>
      <stop offset="100%" stop-color="#1c2a1c"/>
    </linearGradient>
    <linearGradient id="path" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e2dcc6"/>
      <stop offset="45%" stop-color="#b9a98a"/>
      <stop offset="100%" stop-color="#6d5f47"/>
    </linearGradient>
    <linearGradient id="rays" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff6d8" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#fff6d8" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="haze" cx="50%" cy="${(HORIZON / HEIGHT) * 100}%" r="42%">
      <stop offset="0%" stop-color="#f7f0dc" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="#f4f1e0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#05080d" stop-opacity="0.42"/>
      <stop offset="42%" stop-color="#05080d" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#05080d" stop-opacity="0.60"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HORIZON + 4}" fill="url(#sky)"/>
  <rect y="${HORIZON}" width="${WIDTH}" height="${HEIGHT - HORIZON}" fill="url(#ground)"/>

  <!-- The path converges on the vanishing point, which sets the perspective. -->
  <path d="M${CENTRE - 22},${HORIZON} L${CENTRE + 22},${HORIZON} L${CENTRE + 330},${HEIGHT} L${CENTRE - 330},${HEIGHT} Z" fill="url(#path)"/>
  <path d="M${CENTRE - 22},${HORIZON} L${CENTRE + 22},${HORIZON} L${CENTRE + 330},${HEIGHT} L${CENTRE - 330},${HEIGHT} Z" fill="none" stroke="#5c5138" stroke-opacity="0.35" stroke-width="2"/>

  ${trees.map((t) => t.svg).join('\n  ')}

  <!-- Light through the canopy, then haze at the vanishing point for depth. -->
  <g opacity="0.5">
    <polygon points="700,0 880,0 1010,${HEIGHT} 900,${HEIGHT}" fill="url(#rays)"/>
    <polygon points="880,0 990,0 1180,${HEIGHT} 1060,${HEIGHT}" fill="url(#rays)" opacity="0.6"/>
    <polygon points="560,0 660,0 700,${HEIGHT} 600,${HEIGHT}" fill="url(#rays)" opacity="0.45"/>
  </g>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#haze)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>
</svg>`
}
