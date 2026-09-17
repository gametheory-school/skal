# Skal Backlog

> **Origin:** `@gametheory-school/skal` — conversational UI framework for the gameTheory platform. Gives every product a clarify-then-execute shell: detect intent, identify missing fields, ask, and only then act. Consumed by Crucible via pinned version from GitHub Packages.

---

## Process

- **WIP limit:** 2 items max active — one feature + one spike/chore
- **Definition of Done:** coded · tested · typechecked · built · changelog updated · consumer handoff shipped
- **Cadence:** 1-week cycles, pull next from top of highest-priority epic, ship by end of week
- **Triage rule:** dependencies resolved + criteria written + next in order = pull
- **Tags:** `[Feature]` new capability · `[Bug]` defect · `[Spike]` research/design · `[Chore]` maintenance/infra

### Item template

```
### {ID}. {Title} [{Tag}]

{2-4 sentence description of what and why.}

- **depends on:** {item IDs, or "nothing"}
- **blocks:** {item IDs, or "none"}
- **Acceptance criteria:**
  - {testable, verifiable criterion}
```

An item is **pullable** when: it's in "Ready to pull," all `depends on` items are in Done, acceptance criteria are written, and it's next in order within its epic.

---

## Triage

### 1. Ready to pull

| Item | Tag | Why now |
|------|-----|---------|
| *(none — backlog seeding)* | | |

### 2. Blocked

| Item | Tag | Blocker |
|------|-----|---------|
| *(none)* | | |

### 3. Phantoms converted

| Phantom | Real item | Why converted |
|---------|-----------|---------------|
| *(none yet)* | | |

### 4. Phantoms staying external

| Phantom | Why external |
|---------|--------------|
| redirect HandlerResult | Convention lives in Crucible; promote only if it spreads to other consumers |
| prepare pre-filled values | No consumer needs it yet; trigger = session.start model default |
| Choice search/filter | No consumer has hit the ~30-option threshold |
| Richer field types (multi-select, file) | No consumer yet |
| SkillRegistry re-export from skal/ui | Cosmetic; no functional gap |

### 5. Spikes needing design

| Item | What's missing | Would unblock |
|------|---------------|---------------|
| B1. setActor() lifecycle | Decision: reset-to-idle on actor change vs provider-based actor reads; in-flight action semantics | Crucible can delete `key={mode}` remount hack |

---

## Foundation

Core engine infrastructure, types, state machine primitives.

### F1. LLM fallback interface for field extraction [Spike]

`agents.md` design decision #2 states "deterministic-before-LLM" — field extraction tries regex/parsing first, LLM is the fallback. The interface contract for the LLM fallback is not yet defined. Consumer provides the LLM transport; skal defines the interface. Needed when deterministic extraction misses too often in production.

- **depends on:** nothing
- **blocks:** none
- **Acceptance criteria:**
  - `ExtractionFallback` interface defined (input: raw text + field specs; output: extracted fields or null)
  - Interface exported from universal entry (`src/index.ts`)
  - `ActionEngine` accepts optional fallback in constructor config
  - Extraction pipeline calls fallback when deterministic returns no matches
  - Unit tests with mock fallback
  - Consumer integration example in README

### F2. TaskManager data source interface [Spike]

`TaskManager` component exists in `src/ui/` but has no backend data source. The conversational UI framework design doc (axon-side) describes a Task Manager surface showing skill execution status overview. Skal needs an interface for execution state — either a generic in-memory store (current session only) or a pluggable data source (persisted across sessions via axon's execution ledger).

- **depends on:** nothing
- **blocks:** none
- **Open design decisions:** in-memory only (lightweight, session-scoped) vs pluggable store interface (consumers wire axon execution ledger or their own backend)
- **Acceptance criteria:**
  - Data source interface defined (list executions, get by id, subscribe to updates)
  - In-memory default implementation
  - TaskManager component consumes the data source
  - Unit tests

---

## Build

Feature implementation. New capabilities the engine renders or orchestrates.

### B1. Actor mutability — setActor() [Spike]

**Open thread.** `ActionEngine`'s constructor takes `private readonly actor: ActorContext` — immutable for the engine's lifetime. When the actor changes (e.g. mode switch in Crucible), consumers remount the entire shell via `key={mode}`. Proposed: a `setActor(actor)` method. **Design question:** what happens to an in-flight action when the actor changes? Reset-to-idle is probably correct. Alternative: read actor at check time via a provider.

- **depends on:** nothing
- **blocks:** none
- **Resolution criteria:** decision on lifecycle semantics (reset-to-idle vs provider), implementation, migration path for consumers using `key={mode}`
- **Acceptance criteria:**
  - `setActor(actor)` method on ActionEngine
  - In-flight action resets to idle on actor change
  - Permission re-check against new actor
  - `key={mode}` hack deletable from Crucible SkalShellWrapper
  - Unit tests for lifecycle behavior

### B2. redirect HandlerResult variant [Feature]

**External phantom.** Convention shipped in Crucible v1.131.0: handlers return `{ redirect: '/path' }` and the consumer handles navigation. Promote to first-class `HandlerResult` variant only if the convention spreads beyond Crucible. If promoted: `HandlerResult` gains a `redirect` variant alongside `instant` and `scheduled`; engine surfaces it on `EngineSnapshot`; consumer handles the actual navigation.

- **depends on:** second consumer adopting the redirect convention (trigger)
- **blocks:** none
- **Acceptance criteria:**
  - `redirect` variant on `HandlerResult` type
  - Engine carries redirect target through to `EngineSnapshot`
  - Consumer handles navigation (engine does not navigate)
  - Unit tests

### B3. prepare returning pre-filled field values [Feature]

**External phantom.** `prepare` currently returns resolved `FieldMetaInput` (dynamic options, labels). It does not return pre-filled field values. Trigger: first consumer that needs it — likely `session.start` wanting to pre-fill a model default. Implementation: `prepare` return type gains optional `prefill: Record<string, unknown>`; engine merges into `partialFields` after prepare resolves.

- **depends on:** first consumer needing pre-fill (trigger)
- **blocks:** none
- **Acceptance criteria:**
  - `prepare` return type extended with optional `prefill`
  - Engine merges prefill into partialFields after prepare
  - Prefilled fields skip the clarify loop if all required fields are covered
  - Unit tests

---

## Polish

UX refinement, field types, developer experience.

### P1. Choice UI search/filter [Feature]

**External phantom.** Choice fields render all options in a flat dropdown. No search/filter. Becomes necessary past ~30 options. Watch item — no consumer has hit this limit yet. Implementation: text filter input above the option list, client-side filtering by label substring match.

- **depends on:** consumer hitting ~30-option threshold (trigger)
- **blocks:** none
- **Acceptance criteria:**
  - Filter input renders when option count exceeds threshold (configurable, default 30)
  - Client-side substring filter by label
  - Keyboard navigation preserved (arrow keys, enter to select)
  - Unit tests

### P2. Richer field types — multi-select, file inputs [Feature]

**External phantom.** Only `text` and `choice` input types exist. Multi-select fields, file uploads, and richer field types have no consumer yet. Each new type needs: `FieldSpec` extension, `FieldRenderer` branch, extraction support, validation integration.

- **depends on:** consumer request (trigger)
- **blocks:** none
- **Acceptance criteria (per field type):**
  - `FieldSpec` extended with new `inputType`
  - `FieldRenderer` renders appropriate input
  - Extraction handles the new type (where applicable)
  - Validation integrates with Zod schema
  - Unit tests

### P3. SkillRegistry re-export from skal/ui [Chore]

**External phantom.** Consumers import `SkillRegistry` from the universal entry and cast with `as any` when using it in client components. Re-exporting from `skal/ui` drops the cast.

- **depends on:** nothing
- **blocks:** none
- **Acceptance criteria:**
  - `SkillRegistry` exported from `src/ui.ts`
  - Consumer can drop `as any` cast
  - Typecheck green

---

## Grow

Future expansion. Items that extend skal's reach beyond the current clarify-then-execute pattern.

### G1. Multi-language / i18n support [Spike]

All user-facing strings (button labels, error messages, state descriptions) are hardcoded in English. If skal is adopted by non-English products or the platform goes multi-language, these strings need to be externalized. Low priority — all current consumers are English-only.

- **depends on:** consumer needing non-English UI (trigger)
- **blocks:** none
- **Resolution criteria:** decision on i18n approach (runtime locale vs build-time string injection vs consumer-provided string map)

### G2. Scheduling integration layer [Feature]

The TaskManager component needs a scheduling story for skills that fire on a cadence. Axon's heartbeat system (F10) handles infrastructure-level scheduling; skal needs a consumer-facing interface for "this skill runs every Monday at 9am" or "fire once at this timestamp." May connect to axon's F22 (user-created schedules).

- **depends on:** F2 (TaskManager data source), consumer needing scheduled skills
- **blocks:** none
- **Acceptance criteria:**
  - Schedule type defined (one-time, recurring with cron)
  - Integration with axon heartbeat or framework-owned schedule store
  - TaskManager shows scheduled executions
  - Unit tests

---

## Done (archive)

| Item | Shipped | Notes |
|------|---------|-------|
| Cancel button on forms | v0.6.0 (2026-09-16) | Secondary button next to Submit in capturing/clarifying; calls onReset |
| Word-level choice extraction | v0.6.0 (2026-09-16) | normalize() helper, two-phase matching (exact then word-score); "clara" → "Clara Chen" |
| Softer error styling | v0.6.0 (2026-09-16) | Pill style (bg-red-50 rounded) instead of raw red text |
| Cancel on all screens + post-prepare extraction + min 2-token routing | v0.6.2 (2026-09-17) | Cancel in validated state too; extraction runs after prepare resolves; routing requires 2+ tokens |
| SELECTION_DENIED event + canSelect() | v0.5.0 (2026-09-16) | Select-time permission gate; idle → failed with retryable: false; 11 new tests (144 total) |
| Validated card renders option labels | v0.5.0 (2026-09-16) | formatFieldValue() resolves choice values to labels |
| Zero-option choice → text downgrade | v0.5.0 (2026-09-16) | specInputType() downgrades empty options to text; removed _fieldErrors machinery |
| Completed-state message on HandlerResult | v0.4.0 (2026-09-16) | Optional `message` string renders as text paragraph instead of JSON dump |
| Auto-resolve single-option choice fields | v0.4.0 (2026-09-16) | `autoResolved` flag; read-only blue confirmation line |
| Pristine form error suppression | v0.4.0 (2026-09-16) | Validation errors gated on first submit attempt |
| SkalVersion component | v0.4.0 (2026-09-16) | Build-time version label via tsup define |
| prepare lifecycle hook | v0.3.0 (2026-09-16) | Async pre-flight for dynamic field options; `preparing` flag on snapshot |
| ActionCard UI + Composer + CommandBar + SkillRouter | v0.2.0 (2026-09-16) | Full clarify-then-execute shell |
| Phase 1 — engine, contracts, state machine, field extraction/validation | v0.1.0 (2026-09-16) | Core state machine, SkillRegistry, Dispatcher, Zod validation, regex extraction |

---

## Dependency Map

### Intra-epic

```
Foundation:
  (no internal deps yet)

Build:
  (no internal deps yet)

Polish:
  (no internal deps yet)

Grow:
  F2 (TaskManager data source) ──→ G2 (scheduling integration)
```

### Cross-epic

```
F1 (LLM fallback) ──→ improves extraction accuracy across all skills
B1 (setActor) ──→ consumer UX (delete key={mode} hack)
F2 (TaskManager data) ──→ G2 (scheduling)
```

---

## Phantom Dependencies

| Phantom | Status | Notes |
|---------|--------|-------|
| redirect HandlerResult | External | Convention in Crucible; promote when it spreads |
| prepare pre-filled values | External | No consumer yet; trigger = session.start model default |
| Choice search/filter | External | No consumer past ~30 options yet |
| Richer field types | External | No consumer request yet |
| SkillRegistry re-export | External | Cosmetic; tracked as P3 |
| axon F21 (execution ledger) | External | TaskManager data source could use axon's ledger when it ships |
| axon F22 (user-created schedules) | External | Scheduling integration depends on axon's schedule model |
