import type { ScheduleTrigger } from '../../engine/types.js'

// ─── ExecutingState ────────────────────────────────────────────────

export function ExecutingState() {
  return (
    <div className="flex items-center gap-2 py-4">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <span className="text-sm text-gray-600">Executing...</span>
    </div>
  )
}

// ─── RunningState ──────────────────────────────────────────────────

export interface RunningStateProps {
  progress?: number
  eta?: number
  cancellable: boolean
  onCancel: () => void
}

export function RunningState({ progress, eta, cancellable, onCancel }: RunningStateProps) {
  return (
    <div className="py-4">
      {progress != null && (
        <div className="mb-2">
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <span className="mt-1 text-xs text-gray-500">{Math.round(progress)}%</span>
        </div>
      )}
      {eta != null && (
        <p className="text-xs text-gray-500">Estimated: {eta}s remaining</p>
      )}
      {cancellable ? (
        <button
          onClick={onCancel}
          className="mt-2 text-sm text-red-600 hover:text-red-700"
        >
          Cancel
        </button>
      ) : (
        <p className="mt-2 text-xs text-gray-400">This action cannot be stopped once started.</p>
      )}
    </div>
  )
}

// ─── CompletedState ────────────────────────────────────────────────

export interface CompletedStateProps {
  result: unknown
  onReset: () => void
}

export function CompletedState({ result, onReset }: CompletedStateProps) {
  return (
    <div className="py-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Done
        </span>
      </div>
      <pre className="max-h-48 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-700">
        {JSON.stringify(result, null, 2)}
      </pre>
      <button
        onClick={onReset}
        className="mt-3 w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Done
      </button>
    </div>
  )
}

// ─── FailedState ───────────────────────────────────────────────────

export interface FailedStateProps {
  error: string
  retryable: boolean
  onRetry: () => void
  onDismiss: () => void
}

export function FailedState({ error, retryable, onRetry, onDismiss }: FailedStateProps) {
  return (
    <div className="py-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Failed
        </span>
        {retryable && (
          <span className="text-xs text-gray-500">Retryable</span>
        )}
      </div>
      <p className="text-sm text-red-600">{error}</p>
      <div className="mt-3 flex gap-2">
        {retryable && (
          <button
            onClick={onRetry}
            className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        )}
        <button
          onClick={onDismiss}
          className="flex-1 rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── CancelledState ────────────────────────────────────────────────

export interface CancelledStateProps {
  partialEffects?: string
  onDismiss: () => void
}

export function CancelledState({ partialEffects, onDismiss }: CancelledStateProps) {
  return (
    <div className="py-4">
      <p className="text-sm text-gray-600">Action cancelled.</p>
      {partialEffects && (
        <p className="mt-1 text-xs text-gray-500">Partial effects: {partialEffects}</p>
      )}
      <button
        onClick={onDismiss}
        className="mt-3 w-full rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Dismiss
      </button>
    </div>
  )
}

// ─── ScheduledState ────────────────────────────────────────────────

export interface ScheduledStateProps {
  trigger: ScheduleTrigger
  onDismiss: () => void
}

export function ScheduledState({ trigger, onDismiss }: ScheduledStateProps) {
  return (
    <div className="py-4">
      <p className="text-sm text-gray-600">
        {trigger.type === 'once'
          ? `Scheduled for ${new Date(trigger.at).toLocaleString()}`
          : `Recurring: ${trigger.cron} (${trigger.timezone})`}
      </p>
      <button
        onClick={onDismiss}
        className="mt-3 w-full rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Dismiss
      </button>
    </div>
  )
}
