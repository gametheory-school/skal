import { describe, it, expect, beforeEach } from 'vitest'
import { SkillRegistry } from '../../../src/engine/registry.js'
import type { SkillDefinition, ActorContext } from '../../../src/engine/types.js'
import { z } from 'zod'

function makeSkill(id: string, requiredRole?: string): SkillDefinition {
  return {
    id,
    fieldSchema: z.object({ name: z.string() }),
    questions: { name: 'Name?' },
    requiredRole,
    handler: async () => ({ type: 'instant', data: {} }),
  }
}

const userActor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  platformRole: 'user',
  orgRole: 'user',
}

const adminActor: ActorContext = {
  userId: 'u2',
  organizationId: 'org1',
  platformRole: 'admin',
  orgRole: 'admin',
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = new SkillRegistry()
  })

  it('registers and retrieves a skill', () => {
    const skill = makeSkill('test.skill')
    registry.register(skill)
    expect(registry.get('test.skill')).toBe(skill)
  })

  it('throws on duplicate registration', () => {
    const skill = makeSkill('test.skill')
    registry.register(skill)
    expect(() => registry.register(skill)).toThrow('already registered')
  })

  it('returns undefined for unknown skill', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('lists all registered skills', () => {
    registry.register(makeSkill('a'))
    registry.register(makeSkill('b'))
    expect(registry.list()).toHaveLength(2)
  })

  it('has() returns true for registered skills', () => {
    registry.register(makeSkill('test.skill'))
    expect(registry.has('test.skill')).toBe(true)
    expect(registry.has('nope')).toBe(false)
  })

  it('unregisters a skill', () => {
    registry.register(makeSkill('test.skill'))
    expect(registry.unregister('test.skill')).toBe(true)
    expect(registry.has('test.skill')).toBe(false)
    expect(registry.unregister('test.skill')).toBe(false)
  })

  it('clear removes all skills', () => {
    registry.register(makeSkill('a'))
    registry.register(makeSkill('b'))
    registry.clear()
    expect(registry.list()).toHaveLength(0)
  })

  describe('availableFor', () => {
    it('returns skills without requiredRole for any actor', () => {
      registry.register(makeSkill('open.skill'))
      const available = registry.availableFor(userActor)
      expect(available).toHaveLength(1)
    })

    it('filters skills by requiredRole for regular user', () => {
      registry.register(makeSkill('user.skill', 'user'))
      registry.register(makeSkill('admin.skill', 'admin'))
      const available = registry.availableFor(userActor)
      expect(available).toHaveLength(1)
      expect(available[0].id).toBe('user.skill')
    })

    it('admin can access all skills', () => {
      registry.register(makeSkill('user.skill', 'user'))
      registry.register(makeSkill('admin.skill', 'admin'))
      const available = registry.availableFor(adminActor)
      expect(available).toHaveLength(2)
    })

    it('matches orgRole against requiredRole', () => {
      const editorActor: ActorContext = {
        userId: 'u3',
        organizationId: 'org1',
        platformRole: 'user',
        orgRole: 'editor',
      }
      registry.register(makeSkill('editor.skill', 'editor'))
      registry.register(makeSkill('admin.skill', 'admin'))
      const available = registry.availableFor(editorActor)
      expect(available).toHaveLength(1)
      expect(available[0].id).toBe('editor.skill')
    })
  })
})
