import type { FieldSpec } from '../../engine/types.js'

export interface FieldRendererProps {
  field: FieldSpec
  value: unknown
  onChange: (value: unknown) => void
  onBlur?: () => void
  error?: string
  question?: string
}

/**
 * Renders a single form field based on its inputType.
 * Tailwind-only, functional HTML — no design tokens.
 */
export function FieldRenderer({
  field,
  value,
  onChange,
  onBlur,
  error,
  question,
}: FieldRendererProps) {
  const id = `field-${field.key}`

  return (
    <div className="mb-3">
      {question && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {question}
        </label>
      )}

      {renderInput(field, value, onChange, onBlur, id, error)}

      {error && (
        <p
          id={`${id}-error`}
          className="mt-1 inline-block rounded bg-red-50 px-2 py-0.5 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function renderInput(
  field: FieldSpec,
  value: unknown,
  onChange: (value: unknown) => void,
  onBlur: (() => void) | undefined,
  id: string,
  error?: string,
) {
  const strValue = value != null ? String(value) : ''

  const className = `w-full rounded border ${
    error
      ? 'border-red-400 focus:border-red-500'
      : 'border-gray-300 focus:border-indigo-500'
  } px-3 py-2 text-sm focus:outline-none`
  const ariaProps = {
    'aria-describedby': error ? `${id}-error` : undefined,
    'aria-invalid': error ? true : undefined,
  }

  switch (field.inputType) {
    case 'text':
      if (field.multiline) {
        return (
          <textarea
            id={id}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={className}
            rows={3}
            {...ariaProps}
          />
        )
      }
      return (
        <input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={className}
          {...ariaProps}
        />
      )

    case 'email':
      return (
        <input
          id={id}
          type="email"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={className}
          {...ariaProps}
        />
      )

    case 'datetime':
      return (
        <input
          id={id}
          type="datetime-local"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          {...ariaProps}
        />
      )

    case 'contact':
      return (
        <input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={className}
          {...ariaProps}
        />
      )

    case 'choice':
      return (
        <select
          id={id}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          {...ariaProps}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    default:
      return (
        <input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={className}
          {...ariaProps}
        />
      )
  }
}
