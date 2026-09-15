import { describe, it, expect } from 'vitest'
import { journalEntrySkill } from '../../../examples/journal-entry-skill.js'
import { StateMachine } from '../../../src/engine/state-machine.js'
import { SkillRegistry } from '../../../src/engine/registry.js'
import { Dispatcher } from '../../../src/engine/dispatcher.js'
import { validateFields } from '../../../src/fields/validate.js'
import type { ActorContext, PermissionGate } from '../../../src/engine/types.js'

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  platformRole: 'user',
  orgRole: 'user',
}

describe('Journal Entry Skill (validation target)', () => {
  it('has the correct contract shape', () => {
    expect(journalEntrySkill.id).toBe('journal.entry')
    expect(journalEntrySkill.cancellable).toBe(false)
    expect(journalEntrySkill.requiredRole).toBe('user')
    expect(journalEntrySkill.questions).toHaveProperty('title')
    expect(journalEntrySkill.questions).toHaveProperty('content')
    expect(journalEntrySkill.questions).toHaveProperty('tags')
  })

  it('handler returns instant result', async () => {
    const result = await journalEntrySkill.handler(
      { title: 'Test', content: 'Body' },
      actor,
    )
    expect(result.type).toBe('instant')
    if (result.type === 'instant') {
      const data = result.data as { id: string; title: string; content: string }
      expect(data.id).toBeDefined()
      expect(data.title).toBe('Test')
      expect(data.content).toBe('Body')
    }
  })

  it('validates with complete fields', () => {
    const result = validateFields(
      journalEntrySkill.fieldSchema,
      { title: 'My Entry', content: 'Hello world' },
      journalEntrySkill.questions,
    )
    expect(result.valid).toBe(true)
  })

  it('detects missing required fields', () => {
    const result = validateFields(
      journalEntrySkill.fieldSchema,
      {},
      journalEntrySkill.questions,
    )
    expect(result.valid).toBe(false)
    expect(result.missingFields.length).toBeGreaterThan(0)
  })

  it('runs full flow: register → state machine → validate → dispatch', async () => {
    // Register skill.
    const registry = new SkillRegistry()
    registry.register(journalEntrySkill)
    expect(registry.has('journal.entry')).toBe(true)

    // Permission gate.
    const gate: PermissionGate = { can: async () => true }
    const dispatcher = new Dispatcher(gate)

    // State machine flow.
    const sm = new StateMachine()

    // 1. Skill selected.
    sm.send({ type: 'SKILL_SELECTED', skillId: 'journal.entry' })
    expect(sm.currentState.kind).toBe('capturing')

    // 2. Validate fields — gaps detected.
    const validation = validateFields(
      journalEntrySkill.fieldSchema,
      {},
      journalEntrySkill.questions,
    )
    expect(validation.valid).toBe(false)

    sm.send({
      type: 'GAPS_DETECTED',
      missingFields: validation.missingFields,
    })
    expect(sm.currentState.kind).toBe('clarifying')

    // 3. User provides fields.
    const fields = { title: 'My Entry', content: 'Hello world' }
    const revalidation = validateFields(
      journalEntrySkill.fieldSchema,
      fields,
      journalEntrySkill.questions,
    )
    expect(revalidation.valid).toBe(true)

    sm.send({ type: 'VALIDATED', fields })
    expect(sm.currentState.kind).toBe('validated')

    // 4. Dispatch.
    sm.send({ type: 'DISPATCH' })
    expect(sm.currentState.kind).toBe('executing')

    const skill = registry.get('journal.entry')!
    const result = await dispatcher.dispatch(skill, fields, actor)
    expect(result.type).toBe('instant')

    sm.send({ type: 'HANDLER_RESULT', result })
    expect(sm.currentState.kind).toBe('completed')
  })
})
