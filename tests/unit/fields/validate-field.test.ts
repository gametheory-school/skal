import { describe, it, expect } from 'vitest'
import { validateFieldValue, getInitialFieldValue, EMAIL_RE } from '../../../src/fields/validate-field.js'
import type { FieldSpec } from '../../../src/engine/types.js'

function spec(overrides: Partial<FieldSpec> = {}): FieldSpec {
  return { key: 'f', label: 'F', inputType: 'text', required: false, ...overrides }
}

describe('EMAIL_RE', () => {
  it('accepts plain and plus-addressed emails', () => {
    expect(EMAIL_RE.test('a@b.co')).toBe(true)
    expect(EMAIL_RE.test('a+b@c.io')).toBe(true)
  })

  it('rejects malformed addresses', () => {
    expect(EMAIL_RE.test('not-an-email')).toBe(false)
    expect(EMAIL_RE.test('a@b')).toBe(false)
    expect(EMAIL_RE.test('a b@c.com')).toBe(false)
  })
})

describe('validateFieldValue', () => {
  it('returns Required for empty value on a required field', () => {
    expect(validateFieldValue(spec({ required: true }), '   ')).toBe('Required')
  })

  it('returns null for empty value on an optional field', () => {
    expect(validateFieldValue(spec(), '')).toBeNull()
  })

  it('validates a single email', () => {
    expect(validateFieldValue(spec({ inputType: 'email' }), 'a@b.co')).toBeNull()
    expect(validateFieldValue(spec({ inputType: 'email' }), 'nope')).toBe('Not a valid email address')
  })

  it('validates comma-separated emails and reports invalid ones', () => {
    const s = spec({ inputType: 'email', key: 'attendees' })
    expect(validateFieldValue(s, 'a@b.co, c@d.io')).toBeNull()
    expect(validateFieldValue(s, 'a@b.co, bad')).toBe('Invalid: bad')
  })

  it('treats any comma-containing email value as a list', () => {
    expect(validateFieldValue(spec({ inputType: 'email' }), 'a@b.co, x@y.io')).toBeNull()
  })

  it('validates contact fields as email', () => {
    expect(validateFieldValue(spec({ inputType: 'contact' }), 'a@b.co')).toBeNull()
    expect(validateFieldValue(spec({ inputType: 'contact' }), 'nope')).toBe('Enter a valid email address')
  })

  it('validates choice values against options', () => {
    const s = spec({ inputType: 'choice', options: [{ value: 'a', label: 'A' }] })
    expect(validateFieldValue(s, 'a')).toBeNull()
    expect(validateFieldValue(s, 'zzz')).toBe('Select a valid option')
  })

  it('passes text fields through', () => {
    expect(validateFieldValue(spec({ inputType: 'text' }), 'anything')).toBeNull()
  })
})

describe('getInitialFieldValue', () => {
  it('returns empty string for null/undefined', () => {
    expect(getInitialFieldValue(spec(), null)).toBe('')
    expect(getInitialFieldValue(spec(), undefined)).toBe('')
  })

  it('joins attendee arrays into comma-separated string', () => {
    const s = spec({ inputType: 'email', key: 'attendees' })
    expect(getInitialFieldValue(s, ['a@b.co', 'c@d.io'])).toBe('a@b.co, c@d.io')
  })

  it('stringifies other values', () => {
    expect(getInitialFieldValue(spec(), 42)).toBe('42')
    expect(getInitialFieldValue(spec(), 'hello')).toBe('hello')
  })
})
