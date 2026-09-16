# Handoff: Adopt skal v0.3.0 in Crucible

**Date:** 2026-09-16
**Tag:** #gt
**Status:** Ready to implement — dependency + wiring + first skill + shell UI

---

> Paste this entire block into a Crucible agent session.

````
You are working in **crucible** (`/Users/nirmal/gametheory/crucible`). Task: adopt `@gametheory-school/skal` v0.3.0 — the conversational UI framework.

## What This Is

skal (`@gametheory-school/skal`) is a conversational shell that replaces menu-driven action triggering with natural-language intent classification → clarify-then-execute. It ships as two npm entry points:

- `@gametheory-school/skal` — universal engine (pure TS, no React): state machine, skill registry, dispatcher, router, field extraction/validation
- `@gametheory-school/skal/ui` — React client components (`'use client'` banner): ActionCard, CommandBar, Composer, useActionEngine hook

skal provides the **card + engine**. Crucible provides the **shell** (button, modal, permission gate, LLM transport, skill definitions).

## What's New in v0.3.0

v0.3.0 adds the **`prepare` lifecycle hook** on `SkillDefinition`. This optional async hook runs after skill selection, before the clarify loop renders. Use it to fetch dynamic data (e.g., dropdown options from APIs) and merge into fieldMeta.

Key changes:
- `prepare?: (actor, fieldMeta) => Promise<Record<string, FieldMetaInput>>` on SkillDefinition
- `selectSkill()` is now **async** (returns `Promise<boolean>`) — consumers must `await` it
- `preparing: boolean` flag on the engine snapshot for UI loading states
- `FieldMetaInput` exported as a named type

## Steps

### 1. Install the dependency

```bash
npm install @gametheory-school/skal@0.3.0
```

The `.npmrc` is already configured for GitHub Packages (`@gametheory-school:registry=https://npm.pkg.github.com`). No new env vars needed.

### 2. Wire the LLM transport

skal never calls an LLM directly. It defines a 1-method interface (`ExtractionLLM`) that Crucible implements by wiring axon's transport. Create `src/lib/skal-llm.ts`:

```typescript
// src/lib/skal-llm.ts
'use client'

import { chatCompletionWithFallback } from '@gametheory-school/axon/prompts'
import type { ExtractionLLM, ChatMessage } from '@gametheory-school/skal'

export const skalLLM: ExtractionLLM = {
  complete: async (messages: ChatMessage[]) => {
    const { content } = await chatCompletionWithFallback({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      model: 'gpt-4o-mini',  // fast + cheap — classification doesn't need heavy model
    })
    return content
  },
}
```

### 3. Implement the PermissionGate

skal checks permissions at two points: compose-time (before showing the card) and pre-dispatch (defense-in-depth). For the initial adoption, use a simple allow-all gate and tighten per-skill later via `requiredRole` on SkillDefinition:

```typescript
// src/lib/skal-gate.ts
import type { PermissionGate, ActorContext } from '@gametheory-school/skal'

export const skalPermissionGate: PermissionGate = {
  can: async (_actor: ActorContext, _actionId: string) => {
    // v1: allow all authenticated users. Tighten per-skill via requiredRole.
    return true
  },
}
```

### 4. Build the ActorContext

The `ActorContext` tells skal who is acting:

```typescript
// src/lib/skal-actor.ts
import type { ActorContext } from '@gametheory-school/skal'

export function buildSkalActor(userId: string, organizationId: string, role: string): ActorContext {
  return {
    userId,
    organizationId,
    platformRole: role === 'admin' ? 'admin' : 'user',
    orgRole: role,
  }
}
```

### 5. Define the first skill: journal.entry

Crucible already has `POST /api/journal/entries` (template_id + entry_text + source_context). Wrap it as a skal skill. Note the **`prepare` hook** that fetches available templates dynamically:

```typescript
// src/skills/journal-entry.ts
import { z } from 'zod'
import type { SkillDefinition, ActorContext, FieldMetaInput } from '@gametheory-school/skal'

export const journalEntrySkill: SkillDefinition = {
  id: 'journal.entry',
  description: 'Write a journal entry to reflect on a session, diagnostic, or learning moment',
  fieldSchema: z.object({
    entry_text: z.string().min(1, 'Entry text is required'),
    template_id: z.string().min(1, 'Template is required'),
  }),
  questions: {
    entry_text: 'What would you like to reflect on?',
    template_id: 'Which template?',
  },
  fieldMeta: {
    entry_text: { inputType: 'text', label: 'Entry', multiline: true },
    template_id: { inputType: 'choice', label: 'Template' },  // options populated by prepare
  },
  /**
   * Optional pre-flight hook.
   * Fetches available journal templates from the API and populates
   * the template_id choice options dynamically.
   */
  prepare: async (_actor: ActorContext, fieldMeta: Record<string, FieldMetaInput>) => {
    try {
      const res = await fetch('/api/journal/templates')
      if (!res.ok) return fieldMeta  // fallback to static fieldMeta
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
  cancellable: false,
  handler: async (fields, _actor) => {
    const res = await fetch('/api/journal/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_text: fields.entry_text,
        template_id: fields.template_id,
        source_context: { source_type: 'freeform' },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { type: 'error', message: err.error ?? 'Failed to create entry', retryable: res.status >= 500 }
    }
    const data = await res.json()
    return { type: 'instant', data }
  },
}
```

### 6. Register skills in a SkillRegistry

```typescript
// src/lib/skal-registry.ts
'use client'

import { SkillRegistry } from '@gametheory-school/skal'
import { journalEntrySkill } from '@/skills/journal-entry'

export function createSkalRegistry(): SkillRegistry {
  const registry = new SkillRegistry()
  registry.register(journalEntrySkill)
  // Add more skills here as they're built
  return registry
}
```

### 7. Mount the shell UI

The shell is a floating action button + modal. The modal shows `<CommandBar>` when idle, `<ActionCard>` when a skill is active. Note the **`preparing` state** handling:

```tsx
// src/components/skal/SkalShell.tsx
'use client'

import { useState } from 'react'
import { useActionEngine, ActionCard, CommandBar } from '@gametheory-school/skal/ui'
import { createSkalRegistry } from '@/lib/skal-registry'
import { skalLLM } from '@/lib/skal-llm'
import { skalPermissionGate } from '@/lib/skal-gate'
import type { ActorContext } from '@gametheory-school/skal'

interface SkalShellProps {
  actor: ActorContext
}

export function SkalShell({ actor }: SkalShellProps) {
  const [open, setOpen] = useState(false)
  const [registry] = useState(() => createSkalRegistry())

  const engine = useActionEngine({
    registry,
    permissionGate: skalPermissionGate,
    actor,
    llm: skalLLM,
  })

  const handleClose = () => {
    engine.reset()
    setOpen(false)
  }

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 flex items-center justify-center text-xl"
          aria-label="Open command bar"
        >
          +
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            {engine.preparing ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                <span className="ml-3 text-gray-600">Loading...</span>
              </div>
            ) : engine.state.kind === 'idle' ? (
              <CommandBar
                onRoute={engine.routeInput}
                disabled={false}
                placeholder="What would you like to do?"
              />
            ) : (
              <ActionCard {...engine.activeAction} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

### 8. Mount SkalShell in the app layout

Since `src/app/(app)/layout.tsx` is a server component, create a thin client wrapper that receives the actor props:

```tsx
// src/components/skal/SkalShellWrapper.tsx
'use client'

import { SkalShell } from './SkalShell'
import type { ActorContext } from '@gametheory-school/skal'

export function SkalShellWrapper({ userId, organizationId, role }: {
  userId: string
  organizationId: string
  role: string
}) {
  const actor: ActorContext = {
    userId,
    organizationId,
    platformRole: role === 'admin' ? 'admin' : 'user',
    orgRole: role,
  }
  return <SkalShell actor={actor} />
}
```

Then in the layout, you need to pass userId/orgId/role. The simplest approach is a client component that fetches its own actor context from the session. Alternatively, pass it as props from the server layout.

### 9. Validate

```bash
npm run typecheck
npm run build
npm test
```

## Breaking changes from v0.2.0

- **`selectSkill()` is now async**: If you call `engine.selectSkill()` directly, you must `await` it. The `routeInput()` method already awaits it internally, so no change needed there.
- Migration: `engine.selectSkill('journal.entry')` → `await engine.selectSkill('journal.entry')`

## What Crucible owns vs what skal owns

| Concern | Owner |
|---------|-------|
| Button, modal, backdrop | Crucible |
| Skill definitions (what actions exist) | Crucible |
| PermissionGate implementation | Crucible |
| ActorContext construction | Crucible |
| LLM transport wiring | Crucible |
| State machine, clarify loop, dispatch | skal |
| Field extraction (deterministic + LLM) | skal |
| Intent classification (router) | skal |
| ActionCard rendering (form/text/states) | skal |
| FieldSpec-driven input rendering | skal |
| Dynamic field options via `prepare` | skal (orchestrates), Crucible (implements per-skill) |

## Future skills to add

Once the shell is working, these are natural candidates:

- `session.start` — start a new leadership simulation scenario
- `diagnostic.request` — request a leadership diagnostic
- `coach.message` — send a message to your coach
- `journal.summary` — regenerate a journal entry summary

Each is a `SkillDefinition` with a Zod schema, a handler that calls an existing Crucible API route, and a `description` for the router. Skills with dynamic dropdowns (e.g., diagnostic types, coach list) can use the `prepare` hook.

## Push policy

Crucible accepts direct pushes to main.

## Validation checklist

- [ ] `npm install @gametheory-school/skal@0.3.0` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Floating button appears in the app layout
- [ ] Clicking the button opens the modal with CommandBar
- [ ] Typing "write a journal entry" routes to journal.entry skill
- [ ] `prepare` hook fetches templates from `/api/journal/templates`
- [ ] Loading spinner shows while `prepare` runs
- [ ] ActionCard shows the clarification form with template dropdown
- [ ] Submitting fields calls POST /api/journal/entries
- [ ] Result shows in the completed state
````
