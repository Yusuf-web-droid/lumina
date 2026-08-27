/**
 * Lumina Assistant popup.
 *
 * Three views share one popup: a Claude-backed chat, a quick-links launcher,
 * and settings. State lives in chrome.storage.local, because a popup is torn
 * down completely every time it closes.
 *
 * Everything is built with createElement/textContent rather than innerHTML —
 * link names and model output are untrusted and must never be parsed as HTML.
 */

const STORAGE_KEYS = {
  messages: 'chatMessages',
  links: 'quickLinks',
  activeTab: 'activeTab',
  apiKey: 'anthropicApiKey'
}

// ------------------------------------------------------------ Claude config

const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const MAX_TOKENS = 16000

/** Turns sent to the model. Older turns are dropped to bound cost and latency. */
const HISTORY_TURNS = 20

const SYSTEM_PROMPT =
  'You are Lumina, a helpful assistant living in a small browser-extension popup. ' +
  'Answer directly and keep responses short — usually a few sentences. ' +
  'Use plain text; the popup does not render Markdown.'

const MAX_MESSAGES = 100

const DEFAULT_LINKS = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: 'YouTube', url: 'https://www.youtube.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { name: 'Maps', url: 'https://maps.google.com' }
]

/** Fixed palette for letter avatars, picked by hashing the URL. */
const TILE_COLORS = [
  '#5b8cff',
  '#7b5bff',
  '#e0568a',
  '#f08b3c',
  '#2fb890',
  '#38a4c9',
  '#c2557d',
  '#8a6fe8'
]

const $ = (id) => document.getElementById(id)

const els = {
  tabChat: $('tab-chat'),
  tabLinks: $('tab-links'),
  panelChat: $('panel-chat'),
  panelLinks: $('panel-links'),
  panelSettings: $('panel-settings'),
  openSettings: $('open-settings'),
  closeSettings: $('close-settings'),
  messages: $('messages'),
  chatEmpty: $('chat-empty'),
  composer: $('composer'),
  chatInput: $('chat-input'),
  send: $('send'),
  clearChat: $('clear-chat'),
  links: $('links'),
  linksEmpty: $('links-empty'),
  addLink: $('add-link'),
  linkName: $('link-name'),
  linkUrl: $('link-url'),
  linkError: $('link-error'),
  apiKey: $('api-key'),
  toggleKey: $('toggle-key'),
  saveKey: $('save-key'),
  clearKey: $('clear-key'),
  keyStatus: $('key-status')
}

let messages = []
let links = []
let apiKey = ''
let lastTab = 'chat'

// ---------------------------------------------------------------- storage

async function loadState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.messages,
    STORAGE_KEYS.links,
    STORAGE_KEYS.activeTab,
    STORAGE_KEYS.apiKey
  ])

  messages = Array.isArray(stored[STORAGE_KEYS.messages]) ? stored[STORAGE_KEYS.messages] : []
  // An empty array is a deliberate "user removed everything", so only fall back
  // to the defaults when the key has never been written.
  links = Array.isArray(stored[STORAGE_KEYS.links]) ? stored[STORAGE_KEYS.links] : DEFAULT_LINKS
  apiKey = typeof stored[STORAGE_KEYS.apiKey] === 'string' ? stored[STORAGE_KEYS.apiKey] : ''

  return stored[STORAGE_KEYS.activeTab] === 'links' ? 'links' : 'chat'
}

const saveMessages = () =>
  chrome.storage.local.set({ [STORAGE_KEYS.messages]: messages.slice(-MAX_MESSAGES) })

const saveLinks = () => chrome.storage.local.set({ [STORAGE_KEYS.links]: links })

const saveActiveTab = (tab) => chrome.storage.local.set({ [STORAGE_KEYS.activeTab]: tab })

// ------------------------------------------------------------------- views

function showTab(name) {
  if (name !== 'settings') lastTab = name
  const chat = name === 'chat'
  const linksView = name === 'links'
  const settings = name === 'settings'

  els.panelChat.hidden = !chat
  els.panelLinks.hidden = !linksView
  els.panelSettings.hidden = !settings

  els.tabChat.classList.toggle('is-active', chat)
  els.tabLinks.classList.toggle('is-active', linksView)
  els.openSettings.classList.toggle('is-active', settings)
  els.tabChat.setAttribute('aria-selected', String(chat))
  els.tabLinks.setAttribute('aria-selected', String(linksView))

  if (!settings) saveActiveTab(name)
  if (chat) els.chatInput.focus()
  if (settings) refreshKeyStatus()
}

els.tabChat.addEventListener('click', () => showTab('chat'))
els.tabLinks.addEventListener('click', () => showTab('links'))
els.openSettings.addEventListener('click', () =>
  showTab(els.panelSettings.hidden ? 'settings' : lastTab)
)
els.closeSettings.addEventListener('click', () => showTab(lastTab))

// -------------------------------------------------------------------- chat

function bubble(role, text) {
  const el = document.createElement('div')
  el.className = `msg msg-${role}`
  el.textContent = text
  return el
}

function renderMessages() {
  els.messages.replaceChildren()

  if (messages.length === 0) {
    els.messages.append(els.chatEmpty)
    els.chatEmpty.hidden = false
    return
  }

  els.chatEmpty.hidden = true
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : msg.role === 'error' ? 'error' : 'bot'
    els.messages.append(bubble(role, msg.text))
  }
  scrollToBottom()
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight
}

function showTyping() {
  const el = document.createElement('div')
  el.className = 'msg msg-bot typing'
  for (let i = 0; i < 3; i++) el.append(document.createElement('span'))
  els.messages.append(el)
  scrollToBottom()
  return el
}

function addMessage(role, text) {
  messages.push({ role, text, at: Date.now() })
  if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES)
}

/** History for the API: only real turns, starting with a user message. */
function apiMessages() {
  const turns = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.text }))

  while (turns.length > 0 && turns[0].role !== 'user') turns.shift()
  return turns
}

/** Pull a useful sentence out of an API error body. */
function describeError(status, body) {
  let detail = ''
  try {
    detail = JSON.parse(body)?.error?.message ?? ''
  } catch {
    detail = body.slice(0, 300)
  }

  if (status === 401) return 'Invalid API key. Check it in Settings.'
  if (status === 403) return `Access denied by the API. ${detail}`.trim()
  if (status === 404) return `Model not available on this account. ${detail}`.trim()
  if (status === 429) return 'Rate limited or out of credit. Try again shortly.'
  if (status >= 500) return `Anthropic API error (${status}). Try again shortly.`
  return detail || `Request failed (${status}).`
}

/**
 * Stream a reply from Claude, calling onDelta with each chunk of text.
 *
 * Called straight from the popup rather than a background worker, so the key
 * never leaves this device and no server is required. The trade-off is that
 * closing the popup cancels an in-flight reply.
 */
async function streamClaude(turns, onDelta, signal) {
  const response = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for the API to accept a request originating from a browser.
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      stream: true,
      // Claude decides how much to think per request rather than a fixed budget.
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: turns
    })
  })

  if (!response.ok) {
    throw new Error(describeError(response.status, await response.text()))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let stopReason = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // The final element may be a partial line; keep it for the next chunk.
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue

      let event
      try {
        event = JSON.parse(payload)
      } catch {
        continue // ignore a malformed frame rather than killing the stream
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        onDelta(event.delta.text)
      } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason
      } else if (event.type === 'error') {
        throw new Error(event.error?.message ?? 'The API reported an error mid-stream.')
      }
    }
  }

  return stopReason
}

let sending = false

async function handleSend(event) {
  event.preventDefault()
  const text = els.chatInput.value.trim()
  if (!text || sending) return

  if (!apiKey) {
    showTab('settings')
    setKeyStatus('Add your API key to start chatting.', 'warn')
    return
  }

  sending = true
  els.send.disabled = true

  addMessage('user', text)
  els.chatInput.value = ''
  autoGrow()
  renderMessages()
  void saveMessages()

  const turns = apiMessages()
  const typing = showTyping()
  let reply = ''
  let liveBubble = null

  try {
    const stopReason = await streamClaude(turns, (chunk) => {
      if (!liveBubble) {
        typing.remove()
        liveBubble = bubble('bot', '')
        liveBubble.classList.add('streaming')
        els.messages.append(liveBubble)
      }
      reply += chunk
      liveBubble.textContent = reply
      scrollToBottom()
    })

    if (stopReason === 'refusal') {
      reply = reply || 'Claude declined to answer that.'
    } else if (!reply.trim()) {
      reply = '(empty response)'
    }
    addMessage('assistant', reply)
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    addMessage(
      'error',
      aborted ? 'Request cancelled.' : (err?.message ?? 'Could not reach the Anthropic API.')
    )
  } finally {
    typing.remove()
    liveBubble?.remove()
    renderMessages()
    void saveMessages()
    sending = false
    els.send.disabled = false
    els.chatInput.focus()
  }
}

els.composer.addEventListener('submit', handleSend)

// Enter sends, Shift+Enter inserts a newline.
els.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    els.composer.requestSubmit()
  }
})

function autoGrow() {
  els.chatInput.style.height = 'auto'
  els.chatInput.style.height = `${Math.min(els.chatInput.scrollHeight, 110)}px`
}

els.chatInput.addEventListener('input', autoGrow)

els.clearChat.addEventListener('click', async () => {
  messages = []
  renderMessages()
  await saveMessages()
  els.chatInput.focus()
})

// ---------------------------------------------------------------- settings

function setKeyStatus(text, kind) {
  els.keyStatus.textContent = text
  els.keyStatus.className = `settings-status${kind ? ` ${kind}` : ''}`
}

function refreshKeyStatus() {
  els.apiKey.value = apiKey
  if (apiKey) setKeyStatus('Key saved on this device.', 'ok')
  else setKeyStatus('No key set — chat is disabled.', 'warn')
}

els.toggleKey.addEventListener('click', () => {
  els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password'
})

els.saveKey.addEventListener('click', async () => {
  const value = els.apiKey.value.trim()
  if (!value) {
    setKeyStatus('Enter a key first.', 'warn')
    return
  }
  // Save whatever was entered rather than refusing it. A shape check is a
  // guess about someone else's credential, and blocking on it strands the user
  // with no way forward; a warning tells them the same thing without the wall.
  apiKey = value
  await chrome.storage.local.set({ [STORAGE_KEYS.apiKey]: apiKey })

  if (value.startsWith('sk-ant-')) {
    setKeyStatus('Key saved. You can start chatting.', 'ok')
  } else {
    setKeyStatus('Saved, but Anthropic keys usually start with "sk-ant-". Try it and see.', 'warn')
  }
})

els.clearKey.addEventListener('click', async () => {
  apiKey = ''
  els.apiKey.value = ''
  await chrome.storage.local.remove(STORAGE_KEYS.apiKey)
  setKeyStatus('Key removed.', 'warn')
})

// ------------------------------------------------------------------ links

/** Deterministic colour so a given site always gets the same tile. */
function colorFor(url) {
  let hash = 0
  for (let i = 0; i < url.length; i++) hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  return TILE_COLORS[hash % TILE_COLORS.length]
}

function initialFor(name, url) {
  const source = name.trim() || hostOf(url)
  return (source[0] ?? '?').toUpperCase()
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Accept "example.com" as readily as a full URL; reject anything unopenable. */
function normalizeUrl(input) {
  const raw = input.trim()
  if (!raw) return null

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(candidate)
    // Guard against javascript:/data: sneaking in via a crafted string.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function openLink(url) {
  // tabs.create needs no "tabs" permission — that permission only governs
  // reading tab metadata such as url and title.
  chrome.tabs.create({ url })
  window.close()
}

function renderLinks() {
  els.links.replaceChildren()
  els.linksEmpty.hidden = links.length > 0

  links.forEach((link, index) => {
    const tile = document.createElement('button')
    tile.className = 'link-tile'
    tile.type = 'button'
    tile.title = link.url

    const icon = document.createElement('span')
    icon.className = 'link-icon'
    icon.style.background = colorFor(link.url)
    icon.textContent = initialFor(link.name, link.url)
    icon.setAttribute('aria-hidden', 'true')

    const name = document.createElement('span')
    name.className = 'link-name'
    name.textContent = link.name || hostOf(link.url)

    const remove = document.createElement('span')
    remove.className = 'link-remove'
    remove.setAttribute('role', 'button')
    remove.setAttribute('aria-label', `Remove ${link.name || hostOf(link.url)}`)
    remove.innerHTML = '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15"/></svg>'
    remove.addEventListener('click', async (e) => {
      // Stop the click reaching the tile, which would open the link.
      e.stopPropagation()
      links.splice(index, 1)
      renderLinks()
      await saveLinks()
    })

    tile.append(icon, name, remove)
    tile.addEventListener('click', () => openLink(link.url))
    els.links.append(tile)
  })
}

els.addLink.addEventListener('submit', async (e) => {
  e.preventDefault()
  const url = normalizeUrl(els.linkUrl.value)

  if (!url) {
    els.linkError.textContent = 'Enter a valid web address, for example example.com'
    els.linkError.hidden = false
    els.linkUrl.focus()
    return
  }

  els.linkError.hidden = true
  links.push({ name: els.linkName.value.trim() || hostOf(url), url })
  els.linkName.value = ''
  els.linkUrl.value = ''
  renderLinks()
  await saveLinks()
})

// ------------------------------------------------------------------- init

async function init() {
  const activeTab = await loadState()
  renderMessages()
  renderLinks()
  refreshKeyStatus()

  // Without a key the chat cannot work at all, so settings is the only useful
  // view — regardless of how much history happens to be sitting in storage.
  showTab(apiKey ? activeTab : 'settings')
  autoGrow()
}

void init()
