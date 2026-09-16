import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ActionEngine } from '../../../src/ui/ActionEngine.js'
import { SkillRegistry } from '../../../src/engine/registry.js'
import type {
  SkillDefinition,
  ActorContext,
  PermissionGate,
  HandlerResult,
} from '../../../src/engine/types.js'
import { z } from 'zod'

// ─── Helpers ───────────────────────────────────────────────────────

function makeSkill(
  id: string,
  overrides?: Partial<SkillDefinition>,
): SkillDefinition {
  return {
    id,
    description: overrides?.description ?? `Skill ${id}`,
    fieldSchema: z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    }),
    questions: {
      title: 'What title?',
      content: 'What content?',
    },
    handler: async () => ({ type: 'instant', data: { ok: true } }),
    ...overrides,
  }
}

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  platformRole: 'user',
  orgRole: 'user',
}

function allowAll(): PermissionGate {
  return { can: async () => true }
}

function denyAll(): PermissionGate {
  return { can: async () => false }
}

function setup(
  skills: SkillDefinition[] = [],
  gate: PermissionGate = allowAll(),
) {
  const registry = new SkillRegistry()
  for (const s of skills) registry.register(s)
  const engine = new ActionEngine(registry, gate, actor)
  return { registry, engine }
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ActionEngine', () => {
  // ─── selectSkill ─────────────────────────────────────────────

  describe('selectSkill', () => {
    it('enters clarifying when no extracted fields', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])

      const result = await engine.selectSkill('journal.entry')

      expect(result).toBe(true)
      expect(engine.state.kind).toBe('clarifying')
    })

    it('enters validated when complete extracted fields', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry', {
        title: 'Test',
        content: 'Body',
      })

      expect(engine.state.kind).toBe('validated')
    })

    it('enters clarifying with partial extracted fields', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry', { title: 'Test' })

      expect(engine.state.kind).toBe('clarifying')
      expect(engine.getSnapshot().fields.title).toBe('Test')
    })

    it('returns false for unknown skill', async () => {
      const { engine } = setup([])
      const result = await engine.selectSkill('nonexistent')
      expect(result).toBe(false)
      expect(engine.state.kind).toBe('idle')
    })

    it('resets first when already active', async () => {
      const skillA = makeSkill('skill.a')
      const skillB = makeSkill('skill.b')
      const { engine } = setup([skillA, skillB])

      await engine.selectSkill('skill.a')
      expect(engine.state.kind).toBe('clarifying')

      await engine.selectSkill('skill.b')
      expect(engine.state.kind).toBe('clarifying')
      expect(engine.activeSkill?.id).toBe('skill.b')
    })
  })

  // ─── submitFields ────────────────────────────────────────────

  describe('submitFields', () => {
    it('transitions to validated with valid fields', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry')

      engine.submitFields({ title: 'Test', content: 'Body' })

      expect(engine.state.kind).toBe('validated')
    })

    it('stays in clarifying with partial fields', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry')

      engine.submitFields({ title: 'Test' })

      expect(engine.state.kind).toBe('clarifying')
    })

    it('merges fields across multiple submissions', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry')

      engine.submitFields({ title: 'Test' })
      engine.submitFields({ content: 'Body' })

      expect(engine.state.kind).toBe('validated')
      expect(engine.getSnapshot().fields.title).toBe('Test')
      expect(engine.getSnapshot().fields.content).toBe('Body')
    })

    it('returns false from validated state (double-submit guard)', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      const result = engine.submitFields({ title: 'Again' })

      expect(result).toBe(false)
    })

    it('returns false from idle state', () => {
      const { engine } = setup([])
      const result = engine.submitFields({ title: 'Test' })
      expect(result).toBe(false)
    })

    it('returns false when activeSkill is undefined (Bug fix #4)', async () => {
      const skill = makeSkill('journal.entry')
      const { engine, registry } = setup([skill])
      await engine.selectSkill('journal.entry')

      // Unregister the skill mid-flow.
      registry.unregister('journal.entry')

      const result = engine.submitFields({ title: 'Test', content: 'Body' })
      expect(result).toBe(false)
    })
  })

  // ─── submitText ──────────────────────────────────────────────

  describe('submitText', () => {
    it('extracts and merges extractable fields', async () => {
      const skill = makeSkill('invite.send', {
        fieldSchema: z.object({
          email: z.string().email(),
          name: z.string(),
        }),
        questions: { email: 'Email?', name: 'Name?' },
        fieldMeta: {
          email: { inputType: 'email', label: 'Email' },
          name: { inputType: 'text', label: 'Name' },
        },
      })
      const { engine } = setup([skill])
      await engine.selectSkill('invite.send')

      engine.submitText('send to john@example.com')

      expect(engine.getSnapshot().fields.email).toBe('john@example.com')
    })

    it('returns false when activeSkill is undefined (Bug fix #4)', async () => {
      const skill = makeSkill('journal.entry')
      const { engine, registry } = setup([skill])
      await engine.selectSkill('journal.entry')
      registry.unregister('journal.entry')

      const result = engine.submitText('some text')
      expect(result).toBe(false)
    })
  })

  // ─── dispatch ────────────────────────────────────────────────

  describe('dispatch', () => {
    it('calls handler and transitions to completed', async () => {
      const skill = makeSkill('journal.entry', {
        handler: async () => ({ type: 'instant', data: { id: '123' } }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      const result = await engine.dispatch()

      expect(result.type).toBe('instant')
      expect(engine.state.kind).toBe('completed')
    })

    it('transitions to failed on handler error', async () => {
      const skill = makeSkill('journal.entry', {
        handler: async (): Promise<HandlerResult> => ({
          type: 'error',
          message: 'Something went wrong',
          retryable: true,
        }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      const result = await engine.dispatch()

      expect(result.type).toBe('error')
      expect(engine.state.kind).toBe('failed')
    })

    it('returns error if not in validated state', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry')

      const result = await engine.dispatch()

      expect(result.type).toBe('error')
    })

    it('returns error when dispatching already in progress (Bug fix #7)', async () => {
      let resolveHandler: ((r: HandlerResult) => void) | undefined
      const skill = makeSkill('journal.entry', {
        handler: () =>
          new Promise<HandlerResult>((resolve) => {
            resolveHandler = resolve
          }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      const first = engine.dispatch()
      const second = await engine.dispatch()

      expect(second.type).toBe('error')
      if (second.type === 'error') {
        expect(second.message).toContain('already in progress')
      }

      // Resolve the first dispatch.
      resolveHandler!({ type: 'instant', data: {} })
      await first
    })

    it('discards result on reset during dispatch', async () => {
      let resolveHandler: ((r: HandlerResult) => void) | undefined
      const skill = makeSkill('journal.entry', {
        handler: () =>
          new Promise<HandlerResult>((resolve) => {
            resolveHandler = resolve
          }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      const dispatchPromise = engine.dispatch()
      // Yield to let the handler's Promise constructor execute.
      await new Promise((r) => setTimeout(r, 0))
      engine.reset() // Sets pendingReset.

      // Resolve handler.
      resolveHandler!({ type: 'instant', data: { ok: true } })
      const result = await dispatchPromise

      // Engine should be idle (result discarded).
      expect(engine.state.kind).toBe('idle')
      // But the result is still returned to the caller.
      expect(result.type).toBe('instant')
    })
  })

  // ─── cancel ──────────────────────────────────────────────────

  describe('cancel', () => {
    it('returns error when no active skill', async () => {
      const { engine } = setup([])
      const result = await engine.cancel()
      expect(result.cancelled).toBe(false)
    })
  })

  // ─── reset ───────────────────────────────────────────────────

  describe('reset', () => {
    it('returns to idle and clears state', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry')

      engine.reset()

      expect(engine.state.kind).toBe('idle')
      expect(engine.activeSkill).toBeUndefined()
      expect(engine.getSnapshot().fields).toEqual({})
      expect(engine.getSnapshot().errors).toEqual({})
    })

    it('sets pendingReset during dispatch (Bug fix #8)', async () => {
      let resolveHandler: ((r: HandlerResult) => void) | undefined
      const skill = makeSkill('journal.entry', {
        handler: () =>
          new Promise<HandlerResult>((resolve) => {
            resolveHandler = resolve
          }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      const dispatchPromise = engine.dispatch()
      // Yield to let the handler's Promise constructor execute.
      await new Promise((r) => setTimeout(r, 0))
      engine.reset() // Should set pendingReset.

      resolveHandler!({ type: 'instant', data: {} })
      await dispatchPromise

      expect(engine.state.kind).toBe('idle')
    })
  })

  // ─── routeInput ──────────────────────────────────────────────

  describe('routeInput', () => {
    it('routes to matched skill', async () => {
      const skill = makeSkill('journal.entry', {
        description: 'Create a new journal entry',
      })
      const { engine } = setup([skill])

      const result = await engine.routeInput('create a journal entry')

      expect(result).toBe(true)
      expect(engine.state.kind).toBe('clarifying')
    })

    it('returns false when no match', async () => {
      const skill = makeSkill('journal.entry', {
        description: 'Create a new journal entry',
      })
      const { engine } = setup([skill])

      const result = await engine.routeInput('xyzzy gibberish')

      expect(result).toBe(false)
      expect(engine.state.kind).toBe('idle')
    })

    it('returns false when router throws', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])

      // Force a throw by passing empty text (router returns null, not throws).
      const result = await engine.routeInput('')

      expect(result).toBe(false)
    })
  })

  // ─── activeAction ────────────────────────────────────────────

  describe('activeAction', () => {
    it('returns correct props shape', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          title: z.string(),
          tags: z.array(z.string()).optional(),
        }),
        questions: { title: 'Title?', tags: 'Tags?' },
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry')

      const props = engine.activeAction

      expect(props.state.kind).toBe('clarifying')
      expect(props.skill?.id).toBe('journal.entry')
      expect(props.requiredFields.length).toBe(1)
      expect(props.optionalFields.length).toBe(1)
      expect(props.questions.title).toBe('Title?')
      expect(typeof props.onSubmit).toBe('function')
      expect(typeof props.onSubmitText).toBe('function')
      expect(typeof props.onDispatch).toBe('function')
      expect(typeof props.onCancel).toBe('function')
      expect(typeof props.onReset).toBe('function')
    })
  })

  // ─── subscription ────────────────────────────────────────────

  describe('subscription', () => {
    it('notifies listeners on state change', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      const listener = vi.fn()

      engine.subscribe(listener)
      await engine.selectSkill('journal.entry')

      expect(listener).toHaveBeenCalled()
    })

    it('unsubscribes correctly', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill])
      const listener = vi.fn()

      const unsub = engine.subscribe(listener)
      unsub()
      await engine.selectSkill('journal.entry')

      expect(listener).not.toHaveBeenCalled()
    })
  })

  // ─── Full flow integration ───────────────────────────────────

  describe('full flow', () => {
    it('routeInput → submitFields → dispatch → completed', async () => {
      const skill = makeSkill('journal.entry', {
        description: 'Create a new journal entry',
        handler: async () => ({ type: 'instant', data: { id: '1' } }),
      })
      const { engine } = setup([skill])

      // Route.
      await engine.routeInput('create a journal entry')
      expect(engine.state.kind).toBe('clarifying')

      // Submit fields.
      engine.submitFields({ title: 'Meeting notes', content: 'API changes' })
      expect(engine.state.kind).toBe('validated')

      // Dispatch.
      const result = await engine.dispatch()
      expect(result.type).toBe('instant')
      expect(engine.state.kind).toBe('completed')
    })

    it('routeInput with extracted fields → fewer gaps', async () => {
      const skill = makeSkill('invite.send', {
        description: 'Send an invitation to someone',
        fieldSchema: z.object({
          email: z.string().email(),
          name: z.string(),
        }),
        questions: { email: 'Email?', name: 'Name?' },
        fieldMeta: {
          email: { inputType: 'email', label: 'Email' },
          name: { inputType: 'text', label: 'Name' },
        },
        handler: async () => ({ type: 'instant', data: {} }),
      })
      const { engine } = setup([skill])

      await engine.routeInput('send an invitation to john@example.com')

      // Email should be extracted, but name is still missing.
      expect(engine.getSnapshot().fields.email).toBe('john@example.com')
      expect(engine.state.kind).toBe('clarifying')

      // Submit the remaining field.
      engine.submitFields({ name: 'John' })
      expect(engine.state.kind).toBe('validated')
    })
  })

  // ─── prepare lifecycle hook ──────────────────────────────────

  describe('prepare', () => {
    it('calls prepare and uses resolved fieldMeta', async () => {
      const prepareFn = vi.fn().mockResolvedValue({
        title: { inputType: 'text', label: 'Title' },
        template_id: {
          inputType: 'choice',
          label: 'Template',
          options: [
            { value: 't1', label: 'Template 1' },
            { value: 't2', label: 'Template 2' },
          ],
        },
      })

      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          title: z.string(),
          template_id: z.string(),
        }),
        questions: { title: 'Title?', template_id: 'Template?' },
        fieldMeta: {
          title: { inputType: 'text', label: 'Title' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: prepareFn,
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      // prepare should have been called with actor and static fieldMeta.
      expect(prepareFn).toHaveBeenCalledWith(
        actor,
        skill.fieldMeta,
      )

      // The resolved fieldMeta should be used for field specs.
      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.inputType).toBe('choice')
      expect(templateSpec?.options).toHaveLength(2)
      expect(templateSpec?.options?.[0].value).toBe('t1')
    })

    it('transitions to failed state when prepare throws', async () => {
      const skill = makeSkill('journal.entry', {
        prepare: async () => {
          throw new Error('API fetch failed')
        },
      })
      const { engine } = setup([skill])

      const result = await engine.selectSkill('journal.entry')

      // Should return false and reset to idle.
      expect(result).toBe(false)
      expect(engine.state.kind).toBe('idle')
    })

    it('skips prepare if not defined', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          title: z.string(),
        }),
        questions: { title: 'Title?' },
        fieldMeta: {
          title: { inputType: 'text', label: 'Title' },
        },
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      // Should work normally without prepare.
      expect(engine.state.kind).toBe('clarifying')
      const specs = engine.getSnapshot().allFieldSpecs
      expect(specs).toHaveLength(1)
    })

    it('uses resolved fieldMeta in validation', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          title: z.string(),
          category: z.string(),
        }),
        questions: { title: 'Title?', category: 'Category?' },
        fieldMeta: {
          title: { inputType: 'text', label: 'Title' },
          category: { inputType: 'choice', label: 'Category' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          category: {
            ...meta.category,
            options: [{ value: 'work', label: 'Work' }],
          },
        }),
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      // Submit with a valid category value.
      engine.submitFields({ title: 'Test', category: 'work' })
      expect(engine.state.kind).toBe('validated')
    })
  })
})
