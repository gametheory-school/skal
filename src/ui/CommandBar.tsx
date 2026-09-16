import { useState } from 'react'

export interface CommandBarProps {
  onRoute: (text: string) => Promise<boolean>
  disabled: boolean
  placeholder?: string
}

/**
 * Single "do anything" input — the entry point for the conversational shell.
 * Bug fix #2: submit button disabled while classifying.
 */
export function CommandBar({
  onRoute,
  disabled,
  placeholder = 'What would you like to do?',
}: CommandBarProps) {
  const [text, setText] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || disabled || classifying) return

    setClassifying(true)
    setErrorMessage(null)

    try {
      const success = await onRoute(trimmed)
      if (!success) {
        setErrorMessage("I didn't understand that. Try rephrasing?")
      } else {
        setText('')
      }
    } catch {
      setErrorMessage("Something went wrong. Please try again.")
    } finally {
      setClassifying(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setErrorMessage(null)
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || classifying}
          placeholder={placeholder}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || classifying || !text.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {classifying ? (
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
              ...
            </span>
          ) : (
            'Send'
          )}
        </button>
      </div>
      {errorMessage && (
        <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
      )}
    </div>
  )
}
