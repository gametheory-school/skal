# Handoff: Crucible Integration Report — skal backlog

**Date:** 2026-09-16 (v0.5.0 backlog); shrunk 2026-09-17
**Tag:** #gt
**Status:** v0.5.0 shipped and adopted by Crucible on 2026-09-17. Per the maintenance rule, all shipped items (§1 validated-card labels, §2.1 select-time permission gate, §2.3 zero-option choice → text downgrade) were deleted from this doc at adoption — Crucible deleted `routeWithGate` from SkalShell and the defensive `prepare` downgrades from its skills. §2.2 below is the sole remaining open item.

**Source:** Crucible (`/Users/nirmal/gametheory/crucible`), spec at `docs/specs/skal-skills-spec.md` (authoritative for deferral reasons — §2.2's deferral is recorded there).

---

## 2.2 Actor frozen at engine construction

`ActionEngine`'s constructor takes `private readonly actor: ActorContext` (`src/ui/ActionEngine.ts:81-87`) — immutable for the engine's lifetime.

- **Workaround today:** `key={mode}` remount of the whole shell in Crucible's `SkalShellWrapper` to force a fresh engine with a fresh skill palette on mode switches.
- **Proposed fix:** a `setActor(actor)` method (re-gate + re-validate the active skill), or read the actor at check time via a provider. Design question: an in-flight action when the actor changes underneath — reset to idle is probably correct.
- **Why deferred:** lifecycle semantics (in-flight actions) deserve a decision, not a rush — deferred to skal design review at v0.5.0 planning.
- **Acceptance criteria:**
  - [ ] Mode switch updates palette without remounting the shell
  - [ ] `key={mode}` hack deleted from SkalShellWrapper

---

## Cross-references

- Feature deferrals (redirect HandlerResult, `SkillRegistry` re-export, prepare pre-filled values, choice UI search, richer field types) live in the Crucible spec's Non-Goals — do not duplicate here.
- Out of scope for skal: coach skills beyond `coach.nudge` — a Crucible spec item.
