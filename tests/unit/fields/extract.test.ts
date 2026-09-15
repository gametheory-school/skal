import { describe, it, expect } from 'vitest'
import {
  extractFields,
  extractDeterministic,
  extractFieldsWithLLM,
} from '../../../src/fields/extract.js'
import type { FieldSpec } from '../../../src/engine/types.js'
import type { ExtractionLLM } from '../../../src/fields/extract.js'

const emailField: FieldSpec = {
  key: 'email',
  label: 'Email',
  inputType: 'email',
  required: true,
}

const textField: FieldSpec = {
  key: 'title',
  label: 'Title',
  inputType: 'text',
  required: true,
}

const datetimeField: FieldSpec = {
  key: 'when',
  label: 'When',
  inputType: 'datetime',
  required: true,
}

const choiceField: FieldSpec = {
  key: 'priority',
  label: 'Priority',
  inputType: 'choice',
  required: true,
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ],
}

describe('extractDeterministic', () => {
  it('extracts email from text', () => {
    expect(extractDeterministic('Contact me at hello@example.com please', emailField)).toBe(
      'hello@example.com',
    )
  })

  it('returns undefined for text with no email', () => {
    expect(extractDeterministic('no email here', emailField)).toBeUndefined()
  })

  it('extracts ISO datetime from text', () => {
    expect(
      extractDeterministic('Meeting on 2026-09-16T10:00:00Z', datetimeField),
    ).toBe('2026-09-16T10:00:00Z')
  })

  it('extracts date-only ISO string', () => {
    expect(extractDeterministic('Due 2026-09-16', datetimeField)).toBe('2026-09-16')
  })

  it('extracts choice by value', () => {
    expect(extractDeterministic('Set priority to high', choiceField)).toBe('high')
  })

  it('extracts choice by label', () => {
    expect(extractDeterministic('I want Low priority', choiceField)).toBe('low')
  })

  it('returns undefined for text input (no deterministic extraction)', () => {
    expect(extractDeterministic('some text', textField)).toBeUndefined()
  })
})

describe('extractFields', () => {
  it('extracts all deterministic fields', () => {
    const result = extractFields('hello@example.com high', [emailField, choiceField])
    expect(result.extracted).toEqual({
      email: 'hello@example.com',
      priority: 'high',
    })
    expect(result.missing).toEqual([])
  })

  it('reports missing fields when extraction fails', () => {
    const result = extractFields('nothing useful', [emailField, textField])
    expect(result.extracted).toEqual({})
    expect(result.missing).toEqual(['email', 'title'])
  })

  it('handles mixed extraction (some found, some missing)', () => {
    const result = extractFields('hello@example.com', [emailField, textField])
    expect(result.extracted).toEqual({ email: 'hello@example.com' })
    expect(result.missing).toEqual(['title'])
  })
})

describe('extractFieldsWithLLM', () => {
  it('skips LLM when deterministic extraction fills all fields', async () => {
    let llmCalled = false
    const llm: ExtractionLLM = {
      complete: async () => {
        llmCalled = true
        return '{}'
      },
    }

    const result = await extractFieldsWithLLM('hello@example.com', [emailField], llm)
    expect(llmCalled).toBe(false)
    expect(result.extracted).toEqual({ email: 'hello@example.com' })
    expect(result.missing).toEqual([])
  })

  it('falls back to LLM for missing fields', async () => {
    const llm: ExtractionLLM = {
      complete: async () => JSON.stringify({ title: 'My Title' }),
    }

    const result = await extractFieldsWithLLM('hello@example.com', [emailField, textField], llm)
    expect(result.extracted).toEqual({
      email: 'hello@example.com',
      title: 'My Title',
    })
    expect(result.missing).toEqual([])
  })

  it('returns deterministic results when LLM fails', async () => {
    const llm: ExtractionLLM = {
      complete: async () => {
        throw new Error('LLM unavailable')
      },
    }

    const result = await extractFieldsWithLLM('hello@example.com', [emailField, textField], llm)
    expect(result.extracted).toEqual({ email: 'hello@example.com' })
    expect(result.missing).toEqual(['title'])
  })

  it('returns deterministic results when LLM returns invalid JSON', async () => {
    const llm: ExtractionLLM = {
      complete: async () => 'not json',
    }

    const result = await extractFieldsWithLLM('hello@example.com', [emailField, textField], llm)
    expect(result.extracted).toEqual({ email: 'hello@example.com' })
    expect(result.missing).toEqual(['title'])
  })
})
