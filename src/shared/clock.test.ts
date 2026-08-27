import { describe, expect, it } from 'vitest'
import { clampSpot, clockDigits, handAngles } from './clock'

describe('handAngles', () => {
  it('puts the hour hand where the hour is', () => {
    expect(handAngles(3, 0, 0).hour).toBe(90)
    expect(handAngles(6, 0, 0).hour).toBe(180)
    expect(handAngles(12, 0, 0).hour).toBe(0)
    expect(handAngles(0, 0, 0).hour).toBe(0)
  })

  it('creeps the hour hand through the hour rather than stepping it', () => {
    expect(handAngles(3, 30, 0).hour).toBe(105)
    expect(handAngles(11, 59, 59).hour).toBeCloseTo(359.99, 1)
  })

  it('carries seconds into the minute hand', () => {
    expect(handAngles(0, 15, 0).minute).toBe(90)
    expect(handAngles(0, 15, 30).minute).toBe(93)
    expect(handAngles(0, 0, 30).second).toBe(180)
  })

  it('wraps the afternoon onto the same dial as the morning', () => {
    expect(handAngles(15, 20, 0).hour).toBe(handAngles(3, 20, 0).hour)
  })
})

describe('clockDigits', () => {
  it('pads the 24-hour form so the display never jumps a column', () => {
    expect(clockDigits(9, 5, false)).toEqual({ hours: '09', minutes: '05', suffix: '' })
    expect(clockDigits(0, 0, false)).toEqual({ hours: '00', minutes: '00', suffix: '' })
  })

  it('does not pad the 12-hour form, which would read as a timetable', () => {
    expect(clockDigits(9, 5, true)).toEqual({ hours: '9', minutes: '05', suffix: 'am' })
  })

  it('shows noon and midnight as 12, not 0', () => {
    expect(clockDigits(12, 0, true)).toMatchObject({ hours: '12', suffix: 'pm' })
    expect(clockDigits(0, 30, true)).toMatchObject({ hours: '12', suffix: 'am' })
  })

  it('turns over to pm at noon exactly', () => {
    expect(clockDigits(11, 59, true).suffix).toBe('am')
    expect(clockDigits(12, 0, true).suffix).toBe('pm')
    expect(clockDigits(23, 59, true)).toMatchObject({ hours: '11', suffix: 'pm' })
  })
})

describe('clampSpot', () => {
  const size = { width: 200, height: 100 }
  const view = { width: 1000, height: 800 }

  it('leaves a spot inside the viewport alone', () => {
    expect(clampSpot({ x: 0.5, y: 0.5 }, size, view)).toMatchObject({ left: 500, top: 400 })
  })

  it('keeps the whole face on screen at the far edges', () => {
    expect(clampSpot({ x: 1, y: 1 }, size, view)).toMatchObject({ left: 792, top: 692 })
    expect(clampSpot({ x: -1, y: -1 }, size, view)).toMatchObject({ left: 8, top: 8 })
  })

  it('re-clamps a fraction that no longer fits a narrower window', () => {
    // 0.9 of a 1000px window was fine; 0.9 of a 300px one would hang off it.
    expect(clampSpot({ x: 0.9, y: 0.5 }, size, { width: 300, height: 800 }).left).toBe(92)
  })

  it('pins a face larger than the viewport to the margin', () => {
    const cramped = clampSpot({ x: 0.5, y: 0.5 }, { width: 400, height: 400 }, { width: 300, height: 200 })
    expect(cramped).toMatchObject({ left: 8, top: 8 })
  })

  it('reports the resting place as a fraction of the viewport', () => {
    expect(clampSpot({ x: 0.25, y: 0.25 }, size, view)).toMatchObject({ x: 0.25, y: 0.25 })
  })

  it('survives a zero-sized viewport rather than returning NaN', () => {
    expect(clampSpot({ x: 0.5, y: 0.5 }, size, { width: 0, height: 0 })).toEqual({
      left: 8,
      top: 8,
      x: 0,
      y: 0
    })
  })
})
