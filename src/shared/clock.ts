/**
 * The start page clock: its faces, and the arithmetic behind them.
 *
 * The functions here are injected into the start page as source text —
 * `widgets.ts` stringifies them into its inline script, because the page runs
 * with no preload and no module loader of its own. That is why each one is
 * self-contained: a call out to anything in module scope would resolve in the
 * main process rather than in the page, and would break outright the first time
 * a bundler renamed it. Keep them pure, and keep them closed over nothing.
 *
 * Being ordinary exports as well, they are unit-tested like any other module.
 */

export type ClockFaceId = 'minimal' | 'bigben' | 'retro'

export interface ClockFaceInfo {
  id: ClockFaceId
  label: string
  hint: string
}

export const CLOCK_FACES: ClockFaceInfo[] = [
  { id: 'minimal', label: 'Minimal', hint: 'Bare digits over the wallpaper' },
  { id: 'bigben', label: 'Big Ben', hint: 'Roman numerals, no second hand' },
  { id: 'retro', label: 'Retro', hint: 'Amber segments behind glass' }
]

/** A clock setting read back from storage, once it has been sanitised. */
export interface ClockSettings {
  face: ClockFaceId
  use12: boolean
  /** Fractions of the viewport, or null while the clock sits where it starts. */
  x: number | null
  y: number | null
}

export const DEFAULT_CLOCK: ClockSettings = { face: 'minimal', use12: false, x: null, y: null }

/**
 * Hand angles in degrees clockwise from twelve.
 *
 * The hour and minute hands carry the finer units too, so they creep the way a
 * real movement does instead of stepping. The Great Clock has no second hand —
 * the Big Ben face leaves `second` unused rather than inventing one.
 */
export function handAngles(
  hours: number,
  minutes: number,
  seconds: number
): { hour: number; minute: number; second: number } {
  return {
    hour: ((hours % 12) + minutes / 60 + seconds / 3600) * 30,
    minute: (minutes + seconds / 60) * 6,
    second: seconds * 6
  }
}

/**
 * The digits a digital face shows.
 *
 * 24-hour time pads the hour so the display never jumps a column at 09:59; the
 * 12-hour form deliberately does not, because a leading zero on a clock face
 * reads as a timetable rather than a clock.
 */
export function clockDigits(
  hours: number,
  minutes: number,
  use12: boolean
): { hours: string; minutes: string; suffix: string } {
  const shown = use12 ? hours % 12 || 12 : hours

  return {
    hours: use12 ? String(shown) : String(shown).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    suffix: use12 ? (hours < 12 ? 'am' : 'pm') : ''
  }
}

/**
 * Where a dragged clock is allowed to come to rest.
 *
 * Position is kept as a fraction of the viewport so the clock holds its place
 * when the window is resized, but it is clamped in pixels: a fraction that was
 * fine in a wide window would otherwise push a wide face off the edge of a
 * narrow one. A face taller or wider than the viewport pins to the margin
 * rather than being given a negative bound.
 */
export function clampSpot(
  spot: { x: number; y: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
  margin = 8
): { x: number; y: number; left: number; top: number } {
  const limit = (fraction: number, extent: number, span: number): number => {
    const most = Math.max(margin, span - extent - margin)
    return Math.min(Math.max(fraction * span, margin), most)
  }

  const left = limit(spot.x, size.width, view.width)
  const top = limit(spot.y, size.height, view.height)

  return {
    left,
    top,
    x: view.width > 0 ? left / view.width : 0,
    y: view.height > 0 ? top / view.height : 0
  }
}
