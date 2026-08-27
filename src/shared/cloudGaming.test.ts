import { describe, expect, it } from 'vitest'
import { cloudGamingService, isCloudGaming } from './cloudGaming'

describe('cloudGamingService', () => {
  it('recognises the services by their play hosts', () => {
    expect(cloudGamingService('https://play.geforcenow.com/games')).toBe('GeForce NOW')
    expect(cloudGamingService('https://cloud.boosteroid.com/')).toBe('Boosteroid')
    expect(cloudGamingService('https://luna.amazon.com/play')).toBe('Amazon Luna')
  })

  it('matches subdomains, including the session hosts a stream moves to', () => {
    expect(cloudGamingService('https://eu-central.nvidiagrid.net/session')).toBe('GeForce NOW')
  })

  it('does not match a lookalike registered under someone else', () => {
    // The suffix check must require a dot, or "notgeforcenow.com" would pass.
    expect(cloudGamingService('https://notgeforcenow.com/')).toBeNull()
    expect(cloudGamingService('https://geforcenow.com.evil.test/')).toBeNull()
  })

  it('limits Xbox to the streaming path, not the whole marketing site', () => {
    expect(cloudGamingService('https://www.xbox.com/play/games/x')).toBe('Xbox Cloud Gaming')
    expect(cloudGamingService('https://www.xbox.com/en-GB/games')).toBeNull()
  })

  it('finds the Xbox streaming path behind a locale segment', () => {
    // The bare URL redirects to a localised one, which is where people land.
    expect(cloudGamingService('https://www.xbox.com/en-GB/play')).toBe('Xbox Cloud Gaming')
    expect(cloudGamingService('https://www.xbox.com/pt-BR/play/launch/game/x')).toBe(
      'Xbox Cloud Gaming'
    )
    expect(cloudGamingService('https://www.xbox.com/de/play')).toBe('Xbox Cloud Gaming')
  })

  it('ignores anything that is not a web page', () => {
    expect(cloudGamingService('lumina://home')).toBeNull()
    expect(cloudGamingService('file:///Users/someone/game.html')).toBeNull()
    expect(cloudGamingService('not a url')).toBeNull()
  })

  it('leaves the ordinary web alone', () => {
    expect(cloudGamingService('https://example.com/')).toBeNull()
    expect(isCloudGaming('https://amazon.com/')).toBe(false)
  })
})
