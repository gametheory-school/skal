# Handoff: Crucible Integration Report — v0.5.0 Backlog

**Date:** 2026-09-16
**Tag:** #gt
**Status:** Planning input — nothing implemented yet. Consolidates friction from Crucible's week integrating skal v0.4.0.

**Source:** Crucible (`/Users/nirmal/gametheory/crucible`), spec at `docs/specs/skal-skills-spec.md`.
The spec's Non-Goals section defers to this document — this is the consolidation target.

**Direction:** Unlike the v0.2.0–v0.4.0 adoption handoffs (skal → Crucible upgrade prompts), this doc runs the other way: Crucible → skal. It is the planning input for what v0.5.0 should contain.

**Maintenance rule:** When v0.5.0 ships, delete the shipped items from this doc. Anything cut during planning graduates into the Crucible spec's Non-Goals with the reason recorded. The spec stays authoritative; this doc is disposable.

---

## 1. Confirmed defect (fix-first)

### Validated/confirmation card renders raw values, not choice labels

Every choice field on every skill's confirmation screen shows the stored value, never the human-readable option label.

**Status: FIXED (2026-09-16) — minimal ActionCard-internal approach.** Added `formatFieldValue(value, options)` helper in `src/ui/ActionCard/ActionCard.tsx`; the validated branch builds an options map from `requiredFields`/`optionalFields` and renders labels via lookup, falling back to the raw value. Unit tests in `tests/unit/ui/action-card.test.ts`. No engine API change — `_resolvedFieldMeta` stays private.

**Evidence (skal v0.4.0 source):**

- `src/ui/ActionCard/ActionCard.tsx:224-235` — the validated state renders `Array.isArray(value) ? value.join(', ') : String(value ?? '')` with no option-label lookup.
- `src/ui/ActionEngine.ts:76` — `_resolvedFieldMeta` is private; neither `activeAction` (`ActionEngine.ts:433`) nor `EngineSnapshot` exposes it.
- `src/fields/validate.ts:86-93` — `buildFieldSpecs` already puts `options` on every `FieldSpec`, and `ActionCardProps` (`ActionEngine.ts:24-37`) carries `requiredFields`/`optionalFields` into the card. A label lookup may not need new engine API.

**Symptom in Crucible:** `coach.nudge`'s confirmation shows a coachee UUID and `coachee_struggling` instead of the coachee's name/email and "Support — struggling".

**Acceptance criteria:**

- [x] Validated card shows option labels for every choice field
- [x] Auto-resolved fields (v0.4.0) confirm the label, not the raw value — they render through the same validated state
- [x] Non-choice fields render exactly as before (`String(value ?? '')` fallback preserved)
- [x] Unit test: validated state renders the option label for a choice field

---

## 2. UX gap candidates

Each currently papered over by a Crucible-side workaround that gets **deleted** when the fix ships.

### 2.1 Permission gate only checked at dispatch

The engine's permission check runs in `Dispatcher.dispatch()` (`src/engine/dispatcher.ts:34`). A mode-blocked skill opens its ActionCard and only fails on Submit. The dispatcher's own doc comment (`dispatcher.ts:9-14`) claims a compose-time check exists — but `checkAtCompose` is imported at `src/ui/ActionEngine.ts:15` and never invoked; `selectSkill()` runs no gate check at all.

**Status: FIXED (2026-09-16) — both halves of the design question.** New `SELECTION_DENIED` event (`src/engine/types.ts`) with an `idle → failed` transition (`retryable: false`, so the card shows the error + Dismiss only). `selectSkill()` now runs the compose-time check — the previously imported-but-never-called `checkAtCompose` — after its reset, **before** `prepare()`: a denied selection never fetches dynamic data or renders a card, and lands in failed with the dispatcher-format message (`Permission denied: <userId> cannot execute "<skillId>"`); the denied skill stays reachable via `activeSkill` for context. New public pre-flight `canSelect(skillId)` on `ActionEngine` + a `useActionEngine` passthrough — for command-palette filtering / route-time gating, no state transition. The dispatcher re-check remains as defense-in-depth. `routeInput` inherits the gate for free (it funnels through `selectSkill`). Tests in `tests/unit/ui/action-engine.test.ts` (permission gating + canSelect) and `tests/unit/engine/state-machine.test.ts`.

- **Workaround today:** `routeWithGate` wrapper in Crucible's `SkalShell` pre-flights at route time — duplicated gate logic that belongs in skal. **Delete it at adoption** — replace with `canSelect` where palette filtering is needed; the select-time check covers the rest.
- **Acceptance criteria:**
  - [x] Mode-blocked skill never opens its ActionCard *(skal-side, tested)*
  - [ ] `routeWithGate` deleted from SkalShell *(Crucible-side — do when adopting v0.5.0)*
  - [x] Dispatcher pre-dispatch re-check unchanged

### 2.2 Actor frozen at engine construction

`ActionEngine`'s constructor takes `private readonly actor: ActorContext` (`src/ui/ActionEngine.ts:81-87`) — immutable for the engine's lifetime.

- **Workaround today:** `key={mode}` remount of the whole shell in Crucible's `SkalShellWrapper` to force a fresh engine with a fresh skill palette on mode switches.
- **Proposed fix:** a `setActor(actor)` method (re-gate + re-validate the active skill), or read the actor at check time via a provider. Design question: an in-flight action when the actor changes underneath — reset to idle is probably correct.
- **Acceptance criteria:**
  - [ ] Mode switch updates palette without remounting the shell
  - [ ] `key={mode}` hack deleted from SkalShellWrapper

### 2.3 Zero-option required choice is a dead end

`src/ui/ActionEngine.ts:162-164` — a zero-option required choice field sets `_fieldErrors[key] = 'No options available'`, and the card has no path forward.

**Status: FIXED (2026-09-16) — engine-side fallback at the spec-building layer.** `specInputType(meta)` in `src/fields/validate.ts` downgrades any choice field with empty *or* undefined options to `inputType: 'text'`, feeding both `buildFieldSpecs` and `validateFields`' missing-field specs. The `'No options available'` error and the `_fieldErrors`/`_mergedErrors` machinery it was the sole writer of were removed from `ActionEngine` (a required zero-option field now surfaces its normal Zod missing-field error after submit, like any text field). Tests in `tests/unit/ui/action-engine.test.ts` + `tests/unit/fields/validate.test.ts`.

- **Workaround today:** all five Crucible skills' `prepare` hooks defensively downgrade failed fetches to `inputType: 'text'` — five copies of the same pattern.
- **Proposed fix:** ✅ shipped as described above — empty choice options → text input, deleting the need for per-skill defensive downgrades. The Crucible spec's validation checklist already expected this behavior ("field renders as text input, not a dead 'No options available' choice" in the `session.start` fallback smoke test), so the downgrade is the de facto contract.
- **Acceptance criteria:**
  - [x] Zero-option required choice renders as a text input, not a dead dropdown *(skal-side, tested)*
  - [ ] Defensive `inputType: 'text'` downgrades removed from all five skills' `prepare` hooks *(Crucible-side — do when adopting v0.5.0)*
  - [x] Zero-option *optional* choice stays optional (no forced input) *(tested: schema still validates without it)*

---

## 3. Feature deferrals — cross-reference, don't duplicate

Authoritative list lives in the Crucible spec's Non-Goals (`docs/specs/skal-skills-spec.md:233-239`). Summary:

| Deferral | Promotion trigger |
|---|---|
| `redirect` as a first-class `HandlerResult` type | Convention shipped in Crucible v1.131.0; promote only if it spreads |
| `prepare` returning pre-filled field values | First consumer: `session.start` model default |
| Choice UI search/filter | Watch item — becomes necessary past ~30 scenarios |
| Multi-select fields, file inputs, richer field types | No consumer yet |
| `SkillRegistry` re-export from `skal/ui` | Drops the dual-package `as any` cast — cosmetic |

**Out of scope for skal:** coach skills beyond `coach.nudge` (coach notes, resource assignment) — a Crucible spec item, not a skal concern.

---

## 4. Suggested v0.5.0 shape

1. **Ship:** §1 (defect) — **fixed 2026-09-16**, pending release.
2. **Ship:** §2.1 + §2.3 — **both fixed 2026-09-16**, pending release. Together they delete the `routeWithGate` wrapper and all five defensive `prepare` downgrades from Crucible.
3. **Defer to design review:** §2.2 — `setActor()` has lifecycle semantics (in-flight actions) that deserve a decision, not a rush.
4. **Anything cut** → record in the Crucible spec's Non-Goals with the reason, then shrink this doc accordingly.
