'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  ActorContext,
  PermissionGate,
  FieldSpec,
  HandlerResult,
  ScheduleTrigger,
} from '../engine/types.js'
import type { ExtractionLLM } from '../fields/extract.js'
import { SkillRegistry } from '../engine/registry.js'
import { ActionEngine } from './ActionEngine.js'
import type { ActionCardProps, EngineSnapshot, ActionEngineConfig } from './ActionEngine.js'

// ─── Hook options ──────────────────────────────────────────────────

export interface UseActionEngineOptions {
  registry: SkillRegistry
  permissionGate: PermissionGate
  actor: ActorContext
  llm?: ExtractionLLM
  config?: ActionEngineConfig
}

// ─── Hook return type ──────────────────────────────────────────────

export interface UseActionEngineReturn {
  state: EngineSnapshot['state']
  skill: EngineSnapshot['skill']
  fields: EngineSnapshot['fields']
  errors: EngineSnapshot['errors']
  warnings: EngineSnapshot['warnings']
  allFieldSpecs: EngineSnapshot['allFieldSpecs']
  dispatching: EngineSnapshot['dispatching']
  preparing: EngineSnapshot['preparing']
  currentRoute: EngineSnapshot['currentRoute']
  activeAction: ActionCardProps
  routeInput: (text: string) => Promise<boolean>
  selectSkill: (skillId: string, extractedFields?: Record<string, unknown>) => Promise<boolean>
  canSelect: (skillId: string) => Promise<boolean>
  submitFields: (fields: Record<string, unknown>) => boolean
  submitText: (text: string) => ReturnType<ActionEngine['submitText']>
  dispatch: () => Promise<HandlerResult>
  cancel: () => Promise<{ cancelled: boolean; message: string }>
  reset: () => void
  setPageContext: (route: string) => void
}

// ─── Hook ──────────────────────────────────────────────────────────

/**
 * React hook wrapping ActionEngine.
 * Thin subscription wrapper — all logic lives in ActionEngine.
 */
export function useActionEngine(options: UseActionEngineOptions): UseActionEngineReturn {
  const { registry, permissionGate, actor, llm, config } = options

  // Create engine once (stable ref).
  const engineRef = useRef<ActionEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new ActionEngine(registry, permissionGate, actor, llm, config)
  }
  const engine = engineRef.current

  // Subscribe to engine state changes.
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.getSnapshot())

  useEffect(() => {
    const unsub = engine.subscribe(() => {
      setSnapshot(engine.getSnapshot())
    })
    return unsub
  }, [engine])

  // Stable callbacks.
  const routeInput = useCallback(
    (text: string) => engine.routeInput(text),
    [engine],
  )

  const selectSkill = useCallback(
    (skillId: string, extractedFields?: Record<string, unknown>) =>
      engine.selectSkill(skillId, extractedFields),
    [engine],
  )

  const canSelect = useCallback(
    (skillId: string) => engine.canSelect(skillId),
    [engine],
  )

  const submitFields = useCallback(
    (fields: Record<string, unknown>) => engine.submitFields(fields),
    [engine],
  )

  const submitText = useCallback(
    (text: string) => engine.submitText(text),
    [engine],
  )

  const dispatch = useCallback(
    () => engine.dispatch(),
    [engine],
  )

  const cancel = useCallback(
    () => engine.cancel(),
    [engine],
  )

  const reset = useCallback(
    () => engine.reset(),
    [engine],
  )

  const setPageContext = useCallback(
    (route: string) => engine.setPageContext(route),
    [engine],
  )

  // Memoize activeAction from snapshot.
  const activeAction = useMemo<ActionCardProps>(() => {
    const requiredFields = snapshot.allFieldSpecs.filter((f) => f.required)
    const optionalFields = snapshot.allFieldSpecs.filter((f) => !f.required)

    return {
      state: snapshot.state,
      skill: snapshot.skill,
      requiredFields,
      optionalFields,
      questions: snapshot.skill?.questions ?? {},
      errors: snapshot.errors,
      warnings: snapshot.warnings,
      currentFields: snapshot.fields,
      onSubmit: (fields) => engine.submitFields(fields),
      onSubmitText: (text) => engine.submitText(text),
      onDispatch: () => engine.dispatch(),
      onCancel: () => engine.cancel(),
      onReset: () => engine.reset(),
    }
  }, [snapshot, engine])

  return {
    state: snapshot.state,
    skill: snapshot.skill,
    fields: snapshot.fields,
    errors: snapshot.errors,
    warnings: snapshot.warnings,
    allFieldSpecs: snapshot.allFieldSpecs,
    dispatching: snapshot.dispatching,
    preparing: snapshot.preparing,
    currentRoute: snapshot.currentRoute,
    activeAction,
    routeInput,
    selectSkill,
    canSelect,
    submitFields,
    submitText,
    dispatch,
    cancel,
    reset,
    setPageContext,
  }
}
