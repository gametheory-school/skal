import { describe, it, expect } from 'vitest'
import { Dispatcher } from '../../../src/engine/dispatcher.js'
import type {
  SkillDefinition,
  ActorContext,
  PermissionGate,
} from '../../../src/engine/types.js'
import { z } from 'zod'

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  platformRole: 'user',
  orgRole: 'user',
}

function makeSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: 'test.skill',
    fieldSchema: z.object({ name: z.string() }),
    questions: { name: 'Name?' },
    handler: async (fields) => ({ type: 'instant', data: fields }),
    ...overrides,
  }
}

describe('Dispatcher', () => {
  it('dispatches handler when permission is granted', async () => {
    const gate: PermissionGate = { can: async () => true }
    const dispatcher = new Dispatcher(gate)
    const skill = makeSkill()

    const result = await dispatcher.dispatch(skill, { name: 'test' }, actor)
    expect(result).toEqual({ type: 'instant', data: { name: 'test' } })
  })

  it('returns error when permission is denied', async () => {
    const gate: PermissionGate = { can: async () => false }
    const dispatcher = new Dispatcher(gate)
    const skill = makeSkill()

    const result = await dispatcher.dispatch(skill, { name: 'test' }, actor)
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toContain('Permission denied')
      expect(result.retryable).toBe(false)
    }
  })

  it('returns error when handler throws', async () => {
    const gate: PermissionGate = { can: async () => true }
    const dispatcher = new Dispatcher(gate)
    const skill = makeSkill({
      handler: async () => {
        throw new Error('Handler exploded')
      },
    })

    const result = await dispatcher.dispatch(skill, { name: 'test' }, actor)
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toBe('Handler exploded')
      expect(result.retryable).toBe(true)
    }
  })

  it('returns error when handler throws non-Error', async () => {
    const gate: PermissionGate = { can: async () => true }
    const dispatcher = new Dispatcher(gate)
    const skill = makeSkill({
      handler: async () => {
        throw 'string error'
      },
    })

    const result = await dispatcher.dispatch(skill, {}, actor)
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.message).toBe('string error')
    }
  })

  it('returns long-running result from handler', async () => {
    const gate: PermissionGate = { can: async () => true }
    const dispatcher = new Dispatcher(gate)
    const skill = makeSkill({
      handler: async () => ({
        type: 'long-running',
        executionId: 'exec-1',
        estimatedDuration: 60,
      }),
    })

    const result = await dispatcher.dispatch(skill, {}, actor)
    expect(result).toEqual({
      type: 'long-running',
      executionId: 'exec-1',
      estimatedDuration: 60,
    })
  })

  describe('cancel', () => {
    it('cancels when skill supports cancellation', async () => {
      const gate: PermissionGate = { can: async () => true }
      const dispatcher = new Dispatcher(gate)
      let cancelled = false
      const skill = makeSkill({
        cancellable: true,
        cancel: async () => {
          cancelled = true
        },
      })

      const result = await dispatcher.cancel(skill, 'exec-1')
      expect(result.cancelled).toBe(true)
      expect(cancelled).toBe(true)
    })

    it('returns error when skill is not cancellable', async () => {
      const gate: PermissionGate = { can: async () => true }
      const dispatcher = new Dispatcher(gate)
      const skill = makeSkill({ cancellable: false })

      const result = await dispatcher.cancel(skill, 'exec-1')
      expect(result.cancelled).toBe(false)
      expect(result.message).toContain('does not support cancellation')
    })

    it('returns error when cancel throws', async () => {
      const gate: PermissionGate = { can: async () => true }
      const dispatcher = new Dispatcher(gate)
      const skill = makeSkill({
        cancellable: true,
        cancel: async () => {
          throw new Error('Cancel failed')
        },
      })

      const result = await dispatcher.cancel(skill, 'exec-1')
      expect(result.cancelled).toBe(false)
      expect(result.message).toBe('Cancel failed')
    })
  })
})
