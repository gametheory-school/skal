import { useState, useRef, useEffect } from 'react'
import type {
  ActionState,
  FieldSpec,
  SkillDefinition,
} from '../../engine/types.js'
import { FieldRenderer } from './FieldRenderer.js'
import { Composer } from '../Composer.js'
import {
  ExecutingState,
  RunningState,
  CompletedState,
  FailedState,
  CancelledState,
  ScheduledState,
} from './CardStates.js'

// ─── Props ─────────────────────────────────────────────────────────

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

// ─── Component ─────────────────────────────────────────────────────

/**
 * Main card component driven by FieldSpec + ActionState.
 * Never branches on skill id — only on state.kind and FieldSpec.inputType.
 */
export function ActionCard(props: ActionCardProps) {
  const { state, skill } = props

  // Bug fix #1: form state survives re-renders.
  // Reinitialize only when skill.id changes.
  const [localFields, setLocalFields] = useState<Record<string, unknown>>(
    () => ({ ...props.currentFields }),
  )
  const lastSkillIdRef = useRef<string | null>(skill?.id ?? null)

  useEffect(() => {
    const currentSkillId = skill?.id ?? null
    if (currentSkillId !== lastSkillIdRef.current) {
      lastSkillIdRef.current = currentSkillId
      setLocalFields({ ...props.currentFields })
      setShowOptional(false)
      setMode('form')
      savedTextRef.current = ''
    }
  }, [skill?.id, props.currentFields])

  // Bug fix #3: preserve text across mode toggles.
  const savedTextRef = useRef('')
  const [mode, setMode] = useState<'form' | 'text'>('form')
  const [showOptional, setShowOptional] = useState(false)

  // ─── idle ──────────────────────────────────────────────────

  if (state.kind === 'idle') return null

  // ─── capturing / clarifying ────────────────────────────────

  if (state.kind === 'capturing' || state.kind === 'clarifying') {
    const handleSubmit = () => {
      props.onSubmit(localFields)
    }

    const handleSubmitText = (text: string) => {
      savedTextRef.current = ''
      props.onSubmitText(text)
    }

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {skill?.id ?? 'Action'}
          </h3>
          <div className="flex gap-1">
            <button
              onClick={() => setMode('form')}
              className={`rounded px-2 py-1 text-xs ${
                mode === 'form'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Fill fields
            </button>
            <button
              onClick={() => setMode('text')}
              className={`rounded px-2 py-1 text-xs ${
                mode === 'text'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Type freely
            </button>
          </div>
        </div>

        {mode === 'form' ? (
          <>
            {/* Required fields */}
            {props.requiredFields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={localFields[field.key]}
                onChange={(v) =>
                  setLocalFields((prev) => ({ ...prev, [field.key]: v }))
                }
                error={props.errors[field.key]}
                question={props.questions[field.key]}
              />
            ))}

            {/* Optional fields */}
            {props.optionalFields.length > 0 && (
              <>
                <button
                  onClick={() => setShowOptional(!showOptional)}
                  className="mb-2 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  {showOptional ? 'Hide options' : 'More options'}
                </button>
                {showOptional &&
                  props.optionalFields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      value={localFields[field.key]}
                      onChange={(v) =>
                        setLocalFields((prev) => ({
                          ...prev,
                          [field.key]: v,
                        }))
                      }
                      error={props.errors[field.key]}
                      question={props.questions[field.key]}
                    />
                  ))}
              </>
            )}

            <button
              onClick={handleSubmit}
              className="mt-2 w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Submit
            </button>
          </>
        ) : (
          <>
            <Composer
              onSubmitText={handleSubmitText}
              disabled={false}
              initialValue={savedTextRef.current}
            />
            <p className="mt-2 text-xs text-gray-400">
              Or switch to form mode to fill fields individually
            </p>
          </>
        )}
      </div>
    )
  }

  // ─── validated ─────────────────────────────────────────────

  if (state.kind === 'validated') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">
          {skill?.id ?? 'Action'}
        </h3>
        <div className="mb-3 rounded bg-green-50 px-3 py-2">
          <span className="text-xs font-medium text-green-700">
            Ready to execute
          </span>
        </div>
        <dl className="mb-3 space-y-1 text-sm">
          {Object.entries(state.fields).map(([key, value]) => (
            <div key={key} className="flex">
              <dt className="w-24 shrink-0 font-medium text-gray-500">
                {props.questions[key] ?? key}
              </dt>
              <dd className="text-gray-900">
                {Array.isArray(value)
                  ? value.join(', ')
                  : String(value ?? '')}
              </dd>
            </div>
          ))}
        </dl>
        <button
          onClick={props.onDispatch}
          className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Execute
        </button>
        {skill?.cancellable === false && (
          <p className="mt-1 text-center text-xs text-gray-400">
            This action cannot be stopped once started
          </p>
        )}
      </div>
    )
  }

  // ─── executing ─────────────────────────────────────────────

  if (state.kind === 'executing') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <ExecutingState />
      </div>
    )
  }

  // ─── running ───────────────────────────────────────────────

  if (state.kind === 'running') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <RunningState
          progress={state.progress}
          eta={state.eta}
          cancellable={skill?.cancellable ?? false}
          onCancel={props.onCancel}
        />
      </div>
    )
  }

  // ─── completed ─────────────────────────────────────────────

  if (state.kind === 'completed') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <CompletedState result={state.result} onReset={props.onReset} />
      </div>
    )
  }

  // ─── failed ────────────────────────────────────────────────

  if (state.kind === 'failed') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <FailedState
          error={state.error}
          retryable={state.retryable}
          onRetry={props.onDispatch}
          onDismiss={props.onReset}
        />
      </div>
    )
  }

  // ─── cancelled ─────────────────────────────────────────────

  if (state.kind === 'cancelled') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <CancelledState
          partialEffects={state.partialEffects}
          onDismiss={props.onReset}
        />
      </div>
    )
  }

  // ─── scheduled ─────────────────────────────────────────────

  if (state.kind === 'scheduled') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <ScheduledState trigger={state.trigger} onDismiss={props.onReset} />
      </div>
    )
  }

  return null
}
