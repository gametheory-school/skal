import type {
  ActionState,
  ActionEvent,
  FieldSpec,
  SkillDefinition,
  ActorContext,
  PermissionGate,
  HandlerResult,
  ScheduleTrigger,
  FieldMetaInput,
} from '../engine/types.js'
import type { ExtractionLLM, ExtractionResult } from '../fields/extract.js'
import { extractFields } from '../fields/extract.js'
import { validateFields, buildFieldSpecs } from '../fields/validate.js'
import { checkAtCompose } from '../permissions/gate.js'
import { StateMachine } from '../engine/state-machine.js'
import { SkillRegistry } from '../engine/registry.js'
import { Dispatcher } from '../engine/dispatcher.js'
import { SkillRouter } from '../engine/router.js'
import type { RouteResult } from '../engine/router.js'

// ─── ActionCard Props (engine-side definition) ────────────────────

export interface ActionCardProps {
  state: ActionState
  skill: SkillDefinition | undefined
  requiredFields: FieldSpec[]
  optionalFields: FieldSpec[]
  questions: Record<string, string>
  errors: Record<string, string>
  currentFields: Record<string, unknown>
  onSubmit: (fields: Record<string, unknown>) => void
  onSubmitText: (text: string) => void
  onDispatch: () => void
  onCancel: () => void
  onReset: () => void
}

// ─── Snapshot (for hook subscription) ─────────────────────────────

export interface EngineSnapshot {
  state: ActionState
  skill: SkillDefinition | undefined
  fields: Record<string, unknown>
  errors: Record<string, string>
  allFieldSpecs: FieldSpec[]
  dispatching: boolean
  preparing: boolean
}

// ─── Listener ──────────────────────────────────────────────────────

type Listener = () => void

// ─── ActionEngine ──────────────────────────────────────────────────

/**
 * Pure TypeScript orchestration class (no React).
 * Wires StateMachine + Registry + Dispatcher + SkillRouter + validation.
 */
export class ActionEngine {
  private readonly sm = new StateMachine()
  private readonly dispatcher: Dispatcher
  private readonly router: SkillRouter | null

  private _state: ActionState = { kind: 'idle' }
  private _activeSkillId: string | null = null
  private _fields: Record<string, unknown> = {}
  private _errors: Record<string, string> = {}
  private _allFieldSpecs: FieldSpec[] = []
  private _dispatching = false
  private _routing = false
  private _preparing = false
  private _pendingReset = false
  private _routeQueue: Promise<unknown> = Promise.resolve()
  private _resolvedFieldMeta: Record<string, FieldMetaInput> | undefined = undefined
  private _rawInput: string = ''

  private listeners = new Set<Listener>()

  constructor(
    private readonly registry: SkillRegistry,
    private readonly permissionGate: PermissionGate,
    private readonly actor: ActorContext,
    private readonly llm?: ExtractionLLM,
  ) {
    this.dispatcher = new Dispatcher(permissionGate)
    this.router = new SkillRouter(registry, actor, llm)
  }

  // ─── Getters ─────────────────────────────────────────────────

  get state(): ActionState {
    return this._state
  }

  get activeSkill(): SkillDefinition | undefined {
    return this._activeSkillId ? this.registry.get(this._activeSkillId) : undefined
  }

  // ─── Subscription ────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): EngineSnapshot {
    return {
      state: this._state,
      skill: this.activeSkill,
      fields: this._fields,
      errors: this._errors,
      allFieldSpecs: this._allFieldSpecs,
      dispatching: this._dispatching,
      preparing: this._preparing,
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Pre-flight permission check for a skill.
   * For command palettes / route-time gating — does not transition state.
   * Returns false for unregistered skills.
   */
  async canSelect(skillId: string): Promise<boolean> {
    const skill = this.registry.get(skillId)
    if (!skill) return false
    return checkAtCompose(this.permissionGate, this.actor, skillId)
  }

  /**
   * Select a skill and enter the clarify loop.
   * If not idle, resets first (allows switching skills mid-flow).
   * Checks permission before anything else — a denied selection
   * transitions to failed and never runs prepare() or shows a card.
   * Calls skill.prepare() if defined to fetch dynamic field metadata.
   */
  async selectSkill(skillId: string, extractedFields?: Record<string, unknown>): Promise<boolean> {
    const skill = this.registry.get(skillId)
    if (!skill) return false

    try {
      // If not idle, reset first.
      if (this._state.kind !== 'idle') {
        this.resetInternal()
      }

      // Compose-time permission check: the clarification card
      // is never shown for a skill the actor cannot execute.
      const allowed = await checkAtCompose(this.permissionGate, this.actor, skillId)
      if (!allowed) {
        this._activeSkillId = skillId
        this.sm.send({
          type: 'SELECTION_DENIED',
          message: `Permission denied: ${this.actor.userId} cannot execute "${skillId}"`,
        })
        this.notify()
        return false
      }

      this._activeSkillId = skillId

      // Resolve fieldMeta: call prepare() if defined.
      let resolvedMeta = skill.fieldMeta
      if (skill.prepare) {
        this._preparing = true
        this.notify()
        try {
          resolvedMeta = await skill.prepare(this.actor, skill.fieldMeta ?? {})
        } finally {
          this._preparing = false
        }
      }
      this._resolvedFieldMeta = resolvedMeta

      this._allFieldSpecs = buildFieldSpecs(skill.fieldSchema, skill.questions, resolvedMeta)

      // Auto-resolve single-option choice fields.
      // Zero-option choices already downgraded to text by buildFieldSpecs.
      for (const spec of this._allFieldSpecs) {
        if (spec.inputType === 'choice' && spec.required) {
          const options = resolvedMeta?.[spec.key]?.options
          if (options?.length === 1 && (extractedFields?.[spec.key] ?? undefined) === undefined) {
            this._fields[spec.key] = options[0].value
            spec.autoResolved = true
          }
        }
      }

      // Re-extract from raw input now that prepare() has populated options.
      // The router's initial extraction ran against empty option lists for
      // dynamic choice fields; this pass catches them.
      if (this._rawInput) {
        const reExtraction = extractFields(this._rawInput, this._allFieldSpecs)
        extractedFields = { ...extractedFields, ...reExtraction.extracted }
      }

      // Store extracted fields.
      this._fields = { ...this._fields, ...extractedFields }

      // Send SKILL_SELECTED to SM.
      this.sm.send({ type: 'SKILL_SELECTED', skillId, extractedFields })

      // Validate immediately.
      this.validateAndTransition()

      this.notify()
      return true
    } catch (err) {
      // Bug fix #8: catch SM throws, reset to idle.
      this.resetInternal()
      this.notify()
      return false
    }
  }

  /**
   * Submit fields from the form.
   */
  submitFields(fields: Record<string, unknown>): boolean {
    // Bug fix #4: stale skill guard.
    const skill = this.activeSkill
    if (!skill) return false

    // Guard: state must be capturing or clarifying.
    if (this._state.kind !== 'capturing' && this._state.kind !== 'clarifying') {
      return false
    }

    try {
      // Merge fields.
      this._fields = { ...this._fields, ...fields }

      // Validate.
      const result = validateFields(skill.fieldSchema, this._fields, skill.questions, this._resolvedFieldMeta)

      if (result.valid) {
        this._errors = {}
        this.sm.send({ type: 'VALIDATED', fields: this._fields })
      } else {
        this._errors = result.errors
        // If in capturing state, just send GAPS_DETECTED (no USER_REPLIED).
        if (this._state.kind === 'capturing') {
          this.sm.send({ type: 'GAPS_DETECTED', missingFields: result.missingFields })
        } else {
          // From clarifying: send USER_REPLIED then GAPS_DETECTED.
          this.sm.send({ type: 'USER_REPLIED', fields: this._fields })
          this.sm.send({ type: 'GAPS_DETECTED', missingFields: result.missingFields })
        }
      }

      this.notify()
      return true
    } catch (err) {
      // Bug fix #8: catch SM throws.
      this.resetInternal()
      this.notify()
      return false
    }
  }

  /**
   * Submit text from the Composer (text mode).
   */
  submitText(text: string): ExtractionResult | false {
    // Bug fix #4: stale skill guard.
    const skill = this.activeSkill
    if (!skill) return false

    // Guard: state must be capturing or clarifying.
    if (this._state.kind !== 'capturing' && this._state.kind !== 'clarifying') {
      return false
    }

    try {
      // Deterministic extraction from text.
      const extraction = extractFields(text, this._allFieldSpecs)

      // Merge extracted values.
      this._fields = { ...this._fields, ...extraction.extracted }

      // Validate.
      const result = validateFields(skill.fieldSchema, this._fields, skill.questions, this._resolvedFieldMeta)

      if (result.valid) {
        this._errors = {}
        this.sm.send({ type: 'VALIDATED', fields: this._fields })
      } else {
        this._errors = result.errors
        if (this._state.kind === 'capturing') {
          this.sm.send({ type: 'GAPS_DETECTED', missingFields: result.missingFields })
        } else {
          this.sm.send({ type: 'USER_REPLIED', fields: this._fields })
          this.sm.send({ type: 'GAPS_DETECTED', missingFields: result.missingFields })
        }
      }

      this.notify()
      return extraction
    } catch (err) {
      this.resetInternal()
      this.notify()
      return false
    }
  }

  /**
   * Dispatch the validated skill handler.
   * Bug fix #7: dispatching guard is set synchronously before any await.
   */
  async dispatch(): Promise<HandlerResult> {
    // Bug fix #7: double-click prevention.
    if (this._dispatching) {
      return { type: 'error', message: 'Dispatch already in progress', retryable: false }
    }

    // Guard: state must be validated.
    if (this._state.kind !== 'validated') {
      return { type: 'error', message: `Cannot dispatch from state "${this._state.kind}"`, retryable: false }
    }

    // Bug fix #4: stale skill guard.
    const skill = this.activeSkill
    if (!skill) {
      return { type: 'error', message: 'Active skill not found', retryable: false }
    }

    // Set dispatching synchronously before any await.
    this._dispatching = true

    try {
      this.sm.send({ type: 'DISPATCH' })
      this.notify()

      // Read fields from the SM's current state (which is now 'executing').
      const smState = this.sm.currentState
      const fields = smState.kind === 'executing' ? smState.fields : this._fields
      const result = await this.dispatcher.dispatch(skill, fields, this.actor)

      // After handler resolves.
      this._dispatching = false

      // Bug fix: check pendingReset.
      if (this._pendingReset) {
        this._pendingReset = false
        this.resetInternal()
        this.notify()
        return result
      }

      // Check if state is still executing (read from SM, not cached _state).
      const currentSmState = this.sm.currentState
      if (currentSmState.kind !== 'executing') {
        // State changed for another reason — discard result silently.
        return result
      }

      // Send HANDLER_RESULT to SM.
      this.sm.send({ type: 'HANDLER_RESULT', result })
      this.notify()

      return result
    } catch (err) {
      this._dispatching = false
      // Bug fix #8: catch SM throws.
      this.resetInternal()
      this.notify()
      return { type: 'error', message: String(err), retryable: true }
    }
  }

  /**
   * Schedule the validated skill.
   */
  schedule(trigger: ScheduleTrigger): boolean {
    if (this._state.kind !== 'validated') return false

    try {
      this.sm.send({ type: 'SCHEDULE', trigger })
      this.notify()
      return true
    } catch {
      return false
    }
  }

  /**
   * Cancel a running execution.
   */
  async cancel(): Promise<{ cancelled: boolean; message: string }> {
    const skill = this.activeSkill
    if (!skill) {
      return { cancelled: false, message: 'No active skill' }
    }

    if (this._state.kind !== 'running') {
      return { cancelled: false, message: `Cannot cancel from state "${this._state.kind}"` }
    }

    const result = await this.dispatcher.cancel(skill, this._state.executionId)
    if (result.cancelled) {
      try {
        this.sm.send({ type: 'CANCEL', executionId: this._state.executionId })
        this.notify()
      } catch {
        // Bug fix #8.
        this.resetInternal()
        this.notify()
      }
    }

    return result
  }

  /**
   * Reset to idle.
   * If dispatching, sets pendingReset flag instead.
   */
  reset(): void {
    if (this._dispatching) {
      this._pendingReset = true
      return
    }
    this.resetInternal()
    this.notify()
  }

  /**
   * The "do anything" entry point.
   * Classifies input, routes to skill, enters clarify loop.
   * Bug fix #9: serializes concurrent calls.
   */
  async routeInput(text: string): Promise<boolean> {
    // Serialize: queue behind any in-flight routeInput.
    const promise = this._routeQueue.then(async () => {
      if (this._routing) {
        // Should not happen due to queueing, but guard anyway.
        return false
      }
      this._routing = true

      try {
        if (!this.router) return false

        this._rawInput = text
        const result = await this.router.classify(text)
        if (!result) return false

        return await this.selectSkill(result.skillId, result.extractedFields)
      } catch {
        return false
      } finally {
        this._routing = false
      }
    })

    this._routeQueue = promise.catch(() => false)
    return promise
  }

  /**
   * Computed property: bundles state + skill + fields + errors + callbacks.
   */
  get activeAction(): ActionCardProps {
    const skill = this.activeSkill
    const requiredFields = this._allFieldSpecs.filter((f) => f.required)
    const optionalFields = this._allFieldSpecs.filter((f) => !f.required)

    return {
      state: this._state,
      skill,
      requiredFields,
      optionalFields,
      questions: skill?.questions ?? {},
      errors: this._errors,
      currentFields: this._fields,
      onSubmit: (fields) => this.submitFields(fields),
      onSubmitText: (text) => this.submitText(text),
      onDispatch: () => this.dispatch(),
      onCancel: () => this.cancel(),
      onReset: () => this.reset(),
    }
  }

  // ─── Private ─────────────────────────────────────────────────

  private validateAndTransition(): void {
    const skill = this.activeSkill
    if (!skill) return

    const result = validateFields(skill.fieldSchema, this._fields, skill.questions, this._resolvedFieldMeta)

    if (result.valid) {
      this._errors = {}
      this.sm.send({ type: 'VALIDATED', fields: this._fields })
    } else {
      this._errors = result.errors
      this.sm.send({ type: 'GAPS_DETECTED', missingFields: result.missingFields })
    }

    // Sync internal state with SM.
    this._state = this.sm.currentState
  }

  private resetInternal(): void {
    this.sm.reset()
    this._state = { kind: 'idle' }
    this._activeSkillId = null
    this._fields = {}
    this._errors = {}
    this._allFieldSpecs = []
    this._resolvedFieldMeta = undefined
    this._preparing = false
    this._pendingReset = false
    this._rawInput = ''
  }

  private notify(): void {
    this._state = this.sm.currentState
    for (const listener of this.listeners) {
      listener()
    }
  }
}
