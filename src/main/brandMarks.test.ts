import { describe, expect, it } from 'vitest'
import { BRAND_MARKS, brandFor } from './brandMarks'

describe('brandFor', () => {
  it('matches a plain site', () => {
    expect(brandFor('https://github.com')?.title).toBe('GitHub')
  })

  it('ignores www and the path', () => {
    expect(brandFor('https://www.youtube.com/watch?v=abc')?.title).toBe('YouTube')
  })

  it('prefers the most specific host', () => {
    expect(brandFor('https://mail.google.com')?.title).toBe('Gmail')
    expect(brandFor('https://maps.google.com')?.title).toBe('Google Maps')
    expect(brandFor('https://www.google.com')?.title).toBe('Google')
  })

  it('matches a subdomain against its parent', () => {
    expect(brandFor('https://en.wikipedia.org/wiki/Main_Page')?.title).toBe('Wikipedia')
  })

  it('does not match a lookalike suffix', () => {
    expect(brandFor('https://notgithub.com')).toBeNull()
    expect(brandFor('https://github.com.evil.example')).toBeNull()
  })

  it('returns null for unknown sites and unparseable input', () => {
    expect(brandFor('https://example.com')).toBeNull()
    expect(brandFor('not a url')).toBeNull()
  })

  it('carries a drawable path and a colour for every brand', () => {
    for (const [slug, mark] of Object.entries(BRAND_MARKS)) {
      expect(mark.path.length, slug).toBeGreaterThan(0)
      expect(mark.hex, slug).toMatch(/^#[0-9A-F]{6}$/)
    }
  })
})
