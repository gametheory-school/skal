import type {
  SkillDefinition,
  ActorContext,
  PermissionGate,
  HandlerResult,
} from './types.js'

/**
 * Dispatches a skill handler with a pre-dispatch permission re-check.
 *
 * Gate timing: permission is checked at compose-time (before showing
 * clarification cards) AND again right before dispatch (defense-in-depth —
 * a multi-turn clarification or long-lived recurring schedule can outlast
 * the actor's current role).
 */
export class Dispatcher {
  constructor(
    private readonly permissionGate: PermissionGate,
  ) {}

  /**
   * Dispatch a skill handler.
   *
   * 1. Re-check permission (defense-in-depth).
   * 2. Invoke the skill handler with validated fields + actor context.
   * 3. Return the normalized HandlerResult.
   */
  async dispatch(
    skill: SkillDefinition,
    fields: Record<string, unknown>,
    actor: ActorContext,
  ): Promise<HandlerResult> {
    // Pre-dispatch permission re-check.
    const allowed = await this.permissionGate.can(actor, skill.id)
    if (!allowed) {
      return {
        type: 'error',
        message: `Permission denied: ${actor.userId} cannot execute "${skill.id}"`,
        retryable: false,
      }
    }

    try {
      const result = await skill.handler(fields, actor)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        type: 'error',
        message,
        retryable: true,
      }
    }
  }

  /**
   * Cancel a running execution if the skill supports it.
   */
  async cancel(
    skill: SkillDefinition,
    executionId: string,
  ): Promise<{ cancelled: boolean; message: string }> {
    if (!skill.cancellable || !skill.cancel) {
      return {
        cancelled: false,
        message: `Skill "${skill.id}" does not support cancellation`,
      }
    }

    try {
      await skill.cancel(executionId)
      return { cancelled: true, message: 'Cancellation requested' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { cancelled: false, message }
    }
  }
}
