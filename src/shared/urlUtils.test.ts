import { describe, expect, it } from 'vitest'
import { hostLabel, isSafeNavigation, mayNavigateTo, normalizeInput, prettyURL } from './urlUtils'

describe('normalizeInput', () => {
  const cases: Array<[input: string, expected: string]> = [
    // Bare hostnames become https.
    ['example.com', 'https://example.com'],
    ['www.example.com', 'https://www.example.com'],
    ['x.dev/a?b=c', 'https://x.dev/a?b=c'],
    ['sub.domain.co.uk/path#frag', 'https://sub.domain.co.uk/path#frag'],

    // Existing schemes are respected verbatim.
    ['https://x.dev/a?b=c', 'https://x.dev/a?b=c'],
    ['http://insecure.test', 'http://insecure.test'],
    ['about:blank', 'about:blank'],
    ['file:///Users/me/page.html', 'file:///Users/me/page.html'],

    // Local addresses default to http, since they rarely have certificates.
    ['localhost', 'http://localhost'],
    ['localhost:3000', 'http://localhost:3000'],
    ['localhost:3000/api/health', 'http://localhost:3000/api/health'],
    ['127.0.0.1', 'http://127.0.0.1'],
    ['192.168.1.10:8080', 'http://192.168.1.10:8080'],

    // Protocol-relative input.
    ['//cdn.example.com/a.js', 'https://cdn.example.com/a.js']
  ]

  it.each(cases)('resolves %j to %j', (input, expected) => {
    expect(normalizeInput(input)).toBe(expected)
  })

  const searches = [
    'how tall is everest',
    'hello',
    '3.14', // numeric TLD is not a hostname
    'version 1.2', // whitespace wins over the dot
    '.com',
    'foo:bar' // unknown scheme
  ]

  it.each(searches)('treats %j as a search', (input) => {
    expect(normalizeInput(input)).toBe(
      `https://www.google.com/search?q=${encodeURIComponent(input.trim())}`
    )
  })

  it('trims surrounding whitespace before deciding', () => {
    expect(normalizeInput('  example.com  ')).toBe('https://example.com')
  })

  it('returns about:blank for empty input', () => {
    expect(normalizeInput('   ')).toBe('about:blank')
  })

  it('honours a custom search template', () => {
    expect(normalizeInput('cats', 'https://search.test/?q=')).toBe('https://search.test/?q=cats')
  })

  it('percent-encodes characters that would break the query', () => {
    expect(normalizeInput('a&b=c d')).toBe('https://www.google.com/search?q=a%26b%3Dc%20d')
  })
})

describe('isSafeNavigation', () => {
  it.each(['https://example.com', 'http://example.com', 'about:blank'])('allows %j', (url) => {
    expect(isSafeNavigation(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'not a url'
  ])('blocks %j', (url) => {
    expect(isSafeNavigation(url)).toBe(false)
  })
})

describe('prettyURL', () => {
  it('strips the scheme and a leading www', () => {
    expect(prettyURL('https://www.example.com/')).toBe('example.com')
  })

  it('keeps the path, query and fragment', () => {
    expect(prettyURL('https://x.dev/a/b?c=1#d')).toBe('x.dev/a/b?c=1#d')
  })

  it('leaves non-http schemes alone', () => {
    expect(prettyURL('file:///tmp/a.html')).toBe('file:///tmp/a.html')
  })

  it('renders about:blank as an empty bar', () => {
    expect(prettyURL('about:blank')).toBe('')
  })
})

describe('hostLabel', () => {
  it('returns the bare host', () => {
    expect(hostLabel('https://www.example.com/a/b')).toBe('example.com')
  })

  it('falls back for unparseable input', () => {
    expect(hostLabel('nonsense')).toBe('New Tab')
  })
})

describe('mayNavigateTo', () => {
  const EXPLOIT = 'lumina://home/background/choose'

  it('refuses a web page reaching the privileged scheme', () => {
    expect(mayNavigateTo(EXPLOIT, 'https://example.com')).toBe(false)
    expect(mayNavigateTo('lumina://home/appearance/dark', 'https://example.com')).toBe(false)
    expect(mayNavigateTo('lumina://home', 'http://localhost:3000')).toBe(false)
  })

  it('lets the start page drive its own settings links', () => {
    expect(mayNavigateTo('lumina://home/background', 'lumina://home')).toBe(true)
    expect(mayNavigateTo(EXPLOIT, 'lumina://home/background')).toBe(true)
  })

  it('refuses the privileged scheme from an unparseable or blank initiator', () => {
    expect(mayNavigateTo('lumina://home', 'about:blank')).toBe(false)
    expect(mayNavigateTo('lumina://home', '')).toBe(false)
    expect(mayNavigateTo('lumina://home', 'not a url')).toBe(false)
  })

  it('leaves every other scheme exactly as isSafeNavigation decides', () => {
    for (const from of ['https://example.com', 'lumina://home', 'about:blank', '']) {
      for (const target of [
        'https://x.dev',
        'http://x.dev',
        'about:blank',
        'javascript:alert(1)',
        'file:///etc/passwd',
        'data:text/html,hi',
        'not a url'
      ]) {
        expect(mayNavigateTo(target, from), `${target} from ${from}`).toBe(
          isSafeNavigation(target)
        )
      }
    }
  })
})
