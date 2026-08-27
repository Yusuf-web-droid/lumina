import { describe, expect, it } from 'vitest'
import { DIRECT_LINK_SECTIONS, GAMES, GAME_SECTIONS, gameById, gamesIn } from './games'
import { isSafeNavigation } from './urlUtils'

describe('the games catalogue', () => {
  it('gives every game a unique id', () => {
    const ids = GAMES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only lists https pages the browser will actually open', () => {
    // The play route redirects a tab to these, so a URL the navigation guard
    // refuses would be a dead tile.
    for (const game of GAMES) {
      expect(game.url.startsWith('https://'), game.name).toBe(true)
      expect(isSafeNavigation(game.url), game.name).toBe(true)
    }
  })

  it('puts every game in a section the page renders', () => {
    const rendered = GAME_SECTIONS.map((s) => s.id)
    for (const game of GAMES) expect(rendered, game.name).toContain(game.section)
  })

  it('leaves no section empty', () => {
    for (const section of GAME_SECTIONS) expect(gamesIn(section.id).length, section.id).toBeGreaterThan(0)
  })

  it('keeps desktop downloads out of the gaming-mode play route', () => {
    // These tiles link straight out; taking the window over on a download page
    // would hide the browser the user still has to use.
    for (const game of gamesIn('desktop')) {
      expect(DIRECT_LINK_SECTIONS.has(game.section), game.name).toBe(true)
    }
    // Everything that does go through the play route must be a real game.
    for (const game of GAMES.filter((g) => !DIRECT_LINK_SECTIONS.has(g.section))) {
      expect(game.section, game.name).not.toBe('desktop')
    }
  })

  it('marks the streaming services as needing an account', () => {
    // The tiles promise "no account" for the play section, so that has to hold.
    for (const game of gamesIn('stream')) expect(game.needsAccount, game.name).toBe(true)
    for (const game of gamesIn('play')) expect(game.needsAccount, game.name).toBeUndefined()
  })

  it('finds a game by the id the play route carries', () => {
    expect(gameById('minecraft-classic')?.url).toBe('https://classic.minecraft.net')
    expect(gameById('nonsense')).toBeNull()
    // Ids come off a URL, so the lookup must not be fooled by prototype keys.
    expect(gameById('constructor')).toBeNull()
  })
})
