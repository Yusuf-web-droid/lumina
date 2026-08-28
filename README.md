# Lumina

A desktop web browser built on Electron and TypeScript. It wraps Chromium rather than
implementing a rendering engine, so real sites render exactly as they do in Chrome.

**[lumina — the site](https://yusuf-web-droid.github.io/lumina/)** · [Downloads](../../releases/latest) · [Changelog](CHANGELOG.md)

## Install

Download the build for your machine from the [latest release](../../releases/latest):

| Platform | File |
|---|---|
| macOS, Apple Silicon (M1 and later) | `Lumina-<version>-arm64.dmg` |
| macOS, Intel | `Lumina-<version>.dmg` |
| Windows | `Lumina-<version>-x64-setup.exe` |
| Linux | `Lumina-<version>.AppImage` or `.deb` |

On macOS, check  → About This Mac if you are not sure which you need; open the DMG and
drag Lumina to Applications. On Windows, run the installer. On Linux, `chmod +x` the
AppImage and run it, or `sudo dpkg -i` the deb.

> **The Windows and Linux builds are untested.** They compile and package on their own
> CI runners, but nobody has yet run one. The Mac build is the one that has been used.
> Please open an issue if a build misbehaves — that is the only way it gets found.

### First launch will be blocked

Every build is unsigned, so each platform warns about it in its own way. On Windows,
SmartScreen shows "Windows protected your PC" — click **More info** → **Run anyway**.
On Linux there is nothing to bypass.

On macOS, the system will refuse to open it, saying Lumina is damaged or from an
unidentified developer. **It is neither.** The app is not signed with an Apple Developer ID
certificate, and Gatekeeper treats every unsigned app this way. Signing requires a paid
Apple Developer membership, which this project does not have.

You have three options, in order of how much you have to trust a stranger:

1. **Build it yourself** — nothing to bypass, because an app you compiled locally is
   never quarantined. See [Building from source](#building-from-source).
2. **Allow it in Settings** — try to open Lumina, then go to  → System Settings →
   Privacy & Security. A message about Lumina appears near the bottom; click **Open
   Anyway**.
3. **Clear the quarantine flag** — the same thing from a terminal:

   ```bash
   xattr -d com.apple.quarantine /Applications/Lumina.app
   ```

Only step 1 requires no trust at all, and it is the honest recommendation for a browser
from someone you do not know.

### Updating

There is no auto-update: applying one requires the same code signature the project does
not have. Download a newer release and replace the app, or
`git pull` and rebuild. Your profile — tabs, bookmarks, history, quick links — lives in
`~/Library/Application Support/Lumina/` and survives replacing the app.

## Building from source

```bash
nvm use          # Node 22, per .nvmrc
npm install
npm run package  # -> dist/
```

The requirements below apply.

## Requirements

This machine is macOS 12.7.6 (Monterey) on Intel, which pins two versions:

| | Version | Why |
|---|---|---|
| Node | **22 LTS** | Node 24+ requires macOS 13.5 |
| Electron | **43.4.1** (exact) | Electron 44 requires macOS Ventura; 43 is the last Monterey line, supported to 5 Jan 2027 |

Node is managed by nvm and pinned by `.nvmrc`:

```bash
nvm use          # picks up .nvmrc -> Node 22
npm install
```

Do not let Electron float past 43 — 44 and later will not launch on Monterey.

## Commands

```bash
npm run dev        # dev with HMR on the chrome UI
npm start          # run the production build
npm run build      # build main / preload / renderer into out/
npm test           # vitest over the pure logic
npm run typecheck  # tsc --noEmit
npm run package    # build + electron-builder -> dist/Lumina.app and .dmg
```

The `dev` and `start` scripts prefix `env -u ELECTRON_RUN_AS_NODE`. Electron-based
editors (VS Code, Cursor) export that variable into their integrated terminals, and it
makes the Electron binary run as plain Node instead of launching the app.

## Architecture

The window is a `BaseWindow` hosting sibling views. Tabs are `WebContentsView`s — not
the deprecated `BrowserView` (deprecated in Electron 30) and not the legacy `<webview>`
tag.

```
BaseWindow  (titleBarStyle: 'hiddenInset')
└── contentView
    ├── tabView[active]   WebContentsView   y=84, fills the rest   (added at index 0)
    └── chromeView        WebContentsView   y=0,  h=84+            (painted on top)
```

The chrome view **floats over** the page rather than displacing it. Its background is
transparent and it only grows past 84px while transient UI is open (suggestions, find
bar, downloads, permission prompt), so opening a dropdown never reflows the web page.
The renderer measures its own overlays and reports the height back over IPC.

Only the active tab's view is attached to the window. Inactive tabs stay detached but
alive, so background pages keep loading and playing.

### State ownership

The main process is the single authority on tab state. Any change broadcasts a whole
`BrowserSnapshot`; the renderer is a pure view that paints whatever arrives and never
keeps its own tab array. This removes the state-drift class of bug entirely.

```
renderer --invoke--> main    tabs:*, nav:*, find:*, history:*, bookmarks:*, downloads:*, zoom:*
main ------send----> renderer  on:snapshot, on:find-result, on:downloads, on:permission-prompt
```

`src/shared/types.ts` holds the channel names and payload types, imported by all three
sides so they cannot drift.

### Layout

`BrowserWindow.layout()` in `src/main/window.ts` is the **only** place view bounds are
assigned. Every resize, fullscreen and chrome-height change routes through it.

## Security

Tabs are treated as hostile:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`
- Tab views get **no preload and no bridge** — only the chrome UI has one
- `setWindowOpenHandler` denies every popup and opens a tab instead, so a page can never
  spawn a window we did not configure
- `will-navigate` is checked against an allow-list (`http`, `https`, `about`, `blob`), and
  page-initiated navigation to `lumina:` is refused outright — see below
- Every IPC handler verifies `event.sender` is the chrome view before acting
- Permissions are deny-by-default; anything not trivially safe prompts the user
- `certificate-error` always rejects
- All tabs share `persist:lumina`, so logins persist across tabs and restarts

Side-panel tools are web pages too, so they get the same `will-navigate` filter tabs do,
and a tool URL read back from disk is re-checked before it is loaded rather than trusted
because it was validated when it was pinned.

### The `lumina://` privilege boundary

`lumina:` is registered `standard` and `secure`, so the start page is a real origin with
real storage. Some of its routes also change app state, and one — `background/choose` —
opens a native file dialog. That combination is a privilege boundary, and it is guarded
three independent ways, because each covers a gap the others cannot.

1. **Origin-aware navigation.** `mayNavigateTo()` in `src/shared/urlUtils.ts` allows a
   `lumina:` target only from a page already on `lumina:`. It cannot simply be dropped
   from the allow-list: the settings page drives itself with ordinary
   `<a href="lumina://…">` links, which are page-initiated navigations too. The
   *initiator* is what separates the start page from example.com.
2. **`frame-ancestors 'none'`.** Every response from the scheme carries a CSP. This is
   the layer that matters most, because `will-navigate` fires for main-frame navigation
   only — a hostile page embedding a privileged route in an `<iframe>` would never reach
   guard 1 at all.
3. **A per-run token on every mutating route** (`src/main/pageToken.ts`). Chromium sends
   no `Sec-Fetch-*` headers for a custom scheme, so there is no request metadata to key
   on; the token fills that gap. Another origin cannot read our page to learn it, and a
   no-cors request cannot set a non-safelisted header to send one. It travels as a header
   for the weather widget's `fetch()`, and as a `t=` query parameter for links, which
   cannot set headers.

Read-only routes are deliberately **not** token-gated, so a bookmarked
`lumina://home/background` still opens after a restart even though the token rotates every
run. The split is enforced in `src/main/startPageRoutes.ts` and tested in its neighbour.

## Ad and tracker blocking

On by default. Requests to known ad and tracker domains are cancelled in
`onBeforeRequest` on the tab session. The shield in the toolbar shows how many were
blocked on the current page, and opening it lists who they belonged to.

**The list is hand-written** (`src/main/blocklistData.ts`), grouped by owner. That is a
licensing decision, not laziness: EasyList and AdGuard are GPL, and DuckDuckGo's Tracker
Radar is CC BY-NC-SA, so bundling any of them into an MIT project is a real conflict
rather than a technicality. The cost is coverage of the long tail, which matters less
than it sounds — ad traffic is heavily concentrated, so a few dozen domains account for
most of what a page loads. Nothing is downloaded at runtime, so blocking works offline
and on first launch, and no third party is told what you browse.

Four rules keep it from breaking pages, all in `src/shared/blocking.ts` and unit-tested:

- **Top-level navigation is never blocked.** Typing a tracker's domain in the address bar
  gets you there. Cancelling a main-frame load would leave a dead tab on an error page,
  which is the worst failure a blocker has.
- **A site may always talk to itself.** Requests to the page's own registrable domain are
  exempt.
- **So may a site's other domain.** Meta serves its SDK from `facebook.net`, so an
  eTLD+1 comparison alone would call a company's own script a third-party tracker while
  you are standing on its site. Same owner counts as first party.
- **Only watched tabs are blocked.** Side-panel tools share the tab session, so their
  requests reach the listener, but they are never registered — silently breaking a
  signed-in Gemini or ChatGPT panel is not worth it.

`onBeforeSendHeaders` is deliberately untouched: `applyClientHints()` owns it, Electron
allows one listener per event per session, and displacing it would break the client hints
that keep Google sign-in working. `onBeforeRequest` is a separate event.

**When a page breaks**, in escalating order: click the shield and *Turn off for this
site*, which reloads immediately and persists (keyed by registrable domain, so it covers
every subdomain); uncheck **View → Block Ads and Trackers** to switch it off everywhere;
or delete `blocking.json`, which falls back to defaults. `googletagmanager.com` is the
entry most likely to break something, and it is on the list anyway because it is also the
most prevalent — the per-site switch exists for exactly that case.

The counter is per-committed-document, so a single-page app that navigates without a
document change keeps accumulating into one count.

## Storage

`~/Library/Application Support/Lumina/`

The browser was called Nexus in earlier builds, and this path is derived from the app
name, so a profile left behind by one of those is moved across on first launch — see
`src/main/migrateProfile.ts`. It only ever renames, and only into a name that does not
exist yet, so an existing profile is never overwritten. Widget state on the start page
(to-do items, clock and temperature units) does not come across: browser storage keys it
to the `nexus://` origin, which no longer exists.

| File | Contents |
|---|---|
| `history.json` | visit log, capped at 5000 entries, feeds address-bar autocomplete |
| `bookmarks.json` | bookmarks |
| `session.json` | open tab URLs and window bounds, restored on launch |
| `quicklinks.json` | start-page links, once they have been edited |
| `background.json` | start-page background choice, alongside the copied image |
| `favicons.json` + `favicons/` | cached site logos for the start-page tiles |
| `weather.json` | the chosen place and its last reading, for the weather widget |
| `theme.json` | light/dark appearance choice |
| `blocking.json` | ad-blocking master switch and the per-site off list |

Written by a small debounced atomic store (`src/main/store.ts`) rather than
`electron-store`, whose recent majors are ESM-only and conflict with the CJS build that
sandboxed preloads require.

### Site logos

Start-page tiles show the site's real logo. Three layers, in order:

1. The site's own favicon, fetched from the site itself — never through a
   third-party favicon service, which would hand a stranger the list of sites
   you visit most. Icons are fetched in the background and cached under
   `favicons/`, so tiles render from disk and keep working offline. Everything
   is normalised to PNG through `nativeImage`, except SVG (already
   resolution-independent) and `.ico`, which `nativeImage` cannot decode on
   macOS but Chromium renders happily.
2. A bundled brand glyph (`src/main/brandMarks.ts`) for ~80 well-known hosts,
   so the common sites have a real logo instantly, offline, on first run. These
   are single-path marks from the [Simple Icons](https://simpleicons.org) set
   (CC0), inlined at author time — there is no runtime dependency on it. Brands
   Simple Icons has dropped (Amazon, BBC, LinkedIn, Microsoft) are covered by
   layer 1.
3. The old letter tile, for anything with neither.

### Light and dark

Appearance is set from **View → Appearance**, or from the dock on the start page:
Match System, Light, or Dark.

The whole mechanism is one line — `nativeTheme.themeSource`. Chromium drives
`prefers-color-scheme` in every renderer from it, so the chrome UI and the
`lumina://` pages restyle themselves the moment it changes. Nothing is pushed over
IPC and nothing reloads, which is also why switching appearance does not disturb
a page you are reading.

Both stylesheets are token-based: a light palette on `:root`, dark overrides
under `@media (prefers-color-scheme: dark)`.

The start page is the one exception worth knowing about. Two of its three
backgrounds are imagery — a photo, or the illustrated scene — and text over
imagery wants the light-on-dark treatment whatever the system appearance is. So
its defaults are the "over imagery" set, and only the plain background opts into
the themed palette, via a `themed` class on `<body>`.

### Widgets

Three optional overlays, toggled from the dock in the bottom-right corner: a
clock, local weather, and a to-do list. Only the clock is on by default. Click
the time to switch between 24-hour and 12-hour, and the temperature to switch
between Celsius and Fahrenheit.

#### The clock

**Drag it anywhere.** It comes to rest wherever you drop it and stays there
across restarts. Its position is stored as a fraction of the window rather than
in pixels, so it holds its place when the window is resized, and is re-clamped
on the way back out — a spot that was fine on a wide window would otherwise put
the clock off the edge of a narrow one. **Reset position** in its menu puts it
back in the top-left corner.

**Three faces**, chosen from the cog that appears when you hover it:

| Face | |
|---|---|
| Minimal | The original: bare digits and the date, no frame |
| Big Ben | The Great Clock's dial — cream and gilt, Roman numerals with `IV`, and no second hand, because the real one has none |
| Retro | An amber segment display behind glass, with the unlit segments faintly visible behind the time and a colon that blinks on the half-second |

The hand angles, digit formatting and drag clamping live in
[`src/shared/clock.ts`](src/shared/clock.ts) and are unit-tested. The start page
cannot import a module, so `widgets.ts` ships them by stringifying the functions
into its inline script — which is why they are written to be self-contained,
closed over nothing.

The start page still has no preload and no IPC bridge, so:

- **Toggle state, to-dos, the clock's face and place, and unit preferences** live in the page's own
  `localStorage`. The `lumina://` origin is registered as standard and secure, so
  it is a real origin with real storage. Nothing round-trips to the main
  process, so toggling a widget or ticking a task never reloads the page.
- **Weather** does need the network, so the page fetches it from the main
  process over same-origin `lumina://home/weather` routes (`supportFetchAPI` is
  on for the scheme; `corsEnabled` is not). Readings are cached in
  `weather.json` and refreshed every 15 minutes, so a new tab draws immediately
  and still shows the last known conditions offline.

The forecast comes from [Open-Meteo](https://open-meteo.com), which needs no API
key or account. The place is one you type — there is no IP geolocation — so the
only thing that leaves the machine is a city name you chose.

Chromium sends no `Sec-Fetch-*` headers for a custom scheme, so the weather
routes are gated on a token minted per run and embedded in the generated page.
Another origin cannot read the page to learn it, and a no-cors request cannot
set a non-safelisted header to send one.

## Shortcuts

| | |
|---|---|
| ⌘T / ⌘W / ⌘⇧T | new tab / close tab / reopen closed |
| ⌘L | focus address bar |
| ⌘R | reload |
| ⌘F | find in page (⏎ next, ⇧⏎ previous, Esc close) |
| ⌘D | bookmark |
| ⌘1–8, ⌘9 | jump to tab N, jump to last tab |
| ⌃Tab / ⌃⇧Tab | next / previous tab |
| ⌘[ / ⌘] | back / forward |
| ⌘+ / ⌘− / ⌘0 | zoom |
| ⌘⌥I | dev tools for the current page |

Stop has no Esc accelerator on purpose — a menu accelerator outranks the focused page,
so binding Esc would stop it ever reaching the find bar or a web page. Use the toolbar
stop button.

## Tests

`npm test` covers the pure logic, where the subtle bugs actually live:

- `normalizeInput()` — URL vs search: bare hostnames, `localhost:3000`, IPv4,
  numeric-TLD strings like `3.14`, whitespace, unknown schemes, `mailto:`
- `isSafeNavigation()` — the navigation allow-list, including `javascript:`
- tab ordering — which tab activates after a close, wrap-around, reorder, ⌘1–9 mapping
- `brandFor()` — host-to-logo lookup, including that a lookalike host like
  `github.com.evil.example` must not match GitHub
- `mayNavigateTo()` — that a web page cannot reach `lumina:` while the start page can,
  and that every other scheme still behaves exactly as `isSafeNavigation()` decides
- `shouldBlock()` — that a main-frame load is never cancelled, that a site may reach its
  own domains, that `doubleclick.net.evil.example` matches nothing, and that the shipped
  list contains only plain DNS names, has no entry a parent already covers, and never
  blocks infrastructure like CDNs, fonts, payments or consent managers
- the `lumina://` route table — that every mutating route refuses a missing or wrong
  token and leaves its store untouched, that read-only routes work without one, that the
  icon route rejects a path trying to walk out of its directory, and that the CSP is on
  every response including errors

End-to-end automation is deliberately skipped: Playwright's Electron driver has poor
visibility into `WebContentsView` content, so a suite there would cost more than it catches.

Instead there is an in-app smoke capture, which works without macOS Screen Recording
permission because the app captures its own views:

```bash
LUMINA_SMOKE_CAPTURE=/tmp/shots LUMINA_SMOKE_FIND=1 \
  env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron ./out/main/index.js
```

Writes `chrome.png` and `page.png`, then quits. `LUMINA_SMOKE_FIND=1` also opens the find
bar first, which proves the chrome view expands over the page.

## Packaging

```bash
npm run package
```

That builds for macOS only. Windows installers need Wine and Linux packages need Docker
when cross-built from a Mac, so the other two are built on their own CI runners instead:
`.github/workflows/release.yml` runs the suite and packages all three platforms whenever
a `v*` tag is pushed, then attaches the artifacts to that tag's release.

Produces `dist/mac/Lumina.app` (276 MB) and `dist/Lumina-<version>.dmg` (116 MB), Intel x64,
`minimumSystemVersion: 12.0`.

The build is **unsigned** (`identity: null`), which is fine for personal use — macOS
Gatekeeper will need a right-click → Open on first launch. Distributing to anyone else
needs an Apple Developer ID, `hardenedRuntime`, entitlements and notarization.

### Icon

`resources/icon.icns` is generated from the source logo, not hand-made. The artwork is
`resources/logo-lockup.png` — the Lumina mark, a stroke of light curling into a sphere
around a four-point star, over the `lumina browser` wordmark.

Only the mark goes into the icon; a wordmark is unreadable at the 32px dock size.
`make-icon.cjs` normally discards one on its own, by bounding box, but that only works
for a wordmark set in flat white or another unsaturated colour — this one is near-black
and the box would swallow it. So the mark is cropped out of the lockup once, by hand,
into `resources/logo-source.png`, and that square is what the script is pointed at. To
rebuild the icon after changing the artwork:

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/make-icon.cjs \
  resources/logo-source.png --backdrop "#FFFFFF,#EDEEFA"
```

The script finds the logo *mark* by bounding box, then insets it into the Big Sur icon
grid (824×824 rounded body, radius 185, centred on a transparent 1024 canvas) and emits
every size macOS asks for via `iconutil`.

The body's corner is a superellipse sampled for coverage, not a circular arc tested
in-or-out. Both halves of that matter. An in-or-out test steps the corner in whole pixels,
which the 1024 master shows as a ragged edge; and a circular arc starts bending at full
curvature the instant it leaves the straight edge, which reads as a hard corner.

The mask premultiplies the pixels it fades, rather than touching the alpha channel alone.
`nativeImage` buffers are premultiplied, so a corner pixel left at full white under a
reduced alpha is invalid data, and `resize()` clamps it back to opaque — which squares off
every entry in the iconset while the 1024 master still looks correctly rounded. If the
dock ever shows a square tile from a rounded master, that is the bug to look for.

Radius and exponent are `CORNER` in the script, overridable with `--corner 290,3`. Apple's
own grid is 185 at exponent 5, but a high exponent bulges the curve towards the corner
point — 185/5 leaves 600 of the 824 edge flat and still looks sharp in the dock. The
default here is 290/3, which is visibly rounded while staying a square: keep the radius
well under half the body (412) or the tile becomes a circle.

The source logo sits on flat white, so its backdrop is keyed out to alpha and the body is
filled with the `--backdrop` colours instead — without that the tile is white on white and
you cannot see it is a rounded square at all. Keying uses a noise floor, because JPEG
ringing otherwise leaves a speckled halo around every hard edge once the mark moves onto a
different body. The body here is white to barely-lilac rather than the deep indigo the
old mark used: the star at the centre of the mark is white, keying takes it down to alpha
with the rest of the white, and on a dark body it would come back as a hole punched
through the middle.

`resources/logo-source.svg` is the retired mark — a band of light tapering around a rim
with a bead breaking away — kept with `scripts/render-svg.cjs`, which rasterises an SVG
through Electron's own renderer because `nativeImage` cannot decode SVG and there is no
rsvg-convert or ImageMagick here to lean on.

## Search

The address bar sends anything that is not a URL to Google, and the home page is
`https://www.google.com`. Both are one-liners to change:

| What | Where |
|---|---|
| Search engine | `DEFAULT_SEARCH_TEMPLATE` in `src/shared/urlUtils.ts` |
| Home page | `HOME_URL` in `src/main/window.ts` |

`src/main/index.ts` strips the `Electron/…` and `Lumina/…` tokens from the user agent so
the app presents as plain Chrome. Without that, Google's sign-in flow refuses to
authenticate, reporting the browser as insecure.
