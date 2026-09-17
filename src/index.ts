// ─── Engine ───────────────────────────────────────────────────────
export { StateMachine } from './engine/state-machine.js'
export { SkillRegistry } from './engine/registry.js'
export { Dispatcher } from './engine/dispatcher.js'
export { SkillRouter } from './engine/router.js'

// ─── Fields ───────────────────────────────────────────────────────
export {
  extractFields,
  extractFieldsWithLLM,
  extractDeterministic,
} from './fields/extract.js'
export { validateFields, buildFieldSpecs } from './fields/validate.js'
export {
  validateFieldValue,
  getInitialFieldValue,
  EMAIL_RE,
} from './fields/validate-field.js'

// ─── Permissions ──────────────────────────────────────────────────
export { checkAtCompose, checkBeforeDispatch } from './permissions/gate.js'

// ─── Types ────────────────────────────────────────────────────────
export type {
  InputType,
  FieldMetaInput,
  FieldSpec,
  SkillDefinition,
  SkillHandler,
  HandlerResult,
  ActorContext,
  PermissionGate,
  ActionState,
  ActionEvent,
  ScheduleTrigger,
  RouteMatcher,
} from './engine/types.js'

export type {
  ExtractionResult,
  ExtractionLLM,
  ChatMessage,
  CustomExtractors,
} from './fields/extract.js'

export type { ValidationResult } from './fields/validate.js'

export type { RouteResult, RouterOptions } from './engine/router.js'
