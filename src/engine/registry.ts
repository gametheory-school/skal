import type { SkillDefinition, ActorContext } from './types.js'

/**
 * Registry for skill definitions.
 *
 * Supports registration, lookup by ID, listing all skills,
 * and filtering by actor role.
 */
export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>()

  /** Register a skill. Throws if a skill with the same ID is already registered. */
  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill "${skill.id}" is already registered`)
    }
    this.skills.set(skill.id, skill)
  }

  /** Get a skill by ID. Returns undefined if not found. */
  get(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId)
  }

  /** List all registered skills. */
  list(): SkillDefinition[] {
    return Array.from(this.skills.values())
  }

  /**
   * Filter skills available to an actor based on requiredRole.
   * Skills without a requiredRole are available to everyone.
   * Admin actors can access all skills.
   */
  availableFor(actor: ActorContext): SkillDefinition[] {
    return this.list().filter((skill) => {
      if (!skill.requiredRole) return true
      if (actor.platformRole === 'admin') return true
      return actor.orgRole === skill.requiredRole || actor.platformRole === skill.requiredRole
    })
  }

  /** Remove a skill by ID. Returns true if it existed. */
  unregister(skillId: string): boolean {
    return this.skills.delete(skillId)
  }

  /** Check if a skill is registered. */
  has(skillId: string): boolean {
    return this.skills.has(skillId)
  }

  /** Remove all registered skills. */
  clear(): void {
    this.skills.clear()
  }
}
