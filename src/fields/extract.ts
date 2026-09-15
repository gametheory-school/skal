import type { FieldSpec, InputType } from '../engine/types.js'

/**
 * Deterministic field extractors.
 *
 * Non-negotiable: field extraction always tries regex/parsing first
 * and only falls back to an LLM when deterministic extraction can't
 * fill all required fields. Keeps cost and latency down.
 */

// ─── Extraction result ────────────────────────────────────────────

export interface ExtractionResult {
  /** Fields that were successfully extracted. */
  extracted: Record<string, unknown>
  /** Fields that couldn't be extracted deterministically. */
  missing: string[]
}

// ─── Deterministic extractors by input type ───────────────────────

// Matches an email anywhere in the text (no anchors).
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

// Matches an ISO date/datetime anywhere in the text (no anchors).
const ISO_DATE_REGEX =
  /\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/

/**
 * Try to extract a field value from free-form text using deterministic
 * methods (regex, parsing) based on the field's inputType.
 *
 * Returns the extracted value, or undefined if deterministic extraction fails.
 */
export function extractDeterministic(
  text: string,
  field: FieldSpec,
): unknown | undefined {
  switch (field.inputType) {
    case 'email':
      return extractEmail(text)
    case 'datetime':
      return extractDatetime(text)
    case 'choice':
      return extractChoice(text, field)
    case 'text':
    case 'contact':
    default:
      return undefined
  }
}

function extractEmail(text: string): string | undefined {
  const match = text.match(EMAIL_REGEX)
  return match ? match[0] : undefined
}

function extractDatetime(text: string): string | undefined {
  // Try to find an ISO date/datetime in the text.
  const match = text.match(ISO_DATE_REGEX)
  if (match) return match[0]

  // Try common natural date formats.
  const naturalDate = parseNaturalDate(text)
  return naturalDate ?? undefined
}

function parseNaturalDate(text: string): string | null {
  // Try "tomorrow", "today", "next monday" etc. — consumer provides
  // the LLM fallback for complex natural language dates.
  // Here we just try Date.parse for anything that looks like a date.
  const trimmed = text.trim()
  const parsed = Date.parse(trimmed)
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString()
  }
  return null
}

function extractChoice(
  text: string,
  field: FieldSpec,
): string | undefined {
  if (!field.options) return undefined
  const lower = text.toLowerCase()
  const match = field.options.find(
    (opt) =>
      lower.includes(opt.value.toLowerCase()) ||
      lower.includes(opt.label.toLowerCase()),
  )
  return match?.value
}

// ─── Batch extraction ─────────────────────────────────────────────

/**
 * Extract fields from free-form text using deterministic methods.
 * Returns extracted values and a list of fields that couldn't be filled.
 */
export function extractFields(
  text: string,
  fields: FieldSpec[],
): ExtractionResult {
  const extracted: Record<string, unknown> = {}
  const missing: string[] = []

  for (const field of fields) {
    const value = extractDeterministic(text, field)
    if (value !== undefined) {
      extracted[field.key] = value
    } else {
      missing.push(field.key)
    }
  }

  return { extracted, missing }
}

// ─── LLM fallback interface ───────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Consumer-provided LLM transport for extraction fallback.
 * The framework never calls an LLM directly — the consumer wires this.
 */
export interface ExtractionLLM {
  complete(messages: ChatMessage[]): Promise<string>
}

/**
 * Extract fields with LLM fallback for fields that deterministic
 * extraction couldn't fill.
 */
export async function extractFieldsWithLLM(
  text: string,
  fields: FieldSpec[],
  llm: ExtractionLLM,
): Promise<ExtractionResult> {
  // First pass: deterministic extraction.
  const deterministic = extractFields(text, fields)

  // If everything was extracted, no need for LLM.
  if (deterministic.missing.length === 0) {
    return deterministic
  }

  // Second pass: ask LLM for the missing fields.
  const missingFields = fields.filter((f) =>
    deterministic.missing.includes(f.key),
  )

  try {
    const prompt = buildExtractionPrompt(text, missingFields)
    const response = await llm.complete([
      { role: 'system', content: 'You extract structured field values from text. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ])

    const parsed = JSON.parse(response) as Record<string, unknown>

    // Merge LLM results with deterministic results.
    const merged = { ...deterministic.extracted }
    const stillMissing: string[] = []

    for (const field of missingFields) {
      if (parsed[field.key] !== undefined && parsed[field.key] !== null && parsed[field.key] !== '') {
        merged[field.key] = parsed[field.key]
      } else {
        stillMissing.push(field.key)
      }
    }

    return { extracted: merged, missing: stillMissing }
  } catch {
    // LLM failed — return what we have from deterministic extraction.
    return deterministic
  }
}

function buildExtractionPrompt(text: string, fields: FieldSpec[]): string {
  const fieldDescriptions = fields
    .map((f) => {
      const parts = [`- "${f.key}" (${f.inputType})`]
      if (f.options) {
        parts.push(`  options: ${f.options.map((o) => o.value).join(', ')}`)
      }
      return parts.join('\n')
    })
    .join('\n')

  return `Extract the following fields from this text and respond with JSON only:

Fields:
${fieldDescriptions}

Text: "${text}"`
}
