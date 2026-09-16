import type { FieldSpec } from '../../engine/types.js'

export interface FieldRendererProps {
  field: FieldSpec
  value: unknown
  onChange: (value: unknown) => void
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

      {renderInput(field, value, onChange, id)}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function renderInput(
  field: FieldSpec,
  value: unknown,
  onChange: (value: unknown) => void,
  id: string,
) {
  const strValue = value != null ? String(value) : ''

  switch (field.inputType) {
    case 'text':
      if (field.multiline) {
        return (
          <textarea
            id={id}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            rows={3}
          />
        )
      }
      return (
        <input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )

    case 'email':
      return (
        <input
          id={id}
          type="email"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )

    case 'datetime':
      return (
        <input
          id={id}
          type="datetime-local"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )

    case 'contact':
      return (
        <input
          id={id}
          type="text"
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )

    case 'choice':
      return (
        <select
          id={id}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )
  }
}
