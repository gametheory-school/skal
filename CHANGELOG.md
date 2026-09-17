# Changelog

All notable changes to `@gametheory-school/skal` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com); versioning follows [semver](https://semver.org).

## [0.8.0] — 2026-09-17

### Added

- **Suggestion pills (B5)**: auto-derived quick-action pills rendered above the Composer input when the engine is idle. Pills are generated from registered skill definitions — `skill.description` is used as pill text when available, falling back to `skill.id` with dots/underscores/hyphens replaced by spaces. `getSuggestions()` async method on ActionEngine filters pills by actor role (`availableFor`), page context (F3 route matching), and compose-time permission (`checkAtCompose`). CommandBar renders pills as clickable buttons; clicking a pill calls `routeInput(pillText)`. Pills hidden when a skill is active. `Suggestion` type (`{ text: string; skillId: string }`) exported from UI entry. `useActionEngine` hook recomputes suggestions automatically when state, route, or actor changes.

### Consumer impact

- **New method**: `engine.getSuggestions(): Promise<Suggestion[]>`.
- **New type**: `Suggestion` exported from `@gametheory-school/skal/ui`.
- **CommandBar prop**: `suggestions?: Suggestion[]` — pass from hook's `suggestions` return value.
- **Hook return**: `suggestions: Suggestion[]` added to `UseActionEngineReturn`.
- **Non-breaking**: existing consumers unaffected. Pills are opt-in via CommandBar prop.

## [0.7.1] — 2026-09-17

### Added

- **Actor mutability (B1)**: `setActor(newActor)` method on ActionEngine and useActionEngine hook swaps the actor context at runtime. Resets engine to idle (clears active skill, partial fields, errors, warnings). Route context is preserved. Permission gates re-evaluate against the new actor on subsequent `canSelect()` and `selectSkill()` calls. Router also updated to use the new actor for `classify()`. `EngineSnapshot` now includes `actor` field.

### Consumer impact

- **New method**: `engine.setActor(actor)` and `setActor(actor)` from hook.
- **New snapshot field**: `actor: ActorContext` on EngineSnapshot.
- **Non-breaking**: existing consumers unaffected. Consumers using `key={mode}` remount hack can switch to `setActor()` instead.

## [0.7.0] — 2026-09-17

### Added

- **Page context awareness (F3)**: skills can declare `routes?: string[]` to restrict availability to specific pages. `setPageContext(route)` on ActionEngine and useActionEngine hook sets the current page. `canSelect()` returns false for skills whose routes don't match the current page. `classify()` applies a score boost (+0.15) to skills matching the current route, resolving ambiguous inputs in favor of the page-contextual skill. Default route matcher is prefix-based (`/dashboard` matches `/dashboard/settings`). Consumer can provide custom `matchRoutes` function via `ActionEngineConfig`. `EngineSnapshot` includes `currentRoute` for consumer UI.

### Consumer impact

- **New optional fields**: `SkillDefinition.routes?: string[]` — declare route restrictions per skill.
- **New methods**: `engine.setPageContext(route)` and `setPageContext(route)` from hook.
- **New config**: `ActionEngineConfig.matchRoutes` — custom route matching function.
- **New snapshot field**: `currentRoute: string | null` on EngineSnapshot.
- **New exports**: `RouteMatcher` type from universal entry, `ActionEngineConfig` and `defaultRouteMatcher` from UI entry.
- **Non-breaking**: all additions are optional. Existing skills without `routes` work unchanged.

## [0.6.4] — 2026-09-17

### Changed

- **Unmatched-choice warning precision**: `choiceWarnings()` now quotes only the unmatched remainder tokens in warning messages instead of the full input text. E.g., "nudge tuvalu" produces `No match for "tuvalu" in Coachee` instead of `No match for "nudge tuvalu" in Coachee`. Known words (skill ID, description, field labels, already-assigned values) are filtered out.

- **Aggregated warning banner**: ActionCard now renders a single consolidated warning banner when multiple choice fields have no match, instead of one banner per field. The banner lists all affected field labels comma-joined: `No match for "tuvalu" in Coachee, Type. Please choose an option manually.` Engine API (`warnings: Record<string, string>`) is unchanged — aggregation is render-side only.

### Consumer impact

- No API change. Warnings render automatically via ActionCard. Consumers with custom warning UI can continue using the per-field `warnings` record from `EngineSnapshot`.

## [0.6.3] — 2026-09-17

### Added

- **Unmatched choice warnings (P4)**: when natural-language input contains a name/token that doesn't match any choice option (e.g., "nudge tuvalu" when no coachee named Tuvalu exists), the engine surfaces a non-blocking amber warning on the form: "No match for 'tuvalu' in Coachee. Please choose an option manually." The form remains usable — user can select manually. Warnings clear on submit, reset, or when a valid option is selected. Implemented via `choiceWarnings()` method in ActionEngine that uses a known-words heuristic to avoid warning on intent-only input (e.g., "nudge a coachee" doesn't warn). Warnings included in `EngineSnapshot` and `ActionCardProps` for consumer UI rendering.
- **SkillRegistry re-export from skal/ui (P3)**: `SkillRegistry` now exported from `src/ui.ts` alongside other UI components. Consumers can import from `@gametheory-school/skal/ui` without casting to `as any` in client components.

### Changed

- **Router scoring robustness**: `matchScore()` in SkillRouter now uses a weighted combination of overlap (80%) and coverage (20%) instead of pure overlap. This makes scoring robust to extra words in the input (e.g., field values like "clara.chen" in "nudge clara.chen") while still preventing false positives. Default threshold lowered from 0.3 to 0.27 to accommodate inputs with field values.
- **Prepared options are authoritative**: router's pre-prepare choice guesses are now discarded after prepare() resolves. Field values are re-extracted from raw input using the prepared options, ensuring dynamic options from prepare() are used for matching instead of stale static options.
- **Single-option auto-resolve suppressed for unmatched input**: when a required choice field has only one option but the user's input names someone else (e.g., "nudge tuvalu" when only Clara exists), the engine no longer silently auto-selects the only option. Instead, it shows a warning and lets the user choose manually.

### Fixed

- **Word-level choice extraction for dotted names**: `extractChoice()` now correctly handles "clara.chen" and "Clara Chen" matching the option label "Clara Chen". The `normalize()` helper lowercases and replaces `[._-]` with spaces, enabling two-phase matching (exact substring then word-level scoring).

### Consumer impact

- **§1 (warnings)**: warnings are non-blocking and render as amber pills on the ActionCard form. No action needed — existing skills benefit automatically. Consumers can access warnings via `engine.getSnapshot().warnings` or `activeAction.warnings` from the hook.
- **§2 (SkillRegistry export)**: consumers can now import `SkillRegistry` from `@gametheory-school/skal/ui` and delete `as any` casts in client components.
- **§3 (router scoring)**: no API change. Natural-language routing now matches more reliably when input contains field values. Existing skills benefit automatically.

## [0.6.0] — 2026-09-16

### Added

- **Cancel button in capturing/clarifying form**: secondary button next to Submit in the ActionCard's form mode. Calls `onReset` to exit the form. Styled as a gray-bordered secondary button using flex gap-2 layout with equal flex-1 widths alongside Submit.

### Changed

- **Word-level choice extraction**: `extractChoice()` now handles partial names (e.g., "clara" matching "Clara Chen"), dot-names (e.g., "clara.chen"), and full names. New `normalize()` helper lowercases and replaces `[._-]` with spaces. Matching is two-phase: (1) exact full-substring match first, (2) word-level scoring — tokenize input into words (3+ chars), tokenize each option label, score by startsWith overlap, pick highest scorer. Handles "nudge clara" → Clara Chen, "nudge clara.chen" → Clara Chen.
- **Softer error styling**: field errors now render as a pill (`rounded bg-red-50 px-2 py-0.5 text-xs text-red-700`) instead of raw red text. Subtler visual weight while maintaining clarity.

### Consumer impact

- **Cancel button**: no action needed — forms now have an explicit exit path. Users can cancel out of the clarify loop without submitting.
- **Word-level extraction**: natural-language routing now matches partial names and dot-separated names more reliably. No API change — existing skills benefit automatically.
- **Softer errors**: visual polish only. No API change.

## [0.5.0] — 2026-09-16

### Added

- **`SELECTION_DENIED` event** in the `ActionEvent` union: triggers an `idle → failed` transition with `retryable: false`. The card shows the denial message + Dismiss only (no Retry button).
- **`canSelect(skillId): Promise<boolean>`** public pre-flight permission check on `ActionEngine` and `useActionEngine` hook. For command-palette filtering / route-time gating — does not transition state, safe in render paths. Returns false for unregistered skills.
- **11 new tests** (144 total): state-machine SELECTION_DENIED transitions, selectSkill denial flow, prepare-not-called on denial, recovery after denial, routeInput-to-denied, canSelect true/false/unknown/no-state-transition.

### Changed

- **Zero-option choice fields downgrade to text input** at spec-build (`specInputType` in `src/fields/validate.ts`): choice fields with empty or undefined options render as text inputs instead of dead dropdowns. The v0.4.0 "No options available" error and the `_fieldErrors`/`_mergedErrors` machinery were removed from ActionEngine. A required zero-option field now surfaces its normal Zod missing-field error after submit (like any text field).

### Fixed

- **Validated card renders option labels, not raw values**: `formatFieldValue(value, options)` helper in ActionCard resolves choice field values to their option labels via the FieldSpec `options` already on requiredFields/optionalFields. Falls back to the raw value for non-choice fields or unmatched values. No new engine API — `_resolvedFieldMeta` stays private.
- **Select-time permission gate wired**: `selectSkill()` now runs the compose-time check (the previously imported-but-never-called `checkAtCompose`) after its reset and before `prepare()`. A denied selection never fetches dynamic data or renders a card; lands in `failed` with the dispatcher-format message (`Permission denied: <userId> cannot execute "<skillId>"`); the denied skill stays on `activeSkill` for context. `routeInput` inherits the gate (funnels through `selectSkill`). Dispatcher re-check untouched as defense-in-depth.

### Consumer impact

- **§1 (labels)**: no action needed — validated cards now render human-readable option labels instead of raw UUIDs/codes. Existing skills work unchanged.
- **§2.1 (gate)**: consumers can delete their `routeWithGate` wrappers and similar pre-flight gate logic. Use `canSelect(skillId)` for command-palette filtering / route-time checks. The select-time gate covers the rest (direct `selectSkill` calls and `routeInput`).
- **§2.3 (zero-option)**: consumers can delete defensive `prepare` downgrades that convert failed fetches to `inputType: 'text'` — the engine now handles this automatically. Behavior change vs v0.4.0: zero-option choice fields render as text inputs instead of showing "No options available" error. Required zero-option fields now surface the standard Zod missing-field error after submit.

## [0.4.0] — 2026-09-16

### Added

- **`message` on `HandlerResult` instant variant**: optional human-readable confirmation string. When present, `CompletedState` renders it as a text paragraph instead of a raw JSON dump. Carried through to `ActionState` completed variant.
- **`autoResolved` flag on `FieldSpec`**: set by the engine when a single-option choice field is auto-filled. ActionCard renders auto-resolved fields as read-only blue confirmation lines.
- **`SkalVersion` component** (`src/ui/SkalVersion.tsx`): build-time version label injected via tsup `define` from package.json. Renders `skal <version>` — same visual rhythm as axon's `powered by axon <version>`. Exported from `@gametheory-school/skal/ui`.
- **8 new tests** (122 total): handler message carried to completed state, auto-resolve with 1 option, extracted value precedence, multi-option unaffected, zero-option error, auto-resolve + validation integration, SM message passthrough.

### Fixed

- **Pristine form errors**: validation errors no longer render on the clarify card before the user has submitted. Errors gated on first submit attempt via component-local `submitted` state. Resets on skill change.
- **Single-option choice auto-resolve**: choice fields with exactly 1 option are auto-filled in `selectSkill()` — the question is skipped entirely. Zero-option required choice fields surface "No options available" error. Data-driven: when options change (via `prepare`), behavior updates automatically.

### Consumer impact

- Handlers can return `message` for user-friendly confirmations instead of raw JSON. Existing handlers without `message` work unchanged (JSON dump remains the default).
- Pristine forms no longer show red errors on first render — standard form UX.
- Skills with dynamic single-option dropdowns (e.g., only one journal template) auto-resolve without asking. When more options appear later, the dropdown returns automatically.
- `SkalVersion` gives consumers a one-line version label for their shell chrome.
- All changes are backward-compatible — no breaking API changes.

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
