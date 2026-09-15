# skal — @gametheory-school/skal Conversational UI Framework

Standalone TypeScript package that gives every gameTheory product a **conversational shell** instead of menu-driven navigation. Generalizes the clarify-then-execute pattern from Rosie: detect intent, identify what's missing, ask, and only then act.

# Entry Points

| Export | File | Purpose |
|--------|------|---------|
| `@gametheory-school/skal` | `src/index.ts` | Universal: engine, types, field extraction/validation |
| `@gametheory-school/skal/ui` | `src/ui.ts` | Client components (`'use client'` banner injected by tsup): ActionCard, Composer, TabSwitcher, TaskManager, CommandBar |

# Responsibility Map

| Directory | Responsibility |
|-----------|----------------|
| `src/engine/` | Core state machine, skill registry, dispatcher — domain-agnostic orchestration |
| `src/fields/` | Deterministic field extraction (regex/parsing) + Zod validation, LLM fallback interface |
| `src/ui/` | React client components: ActionCard, Composer, TabSwitcher, TaskManager, CommandBar |
| `src/permissions/` | PermissionGate interface + compose/dispatch check helpers |

# Key Design Decisions

1. **No domain knowledge in the engine.** Operates on `SkillDefinition` + `FieldSpec` + `ActorContext` only.
2. **Deterministic-before-LLM.** Field extraction tries regex/parsing first; LLM is the fallback.
3. **Two entry points only:** engine (universal) and `/ui` (React client components).
4. **Consumer provides:** LLM transport, PermissionGate implementation, handler implementations, schedule store.
5. **Explicit context, never ambient.** `ActorContext` threaded through every stage.

# Conventions

- No `next/headers` or `next/server` imports — the engine is universal, no server deps.
- Peer dependencies (React, Next) are provided by the consumer app — never bundle them.
- `zod` is the only direct dependency.
- Build output goes to `dist/`; never edit `dist/` directly — run `npm run build` (tsup).
- The `'use client'` banner on `ui.ts` is critical for Next.js RSC compatibility. Do not remove.

# Validation Routes

| Check | Command |
|-------|---------|
| Build package | `npm run build` |
| Type check | `npm run typecheck` |
| Unit tests | `npm run test` |
| Pack inspection | `npm pack --dry-run` — confirm `dist/` appears in pack file list |
| UI banner check | Confirm `dist/ui.mjs` starts with `'use client'` after build |
| ESM compat | `npm run test:esm` — both entry points importable as ESM |

# Validation After Edit

## Rule

After making code changes to any source file, the agent MUST run at least one validation check **as a separate, explicit command** before declaring the edit complete.

### Minimum Validation

| Change scope | Required check |
|---|---|
| Any `.ts` / `.tsx` file | `npm run typecheck` |
| Logic in `src/` (non-UI) | typecheck + `npm run test` |
| UI components only | typecheck |
| `tsup.config.ts` / `package.json` `exports` or `files` | `npm run build` + `npm pack --dry-run` inspection |
