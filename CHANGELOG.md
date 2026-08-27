# Changelog

## Unreleased

### Windows and Linux

- **Lumina builds for Windows and Linux**, alongside macOS: an NSIS installer, an
  AppImage and a deb, each for x64 and arm64. They are **untested** — they compile and
  package, but nobody has run one yet.
- The frameless window would have had no close, minimise or maximise button off macOS,
  which hides its title bar but keeps the traffic lights. Windows and Linux get the
  native overlay drawn over the tab strip's right end instead, and the strip insets on
  that side rather than the left.
- The application menu is a macOS convention, and its roles do not exist elsewhere, so
  off macOS its contents move: Quit to the foot of File, About to Help.
- Pushing a `v*` tag now builds all three platforms on GitHub's runners, runs the
  typecheck and the suite on each, and attaches the artifacts to that tag's release.
  Cross-building from a Mac is not possible without Wine and Docker.

## 0.2.0

### The clock moves, and changes face

- **Drag the start page's clock wherever you want it.** It stays where you drop
  it, across restarts, and keeps its place proportionally when the window is
  resized rather than sliding off the edge. **Reset position** in its menu puts
  it back.
- **Three faces**, from the cog that appears when you hover the clock: the
  original **Minimal** digits, **Big Ben** — the Great Clock's cream-and-gilt
  dial, Roman numerals with `IV`, and no second hand, as the real one has none —
  and **Retro**, an amber segment display with unlit segments showing faintly
  behind the time.
- 12-hour and 24-hour moved into that menu as well, and clicking the time still
  switches it. An existing 12-hour preference carries over.

### Games

- **A games page**, from the 🎮 Games button on the start page or View → Games. Every
  entry plays in a browser tab, grouped by what it asks of you first: things that open
  and play immediately with no account, full console and PC games streamed from a
  service you subscribe to, and catalogues holding thousands more.
- **Minecraft Classic is in there** — Mojang's original 2009 version, free and complete
  in the browser. Minecraft Java and Bedrock are native applications and cannot run in
  a browser at all; streaming is the only way to reach a modern Minecraft from here.
- **Minecraft: Java Edition** has its own tile under "Not a browser game". Its launcher's
  version list plays any release ever made, 2013's 1.5.2 and 1.6.4 included, but it
  installs on your Mac rather than running in a tab.
- Opening a game **switches gaming mode on for you**, so it starts with the browser out
  of the way. Esc gives you the browser back. Tiles that only lead to a download link
  straight out instead, since there is no game to hand the window to.

### Gaming mode

- **View → Gaming Mode (⇧⌘G) hands the whole window to the page.** Tab strip, toolbar
  and side panel go away, the window goes fullscreen, and the game gets every pixel.
- **The display will not sleep** while it is on — a game you are watching rather than
  typing into no longer dims mid-cutscene.
- **Background tabs stop being throttled**, so alt-tabbing to Discord does not stall
  what is running. Chromium otherwise pauses timers and animations in a window that
  is not in front, which browser games read as a cue to pause themselves.
- **Cloud gaming services work properly.** On GeForce NOW, Xbox Cloud Gaming, Amazon
  Luna, Boosteroid and Shadow, Lumina grants keyboard lock, so Esc opens the game's
  own menu instead of throwing you out of fullscreen, and the ad blocker stands down,
  since a stream's session traffic is hard to tell from telemetry and cancelling the
  wrong request ends the game rather than hiding an advert. The shield says so when
  it happens. Nothing is granted anywhere else on the web.
- Entering the mode hands keyboard focus to the page, so a game gets your input
  without needing to be clicked first.
- Leaving fullscreen by any route — Esc, the green button, Mission Control — leaves
  gaming mode too, so you are never stuck in a window with no toolbar. Whatever the
  side panel was doing beforehand comes back with it.

### Ad and tracker blocking

- **Lumina now blocks ads and trackers**, on by default. A shield in the toolbar counts
  what was blocked on the page and lists who it belonged to.
- The list is bundled, not downloaded — blocking works offline, on first launch, and
  without telling any third party what you browse. It is hand-written rather than taken
  from EasyList or Tracker Radar, which are GPL and CC BY-NC-SA respectively and would
  conflict with this project's MIT licence.
- Pages are protected from over-blocking: a top-level navigation is never cancelled, a
  site can always reach its own domains (including a second domain owned by the same
  company), and side-panel tools are never touched.
- Click the shield → **Turn off for this site** when something breaks; it reloads and
  persists, and covers every subdomain. **View → Block Ads and Trackers** switches it off
  everywhere.

### Security

- **Closed a privilege hole in the `lumina://` scheme.** Any web page could navigate
  itself to a privileged route: `location = 'lumina://home/background/choose'` opened a
  native file dialog, and other routes silently changed the theme, wallpaper and dim
  level. Three independent guards now stop it — page-initiated navigation to `lumina:`
  is allowed only from `lumina:` itself, every response carries a CSP with
  `frame-ancestors 'none'` (the iframe route, which a `will-navigate` guard cannot see),
  and every route that changes state requires a per-run token. Read-only routes are
  unchanged, so a bookmarked `lumina://home/background` still works.
- Side-panel tools now get the same navigation filter tabs have, and a pinned tool's URL
  is re-checked when it is read back from disk instead of being trusted.
- The `lumina://` router moved into its own module so it could be tested. The suite grew
  from 63 to 98 tests.

### Renamed to Lumina

- The browser is now called Lumina. The app, the bundle id, the internal `lumina://`
  scheme and the DMG all follow.
- A new mark: a stroke of light curling into a sphere around a four-point star, violet
  into blue on a near-white tile. Replaces the node-graph N.
- Your profile moves across on first launch — bookmarks, history, tabs, cookies and
  logins all survive the rename. The one thing that does not is the start page's widget
  state (to-do items, 12/24-hour clock, °C/°F), which browser storage keys to the
  `nexus://` origin that no longer exists. The weather place is kept, since that is
  stored by the app rather than the page.

### Side panel

- The side panel (⌘J) now hosts several pinned tools instead of just Gemini, switched
  from an icon rail down the window's right edge. Ships with Gemini, ChatGPT and Claude.
- Pin the page you are on with the rail's + button, unpin from a tool's right-click
  menu. Pinned tools and the last one you used persist across launches.
- **Drag the icons to reorder them.** A line shows where the tool will land, the order
  is kept across launches, and dragging never reloads the tool you move.
- Each tool keeps its own live view, so switching away and back does not reload the
  conversation. Tools share the tabs' session, so one sign-in covers both.

## 0.1.0

First public build. A minimal desktop browser: tabs, bookmarks, history, downloads,
find-in-page, quick links, and a generated start page.

### Browsing

- Tabs with session restore, reopen-closed, drag reorder, and ⌘1–9 jumping
- Bookmarks, history with address-bar autocomplete, and a downloads panel
- Find-in-page, per-site permission prompts, and a Gemini side panel
- Web content is fully sandboxed: tabs get no preload and no IPC bridge

### Start page

- Quick-link tiles showing each site's real logo — its own favicon where one has been
  fetched, otherwise one of ~80 bundled brand glyphs, otherwise a letter tile. Favicons
  come from the sites themselves, never a third-party favicon service, and are cached
  so tiles render from disk and work offline.
- Three optional overlays, toggled from the dock: a clock, local weather, and a to-do
  list. Weather comes from Open-Meteo using a place you type — no IP geolocation, no
  API key.
- Choice of background: one of three shipped photos, one of your own, a built-in
  illustrated scene, or a plain gradient.

### Appearance

- Light and dark, following macOS or pinned either way, from View → Appearance

### Known limitations

- **Not code signed or notarized.** macOS blocks the first launch; see the README for
  how to allow it, or build from source.
- **No auto-update.** Applying updates on macOS needs a code signature.
- Search engine is fixed to Google.
- macOS only, 12.0 or later.

### Privacy

Nothing is collected and there is no telemetry. What leaves your machine: a favicon
request to each quick-link site, a place name and coordinates to Open-Meteo if you use
the weather widget, and your searches to your search engine.
