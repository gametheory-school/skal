// ─── Engine ───────────────────────────────────────────────────────
export { StateMachine } from './engine/state-machine.js'
export { SkillRegistry } from './engine/registry.js'
export { Dispatcher } from './engine/dispatcher.js'

// ─── Fields ───────────────────────────────────────────────────────
export {
  extractFields,
  extractFieldsWithLLM,
  extractDeterministic,
} from './fields/extract.js'
export { validateFields, buildFieldSpecs } from './fields/validate.js'

// ─── Permissions ──────────────────────────────────────────────────
export { checkAtCompose, checkBeforeDispatch } from './permissions/gate.js'

// ─── Types ────────────────────────────────────────────────────────
export type {
  InputType,
  FieldSpec,
  SkillDefinition,
  SkillHandler,
  HandlerResult,
  ActorContext,
  PermissionGate,
  ActionState,
  ActionEvent,
  ScheduleTrigger,
} from './engine/types.js'

export type {
  ExtractionResult,
  ExtractionLLM,
  ChatMessage,
} from './fields/extract.js'

export type { ValidationResult } from './fields/validate.js'
