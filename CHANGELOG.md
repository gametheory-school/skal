# Changelog

All notable changes to `@gametheory-school/skal` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com); versioning follows [semver](https://semver.org).

## [0.3.0] — 2026-09-16

### Added

- **`prepare` lifecycle hook** on `SkillDefinition`: optional async pre-flight hook `(actor, fieldMeta) => Promise<Record<string, FieldMetaInput>>`. Runs after skill selection, before the clarify loop renders. Enables skills to fetch dynamic data (e.g., dropdown options from APIs) and merge into fieldMeta. If `prepare` throws, engine resets to idle (same error handling as other public methods).
- **`FieldMetaInput` interface** extracted as a named type for reuse: `{ inputType, label, multiline?, options? }`. Exported from both entry points.
- **`preparing: boolean`** flag on `EngineSnapshot` for UI loading states while `prepare` runs.
- **4 new tests** covering `prepare` hook: populates choice options, rejection transitions to idle, skips when not defined, resolved fieldMeta flows through validation.

### Changed

- **`ActionEngine.selectSkill()`** is now `async` and returns `Promise<boolean>` instead of `boolean`. Calls `skill.prepare()` if defined before entering the clarify loop. Resolved fieldMeta stored internally and used for all subsequent `buildFieldSpecs` and `validateFields` calls.
- **`useActionEngine` hook** return type updated: `selectSkill` signature changed to `Promise<boolean>`, added `preparing: boolean` to return type.
- **`validateFields` and `buildFieldSpecs`** parameter types updated to use `FieldMetaInput` instead of inline type definition (non-breaking, same shape).

### Consumer impact

- Skills can now define a `prepare` hook to fetch dynamic field options (e.g., dropdown choices from an API) before the clarify loop renders. This eliminates the need for consumers to fetch data in the shell and mutate skill definitions.
- `selectSkill` is now async — consumers must `await` it. This is a breaking change for any code calling `selectSkill` synchronously, but the migration is straightforward: add `await`.
- The `preparing` flag in the snapshot allows UI to show loading indicators while `prepare` runs.
- Existing skills without `prepare` work unchanged — the hook is optional and backward compatible.

## [0.2.0] — 2026-09-16

### Added

- **SkillRouter** (`src/engine/router.ts`): deterministic-first intent classification with keyword-overlap scoring, LLM fallback via consumer-provided `ExtractionLLM` transport. System/user message split prevents prompt injection. Robust skill-ID parsing extracts registered IDs from verbose LLM responses. Skills without `description` match on `id` segments + `questions` text.
- **ActionEngine** (`src/ui/ActionEngine.ts`): pure TypeScript orchestration class wiring StateMachine + SkillRegistry + Dispatcher + SkillRouter + validation. Full public API: `selectSkill`, `submitFields`, `submitText`, `dispatch`, `schedule`, `cancel`, `reset`, `routeInput`. Subscription pattern (`subscribe`/`getSnapshot`) for React hook integration.
- **ActionCard** (`src/ui/ActionCard/ActionCard.tsx`): state-driven card component with form/text mode toggle, progressive disclosure (required fields shown, optional behind "More options"), form state preservation across re-renders via `useRef` skill-id tracking.
- **FieldRenderer** (`src/ui/ActionCard/FieldRenderer.tsx`): per-field input by `inputType` (text, email, datetime, contact, choice). Tailwind-only, functional HTML.
- **CardStates** (`src/ui/ActionCard/CardStates.tsx`): state-specific renders for executing (spinner), running (progress bar + cancel), completed (JSON result + done badge), failed (error + retry/dismiss), cancelled (partial effects note), scheduled (trigger info).
- **Composer** (`src/ui/Composer.tsx`): free-text textarea + send button with Enter-to-submit.
- **CommandBar** (`src/ui/CommandBar.tsx`): single "do anything" input with classification loading state and double-submit prevention (submit disabled while classifying).
- **useActionEngine** (`src/ui/useActionEngine.ts`): React hook wrapping ActionEngine with `useState`/`useEffect` subscription, `useCallback`-stable callbacks, `useMemo`-memoized `activeAction`.
- **`description?: string`** on `SkillDefinition` — human-readable description for intent routing (non-breaking).
- **`fieldMeta?`** on `SkillDefinition` — optional field metadata (inputType, label, multiline, options) for proper FieldSpec generation with typed extraction.
- **110 tests** (45 new: 16 router + 29 engine) covering all bug-fix guards, full-flow integration, and edge cases.

### Changed

- **`src/ui.ts`** updated from placeholder (`export {}`) to full barrel exports: ActionCard, FieldRenderer, Composer, CommandBar, useActionEngine, ActionEngine, and related types.
- **`src/index.ts`** updated to export SkillRouter, RouteResult, RouterOptions from the universal entry.

### Consumer impact

- Consumers can now use the full "do anything" flow: `<CommandBar>` → SkillRouter classifies intent → ActionEngine enters clarify loop → `<ActionCard>` renders the interaction.
- New `description` field on `SkillDefinition` enables natural-language routing. Existing skills without `description` still work — they match on `id` segments and `questions` text instead.
- New `fieldMeta` field enables typed field extraction (email, datetime, choice). Skills without `fieldMeta` default to `text` inputType for all fields.
- UI components require `react` and `react-dom` as peer dependencies (already declared).
- Modal wrapper, dimmed backdrop, and button are consumer's responsibility — skal provides the card + engine.

## [0.1.0] — 2026-09-15

### Added

- **Engine contracts:** `FieldSpec`, `SkillDefinition`, `ActorContext`, `PermissionGate`, `ActionState` (10 state variants), `ScheduleTrigger`, `ActionEvent` (10 event types), `SkillHandler`, `HandlerResult` — all TypeScript interfaces locked in `src/engine/types.ts`.
- **State machine:** `StateMachine` class with 14 transitions across 10 states (idle → capturing → clarifying → validated → scheduled/executing → running → completed/failed/cancelled). Cancel from any active state. Terminal states reject all events. `src/engine/state-machine.ts`.
- **Skill registry:** `SkillRegistry` class — register, get, list, has, unregister, clear, `availableFor(actor)` with role-based filtering (admin sees all, users see matching orgRole/platformRole). `src/engine/registry.ts`.
- **Dispatcher:** `Dispatcher` class with pre-dispatch permission re-check (defense-in-depth). `dispatch()` normalizes handler errors. `cancel()` checks `cancellable` flag. `src/engine/dispatcher.ts`.
- **Deterministic field extraction:** Email regex, datetime ISO + Date.parse fallback, choice matching — all without anchors for mid-text extraction. `extractFields()` for batch, `extractFieldsWithLLM()` for deterministic-first + LLM fallback. `ExtractionLLM` interface (consumer-provided transport). `src/fields/extract.ts`.
- **Zod validation:** `validateFields()` with Zod v4 compatibility (handles both v4 `type` field and v3 `typeName`). `buildFieldSpecs()` introspects Zod schema shape to generate FieldSpec[]. `src/fields/validate.ts`.
- **Permission helpers:** `checkAtCompose()` and `checkBeforeDispatch()` — thin wrappers around consumer's `PermissionGate`. `src/permissions/gate.ts`.
- **Two entry points:** `@gametheory-school/skal` (universal engine, no React) and `@gametheory-school/skal/ui` (React client components with `'use client'` banner).
- **Example skill:** `journal-entry-skill.ts` with Zod schema (title, content, optional tags array).
- **Tests:** 65 unit tests across 6 files covering state machine, registry, dispatcher, extraction, validation, and end-to-end integration.
- **CI/CD:** GitHub Actions for CI (typecheck → test → build → ESM check) and publish (triggered on GitHub release).
- **Build:** tsup with two targets (engine + UI), React externalized, `'use client'` banner on UI output.

### Consumer impact

- Initial release. Consumers can register skills, run the state machine, extract fields, and validate with Zod.
- UI components are placeholder (`export {}`) — Phase 2 will add ActionCard, Composer, CommandBar.
