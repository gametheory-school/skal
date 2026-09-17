# Skal Open Threads — Design Questions

> **DEPRECATED as a tracking file.** This file captures **design questions only**. All work tracking (items, priorities, dependencies, triage) lives in [`backlog.md`](./backlog.md). Each thread below cross-references its corresponding backlog item ID where applicable.

---

## OPEN

### Actor mutability after engine construction — setActor() lifecycle
**Status:** open — needs design decision
**Opened:** 2026-09-16
**Backlog:** B5 (Build)
`ActionEngine`'s constructor takes `private readonly actor: ActorContext` — immutable for the engine's lifetime. When the actor changes (e.g. mode switch in Crucible), consumers must remount the entire shell via `key={mode}` to get a fresh engine. Proposed fix: a `setActor(actor)` method. **Open design question:** what happens to an in-flight action when the actor changes underneath? Reset-to-idle is probably correct, but the lifecycle semantics deserve a decision before implementation. Alternative: read the actor at check time via a provider instead of storing it.
**Current workaround:** Crucible's `SkalShellWrapper` uses `key={mode}` remount.

### HandlerResult `redirect` type — first-class vs convention
**Status:** parked
**Opened:** 2026-09-16
**Backlog:** External phantom (Crucible spec Non-Goals)
Convention shipped in Crucible v1.131.0: handlers return `{ redirect: '/path' }` and the consumer handles navigation. Skal has no first-class `redirect` variant on `HandlerResult`. Promote to a real backlog item only if the convention spreads beyond Crucible.

### `prepare` returning pre-filled field values
**Status:** parked
**Opened:** 2026-09-16
**Backlog:** External phantom (Crucible spec Non-Goals)
`prepare` currently returns resolved `FieldMetaInput` (dynamic options, labels). It does not return pre-filled field values. Trigger: first consumer that needs it — likely `session.start` wanting to pre-fill a model default. No consumer yet.

### Choice UI search/filter
**Status:** parked
**Opened:** 2026-09-16
**Backlog:** External phantom (Crucible spec Non-Goals)
Choice fields render all options in a flat list. No search/filter UI. Becomes necessary past ~30 options. Watch item — no consumer has hit this limit yet.

### Richer field types (multi-select, file inputs)
**Status:** parked
**Opened:** 2026-09-16
**Backlog:** External phantom (Crucible spec Non-Goals)
Only `text` and `choice` input types exist. Multi-select fields, file uploads, and richer field types have no consumer yet.

### SkillRegistry re-export from `skal/ui`
**Status:** parked
**Opened:** 2026-09-16
**Backlog:** External phantom (Crucible spec Non-Goals)
Consumers currently import `SkillRegistry` from the universal entry and cast with `as any` when using it in client components. Re-exporting from `skal/ui` would drop the cast. Cosmetic — no functional gap.

---

## RESOLVED

### Select-time permission gate — selectSkill() vs dispatch() only
**Status:** resolved 2026-09-16 — both select-time check and canSelect() helper shipped in v0.5.0
**Backlog:** Done (archive)
`checkAtCompose` was imported in ActionEngine but never invoked. Decision: gate inside `selectSkill()` (before `prepare()`) AND expose `canSelect(skillId)` for command-palette filtering / route-time checks. Denied selection transitions `idle → failed` with `retryable: false`. Dispatcher re-check kept as defense-in-depth. 11 new tests (144 total).

### Validated card renders raw choice values instead of labels
**Status:** resolved 2026-09-16 — fixed in v0.5.0
**Backlog:** Done (archive)
`formatFieldValue(value, options)` helper in ActionCard resolves choice field values to their option labels. Falls back to raw value for non-choice fields. No engine API change.

### Zero-option required choice is a dead end
**Status:** resolved 2026-09-16 — fixed in v0.5.0
**Backlog:** Done (archive)
Choice fields with empty or undefined options downgrade to `inputType: 'text'` at spec-build. The `'No options available'` error and `_fieldErrors`/`_mergedErrors` machinery removed. Required zero-option fields surface the standard Zod missing-field error after submit.
