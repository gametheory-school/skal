import { describe, it, expect } from 'vitest'
import { StateMachine } from '../../../src/engine/state-machine.js'

describe('StateMachine', () => {
  it('starts in idle state', () => {
    const sm = new StateMachine()
    expect(sm.currentState).toEqual({ kind: 'idle' })
  })

  it('transitions idle → capturing on SKILL_SELECTED', () => {
    const sm = new StateMachine()
    const state = sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    expect(state).toEqual({
      kind: 'capturing',
      skillId: 'test.skill',
      partialFields: {},
    })
  })

  it('transitions idle → capturing with extracted fields', () => {
    const sm = new StateMachine()
    const state = sm.send({
      type: 'SKILL_SELECTED',
      skillId: 'test.skill',
      extractedFields: { title: 'Hello' },
    })
    expect(state).toEqual({
      kind: 'capturing',
      skillId: 'test.skill',
      partialFields: { title: 'Hello' },
    })
  })

  it('transitions idle → failed on SELECTION_DENIED', () => {
    const sm = new StateMachine()
    const state = sm.send({
      type: 'SELECTION_DENIED',
      message: 'Permission denied: u1 cannot execute "test.skill"',
    })
    expect(state).toEqual({
      kind: 'failed',
      error: 'Permission denied: u1 cannot execute "test.skill"',
      retryable: false,
    })
  })

  it('rejects SELECTION_DENIED outside idle', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    expect(() =>
      sm.send({ type: 'SELECTION_DENIED', message: 'denied' }),
    ).toThrow(/Invalid transition/)
  })

  it('transitions capturing → clarifying on GAPS_DETECTED', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    const state = sm.send({
      type: 'GAPS_DETECTED',
      missingFields: [{ key: 'title', label: 'Title', inputType: 'text', required: true }],
    })
    expect(state.kind).toBe('clarifying')
    if (state.kind === 'clarifying') {
      expect(state.skillId).toBe('test.skill')
      expect(state.missingFields).toHaveLength(1)
    }
  })

  it('transitions capturing → validated when all fields present', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    const state = sm.send({
      type: 'VALIDATED',
      fields: { title: 'Hello', content: 'World' },
    })
    expect(state).toEqual({
      kind: 'validated',
      skillId: 'test.skill',
      fields: { title: 'Hello', content: 'World' },
    })
  })

  it('transitions clarifying → clarifying on USER_REPLIED', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({
      type: 'GAPS_DETECTED',
      missingFields: [{ key: 'title', label: 'Title', inputType: 'text', required: true }],
    })
    const state = sm.send({
      type: 'USER_REPLIED',
      fields: { title: 'Hello' },
    })
    expect(state.kind).toBe('clarifying')
    if (state.kind === 'clarifying') {
      expect(state.currentFields).toEqual({ title: 'Hello' })
    }
  })

  it('transitions clarifying → validated on VALIDATED', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({
      type: 'GAPS_DETECTED',
      missingFields: [{ key: 'title', label: 'Title', inputType: 'text', required: true }],
    })
    const state = sm.send({
      type: 'VALIDATED',
      fields: { title: 'Hello', content: 'World' },
    })
    expect(state.kind).toBe('validated')
  })

  it('transitions validated → executing on DISPATCH', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    const state = sm.send({ type: 'DISPATCH' })
    expect(state).toEqual({
      kind: 'executing',
      skillId: 'test.skill',
      fields: { title: 'Hello' },
    })
  })

  it('transitions validated → scheduled on SCHEDULE', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    const trigger = { type: 'once' as const, at: '2026-09-16T10:00:00Z' }
    const state = sm.send({ type: 'SCHEDULE', trigger })
    expect(state.kind).toBe('scheduled')
    if (state.kind === 'scheduled') {
      expect(state.trigger).toEqual(trigger)
    }
  })

  it('transitions scheduled → executing on TRIGGER_FIRED', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    sm.send({ type: 'SCHEDULE', trigger: { type: 'once', at: '2026-09-16T10:00:00Z' } })
    const state = sm.send({ type: 'TRIGGER_FIRED' })
    expect(state.kind).toBe('executing')
  })

  it('transitions executing → completed on instant result', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    sm.send({ type: 'DISPATCH' })
    const state = sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'instant', data: { id: '123' } },
    })
    expect(state).toEqual({ kind: 'completed', result: { id: '123' } })
  })

  it('carries message from instant result into completed state', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    sm.send({ type: 'DISPATCH' })
    const state = sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'instant', data: { id: '123' }, message: 'Saved!' },
    })
    expect(state.kind).toBe('completed')
    if (state.kind === 'completed') {
      expect(state.result).toEqual({ id: '123' })
      expect(state.message).toBe('Saved!')
    }
  })

  it('transitions executing → running on long-running result', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    sm.send({ type: 'DISPATCH' })
    const state = sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'long-running', executionId: 'exec-1' },
    })
    expect(state).toEqual({ kind: 'running', executionId: 'exec-1' })
  })

  it('transitions executing → failed on error result', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: { title: 'Hello' } })
    sm.send({ type: 'DISPATCH' })
    const state = sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'error', message: 'Something broke', retryable: false },
    })
    expect(state).toEqual({
      kind: 'failed',
      error: 'Something broke',
      retryable: false,
    })
  })

  it('transitions running → completed on instant result', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: {} })
    sm.send({ type: 'DISPATCH' })
    sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'long-running', executionId: 'exec-1' },
    })
    const state = sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'instant', data: 'done' },
    })
    expect(state).toEqual({ kind: 'completed', result: 'done' })
  })

  it('transitions any active state → cancelled on CANCEL', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: {} })
    sm.send({ type: 'DISPATCH' })
    sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'long-running', executionId: 'exec-1' },
    })
    const state = sm.send({
      type: 'CANCEL',
      executionId: 'exec-1',
      partialEffects: '2 of 5 invites sent',
    })
    expect(state).toEqual({
      kind: 'cancelled',
      executionId: 'exec-1',
      partialEffects: '2 of 5 invites sent',
    })
  })

  it('throws on invalid transition', () => {
    const sm = new StateMachine()
    expect(() => sm.send({ type: 'DISPATCH' })).toThrow('Invalid transition')
  })

  it('throws on CANCEL from idle', () => {
    const sm = new StateMachine()
    expect(() =>
      sm.send({ type: 'CANCEL', executionId: 'exec-1' }),
    ).toThrow('Invalid transition')
  })

  it('throws on CANCEL from terminal state (completed)', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.send({ type: 'VALIDATED', fields: {} })
    sm.send({ type: 'DISPATCH' })
    sm.send({
      type: 'HANDLER_RESULT',
      result: { type: 'instant', data: 'done' },
    })
    expect(() =>
      sm.send({ type: 'CANCEL', executionId: 'exec-1' }),
    ).toThrow('Invalid transition')
  })

  it('reset returns to idle', () => {
    const sm = new StateMachine()
    sm.send({ type: 'SKILL_SELECTED', skillId: 'test.skill' })
    sm.reset()
    expect(sm.currentState).toEqual({ kind: 'idle' })
  })
})
