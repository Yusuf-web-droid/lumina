# Nexus

A desktop web browser built on Electron and TypeScript. It wraps Chromium rather than
implementing a rendering engine, so real sites render exactly as they do in Chrome.

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
npm run package    # build + electron-builder -> dist/Nexus.app and .dmg
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
- `will-navigate` is checked against an allow-list (`http`, `https`, `about`, `blob`)
- Every IPC handler verifies `event.sender` is the chrome view before acting
- Permissions are deny-by-default; anything not trivially safe prompts the user
- `certificate-error` always rejects
- All tabs share `persist:nexus`, so logins persist across tabs and restarts

## Storage

`~/Library/Application Support/Nexus/`

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
`nexus://` pages restyle themselves the moment it changes. Nothing is pushed over
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
digital clock, local weather, and a to-do list. Only the clock is on by
default. Click the time to switch between 24-hour and 12-hour, and the
temperature to switch between Celsius and Fahrenheit.

The start page still has no preload and no IPC bridge, so:

- **Toggle state, to-dos and unit preferences** live in the page's own
  `localStorage`. The `nexus://` origin is registered as standard and secure, so
  it is a real origin with real storage. Nothing round-trips to the main
  process, so toggling a widget or ticking a task never reloads the page.
- **Weather** does need the network, so the page fetches it from the main
  process over same-origin `nexus://home/weather` routes (`supportFetchAPI` is
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

End-to-end automation is deliberately skipped: Playwright's Electron driver has poor
visibility into `WebContentsView` content, so a suite there would cost more than it catches.

Instead there is an in-app smoke capture, which works without macOS Screen Recording
permission because the app captures its own views:

```bash
NEXUS_SMOKE_CAPTURE=/tmp/shots NEXUS_SMOKE_FIND=1 \
  env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron ./out/main/index.js
```

Writes `chrome.png` and `page.png`, then quits. `NEXUS_SMOKE_FIND=1` also opens the find
bar first, which proves the chrome view expands over the page.

## Packaging

```bash
npm run package
```

Produces `dist/mac/Nexus.app` (276 MB) and `dist/Nexus-0.1.0.dmg` (116 MB), Intel x64,
`minimumSystemVersion: 12.0`.

The build is **unsigned** (`identity: null`), which is fine for personal use — macOS
Gatekeeper will need a right-click → Open on first launch. Distributing to anyone else
needs an Apple Developer ID, `hardenedRuntime`, entitlements and notarization.

### Icon

`resources/icon.icns` is generated from the source logo, not hand-made. The source is
`resources/logo-source.svg` — an original mark, a node-graph N that reads as both the
letter and a connection — rasterised to `logo-source.png` because `nativeImage` cannot
decode SVG. To rebuild the icon after changing the artwork:

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/make-icon.cjs \
  resources/logo-source.png --backdrop "#14304A,#0A1725"
```

The script finds the logo *mark* by bounding box and discards any wordmark — a wordmark
is unreadable at the 32px dock size — then insets it into the Big Sur icon grid (824×824
rounded body, radius 185, centred on a transparent 1024 canvas) and emits every size
macOS asks for via `iconutil`.

The source logo sits on flat white, so its backdrop is keyed out to alpha and the body is
filled with the `--backdrop` colours instead — without that the tile is white on white and
you cannot see it is a rounded square at all. Keying uses a noise floor, because JPEG
ringing otherwise leaves a speckled halo around every hard edge once the mark moves onto a
darker body. Omit `--backdrop` for a logo that already carries its own background colour,
and the body is sampled from the source instead.

## Search

The address bar sends anything that is not a URL to Google, and the home page is
`https://www.google.com`. Both are one-liners to change:

| What | Where |
|---|---|
| Search engine | `DEFAULT_SEARCH_TEMPLATE` in `src/shared/urlUtils.ts` |
| Home page | `HOME_URL` in `src/main/window.ts` |

`src/main/index.ts` strips the `Electron/…` and `Nexus/…` tokens from the user agent so
the app presents as plain Chrome. Without that, Google's sign-in flow refuses to
authenticate, reporting the browser as insecure.
