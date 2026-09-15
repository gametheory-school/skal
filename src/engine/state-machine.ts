import type {
  ActionState,
  ActionEvent,
  FieldSpec,
  HandlerResult,
  ScheduleTrigger,
} from './types.js'

/**
 * Domain-agnostic state machine for the clarify-then-execute loop.
 *
 * Transitions:
 *   idle → capturing           (skill selected, fields partially extracted)
 *   capturing → clarifying     (gaps detected, FieldSpecs for missing fields)
 *   clarifying → clarifying    (user replied, some gaps remain)
 *   clarifying → validated     (all required fields present and valid)
 *   validated → executing      (dispatch triggered)
 *   executing → completed      (instant handler result)
 *   executing → failed         (handler error)
 *   executing → running        (long-running handler result)
 *   running → completed        (async completion)
 *   running → failed           (async failure)
 *   validated → scheduled      (schedule trigger provided)
 *   scheduled → executing      (trigger fires, skip re-asking)
 *   any active state → cancelled (if skill is cancellable)
 */
export class StateMachine {
  private state: ActionState = { kind: 'idle' }

  get currentState(): ActionState {
    return this.state
  }

  /**
   * Apply an event and return the resulting state.
   * Throws if the transition is invalid.
   */
  send(event: ActionEvent): ActionState {
    const next = this.computeNext(event)
    this.state = next
    return next
  }

  /** Reset to idle. */
  reset(): void {
    this.state = { kind: 'idle' }
  }

  private computeNext(event: ActionEvent): ActionState {
    const s = this.state

    // ─── Cancel from any active state ───────────────────────────
    if (event.type === 'CANCEL') {
      if (this.isActiveState(s)) {
        return {
          kind: 'cancelled',
          executionId: event.executionId,
          partialEffects: event.partialEffects,
        }
      }
      throw invalidTransition(s.kind, event.type)
    }

    switch (s.kind) {
      // ─── idle ───────────────────────────────────────────────
      case 'idle':
        if (event.type === 'SKILL_SELECTED') {
          return {
            kind: 'capturing',
            skillId: event.skillId,
            partialFields: event.extractedFields ?? {},
          }
        }
        break

      // ─── capturing ──────────────────────────────────────────
      case 'capturing':
        if (event.type === 'GAPS_DETECTED') {
          return {
            kind: 'clarifying',
            skillId: s.skillId,
            missingFields: event.missingFields,
            currentFields: s.partialFields,
          }
        }
        if (event.type === 'VALIDATED') {
          return {
            kind: 'validated',
            skillId: s.skillId,
            fields: event.fields,
          }
        }
        break

      // ─── clarifying ─────────────────────────────────────────
      case 'clarifying':
        if (event.type === 'USER_REPLIED') {
          // Merge new fields into current fields.
          // Caller is responsible for the merge; the state machine
          // stores the result it receives.
          return {
            kind: 'clarifying',
            skillId: s.skillId,
            missingFields: [],
            currentFields: { ...s.currentFields, ...event.fields },
          }
        }
        if (event.type === 'GAPS_DETECTED') {
          return {
            kind: 'clarifying',
            skillId: s.skillId,
            missingFields: event.missingFields,
            currentFields: s.currentFields,
          }
        }
        if (event.type === 'VALIDATED') {
          return {
            kind: 'validated',
            skillId: s.skillId,
            fields: event.fields,
          }
        }
        break

      // ─── validated ──────────────────────────────────────────
      case 'validated':
        if (event.type === 'DISPATCH') {
          return {
            kind: 'executing',
            skillId: s.skillId,
            fields: s.fields,
          }
        }
        if (event.type === 'SCHEDULE') {
          return {
            kind: 'scheduled',
            skillId: s.skillId,
            fields: s.fields,
            trigger: event.trigger,
          }
        }
        break

      // ─── scheduled ──────────────────────────────────────────
      case 'scheduled':
        if (event.type === 'TRIGGER_FIRED') {
          return {
            kind: 'executing',
            skillId: s.skillId,
            fields: s.fields,
          }
        }
        break

      // ─── executing ──────────────────────────────────────────
      case 'executing':
        if (event.type === 'HANDLER_RESULT') {
          return resolveHandlerResult(event.result)
        }
        break

      // ─── running ────────────────────────────────────────────
      case 'running':
        if (event.type === 'HANDLER_RESULT') {
          return resolveHandlerResult(event.result)
        }
        break

      // ─── terminal states (completed, failed, cancelled) ─────
      case 'completed':
      case 'failed':
      case 'cancelled':
        break
    }

    throw invalidTransition(s.kind, event.type)
  }

  private isActiveState(s: ActionState): boolean {
    return s.kind !== 'idle' && s.kind !== 'completed' && s.kind !== 'failed' && s.kind !== 'cancelled'
  }
}

function resolveHandlerResult(result: HandlerResult): ActionState {
  switch (result.type) {
    case 'instant':
      return { kind: 'completed', result: result.data }
    case 'long-running':
      return { kind: 'running', executionId: result.executionId }
    case 'error':
      return { kind: 'failed', error: result.message, retryable: result.retryable }
  }
}

function invalidTransition(stateKind: string, eventType: string): Error {
  return new Error(
    `Invalid transition: cannot send ${eventType} while in state "${stateKind}"`,
  )
}
