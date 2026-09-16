import type { z } from 'zod'
import type { FieldSpec, FieldMetaInput } from '../engine/types.js'

/**
 * Validate fields against a Zod schema and produce FieldSpecs
 * for any missing/invalid fields.
 */

export interface ValidationResult {
  /** Whether all required fields are present and valid. */
  valid: boolean
  /** Fields that are missing or invalid, with their FieldSpecs for clarification. */
  missingFields: FieldSpec[]
  /** The validated (parsed) data, if valid. */
  data?: Record<string, unknown>
  /** Field-level error messages. */
  errors: Record<string, string>
}

/**
 * Validate a set of fields against a Zod schema.
 * Returns validation result with FieldSpecs for missing fields.
 */
export function validateFields(
  schema: z.ZodSchema,
  fields: Record<string, unknown>,
  questions: Record<string, string>,
  fieldMeta?: Record<string, FieldMetaInput>,
): ValidationResult {
  const result = schema.safeParse(fields)

  if (result.success) {
    return {
      valid: true,
      missingFields: [],
      data: result.data as Record<string, unknown>,
      errors: {},
    }
  }

  const errors: Record<string, string> = {}
  const missingFields: FieldSpec[] = []
  const seen = new Set<string>()

  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    if (seen.has(path)) continue
    seen.add(path)

    errors[path] = issue.message

    const meta = fieldMeta?.[path]
    missingFields.push({
      key: path,
      label: meta?.label ?? path,
      inputType: meta?.inputType ?? 'text',
      required: fields[path] === undefined,
      multiline: meta?.multiline,
      options: meta?.options,
      currentValue: fields[path],
    })
  }

  return { valid: false, missingFields, errors }
}

/**
 * Build FieldSpecs from a Zod schema + questions map.
 * Used to generate the clarification card fields.
 */
export function buildFieldSpecs(
  schema: z.ZodSchema,
  questions: Record<string, string>,
  fieldMeta?: Record<string, FieldMetaInput>,
): FieldSpec[] {
  // Zod schemas expose their shape via _def for object schemas.
  // We use a safe introspection approach.
  const shape = getSchemaShape(schema)
  if (!shape) return []

  const specs: FieldSpec[] = []
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = fieldMeta?.[key]
    const isOptional = isFieldOptional(fieldSchema as z.ZodType)

    specs.push({
      key,
      label: meta?.label ?? key,
      inputType: meta?.inputType ?? 'text',
      required: !isOptional,
      multiline: meta?.multiline,
      options: meta?.options,
    })
  }

  return specs
}

/**
 * Get the shape of a Zod object schema.
 * Returns null if the schema is not an object schema.
 */
function getSchemaShape(schema: z.ZodSchema): Record<string, unknown> | null {
  const def = (schema as z.ZodType)._def as unknown as Record<string, unknown>
  // Zod v4: shape is a plain object on _def.shape
  if (def.shape && typeof def.shape === 'object') {
    return def.shape as Record<string, unknown>
  }
  // Zod v3 compat: shape may be a function
  if (typeof def.shape === 'function') {
    return (def.shape as () => Record<string, unknown>)()
  }
  return null
}

/**
 * Check if a Zod field schema is optional.
 */
function isFieldOptional(schema: z.ZodType): boolean {
  // Walk the schema chain to check for optional/nullable wrappers.
  let current: z.ZodType = schema
  while (current) {
    const def = current._def as unknown as Record<string, unknown>
    // Zod v4: type field (e.g. 'optional', 'default')
    const type = def.type as string | undefined
    if (type === 'optional' || type === 'default') return true
    // Zod v3 compat: typeName field (e.g. 'ZodOptional', 'ZodDefault')
    const typeName = def.typeName as string | undefined
    if (typeName === 'ZodOptional' || typeName === 'ZodDefault') return true
    if (type === 'effect' || typeName === 'ZodEffects') {
      current = (def.schema ?? def.innerType) as z.ZodType
      continue
    }
    break
  }
  return false
}
