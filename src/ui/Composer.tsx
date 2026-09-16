import { useState } from 'react'

export interface ComposerProps {
  onSubmitText: (text: string) => void
  disabled: boolean
  placeholder?: string
  /** Initial value for the textarea (for preserving text across mode toggles). */
  initialValue?: string
}

/**
 * Free-text input for the Composer text mode.
 * Tailwind-only, functional HTML.
 */
export function Composer({
  onSubmitText,
  disabled,
  placeholder = 'Describe what you\'d like to do...',
  initialValue = '',
}: ComposerProps) {
  const [text, setText] = useState(initialValue)

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSubmitText(trimmed)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        rows={2}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        className="self-end rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        Send
      </button>
    </div>
  )
}
