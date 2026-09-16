import { describe, it, expect } from 'vitest'
import { formatFieldValue } from '../../../src/ui/ActionCard/ActionCard.js'

const COACHEE_OPTIONS = [
  { value: 'usr_123', label: 'Sarah Chen (sarah@example.com)' },
  { value: 'usr_456', label: 'Miguel Torres (miguel@example.com)' },
]

describe('formatFieldValue', () => {
  it('renders the option label for a choice value', () => {
    expect(formatFieldValue('usr_123', COACHEE_OPTIONS)).toBe(
      'Sarah Chen (sarah@example.com)',
    )
  })

  it('falls back to the raw value when it has no matching option', () => {
    expect(formatFieldValue('usr_999', COACHEE_OPTIONS)).toBe('usr_999')
  })

  it('renders plain values unchanged when no options exist', () => {
    expect(formatFieldValue('hello world')).toBe('hello world')
    expect(formatFieldValue(42)).toBe('42')
  })

  it('renders undefined and null as empty string', () => {
    expect(formatFieldValue(undefined, COACHEE_OPTIONS)).toBe('')
    expect(formatFieldValue(null, COACHEE_OPTIONS)).toBe('')
  })

  it('maps each element of an array through the option lookup', () => {
    expect(
      formatFieldValue(['usr_123', 'usr_999', 'usr_456'], COACHEE_OPTIONS),
    ).toBe('Sarah Chen (sarah@example.com), usr_999, Miguel Torres (miguel@example.com)')
  })

  it('joins an empty array to an empty string', () => {
    expect(formatFieldValue([], COACHEE_OPTIONS)).toBe('')
  })
})
