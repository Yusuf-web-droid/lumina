import { CLOCK_FACES, clampSpot, clockDigits, handAngles } from '@shared/clock'
import { TOKEN_HEADER, pageToken } from './pageToken'

/**
 * The start page's optional overlays: a clock, local weather and a to-do list.
 *
 * The page is still served with no preload and no IPC bridge, so the widgets
 * keep their own state in localStorage — the lumina:// origin is a real secure
 * origin, so it persists — and toggling one never reloads the page. Weather is
 * the exception: it needs the network, so the page fetches it from the main
 * process over same-origin lumina://home/weather routes.
 *
 * The clock carries a face and a resting place, both of which the page owns the
 * same way. Its arithmetic lives in @shared/clock and is injected here as
 * source text, so it can be unit-tested despite running in a page that cannot
 * import anything.
 */

const TOKEN = pageToken()

/**
 * @shared/clock's arithmetic, as source text for the page's inline script.
 *
 * The start page cannot import a module, so the functions are shipped by
 * stringifying them. They are written to be self-contained for exactly this
 * reason — see the note at the top of @shared/clock.
 */
const CLOCK_HELPERS = [handAngles, clockDigits, clampSpot].map(String).join('\n\n    ')

/** Toggle buttons for the dock in the corner. */
export function widgetDock(): string {
  const button = (key: string, label: string, icon: string): string =>
    `<button class="dock-btn" type="button" data-widget="${key}" title="${label}"
             aria-label="${label}" aria-pressed="false">${icon}</button>`

  return `${button(
    'clock',
    'Clock',
    '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2"/><path d="M10 5.6V10l3 1.8"/></svg>'
  )}
      ${button(
        'weather',
        'Weather',
        '<svg viewBox="0 0 20 20"><path d="M6.2 15.5h7.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8-.6 3.1 3.1 0 0 0 .9 7.2z"/></svg>'
      )}
      ${button(
        'todo',
        'To-do list',
        '<svg viewBox="0 0 20 20"><path d="M3.4 6.2l1.7 1.7 3-3.2M3.4 13.4l1.7 1.7 3-3.2M11 6h5.6M11 14h5.6"/></svg>'
      )}`
}

/**
 * The Great Clock's dial, drawn once at author time.
 *
 * Roman numerals on a real dial are set radially and upright, so each one is
 * placed on its own angle rather than laid out by the browser. Big Ben uses IV
 * rather than the clockmaker's IIII, which is the detail that gives the face
 * away if it is wrong.
 */
function bigBenDial(): string {
  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']

  const marks = numerals
    .map((numeral, hour) => {
      const angle = ((hour * 30 - 90) * Math.PI) / 180
      const x = (100 + Math.cos(angle) * 72).toFixed(1)
      const y = (100 + Math.sin(angle) * 72).toFixed(1)
      return `<text x="${x}" y="${y}">${numeral}</text>`
    })
    .join('')

  // A minute ring, with the quarters drawn longer — the dial reads as a clock
  // at a glance even at the size this sits on the page.
  const ticks = Array.from({ length: 60 }, (_, minute) => {
    const angle = ((minute * 6 - 90) * Math.PI) / 180
    const outer = 86
    const inner = minute % 5 === 0 ? 79 : 83
    const at = (radius: number, axis: 'cos' | 'sin'): string =>
      (100 + Math[axis](angle) * radius).toFixed(1)
    return `<line x1="${at(inner, 'cos')}" y1="${at(inner, 'sin')}" x2="${at(outer, 'cos')}" y2="${at(outer, 'sin')}"
                  class="${minute % 5 === 0 ? 'bb-quarter' : ''}"/>`
  }).join('')

  return `<svg class="bb-face" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="bb-rim" cx="100" cy="100" r="95"/>
      <circle class="bb-gild" cx="100" cy="100" r="89"/>
      <circle class="bb-dial" cx="100" cy="100" r="85"/>
      <g class="bb-ticks">${ticks}</g>
      <g class="bb-numerals">${marks}</g>
      <g class="bb-hand" id="bb-hour">
        <path d="M100 108 L95.5 55 L100 30 L104.5 55 Z"/>
      </g>
      <g class="bb-hand" id="bb-minute">
        <path d="M100 112 L97 48 L100 20 L103 48 Z"/>
      </g>
      <circle class="bb-boss" cx="100" cy="100" r="5"/>
    </svg>`
}

/** The clock's face picker, opened from the cog that appears on hover. */
function clockMenu(): string {
  const faces = CLOCK_FACES.map(
    (face) => `<button class="clock-pick" type="button" data-face="${face.id}" aria-pressed="false">
        <span class="clock-pick-name">${face.label}</span>
        <span class="clock-pick-hint">${face.hint}</span>
      </button>`
  ).join('\n      ')

  return `<div class="clock-menu" id="clock-menu" hidden>
      <p class="clock-menu-head">Face</p>
      ${faces}
      <div class="clock-menu-rule"></div>
      <button class="clock-row" id="clock-24" type="button" aria-pressed="false">24-hour time</button>
      <button class="clock-row" id="clock-home" type="button">Reset position</button>
      <p class="clock-menu-note">Drag the clock to move it.</p>
    </div>`
}

/** The overlays themselves. Each starts hidden and is shown by the script. */
export function widgetOverlays(): string {
  return `<div class="widget clock" id="w-clock" data-face="minimal" hidden>
    <div class="clock-face" data-face="minimal">
      <button class="clock-time" id="clock-time" type="button"
              title="Switch between 24-hour and 12-hour">--:--</button>
      <div class="clock-date" id="clock-date"></div>
    </div>

    <div class="clock-face" data-face="bigben">
      ${bigBenDial()}
      <div class="bb-date" id="bb-date"></div>
    </div>

    <div class="clock-face" data-face="retro">
      <div class="retro-case">
        <div class="retro-screen">
          <span class="retro-ghost" aria-hidden="true">88:88</span>
          <span class="retro-read" id="retro-time">--:--</span>
          <span class="retro-side">
            <span class="retro-suffix" id="retro-suffix"></span>
            <span class="retro-secs" id="retro-secs">--</span>
          </span>
        </div>
      </div>
      <div class="retro-day" id="retro-day"></div>
    </div>

    <button class="clock-cog" id="clock-cog" type="button" title="Clock face"
            aria-label="Clock face" aria-expanded="false">
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6"/><path d="M10 3.2v1.6M10 15.2v1.6M16.8 10h-1.6M4.8 10H3.2M14.8 5.2l-1.1 1.1M6.3 13.7l-1.1 1.1M14.8 14.8l-1.1-1.1M6.3 6.3L5.2 5.2"/></svg>
    </button>
    ${clockMenu()}
  </div>

  <div class="widget weather" id="w-weather" hidden>
    <div class="weather-body" id="weather-body">
      <p class="widget-note">Loading…</p>
    </div>
    <form class="weather-find" id="weather-find" hidden>
      <input id="weather-query" placeholder="Town or city" autocomplete="off" spellcheck="false"
             aria-label="Town or city" maxlength="120">
      <button type="submit">Set</button>
    </form>
  </div>

  <div class="widget todo" id="w-todo" hidden>
    <div class="widget-head">
      <h2>To-do</h2>
      <button class="widget-link" id="todo-clear" type="button" hidden>Clear done</button>
    </div>
    <form class="todo-add" id="todo-add">
      <input id="todo-text" placeholder="Add a task" autocomplete="off" aria-label="Add a task"
             maxlength="200">
    </form>
    <ul class="todo-list" id="todo-list"></ul>
    <p class="widget-note" id="todo-empty">Nothing yet — type above.</p>
  </div>`
}

export function widgetStyles(): string {
  return `
  .widget {
    position: fixed;
    z-index: 2;
    color: var(--fg);
    font-size: 12.5px;
  }

  /* Beats the display rules below, which would otherwise outrank [hidden]. */
  .widget [hidden],
  .widget[hidden] { display: none !important; }

  .widget-note {
    margin: 0;
    color: var(--fg-faint);
    font-size: 12px;
  }

  .widget-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 9px;
  }

  .widget-head h2 {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--fg-dim);
  }

  .widget-link {
    border: 0;
    padding: 0;
    background: none;
    color: var(--fg-faint);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }

  .widget-link:hover { color: var(--fg); }

  /* The clock is deliberately unboxed — just the time over the background.
     top/left are the resting place; once dragged, the script writes inline
     left/top in pixels and those win. */
  .clock {
    top: 20px;
    left: 26px;
    cursor: grab;
    touch-action: none;
  }

  .clock.dragging {
    cursor: grabbing;
    user-select: none;
  }

  /* Only the chosen face is in the layout, so the widget measures as that
     face — which is what the drag clamp reads to keep it on screen. */
  .clock-face { display: none; }
  .clock[data-face='minimal'] .clock-face[data-face='minimal'],
  .clock[data-face='bigben'] .clock-face[data-face='bigben'],
  .clock[data-face='retro'] .clock-face[data-face='retro'] { display: block; }

  .clock-face[data-face='minimal'] { text-shadow: var(--shadow-text); }

  .clock-time {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 38px;
    font-weight: 200;
    letter-spacing: -1px;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
    cursor: inherit;
  }

  .clock-time:hover { opacity: 0.85; }

  .clock-date {
    margin-top: 2px;
    color: var(--fg-dim);
  }

  /* ---- Big Ben: the Great Clock's dial, cream and gilt ---- */

  .bb-face {
    display: block;
    width: 156px;
    height: 156px;
    filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.32));
  }

  .bb-rim { fill: #1d2733; }
  .bb-gild { fill: #c9a227; }
  .bb-dial { fill: #f4efe0; }

  .bb-ticks line {
    stroke: #2c3a4a;
    stroke-width: 1;
    opacity: 0.55;
  }

  .bb-ticks line.bb-quarter {
    stroke-width: 2.2;
    opacity: 0.9;
  }

  .bb-numerals text {
    fill: #1d2733;
    font-family: 'Times New Roman', Times, serif;
    font-size: 15px;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }

  .bb-hand path {
    fill: #16202b;
    stroke: #16202b;
    stroke-width: 1.2;
    stroke-linejoin: round;
  }

  #bb-minute path { fill: #0f1720; }

  .bb-boss {
    fill: #c9a227;
    stroke: #16202b;
    stroke-width: 1.2;
  }

  .bb-date {
    margin-top: 7px;
    color: var(--fg-dim);
    text-align: center;
    text-shadow: var(--shadow-text);
  }

  /* ---- Retro: amber segments under glass ---- */

  .retro-case {
    padding: 11px 13px 12px;
    border: 1px solid #3a2f26;
    border-radius: 13px;
    background: linear-gradient(#2a231d, #191410);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .retro-screen {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 7px 11px 6px;
    border-radius: 8px;
    background: #140f0b;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.75);
    font-family: 'Courier New', Courier, monospace;
    font-variant-numeric: tabular-nums;
  }

  /* The unlit segments of a real display, faintly visible behind the time. */
  .retro-ghost {
    position: absolute;
    left: 11px;
    bottom: 6px;
    color: #ff9d2e;
    font-size: 33px;
    font-weight: 700;
    letter-spacing: 1px;
    line-height: 1;
    opacity: 0.09;
  }

  .retro-read {
    position: relative;
    color: #ffb347;
    font-size: 33px;
    font-weight: 700;
    letter-spacing: 1px;
    line-height: 1;
    text-shadow: 0 0 10px rgba(255, 150, 40, 0.75), 0 0 26px rgba(255, 120, 20, 0.35);
  }

  .retro-side {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding-bottom: 3px;
    color: #ff9d2e;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-shadow: 0 0 8px rgba(255, 130, 30, 0.5);
  }

  .retro-suffix:empty { display: none; }

  .retro-day {
    margin-top: 7px;
    color: var(--fg-dim);
    text-align: center;
    letter-spacing: 1.4px;
    font-size: 11px;
    text-shadow: var(--shadow-text);
  }

  /* ---- The face picker ---- */

  .clock-cog {
    position: absolute;
    top: -4px;
    right: -30px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: var(--dock);
    color: var(--fg-dim);
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .clock:hover .clock-cog,
  .clock:focus-within .clock-cog,
  .clock-cog[aria-expanded='true'] { opacity: 1; }

  .clock-cog svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .clock-cog:hover { color: var(--fg); }

  /* Below the face, never over it — the point of the menu is choosing a face,
     which you cannot do while it covers the one you are looking at. */
  .clock-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 3;
    width: 208px;
    padding: 7px;
    border: 1px solid var(--card-border);
    border-radius: 14px;
    background: var(--card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    cursor: default;
  }

  /* Flipped by the script when the clock sits near an edge. */
  .clock-menu.above {
    top: auto;
    bottom: calc(100% + 8px);
  }

  .clock-menu.leftward {
    left: auto;
    right: 0;
  }

  .clock-menu-head {
    margin: 3px 0 5px 7px;
    color: var(--fg-dim);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .clock-pick,
  .clock-row {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .clock-pick:hover,
  .clock-row:hover { background: var(--panel-hover); }

  .clock-pick[aria-pressed='true'] {
    background: var(--toggle-on);
    color: var(--toggle-on-fg);
  }

  .clock-pick-name { display: block; }

  .clock-pick-hint {
    display: block;
    margin-top: 1px;
    color: var(--fg-faint);
    font-size: 11px;
  }

  .clock-pick[aria-pressed='true'] .clock-pick-hint { color: inherit; opacity: 0.72; }

  .clock-row[aria-pressed='true']::after {
    content: '✓';
    float: right;
  }

  .clock-menu-rule {
    height: 1px;
    margin: 6px 4px;
    background: var(--card-border);
  }

  .clock-menu-note {
    margin: 5px 8px 3px;
    color: var(--fg-faint);
    font-size: 11px;
  }

  .weather {
    top: 20px;
    right: 26px;
    min-width: 168px;
    padding: 12px 14px;
    border: 1px solid var(--card-border);
    border-radius: 16px;
    background: var(--card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .weather-now {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .weather-now svg {
    width: 30px;
    height: 30px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.92;
  }

  .weather-temp {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 25px;
    font-weight: 300;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .weather-temp:hover { opacity: 0.85; }

  .weather-where {
    margin-top: 7px;
    color: var(--fg-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .weather-where button { margin-left: 6px; }

  .weather-find {
    display: flex;
    gap: 6px;
    margin-top: 9px;
  }

  .weather-find input {
    flex: 1;
    min-width: 0;
    width: 100%;
  }

  .todo {
    left: 26px;
    bottom: 20px;
    display: flex;
    flex-direction: column;
    width: 236px;
    max-height: min(46vh, 340px);
    padding: 13px 14px;
    border: 1px solid var(--card-border);
    border-radius: 16px;
    background: var(--card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .widget input {
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--field-border);
    border-radius: 9px;
    background: var(--field);
    color: var(--fg);
    font: inherit;
    outline: 0;
  }

  .widget input:focus { border-color: var(--field-border-focus); }
  .widget input::placeholder { color: var(--fg-faint); }

  .widget form button {
    height: 30px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    background: var(--btn);
    color: var(--btn-fg);
    font: inherit;
    cursor: pointer;
  }

  .widget form button:hover { background: var(--btn-hover); }

  .todo-add input { width: 100%; }

  .todo-list {
    flex: 1;
    margin: 9px 0 0;
    padding: 0 2px 0 0;
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .todo-list:empty { display: none; }

  .todo-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
  }

  .todo-check {
    flex: none;
    width: 15px;
    height: 15px;
    margin-top: 1px;
    padding: 0;
    border: 1.4px solid var(--field-border-focus);
    border-radius: 5px;
    background: none;
    cursor: pointer;
  }

  .todo-check svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--toggle-on-fg);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0;
  }

  .todo-item.done .todo-check {
    border-color: var(--toggle-on);
    background: var(--toggle-on);
  }

  .todo-item.done .todo-check svg { opacity: 1; }

  .todo-text {
    flex: 1;
    min-width: 0;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .todo-item.done .todo-text {
    color: var(--fg-faint);
    text-decoration: line-through;
  }

  .todo-remove {
    flex: none;
    padding: 0 2px;
    border: 0;
    background: none;
    color: var(--fg-faint);
    font: inherit;
    line-height: 1.3;
    cursor: pointer;
    opacity: 0;
  }

  .todo-item:hover .todo-remove,
  .todo-remove:focus-visible { opacity: 1; }

  .todo-remove:hover { color: var(--fg); }

  /* Dock: the widget toggles, sharing a pill with the background link. */
  .dock {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
    border: 1px solid var(--dock-border);
    border-radius: 22px;
    background: var(--dock);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .dock-btn {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 16px;
    background: none;
    color: var(--fg-dim);
    cursor: pointer;
  }

  .dock-btn svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dock-btn:hover {
    background: var(--panel-hover);
    color: var(--fg);
  }

  .dock-btn[aria-pressed='true'] {
    background: var(--toggle-on);
    color: var(--toggle-on-fg);
  }

  .dock-sep {
    width: 1px;
    height: 20px;
    margin: 0 3px;
    background: var(--dock-border);
  }

  /* Corners get tight before the page itself does — drop the overlays first. */
  @media (max-width: 1080px), (max-height: 600px) {
    .widget { display: none; }
  }

  /* The to-do list is the tall one, so it is the one the centred column has to
     make room for. Symmetric padding keeps the page looking centred. */
  @media (min-width: 1081px) {
    body.with-todo { padding-left: 286px; padding-right: 286px; }
  }`
}

export function widgetScript(): string {
  return `
  (function () {
    var KEYS = { widgets: 'lumina.widgets', clock: 'lumina.clock', clock12: 'lumina.clock12',
                 todos: 'lumina.todos', fahrenheit: 'lumina.fahrenheit' }
    var AUTH = { '${TOKEN_HEADER}': '${TOKEN}' }

    // localStorage can throw outright in some privacy modes, so every read and
    // write is guarded and the widgets fall back to their defaults.
    function read(key, fallback) {
      try {
        var raw = localStorage.getItem(key)
        return raw === null ? fallback : JSON.parse(raw)
      } catch (e) { return fallback }
    }

    function write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { /* not fatal */ }
    }

    function el(id) { return document.getElementById(id) }

    // ------------------------------------------------------------- toggles

    var shown = Object.assign({ clock: true, weather: false, todo: false },
                              read(KEYS.widgets, null) || {})

    function applyToggles() {
      Object.keys(shown).forEach(function (key) {
        var panel = el('w-' + key)
        var button = document.querySelector('.dock-btn[data-widget="' + key + '"]')
        if (panel) panel.hidden = !shown[key]
        if (button) button.setAttribute('aria-pressed', shown[key] ? 'true' : 'false')
      })
      document.body.classList.toggle('with-todo', !!shown.todo)
      // The clock cannot be measured while hidden, so its resting place is
      // applied once it is on screen rather than when it was read from storage.
      if (shown.clock) place()
    }

    Array.prototype.forEach.call(document.querySelectorAll('.dock-btn'), function (button) {
      button.addEventListener('click', function () {
        var key = button.dataset.widget
        shown[key] = !shown[key]
        write(KEYS.widgets, shown)
        applyToggles()
        if (key === 'weather' && shown.weather) loadWeather()
        if (key === 'todo' && shown.todo) el('todo-text').focus()
      })
    })

    // --------------------------------------------------------------- clock

    // Injected from @shared/clock, where they are unit-tested.
    ${CLOCK_HELPERS}

    var FACES = ${JSON.stringify(CLOCK_FACES.map((face) => face.id))}

    var clock = el('w-clock')
    var clockTime = el('clock-time')
    var clockDate = el('clock-date')
    var bbHour = el('bb-hour')
    var bbMinute = el('bb-minute')
    var bbDate = el('bb-date')
    var retroTime = el('retro-time')
    var retroSuffix = el('retro-suffix')
    var retroSecs = el('retro-secs')
    var retroDay = el('retro-day')

    // KEYS.clock12 was the whole of the clock's state before it had faces or a
    // place to sit; it seeds use12 so nobody's 12-hour choice is lost.
    var saved = read(KEYS.clock, null) || {}
    var face = FACES.indexOf(saved.face) > -1 ? saved.face : 'minimal'
    var use12 = typeof saved.use12 === 'boolean' ? saved.use12 : read(KEYS.clock12, false)
    var spot = typeof saved.x === 'number' && typeof saved.y === 'number'
      ? { x: saved.x, y: saved.y }
      : null

    function saveClock() {
      write(KEYS.clock, {
        face: face,
        use12: use12,
        x: spot ? spot.x : null,
        y: spot ? spot.y : null
      })
    }

    function view() {
      return { width: window.innerWidth, height: window.innerHeight }
    }

    /**
     * Put the clock back where it was left, re-clamped to the window as it is
     * now. A hidden widget measures 0x0, so this is a no-op until it is shown —
     * every caller that reveals or resizes the clock calls it again.
     */
    function place() {
      if (!spot || clock.hidden) return

      var rect = clock.getBoundingClientRect()
      if (!rect.width) return

      var at = clampSpot(spot, { width: rect.width, height: rect.height }, view())
      spot = { x: at.x, y: at.y }
      clock.style.left = at.left + 'px'
      clock.style.top = at.top + 'px'
    }

    function applyFace() {
      clock.dataset.face = face
      Array.prototype.forEach.call(document.querySelectorAll('.clock-pick'), function (pick) {
        pick.setAttribute('aria-pressed', pick.dataset.face === face ? 'true' : 'false')
      })
      el('clock-24').setAttribute('aria-pressed', use12 ? 'false' : 'true')
      tick()
      // Faces are different sizes, so a swap can push the clock off the edge.
      place()
    }

    function tick() {
      var now = new Date()
      var digits = clockDigits(now.getHours(), now.getMinutes(), use12)
      var angles = handAngles(now.getHours(), now.getMinutes(), now.getSeconds())

      clockTime.textContent = digits.hours + ':' + digits.minutes +
        (digits.suffix ? ' ' + digits.suffix : '')
      clockDate.textContent = now.toLocaleDateString(undefined,
        { weekday: 'long', day: 'numeric', month: 'long' })

      bbHour.setAttribute('transform', 'rotate(' + angles.hour.toFixed(2) + ' 100 100)')
      bbMinute.setAttribute('transform', 'rotate(' + angles.minute.toFixed(2) + ' 100 100)')
      bbDate.textContent = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

      // The colon blinks on the half-second the way a segment display does.
      retroTime.textContent = digits.hours + (now.getSeconds() % 2 ? ' ' : ':') + digits.minutes
      retroSuffix.textContent = digits.suffix.toUpperCase()
      retroSecs.textContent = String(now.getSeconds()).padStart(2, '0')
      retroDay.textContent = now.toLocaleDateString(undefined,
        { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
    }

    clockTime.addEventListener('click', function () {
      use12 = !use12
      saveClock()
      applyFace()
    })

    // ---- the face picker

    var menu = el('clock-menu')
    var cog = el('clock-cog')

    function openMenu(open) {
      menu.hidden = !open
      cog.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (!open) return

      // Measure where it landed and flip it back on screen if the clock has
      // been dragged near an edge.
      menu.classList.remove('above', 'leftward')
      var box = menu.getBoundingClientRect()
      if (box.bottom > window.innerHeight - 8) menu.classList.add('above')
      if (box.right > window.innerWidth - 8) menu.classList.add('leftward')
    }

    cog.addEventListener('click', function () { openMenu(menu.hidden) })

    Array.prototype.forEach.call(document.querySelectorAll('.clock-pick'), function (pick) {
      pick.addEventListener('click', function () {
        face = pick.dataset.face
        saveClock()
        applyFace()
      })
    })

    el('clock-24').addEventListener('click', function () {
      use12 = !use12
      saveClock()
      applyFace()
    })

    el('clock-home').addEventListener('click', function () {
      spot = null
      clock.style.left = ''
      clock.style.top = ''
      saveClock()
      openMenu(false)
    })

    document.addEventListener('pointerdown', function (e) {
      if (!menu.hidden && !clock.contains(e.target)) openMenu(false)
    })

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) openMenu(false)
    })

    // ---- dragging

    var drag = null

    clock.addEventListener('pointerdown', function (e) {
      // The cog and the menu are controls, not somewhere to pick the clock up.
      if (e.button !== 0 || e.target.closest('.clock-cog, .clock-menu')) return

      var rect = clock.getBoundingClientRect()
      drag = {
        id: e.pointerId,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        fromX: e.clientX,
        fromY: e.clientY,
        moved: false
      }
      // Capture keeps the drag alive when the pointer outruns the widget. It
      // throws if the pointer is not actually down — a synthetic event, or a
      // button released outside the window — and the drag works without it.
      try { clock.setPointerCapture(e.pointerId) } catch (err) { /* not fatal */ }
    })

    clock.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return

      // A few pixels of slack, or clicking the time to change its format would
      // nudge the clock and swallow the click.
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.fromX) < 3 && Math.abs(e.clientY - drag.fromY) < 3) return
        drag.moved = true
        clock.classList.add('dragging')
        openMenu(false)
      }

      var rect = clock.getBoundingClientRect()
      var size = view()
      var at = clampSpot(
        { x: (e.clientX - drag.grabX) / size.width, y: (e.clientY - drag.grabY) / size.height },
        { width: rect.width, height: rect.height },
        size
      )

      spot = { x: at.x, y: at.y }
      clock.style.left = at.left + 'px'
      clock.style.top = at.top + 'px'
    })

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return

      var moved = drag.moved
      drag = null
      clock.classList.remove('dragging')
      try {
        if (clock.hasPointerCapture(e.pointerId)) clock.releasePointerCapture(e.pointerId)
      } catch (err) { /* not fatal */ }
      if (moved) {
        saveClock()
        // Swallow the click this drag would otherwise finish with.
        clock.addEventListener('click', function once(click) {
          click.stopPropagation()
          click.preventDefault()
          clock.removeEventListener('click', once, true)
        }, true)
      }
    }

    clock.addEventListener('pointerup', endDrag)
    clock.addEventListener('pointercancel', endDrag)

    window.addEventListener('resize', place)

    applyFace()
    setInterval(tick, 1000)

    // ------------------------------------------------------------- weather

    var ICONS = {
      clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2' +
             'M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
      partly: '<circle cx="9" cy="8.4" r="3.1"/><path d="M9 2.6v1.6M3.6 8.4h1.6M5.2 4.6l1.1 1.1' +
              'M12.8 4.6l-1.1 1.1"/><path d="M8.4 20h8.2a3.1 3.1 0 0 0 .3-6.2 4.3 4.3 0 0 0-8.2-.6' +
              ' 3.4 3.4 0 0 0-.3 6.8z"/>',
      cloud: '<path d="M7 19h9.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8-.6A3.3 3.3 0 0 0 7 19z"/>',
      fog: '<path d="M7.4 14.6h9.2a3.1 3.1 0 0 0 .3-6.2 4.4 4.4 0 0 0-8.4-.6 3.2 3.2 0 0 0-1.1 6.8z"/>' +
           '<path d="M5 18h14M7.5 21h9"/>',
      drizzle: '<path d="M7 15h9.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8-.6A3.3 3.3 0 0 0 7 15z"/>' +
               '<path d="M9.4 18.2l-.7 1.9M14.6 18.2l-.7 1.9"/>',
      rain: '<path d="M7 14.4h9.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8-.6 3.3 3.3 0 0 0-1.1 7.2z"/>' +
            '<path d="M8.8 17.4l-1 2.8M12.5 17.4l-1 2.8M16.2 17.4l-1 2.8"/>',
      snow: '<path d="M7 14.4h9.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8-.6 3.3 3.3 0 0 0-1.1 7.2z"/>' +
            '<path d="M9 18.6v.01M12 20.2v.01M15 18.6v.01"/>',
      storm: '<path d="M7 13.6h9.6a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.8-.6A3.3 3.3 0 0 0 7 13.6z"/>' +
             '<path d="M13.2 15.4l-2.9 3.4h2.6l-1.1 2.6"/>'
    }

    var weatherBody = el('weather-body')
    var weatherFind = el('weather-find')
    var latest = null

    function degrees(celsius) {
      return read(KEYS.fahrenheit, false)
        ? Math.round(celsius * 9 / 5 + 32) + '\\u00B0F'
        : Math.round(celsius) + '\\u00B0'
    }

    function renderWeather(payload) {
      latest = payload
      weatherBody.replaceChildren()
      weatherFind.hidden = !!(payload && payload.place)

      if (!payload || (!payload.place && !payload.error)) {
        weatherBody.append(note('Where are you?'))
        return
      }

      if (payload.reading) {
        var now = document.createElement('div')
        now.className = 'weather-now'
        // Icon markup is ours, never anything the service sent.
        now.innerHTML = '<svg viewBox="0 0 24 24">' +
          (ICONS[payload.reading.icon] || ICONS.cloud) + '</svg>'

        var temp = document.createElement('button')
        temp.type = 'button'
        temp.className = 'weather-temp'
        temp.title = 'Switch between Celsius and Fahrenheit'
        temp.textContent = degrees(payload.reading.celsius)
        temp.addEventListener('click', function () {
          write(KEYS.fahrenheit, !read(KEYS.fahrenheit, false))
          renderWeather(latest)
        })

        var label = document.createElement('div')
        label.textContent = payload.reading.label

        var stack = document.createElement('div')
        stack.append(temp, label)
        now.append(stack)
        weatherBody.append(now)
      }

      if (payload.place) {
        var where = document.createElement('div')
        where.className = 'weather-where'
        where.textContent = payload.place.name +
          (payload.place.region ? ', ' + payload.place.region : '')

        var change = document.createElement('button')
        change.type = 'button'
        change.className = 'widget-link'
        change.textContent = 'Change'
        change.addEventListener('click', function () {
          weatherFind.hidden = false
          el('weather-query').focus()
        })

        where.append(change)
        weatherBody.append(where)
      }

      if (payload.error) weatherBody.append(note(payload.error))
    }

    function note(text) {
      var p = document.createElement('p')
      p.className = 'widget-note'
      p.textContent = text
      return p
    }

    function loadWeather() {
      fetch('lumina://home/weather', { headers: AUTH })
        .then(function (r) { return r.json() })
        .then(renderWeather)
        .catch(function () { renderWeather({ place: null, error: 'Weather is unavailable' }) })
    }

    weatherFind.addEventListener('submit', function (e) {
      e.preventDefault()
      var query = el('weather-query').value
      if (!query.trim()) return

      weatherBody.replaceChildren(note('Looking up\\u2026'))
      fetch('lumina://home/weather/place', { method: 'POST', headers: AUTH, body: query })
        .then(function (r) { return r.json() })
        .then(function (payload) {
          if (payload.place) el('weather-query').value = ''
          renderWeather(payload)
        })
        .catch(function () { renderWeather({ place: null, error: 'Could not set that' }) })
    })

    if (shown.weather) loadWeather()

    // --------------------------------------------------------------- to-do

    var todos = read(KEYS.todos, [])
    if (!Array.isArray(todos)) todos = []

    var list = el('todo-list')
    var empty = el('todo-empty')
    var clear = el('todo-clear')

    function saveTodos() {
      write(KEYS.todos, todos)
      renderTodos()
    }

    function renderTodos() {
      list.replaceChildren()
      empty.hidden = todos.length > 0
      clear.hidden = !todos.some(function (t) { return t.done })

      todos.forEach(function (todo) {
        var item = document.createElement('li')
        item.className = 'todo-item' + (todo.done ? ' done' : '')

        var check = document.createElement('button')
        check.type = 'button'
        check.className = 'todo-check'
        check.setAttribute('aria-label', (todo.done ? 'Undo ' : 'Complete ') + todo.text)
        check.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3.6 8.4l2.8 2.8 5.9-6"/></svg>'
        check.addEventListener('click', function () {
          todo.done = !todo.done
          saveTodos()
        })

        var text = document.createElement('span')
        text.className = 'todo-text'
        text.textContent = todo.text

        var remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'todo-remove'
        remove.setAttribute('aria-label', 'Remove ' + todo.text)
        remove.textContent = '\\u00D7'
        remove.addEventListener('click', function () {
          todos = todos.filter(function (t) { return t !== todo })
          saveTodos()
        })

        item.append(check, text, remove)
        list.append(item)
      })
    }

    el('todo-add').addEventListener('submit', function (e) {
      e.preventDefault()
      var input = el('todo-text')
      var text = input.value.trim()
      if (!text) return

      // Capped so a runaway paste cannot fill the origin's storage quota.
      todos.unshift({ text: text.slice(0, 200), done: false })
      todos = todos.slice(0, 100)
      input.value = ''
      saveTodos()
    })

    clear.addEventListener('click', function () {
      todos = todos.filter(function (t) { return !t.done })
      saveTodos()
    })

    renderTodos()
    applyToggles()
  })()`
}
