# Handoff: Adopt skal v0.4.0 in Crucible

**Date:** 2026-09-16
**Tag:** #gt
**Status:** Ready to implement — upgrade from v0.3.0 + UX fixes + version label

---

> Paste this entire block into a Crucible agent session.

````
You are working in **crucible** (`/Users/nirmal/gametheory/crucible`). Task: upgrade `@gametheory-school/skal` from v0.3.0 to v0.4.0.

## What's New in v0.4.0

Three UX fixes and one addition — all backward-compatible, no breaking API changes.

### 1. Completed state: human-readable confirmation instead of JSON dump

Skill handlers can now return an optional `message` on instant results:

```typescript
return {
  type: 'instant',
  data,
  message: `Journal entry saved. Coach response: ${data.coach_response}`,
}
```

When `message` is present, the card renders it as a text paragraph instead of dumping raw JSON. When absent, the JSON dump remains (useful for dev/debug).

### 2. Validation errors no longer show on a pristine form

Previously, every required field showed a red Zod error on first render — before the user typed anything. Now errors are hidden until the first submit attempt. After submit, errors persist normally. Resets on skill change (component remount).

No API change — this is purely a presentation fix in `ActionCard`.

### 3. Single-option choice fields auto-resolve

If a `choice` field has exactly one option (e.g., only one journal template exists), the engine auto-fills it and skips the question. The auto-resolved field shows as a read-only blue confirmation line on the card so the user sees what was assumed.

- Extracted values (from user input or router) take precedence over auto-resolve
- Zero-option required choice fields surface "No options available" error
- Multi-option fields are unaffected (dropdown still asked)
- Data-driven: when a second template is added, the dropdown reappears automatically

### 4. `SkalVersion` component

A build-time version label matching axon's pattern. Import from the UI entry:

```tsx
import { SkalVersion } from '@gametheory-school/skal/ui'

// In your modal corner:
<SkalVersion />
// or with custom styling:
<SkalVersion className="text-xs text-gray-500" />
```

Renders `skal 0.4.0` (version baked at build time from package.json). Same visual rhythm as axon's `powered by axon <version>`.

## Steps

### 1. Upgrade the dependency

```bash
npm install @gametheory-school/skal@0.4.0
```

### 2. Update the journal.entry skill handler to return a message

```typescript
handler: async (fields, _actor) => {
  const res = await fetch('/api/journal/entries', { ... })
  if (!res.ok) { ... }
  const data = await res.json()
  return {
    type: 'instant',
    data,
    message: `Journal entry saved${data.coach_response ? `. ${data.coach_response}` : ''}`,
  }
}
```

### 3. Fix Zod schema error wording

Replace bare `z.string()` with descriptive messages so any errors that do surface read well:

```typescript
const journalEntrySchema = z.object({
  entry_text: z.string('Entry text is required').min(1, 'Entry text is required'),
  template_id: z.string('Template is required').min(1, 'Template is required').optional(),
})
```

### 4. Add the version label to the modal

In your `SkalShell.tsx` modal, add the `SkalVersion` component in a corner:

```tsx
import { useActionEngine, ActionCard, CommandBar, SkalVersion } from '@gametheory-school/skal/ui'

// Inside the modal, e.g. bottom-right corner:
<div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
  <button onClick={handleClose} className="absolute right-3 top-3 ...">✕</button>
  {/* ... CommandBar / ActionCard ... */}
  <div className="mt-3 text-right">
    <SkalVersion />
  </div>
</div>
```

### 5. Validate

```bash
npm run typecheck
npm run build
npm test
```

## Migration notes

- **No breaking changes.** All additions are optional fields.
- `selectSkill()` remains async (from v0.3.0).
- The `prepare` hook remains optional (from v0.3.0).
- Error gating is automatic — no code changes needed in your shell.
- Auto-resolve is automatic — if `prepare` returns a single-option choice, it's filled for free.

## Validation checklist

- [ ] `npm install @gametheory-school/skal@0.4.0` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Completed state shows the handler's `message` text (not JSON dump)
- [ ] Clarify form shows no errors on first render
- [ ] Errors appear after submitting with empty required fields
- [ ] Single-template scenario: template auto-fills, only entry_text is asked
- [ ] Multi-template scenario: template dropdown appears normally
- [ ] `SkalVersion` renders in the modal corner
- [ ] Version label matches the installed package version
````
