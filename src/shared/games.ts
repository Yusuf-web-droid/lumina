/**
 * The games catalogue behind `lumina://home/games`.
 *
 * Everything here runs inside a browser tab. That rules out Minecraft Java and
 * Bedrock, which are native applications — the closest a browser gets is
 * Mojang's own Minecraft Classic, which is here, and streaming a full game
 * from a cloud service, which is the `stream` section.
 *
 * Hand-picked and hand-checked: official publishers, free-to-open pages, and
 * no repackaged copies of anyone's paid client.
 */

export type GameSection = 'play' | 'stream' | 'library' | 'desktop'

export interface Game {
  /** Stable id, used in the play route. Kebab-case. */
  id: string
  name: string
  url: string
  /** One line on the tile, saying what it actually is. */
  blurb: string
  section: GameSection
  /** Shown as a caveat on the tile: it needs a sign-in to get going. */
  needsAccount?: boolean
}

/**
 * Sections whose tiles link straight out instead of through the play route.
 *
 * A desktop download is not a game starting, so it must not take the window
 * over — gaming mode on a download page would just hide the browser you need
 * to use next.
 */
export const DIRECT_LINK_SECTIONS: ReadonlySet<GameSection> = new Set(['desktop'])

export const GAMES: readonly Game[] = [
  // ------------------------------------------------------------------ play
  {
    id: 'minecraft-classic',
    name: 'Minecraft Classic',
    url: 'https://classic.minecraft.net',
    blurb: "Mojang's original 2009 Minecraft, free and complete in the browser.",
    section: 'play'
  },
  {
    id: 'slowroads',
    name: 'Slow Roads',
    url: 'https://slowroads.io',
    blurb: 'Endless scenic driving, generated as you go.',
    section: 'play'
  },
  {
    id: 'krunker',
    name: 'Krunker',
    url: 'https://krunker.io',
    blurb: 'Fast multiplayer shooter that runs at full speed in a tab.',
    section: 'play'
  },
  {
    id: 'slither',
    name: 'Slither.io',
    url: 'https://slither.io',
    blurb: 'Grow the longest snake without running into anyone.',
    section: 'play'
  },
  {
    id: 'lichess',
    name: 'Lichess',
    url: 'https://lichess.org',
    blurb: 'Chess against people or the computer. Free and open source.',
    section: 'play'
  },
  {
    id: 'tetris',
    name: 'Tetris',
    url: 'https://tetris.com/play-tetris',
    blurb: 'The official one, from the Tetris company.',
    section: 'play'
  },
  {
    id: '2048',
    name: '2048',
    url: 'https://play2048.co',
    blurb: 'Slide the tiles together and try to reach 2048.',
    section: 'play'
  },

  // ---------------------------------------------------------------- stream
  {
    id: 'geforce-now',
    name: 'GeForce NOW',
    url: 'https://play.geforcenow.com',
    blurb: 'Stream games you own on Steam and the Epic store.',
    section: 'stream',
    needsAccount: true
  },
  {
    id: 'xbox-cloud',
    name: 'Xbox Cloud Gaming',
    url: 'https://www.xbox.com/play',
    blurb: 'Console games streamed with Game Pass Ultimate.',
    section: 'stream',
    needsAccount: true
  },
  {
    id: 'luna',
    name: 'Amazon Luna',
    url: 'https://luna.amazon.com',
    blurb: "Amazon's streaming service, with titles included for Prime members.",
    section: 'stream',
    needsAccount: true
  },

  // --------------------------------------------------------------- library
  // --------------------------------------------------------------- desktop
  {
    id: 'minecraft-java',
    name: 'Minecraft: Java Edition',
    url: 'https://www.minecraft.net/download',
    blurb:
      "Mojang's official launcher. Its version list plays any release ever made, 2013's 1.5.2 and 1.6.4 included — but it installs on your Mac rather than running in a tab.",
    section: 'desktop',
    needsAccount: true
  },

  {
    id: 'dos-games',
    name: 'MS-DOS Classics',
    url: 'https://archive.org/details/softwarelibrary_msdos_games',
    blurb: 'Thousands of DOS games emulated in the page by the Internet Archive.',
    section: 'library'
  },
  {
    id: 'poki',
    name: 'Poki',
    url: 'https://poki.com',
    blurb: 'A large catalogue of browser games, nothing to install.',
    section: 'library'
  },
  {
    id: 'crazygames',
    name: 'CrazyGames',
    url: 'https://www.crazygames.com',
    blurb: 'Another big browser-game catalogue, sorted by genre.',
    section: 'library'
  },
  {
    id: 'itch',
    name: 'itch.io',
    url: 'https://itch.io/games/free/platform-web',
    blurb: 'Free browser games from independent developers.',
    section: 'library'
  }
]

/** Section headings, in the order the page shows them. */
export const GAME_SECTIONS: ReadonlyArray<{ id: GameSection; title: string; note: string }> = [
  {
    id: 'play',
    title: 'Play right now',
    note: 'Opens and plays immediately. No account, no install.'
  },
  {
    id: 'stream',
    title: 'Stream a full game',
    note: 'Real console and PC games, running on someone else’s hardware. Needs an account with the service.'
  },
  {
    id: 'library',
    title: 'Whole libraries',
    note: 'Catalogues with thousands more, all playable in a tab.'
  },
  {
    id: 'desktop',
    title: 'Not a browser game',
    note: 'The official download, for when only the full game will do. Opens the page rather than starting a game.'
  }
]

/** The games in one section, in catalogue order. */
export function gamesIn(section: GameSection): Game[] {
  return GAMES.filter((g) => g.section === section)
}

/** Look one up by the id used in `lumina://home/games/play/<id>`. */
export function gameById(id: string): Game | null {
  return GAMES.find((g) => g.id === id) ?? null
}
