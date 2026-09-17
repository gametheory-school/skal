/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { z } from 'zod'
import { ActionCard, type ActionCardProps } from '../../../src/ui/ActionCard/ActionCard.js'
import type {
  ActionState,
  FieldSpec,
  SkillDefinition,
} from '../../../src/engine/types.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const capturing: ActionState = {
  kind: 'capturing',
  skillId: 'test-skill',
  partialFields: {},
}

const skill: SkillDefinition = {
  id: 'test-skill',
  fieldSchema: z.object({}),
  questions: {},
  handler: async () => ({ type: 'instant', data: null }),
}

function renderCard(fields: FieldSpec[], extra: Partial<ActionCardProps> = {}) {
  const props: ActionCardProps = {
    state: capturing,
    skill,
    requiredFields: fields.filter((f) => f.required),
    optionalFields: fields.filter((f) => !f.required),
    questions: Object.fromEntries(fields.map((f) => [f.key, `${f.label}?`])),
    errors: {},
    currentFields: {},
    onSubmit: vi.fn(),
    onSubmitText: vi.fn(),
    onDispatch: vi.fn(),
    onCancel: vi.fn(),
    onReset: vi.fn(),
    ...extra,
  }
  render(<ActionCard {...props} />)
}

const titleField: FieldSpec = {
  key: 'title',
  label: 'Title',
  inputType: 'text',
  required: true,
}

const emailField: FieldSpec = {
  key: 'email',
  label: 'Email',
  inputType: 'email',
  required: true,
}

const whenField: FieldSpec = {
  key: 'when',
  label: 'When',
  inputType: 'datetime',
  required: true,
}

const priorityField: FieldSpec = {
  key: 'priority',
  label: 'Priority',
  inputType: 'choice',
  required: true,
  options: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
}

describe('ActionCard live validation', () => {
  it('shows no errors and no aria attributes on initial render', () => {
    renderCard([titleField, emailField])
    expect(screen.queryByText('Required')).toBeNull()
    expect(screen.queryByText(/valid email/i)).toBeNull()
    expect(screen.getByLabelText('Title?').getAttribute('aria-describedby')).toBeNull()
    expect(screen.getByLabelText('Email?').getAttribute('aria-invalid')).toBeNull()
  })

  it('shows Required on blur of an empty required field', () => {
    renderCard([titleField])
    fireEvent.blur(screen.getByLabelText('Title?'))
    expect(screen.getByText('Required')).toBeDefined()
  })

  it('shows an error on blur of an invalid email', () => {
    renderCard([emailField])
    const input = screen.getByLabelText('Email?')
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.blur(input)
    expect(screen.getByText('Not a valid email address')).toBeDefined()
  })

  it('shows no error on blur of a valid email', () => {
    renderCard([emailField])
    const input = screen.getByLabelText('Email?')
    fireEvent.change(input, { target: { value: 'sarah@example.com' } })
    fireEvent.blur(input)
    expect(screen.queryByText('Required')).toBeNull()
    expect(screen.queryByText(/valid email/i)).toBeNull()
  })

  it('clears the error immediately when corrected', () => {
    renderCard([emailField])
    const input = screen.getByLabelText('Email?')
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.blur(input)
    expect(screen.getByText('Not a valid email address')).toBeDefined()
    fireEvent.change(input, { target: { value: 'sarah@example.com' } })
    expect(screen.queryByText('Not a valid email address')).toBeNull()
  })

  it('disables submit while a live error is showing and re-enables on correction', () => {
    renderCard([emailField])
    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement
    const input = screen.getByLabelText('Email?')
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.blur(input)
    expect(screen.getByText('Not a valid email address')).toBeDefined()
    expect(submit.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'sarah@example.com' } })
    expect(submit.disabled).toBe(false)
  })

  it('validates debounced change events on already-touched fields', () => {
    vi.useFakeTimers()
    renderCard([emailField])
    const input = screen.getByLabelText('Email?')
    fireEvent.blur(input)
    expect(screen.getByText('Required')).toBeDefined()
    fireEvent.change(input, { target: { value: 'foo' } })
    expect(screen.getByText('Required')).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText('Not a valid email address')).toBeDefined()
  })

  it('does not validate change events on untouched fields', () => {
    vi.useFakeTimers()
    renderCard([emailField])
    const input = screen.getByLabelText('Email?')
    fireEvent.change(input, { target: { value: 'foo' } })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByText('Required')).toBeNull()
    expect(screen.queryByText('Not a valid email address')).toBeNull()
  })

  it('skips datetime fields entirely', () => {
    renderCard([whenField])
    const input = screen.getByLabelText('When?')
    fireEvent.blur(input)
    expect(screen.queryByText('Required')).toBeNull()
    fireEvent.change(input, { target: { value: 'not-a-date' } })
    fireEvent.blur(input)
    expect(screen.queryByText('Required')).toBeNull()
    expect(screen.queryByText(/valid/i)).toBeNull()
  })

  it('skips choice fields (warning banner handles mismatches)', () => {
    renderCard([priorityField])
    const select = screen.getByLabelText('Priority?')
    fireEvent.blur(select)
    expect(screen.queryByText('Required')).toBeNull()
    expect(screen.queryByText('Select a valid option')).toBeNull()
  })

  it('links errors to inputs via aria-describedby and aria-invalid', () => {
    renderCard([titleField])
    const input = screen.getByLabelText('Title?')
    fireEvent.blur(input)
    expect(input.getAttribute('aria-describedby')).toBe('field-title-error')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Required').id).toBe('field-title-error')
  })

  it('still renders the warning banner for choice mismatches', () => {
    renderCard([priorityField], {
      warnings: { priority: 'No match for "urgent" in Priority' },
    })
    expect(screen.getByText(/No match for "urgent" in Priority/)).toBeDefined()
  })
})
