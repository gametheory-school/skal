import { z } from 'zod'
import type { SkillDefinition, ActorContext, HandlerResult, FieldMetaInput } from '../src/engine/types.js'

const journalEntrySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  template_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const journalEntrySkill: SkillDefinition = {
  id: 'journal.entry',
  description: 'Create a new journal entry with a title, content, and optional tags',
  fieldSchema: journalEntrySchema,
  questions: {
    title: "What's the title?",
    content: 'What would you like to capture?',
    template_id: 'Which template?',
    tags: 'Any tags? (comma-separated)',
  },
  fieldMeta: {
    title: { inputType: 'text', label: 'Title' },
    content: { inputType: 'text', label: 'Entry', multiline: true },
    template_id: { inputType: 'choice', label: 'Template' },
    tags: { inputType: 'text', label: 'Tags' },
  },
  /**
   * Optional pre-flight hook.
   * Fetches available journal templates from the API and populates
   * the template_id choice options dynamically.
   */
  prepare: async (_actor: ActorContext, fieldMeta: Record<string, FieldMetaInput>) => {
    try {
      const res = await fetch('/api/journal/templates')
      const templates = await res.json()
      return {
        ...fieldMeta,
        template_id: {
          ...fieldMeta.template_id,
          options: templates.map((t: { id: string; name: string }) => ({
            value: t.id,
            label: t.name,
          })),
        },
      }
    } catch {
      // If fetch fails, return fieldMeta unchanged (no options).
      return fieldMeta
    }
  },
  requiredRole: 'user',
  cancellable: false,
  handler: async (fields, context): Promise<HandlerResult> => {
    // Consumer provides the actual implementation.
    // This stub validates the contract shape.
    return { type: 'instant', data: { id: crypto.randomUUID(), ...fields } }
  },
}
