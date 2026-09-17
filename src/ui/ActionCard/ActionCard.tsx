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
  warnings?: Record<string, string>
  currentFields: Record<string, unknown>
  onSubmit: (fields: Record<string, unknown>) => void
  onSubmitText: (text: string) => void
  onDispatch: () => void
  onCancel: () => void
  onReset: () => void
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Resolve a validated field value for display. Choice fields render
 * the matching option's label instead of the raw stored value.
 */
export function formatFieldValue(
  value: unknown,
  options?: Array<{ value: string; label: string }>,
): string {
  const label = (v: unknown) =>
    options?.find((o) => o.value === v)?.label ?? String(v ?? '')
  return Array.isArray(value) ? value.map(label).join(', ') : label(value)
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
      setSubmitted(false)
      savedTextRef.current = ''
    }
  }, [skill?.id, props.currentFields])

  // Bug fix #3: preserve text across mode toggles.
  const savedTextRef = useRef('')
  const [mode, setMode] = useState<'form' | 'text'>('form')
  const [showOptional, setShowOptional] = useState(false)
  // Issue 2: gate error display on first submit attempt.
  const [submitted, setSubmitted] = useState(false)

  // ─── idle ──────────────────────────────────────────────────

  if (state.kind === 'idle') return null

  // ─── capturing / clarifying ────────────────────────────────

  if (state.kind === 'capturing' || state.kind === 'clarifying') {
    // Separate auto-resolved fields from interactive fields.
    const interactiveRequired = props.requiredFields.filter((f) => !f.autoResolved)
    const autoResolvedRequired = props.requiredFields.filter((f) => f.autoResolved)
    const interactiveOptional = props.optionalFields.filter((f) => !f.autoResolved)
    const autoResolvedOptional = props.optionalFields.filter((f) => f.autoResolved)
    const autoResolvedFields = [...autoResolvedRequired, ...autoResolvedOptional]

    const handleSubmit = () => {
      setSubmitted(true)
      props.onSubmit(localFields)
    }

    const handleSubmitText = (text: string) => {
      setSubmitted(true)
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

        {(() => {
          const warningEntries = Object.entries(props.warnings ?? {}).filter(([key]) => {
            const field = [...props.requiredFields, ...props.optionalFields].find((spec) => spec.key === key)
            return !field?.options?.some((option) => option.value === localFields[key])
          })
          if (warningEntries.length === 0) return null
          
          const labels = warningEntries.map(([key]) => {
            const field = [...props.requiredFields, ...props.optionalFields].find((spec) => spec.key === key)
            return field?.label ?? key
          })
          const firstMessage = warningEntries[0][1]
          const unmatchedText = firstMessage.match(/No match for "(.+?)" in/)?.[1] ?? ''
          
          return (
            <p role="status" className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No match for &quot;{unmatchedText}&quot; in {labels.join(', ')}. Please choose an option manually.
            </p>
          )
        })()}

        {mode === 'form' ? (
          <>
            {/* Auto-resolved fields: read-only confirmation */}
            {autoResolvedFields.length > 0 && (
              <div className="mb-3 rounded bg-blue-50 px-3 py-2">
                {autoResolvedFields.map((field) => {
                  const optionLabel = field.options?.find(
                    (o) => o.value === (localFields[field.key] ?? field.currentValue),
                  )?.label
                  return (
                    <div key={field.key} className="flex text-xs">
                      <span className="font-medium text-blue-700">{field.label}:</span>
                      <span className="ml-1 text-blue-600">{optionLabel ?? '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Required fields */}
            {interactiveRequired.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={localFields[field.key]}
                onChange={(v) =>
                  setLocalFields((prev) => ({ ...prev, [field.key]: v }))
                }
                error={submitted ? props.errors[field.key] : undefined}
                question={props.questions[field.key]}
              />
            ))}

            {/* Optional fields */}
            {interactiveOptional.length > 0 && (
              <>
                <button
                  onClick={() => setShowOptional(!showOptional)}
                  className="mb-2 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  {showOptional ? 'Hide options' : 'More options'}
                </button>
                {showOptional &&
                  interactiveOptional.map((field) => (
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
                      error={submitted ? props.errors[field.key] : undefined}
                      question={props.questions[field.key]}
                    />
                  ))}
              </>
            )}

            <div className="mt-2 flex gap-2">
              <button
                onClick={props.onReset}
                className="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Submit
              </button>
            </div>
          </>
        ) : (
          <>
            <Composer
              onSubmitText={handleSubmitText}
              disabled={false}
              initialValue={savedTextRef.current}
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={props.onReset}
                className="rounded px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <p className="text-xs text-gray-400">
                Or switch to form mode to fill fields individually
              </p>
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── validated ─────────────────────────────────────────────

  if (state.kind === 'validated') {
    const specOptions = new Map(
      [...props.requiredFields, ...props.optionalFields].map((spec) => [
        spec.key,
        spec.options,
      ]),
    )
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
                {formatFieldValue(value, specOptions.get(key))}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 flex gap-2">
          <button
            onClick={props.onReset}
            className="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={props.onDispatch}
            className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Execute
          </button>
        </div>
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
        <CompletedState result={state.result} message={state.message} onReset={props.onReset} />
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
