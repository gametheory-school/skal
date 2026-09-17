import { z } from 'zod'

// ─── Field Specification ───────────────────────────────────────────

export type InputType = 'text' | 'email' | 'datetime' | 'contact' | 'choice'

export interface FieldMetaInput {
  inputType: InputType
  label: string
  multiline?: boolean
  options?: Array<{ value: string; label: string }>
}

export interface FieldSpec {
  key: string
  label: string
  inputType: InputType
  required: boolean
  multiline?: boolean
  /** Pre-filled from extraction or learned default. */
  currentValue?: unknown
  /** For inputType: 'choice'. */
  options?: Array<{ value: string; label: string }>
  /** True when the engine auto-resolved a single-option choice field. */
  autoResolved?: boolean
}

// ─── Skill Definition ─────────────────────────────────────────────

export interface SkillDefinition {
  id: string
  /** Human-readable description for intent routing (e.g., "Create a new journal entry"). */
  description?: string
  /** Drives FieldSpec generation + validation. */
  fieldSchema: z.ZodSchema
  /** Field key → question text. */
  questions: Record<string, string>
  /** Optional field metadata (inputType, label, etc.) for FieldSpec generation. */
  fieldMeta?: Record<string, FieldMetaInput>
  /**
   * Optional pre-flight hook. Runs after skill selection, before the
   * clarify loop renders. Use it to fetch dynamic data (e.g. dropdown
   * options from an API) and merge into fieldMeta.
   */
  prepare?: (
    actor: ActorContext,
    fieldMeta: Record<string, FieldMetaInput>,
  ) => Promise<Record<string, FieldMetaInput>>
  /** Checked via PermissionGate. */
  requiredRole?: string
  platformOnly?: boolean
  cancellable?: boolean
  /** Optional route patterns. When set, skill is only available on matching pages. */
  routes?: string[]
  handler: SkillHandler
  cancel?: (executionId: string) => Promise<void>
}

// ─── Handler Types ────────────────────────────────────────────────

export type SkillHandler = (
  fields: Record<string, unknown>,
  context: ActorContext,
) => Promise<HandlerResult>

export type HandlerResult =
  | { type: 'instant'; data: unknown; message?: string }
  | { type: 'long-running'; executionId: string; estimatedDuration?: number }
  | { type: 'error'; message: string; retryable: boolean }

// ─── Actor Context ────────────────────────────────────────────────

export interface ActorContext {
  userId: string
  /** Explicit — never inferred mid-pipeline. */
  organizationId: string
  platformRole: 'user' | 'admin'
  orgRole: string | null
}

// ─── Permission Gate ──────────────────────────────────────────────

export interface PermissionGate {
  can(actor: ActorContext, actionId: string): Promise<boolean>
}

// ─── Route Matching ───────────────────────────────────────────────

/**
 * Determines whether a skill's route patterns match the current page.
 * Default: prefix match — `currentRoute.startsWith(skillRoute)`.
 */
export type RouteMatcher = (skillRoutes: string[], currentRoute: string) => boolean

// ─── Action State (state machine states) ──────────────────────────

export type ActionState =
  | { kind: 'idle' }
  | { kind: 'capturing'; skillId: string; partialFields: Record<string, unknown> }
  | {
      kind: 'clarifying'
      skillId: string
      missingFields: FieldSpec[]
      currentFields: Record<string, unknown>
    }
  | { kind: 'validated'; skillId: string; fields: Record<string, unknown> }
  | {
      kind: 'scheduled'
      skillId: string
      fields: Record<string, unknown>
      trigger: ScheduleTrigger
    }
  | { kind: 'executing'; skillId: string; fields: Record<string, unknown> }
  | {
      kind: 'running'
      executionId: string
      progress?: number
      eta?: number
    }
  | { kind: 'completed'; result: unknown; message?: string }
  | { kind: 'failed'; error: string; retryable: boolean }
  | { kind: 'cancelled'; executionId: string; partialEffects?: string }

// ─── Schedule Trigger ─────────────────────────────────────────────

export type ScheduleTrigger =
  | { type: 'once'; at: string }
  | { type: 'recurring'; cron: string; timezone: string }

// ─── State Machine Events ─────────────────────────────────────────

export type ActionEvent =
  | { type: 'SKILL_SELECTED'; skillId: string; extractedFields?: Record<string, unknown> }
  | { type: 'SELECTION_DENIED'; message: string }
  | { type: 'FIELDS_EXTRACTED'; fields: Record<string, unknown> }
  | { type: 'GAPS_DETECTED'; missingFields: FieldSpec[] }
  | { type: 'USER_REPLIED'; fields: Record<string, unknown> }
  | { type: 'VALIDATED'; fields: Record<string, unknown> }
  | { type: 'DISPATCH' }
  | { type: 'SCHEDULE'; trigger: ScheduleTrigger }
  | { type: 'TRIGGER_FIRED' }
  | { type: 'HANDLER_RESULT'; result: HandlerResult }
  | { type: 'CANCEL'; executionId: string; partialEffects?: string }
