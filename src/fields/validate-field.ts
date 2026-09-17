import type { FieldSpec } from '../engine/types.js'

/**
 * Shared field validation utilities.
 * Client-side validation for form inputs — mirrors server-side validation
 * but without timezone-aware datetime parsing.
 */

// ─── Constants ─────────────────────────────────────────────────────

/** Conservative email regex for client-side validation. */
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/

// ─── Validation ────────────────────────────────────────────────────

/**
 * Validate a single field value against its FieldSpec.
 * Returns error message or null if valid.
 *
 * Handles: required, email (including comma-separated), choice, contact.
 * Does NOT handle datetime (needs timezone context — server-side only).
 */
export function validateFieldValue(spec: FieldSpec, value: string): string | null {
  const isEmpty = !value.trim()
  if (spec.required && isEmpty) return 'Required'
  if (isEmpty) return null

  switch (spec.inputType) {
    case 'email': {
      if (spec.key === 'attendees' || value.includes(',')) {
        const emails = value.split(',').map(s => s.trim()).filter(Boolean)
        const invalid = emails.filter(e => !EMAIL_RE.test(e))
        if (invalid.length > 0) return `Invalid: ${invalid.join(', ')}`
      } else {
        if (!EMAIL_RE.test(value)) return 'Not a valid email address'
      }
      return null
    }

    case 'contact': {
      if (!EMAIL_RE.test(value)) return 'Enter a valid email address'
      return null
    }

    case 'choice': {
      if (!spec.options?.some(option => option.value === value)) {
        return 'Select a valid option'
      }
      return null
    }

    default:
      return null
  }
}

// ─── Initial Values ────────────────────────────────────────────────

/**
 * Convert a field's currentValue to a string for form input.
 * Handles arrays (attendees) and null/undefined.
 */
export function getInitialFieldValue(spec: FieldSpec, value: unknown): string {
  if (value == null) return ''
  if (spec.inputType === 'email' && spec.key === 'attendees' && Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value)
}
