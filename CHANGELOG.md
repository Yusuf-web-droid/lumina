# Changelog

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
- Choice of background: one of your own photos, a built-in illustrated scene, or a
  plain gradient.

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
