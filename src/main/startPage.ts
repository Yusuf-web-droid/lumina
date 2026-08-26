import type { QuickLink, QuickLinkIcon } from '@shared/types'
import type { BackgroundKind } from './background'
import { BACKGROUND_PRESETS } from './backgroundPresets'
import type { ThemeSource } from './theme'
import { forestScene } from './scene'
import { widgetDock, widgetOverlays, widgetScript, widgetStyles } from './widgets'

/** Palette for the fallback letter tiles, chosen deterministically from the URL. */
const TILE_COLORS = [
  '#5b8cff',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#f43f5e',
  '#a78bfa'
]

function colorFor(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  return TILE_COLORS[hash % TILE_COLORS.length] ?? TILE_COLORS[0]!
}

/**
 * The tile's icon: the site's real logo where we have one, else the site's
 * initial on a coloured chip.
 */
function tileIcon(link: QuickLink, icon: QuickLinkIcon | null): string {
  if (icon?.kind === 'image') {
    return `<span class="tile-icon logo">
          <img src="${esc(icon.src)}" alt="" loading="lazy" decoding="async">
        </span>`
  }

  if (icon?.kind === 'glyph') {
    return `<span class="tile-icon logo">
          <svg viewBox="0 0 24 24" fill="${esc(icon.color)}" aria-hidden="true">
            <path d="${esc(icon.path)}"/>
          </svg>
        </span>`
  }

  const initial = (link.name.trim()[0] ?? '?').toUpperCase()
  return `<span class="tile-icon" style="--c:${colorFor(link.url)}" aria-hidden="true">${esc(initial)}</span>`
}

/**
 * Escape for HTML text and quoted attributes.
 * Link names and URLs are user-supplied and are interpolated into this page,
 * so they must never be able to close a tag or an attribute.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only render links that are plain web URLs. */
function isRenderable(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The start page, generated in the main process and served over the nexus://
 * scheme. Built as a plain document with ordinary <a> and <form> elements, so
 * it needs no preload and no IPC bridge — tabs stay fully sandboxed.
 */
export interface BackgroundOptions {
  kind: BackgroundKind
  hasImage: boolean
  /** Id of the bundled photo in use, or null when the photo is the user's own. */
  preset: string | null
  dim: number
}

export function renderStartPage(
  links: QuickLink[],
  searchTemplate: string,
  background: BackgroundOptions,
  /** A link's logo, or null to fall back to a letter tile. */
  iconFor: (url: string) => QuickLinkIcon | null = () => null
): string {
  const tiles = links
    .filter((l) => isRenderable(l.url))
    .map(
      (link) => `<a class="tile" href="${esc(link.url)}" title="${esc(link.url)}">
        ${tileIcon(link, iconFor(link.url))}
        <span class="tile-name">${esc(link.name)}</span>
      </a>`
    )
    .join('\n')

  // Split the template so the query lands in a real form field.
  const [action = 'https://www.google.com/search', queryPart = 'q='] = searchTemplate.split('?')
  const queryName = queryPart.replace(/=$/, '') || 'q'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>New Tab</title>
<style>
  /*
   * Two of the three backgrounds are imagery — a photo or the illustrated
   * scene — and text over imagery wants the light-on-dark treatment whatever
   * the system appearance is. So these defaults are the "over imagery" set,
   * and only the plain background opts into the themed set below.
   */
  :root {
    --page-bg: #0d1410;
    --plain-bg: linear-gradient(160deg, #101726 0%, #0a0f18 60%, #070a10 100%);
    --fg: #f2f4f8;
    --fg-dim: rgba(255, 255, 255, 0.6);
    --fg-faint: rgba(255, 255, 255, 0.45);
    --panel: rgba(255, 255, 255, 0.07);
    --panel-hover: rgba(255, 255, 255, 0.14);
    --panel-border: rgba(255, 255, 255, 0.1);
    --panel-border-hover: rgba(255, 255, 255, 0.28);
    --field: rgba(255, 255, 255, 0.09);
    --field-focus: rgba(255, 255, 255, 0.13);
    --field-border: rgba(255, 255, 255, 0.16);
    --field-border-focus: rgba(255, 255, 255, 0.38);
    --btn: rgba(255, 255, 255, 0.16);
    --btn-hover: rgba(255, 255, 255, 0.26);
    --btn-fg: #fff;
    --chip: rgba(255, 255, 255, 0.95);
    --chip-border: transparent;
    --card: rgba(8, 12, 18, 0.34);
    --card-border: rgba(255, 255, 255, 0.13);
    --dock: rgba(0, 0, 0, 0.32);
    --dock-border: rgba(255, 255, 255, 0.18);
    --toggle-on: rgba(255, 255, 255, 0.9);
    --toggle-on-fg: #101722;
    --shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    --shadow-sm: 0 6px 18px rgba(0, 0, 0, 0.3);
    --shadow-text: 0 2px 24px rgba(0, 0, 0, 0.35);
  }

  @media (prefers-color-scheme: light) {
    body.themed {
      --page-bg: #eceef2;
      --plain-bg: linear-gradient(160deg, #f4f6fa 0%, #e7eaf1 60%, #dfe3ec 100%);
      --fg: #10151c;
      --fg-dim: rgba(16, 21, 28, 0.62);
      --fg-faint: rgba(16, 21, 28, 0.45);
      --panel: rgba(255, 255, 255, 0.72);
      --panel-hover: rgba(255, 255, 255, 0.96);
      --panel-border: rgba(15, 23, 36, 0.1);
      --panel-border-hover: rgba(15, 23, 36, 0.22);
      --field: rgba(255, 255, 255, 0.82);
      --field-focus: #fff;
      --field-border: rgba(15, 23, 36, 0.14);
      --field-border-focus: rgba(15, 23, 36, 0.34);
      --btn: rgba(15, 23, 36, 0.1);
      --btn-hover: rgba(15, 23, 36, 0.18);
      --btn-fg: #10151c;
      --chip: #fff;
      --chip-border: rgba(15, 23, 36, 0.1);
      --card: rgba(255, 255, 255, 0.8);
      --card-border: rgba(15, 23, 36, 0.1);
      --dock: rgba(255, 255, 255, 0.78);
      --dock-border: rgba(15, 23, 36, 0.12);
      --toggle-on: #10151c;
      --toggle-on-fg: #fff;
      --shadow: 0 12px 40px rgba(15, 23, 36, 0.14);
      --shadow-sm: 0 6px 18px rgba(15, 23, 36, 0.14);
      --shadow-text: none;
    }
  }

  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }

  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 34px;
    padding: 40px 24px;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--fg);
    background: var(--page-bg);
    overflow: auto;
  }

  /* The generated forest scene sits behind everything, cropped to fill. */
  .scene {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    display: block;
  }

  /* A chosen photo, with a scrim so the text on top stays readable. */
  .photo {
    position: fixed;
    inset: 0;
    z-index: -1;
    background-image: url('nexus://bg/current');
    background-size: cover;
    background-position: center;
  }

  .photo::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(4, 8, 14, calc(var(--dim) + 0.12)) 0%,
      rgba(4, 8, 14, var(--dim)) 45%,
      rgba(4, 8, 14, calc(var(--dim) + 0.18)) 100%
    );
  }

  .plain {
    position: fixed;
    inset: 0;
    z-index: -1;
    background: var(--plain-bg);
  }

  .customise {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 16px;
    color: var(--fg-dim);
    text-decoration: none;
  }

  .customise:hover {
    background: var(--panel-hover);
    color: var(--fg);
  }

  .customise svg { width: 17px; height: 17px; }

  h1 {
    margin: 0;
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.5px;
    text-align: center;
    text-shadow: var(--shadow-text);
  }

  .search {
    width: min(560px, 100%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px 0 18px;
    height: 52px;
    border: 1px solid var(--field-border);
    border-radius: 26px;
    background: var(--field);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: var(--shadow);
  }

  .search:focus-within {
    border-color: var(--field-border-focus);
    background: var(--field-focus);
  }

  .search svg { width: 18px; height: 18px; flex: none; opacity: 0.6; }

  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--fg);
    font: inherit;
  }

  .search input::placeholder { color: var(--fg-faint); }

  .search button {
    flex: none;
    height: 40px;
    padding: 0 20px;
    border: 0;
    border-radius: 20px;
    background: var(--btn);
    color: var(--btn-fg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .search button:hover { background: var(--btn-hover); }

  .grid {
    width: min(720px, 100%);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 12px;
  }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 18px 8px 14px;
    border: 1px solid var(--panel-border);
    border-radius: 16px;
    background: var(--panel);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: var(--fg);
    font-size: 12.5px;
    text-decoration: none;
    transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
  }

  .tile:hover {
    transform: translateY(-3px);
    background: var(--panel-hover);
    border-color: var(--panel-border-hover);
  }

  .tile-icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: var(--c);
    color: #fff;
    font-size: 20px;
    font-weight: 700;
    box-shadow: var(--shadow-sm);
  }

  /* Real logos sit on a pale chip, the way a favicon expects to be shown. */
  .tile-icon.logo {
    border: 1px solid var(--chip-border);
    background: var(--chip);
  }

  .tile-icon.logo img,
  .tile-icon.logo svg {
    width: 28px;
    height: 28px;
    object-fit: contain;
  }

  .tile-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--fg-faint);
  }

  .empty { color: var(--fg-dim); }
${widgetStyles()}
</style>
</head>
<body class="${background.kind === 'plain' ? 'themed' : ''}">
  ${
    background.kind === 'image' && background.hasImage
      ? `<div class="photo" style="--dim:${background.dim / 100}"></div>`
      : background.kind === 'plain'
        ? '<div class="plain"></div>'
        : forestScene()
  }

  <h1 id="greeting">Welcome</h1>

  <form class="search" action="${esc(action)}" method="GET">
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="9" cy="9" r="6" /><path d="M13.5 13.5L17 17" />
    </svg>
    <input name="${esc(queryName)}" placeholder="Search the web" autofocus autocomplete="off" spellcheck="false">
    <button type="submit">Search</button>
  </form>

  <div class="grid">
${tiles || '<p class="empty">No quick links yet — add some from the ⊞ button in the toolbar.</p>'}
  </div>

  <p class="hint">Press ⌘⇧A to edit these links · ⌘J for Gemini</p>

  ${widgetOverlays()}

  <div class="dock">
    ${widgetDock()}
    <span class="dock-sep"></span>
    <a class="customise" href="nexus://home/background" title="Appearance and background"
       aria-label="Appearance and background">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2.5a7.5 7.5 0 1 0 0 15c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h1.9a3.2 3.2 0 0 0 3.2-3.2C17.5 5.4 14.1 2.5 10 2.5z"/>
        <circle cx="6.6" cy="8.2" r="1"/><circle cx="10" cy="6.2" r="1"/><circle cx="13.4" cy="8.2" r="1"/>
      </svg>
    </a>
  </div>

  <script>
    // Only decoration: greet by time of day.
    const h = new Date().getHours()
    document.getElementById('greeting').textContent =
      h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  </script>
  <script>${widgetScript()}</script>
</body>
</html>`
}


/** Appearance and background, reached from the dock on the start page. */
export function renderBackgroundPage(background: BackgroundOptions, theme: ThemeSource): string {
  const option = (
    href: string,
    title: string,
    description: string,
    preview: string,
    active: boolean
  ): string =>
    `<a class="opt${active ? ' active' : ''}" href="${esc(href)}">
       <span class="opt-preview" style="${preview}"></span>
       <span class="opt-text"><strong>${esc(title)}</strong><span>${esc(description)}</span></span>
     </a>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Appearance</title>
<style>
  /* A settings page, not a page over imagery, so it follows the theme outright. */
  :root {
    --bg: linear-gradient(160deg, #121a2b 0%, #0a0e17 100%);
    --fg: #eef1f7;
    --fg-dim: rgba(255, 255, 255, 0.6);
    --fg-faint: rgba(255, 255, 255, 0.55);
    --opt: rgba(255, 255, 255, 0.05);
    --opt-hover: rgba(255, 255, 255, 0.11);
    --opt-border: rgba(255, 255, 255, 0.12);
    --opt-border-hover: rgba(255, 255, 255, 0.28);
    --accent: #6ea8ff;
    --accent-soft: rgba(110, 168, 255, 0.14);
  }

  @media (prefers-color-scheme: light) {
    :root {
      --bg: linear-gradient(160deg, #f5f7fb 0%, #e6eaf2 100%);
      --fg: #10151c;
      --fg-dim: rgba(16, 21, 28, 0.62);
      --fg-faint: rgba(16, 21, 28, 0.55);
      --opt: rgba(255, 255, 255, 0.8);
      --opt-hover: #fff;
      --opt-border: rgba(15, 23, 36, 0.12);
      --opt-border-hover: rgba(15, 23, 36, 0.28);
      --accent: #2f6fd0;
      --accent-soft: rgba(47, 111, 208, 0.12);
    }
  }

  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 22px; padding: 40px 24px;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: var(--fg);
    background: var(--bg);
  }
  h1 { margin: 0; font-size: 26px; font-weight: 600; }
  .opts { width: min(560px, 100%); display: flex; flex-direction: column; gap: 10px; }
  .opt {
    display: flex; align-items: center; gap: 14px; padding: 12px;
    border: 1px solid var(--opt-border); border-radius: 14px;
    background: var(--opt); color: inherit; text-decoration: none;
  }
  .opt:hover { background: var(--opt-hover); border-color: var(--opt-border-hover); }
  .opt.active { border-color: var(--accent); background: var(--accent-soft); }
  .opt-preview {
    width: 88px; height: 54px; flex: none; border-radius: 9px;
    background-size: cover; background-position: center;
    border: 1px solid var(--opt-border);
  }
  .opt-text { display: flex; flex-direction: column; }
  .opt-text strong { font-weight: 600; }
  .opt-text span { font-size: 12.5px; color: var(--fg-dim); }
  .dim { width: min(560px, 100%); }
  .dim-row { display: flex; gap: 8px; }
  .dim-row a {
    flex: 1; text-align: center; padding: 8px; border-radius: 9px;
    border: 1px solid var(--opt-border); background: var(--opt);
    color: inherit; text-decoration: none; font-size: 12.5px;
  }
  .dim-row a:hover { background: var(--opt-hover); }
  .dim-row a.active { border-color: var(--accent); background: var(--accent-soft); }
  .label { font-size: 12.5px; color: var(--fg-faint); margin: 0 0 8px; }
  .back { color: var(--fg-dim); text-decoration: none; font-size: 13px; }
  .back:hover { color: var(--fg); }
</style>
</head>
<body>
  <h1>Appearance</h1>

  <div class="opts">
    ${option(
      'nexus://home/appearance/system',
      'Match System',
      'Follow the macOS light or dark setting',
      'background:linear-gradient(120deg,#f4f6fa 0 50%,#12161d 50% 100%)',
      theme === 'system'
    )}
    ${option(
      'nexus://home/appearance/light',
      'Light',
      'Always light, whatever macOS is set to',
      'background:linear-gradient(160deg,#ffffff,#e4e8f0)',
      theme === 'light'
    )}
    ${option(
      'nexus://home/appearance/dark',
      'Dark',
      'Always dark, whatever macOS is set to',
      'background:linear-gradient(160deg,#262d38,#0d1117)',
      theme === 'dark'
    )}
  </div>

  <h1>Background</h1>

  <div class="opts">
    ${BACKGROUND_PRESETS.map((preset) =>
      option(
        `nexus://home/background/preset/${preset.id}`,
        preset.name,
        preset.description,
        `background-image:url('nexus://bg/preset/${preset.id}')`,
        background.kind === 'image' && background.preset === preset.id
      )
    ).join('\n    ')}
    ${option(
      'nexus://home/background/choose',
      'Choose a photo…',
      background.preset === null && background.hasImage
        ? 'Pick a different image from your Mac'
        : 'Pick an image from your Mac',
      background.preset === null && background.hasImage
        ? "background-image:url('nexus://bg/current')"
        : 'background:linear-gradient(135deg,#3b82f6,#8b5cf6)',
      background.kind === 'image' && background.preset === null
    )}
    ${option(
      'nexus://home/background/scene',
      'Forest path',
      'The built-in illustrated scene',
      'background:linear-gradient(180deg,#20415a,#5b8698 45%,#4f6544)',
      background.kind === 'scene'
    )}
    ${option(
      'nexus://home/background/plain',
      'Plain',
      'No image — a gradient that follows the appearance',
      'background:linear-gradient(120deg,#eef1f5 0 50%,#101726 50% 100%)',
      background.kind === 'plain'
    )}
  </div>

  ${
    background.kind === 'image' && background.hasImage
      ? `<div class="dim">
           <p class="label">Darkening — raise this if text is hard to read</p>
           <div class="dim-row">
             ${[0, 25, 45, 65]
               .map(
                 (d) =>
                   `<a class="${background.dim === d ? 'active' : ''}" href="nexus://home/background/dim/${d}">${d === 0 ? 'None' : `${d}%`}</a>`
               )
               .join('')}
           </div>
         </div>`
      : ''
  }

  <a class="back" href="nexus://home">← Back to start page</a>
</body>
</html>`
}
