import { describe, expect, it } from 'vitest'
import { CLOCK_FACES } from '@shared/clock'
import { widgetOverlays, widgetScript, widgetStyles } from './widgets'

/**
 * The widget script is a ~400-line string that no compiler ever looks at, and
 * a syntax error in it takes the whole start page down silently — the clock,
 * the weather and the to-do list all stop, with nothing but a console message
 * in a window nobody has open. `new Function` parses without running, which is
 * the cheapest way to keep that from shipping.
 */
describe('widgetScript', () => {
  it('parses as JavaScript', () => {
    expect(() => new Function(widgetScript())).not.toThrow()
  })

  it('carries the shared clock arithmetic into the page', () => {
    const script = widgetScript()

    // Stringified from @shared/clock. If a bundler ever inlines or renames
    // them, they arrive as something other than a declaration and the page
    // breaks at runtime — so assert the shape that actually has to hold.
    for (const name of ['handAngles', 'clockDigits', 'clampSpot']) {
      expect(script).toContain(`function ${name}(`)
    }
  })

  it('knows every face the picker offers', () => {
    const script = widgetScript()
    for (const face of CLOCK_FACES) expect(script).toContain(`"${face.id}"`)
  })
})

describe('widgetOverlays', () => {
  it('renders a panel for every clock face', () => {
    const html = overlays()
    for (const face of CLOCK_FACES) {
      expect(html).toContain(`data-face="${face.id}"`)
      expect(html).toContain(face.label)
    }
  })

  it('uses IV on the Big Ben dial, as the Great Clock does', () => {
    expect(overlays()).toContain('>IV<')
    expect(overlays()).not.toContain('>IIII<')
  })

  it('gives every element the script reaches for an id', () => {
    const html = overlays()
    const ids = ['clock-time', 'clock-date', 'bb-hour', 'bb-minute', 'bb-date', 'retro-time',
                 'retro-suffix', 'retro-secs', 'retro-day', 'clock-cog', 'clock-menu',
                 'clock-24', 'clock-home']

    for (const id of ids) {
      expect(html, `${id} is missing from the markup`).toContain(`id="${id}"`)
      expect(widgetScript(), `${id} is not used by the script`).toContain(`'${id}'`)
    }
  })
})

describe('widgetStyles', () => {
  it('shows exactly the chosen face', () => {
    const css = widgetStyles()
    expect(css).toContain('.clock-face { display: none; }')
    for (const face of CLOCK_FACES) {
      expect(css).toContain(`.clock[data-face='${face.id}'] .clock-face[data-face='${face.id}']`)
    }
  })
})

const overlays = (): string => widgetOverlays()
