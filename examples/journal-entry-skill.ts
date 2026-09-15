import { z } from 'zod'
import type { SkillDefinition, ActorContext, HandlerResult } from '../src/engine/types.js'

const journalEntrySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
})

export const journalEntrySkill: SkillDefinition = {
  id: 'journal.entry',
  fieldSchema: journalEntrySchema,
  questions: {
    title: "What's the title?",
    content: 'What would you like to capture?',
    tags: 'Any tags? (comma-separated)',
  },
  requiredRole: 'user',
  cancellable: false,
  handler: async (fields, context): Promise<HandlerResult> => {
    // Consumer provides the actual implementation.
    // This stub validates the contract shape.
    return { type: 'instant', data: { id: crypto.randomUUID(), ...fields } }
  },
}
