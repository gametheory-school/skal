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

  // ─── permission gating ───────────────────────────────────────

  describe('permission gating', () => {
    it('enters failed state when selectSkill is denied', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill], denyAll())

      const result = await engine.selectSkill('journal.entry')

      expect(result).toBe(false)
      expect(engine.state.kind).toBe('failed')
      if (engine.state.kind === 'failed') {
        expect(engine.state.error).toBe(
          'Permission denied: u1 cannot execute "journal.entry"',
        )
        expect(engine.state.retryable).toBe(false)
      }
      expect(engine.activeSkill?.id).toBe('journal.entry')
    })

    it('does not call prepare when denied', async () => {
      const prepareFn = vi.fn()
      const skill = makeSkill('journal.entry', { prepare: prepareFn })
      const { engine } = setup([skill], denyAll())

      await engine.selectSkill('journal.entry')

      expect(prepareFn).not.toHaveBeenCalled()
    })

    it('can select a different skill after a denial', async () => {
      const gate: PermissionGate = {
        can: async (_actor, actionId) => actionId !== 'skill.a',
      }
      const skillA = makeSkill('skill.a')
      const skillB = makeSkill('skill.b')
      const { engine } = setup([skillA, skillB], gate)

      await engine.selectSkill('skill.a')
      expect(engine.state.kind).toBe('failed')

      const result = await engine.selectSkill('skill.b')

      expect(result).toBe(true)
      expect(engine.state.kind).toBe('clarifying')
    })

    it('reset returns to idle after a denial', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill], denyAll())

      await engine.selectSkill('journal.entry')
      engine.reset()

      expect(engine.state.kind).toBe('idle')
      expect(engine.activeSkill).toBeUndefined()
    })

    it('routeInput lands in failed when the routed skill is denied', async () => {
      const skill = makeSkill('journal.entry', {
        description: 'Create a new journal entry',
      })
      const { engine } = setup([skill], denyAll())

      const result = await engine.routeInput('create a journal entry')

      expect(result).toBe(false)
      expect(engine.state.kind).toBe('failed')
    })
  })

  // ─── canSelect ───────────────────────────────────────────────

  describe('canSelect', () => {
    it('returns true when the gate allows', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill], allowAll())

      expect(await engine.canSelect('journal.entry')).toBe(true)
    })

    it('returns false when the gate denies', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill], denyAll())

      expect(await engine.canSelect('journal.entry')).toBe(false)
    })

    it('returns false for unknown skill', async () => {
      const { engine } = setup([], allowAll())

      expect(await engine.canSelect('nonexistent')).toBe(false)
    })

    it('does not transition state', async () => {
      const skill = makeSkill('journal.entry')
      const { engine } = setup([skill], denyAll())

      await engine.canSelect('journal.entry')

      expect(engine.state.kind).toBe('idle')
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

  // ─── Issue 1: HandlerResult message ────────────────────────────

  describe('handler result message', () => {
    it('carries message into completed state', async () => {
      const skill = makeSkill('journal.entry', {
        handler: async () => ({
          type: 'instant',
          data: { id: '123' },
          message: 'Entry saved successfully',
        }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      await engine.dispatch()

      expect(engine.state.kind).toBe('completed')
      if (engine.state.kind === 'completed') {
        expect(engine.state.message).toBe('Entry saved successfully')
        expect(engine.state.result).toEqual({ id: '123' })
      }
    })

    it('completed state has undefined message when not provided', async () => {
      const skill = makeSkill('journal.entry', {
        handler: async () => ({
          type: 'instant',
          data: { id: '123' },
        }),
      })
      const { engine } = setup([skill])
      await engine.selectSkill('journal.entry', { title: 'T', content: 'C' })

      await engine.dispatch()

      expect(engine.state.kind).toBe('completed')
      if (engine.state.kind === 'completed') {
        expect(engine.state.message).toBeUndefined()
      }
    })
  })

  describe('unmatched choice warnings', () => {
    const options = [
      { value: 'u-clara', label: 'Clara Chen' },
      { value: 'u-miguel', label: 'Miguel Torres' },
    ]
    const nudge = (overrides?: Partial<SkillDefinition>) => makeSkill('coach.nudge', {
      description: 'Nudge a coachee',
      fieldSchema: z.object({ coachee: z.string().min(1), message: z.string().min(1) }),
      questions: { coachee: 'Which coachee?', message: 'What message?' },
      fieldMeta: { coachee: { inputType: 'choice', label: 'Coachee', options } },
      ...overrides,
    })

    it('opens the form with a warning for an unknown name', async () => {
      const { engine } = setup([nudge()])
      expect(await engine.routeInput('nudge tuvalu')).toBe(true)
      expect(engine.state.kind).toBe('clarifying')
      expect(engine.getSnapshot().fields.coachee).toBeUndefined()
      expect(engine.getSnapshot().warnings.coachee).toBe(
        'No match for "tuvalu" in Coachee. Please choose an option manually.',
      )
      expect(engine.activeAction.warnings).toEqual(engine.getSnapshot().warnings)
    })

    it.each(['nudge clara', 'nudge clara.chen', 'nudge Clara Chen'])('preserves matching for %s without warnings', async (input) => {
      const { engine } = setup([nudge()])
      expect(await engine.routeInput(input)).toBe(true)
      expect(engine.getSnapshot().fields.coachee).toBe('u-clara')
      expect(engine.getSnapshot().warnings).toEqual({})
    })

    it('does not warn for direct selection or intent-only input', async () => {
      const { engine } = setup([nudge()])
      await engine.selectSkill('coach.nudge')
      expect(engine.getSnapshot().warnings).toEqual({})
      await engine.routeInput('nudge a coachee')
      expect(engine.getSnapshot().warnings).toEqual({})
      engine.submitText('   !!!   ')
      expect(engine.getSnapshot().warnings).toEqual({})
    })

    it('warns only after prepare resolves and uses its options', async () => {
      let finishPrepare!: (meta: NonNullable<SkillDefinition['fieldMeta']>) => void
      const skill = nudge({
        fieldMeta: { coachee: { inputType: 'choice', label: 'Coachee' } },
        prepare: () => new Promise((resolve) => { finishPrepare = resolve }),
      })
      const { engine } = setup([skill])
      const routing = engine.routeInput('nudge tuvalu')
      await vi.waitFor(() => expect(engine.getSnapshot().preparing).toBe(true))
      expect(engine.getSnapshot().warnings).toEqual({})
      finishPrepare({ coachee: { inputType: 'choice', label: 'Coachee', options } })
      await routing
      expect(engine.getSnapshot().warnings.coachee).toContain('tuvalu')
    })

    it('does not retain a static option removed by prepare', async () => {
      const { engine } = setup([nudge({
        prepare: async () => ({
          coachee: { inputType: 'choice', label: 'Coachee', options: options.slice(1) },
        }),
      })])
      await engine.routeInput('nudge clara')
      expect(engine.getSnapshot().fields.coachee).toBeUndefined()
      expect(engine.getSnapshot().warnings.coachee).toContain('clara')
      expect(engine.getSnapshot().allFieldSpecs[0].autoResolved).not.toBe(true)
    })

    it('does not substitute a single option for an unmatched name', async () => {
      const { engine } = setup([nudge({
        fieldMeta: { coachee: { inputType: 'choice', label: 'Coachee', options: options.slice(0, 1) } },
      })])
      await engine.routeInput('nudge tuvalu')
      expect(engine.getSnapshot().fields.coachee).toBeUndefined()
      expect(engine.getSnapshot().allFieldSpecs[0].autoResolved).not.toBe(true)
      expect(engine.getSnapshot().warnings.coachee).toContain('tuvalu')
      await engine.routeInput('nudge a coachee')
      expect(engine.getSnapshot().fields.coachee).toBe('u-clara')
      expect(engine.getSnapshot().allFieldSpecs[0].autoResolved).toBe(true)
    })

    it('keeps empty-option choices as text without a no-match warning', async () => {
      const { engine } = setup([nudge({
        prepare: async () => ({ coachee: { inputType: 'choice', label: 'Coachee', options: [] } }),
      })])
      await engine.routeInput('nudge tuvalu')
      expect(engine.getSnapshot().allFieldSpecs[0].inputType).toBe('text')
      expect(engine.getSnapshot().warnings).toEqual({})
    })

    it('clears warnings on submission even when other fields are missing', async () => {
      const { engine } = setup([nudge()])
      await engine.routeInput('nudge tuvalu')
      engine.submitFields({})
      expect(engine.getSnapshot().warnings).toEqual({})
      expect(engine.state.kind).toBe('clarifying')
      engine.submitFields({ coachee: 'u-clara', message: 'Hello' })
      expect(engine.state.kind).toBe('validated')
      expect((await engine.dispatch()).type).toBe('instant')
    })

    it('supports warnings and recovery in text mode', async () => {
      const { engine } = setup([nudge()])
      await engine.selectSkill('coach.nudge')
      engine.submitText('tuvalu')
      expect(engine.getSnapshot().warnings.coachee).toContain('tuvalu')
      engine.submitText('clara')
      expect(engine.getSnapshot().warnings).toEqual({})
      expect(engine.getSnapshot().fields.coachee).toBe('u-clara')
    })

    it('clears warnings on reset and direct selection without reusing old input', async () => {
      const { engine } = setup([nudge()])
      await engine.routeInput('nudge tuvalu')
      engine.reset()
      expect(engine.getSnapshot().warnings).toEqual({})
      await engine.routeInput('nudge tuvalu')
      await engine.selectSkill('coach.nudge')
      expect(engine.getSnapshot().warnings).toEqual({})
      await engine.routeInput('unmatched tuvalu')
      await engine.selectSkill('coach.nudge')
      expect(engine.getSnapshot().warnings).toEqual({})
    })

    it('preserves current input when routing replaces an active form', async () => {
      const { engine } = setup([nudge()])
      await engine.routeInput('nudge clara')
      await engine.routeInput('nudge tuvalu')
      expect(engine.getSnapshot().fields.coachee).toBeUndefined()
      expect(engine.getSnapshot().warnings.coachee).toContain('tuvalu')
      await engine.routeInput('nudge miguel')
      expect(engine.getSnapshot().fields.coachee).toBe('u-miguel')
      expect(engine.getSnapshot().warnings).toEqual({})
    })

    it('does not warn for another missing choice when input only names a matched choice', async () => {
      const { engine } = setup([nudge({
        fieldSchema: z.object({ coachee: z.string(), category: z.string() }),
        questions: { coachee: 'Which coachee?', category: 'Which category?' },
        fieldMeta: {
          coachee: { inputType: 'choice', label: 'Coachee', options },
          category: { inputType: 'choice', label: 'Category', options: [
            { value: 'feedback', label: 'Feedback' }, { value: 'reminder', label: 'Reminder' },
          ] },
        },
      })])
      await engine.routeInput('nudge clara')
      expect(engine.getSnapshot().warnings).toEqual({})
      expect(engine.getSnapshot().fields.category).toBeUndefined()
    })

    it('lets users resolve or skip an unmatched optional choice', async () => {
      const { engine } = setup([nudge({ fieldSchema: z.object({ coachee: z.string().optional() }) })])
      await engine.routeInput('nudge tuvalu')
      expect(engine.state.kind).toBe('clarifying')
      expect(engine.getSnapshot().warnings.coachee).toContain('tuvalu')
      engine.submitFields({})
      expect(engine.state.kind).toBe('validated')
      expect(engine.getSnapshot().warnings).toEqual({})
    })

    it('generates per-field warnings with unmatched-only tokens for multiple fields', async () => {
      const skill = makeSkill('coach.nudge', {
        description: 'Nudge a coachee',
        fieldSchema: z.object({ coachee: z.string().min(1), type: z.string().min(1), message: z.string().min(1) }),
        questions: { coachee: 'Which coachee?', type: 'What type?', message: 'What message?' },
        fieldMeta: {
          coachee: { inputType: 'choice', label: 'Coachee', options },
          type: { inputType: 'choice', label: 'Type', options: [{ value: 'gentle', label: 'Gentle' }] },
        },
      })
      const { engine } = setup([skill])
      await engine.routeInput('nudge tuvalu')
      const warnings = engine.getSnapshot().warnings
      expect(warnings.coachee).toBe('No match for "tuvalu" in Coachee. Please choose an option manually.')
      expect(warnings.type).toBe('No match for "tuvalu" in Type. Please choose an option manually.')
    })
  })

  // ─── Issue 3: Auto-resolve single-option choice fields ─────────

  describe('auto-resolve choice fields', () => {
    it('auto-fills choice field with exactly 1 option', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          template_id: {
            ...meta.template_id,
            options: [{ value: 't1', label: 'Decision Journal' }],
          },
        }),
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      // template_id should be auto-resolved.
      expect(engine.getSnapshot().fields.template_id).toBe('t1')
      // entry_text should still need user input.
      expect(engine.state.kind).toBe('clarifying')
      // The spec should be marked autoResolved.
      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.autoResolved).toBe(true)
    })

    it('extracted value takes precedence over auto-resolve', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          template_id: {
            ...meta.template_id,
            options: [{ value: 't1', label: 'Decision Journal' }],
          },
        }),
      })
      const { engine } = setup([skill])

      // Pass an extracted value for template_id.
      await engine.selectSkill('journal.entry', { template_id: 't2' })

      // The extracted value should win.
      expect(engine.getSnapshot().fields.template_id).toBe('t2')
      // The spec should NOT be marked autoResolved.
      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.autoResolved).toBeUndefined()
    })

    it('does not auto-resolve multi-option fields', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          template_id: {
            ...meta.template_id,
            options: [
              { value: 't1', label: 'Template 1' },
              { value: 't2', label: 'Template 2' },
            ],
          },
        }),
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      // template_id should NOT be auto-resolved (2 options).
      expect(engine.getSnapshot().fields.template_id).toBeUndefined()
      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.autoResolved).toBeUndefined()
    })

    it('downgrades zero-option required choice field to a text input', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          template_id: {
            ...meta.template_id,
            options: [],  // zero options
          },
        }),
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      // The spec downgrades to text — no dead dropdown, no dead-end error.
      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.inputType).toBe('text')
      expect(engine.getSnapshot().errors.template_id).not.toBe('No options available')
    })

    it('downgrades choice field with undefined options to a text input', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        // No prepare — template_id stays a choice with no options at all.
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.inputType).toBe('text')
    })

    it('keeps zero-option optional choice field optional', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string().optional(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          template_id: {
            ...meta.template_id,
            options: [],
          },
        }),
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')

      const specs = engine.getSnapshot().allFieldSpecs
      const templateSpec = specs.find((s) => s.key === 'template_id')
      expect(templateSpec?.inputType).toBe('text')
      expect(templateSpec?.required).toBe(false)
      // entry_text alone satisfies the schema — no forced input for template_id.
      const result = engine.submitFields({ entry_text: 'hello' })
      expect(result).toBe(true)
      expect(engine.state.kind).toBe('validated')
    })

    it('auto-resolved + user fields can validate together', async () => {
      const skill = makeSkill('journal.entry', {
        fieldSchema: z.object({
          entry_text: z.string(),
          template_id: z.string(),
        }),
        questions: { entry_text: 'Entry?', template_id: 'Template?' },
        fieldMeta: {
          entry_text: { inputType: 'text', label: 'Entry' },
          template_id: { inputType: 'choice', label: 'Template' },
        },
        prepare: async (_actor, meta) => ({
          ...meta,
          template_id: {
            ...meta.template_id,
            options: [{ value: 't1', label: 'Decision Journal' }],
          },
        }),
        handler: async () => ({ type: 'instant', data: {} }),
      })
      const { engine } = setup([skill])

      await engine.selectSkill('journal.entry')
      expect(engine.state.kind).toBe('clarifying')

      // Only submit entry_text — template_id is auto-resolved.
      engine.submitFields({ entry_text: 'Today I learned...' })
      expect(engine.state.kind).toBe('validated')
    })
  })
})
