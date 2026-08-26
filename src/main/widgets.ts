import { randomUUID } from 'node:crypto'

/**
 * The start page's optional overlays: a clock, local weather and a to-do list.
 *
 * The page is still served with no preload and no IPC bridge, so the widgets
 * keep their own state in localStorage — the nexus:// origin is a real secure
 * origin, so it persists — and toggling one never reloads the page. Weather is
 * the exception: it needs the network, so the page fetches it from the main
 * process over same-origin nexus://home/weather routes.
 */

/**
 * Minted once per run and embedded in the page the main process generates.
 *
 * Chromium sends no Sec-Fetch-* headers for a custom scheme, so this is what
 * marks a weather request as coming from our own start page: another origin
 * cannot read the page to learn the token, and a no-cors request cannot set a
 * non-safelisted header to send one.
 */
const TOKEN = randomUUID()

export function widgetToken(): string {
  return TOKEN
}

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

/** The overlays themselves. Each starts hidden and is shown by the script. */
export function widgetOverlays(): string {
  return `<div class="widget clock" id="w-clock" hidden>
    <button class="clock-time" id="clock-time" type="button"
            title="Switch between 24-hour and 12-hour">--:--</button>
    <div class="clock-date" id="clock-date"></div>
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

  /* The clock is deliberately unboxed — just the time over the background. */
  .clock {
    top: 20px;
    left: 26px;
    text-shadow: var(--shadow-text);
  }

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
    cursor: pointer;
  }

  .clock-time:hover { opacity: 0.85; }

  .clock-date {
    margin-top: 2px;
    color: var(--fg-dim);
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
    var KEYS = { widgets: 'nexus.widgets', clock12: 'nexus.clock12', todos: 'nexus.todos',
                 fahrenheit: 'nexus.fahrenheit' }
    var AUTH = { 'x-nexus-widget': '${TOKEN}' }

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

    var clockTime = el('clock-time')
    var clockDate = el('clock-date')

    function tick() {
      var now = new Date()
      var hours = now.getHours()
      var suffix = ''

      if (read(KEYS.clock12, false)) {
        suffix = hours < 12 ? ' am' : ' pm'
        hours = hours % 12 || 12
      }

      clockTime.textContent = (suffix ? hours : String(hours).padStart(2, '0')) + ':' +
        String(now.getMinutes()).padStart(2, '0') + suffix
      clockDate.textContent = now.toLocaleDateString(undefined,
        { weekday: 'long', day: 'numeric', month: 'long' })
    }

    clockTime.addEventListener('click', function () {
      write(KEYS.clock12, !read(KEYS.clock12, false))
      tick()
    })

    tick()
    setInterval(tick, 10000)

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
      fetch('nexus://home/weather', { headers: AUTH })
        .then(function (r) { return r.json() })
        .then(renderWeather)
        .catch(function () { renderWeather({ place: null, error: 'Weather is unavailable' }) })
    }

    weatherFind.addEventListener('submit', function (e) {
      e.preventDefault()
      var query = el('weather-query').value
      if (!query.trim()) return

      weatherBody.replaceChildren(note('Looking up\\u2026'))
      fetch('nexus://home/weather/place', { method: 'POST', headers: AUTH, body: query })
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
