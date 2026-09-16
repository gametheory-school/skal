import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validateFields, buildFieldSpecs } from '../../../src/fields/validate.js'

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
})

const questions = {
  title: "What's the title?",
  content: 'What would you like to capture?',
  tags: 'Any tags?',
}

describe('validateFields', () => {
  it('returns valid when all required fields are present', () => {
    const result = validateFields(schema, { title: 'Hello', content: 'World' }, questions)
    expect(result.valid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
    expect(result.data).toEqual({ title: 'Hello', content: 'World' })
  })

  it('returns valid with optional fields', () => {
    const result = validateFields(
      schema,
      { title: 'Hello', content: 'World', tags: ['a', 'b'] },
      questions,
    )
    expect(result.valid).toBe(true)
    expect(result.data).toEqual({ title: 'Hello', content: 'World', tags: ['a', 'b'] })
  })

  it('returns missing fields when required fields are absent', () => {
    const result = validateFields(schema, {}, questions)
    expect(result.valid).toBe(false)
    expect(result.missingFields.length).toBeGreaterThan(0)
    expect(Object.keys(result.errors).length).toBeGreaterThan(0)
  })

  it('returns errors for invalid field values', () => {
    const result = validateFields(schema, { title: '', content: '' }, questions)
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveProperty('title')
    expect(result.errors).toHaveProperty('content')
  })

  it('reports correct error messages', () => {
    const result = validateFields(schema, { title: 123 }, questions)
    expect(result.valid).toBe(false)
    expect(Object.keys(result.errors).length).toBeGreaterThan(0)
  })

  it('downgrades missing zero-option choice fields to text', () => {
    const choiceSchema = z.object({ template_id: z.string() })
    const fieldMeta = {
      template_id: { inputType: 'choice' as const, label: 'Template', options: [] },
    }
    const result = validateFields(choiceSchema, {}, { template_id: 'Which template?' }, fieldMeta)
    expect(result.valid).toBe(false)
    expect(result.missingFields[0].inputType).toBe('text')
  })
})

describe('buildFieldSpecs', () => {
  it('builds FieldSpecs from a Zod object schema', () => {
    const specs = buildFieldSpecs(schema, questions)
    expect(specs.length).toBe(3)

    const titleSpec = specs.find((s) => s.key === 'title')
    expect(titleSpec).toBeDefined()
    expect(titleSpec!.required).toBe(true)
    expect(titleSpec!.inputType).toBe('text')

    const contentSpec = specs.find((s) => s.key === 'content')
    expect(contentSpec).toBeDefined()
    expect(contentSpec!.required).toBe(true)

    const tagsSpec = specs.find((s) => s.key === 'tags')
    expect(tagsSpec).toBeDefined()
    expect(tagsSpec!.required).toBe(false)
  })

  it('uses fieldMeta when provided', () => {
    const specs = buildFieldSpecs(schema, questions, {
      title: { inputType: 'text', label: 'Entry Title', multiline: false },
      content: { inputType: 'text', label: 'Content', multiline: true },
    })

    const titleSpec = specs.find((s) => s.key === 'title')
    expect(titleSpec!.label).toBe('Entry Title')

    const contentSpec = specs.find((s) => s.key === 'content')
    expect(contentSpec!.multiline).toBe(true)
  })

  it('returns empty array for non-object schemas', () => {
    const specs = buildFieldSpecs(z.string(), questions)
    expect(specs).toEqual([])
  })

  it('downgrades zero-option choice fields to text inputType', () => {
    const choiceSchema = z.object({ template_id: z.string() })
    const specs = buildFieldSpecs(choiceSchema, { template_id: 'Which template?' }, {
      template_id: { inputType: 'choice' as const, label: 'Template', options: [] },
    })
    expect(specs[0].inputType).toBe('text')
  })

  it('keeps choice fields with options as choice', () => {
    const choiceSchema = z.object({ template_id: z.string() })
    const specs = buildFieldSpecs(choiceSchema, { template_id: 'Which template?' }, {
      template_id: {
        inputType: 'choice' as const,
        label: 'Template',
        options: [{ value: 't1', label: 'Template 1' }],
      },
    })
    expect(specs[0].inputType).toBe('choice')
  })
})
