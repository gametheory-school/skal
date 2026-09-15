import type { PermissionGate, ActorContext } from '../engine/types.js'

/**
 * Check permission at compose-time.
 * If this returns false, the clarification card should never be shown.
 */
export async function checkAtCompose(
  gate: PermissionGate,
  actor: ActorContext,
  actionId: string,
): Promise<boolean> {
  return gate.can(actor, actionId)
}

/**
 * Check permission immediately before dispatch.
 * Defense-in-depth: a multi-turn clarification or long-lived recurring
 * schedule can outlast the actor's current role.
 */
export async function checkBeforeDispatch(
  gate: PermissionGate,
  actor: ActorContext,
  actionId: string,
): Promise<boolean> {
  return gate.can(actor, actionId)
}
